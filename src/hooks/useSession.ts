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
        localStorage.removeItem(entries[i].key);
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

  // 特定企業にフォーカスして抽出
  const extractForCompany = useCallback(async (companyName: string, transcript: string) => {
    try {
      setError(null);
      const res = await fetch('/api/extract-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          transcript,
          target_company: companyName,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { extracted_data?: ExtractedDataMap };
        if (data.extracted_data) {
          setExtractedData(data.extracted_data);
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

  // プレビュー抽出 (一定間隔で蓄積テキストからフィールドを抽出してカード表示を更新)
  // 企業選択後のみ実行（選択前はdetect-companiesのフローを優先）
  useEffect(() => {
    if (status !== 'active') return;
    if (!isSessionValid) return;
    if (!targetCompany) return; // 企業未選択時はスキップ

    const interval = setInterval(async () => {
      // 新しいチャンクがなければスキップ
      if (transcriptChunks.length <= lastExtractedChunkCount.current) return;
      if (transcriptChunks.length === 0) return;

      lastExtractedChunkCount.current = transcriptChunks.length;

      try {
        const res = await fetch('/api/extract-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            transcript: transcriptChunks.map(c => c.text).join('\n'),
            target_company: targetCompany,
          }),
        });
        if (res.ok) {
          const data = await res.json() as { extracted_data?: ExtractedDataMap };
          if (data.extracted_data) {
            setExtractedData(data.extracted_data);
          }
        }
      } catch {
        // プレビュー抽出のエラーは無視（重要ではない）
      }
    }, PREVIEW_EXTRACT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionId, status, transcriptChunks, isSessionValid, targetCompany]);

  // ジョブ状態ポーリング
  useEffect(() => {
    if (jobs.length === 0) return;
    const hasActive = jobs.some(j => j.status === 'processing' || j.status === 'queued');
    if (!hasActive) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.getSessionStatus(sessionId);
        const data = res as Record<string, unknown>;
        if (data['jobs']) {
          setJobs(data['jobs'] as GenerationJob[]);
        }
        if (data['extracted_data']) {
          setExtractedData(data['extracted_data'] as ExtractedDataMap);
        }
      } catch {
        // ポーリングエラーは無視
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionId, jobs]);

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

  // LP用3ステップパイプライン
  const generateLpPipeline = useCallback(async (fullText: string) => {
    const type: DeliverableType = 'lp';
    const baseBody = { session_id: sessionId, type, extracted_data: extractedData };

    // Step 1: Draft
    updateJobStatus(type, 'processing', 'Step 1/3: コピー設計中...');
    const draftRes = await fetch('/api/generate-lp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, step: 'draft', transcript: fullText }),
    });
    if (!draftRes.ok) {
      const err = await draftRes.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? 'コピー設計に失敗しました');
    }
    const draftResult = await draftRes.json() as { success: boolean; content?: Record<string, unknown>; error?: string };
    if (!draftResult.success || !draftResult.content) throw new Error(draftResult.error ?? 'Draft失敗');

    // Step 2: Evaluate & Revise
    updateJobStatus(type, 'processing', 'Step 2/3: 品質チェック・修正中...');
    const evalRes = await fetch('/api/generate-lp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, step: 'evaluate', draft_content: draftResult.content, transcript: fullText }),
    });
    let finalContent = draftResult.content;
    if (evalRes.ok) {
      const evalResult = await evalRes.json() as { success: boolean; content?: Record<string, unknown> };
      if (evalResult.success && evalResult.content) {
        finalContent = evalResult.content;
      }
    }

    // Step 3: Build HTML
    updateJobStatus(type, 'processing', 'Step 3/3: HTML構築中...');
    const buildRes = await fetch('/api/generate-lp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, step: 'build', draft_content: finalContent }),
    });
    if (!buildRes.ok) {
      const err = await buildRes.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? 'HTML構築に失敗しました');
    }
    const buildResult = await buildRes.json() as { success: boolean; html?: string; view_url?: string; error?: string };
    if (!buildResult.success || !buildResult.html) throw new Error(buildResult.error ?? 'Build失敗');

    return buildResult;
  }, [sessionId, extractedData, updateJobStatus]);

  // 制作物生成
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

      let result: { html?: string; view_url?: string };

      if (type === 'lp') {
        // LP: 3ステップパイプライン
        result = await generateLpPipeline(fullText);
      } else {
        // LP以外: 従来の1ステップ
        const res = await fetch('/api/generate-lp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            type,
            transcript: fullText,
            extracted_data: extractedData,
          }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: '生成に失敗しました' })) as { error?: string };
          throw new Error(errBody.error ?? '生成に失敗しました');
        }

        const resJson = await res.json() as { success: boolean; html?: string; view_url?: string; error?: string };
        if (!resJson.success || !resJson.html) {
          throw new Error(resJson.error ?? '生成結果が空です');
        }
        result = resJson;
      }

      // URL設定
      let displayUrl: string;
      if (result.view_url) {
        displayUrl = result.view_url;
      } else if (result.html) {
        const blob = new Blob([result.html], { type: 'text/html; charset=utf-8' });
        displayUrl = URL.createObjectURL(blob);
      } else {
        throw new Error('生成結果が空です');
      }

      // 旧blob URLがあれば解放
      setJobs(prev => {
        const oldJob = prev.find(j => j.type === type);
        if (oldJob?.result_url?.startsWith('blob:')) {
          URL.revokeObjectURL(oldJob.result_url);
        }
        return prev.map(j =>
          j.type === type
            ? { ...j, status: 'completed' as const, result_url: displayUrl, error: null, completed_at: new Date().toISOString() }
            : j
        );
      });

      // LP完了後にGemini画像生成を非同期起動（UIをブロックしない）
      if (type === 'lp' && result.view_url) {
        void triggerImageGeneration(sessionId, extractedData);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '制作物の生成に失敗しました';
      setError(msg);
      setJobs(prev => prev.map(j =>
        j.type === type ? { ...j, status: 'failed' as const, error: msg } : j
      ));
    }
  }, [sessionId, transcriptChunks, extractedData, generateLpPipeline]);

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
