/**
 * セッション状態確認API - Netlify Function (軽量)
 *
 * GET /api/session-status?session_id=xxx
 *
 * Supabaseからセッション状態・抽出データ・ジョブ状態を取得して返す。
 * Supabase障害時はスタブ応答で続行（フロント側localStorageが主）。
 */

import type { Config } from "@netlify/functions";
import type { SessionStatusResponse } from "./lib/types.js";

// ============================================================
// CORSヘッダー
// ============================================================

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed. Use GET." }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  try {
    const sessionId = extractSessionId(request.url);

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "session_id クエリパラメータは必須です" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Supabaseからセッション情報を取得
    try {
      const { getSupabaseClient, getLatestExtraction } = await import("./lib/supabase.js");
      const client = getSupabaseClient();

      // セッション取得
      const { data: session } = await client
        .from('sessions')
        .select('id, status, started_at, ended_at')
        .eq('id', sessionId)
        .maybeSingle();

      // 抽出データ取得
      const extraction = await getLatestExtraction(sessionId);
      const extractedFields = extraction?.data_json
        ? Object.keys(extraction.data_json as Record<string, unknown>)
        : [];

      // ジョブ状態取得
      const { data: jobs } = await client
        .from('generation_jobs')
        .select('type, status')
        .eq('session_id', sessionId);

      const jobMap = new Map((jobs ?? []).map(j => [j.type, j.status]));

      const sessionStatus = session?.status === 'ended' ? 'completed' as const
        : extractedFields.length > 0 ? 'processing' as const
        : 'pending' as const;

      const response: SessionStatusResponse = {
        status: sessionStatus,
        session_id: sessionId,
        extracted_fields: extractedFields,
        generation_ready: {
          lp: jobMap.get('lp') === 'completed',
          ad: jobMap.get('ad_creative') === 'completed',
          email: false,
        },
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (err) {
      console.warn("[session-status] Supabase unavailable, returning stub:", err);
    }

    // Supabase障害時のフォールバック
    const response: SessionStatusResponse = {
      status: "pending",
      session_id: sessionId,
      extracted_fields: [],
      generation_ready: { lp: false, ad: false, email: false },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("セッション状態取得エラー:", error);
    return new Response(
      JSON.stringify({
        error: "セッション状態の取得に失敗しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
}

export const config: Config = {
  path: "/api/session-status",
  method: ["GET", "OPTIONS"],
};
