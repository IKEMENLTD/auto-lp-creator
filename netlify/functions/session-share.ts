/**
 * セッション共有API - Netlify Function (軽量)
 *
 * POST /api/session/:session_id/share
 *
 * セッションを共有する。現在はスタブ実装。
 * 将来的にSupabaseで共有リンクを生成する。
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
    const match = parsed.pathname.match(/\/api\/session\/([^/]+)\/share/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// 型定義
// ============================================================

interface ShareRequest {
  method?: string;
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

    // ボディから共有方法を取得（任意）
    let shareMethod = "link";
    try {
      const body = (await request.json()) as ShareRequest;
      if (body.method) {
        shareMethod = body.method;
      }
    } catch {
      // ボディなしでもOK
    }

    // TODO: 将来的にSupabaseで共有リンクを生成・保存する

    return new Response(
      JSON.stringify({
        success: true,
        shared_count: 0,
        method: shareMethod,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (error) {
    console.error("セッション共有エラー:", error);
    return new Response(
      JSON.stringify({
        error: "セッションの共有に失敗しました",
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
  path: "/api/session/:session_id/share",
  method: ["POST", "OPTIONS"],
};
