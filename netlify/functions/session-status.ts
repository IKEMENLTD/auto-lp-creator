/**
 * セッション状態確認API - Netlify Function (軽量)
 *
 * GET /api/session-status?session_id=xxx
 *
 * 現在はスタブ実装。将来的にSupabaseと連携して
 * セッション状態を管理する。
 */

import type { Config } from "@netlify/functions";
import type { SessionStatusResponse } from "./lib/types.js";

// ============================================================
// バリデーション
// ============================================================

function extractSessionId(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("session_id");
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
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // GET以外は拒否
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed. Use GET." }),
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
        JSON.stringify({ error: "session_id クエリパラメータは必須です" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // TODO: Supabase からセッション状態を取得する
    // 現在はスタブ実装: extracted_dataが存在すればLP生成可能とみなす
    //
    // 将来の実装:
    // const supabaseUrl = process.env["SUPABASE_URL"];
    // const supabaseKey = process.env["SUPABASE_ANON_KEY"];
    // if (!supabaseUrl || !supabaseKey) {
    //   throw new Error("Supabase環境変数が未設定です");
    // }
    // const { createClient } = await import("@supabase/supabase-js");
    // const supabase = createClient(supabaseUrl, supabaseKey);
    // const { data, error } = await supabase
    //   .from("sessions")
    //   .select("*")
    //   .eq("session_id", sessionId)
    //   .single();

    const response: SessionStatusResponse = {
      status: "pending",
      session_id: sessionId,
      extracted_fields: [],
      generation_ready: {
        lp: false,
        ad: false,
        email: false,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("セッション状態取得エラー:", error);
    return new Response(
      JSON.stringify({
        error: "セッション状態の取得に失敗しました",
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
  path: "/api/session-status",
  method: ["GET", "OPTIONS"],
};
