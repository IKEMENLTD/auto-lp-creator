/**
 * 画像配信API - Netlify Function
 *
 * GET /api/images/:session_id/:section
 *
 * Netlify BlobsからAI生成画像を取得して配信。
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/images\/([^/]+)\/([^/]+)$/);

    if (!match?.[1] || !match?.[2]) {
      return new Response("Not Found", { status: 404 });
    }

    const sessionId = decodeURIComponent(match[1]);
    const section = decodeURIComponent(match[2]);
    const blobKey = `${sessionId}/${section}`;

    const store = getStore("ai-images");
    const data = await store.get(blobKey, { type: "arrayBuffer" });

    if (!data) {
      return new Response("Image not found", { status: 404 });
    }

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[serve-image] error:", error);
    return new Response("Image not found", { status: 404 });
  }
}

export const config: Config = {
  path: "/api/images/:session_id/:section",
  method: ["GET"],
};
