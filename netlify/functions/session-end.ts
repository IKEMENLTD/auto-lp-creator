/**
 * セッション終了API - Netlify Function (軽量)
 *
 * POST /api/session/:session_id/end
 *
 * Supabaseでセッション状態を「ended」に更新する。
 * Supabase障害時は成功応答で続行（フォールバック）。
 */

import type { Config } from "@netlify/functions";
import { verifyAuth } from "./lib/auth.js";

// ============================================================
// CORSヘッダー
// ============================================================

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ============================================================
// バリデーション
// ============================================================

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractSessionId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/api\/session\/([^/]+)\/end/);
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

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed. Use POST." }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  const authError = verifyAuth(request, corsHeaders);
  if (authError) return authError;

  try {
    const sessionId = extractSessionId(request.url);

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "session_id パスパラメータは必須です" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Supabaseでセッション状態を更新
    try {
      const { getSupabaseClient } = await import("./lib/supabase.js");
      const client = getSupabaseClient();
      const { error } = await client
        .from('sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) {
        console.warn(`[session-end] Supabase update failed: ${error.message}`);
      } else {
        console.log(`[session-end] Session ended: ${sessionId}`);
      }
    } catch (err) {
      console.warn("[session-end] Supabase unavailable (continuing):", err);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("セッション終了エラー:", error);
    return new Response(
      JSON.stringify({
        error: "セッションの終了に失敗しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
}

export const config: Config = {
  path: "/api/session/:session_id/end",
  method: ["POST", "OPTIONS"],
};
