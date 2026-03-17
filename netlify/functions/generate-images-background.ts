/**
 * 画像生成API - Netlify Background Function
 *
 * POST /api/generate-images
 *
 * Background Function: 即座に202を返し、裏でHaiku+Gemini Imagenで画像生成。
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// 定数
// ============================================================

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_IMAGES_PER_REQUEST = 3;
const GEMINI_TIMEOUT_MS = 20_000;
const HAIKU_TIMEOUT_MS = 15_000;

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

// ============================================================
// ステータスBlob書き込み
// ============================================================

async function writeStatus(sessionId: string, status: string, extra?: Record<string, string>): Promise<void> {
  try {
    const store = getStore("job-status");
    const key = `status/${sessionId}/images`;
    await store.set(key, JSON.stringify({ status, updatedAt: new Date().toISOString(), ...extra }));
  } catch (err) {
    console.warn("[images-bg] status write failed:", err);
  }
}

// ============================================================
// Haikuで画像プロンプト生成
// ============================================================

async function generateImagePrompts(
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
        messages: [{ role: "user", content: `Generate image prompts for these LP sections:\n${sectionList}` }],
      },
      { signal: controller.signal },
    );

    const block = res.content[0];
    if (!block || block.type !== "text") throw new Error("Haiku応答なし");

    let text = block.text.trim();
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock?.[1]) text = codeBlock[1].trim();

    return JSON.parse(text) as Record<string, string>;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Gemini Imagenで画像生成
// ============================================================

async function generateImage(prompt: string, geminiKey: string, aspectRatio: string = "16:9"): Promise<string> {
  const url = `${GEMINI_API_BASE}/models/imagen-3.0-generate-002:predict?key=${geminiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio, safetyFilterLevel: "block_few", personGeneration: "dont_allow" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[images-bg] Gemini error:", res.status, err);
      throw new Error(`Gemini API error: ${res.status}`);
    }

    const data = (await res.json()) as GeminiResponse;
    if (!data.predictions?.[0]?.bytesBase64Encoded) throw new Error("Gemini画像生成結果なし");

    return data.predictions[0].bytesBase64Encoded;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// 画像をBlobに保存
// ============================================================

async function saveImageToBlob(sessionId: string, sectionName: string, base64Data: string): Promise<string> {
  const store = getStore("images");
  const key = `${sessionId}/${sectionName}.webp`;

  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const buffer: ArrayBuffer = bytes.buffer as ArrayBuffer;

  await store.set(key, buffer, {
    metadata: { contentType: "image/webp", sessionId, section: sectionName, createdAt: new Date().toISOString() },
  });

  return `/.netlify/blobs/images/${key}`;
}

// ============================================================
// HTMLの画像URL更新
// ============================================================

function updateHtmlWithImages(html: string, imageResults: Readonly<Record<string, string>>): string {
  let updatedHtml = html;

  if (imageResults["hero"]) {
    const heroUrl = imageResults["hero"];
    const stylePattern = /(<section\s+class="fv"[^>]*?)style="([^"]*background-image:[^"]*)"([^>]*>)/;
    const styleMatch = stylePattern.exec(updatedHtml);
    if (styleMatch) {
      const prefix = styleMatch[1] ?? "";
      const suffix = styleMatch[3] ?? "";
      updatedHtml = updatedHtml.replace(stylePattern, `${prefix}style="background-image:url('${heroUrl}')"${suffix}`);
    } else {
      updatedHtml = updatedHtml.replace(/(<section\s+class="fv")([^>]*>)/, `$1 style="background-image:url('${heroUrl}')"$2`);
    }
  }

  for (const [section, url] of Object.entries(imageResults)) {
    if (section === "hero") continue;
    const imgPattern = new RegExp(`(data-img="${section}"[^>]*?)style="([^"]*)"`, "g");
    if (imgPattern.test(updatedHtml)) {
      imgPattern.lastIndex = 0;
      updatedHtml = updatedHtml.replace(imgPattern, `$1style="$2;background-image:url('${url}')"`);
    } else {
      const noStylePattern = new RegExp(`(data-img="${section}")`, "g");
      updatedHtml = updatedHtml.replace(noStylePattern, `$1 style="background-image:url('${url}')"`);
    }
  }

  return updatedHtml;
}

// ============================================================
// メインハンドラー（Background Function）
// ============================================================

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const body = (await request.json()) as ImageRequest;

    if (!body.session_id || !body.sections?.length) {
      console.error("[images-bg] invalid params");
      return new Response(null, { status: 202 });
    }

    const anthropicKey = process.env["ANTHROPIC_API_KEY"];
    const geminiKey = process.env["GOOGLE_API_KEY"];

    if (!anthropicKey) {
      await writeStatus(body.session_id, "failed", { error: "ANTHROPIC_API_KEY未設定" });
      return new Response(null, { status: 202 });
    }

    if (!geminiKey) {
      console.log("[images-bg] GOOGLE_API_KEY未設定 → スキップ");
      await writeStatus(body.session_id, "completed");
      return new Response(null, { status: 202 });
    }

    await writeStatus(body.session_id, "processing");

    const targetSections = body.sections.slice(0, MAX_IMAGES_PER_REQUEST);

    console.log(`[images-bg] Generating ${targetSections.length} images for session ${body.session_id}`);

    // Step 1: Haikuでプロンプト生成
    const prompts = await generateImagePrompts(targetSections, body.industry, body.service_name, body.color_primary, anthropicKey);

    // Step 2: Geminiで画像生成（並列）
    const imageResults: Record<string, string> = {};
    const generatePromises = targetSections.map(async (sec) => {
      const prompt = prompts[sec.section];
      if (!prompt) return;

      try {
        const aspectRatio = sec.section === "hero" ? "16:9" : "1:1";
        const base64 = await generateImage(prompt, geminiKey, aspectRatio);
        const url = await saveImageToBlob(body.session_id, sec.section, base64);
        imageResults[sec.section] = url;
        console.log(`[images-bg] Generated: ${sec.section}`);
      } catch (err) {
        console.error(`[images-bg] Failed: ${sec.section}`, err);
      }
    });

    await Promise.all(generatePromises);

    // Step 3: 既存HTMLを更新
    if (Object.keys(imageResults).length > 0) {
      try {
        const store = getStore("deliverables");
        const blobKey = `${body.session_id}/${body.type || "lp"}`;
        const existingHtml = await store.get(blobKey, { type: "text" });

        if (existingHtml) {
          const updatedHtml = updateHtmlWithImages(existingHtml, imageResults);
          await store.set(blobKey, updatedHtml, {
            metadata: { type: body.type || "lp", sessionId: body.session_id, updatedAt: new Date().toISOString(), hasImages: "true" },
          });
        }
      } catch (err) {
        console.error("[images-bg] HTML update failed:", err);
      }
    }

    await writeStatus(body.session_id, "completed");

  } catch (err) {
    const msg = err instanceof Error ? err.message : "画像生成に失敗しました";
    console.error("[images-bg] Error:", msg);
    try {
      const body = await request.clone().json() as ImageRequest;
      if (body.session_id) {
        await writeStatus(body.session_id, "failed", { error: msg });
      }
    } catch {
      // ignore
    }
  }

  return new Response(null, { status: 202 });
}

export const config: Config = {
  path: "/api/generate-images",
  method: ["POST", "OPTIONS"],
};
