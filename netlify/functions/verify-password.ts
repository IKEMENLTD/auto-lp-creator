/**
 * パスワード検証API
 *
 * POST /api/verify-password
 * body: { password: string }
 *
 * 環境変数 APP_PASSWORD と照合。
 */

import type { Config } from "@netlify/functions";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "POST only" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  try {
    const appPassword = process.env["APP_PASSWORD"];
    if (!appPassword) {
      // パスワード未設定 = 認証なしで通す
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const body = (await request.json()) as { password?: string };
    const input = body.password?.trim() ?? "";

    if (input === appPassword) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "パスワードが正しくありません" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "検証エラー" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
}

export const config: Config = {
  path: "/api/verify-password",
  method: ["POST", "OPTIONS"],
};
