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
} from '../types/dashboard';

// ============================================================
// 共通ヘルパー
// ============================================================

const API_TIMEOUT_MS = 120_000;

interface ApiError {
  readonly message: string;
  readonly status: number;
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
  const existingSignal = options.signal;

  // 外部シグナルとタイムアウトシグナルを統合
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (existingSignal) {
    existingSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
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
    } catch {
      // JSON パース失敗は無視
    }
    const apiError: ApiError = { message: errorMessage, status: response.status };
    throw apiError;
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
    if (error && typeof error === 'object' && 'message' in error) {
      throw error;
    }
    throw { message: 'セッション開始中に通信エラーが発生しました', status: 0 } satisfies ApiError;
  }
}

/**
 * セッション状態を取得する
 */
export async function getSessionStatus(sessionId: string): Promise<Record<string, unknown>> {
  try {
    const response = await fetchWithTimeout(
      `/api/session-status?session_id=${encodeURIComponent(sessionId)}`,
      { method: 'GET' },
    );
    return parseResponse<Record<string, unknown>>(response, 'セッション状態取得');
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      throw error;
    }
    throw { message: 'セッション状態の取得中に通信エラーが発生しました', status: 0 } satisfies ApiError;
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
    if (error && typeof error === 'object' && 'message' in error) {
      throw error;
    }
    throw { message: '制作物生成中に通信エラーが発生しました', status: 0 } satisfies ApiError;
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
    if (error && typeof error === 'object' && 'message' in error) {
      throw error;
    }
    throw { message: 'フィールド更新中に通信エラーが発生しました', status: 0 } satisfies ApiError;
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
    if (error && typeof error === 'object' && 'message' in error) {
      throw error;
    }
    throw { message: 'セッション終了中に通信エラーが発生しました', status: 0 } satisfies ApiError;
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
    if (error && typeof error === 'object' && 'message' in error) {
      throw error;
    }
    throw { message: '一括共有中に通信エラーが発生しました', status: 0 } satisfies ApiError;
  }
}

export const api = {
  startSession,
  getSessionStatus,
  generateDeliverable,
  updateField,
  endSession,
  shareAll,
} as const;
