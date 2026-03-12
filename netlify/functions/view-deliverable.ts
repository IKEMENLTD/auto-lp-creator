/**
 * 制作物表示API - Netlify Function
 *
 * GET /view/:session_id/:type
 *
 * Netlify Blobsから保存済みHTMLを取得して配信。
 * この URL は共有可能な永続URL。
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/view\/([^/]+)\/([^/]+)$/);

    if (!match?.[1] || !match?.[2]) {
      return new Response("Not Found", { status: 404 });
    }

    const sessionId = decodeURIComponent(match[1]);
    const type = decodeURIComponent(match[2]);
    const blobKey = `${sessionId}/${type}`;

    const store = getStore("deliverables");
    const html = await store.get(blobKey, { type: "text" });

    if (!html) {
      return new Response(
        `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not Found</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff">
<div style="text-align:center"><h1>404</h1><p>この制作物は見つかりませんでした</p><p style="color:#666;font-size:14px">URLが正しいか、制作物が生成済みか確認してください</p></div>
</body></html>`,
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[view] error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export const config: Config = {
  path: "/view/:session_id/:type",
  method: ["GET"],
};
