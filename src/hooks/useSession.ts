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

function saveSessionState(sessionId: string, state: PersistedSessionState): void {
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
  } catch {
    // localStorage容量超過などは無視
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
  } catch {
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
        } catch { return { key: k, savedAt: 0 }; }
      });
      entries.sort((a, b) => a.savedAt - b.savedAt);
      for (let i = 0; i < entries.length - 10; i++) {
        localStorage.removeItem(entries[i]!.key);
      }
    }
  } catch {
    // 無視
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
    const sections = [
      { section: 'hero', context: `${getExtractedValue(data, 'service_name')} - ${getExtractedValue(data, 'industry')}` },
      { section: 'about', context: getExtractedValue(data, 'strengths') },
      { section: 'reason1', context: getExtractedValue(data, 'strengths') },
    ];

    await fetch('/api/generate-images', {
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
    console.log('[useSession] Image generation triggered');
  } catch {
    console.log('[useSession] Image generation skipped (non-critical)');
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

  // sessionId変更時にリセット（初回マウントではなく、実際にIDが変わった時のみ）
  const prevSessionIdRef = useRef<string>(sessionId);
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return;
    prevSessionIdRef.current = sessionId;

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

  // 文字起こしチャンク追加
  const addTranscriptChunk = useCallback((text: string, speaker?: string) => {
    const chunk: TranscriptChunk = {
      text,
      timestamp: new Date().toISOString(),
      speaker,
    };
    setTranscriptChunks(prev => [...prev, chunk]);
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

      // 起動時刻を記録（この時刻より前のステータスは古いので無視する）
      const fireTime = Date.now();

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

      // ポーリングで結果を待つ（最大60秒）
      // 最初の3秒は必ず待つ（Background Functionがステータスを書き込む時間を確保）
      await new Promise(r => setTimeout(r, 3000));

      const POLL_TIMEOUT_MS = 60_000;

      while (Date.now() - fireTime < POLL_TIMEOUT_MS) {
        try {
          const pollResult = await api.pollJobStatus(sessionId, 'extract') as { status: string; data?: unknown; error?: string; updatedAt?: string };

          // updatedAtが起動前のものなら古いステータス → 無視して待つ
          if (pollResult.updatedAt) {
            const statusTime = new Date(pollResult.updatedAt).getTime();
            if (statusTime < fireTime - 1000) {
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
          }

          // processingなら新しいジョブが走っている → 待つ
          if (pollResult.status === 'processing') {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }

          if (pollResult.status === 'completed') {
            const resultData = pollResult.data as { extracted_data?: ExtractedDataMap } | undefined;
            if (resultData?.extracted_data) {
              setExtractedData(resultData.extracted_data);
            }
            return;
          }

          if (pollResult.status === 'failed') {
            console.warn('[useSession] extractForCompany failed:', pollResult.error);
            return;
          }

          // unknown = まだステータスが書き込まれていない → 待つ
          await new Promise(r => setTimeout(r, 2000));
        } catch {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    } catch {
      // 抽出失敗は無視
    }
  }, [sessionId]);

  // 全文テキスト取得
  const getFullTranscript = useCallback((): string => {
    return transcriptChunks.map(c => c.text).join('\n');
  }, [transcriptChunks]);

  // sessionIdが仮IDの場合はスキップ
  const isSessionValid = sessionId !== '__none__';

  // プレビュー抽出（Background Function版）
  // 15秒おきにBackground Functionを起動し、その後のポーリングで結果を取得
  useEffect(() => {
    if (status !== 'active') return;
    if (!isSessionValid) return;

    // 抽出中フラグ（重複実行防止）
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

        // 結果をポーリング（最大12秒、次のインターバルまでに完了させる）
        for (let i = 0; i < 4; i++) {
          await new Promise(r => setTimeout(r, 3000));
          try {
            const pollResult = await api.pollJobStatus(sessionId, 'extract');
            if (pollResult.status === 'completed') {
              const resultData = pollResult.data as { extracted_data?: ExtractedDataMap } | undefined;
              if (resultData?.extracted_data) {
                setExtractedData(resultData.extracted_data);
              }
              break;
            }
            if (pollResult.status === 'failed') break;
          } catch {
            // ポーリングエラーは無視
          }
        }
      } catch {
        // プレビュー抽出のエラーは無視
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

  // ポーリング用のインターバルrefを管理（クリーンアップ用）
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ステップ名を日本語に変換
  function stepToLabel(step?: string): string {
    switch (step) {
      case 'draft': return 'コピー設計中...';
      case 'evaluate': return '品質チェック中...';
      case 'build': return 'HTML構築中...';
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
      const POLL_TIMEOUT_MS = 90_000;

      const intervalId = setInterval(async () => {
        try {
          // タイムアウトチェック
          if (Date.now() - pollStartTime > POLL_TIMEOUT_MS) {
            clearInterval(intervalId);
            pollIntervalsRef.current.delete(type);
            setError('生成がタイムアウトしました。もう一度お試しください。');
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

            // LP完了後にGemini画像生成を非同期起動
            if (type === 'lp') {
              void triggerImageGeneration(sessionId, extractedData);
            }
          } else if (pollResult.status === 'failed') {
            clearInterval(intervalId);
            pollIntervalsRef.current.delete(type);
            const errorMsg = pollResult.error ?? '生成に失敗しました';
            setError(errorMsg);
            setJobs(prev => prev.map(j =>
              j.type === type ? { ...j, status: 'failed' as const, error: errorMsg } : j
            ));
          }
        } catch {
          // ポーリング中のエラーは無視（次回リトライ）
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
  };
}
