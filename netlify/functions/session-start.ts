/**
 * セッション開始API - Netlify Function (軽量)
 *
 * POST /api/session/start
 *
 * Supabaseにセッションレコードを作成し、生成されたIDを返す。
 * Supabase未設定・障害時はローカルUUIDで続行（フォールバック）。
 */

import type { Config } from "@netlify/functions";
import { randomUUID } from "node:crypto";
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
    let sessionId: string;

    // Supabaseにセッション作成を試みる
    try {
      const { createSession, ANONYMOUS_USER_ID } = await import("./lib/supabase.js");
      const session = await createSession(ANONYMOUS_USER_ID);
      sessionId = session.id;
      console.log(`[session-start] Supabase session created: ${sessionId}`);
    } catch (err) {
      // Supabase障害時はローカルUUIDで続行
      sessionId = randomUUID();
      console.warn(`[session-start] Supabase unavailable, using local UUID: ${sessionId}`, err);
    }

    return new Response(
      JSON.stringify({ session_id: sessionId }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("セッション開始エラー:", error);
    return new Response(
      JSON.stringify({
        error: "セッションの開始に失敗しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
}

export const config: Config = {
  path: "/api/session/start",
  method: ["POST", "OPTIONS"],
};
