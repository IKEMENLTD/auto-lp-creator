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

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const SECTION_RE = /^[a-z0-9_-]{1,50}$/;
    if (!UUID_RE.test(sessionId) || !SECTION_RE.test(section)) {
      return new Response("Not Found", { status: 404 });
    }

    const blobKey = `${sessionId}/${section}`;

    const store = getStore("ai-images");
    const data = await store.get(blobKey, { type: "arrayBuffer" });

    if (!data) {
      return new Response("Image not found", { status: 404 });
    }

    // Gemini画像のContent-Typeを推定（先頭バイトでPNG/JPEG/WebP判定）
    const bytes = new Uint8Array(data);
    let contentType = "image/png";
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) contentType = "image/jpeg";
    else if (bytes[0] === 0x52 && bytes[1] === 0x49) contentType = "image/webp"; // "RI" = RIFF

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable",
        "Vary": "Accept",
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
