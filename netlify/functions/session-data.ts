/**
 * セッションデータ更新API - Netlify Function (軽量)
 *
 * PATCH /api/session/:session_id/data
 *
 * 手動編集されたフィールドをSupabaseのextracted_dataにマージ保存する。
 * Supabase障害時は成功応答で続行（フロント側localStorageが主）。
 */

import type { Config } from "@netlify/functions";

// ============================================================
// CORSヘッダー
// ============================================================

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ============================================================
// バリデーション
// ============================================================

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractSessionId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/api\/session\/([^/]+)\/data/);
    const id = match?.[1] ?? null;
    if (id && !SESSION_ID_RE.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}

// ============================================================
// メインハンドラー
// ============================================================

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "PATCH") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed. Use PATCH." }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  try {
    const sessionId = extractSessionId(request.url);

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "session_id パスパラメータは必須です" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return new Response(
        JSON.stringify({ error: "更新フィールドを含むJSONボディは必須です" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Supabaseのextracted_dataを更新
    let supabaseWarning: string | null = null;
    try {
      const { getLatestExtraction, updateExtraction } = await import("./lib/supabase.js");
      const existing = await getLatestExtraction(sessionId);

      if (existing) {
        // 既存データとマージ（手動編集フィールドをconfidence: 1.0で上書き）
        const currentData = (existing.data_json ?? {}) as Record<string, unknown>;
        const mergedData = { ...currentData };

        for (const [key, value] of Object.entries(body)) {
          mergedData[key] = { value, confidence: 1.0 };
        }

        await updateExtraction(sessionId, mergedData as never, existing.version + 1);
        console.log(`[session-data] Updated ${Object.keys(body).length} fields for session ${sessionId}`);
      } else {
        // extracted_dataが存在しない場合は新規作成
        const newData: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(body)) {
          newData[key] = { value, confidence: 1.0 };
        }
        await updateExtraction(sessionId, newData as never, 1);
        console.log(`[session-data] Created extracted_data for session ${sessionId}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "不明なエラー";
      console.warn("[session-data] Supabase update failed (continuing):", err);
      supabaseWarning = `サーバー側の保存に失敗しました: ${errMsg}`;
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...(supabaseWarning ? { warning: supabaseWarning, persisted: false } : { persisted: true }),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("セッションデータ更新エラー:", error);
    return new Response(
      JSON.stringify({
        error: "セッションデータの更新に失敗しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
}

export const config: Config = {
  path: "/api/session/:session_id/data",
  method: ["PATCH", "OPTIONS"],
};
