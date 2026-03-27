/**
 * APIクライアント
 *
 * 全APIコールに try-catch + 日本語エラーメッセージ。
 * AbortController signal 対応。
 */

import type {
  StartSessionResponse,
  GenerateDeliverableResponse,
  UpdateFieldResponse,
  EndSessionResponse,
  ShareAllResponse,
  ShareMethod,
  PollStatusResponse,
} from '../types/dashboard';

// ============================================================
// 共通ヘルパー
// ============================================================

const API_TIMEOUT_MS = 120_000;

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * タイムアウト付き fetch ラッパー
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const existingSignal = options.signal as AbortSignal | undefined;

  // 外部シグナルとタイムアウトシグナルを統合
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();

  if (existingSignal) {
    if (existingSignal.aborted) {
      controller.abort();
    } else {
      existingSignal.addEventListener('abort', onExternalAbort);
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
    existingSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * レスポンスを JSON としてパースし、エラーチェックする
 */
async function parseResponse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    let errorMessage = `${operation}に失敗しました (${response.status})`;
    try {
      const errorBody = await response.json() as { error?: string };
      if (errorBody.error) {
        errorMessage = errorBody.error;
      }
    } catch (parseErr) {
      console.warn('[api] Error response body parse failed:', parseErr);
    }
    throw new ApiError(errorMessage, response.status);
  }

  return response.json() as Promise<T>;
}

// ============================================================
// API関数
// ============================================================

/**
 * セッションを開始する
 */
export async function startSession(): Promise<StartSessionResponse> {
  try {
    const response = await fetchWithTimeout('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return parseResponse<StartSessionResponse>(response, 'セッション開始');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new ApiError('セッション開始中に通信エラーが発生しました', 0);
  }
}

/**
 * 制作物を生成する
 */
export async function generateDeliverable(
  sessionId: string,
  type: string,
): Promise<GenerateDeliverableResponse> {
  try {
    const response = await fetchWithTimeout('/api/generate-lp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, type }),
    });
    return parseResponse<GenerateDeliverableResponse>(response, '制作物生成');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new ApiError('制作物生成中に通信エラーが発生しました', 0);
  }
}

/**
 * 抽出フィールドを手動更新する
 */
export async function updateField(
  sessionId: string,
  field: string,
  value: string,
): Promise<UpdateFieldResponse> {
  try {
    const response = await fetchWithTimeout(`/api/session/${encodeURIComponent(sessionId)}/data`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    return parseResponse<UpdateFieldResponse>(response, 'フィールド更新');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new ApiError('フィールド更新中に通信エラーが発生しました', 0);
  }
}

/**
 * セッションを終了する
 */
export async function endSession(sessionId: string): Promise<EndSessionResponse> {
  try {
    const response = await fetchWithTimeout(`/api/session/${encodeURIComponent(sessionId)}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return parseResponse<EndSessionResponse>(response, 'セッション終了');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new ApiError('セッション終了中に通信エラーが発生しました', 0);
  }
}

/**
 * 生成済み制作物を一括共有する
 */
export async function shareAll(
  sessionId: string,
  method: ShareMethod,
): Promise<ShareAllResponse> {
  try {
    const response = await fetchWithTimeout(
      `/api/session/${encodeURIComponent(sessionId)}/share`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      },
    );
    return parseResponse<ShareAllResponse>(response, '一括共有');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new ApiError('一括共有中に通信エラーが発生しました', 0);
  }
}

/**
 * Background Functionのジョブステータスをポーリングする
 */
export async function pollJobStatus(
  sessionId: string,
  type: string,
): Promise<PollStatusResponse> {
  try {
    const response = await fetchWithTimeout(
      `/api/poll-status?session_id=${encodeURIComponent(sessionId)}&type=${encodeURIComponent(type)}`,
      { method: 'GET' },
      10_000,
    );
    return parseResponse<PollStatusResponse>(response, 'ステータス確認');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new ApiError('ステータス確認中に通信エラーが発生しました', 0);
  }
}

export const api = {
  startSession,
  generateDeliverable,
  updateField,
  endSession,
  shareAll,
  pollJobStatus,
} as const;
