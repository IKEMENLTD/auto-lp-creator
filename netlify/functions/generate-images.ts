/**
 * 画像生成API - Netlify Function
 *
 * POST /api/generate-images
 *
 * LPのセクションに合わせた画像をGemini Imagenで生成し、
 * Netlify Blobsに保存、HTMLを更新する。
 *
 * タイムアウト対策: 1回の呼び出しで最大3枚まで並列生成
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// 定数
// ============================================================

/** Gemini API ベースURL */
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** 1回のリクエストで生成する最大画像数 */
const MAX_IMAGES_PER_REQUEST = 3;

/** Gemini API タイムアウト (ms) */
const GEMINI_TIMEOUT_MS = 20_000;

/** Haiku API タイムアウト (ms) */
const HAIKU_TIMEOUT_MS = 15_000;

/** CORS ヘッダー */
const CORS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ============================================================
// 型定義
// ============================================================

interface ImageRequest {
  readonly session_id: string;
  readonly type: string;
  readonly sections: readonly SectionImageRequest[];
  readonly color_primary: string;
  readonly industry: string;
  readonly service_name: string;
  readonly company_name: string;
}

interface SectionImageRequest {
  readonly section: string;
  readonly context: string;
}

interface GeminiPrediction {
  readonly bytesBase64Encoded: string;
  readonly mimeType: string;
}

interface GeminiResponse {
  readonly predictions?: readonly GeminiPrediction[];
}

interface ImageGenerateSuccessResponse {
  readonly success: true;
  readonly images: Readonly<Record<string, string>>;
  readonly count: number;
  readonly message?: string;
}

interface ImageGenerateErrorResponse {
  readonly success: false;
  readonly error: string;
}

type ImageGenerateResponse = ImageGenerateSuccessResponse | ImageGenerateErrorResponse;

// ============================================================
// Step 1: Haikuで画像プロンプト一括生成
// ============================================================

export async function generateImagePrompts(
  sections: readonly SectionImageRequest[],
  industry: string,
  serviceName: string,
  colorPrimary: string,
  apiKey: string,
): Promise<Record<string, string>> {
  const client = new Anthropic({ apiKey });

  const sectionList = sections
    .map((s) => `- ${s.section}: ${s.context.slice(0, 200)}`)
    .join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);

  try {
    const res = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `You generate optimized image prompts for Gemini Imagen API.
Rules:
- Output in English only
- Each prompt: 60-100 words
- NEVER include text/letters/words/numbers in images
- Style: clean, modern, professional, Japanese business context
- Color harmony with ${colorPrimary}
- Industry: ${industry}, Service: ${serviceName}
- For "hero": wide landscape 16:9, abstract/conceptual
- For "about": service concept visualization
- For "reason*": specific benefit illustration
- For "badge": abstract trust/achievement symbol (circular, medal-like)

Output JSON only: {"section_name": "prompt", ...}`,
        messages: [
          {
            role: "user",
            content: `Generate image prompts for these LP sections:\n${sectionList}`,
          },
        ],
      },
      { signal: controller.signal },
    );

    const block = res.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Haiku応答なし");
    }

    let text = block.text.trim();
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock?.[1]) {
      text = codeBlock[1].trim();
    }

    return JSON.parse(text) as Record<string, string>;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Step 2: Gemini Imagenで画像生成
// ============================================================

export async function generateImage(
  prompt: string,
  geminiKey: string,
  aspectRatio: string = "16:9",
): Promise<string> {
  const url = `${GEMINI_API_BASE}/models/imagen-3.0-generate-002:predict?key=${geminiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio,
          safetyFilterLevel: "block_few",
          personGeneration: "dont_allow",
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[generate-images] Gemini error:", res.status, err);
      throw new Error(`Gemini API error: ${res.status}`);
    }

    const data = (await res.json()) as GeminiResponse;

    if (!data.predictions?.[0]?.bytesBase64Encoded) {
      throw new Error("Gemini画像生成結果なし");
    }

    return data.predictions[0].bytesBase64Encoded;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Step 3: 画像をBlobに保存してURLを返す
// ============================================================

export async function saveImageToBlob(
  sessionId: string,
  sectionName: string,
  base64Data: string,
): Promise<string> {
  const store = getStore("images");
  const key = `${sessionId}/${sectionName}.webp`;

  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const buffer: ArrayBuffer = bytes.buffer as ArrayBuffer;

  await store.set(key, buffer, {
    metadata: {
      contentType: "image/webp",
      sessionId,
      section: sectionName,
      createdAt: new Date().toISOString(),
    },
  });

  return `/.netlify/blobs/images/${key}`;
}

// ============================================================
// Step 4: 既存HTMLの画像URL更新
// ============================================================

export function updateHtmlWithImages(
  html: string,
  imageResults: Readonly<Record<string, string>>,
): string {
  let updatedHtml = html;

  // ヒーロー画像の差し替え: fvセクションのbackground-imageを更新
  if (imageResults["hero"]) {
    const heroUrl = imageResults["hero"];
    // 既に style= がある場合は background-image を差し替え
    const stylePattern = /(<section\s+class="fv"[^>]*?)style="([^"]*background-image:[^"]*)"([^>]*>)/;
    const styleMatch = stylePattern.exec(updatedHtml);
    if (styleMatch) {
      const prefix = styleMatch[1] ?? "";
      const suffix = styleMatch[3] ?? "";
      updatedHtml = updatedHtml.replace(
        stylePattern,
        `${prefix}style="background-image:url('${heroUrl}')"${suffix}`,
      );
    } else {
      // style属性がない場合は追加
      updatedHtml = updatedHtml.replace(
        /(<section\s+class="fv")([^>]*>)/,
        `$1 style="background-image:url('${heroUrl}')"$2`,
      );
    }
  }

  // data-img属性で画像スロットを識別して差し替え
  for (const [section, url] of Object.entries(imageResults)) {
    if (section === "hero") continue;
    // data-img="section_name" の要素にbackground-imageを設定
    const imgPattern = new RegExp(
      `(data-img="${section}"[^>]*?)style="([^"]*)"`,
      "g",
    );
    if (imgPattern.test(updatedHtml)) {
      // リセットしてreplace
      imgPattern.lastIndex = 0;
      updatedHtml = updatedHtml.replace(
        imgPattern,
        `$1style="$2;background-image:url('${url}')"`,
      );
    } else {
      // style属性がない場合
      const noStylePattern = new RegExp(
        `(data-img="${section}")`,
        "g",
      );
      updatedHtml = updatedHtml.replace(
        noStylePattern,
        `$1 style="background-image:url('${url}')"`,
      );
    }
  }

  return updatedHtml;
}

// ============================================================
// レート制限
// ============================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5; // 画像生成は重いので1分5回まで

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// ============================================================
// メインハンドラ
// ============================================================

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "POST only" } satisfies { error: string }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...CORS },
      },
    );
  }

  try {
    const body = (await request.json()) as ImageRequest;

    if (!body.session_id || !body.sections?.length) {
      return new Response(
        JSON.stringify({
          error: "session_id, sections必須",
        } satisfies { error: string }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS },
        },
      );
    }

    // レート制限
    if (!checkRateLimit(body.session_id)) {
      return new Response(
        JSON.stringify({ error: "リクエスト頻度が高すぎます" } satisfies { error: string }),
        { status: 429, headers: { "Content-Type": "application/json", ...CORS } },
      );
    }

    const anthropicKey = process.env["ANTHROPIC_API_KEY"];
    const geminiKey = process.env["GOOGLE_API_KEY"];

    if (!anthropicKey) {
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_API_KEY未設定",
        } satisfies { error: string }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS },
        },
      );
    }

    if (!geminiKey) {
      const skipResponse: ImageGenerateSuccessResponse = {
        success: true,
        images: {},
        count: 0,
        message: "GOOGLE_API_KEY未設定のためスキップ",
      };
      return new Response(JSON.stringify(skipResponse), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // 最大3セクションに制限（タイムアウト対策）
    const targetSections = body.sections.slice(0, MAX_IMAGES_PER_REQUEST);

    console.log(
      `[generate-images] Generating ${targetSections.length} images for session ${body.session_id}`,
    );

    // Step 1: Haikuでプロンプト生成
    const prompts = await generateImagePrompts(
      targetSections,
      body.industry,
      body.service_name,
      body.color_primary,
      anthropicKey,
    );

    console.log(
      `[generate-images] Generated ${Object.keys(prompts).length} prompts`,
    );

    // Step 2: Geminiで画像生成（並列）
    const imageResults: Record<string, string> = {};
    const generatePromises = targetSections.map(async (sec) => {
      const prompt = prompts[sec.section];
      if (!prompt) return;

      try {
        const aspectRatio = sec.section === "hero" ? "16:9" : "1:1";
        const base64 = await generateImage(prompt, geminiKey, aspectRatio);

        // Blobに保存
        const url = await saveImageToBlob(
          body.session_id,
          sec.section,
          base64,
        );
        imageResults[sec.section] = url;

        console.log(`[generate-images] Generated: ${sec.section}`);
      } catch (err) {
        console.error(`[generate-images] Failed: ${sec.section}`, err);
        // 個別の失敗は無視（他の画像は返す）
      }
    });

    await Promise.all(generatePromises);

    // Step 3: 既存HTMLを更新（画像URLを埋め込む）
    if (Object.keys(imageResults).length > 0) {
      try {
        const store = getStore("deliverables");
        const blobKey = `${body.session_id}/${body.type || "lp"}`;
        const existingHtml = await store.get(blobKey, { type: "text" });

        if (existingHtml) {
          const updatedHtml = updateHtmlWithImages(existingHtml, imageResults);

          await store.set(blobKey, updatedHtml, {
            metadata: {
              type: body.type || "lp",
              sessionId: body.session_id,
              updatedAt: new Date().toISOString(),
              hasImages: "true",
            },
          });
        }
      } catch (err) {
        console.error("[generate-images] HTML update failed:", err);
        // HTML更新失敗は致命的ではない（画像URLは返す）
      }
    }

    const response: ImageGenerateSuccessResponse = {
      success: true,
      images: imageResults,
      count: Object.keys(imageResults).length,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "画像生成に失敗しました";
    console.error("[generate-images] Error:", msg);

    const errorResponse: ImageGenerateErrorResponse = {
      success: false,
      error: msg,
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
}

export const config: Config = {
  path: "/api/generate-images",
  method: ["POST", "OPTIONS"],
};
