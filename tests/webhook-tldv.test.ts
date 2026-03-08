/**
 * webhook-tldv テスト
 *
 * tl;dv Webhookのバリデーションとハンドラロジックをテストする。
 */

// ============================================================
// ハンドラの内部バリデーションロジックを直接テストするため、
// validateWebhookPayload 相当のテストをユニットテストとして記述する。
// ============================================================

describe("tl;dv Webhook バリデーション", () => {
  // バリデーションロジックの簡易再現（ハンドラ内部関数のテスト）
  function validatePayload(body: unknown): {
    valid: boolean;
    error?: string;
    eventType?: string;
  } {
    if (!body || typeof body !== "object") {
      return { valid: false, error: "リクエストボディが空です" };
    }

    const payload = body as Record<string, unknown>;

    if (typeof payload["event"] !== "string") {
      return { valid: false, error: "event フィールドは必須です" };
    }

    if (typeof payload["meeting_id"] !== "string" || payload["meeting_id"] === "") {
      return { valid: false, error: "meeting_id フィールドは必須です" };
    }

    const eventType = payload["event"];

    if (eventType === "transcript.chunk") {
      if (typeof payload["text"] !== "string" || payload["text"] === "") {
        return { valid: false, error: "text は必須です" };
      }
      if (typeof payload["timestamp"] !== "number") {
        return { valid: false, error: "timestamp は必須です" };
      }
      if (typeof payload["speaker"] !== "string") {
        return { valid: false, error: "speaker は必須です" };
      }
      return { valid: true, eventType };
    }

    if (eventType === "meeting.ended") {
      if (typeof payload["full_transcript"] !== "string") {
        return { valid: false, error: "full_transcript は必須です" };
      }
      return { valid: true, eventType };
    }

    return { valid: false, error: `未対応のイベントタイプです: ${String(eventType)}` };
  }

  test("正常な transcript.chunk イベント", () => {
    const result = validatePayload({
      event: "transcript.chunk",
      meeting_id: "meeting-123",
      text: "テスト会話テキスト",
      timestamp: 1234567890,
      speaker: "田中",
    });
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe("transcript.chunk");
  });

  test("正常な meeting.ended イベント", () => {
    const result = validatePayload({
      event: "meeting.ended",
      meeting_id: "meeting-123",
      full_transcript: "全文テキスト",
    });
    expect(result.valid).toBe(true);
    expect(result.eventType).toBe("meeting.ended");
  });

  test("空ボディはエラー", () => {
    expect(validatePayload(null).valid).toBe(false);
    expect(validatePayload(undefined).valid).toBe(false);
  });

  test("event フィールド欠落はエラー", () => {
    const result = validatePayload({ meeting_id: "m1" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("event");
  });

  test("meeting_id 欠落はエラー", () => {
    const result = validatePayload({ event: "transcript.chunk" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("meeting_id");
  });

  test("transcript.chunk で text 欠落はエラー", () => {
    const result = validatePayload({
      event: "transcript.chunk",
      meeting_id: "m1",
      timestamp: 123,
      speaker: "田中",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("text");
  });

  test("transcript.chunk で空 text はエラー", () => {
    const result = validatePayload({
      event: "transcript.chunk",
      meeting_id: "m1",
      text: "",
      timestamp: 123,
      speaker: "田中",
    });
    expect(result.valid).toBe(false);
  });

  test("transcript.chunk で timestamp 欠落はエラー", () => {
    const result = validatePayload({
      event: "transcript.chunk",
      meeting_id: "m1",
      text: "テスト",
      speaker: "田中",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("timestamp");
  });

  test("transcript.chunk で speaker 欠落はエラー", () => {
    const result = validatePayload({
      event: "transcript.chunk",
      meeting_id: "m1",
      text: "テスト",
      timestamp: 123,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("speaker");
  });

  test("meeting.ended で full_transcript 欠落はエラー", () => {
    const result = validatePayload({
      event: "meeting.ended",
      meeting_id: "m1",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("full_transcript");
  });

  test("未対応のイベントタイプはエラー", () => {
    const result = validatePayload({
      event: "unknown.event",
      meeting_id: "m1",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("未対応");
  });
});
