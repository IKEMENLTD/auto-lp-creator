/**
 * audio-pipeline テスト
 *
 * processTranscriptChunk のフローと
 * resolveSessionFromMeetingId のロジックをテストする。
 * Supabase / Haiku API はモック化。
 */

import { jest } from "@jest/globals";

// ============================================================
// モック設定
// ============================================================

// haiku-client のモック
const mockExtractAndMerge = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCheckGenerationReadiness = jest.fn<(...args: unknown[]) => unknown>();
const mockCreateEmptyExtractedData = jest.fn<() => unknown>();

jest.unstable_mockModule("../netlify/functions/lib/haiku-client.js", () => ({
  extractAndMerge: mockExtractAndMerge,
  checkGenerationReadiness: mockCheckGenerationReadiness,
  createEmptyExtractedData: mockCreateEmptyExtractedData,
}));

// テスト対象のインポート（モック後にdynamic import）
const { processTranscriptChunk, resolveSessionFromMeetingId } =
  await import("../netlify/functions/lib/audio-pipeline.js");

// ============================================================
// Supabase モッククライアントファクトリ
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

function createMockFn(): MockFn {
  return jest.fn<(...args: unknown[]) => unknown>();
}

interface SupabaseResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function createMockSupabase(overrides?: {
  insertResult?: SupabaseResult;
  selectResult?: SupabaseResult;
  updateResult?: SupabaseResult;
}): { from: MockFn } {
  const defaultInsert: SupabaseResult = { data: { id: "chunk-uuid-123" }, error: null };
  const defaultSelect: SupabaseResult = {
    data: { extracted_data: null, version: 0 },
    error: null,
  };
  const defaultUpdate: SupabaseResult = { data: null, error: null };

  const insertResult = overrides?.insertResult ?? defaultInsert;
  const selectResult = overrides?.selectResult ?? defaultSelect;
  const updateResult = overrides?.updateResult ?? defaultUpdate;

  const mockFrom = createMockFn();

  mockFrom.mockReturnValue({
    select: createMockFn().mockReturnValue({
      eq: createMockFn().mockReturnValue({
        single: createMockFn().mockReturnValue(Promise.resolve(selectResult)),
      }),
      single: createMockFn().mockReturnValue(Promise.resolve(insertResult)),
    }),
    insert: createMockFn().mockReturnValue({
      select: createMockFn().mockReturnValue({
        single: createMockFn().mockReturnValue(Promise.resolve(insertResult)),
      }),
    }),
    update: createMockFn().mockReturnValue({
      eq: createMockFn().mockReturnValue(Promise.resolve(updateResult)),
    }),
  });

  return { from: mockFrom };
}

// ============================================================
// テスト
// ============================================================

describe("processTranscriptChunk", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: "test-api-key" };

    mockExtractAndMerge.mockResolvedValue({
      merged: {
        company_name: { value: "テスト会社", confidence: 1.0 },
        industry: { value: "BtoBサービス", confidence: 0.6 },
        service_name: { value: null, confidence: 0.3 },
        target_customer: { value: null, confidence: 0.3 },
        price_range: { value: null, confidence: 0.3 },
        strengths: { value: [], confidence: 0.3 },
        pain_points: { value: [], confidence: 0.3 },
        current_marketing: { value: null, confidence: 0.3 },
        desired_outcome: { value: null, confidence: 0.3 },
        contact_info: { value: { phone: null, email: null, line: null, address: null }, confidence: 0.3 },
        tone_keywords: { value: [], confidence: 0.3 },
        upsell_signals: { value: [], confidence: 0.3 },
      },
      fieldsUpdated: ["company_name", "industry"],
    });

    mockCheckGenerationReadiness.mockReturnValue({
      "LP": { ready: false, missing: ["service_name", "target_customer", "strengths"], filled: ["company_name", "industry"], confidence_avg: 0.8 },
      "議事録": { ready: true, missing: [], filled: [], confidence_avg: 0 },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("ANTHROPIC_API_KEY が未設定の場合はエラー", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const mockSupabase = createMockSupabase();

    await expect(
      processTranscriptChunk("session-1", "テスト", 0, mockSupabase as never),
    ).rejects.toThrow("ANTHROPIC_API_KEY");
  });

  test("正常フローでExtractionResultを返す", async () => {
    const mockSupabase = createMockSupabase();

    const result = await processTranscriptChunk(
      "session-1",
      "テスト会話テキスト",
      0,
      mockSupabase as never,
    );

    expect(result.fields_updated).toEqual(["company_name", "industry"]);
    expect(result.version).toBe(1);
    expect(mockExtractAndMerge).toHaveBeenCalledWith(
      "テスト会話テキスト",
      null,
      "test-api-key",
    );
  });
});

describe("resolveSessionFromMeetingId", () => {
  test("既存セッションが見つかった場合はそのsession_idを返す", async () => {
    const mockFrom = createMockFn();

    mockFrom.mockImplementation((table: unknown) => {
      if (table === "sessions") {
        return {
          select: createMockFn().mockReturnValue({
            eq: createMockFn().mockReturnValue({
              single: createMockFn().mockReturnValue(Promise.resolve({
                data: { session_id: "existing-session" },
                error: null,
              })),
            }),
          }),
        };
      }
      if (table === "chunks") {
        return {
          select: createMockFn().mockReturnValue({
            eq: createMockFn().mockReturnValue(Promise.resolve({
              count: 3,
              error: null,
            })),
          }),
        };
      }
      return {
        select: createMockFn().mockReturnValue({
          eq: createMockFn().mockReturnValue({
            single: createMockFn().mockReturnValue(Promise.resolve({
              data: null,
              error: null,
            })),
          }),
        }),
      };
    });

    const mockSupabase = { from: mockFrom };

    const result = await resolveSessionFromMeetingId(
      "meeting-123",
      mockSupabase as never,
    );

    expect(result.sessionId).toBe("existing-session");
    expect(result.chunkIndex).toBe(3);
  });
});
