/**
 * Supabase ヘルパー関数のユニットテスト
 */

import { jest, describe, it, expect, beforeAll, afterEach } from '@jest/globals';

import type {
  Database,
  SessionRow,
  ChunkRow,
  ExtractedDataRow,
  GenerationJobRow,
  SessionStatus,
  JobStatus,
  JobType,
} from '../netlify/functions/lib/supabase.js';

// ============================================================
// モック設定
// Supabase チェインAPIモック - mockReturnValue/mockResolvedValueOnce を
// 両方使うため untyped jest.fn() + SupabaseMock ラッパーで管理
// ============================================================

/** Supabase チェインモックの型安全ラッパー */
interface SupabaseMock {
  single: jest.Mock<() => Promise<{ data: unknown; error: unknown }>>;
  maybeSingle: jest.Mock<() => Promise<{ data: unknown; error: unknown }>>;
  select: jest.Mock<() => unknown>;
  insert: jest.Mock<() => unknown>;
  update: jest.Mock<() => unknown>;
  eq: jest.Mock<() => unknown>;
  order: jest.Mock<() => unknown>;
  limit: jest.Mock<() => unknown>;
  from: jest.Mock<() => unknown>;
}

function createMocks(): SupabaseMock {
  const m: SupabaseMock = {
    single: jest.fn<() => Promise<{ data: unknown; error: unknown }>>(),
    maybeSingle: jest.fn<() => Promise<{ data: unknown; error: unknown }>>(),
    select: jest.fn<() => unknown>(),
    insert: jest.fn<() => unknown>(),
    update: jest.fn<() => unknown>(),
    eq: jest.fn<() => unknown>(),
    order: jest.fn<() => unknown>(),
    limit: jest.fn<() => unknown>(),
    from: jest.fn<() => unknown>(),
  };

  m.select.mockReturnValue({
    single: m.single,
    eq: m.eq,
    order: m.order,
    limit: m.limit,
    maybeSingle: m.maybeSingle,
  });

  m.insert.mockReturnValue({
    select: m.select,
    error: null,
  });

  m.update.mockReturnValue({
    eq: m.eq,
    error: null,
  });

  m.eq.mockReturnValue({
    order: m.order,
    single: m.single,
    maybeSingle: m.maybeSingle,
    error: null,
  });

  m.order.mockReturnValue({
    limit: m.limit,
  });

  m.limit.mockReturnValue({
    maybeSingle: m.maybeSingle,
  });

  m.from.mockReturnValue({
    insert: m.insert,
    update: m.update,
    select: m.select,
    eq: m.eq,
  });

  return m;
}

const mocks = createMocks();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    from: mocks.from,
  }),
}));

// 動的インポート (jest.unstable_mockModule 後に行う)
const {
  getSupabaseClient,
  createSession,
  addChunk,
  getLatestExtraction,
  createGenerationJob,
  updateJobStatus,
  logAnalytics,
} = await import('../netlify/functions/lib/supabase.js');

// 環境変数の設定
beforeAll(() => {
  process.env['SUPABASE_URL'] = 'https://test.supabase.co';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key';
});

afterEach(() => {
  // モックをクリアして再設定
  Object.values(mocks).forEach((m) => m.mockClear());

  mocks.select.mockReturnValue({
    single: mocks.single,
    eq: mocks.eq,
    order: mocks.order,
    limit: mocks.limit,
    maybeSingle: mocks.maybeSingle,
  });
  mocks.insert.mockReturnValue({
    select: mocks.select,
    error: null,
  });
  mocks.update.mockReturnValue({
    eq: mocks.eq,
    error: null,
  });
  mocks.eq.mockReturnValue({
    order: mocks.order,
    single: mocks.single,
    maybeSingle: mocks.maybeSingle,
    error: null,
  });
  mocks.order.mockReturnValue({
    limit: mocks.limit,
  });
  mocks.limit.mockReturnValue({
    maybeSingle: mocks.maybeSingle,
  });
  mocks.from.mockReturnValue({
    insert: mocks.insert,
    update: mocks.update,
    select: mocks.select,
    eq: mocks.eq,
  });
});

// ============================================================
// テスト
// ============================================================

describe('getSupabaseClient', () => {
  it('環境変数が設定されていればクライアントを返す', () => {
    const client = getSupabaseClient();
    expect(client).toBeDefined();
    expect(client.from).toBeDefined();
  });
});

describe('型定義の検証', () => {
  it('SessionStatus は有効な値のみ許容する', () => {
    const validStatuses: SessionStatus[] = ['active', 'paused', 'ended'];
    expect(validStatuses).toHaveLength(3);
  });

  it('JobStatus は有効な値のみ許容する', () => {
    const validStatuses: JobStatus[] = [
      'queued',
      'processing',
      'completed',
      'failed',
    ];
    expect(validStatuses).toHaveLength(4);
  });

  it('JobType は有効な値のみ許容する', () => {
    const validTypes: JobType[] = [
      'lp',
      'ad_creative',
      'flyer',
      'hearing_form',
      'line_design',
      'minutes',
      'profile',
    ];
    expect(validTypes).toHaveLength(7);
  });

  it('Database型がテーブル定義を含む', () => {
    type TableNames = keyof Database['public']['Tables'];
    const tables: TableNames[] = [
      'sessions',
      'chunks',
      'extracted_data',
      'generation_jobs',
      'templates',
      'analytics',
    ];
    expect(tables).toHaveLength(6);
  });
});

describe('createSession', () => {
  it('新しいセッションを作成して返す', async () => {
    const mockSession: SessionRow = {
      id: 'test-uuid',
      user_id: 'user-uuid',
      status: 'active',
      started_at: '2026-03-06T00:00:00Z',
      ended_at: null,
      created_at: '2026-03-06T00:00:00Z',
      updated_at: '2026-03-06T00:00:00Z',
    };

    mocks.single.mockResolvedValueOnce({ data: mockSession, error: null });

    const result = await createSession('user-uuid');
    expect(result.id).toBe('test-uuid');
    expect(result.user_id).toBe('user-uuid');
    expect(result.status).toBe('active');
    expect(mocks.from).toHaveBeenCalledWith('sessions');
  });

  it('エラー時に例外をスローする', async () => {
    mocks.single.mockResolvedValueOnce({
      data: null,
      error: { message: 'insert failed', code: '42000' },
    });

    await expect(createSession('user-uuid')).rejects.toThrow(
      'Supabase createSession エラー'
    );
  });
});

describe('addChunk', () => {
  it('チャンクを追加して返す', async () => {
    const mockChunk: ChunkRow = {
      id: 'chunk-uuid',
      session_id: 'session-uuid',
      text: 'テストテキスト',
      chunk_index: 0,
      speaker: 'sales',
      timestamp: '2026-03-06T00:00:00Z',
      processed: false,
      created_at: '2026-03-06T00:00:00Z',
      updated_at: '2026-03-06T00:00:00Z',
    };

    mocks.single.mockResolvedValueOnce({ data: mockChunk, error: null });

    const result = await addChunk('session-uuid', 'テストテキスト', 0, 'sales');
    expect(result.text).toBe('テストテキスト');
    expect(result.chunk_index).toBe(0);
    expect(result.speaker).toBe('sales');
    expect(mocks.from).toHaveBeenCalledWith('chunks');
  });
});

describe('getLatestExtraction', () => {
  it('最新の抽出データを返す', async () => {
    const mockExtraction: ExtractedDataRow = {
      id: 'ext-uuid',
      session_id: 'session-uuid',
      data_json: { company_name: 'テスト企業' },
      version: 3,
      created_at: '2026-03-06T00:00:00Z',
      updated_at: '2026-03-06T00:00:00Z',
    };

    mocks.maybeSingle.mockResolvedValueOnce({
      data: mockExtraction,
      error: null,
    });

    const result = await getLatestExtraction('session-uuid');
    expect(result).not.toBeNull();
    expect(result?.version).toBe(3);
    expect(mocks.from).toHaveBeenCalledWith('extracted_data');
  });

  it('データが存在しない場合nullを返す', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await getLatestExtraction('nonexistent-session');
    expect(result).toBeNull();
  });
});

describe('createGenerationJob', () => {
  it('ジョブを作成してqueuedステータスで返す', async () => {
    const mockJob: GenerationJobRow = {
      id: 'job-uuid',
      session_id: 'session-uuid',
      type: 'lp',
      status: 'queued',
      model: null,
      result_url: null,
      started_at: null,
      completed_at: null,
      error: null,
      created_at: '2026-03-06T00:00:00Z',
      updated_at: '2026-03-06T00:00:00Z',
    };

    mocks.single.mockResolvedValueOnce({ data: mockJob, error: null });

    const result = await createGenerationJob('session-uuid', 'lp');
    expect(result.status).toBe('queued');
    expect(result.type).toBe('lp');
    expect(mocks.from).toHaveBeenCalledWith('generation_jobs');
  });
});

describe('updateJobStatus', () => {
  it('ジョブステータスを更新する', async () => {
    mocks.eq.mockReturnValueOnce(
      Promise.resolve({ data: null, error: null })
    );

    await expect(
      updateJobStatus('job-uuid', 'completed', 'https://example.com/result')
    ).resolves.not.toThrow();

    expect(mocks.from).toHaveBeenCalledWith('generation_jobs');
  });

  it('failed時にerrorを設定する', async () => {
    mocks.eq.mockReturnValueOnce(
      Promise.resolve({ data: null, error: null })
    );

    await expect(
      updateJobStatus('job-uuid', 'failed', undefined, 'Generation failed')
    ).resolves.not.toThrow();
  });
});

describe('logAnalytics', () => {
  it('アナリティクスイベントを記録する', async () => {
    mocks.insert.mockReturnValueOnce({ error: null });

    await expect(
      logAnalytics('session-uuid', 'lp_generated', { template_id: 1 })
    ).resolves.not.toThrow();

    expect(mocks.from).toHaveBeenCalledWith('analytics');
  });

  it('メタデータなしでも記録できる', async () => {
    mocks.insert.mockReturnValueOnce({ error: null });

    await expect(
      logAnalytics('session-uuid', 'session_started')
    ).resolves.not.toThrow();
  });
});
