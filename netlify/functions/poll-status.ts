/**
 * ジョブステータスポーリングAPI - Netlify Function (軽量・同期)
 *
 * GET /api/poll-status?session_id=X&type=Y
 *
 * Background Functionの処理結果をBlobsから読み取って返す。
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// ============================================================
// 型定義
// ============================================================

interface JobStatus {
  status: "processing" | "completed" | "failed";
  error?: string;
  step?: string;
  updatedAt: string;
}

// ============================================================
// CORSヘッダー
// ============================================================

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ============================================================
// メインハンドラー
// ============================================================

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "GET only" }),
      { status: 405, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }

  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id");
    const type = url.searchParams.get("type");

    if (!sessionId || !type) {
      return new Response(
        JSON.stringify({ error: "session_id と type は必須です" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS } },
      );
    }

    const statusStore = getStore("job-status");
    const statusKey = `status/${sessionId}/${type}`;

    // ステータスBlob読み取り
    const statusRaw = await statusStore.get(statusKey, { type: "text" });

    if (!statusRaw) {
      return new Response(
        JSON.stringify({ status: "unknown" }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
      );
    }

    const jobStatus = JSON.parse(statusRaw) as JobStatus;

    // 完了時: typeに応じて結果データも返す
    if (jobStatus.status === "completed") {
      const resultStore = getStore("job-results");
      const resultKey = `result/${sessionId}/${type}`;
      const resultRaw = await resultStore.get(resultKey, { type: "text" });

      let data: unknown = undefined;
      if (resultRaw) {
        try {
          data = JSON.parse(resultRaw);
        } catch {
          // パース失敗は無視
        }
      }

      // 制作物タイプの場合はview_urlを返す
      const deliverableTypes = new Set(["lp", "ad_creative", "flyer", "hearing_form", "line_design", "minutes", "profile", "system_proposal", "proposal"]);
      const viewUrl = deliverableTypes.has(type)
        ? `/view/${encodeURIComponent(sessionId)}/${encodeURIComponent(type)}`
        : undefined;

      return new Response(
        JSON.stringify({
          status: "completed",
          data,
          view_url: viewUrl,
          updatedAt: jobStatus.updatedAt,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
      );
    }

    // processing / failed
    return new Response(
      JSON.stringify({
        status: jobStatus.status,
        step: jobStatus.step,
        error: jobStatus.error,
        updatedAt: jobStatus.updatedAt,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
    );
  } catch (error) {
    console.error("[poll-status] error:", error);
    return new Response(
      JSON.stringify({ error: "ステータス取得エラー" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
}

export const config: Config = {
  path: "/api/poll-status",
  method: ["GET", "OPTIONS"],
};
