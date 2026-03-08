/**
 * tl;dv Webhook受信 - Netlify Function
 *
 * POST /api/webhook/tldv
 *
 * tl;dvから送信されるWebhookイベントを処理する:
 * - transcript.chunk: 文字起こしチャンク → Haiku抽出 → DB更新
 * - meeting.ended: ミーティング終了 → 全文保存
 */

import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import type { TldvWebhookEvent } from "./lib/types.js";
import {
  processTranscriptChunk,
  resolveSessionFromMeetingId,
  saveMeetingTranscript,
} from "./lib/audio-pipeline.js";

// ============================================================
// Webhook署名検証（スタブ - 本番で有効化）
// ============================================================

/**
 * tl;dv Webhookリクエストの署名を検証する。
 * TODO: 本番環境では tl;dv の署名検証ドキュメントに従い実装する。
 *
 * @returns true if valid, false if invalid
 */
function verifyWebhookSignature(
  _request: Request,
  _body: string,
): boolean {
  // スタブ実装: 本番では以下を実装する
  // 1. X-Tldv-Signature ヘッダーを取得
  // 2. HMAC-SHA256 で署名を検証
  // 3. TLDV_WEBHOOK_SECRET 環境変数と照合
  //
  // const signature = request.headers.get("x-tldv-signature");
  // if (!signature) return false;
  // const secret = process.env["TLDV_WEBHOOK_SECRET"];
  // if (!secret) return false;
  // const hmac = crypto.createHmac("sha256", secret);
  // hmac.update(body);
  // const expected = hmac.digest("hex");
  // return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  return true;
}

// ============================================================
// バリデーション
// ============================================================

interface WebhookValidationSuccess {
  readonly valid: true;
  readonly event: TldvWebhookEvent;
}

interface WebhookValidationFailure {
  readonly valid: false;
  readonly error: string;
}

type WebhookValidationResult = WebhookValidationSuccess | WebhookValidationFailure;

function validateWebhookPayload(body: unknown): WebhookValidationResult {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "リクエストボディが空です" };
  }

  const payload = body as Record<string, unknown>;

  if (typeof payload["event"] !== "string") {
    return { valid: false, error: "event フィールドは必須です (string)" };
  }

  if (typeof payload["meeting_id"] !== "string" || payload["meeting_id"] === "") {
    return { valid: false, error: "meeting_id フィールドは必須です (string)" };
  }

  const eventType = payload["event"];

  if (eventType === "transcript.chunk") {
    if (typeof payload["text"] !== "string" || payload["text"] === "") {
      return { valid: false, error: "transcript.chunk イベントには text が必須です" };
    }
    if (typeof payload["timestamp"] !== "number") {
      return { valid: false, error: "transcript.chunk イベントには timestamp が必須です (number)" };
    }
    if (typeof payload["speaker"] !== "string") {
      return { valid: false, error: "transcript.chunk イベントには speaker が必須です (string)" };
    }
    return {
      valid: true,
      event: {
        event: "transcript.chunk",
        meeting_id: payload["meeting_id"] as string,
        text: payload["text"] as string,
        timestamp: payload["timestamp"] as number,
        speaker: payload["speaker"] as string,
      },
    };
  }

  if (eventType === "meeting.ended") {
    if (typeof payload["full_transcript"] !== "string") {
      return { valid: false, error: "meeting.ended イベントには full_transcript が必須です" };
    }
    return {
      valid: true,
      event: {
        event: "meeting.ended",
        meeting_id: payload["meeting_id"] as string,
        full_transcript: payload["full_transcript"] as string,
      },
    };
  }

  return { valid: false, error: `未対応のイベントタイプです: ${String(eventType)}` };
}

// ============================================================
// Supabase クライアント生成
// ============================================================

function createSupabaseClient(): ReturnType<typeof createClient> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL 環境変数が設定されていません");
  }
  if (!supabaseKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 環境変数が設定されていません");
  }

  return createClient(supabaseUrl, supabaseKey);
}

// ============================================================
// CORS ヘッダー
// ============================================================

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Tldv-Signature",
};

// ============================================================
// メインハンドラー
// ============================================================

export default async function handler(
  request: Request,
): Promise<Response> {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  // POST以外は拒否
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed. Use POST." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    );
  }

  try {
    // 1. リクエストボディ取得
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return new Response(
        JSON.stringify({ error: "リクエストボディの読み取りに失敗しました" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        },
      );
    }

    // 2. 署名検証
    if (!verifyWebhookSignature(request, rawBody)) {
      return new Response(
        JSON.stringify({ error: "Webhook署名が無効です" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        },
      );
    }

    // 3. JSONパース
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "リクエストボディのJSONパースに失敗しました" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        },
      );
    }

    // 4. バリデーション
    const validation = validateWebhookPayload(body);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        },
      );
    }

    const event = validation.event;
    const supabase = createSupabaseClient();

    // 5. イベント別処理
    if (event.event === "transcript.chunk") {
      console.log(`[tl;dv] transcript.chunk received: meeting=${event.meeting_id}`);

      // meeting_id から session_id を解決
      const { sessionId, chunkIndex } = await resolveSessionFromMeetingId(
        event.meeting_id,
        supabase,
      );

      // パイプライン処理
      const result = await processTranscriptChunk(
        sessionId,
        event.text,
        chunkIndex,
        supabase,
        {
          speaker: event.speaker,
          timestamp: event.timestamp,
        },
      );

      return new Response(
        JSON.stringify({
          success: true,
          session_id: sessionId,
          version: result.version,
          fields_updated: result.fields_updated,
          readiness: result.readiness,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        },
      );
    }

    if (event.event === "meeting.ended") {
      console.log(`[tl;dv] meeting.ended received: meeting=${event.meeting_id}`);

      await saveMeetingTranscript(
        event.meeting_id,
        event.full_transcript,
        supabase,
      );

      return new Response(
        JSON.stringify({
          success: true,
          meeting_id: event.meeting_id,
          status: "completed",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        },
      );
    }

    // 到達不能（バリデーション済み）
    return new Response(
      JSON.stringify({ error: "未対応のイベントです" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    );
  } catch (error) {
    console.error("[tl;dv] Webhookエラー:", error);
    return new Response(
      JSON.stringify({
        error: "Webhook処理中にエラーが発生しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    );
  }
}

// Netlify Functions v2 config
export const config: Config = {
  path: "/api/webhook/tldv",
  method: ["POST", "OPTIONS"],
};
