/**
 * 画像生成API - Netlify Background Function
 *
 * POST /api/generate-images
 *
 * Background Function: 即座に202を返し、Gemini Flashで画像生成。
 * 各セクションに個別プロンプトでコンテキストに合った画像を生成。
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// ============================================================
// 定数
// ============================================================

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash-image";
const MAX_IMAGES_PER_REQUEST = 10;
const GEMINI_TIMEOUT_MS = 30_000;

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
  readonly prompt_hint?: string;
}

interface GeminiFlashResponse {
  readonly candidates?: readonly {
    readonly content?: {
      readonly parts?: readonly {
        readonly text?: string;
        readonly inlineData?: {
          readonly mimeType: string;
          readonly data: string;
        };
      }[];
    };
  }[];
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
// Gemini Flash 画像生成
// ============================================================

async function generateImageWithFlash(prompt: string, geminiKey: string, aspectRatio: string = "16:9"): Promise<string> {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[images-bg] Gemini Flash error:", res.status, err);
      throw new Error(`Gemini Flash API error: ${res.status}`);
    }

    const data = (await res.json()) as GeminiFlashResponse;
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("Gemini Flash: レスポンスにpartsなし");

    const imagePart = parts.find(p => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) throw new Error("Gemini Flash: 画像データなし");

    return imagePart.inlineData.data;
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

  // heroはfvセクションのbackground-imageを差し替え
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

  // その他セクション: data-img属性を持つimgタグのsrcを差し替え
  for (const [section, url] of Object.entries(imageResults)) {
    if (section === "hero") continue;
    // data-img="section名" を含むimgタグのsrc属性を置換
    const srcPattern = new RegExp(`(<img[^>]*data-img="${section}"[^>]*?)src="[^"]*"`, "g");
    if (srcPattern.test(updatedHtml)) {
      srcPattern.lastIndex = 0;
      updatedHtml = updatedHtml.replace(srcPattern, `$1src="${url}"`);
      // display:noneが付いていたら除去（mockupフォールバック時の非表示imgを表示に）
      const displayPattern = new RegExp(`(<img[^>]*data-img="${section}"[^>]*?)style="display:none"`, "g");
      updatedHtml = updatedHtml.replace(displayPattern, `$1style=""`);
    }
  }

  return updatedHtml;
}

// ============================================================
// セクション別プロンプト生成
// ============================================================

function buildImagePrompt(section: string, context: string, industry: string, serviceName: string, hint?: string): string {
  const base = `Professional photograph, high quality, clean composition, no text or letters in image, Japanese business context, ${industry} industry.`;

  const sectionPrompts: Record<string, string> = {
    hero: `Wide landscape hero image. Abstract, modern, professional. Represents "${serviceName}" - ${context}. Bright, aspirational, corporate feel. ${base}`,
    about: `Service concept visualization. Shows the value proposition of "${serviceName}". ${context}. Clean, modern design. ${base}`,
    reason1: `Business success and trust. Professional team collaboration, reliability. ${context}. ${base}`,
    reason2: `Innovation and expertise. Modern technology, specialized knowledge. ${context}. ${base}`,
    reason3: `Customer support and partnership. Friendly professional interaction. ${context}. ${base}`,
    feature1: `Product feature visualization. Dashboard or interface mockup style. ${context}. Modern, clean UI aesthetic. ${base}`,
    feature2: `Technology and automation. Streamlined workflow, efficiency. ${context}. ${base}`,
    feature3: `Data analytics and insights. Charts, growth metrics, business intelligence. ${context}. ${base}`,
    case1: `Happy satisfied business professional. Success story, positive outcome. Client meeting with smiles. ${context}. ${base}`,
    case2: `Business achievement celebration. Team success, goal reached. Professional satisfaction. ${context}. ${base}`,
    usecase1: `Real-world business scenario. ${context}. Professional office environment. ${base}`,
    usecase2: `Practical application scene. ${context}. Modern workplace. ${base}`,
  };

  const prompt = sectionPrompts[section] || `Professional business image for ${section}. ${context}. ${base}`;
  return hint ? `${prompt} Additional context: ${hint}` : prompt;
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

    const geminiKey = process.env["GOOGLE_API_KEY"];

    if (!geminiKey) {
      console.log("[images-bg] GOOGLE_API_KEY未設定 → スキップ");
      await writeStatus(body.session_id, "completed");
      return new Response(null, { status: 202 });
    }

    await writeStatus(body.session_id, "processing");

    const targetSections = body.sections.slice(0, MAX_IMAGES_PER_REQUEST);

    console.log(`[images-bg] Generating ${targetSections.length} images with Gemini Flash for session ${body.session_id}`);

    // 画像生成（並列、最大3つずつバッチ処理でレート制限対策）
    const imageResults: Record<string, string> = {};
    const BATCH_SIZE = 3;

    for (let batchStart = 0; batchStart < targetSections.length; batchStart += BATCH_SIZE) {
      const batch = targetSections.slice(batchStart, batchStart + BATCH_SIZE);

      const batchPromises = batch.map(async (sec) => {
        const prompt = buildImagePrompt(sec.section, sec.context, body.industry, body.service_name, sec.prompt_hint);

        try {
          const aspectRatio = sec.section === "hero" ? "16:9" : "3:4";
          const base64 = await generateImageWithFlash(prompt, geminiKey, aspectRatio);
          const url = await saveImageToBlob(body.session_id, sec.section, base64);
          imageResults[sec.section] = url;
          console.log(`[images-bg] Generated: ${sec.section}`);
        } catch (err) {
          console.warn(`[images-bg] Failed: ${sec.section}`, err);
        }
      });

      await Promise.all(batchPromises);

      // バッチ間に1秒待機（レート制限対策）
      if (batchStart + BATCH_SIZE < targetSections.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`[images-bg] Generated ${Object.keys(imageResults).length}/${targetSections.length} images`);

    // 既存HTMLを更新
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
    } catch (statusErr) {
      console.warn("[images-bg] Failed to write error status:", statusErr);
    }
  }

  return new Response(null, { status: 202 });
}

export const config: Config = {
  path: "/api/generate-images",
  method: ["POST", "OPTIONS"],
};
