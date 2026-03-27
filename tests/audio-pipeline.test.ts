/**
 * audio-pipeline テスト
 *
 * processTranscriptChunk のフローと
 * resolveSessionFromMeetingId のロジックをテストする。
 * Supabase / Haiku API はモック化。
 */

import { jest, describe, test, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";

// ============================================================
// モック設定
// ============================================================

const mockExtractAndMerge = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCheckGenerationReadiness = jest.fn<(...args: unknown[]) => unknown>();
const mockCreateEmptyExtractedData = jest.fn<() => unknown>();

jest.unstable_mockModule("../netlify/functions/lib/haiku-client.js", () => ({
  extractAndMerge: mockExtractAndMerge,
  checkGenerationReadiness: mockCheckGenerationReadiness,
  createEmptyExtractedData: mockCreateEmptyExtractedData,
}));

// ============================================================
// テスト対象の遅延インポート
// ============================================================

const { processTranscriptChunk, resolveSessionFromMeetingId } =
  await import("../netlify/functions/lib/audio-pipeline.js");

// ============================================================
// Supabase モッククライアントファクトリ
// ============================================================

type MockFn = jest.Mock<(...args: any[]) => any>;

function createMockFn(): MockFn {
  return jest.fn<(...args: any[]) => any>();
}

function createMockSupabase() {
  const mockFrom = createMockFn();

  // chunks: insert → select → single
  const chunkInsertSingle = createMockFn().mockResolvedValue({
    data: { id: "chunk-uuid-123" },
    error: null,
  });
  const chunkInsertSelect = createMockFn().mockReturnValue({
    single: chunkInsertSingle,
  });
  const chunkInsert = createMockFn().mockReturnValue({
    select: chunkInsertSelect,
  });
  const chunkUpdateEq = createMockFn().mockResolvedValue({ data: null, error: null });
  const chunkUpdate = createMockFn().mockReturnValue({
    eq: chunkUpdateEq,
  });

  // extracted_data: select → eq → order → limit → maybeSingle
  const extractedDataMaybeSingle = createMockFn().mockResolvedValue({
    data: null, // 初回は既存データなし
    error: null,
  });
  const extractedDataLimit = createMockFn().mockReturnValue({
    maybeSingle: extractedDataMaybeSingle,
  });
  const extractedDataOrder = createMockFn().mockReturnValue({
    limit: extractedDataLimit,
  });
  const extractedDataEq = createMockFn().mockReturnValue({
    order: extractedDataOrder,
  });
  const extractedDataSelect = createMockFn().mockReturnValue({
    eq: extractedDataEq,
  });
  const extractedDataInsert = createMockFn().mockResolvedValue({ data: null, error: null });

  mockFrom.mockImplementation((table: string) => {
    if (table === "chunks") {
      return { insert: chunkInsert, update: chunkUpdate };
    }
    if (table === "extracted_data") {
      return { select: extractedDataSelect, insert: extractedDataInsert };
    }
    return {};
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
      },
      fieldsUpdated: ["company_name", "industry"],
    });

    mockCheckGenerationReadiness.mockReturnValue({
      LP: { ready: false, missing: ["service_name"], filled: ["company_name"], confidence_avg: 0.8 },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("ANTHROPIC_API_KEY が未設定の場合はエラー", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const mockSupabase = createMockSupabase();

    await expect(
      processTranscriptChunk("session-1", "テスト", 0, mockSupabase),
    ).rejects.toThrow("ANTHROPIC_API_KEY");
  });

  test("正常フローでExtractionResultを返す", async () => {
    const mockSupabase = createMockSupabase();

    const result = await processTranscriptChunk(
      "session-1",
      "テスト会話テキスト",
      0,
      mockSupabase,
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

    mockFrom.mockImplementation((table: string) => {
      if (table === "sessions") {
        return {
          select: createMockFn().mockReturnValue({
            eq: createMockFn().mockReturnValue({
              single: createMockFn().mockResolvedValue({
                data: { id: "existing-session" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "chunks") {
        return {
          select: createMockFn().mockReturnValue({
            eq: createMockFn().mockResolvedValue({
              count: 3,
              error: null,
            }),
          }),
        };
      }
      return {};
    });

    const result = await resolveSessionFromMeetingId("meeting-123", { from: mockFrom });

    expect(result.sessionId).toBe("existing-session");
    expect(result.chunkIndex).toBe(3);
  });
});
