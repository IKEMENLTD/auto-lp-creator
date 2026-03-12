/**
 * セッション終了API - Netlify Function (軽量)
 *
 * POST /api/session/:session_id/end
 *
 * セッションを終了する。現在はスタブ実装。
 * 将来的にSupabaseでセッション状態を更新する。
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
// バリデーション
// ============================================================

function extractSessionId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/api\/session\/([^/]+)\/end/);
    return match?.[1] ?? null;
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
    const sessionId = extractSessionId(request.url);

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "session_id パスパラメータは必須です" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // TODO: 将来的にSupabaseでセッション状態を「ended」に更新する

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (error) {
    console.error("セッション終了エラー:", error);
    return new Response(
      JSON.stringify({
        error: "セッションの終了に失敗しました",
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
  path: "/api/session/:session_id/end",
  method: ["POST", "OPTIONS"],
};
