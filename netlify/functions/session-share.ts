/**
 * セッション共有API - Netlify Function (軽量)
 *
 * POST /api/session/:session_id/share
 *
 * 共有イベントをSupabase analyticsに記録する。
 * Supabase障害時は成功応答で続行。
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
    const sessionId = extractSessionId(request.url);

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "session_id パスパラメータは必須です" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    let shareMethod = "link";
    try {
      const body = (await request.json()) as ShareRequest;
      if (body.method) {
        shareMethod = body.method;
      }
    } catch {
      // ボディなしでもOK
    }

    // Supabaseに共有イベントを記録
    let sharedCount = 0;
    try {
      const { logAnalytics, getSupabaseClient } = await import("./lib/supabase.js");

      await logAnalytics(sessionId, 'share', {
        method: shareMethod,
        shared_at: new Date().toISOString(),
      });

      // 同セッションの共有回数を取得
      const client = getSupabaseClient();
      const { count } = await client
        .from('analytics')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('event', 'share');

      sharedCount = count ?? 1;
      console.log(`[session-share] Shared session ${sessionId} via ${shareMethod} (total: ${sharedCount})`);
    } catch (err) {
      console.warn("[session-share] Supabase unavailable (continuing):", err);
    }

    return new Response(
      JSON.stringify({
        success: true,
        shared_count: sharedCount,
        method: shareMethod,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("セッション共有エラー:", error);
    return new Response(
      JSON.stringify({
        error: "セッションの共有に失敗しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
}

export const config: Config = {
  path: "/api/session/:session_id/share",
  method: ["POST", "OPTIONS"],
};
