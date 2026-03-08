/**
 * APIクライアント テスト
 *
 * fetchをモックし、各API関数のリクエスト形式・エラーハンドリングを検証する。
 */

import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

// fetchのグローバルモック
const mockFetch = jest.fn<(url: string, init: RequestInit) => Promise<Partial<Response>>>();
global.fetch = mockFetch as unknown as typeof fetch;

// テスト対象を動的インポート (ESM対応)
let apiModule: typeof import('../../src/lib/api');

beforeAll(async () => {
  apiModule = await import('../../src/lib/api');
});

beforeEach(() => {
  mockFetch.mockReset();
});

// ============================================================
// ヘルパー
// ============================================================

function mockResponse(status: number, body: Record<string, unknown>): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    statusText: 'OK',
  };
}

// ============================================================
// startSession
// ============================================================

describe('startSession', () => {
  it('POST /api/session/start を呼び出し、session_id を返す', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { session_id: 'test-session-123' }),
    );

    const result = await apiModule.startSession();

    expect(result.session_id).toBe('test-session-123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/session/start');
    expect(options.method).toBe('POST');
  });

  it('サーバーエラー時に日本語エラーメッセージを投げる', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(500, { error: 'サーバーエラー' }),
    );

    await expect(apiModule.startSession()).rejects.toEqual(
      expect.objectContaining({ message: 'サーバーエラー' }),
    );
  });
});

// ============================================================
// generateDeliverable
// ============================================================

describe('generateDeliverable', () => {
  it('POST /api/generate-lp を session_id と type で呼び出す', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { success: true, deploy_url: 'https://example.com' }),
    );

    const result = await apiModule.generateDeliverable('sess-1', 'lp');

    expect(result.success).toBe(true);
    expect(result.deploy_url).toBe('https://example.com');

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/generate-lp');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toEqual({
      session_id: 'sess-1',
      type: 'lp',
    });
  });
});

// ============================================================
// updateField
// ============================================================

describe('updateField', () => {
  it('PATCH /api/session/:id/data を呼び出す', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { success: true }),
    );

    const result = await apiModule.updateField('sess-1', 'company_name', 'テスト株式会社');

    expect(result.success).toBe(true);

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/session/sess-1/data');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body as string)).toEqual({
      company_name: 'テスト株式会社',
    });
  });
});

// ============================================================
// endSession
// ============================================================

describe('endSession', () => {
  it('POST /api/session/:id/end を呼び出す', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { success: true }),
    );

    const result = await apiModule.endSession('sess-1');

    expect(result.success).toBe(true);

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/session/sess-1/end');
    expect(options.method).toBe('POST');
  });
});

// ============================================================
// shareAll
// ============================================================

describe('shareAll', () => {
  it('POST /api/session/:id/share を method 付きで呼び出す', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { success: true, share_url: 'https://share.example.com' }),
    );

    const result = await apiModule.shareAll('sess-1', 'line');

    expect(result.success).toBe(true);

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/session/sess-1/share');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toEqual({ method: 'line' });
  });
});

// ============================================================
// ネットワークエラー
// ============================================================

describe('ネットワークエラー', () => {
  it('fetch失敗時にエラーを投げる', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(apiModule.startSession()).rejects.toThrow('Network error');
  });

  it('非Errorオブジェクトのfetch失敗時に通信エラーメッセージを投げる', async () => {
    mockFetch.mockRejectedValueOnce('unknown failure');

    await expect(apiModule.startSession()).rejects.toEqual(
      expect.objectContaining({ message: expect.stringContaining('通信エラー') }),
    );
  });
});
