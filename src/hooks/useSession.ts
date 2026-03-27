/**
 * セッション管理カスタムフック
 *
 * フロー:
 * 1. 音声 → 文字起こし → transcriptChunks に蓄積（画面に表示）
 * 2. 操作者が「生成」タップ → 蓄積テキスト全文をHaikuに投げて抽出
 * 3. 抽出JSON → Sonnet → 制作物生成
 *
 * 抽出は自動ではなく、生成ボタン押下時にオンデマンドで実行。
 * ただし一定間隔で「プレビュー抽出」して、フィールドカードを更新する（操作者の判断材料）。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import type {
  ExtractedDataMap,
  GenerationJob,
  SessionStatus,
  DeliverableType,
  DeliverableStatus,
  ConfidenceFieldValue,
  TranscriptChunk,
} from '../types/dashboard';
import { REQUIRED_FIELDS, CONFIDENCE_THRESHOLD } from '../lib/constants';

// ============================================================
// 返り値の型
// ============================================================

export interface UseSessionReturn {
  readonly extractedData: ExtractedDataMap;
  readonly jobs: readonly GenerationJob[];
  readonly transcriptChunks: readonly TranscriptChunk[];
  readonly elapsed: number;
  readonly status: SessionStatus;
  readonly error: string | null;
  readonly totalFields: number;
  readonly filledFields: number;
  readonly targetCompany: string | null;
  readonly setTargetCompany: (name: string) => void;
  readonly addTranscriptChunk: (text: string, speaker?: string) => void;
  readonly setExtractedDataDirect: (data: Record<string, unknown>) => void;
  readonly extractForCompany: (companyName: string, transcript: string) => Promise<void>;
  readonly updateField: (field: string, value: string) => Promise<void>;
  readonly generateDeliverable: (type: DeliverableType) => Promise<void>;
  readonly endSession: () => Promise<void>;
  readonly getDeliverableStatus: (type: DeliverableType) => DeliverableStatus;
  readonly getMissingFields: (type: DeliverableType) => readonly string[];
  readonly getJobForType: (type: DeliverableType) => GenerationJob | undefined;
  readonly getFullTranscript: () => string;
  readonly confirmAllFields: () => void;
}

// ============================================================
// ヘルパー
// ============================================================

function countFilledFields(data: ExtractedDataMap): number {
  let count = 0;
  for (const key of Object.keys(data)) {
    const field = data[key] as ConfidenceFieldValue | undefined;
    if (!field) continue;
    const val = field.value;
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' && val.length > 0) count++;
    else if (Array.isArray(val) && val.length > 0) count++;
    else if (typeof val === 'object' && val !== null) count++;
  }
  return count;
}

const TOTAL_EXTRACTABLE_FIELDS = 12;
const POLL_INTERVAL_MS = 4000;
const PREVIEW_EXTRACT_INTERVAL_MS = 15000; // 15秒ごとにプレビュー抽出

// ============================================================
// localStorage永続化
// ============================================================

const STORAGE_KEY_PREFIX = 'session_';

interface PersistedSessionState {
  extractedData: ExtractedDataMap;
  jobs: GenerationJob[];
  transcriptChunks: TranscriptChunk[];
  targetCompany: string | null;
  status: SessionStatus;
  elapsed: number;
  startTime: number;
  savedAt: number;
}

function getStorageKey(sessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
}

function saveSessionState(sessionId: string, state: PersistedSessionState): boolean {
  try {
    // blob URLは保存不可 — result_urlがblob:で始まるジョブはURLをnullにして保存
    const cleanJobs = state.jobs.map(j => ({
      ...j,
      result_url: j.result_url?.startsWith('blob:') ? null : j.result_url,
      // blob URLジョブのstatusはreadyに戻す（再生成が必要）
      status: (j.result_url?.startsWith('blob:') && j.status === 'completed') ? 'queued' as const : j.status,
    }));
    const toSave: PersistedSessionState = { ...state, jobs: cleanJobs, savedAt: Date.now() };
    localStorage.setItem(getStorageKey(sessionId), JSON.stringify(toSave));
    return true;
  } catch (err) {
    console.warn('[useSession] localStorage save failed (capacity exceeded?):', err);
    // 古いセッションを削除して再試行
    try {
      clearOldSessions();
      const cleanJobs = state.jobs.map(j => ({
        ...j,
        result_url: j.result_url?.startsWith('blob:') ? null : j.result_url,
        status: (j.result_url?.startsWith('blob:') && j.status === 'completed') ? 'queued' as const : j.status,
      }));
      localStorage.setItem(getStorageKey(sessionId), JSON.stringify({ ...state, jobs: cleanJobs, savedAt: Date.now() }));
      return true;
    } catch {
      return false;
    }
  }
}

function loadSessionState(sessionId: string): PersistedSessionState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSessionState;
    // 24時間以上前のデータは破棄
    if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(getStorageKey(sessionId));
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('[useSession] localStorage load failed:', err);
    return null;
  }
}

function clearOldSessions(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_KEY_PREFIX)) keys.push(key);
    }
    // 最大10セッション保持、古いものから削除
    if (keys.length > 10) {
      const entries = keys.map(k => {
        try {
          const d = JSON.parse(localStorage.getItem(k) ?? '{}') as { savedAt?: number };
          return { key: k, savedAt: d.savedAt ?? 0 };
        } catch (parseErr) { console.warn('[useSession] session parse error:', parseErr); return { key: k, savedAt: 0 }; }
      });
      entries.sort((a, b) => a.savedAt - b.savedAt);
      for (let i = 0; i < entries.length - 10; i++) {
        localStorage.removeItem(entries[i]!.key);
      }
    }
  } catch (err) {
    console.warn('[useSession] clearOldSessions failed:', err);
  }
}

// ============================================================
// 画像生成ヘルパー（LP完了後に非同期呼び出し）
// ============================================================

function getExtractedValue(data: ExtractedDataMap, key: string): string {
  const field = data[key] as ConfidenceFieldValue | undefined;
  if (!field) return '';
  if (typeof field.value === 'string') return field.value;
  if (Array.isArray(field.value)) return field.value.join(', ');
  return '';
}

async function triggerImageGeneration(
  sessionId: string,
  data: ExtractedDataMap,
): Promise<void> {
  try {
    const strengths = getExtractedValue(data, 'strengths');
    const service = getExtractedValue(data, 'service_name');
    const industry = getExtractedValue(data, 'industry');
    const target = getExtractedValue(data, 'target_customer');
    const painPoints = getExtractedValue(data, 'pain_points');

    const sections = [
      { section: 'hero', context: `${service} - ${industry}` },
      { section: 'about', context: `${painPoints} を解決する ${service}` },
      { section: 'reason1', context: strengths },
      { section: 'reason2', context: `${industry}の専門性` },
      { section: 'feature1', context: `${service}の主要機能` },
      { section: 'feature2', context: `${target}向けの自動化・効率化` },
      { section: 'feature3', context: `データ分析・レポート機能` },
      { section: 'case1', context: `${industry}の顧客が成果に満足している様子` },
      { section: 'case2', context: `${target}がサービス導入後に成功を実感` },
      { section: 'usecase1', context: `${target}が${service}を実際に利用している場面` },
    ];

    const res = await fetch('/api/generate-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        type: 'lp',
        sections,
        color_primary: '#1ab394',
        industry: getExtractedValue(data, 'industry'),
        service_name: getExtractedValue(data, 'service_name'),
        company_name: getExtractedValue(data, 'company_name'),
      }),
    });

    if (!res.ok && res.status !== 202) {
      console.warn(`[useSession] Image generation request failed: ${res.status}`);
      return;
    }
    console.log('[useSession] Image generation triggered, polling for result...');

    // ポーリング（最大90秒）— まず「processing」を待ち、その後「completed」を待つ
    // Background Functionの起動前に前回の「completed」を拾わないようにする
    let sawProcessing = false;
    await new Promise(r => setTimeout(r, 3000));
    for (let i = 0; i < 18; i++) {
      try {
        const pollRes = await api.pollJobStatus(sessionId, 'images');
        if (pollRes.status === 'processing') {
          if (!sawProcessing) console.log('[useSession] Image generation started (processing)');
          sawProcessing = true;
        }
        if (pollRes.status === 'completed' && sawProcessing) {
          console.log('[useSession] Image generation completed - LP images updated');
          return;
        }
        if (pollRes.status === 'failed' && sawProcessing) {
          console.warn('[useSession] Image generation failed:', pollRes.error);
          return;
        }
        // completed but !sawProcessing → stale status from previous run, keep waiting
      } catch (pollErr) {
        console.warn('[useSession] Image poll error:', pollErr);
      }
      await new Promise(r => setTimeout(r, 5000));
    }
    console.warn('[useSession] Image generation: poll timeout (90s)');
  } catch (err) {
    console.warn('[useSession] Image generation skipped (non-critical):', err);
  }
}

// ============================================================
// フック本体
// ============================================================

export function useSession(sessionId: string): UseSessionReturn {
  // 初期状態をlocalStorageから復元
  const restored = sessionId !== '__none__' ? loadSessionState(sessionId) : null;

  const [extractedData, setExtractedData] = useState<ExtractedDataMap>(restored?.extractedData ?? {});
  const [jobs, setJobs] = useState<GenerationJob[]>(restored?.jobs ?? []);
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>(restored?.transcriptChunks ?? []);
  const [elapsed, setElapsed] = useState(restored?.elapsed ?? 0);
  const [status, setStatus] = useState<SessionStatus>(restored?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const [targetCompany, setTargetCompanyState] = useState<string | null>(restored?.targetCompany ?? null);

  const startTimeRef = useRef<number>(restored?.startTime ?? Date.now());
  const lastExtractedChunkCount = useRef<number>(restored?.transcriptChunks?.length ?? 0);
  const transcriptChunksRef = useRef<TranscriptChunk[]>(transcriptChunks);
  const targetCompanyRef = useRef<string | null>(targetCompany);
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // sessionId変更時にリセット（初回マウントではなく、実際にIDが変わった時のみ）
  const prevSessionIdRef = useRef<string>(sessionId);
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return;
    prevSessionIdRef.current = sessionId;

    // 前セッションのポーリングintervalをクリア
    for (const [, intervalId] of pollIntervalsRef.current) {
      clearInterval(intervalId);
    }
    pollIntervalsRef.current.clear();

    const saved = sessionId !== '__none__' ? loadSessionState(sessionId) : null;
    if (saved) {
      // 保存済みデータを復元
      setExtractedData(saved.extractedData);
      setJobs(saved.jobs);
      setTranscriptChunks(saved.transcriptChunks);
      setElapsed(saved.elapsed);
      setStatus(saved.status);
      setTargetCompanyState(saved.targetCompany);
      startTimeRef.current = saved.startTime;
      lastExtractedChunkCount.current = saved.transcriptChunks.length;
    } else {
      setExtractedData({});
      setJobs([]);
      setTranscriptChunks([]);
      setElapsed(0);
      setStatus('active');
      setTargetCompanyState(null);
      startTimeRef.current = Date.now();
      lastExtractedChunkCount.current = 0;
    }
    setError(null);
    clearOldSessions();
  }, [sessionId]);

  // 状態変更時にlocalStorageへ自動保存
  useEffect(() => {
    if (sessionId === '__none__') return;
    saveSessionState(sessionId, {
      extractedData,
      jobs,
      transcriptChunks,
      targetCompany,
      status,
      elapsed,
      startTime: startTimeRef.current,
      savedAt: Date.now(),
    });
  }, [sessionId, extractedData, jobs, transcriptChunks, targetCompany, status]);

  // refを最新に同期
  useEffect(() => { transcriptChunksRef.current = transcriptChunks; }, [transcriptChunks]);
  useEffect(() => { targetCompanyRef.current = targetCompany; }, [targetCompany]);

  // 経過時間タイマー
  useEffect(() => {
    const timer = setInterval(() => {
      if (status === 'active') {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // 文字起こしチャンク追加（refも即時更新してstale closure対策）
  const addTranscriptChunk = useCallback((text: string, speaker?: string) => {
    const chunk: TranscriptChunk = {
      text,
      timestamp: new Date().toISOString(),
      speaker,
    };
    setTranscriptChunks(prev => {
      const next = [...prev, chunk];
      transcriptChunksRef.current = next;
      return next;
    });
  }, []);

  // 抽出データ直接設定（貼り付け即時抽出用）
  const setExtractedDataDirect = useCallback((data: Record<string, unknown>) => {
    setExtractedData(data as ExtractedDataMap);
  }, []);

  // 対象企業設定
  const setTargetCompany = useCallback((name: string) => {
    setTargetCompanyState(name);
  }, []);

  // 特定企業にフォーカスして抽出（Background Function + ポーリング）
  const extractForCompany = useCallback(async (companyName: string, transcript: string) => {
    try {
      setError(null);

      // Background Function起動（即座に202が返る）
      await fetch('/api/extract-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          transcript,
          target_company: companyName,
        }),
      });

      // ポーリングで結果を待つ（最大180秒）
      const POLL_TIMEOUT_MS = 300_000;
      const startTime = Date.now();

      // BG Functionがステータスを書く時間を最低限確保
      await new Promise(r => setTimeout(r, 1000));

      while (Date.now() - startTime < POLL_TIMEOUT_MS) {
        try {
          const pollResult = await api.pollJobStatus(sessionId, 'extract');

          if (pollResult.status === 'completed') {
            const resultData = pollResult.data as Record<string, unknown> | undefined;
            const extracted = resultData?.extracted_data;
            if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
              setExtractedData(extracted as ExtractedDataMap);
            } else {
              console.warn('[useSession] extractForCompany: unexpected data format:', resultData);
              setError('企業情報の形式が不正です。もう一度お試しください。');
            }
            return;
          }

          if (pollResult.status === 'failed') {
            const errorMsg = pollResult.error ?? '企業情報の抽出に失敗しました';
            console.warn('[useSession] extractForCompany failed:', errorMsg);
            setError(errorMsg);
            return;
          }

          // processing / unknown → 待つ
          await new Promise(r => setTimeout(r, 3000));
        } catch (pollErr) {
          console.warn('[useSession] extractForCompany poll error:', pollErr);
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      // ループを抜けた = タイムアウト
      setError('企業情報の抽出がタイムアウトしました（通常2分以内に完了します）。ネットワーク接続を確認し、もう一度お試しください。');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '企業情報の抽出中にエラーが発生しました';
      console.error('[useSession] extractForCompany error:', msg);
      setError(msg);
    }
  }, [sessionId]);

  // 全文テキスト取得（refから読むことでstale closure問題を回避）
  const getFullTranscript = useCallback((): string => {
    return transcriptChunksRef.current.map(c =>
      c.speaker ? `[${c.speaker}] ${c.text}` : c.text
    ).join('\n');
  }, []);

  // sessionIdが仮IDの場合はスキップ
  const isSessionValid = sessionId !== '__none__';

  // プレビュー抽出（Background Function + ポーリング）
  useEffect(() => {
    if (status !== 'active') return;
    if (!isSessionValid) return;

    let isExtracting = false;

    const interval = setInterval(async () => {
      if (isExtracting) return;

      const chunks = transcriptChunksRef.current;
      const company = targetCompanyRef.current;
      if (chunks.length <= lastExtractedChunkCount.current) return;
      if (chunks.length === 0) return;
      if (chunks.length < 2 && !company) return;

      lastExtractedChunkCount.current = chunks.length;
      isExtracting = true;

      try {
        const body: Record<string, unknown> = {
          session_id: sessionId,
          transcript: chunks.map(c => c.text).join('\n'),
        };
        if (company) {
          body['target_company'] = company;
        }

        // Background Function起動
        await fetch('/api/extract-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        // ポーリングで結果を待つ（最大30秒、次のインターバルまでに完了させる）
        await new Promise(r => setTimeout(r, 1000));
        for (let i = 0; i < 9; i++) {
          try {
            const pollResult = await api.pollJobStatus(sessionId, 'extract');
            if (pollResult.status === 'completed') {
              const resultData = pollResult.data as Record<string, unknown> | undefined;
              const extracted = resultData?.extracted_data;
              if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
                setExtractedData(extracted as ExtractedDataMap);
              } else {
                console.warn('[useSession] preview: unexpected data format:', resultData);
              }
              break;
            }
            if (pollResult.status === 'failed') {
              console.warn('[useSession] preview extraction failed:', pollResult.error);
              break;
            }
          } catch (pollErr) {
            console.warn('[useSession] preview poll error:', pollErr);
          }
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch (extractErr) {
        console.warn('[useSession] preview extraction error:', extractErr);
      } finally {
        isExtracting = false;
      }
    }, PREVIEW_EXTRACT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionId, status, isSessionValid]);

  // 旧ジョブポーリングは削除（各生成が自前のポーリングを管理する）

  // フィールド手動更新
  const handleUpdateField = useCallback(async (field: string, value: string) => {
    try {
      setError(null);
      await api.updateField(sessionId, field, value);
      // ローカルで即反映
      setExtractedData(prev => ({
        ...prev,
        [field]: { value, confidence: 1.0 },
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'フィールドの更新に失敗しました';
      setError(msg);
      throw err;
    }
  }, [sessionId]);

  // ジョブ進捗更新ヘルパー
  const updateJobStatus = useCallback((type: DeliverableType, status: string, statusLabel?: string) => {
    setJobs(prev => prev.map(j =>
      j.type === type ? { ...j, status: status as GenerationJob['status'], error: statusLabel || null } : j
    ));
  }, []);

  // pollIntervalsRef は上部で宣言済み

  // ステップ名を日本語に変換
  function stepToLabel(step?: string): string {
    switch (step) {
      case 'draft': return 'コピー設計中...';
      case 'evaluate': return '品質チェック中...';
      case 'build': return 'HTML構築中...';
      case 'images': return 'AI画像生成中...';
      case 'generating': return '生成中...';
      default: return '生成中...';
    }
  }

  // 制作物生成（Background Function + ポーリング）
  const handleGenerateDeliverable = useCallback(async (type: DeliverableType) => {
    try {
      setError(null);
      const fullText = transcriptChunks.map(c => c.text).join('\n');

      // ジョブを即座にUIに反映（processing状態）
      const tempJob: GenerationJob = {
        id: `temp-${Date.now()}`,
        session_id: sessionId,
        type,
        status: 'processing',
        result_url: null,
        error: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_at: new Date().toISOString(),
      };
      setJobs(prev => [...prev.filter(j => j.type !== type), tempJob]);

      // Background Functionを起動（即座に202が返る）
      await fetch('/api/generate-lp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          type,
          transcript: fullText,
          extracted_data: extractedData,
        }),
      });

      // 既存のポーリングがあればクリア
      const existingInterval = pollIntervalsRef.current.get(type);
      if (existingInterval) clearInterval(existingInterval);

      // ポーリング開始（3秒間隔、最大90秒）
      const pollStartTime = Date.now();
      const POLL_TIMEOUT_MS = 300_000;

      const intervalId = setInterval(async () => {
        try {
          // タイムアウトチェック
          if (Date.now() - pollStartTime > POLL_TIMEOUT_MS) {
            clearInterval(intervalId);
            pollIntervalsRef.current.delete(type);
            setError('制作物の生成がタイムアウトしました（通常1〜3分で完了します）。ネットワーク接続を確認し、もう一度お試しください。');
            setJobs(prev => prev.map(j =>
              j.type === type ? { ...j, status: 'failed' as const, error: 'タイムアウト' } : j
            ));
            return;
          }

          const pollResult = await api.pollJobStatus(sessionId, type);

          if (pollResult.status === 'processing') {
            updateJobStatus(type, 'processing', stepToLabel(pollResult.step));
          } else if (pollResult.status === 'completed') {
            clearInterval(intervalId);
            pollIntervalsRef.current.delete(type);

            const viewUrl = pollResult.view_url ?? `/view/${encodeURIComponent(sessionId)}/${encodeURIComponent(type)}`;

            // 旧blob URLがあれば解放
            setJobs(prev => {
              const oldJob = prev.find(j => j.type === type);
              if (oldJob?.result_url?.startsWith('blob:')) {
                URL.revokeObjectURL(oldJob.result_url);
              }
              return prev.map(j =>
                j.type === type
                  ? { ...j, status: 'completed' as const, result_url: viewUrl, error: null, completed_at: new Date().toISOString() }
                  : j
              );
            });

            // AI画像はLP生成Background Function内で同時生成済み
          } else if (pollResult.status === 'failed') {
            clearInterval(intervalId);
            pollIntervalsRef.current.delete(type);
            const errorMsg = pollResult.error ?? '生成に失敗しました';
            setError(errorMsg);
            setJobs(prev => prev.map(j =>
              j.type === type ? { ...j, status: 'failed' as const, error: errorMsg } : j
            ));
          }
        } catch (pollErr) {
          console.warn('[useSession] deliverable poll error (will retry):', pollErr);
        }
      }, 3000);

      pollIntervalsRef.current.set(type, intervalId);

    } catch (err) {
      const msg = err instanceof Error ? err.message : '制作物の生成に失敗しました';
      setError(msg);
      setJobs(prev => prev.map(j =>
        j.type === type ? { ...j, status: 'failed' as const, error: msg } : j
      ));
    }
  }, [sessionId, transcriptChunks, extractedData, updateJobStatus]);

  // セッション終了
  const handleEndSession = useCallback(async () => {
    try {
      setError(null);
      await api.endSession(sessionId);
      setStatus('ended');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'セッションの終了に失敗しました';
      setError(msg);
      throw err;
    }
  }, [sessionId]);

  // 制作物ステータス判定
  const getDeliverableStatus = useCallback((type: DeliverableType): DeliverableStatus => {
    const job = jobs.find((j) => j.type === type);
    if (job) {
      if (job.status === 'completed' && job.result_url) return 'completed';
      if (job.status === 'processing' || job.status === 'queued') return 'generating';
    }

    // 文字起こしがなければ情報不足
    if (transcriptChunks.length === 0) return 'insufficient';

    const required = REQUIRED_FIELDS[type];
    const allFilled = required.every((field) => {
      const f = extractedData[field] as ConfidenceFieldValue | undefined;
      if (!f) return false;
      const val = f.value;
      if (val === null || val === undefined) return false;
      if (typeof val === 'string' && val.length === 0) return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return f.confidence >= CONFIDENCE_THRESHOLD;
    });

    return allFilled ? 'ready' : 'insufficient';
  }, [jobs, extractedData, transcriptChunks.length]);

  // 不足フィールド取得
  const getMissingFields = useCallback((type: DeliverableType): readonly string[] => {
    if (transcriptChunks.length === 0) {
      return REQUIRED_FIELDS[type];
    }
    const required = REQUIRED_FIELDS[type];
    return required.filter((field) => {
      const f = extractedData[field] as ConfidenceFieldValue | undefined;
      if (!f) return true;
      const val = f.value;
      if (val === null || val === undefined) return true;
      if (typeof val === 'string' && val.length === 0) return true;
      if (Array.isArray(val) && val.length === 0) return true;
      return f.confidence < CONFIDENCE_THRESHOLD;
    });
  }, [extractedData, transcriptChunks.length]);

  const getJobForType = useCallback((type: DeliverableType): GenerationJob | undefined => {
    return jobs.find((j) => j.type === type);
  }, [jobs]);

  // 全未確定フィールドのconfidenceを1.0に引き上げて確定
  const confirmAllFields = useCallback(() => {
    setExtractedData(prev => {
      const updated = { ...prev };
      for (const [key, raw] of Object.entries(updated)) {
        const field = raw as ConfidenceFieldValue | undefined;
        if (!field) continue;
        if (field.confidence < CONFIDENCE_THRESHOLD) {
          updated[key] = { ...field, confidence: 1.0 };
        }
      }
      return updated;
    });
  }, []);

  return {
    extractedData,
    jobs,
    transcriptChunks,
    elapsed,
    status,
    error,
    totalFields: TOTAL_EXTRACTABLE_FIELDS,
    filledFields: countFilledFields(extractedData),
    targetCompany,
    setTargetCompany,
    addTranscriptChunk,
    setExtractedDataDirect,
    extractForCompany,
    updateField: handleUpdateField,
    generateDeliverable: handleGenerateDeliverable,
    endSession: handleEndSession,
    getDeliverableStatus,
    getMissingFields,
    getJobForType,
    getFullTranscript,
    confirmAllFields,
  };
}
