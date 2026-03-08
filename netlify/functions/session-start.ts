/**
 * セッション開始API - Netlify Function (軽量)
 *
 * POST /api/session/start
 *
 * UUIDを生成してセッションIDを返す。
 * セッション状態はクライアント側で管理。
 */

import type { Config } from "@netlify/functions";

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
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // POST以外は拒否
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed. Use POST." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const sessionId = crypto.randomUUID();

    // TODO: 将来的にSupabaseへセッションレコードを作成する

    return new Response(
      JSON.stringify({ session_id: sessionId }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (error) {
    console.error("セッション開始エラー:", error);
    return new Response(
      JSON.stringify({
        error: "セッションの開始に失敗しました",
        details:
          error instanceof Error ? error.message : "不明なエラー",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// Netlify Functions v2 config
export const config: Config = {
  path: "/api/session/start",
  method: ["POST", "OPTIONS"],
};
