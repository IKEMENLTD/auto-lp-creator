/**
 * フォーム送信受付API - Netlify Function
 *
 * POST /api/form-submit
 *
 * ヒアリングフォームの回答をSupabaseに保存する。
 * 認証不要（公開フォーム用）。
 */

import type { Config } from "@netlify/functions";

// ============================================================
// CORSヘッダー
// ============================================================

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let formData: Record<string, unknown>;

    if (contentType.includes("application/json")) {
      formData = (await request.json()) as Record<string, unknown>;
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      // HTMLフォームのネイティブ送信
      const fd = await request.formData();
      formData = {};
      for (const [key, value] of fd.entries()) {
        formData[key] = value;
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Content-Type must be application/json or form data" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const sessionId = (formData["session_id"] as string) || "unknown";

    // Supabaseに保存
    try {
      const { logAnalytics } = await import("./lib/supabase.js");
      await logAnalytics(sessionId, "form_submission", {
        submitted_at: new Date().toISOString(),
        answers: formData as never,
      });
      console.log(`[form-submit] Saved form submission for session ${sessionId}`);
    } catch (err) {
      console.warn("[form-submit] Supabase save failed:", err);
    }

    // 送信完了ページを返す
    const thankYouHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>送信完了</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans JP',sans-serif;background:#f8f9fa;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{background:#fff;border-radius:16px;padding:48px 32px;text-align:center;max-width:480px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
.icon{font-size:48px;margin-bottom:16px}
h1{font-size:24px;color:#333;margin-bottom:12px}
p{font-size:15px;color:#666;line-height:1.7}
</style>
</head>
<body>
<div class="card">
<div class="icon">&#10004;&#65039;</div>
<h1>送信が完了しました</h1>
<p>ご回答ありがとうございます。<br>内容を確認の上、担当者よりご連絡いたします。</p>
</div>
</body>
</html>`;

    return new Response(thankYouHtml, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
    });
  } catch (error) {
    console.error("[form-submit] Error:", error);
    return new Response(
      JSON.stringify({
        error: "フォーム送信に失敗しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
}

export const config: Config = {
  path: "/api/form-submit",
  method: ["POST", "OPTIONS"],
};
