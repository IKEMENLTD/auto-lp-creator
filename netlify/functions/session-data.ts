/**
 * セッションデータ更新API - Netlify Function (軽量)
 *
 * PATCH /api/session/:session_id/data
 *
 * セッションのフィールドを部分更新する。現在はスタブ実装。
 * 将来的にSupabaseでセッションデータを更新する。
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

function extractSessionId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/api\/session\/([^/]+)\/data/);
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

  // PATCH以外は拒否
  if (request.method !== "PATCH") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed. Use PATCH." }),
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

    // ボディのパース（フィールド更新内容）
    const body = (await request.json()) as Record<string, unknown>;

    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return new Response(
        JSON.stringify({ error: "更新フィールドを含むJSONボディは必須です" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // TODO: 将来的にSupabaseでセッションデータを部分更新する

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
    console.error("セッションデータ更新エラー:", error);
    return new Response(
      JSON.stringify({
        error: "セッションデータの更新に失敗しました",
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
  path: "/api/session/:session_id/data",
  method: ["PATCH", "OPTIONS"],
};
