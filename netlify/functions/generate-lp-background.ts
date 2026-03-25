/**
 * 制作物生成API - Netlify Background Function
 *
 * POST /api/generate-lp
 *
 * Background Function: 即座に202を返し、裏で最大15分実行。
 * 結果はNetlify Blobsに保存し、フロントエンドはpoll-statusでポーリング。
 *
 * LP: draft → evaluate → build を内部で一貫実行。
 * LP以外: 1ステップで生成。
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";
import type { LpContent, AdContent, MinutesContent, GenericContent } from "./lib/lp-types";
import { flatten } from "./lib/lp-types";
import { LP_DRAFT_PROMPT, LP_EVALUATE_PROMPT, GENERIC_PROMPTS, GENERIC_TITLES, bizContext, truncateTranscript } from "./lib/lp-prompts";
import { buildLpHtml, buildAdHtml, buildMinutesHtml, buildGenericHtml, selectImages, selectTheme } from "./lib/lp-builder";

// ============================================================
// 定数
// ============================================================

const LP_MODEL = "claude-sonnet-4-6";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const VALID_TYPES = new Set<string>(["lp", "ad_creative", "flyer", "hearing_form", "line_design", "minutes", "profile", "system_proposal", "proposal"]);

// ============================================================
// ステータスBlob書き込み
// ============================================================

async function clearOldStatus(sessionId: string, type: string): Promise<void> {
  try {
    const store = getStore("job-status");
    await store.delete(`status/${sessionId}/${type}`);
  } catch {
    // 削除失敗は無視
  }
}

async function writeStatus(sessionId: string, type: string, status: string, extra?: Record<string, string>): Promise<void> {
  try {
    const store = getStore("job-status");
    const key = `status/${sessionId}/${type}`;
    const data = JSON.stringify({
      status,
      updatedAt: new Date().toISOString(),
      ...extra,
    });
    await store.set(key, data);
  } catch (err) {
    console.warn("[generate-bg] status write failed:", err);
  }
}

// ============================================================
// Claude API呼び出し（既存ロジックそのまま）
// ============================================================

async function callClaudeJson<T>(system: string, user: string, apiKey: string, maxTokens = 4000, model = CLAUDE_MODEL): Promise<T> {
  const client = new Anthropic({ apiKey });

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.log(`[generate-bg] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      return await callClaudeJsonOnce<T>(client, system, user, maxTokens, model);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      const isRetryable = msg.includes('overloaded') || msg.includes('rate_limit') ||
        msg.includes('529') || msg.includes('500') || msg.includes('502') ||
        msg.includes('503') || msg.includes('timeout') || msg.includes('ECONNRESET') ||
        msg.includes('fetch failed');
      if (!isRetryable) throw lastError;
      console.warn(`[generate-bg] Retryable error (attempt ${attempt + 1}): ${msg}`);
    }
  }
  throw lastError ?? new Error('Claude API呼び出しに失敗しました');
}

async function callClaudeJsonOnce<T>(client: Anthropic, system: string, user: string, maxTokens: number, model: string): Promise<T> {
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  console.log(`[generate-bg] model=${model} stop=${res.stop_reason} usage=${JSON.stringify(res.usage)}`);

  const block = res.content[0];
  if (!block || block.type !== "text") throw new Error("Claude応答なし");

  if (res.stop_reason === "max_tokens") {
    console.error("[generate-bg] OUTPUT TRUNCATED - max_tokens reached. output_tokens:", res.usage?.output_tokens);
  }

  let text = block.text.trim();

  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) {
    text = codeBlock[1].trim();
  } else {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  if (res.stop_reason === "max_tokens") {
    let repaired = text;
    const opens = (repaired.match(/{/g) || []).length;
    const closes = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    repaired = repaired.replace(/,\s*"[^"]*"?\s*$/, "");
    repaired = repaired.replace(/,\s*\{[^}]*$/, "");
    repaired = repaired.replace(/,\s*$/, "");

    for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += "]";
    for (let i = 0; i < opens - closes; i++) repaired += "}";

    try {
      console.log("[generate-bg] Repaired truncated JSON successfully");
      return JSON.parse(repaired) as T;
    } catch {
      console.error("[generate-bg] Repair failed, trying original");
    }
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error("[generate-bg] JSON parse failed, model:", model, "stop:", res.stop_reason, "first 500 chars:", text.slice(0, 500), "last 200 chars:", text.slice(-200));
    throw new Error("Claude応答のJSON解析に失敗しました");
  }
}

// ============================================================
// AI画像生成 + HTML埋め込み（LP生成と同一関数内で実行）
// ============================================================

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const GEMINI_TIMEOUT_MS = 30_000;

interface GeminiFlashResponse {
  readonly candidates?: readonly {
    readonly content?: {
      readonly parts?: readonly {
        readonly text?: string;
        readonly inlineData?: { readonly mimeType: string; readonly data: string };
      }[];
    };
  }[];
}

async function generateOneImage(prompt: string, geminiKey: string, aspectRatio: string): Promise<string> {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${geminiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}`);
    const data = (await res.json()) as GeminiFlashResponse;
    const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
    if (!part?.inlineData?.data) throw new Error("No image data");
    return part.inlineData.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildImagePrompt(section: string, context: string, industry: string): string {
  const noText = `The image must contain ZERO text, ZERO letters, ZERO words, ZERO numbers, ZERO symbols, ZERO watermarks. Pure photograph only.`;
  const base = `Professional photograph, high quality, clean composition. ${noText} ${industry} industry, Japanese business context.`;
  const prompts: Record<string, string> = {
    hero: `Wide landscape photograph of abstract modern architecture or nature scenery. Bright, aspirational. ${context}. ${base}`,
    about: `Photograph of a professional workspace or modern office interior. ${context}. ${base}`,
    reason1: `Photograph of professionals collaborating in a meeting room. ${context}. ${base}`,
    reason2: `Photograph of modern technology equipment or clean workspace. ${context}. ${base}`,
    feature1: `Photograph of a person using a laptop in a bright modern office. ${context}. ${base}`,
    feature2: `Photograph of an efficient streamlined workflow environment. ${context}. ${base}`,
    feature3: `Photograph of a team reviewing documents at a conference table. ${context}. ${base}`,
    case1: `Photograph of a satisfied business professional smiling in an office. ${context}. ${base}`,
    case2: `Photograph of a team celebrating success with handshakes. ${context}. ${base}`,
    usecase1: `Photograph of professionals working together in a modern office. ${context}. ${base}`,
  };
  return prompts[section] || `Professional business photograph. ${context}. ${base}`;
}

async function generateAiImageUrls(sessionId: string, data: ReturnType<typeof flatten>, geminiKey: string): Promise<Record<string, string>> {
  const sections = [
    { section: "hero", context: `${data.service_name} - ${data.industry}`, ratio: "16:9" },
    { section: "about", context: data.pain_points.join(", "), ratio: "3:4" },
    { section: "reason1", context: data.strengths.join(", "), ratio: "3:4" },
    { section: "reason2", context: `${data.industry}の専門性`, ratio: "3:4" },
    { section: "feature1", context: `${data.service_name}の主要機能`, ratio: "3:4" },
    { section: "feature2", context: `${data.target_customer}向け効率化`, ratio: "3:4" },
    { section: "feature3", context: "データ分析・レポート", ratio: "3:4" },
    { section: "case1", context: `${data.industry}の顧客満足`, ratio: "3:4" },
    { section: "case2", context: "サービス導入後の成功", ratio: "3:4" },
    { section: "usecase1", context: `${data.target_customer}の利用場面`, ratio: "3:4" },
  ];

  const imageUrls: Record<string, string> = {};
  const BATCH = 3;

  for (let i = 0; i < sections.length; i += BATCH) {
    const batch = sections.slice(i, i + BATCH);
    await Promise.all(batch.map(async (sec) => {
      try {
        const prompt = buildImagePrompt(sec.section, sec.context, data.industry);
        const base64 = await generateOneImage(prompt, geminiKey, sec.ratio);
        const imgStore = getStore("ai-images");
        const imgKey = `${sessionId}/${sec.section}`;
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        await imgStore.set(imgKey, bytes.buffer as ArrayBuffer);
        imageUrls[sec.section] = `/api/images/${encodeURIComponent(sessionId)}/${encodeURIComponent(sec.section)}`;
        console.log(`[generate-bg] Image: ${sec.section} ✓`);
      } catch (err) {
        console.warn(`[generate-bg] Image: ${sec.section} ✗`, err);
      }
    }));
    if (i + BATCH < sections.length) await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[generate-bg] Images: ${Object.keys(imageUrls).length}/${sections.length}`);
  return imageUrls;
}

function embedImageUrls(html: string, imageUrls: Record<string, string>): string {
  let updated = html;
  if (imageUrls["hero"]) {
    const pattern = /(<div\s+class="fv-bg"\s+style="background-image:url\()[^)]*(\)")/g;
    if (pattern.test(updated)) {
      pattern.lastIndex = 0;
      updated = updated.replace(pattern, `$1'${imageUrls["hero"]}'$2`);
    }
  }
  for (const [section, url] of Object.entries(imageUrls)) {
    if (section === "hero") continue;
    const srcPattern = new RegExp(`(<img[^>]*data-img="${section}"[^>]*?)src="[^"]*"`, "g");
    if (srcPattern.test(updated)) {
      srcPattern.lastIndex = 0;
      updated = updated.replace(srcPattern, `$1src="${url}"`);
      const dispPattern = new RegExp(`(<img[^>]*data-img="${section}"[^>]*?)style="display:none"`, "g");
      updated = updated.replace(dispPattern, `$1style=""`);
    }
  }
  return updated;
}

// ============================================================
// LP Draft / Evaluate
// ============================================================

function normalizeLpContent(raw: LpContent): LpContent {
  if (raw.faq) {
    raw.faq = raw.faq.map((item: Record<string, unknown>) => ({
      q: (item.q || item.question || "") as string,
      a: (item.a || item.answer || "") as string,
    }));
  }
  return raw;
}

async function lpDraft(d: ReturnType<typeof flatten>, transcript: string, apiKey: string, rawData?: Record<string, unknown>): Promise<LpContent> {
  const raw = await callClaudeJson<LpContent>(LP_DRAFT_PROMPT, bizContext(d, transcript, rawData), apiKey, 4000, LP_MODEL);
  return normalizeLpContent(raw);
}

async function lpEvaluate(draft: LpContent, d: ReturnType<typeof flatten>, transcript: string, apiKey: string): Promise<LpContent> {
  const truncated = transcript.length > 4000 ? transcript.slice(0, 4000) + "\n…(省略)" : transcript;
  const input = `【対象企業】${d.company_name}（${d.service_name}）
【対象人物】${draft.person_name}（${draft.person_title}）
【ターゲット】${d.target_customer}
【強み】${d.strengths.join(" / ")}
${d.key_persons.length > 0 ? `【商談参加者】${d.key_persons.join(" / ")}` : ""}

【トランスクリプト（情報帰属の検証用。話者ラベルで誰の発言か確認せよ）】
${truncated}

【評価対象のコピー】
${JSON.stringify(draft)}`;

  const raw = await callClaudeJson<LpContent>(LP_EVALUATE_PROMPT, input, apiKey, 4000, LP_MODEL);
  return normalizeLpContent(raw);
}

// ============================================================
// 広告・議事録・汎用生成
// ============================================================

async function generateAd(d: ReturnType<typeof flatten>, transcript: string, apiKey: string): Promise<string> {
  const content = await callClaudeJson<AdContent>(
    `商談内容を分析し、Facebook/Instagram広告クリエイティブ3パターンをJSON生成。
商談に複数社いる場合は「サービス提供側」の広告を作成。
商談中の具体的な数字・実績を活用し、ターゲット顧客に刺さるコピーに。
{"patterns":[{"primary":"125字以内の本文","headline":"40字以内の見出し","description":"30字以内","targeting":"具体的なターゲティング案","image_direction":"画像のディレクション"}]×3}
パターン1:数字訴求, パターン2:課題解決型, パターン3:権威性/実績型。JSONのみ出力。`,
    bizContext(d, transcript),
    apiKey,
    2500,
  );
  return buildAdHtml(content, d);
}

async function generateMinutes(d: ReturnType<typeof flatten>, transcript: string, apiKey: string): Promise<string> {
  const content = await callClaudeJson<MinutesContent>(
    `商談トランスクリプトから正確な議事録をJSON生成。
【重要】
- 登場人物の名前と所属会社を正確に記載（話者ラベルから判断）
- 商談の種類（営業/協業/紹介ミーティングなど）を正しく判断
- 議題は内容ごとに分けて3-5個
- 具体的な数字・条件・価格を漏らさず記載
- アクションアイテムは商談内で合意された具体的な次のステップ

{"date":"日付(トランスクリプトから推定)","participants_self":"自社参加者(名前と役職)","participants_other":"先方参加者(名前と会社名)","purpose":"商談の目的","topics":[{"title":"議題名","summary":"詳細な内容100字以内"}]を3-5個,"decisions":["決定事項"],"actions":[{"item":"具体的タスク","owner":"担当者名","deadline":"期限"}],"next_meeting":"次回予定","upsell_notes":"追加提案・アップセル機会"}
JSONのみ出力。`,
    bizContext(d, transcript),
    apiKey,
    3000,
  );
  return buildMinutesHtml(content, d);
}

async function generateGeneric(type: string, d: ReturnType<typeof flatten>, transcript: string, apiKey: string, sessionId?: string): Promise<string> {
  const content = await callClaudeJson<GenericContent>(
    GENERIC_PROMPTS[type] || GENERIC_PROMPTS["profile"]!,
    bizContext(d, transcript),
    apiKey,
  );
  return buildGenericHtml(content, d, type, sessionId);
}

// ============================================================
// メインハンドラー（Background Function）
// ============================================================

export default async function handler(request: Request): Promise<Response> {
  // OPTIONS は同期的に処理（Background Functionでも必要）
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  let sessionId = "";
  let type = "";

  try {
    const body = (await request.json()) as Record<string, unknown>;
    sessionId = (body["session_id"] as string) || "";
    type = (body["type"] as string) || "";
    const transcript = (body["transcript"] as string) || "";
    const rawData = (body["extracted_data"] as Record<string, unknown>) || {};

    if (!sessionId || !type || !VALID_TYPES.has(type)) {
      console.error("[generate-bg] invalid params:", { sessionId, type });
      return new Response(null, { status: 202 });
    }

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      await writeStatus(sessionId, type, "failed", { error: "ANTHROPIC_API_KEY未設定" });
      return new Response(null, { status: 202 });
    }

    const data = flatten(rawData);
    const processedTranscript = truncateTranscript(transcript);
    const start = Date.now();

    // 古いステータスを削除してからprocessingを書く
    await clearOldStatus(sessionId, type);
    await writeStatus(sessionId, type, "processing", { step: "starting" });

    let html: string;

    if (type === "lp") {
      // LP: テキスト生成と画像生成を並列実行
      const geminiKey = process.env["GOOGLE_API_KEY"];

      // 並列開始: テキスト(draft→evaluate)と画像を同時に走らせる
      await writeStatus(sessionId, type, "processing", { step: "draft" });
      console.log(`[generate-bg] LP draft + images start (parallel), transcript=${transcript.length}chars`);

      const textPromise = (async () => {
        const draft = await lpDraft(data, processedTranscript, apiKey, rawData);
        console.log(`[generate-bg] LP draft done: ${((Date.now() - start) / 1000).toFixed(1)}s`);
        await writeStatus(sessionId, type, "processing", { step: "evaluate" });
        try {
          const evaluated = await lpEvaluate(draft, data, processedTranscript, apiKey);
          console.log(`[generate-bg] LP evaluate done: ${((Date.now() - start) / 1000).toFixed(1)}s`);
          return evaluated;
        } catch (evalErr) {
          console.warn("[generate-bg] LP evaluate failed, using draft:", evalErr);
          return draft;
        }
      })();

      const imagePromise = geminiKey
        ? (async () => {
            try {
              const urls = await generateAiImageUrls(sessionId, data, geminiKey);
              console.log(`[generate-bg] AI images done: ${((Date.now() - start) / 1000).toFixed(1)}s`);
              return urls;
            } catch (imgErr) {
              console.warn("[generate-bg] AI images failed:", imgErr);
              return {} as Record<string, string>;
            }
          })()
        : Promise.resolve({} as Record<string, string>);

      // 両方完了を待つ
      const [finalContent, imageUrls] = await Promise.all([textPromise, imagePromise]);

      // Build: テキスト+画像を統合してHTML生成
      await writeStatus(sessionId, type, "processing", { step: "build" });
      const images = selectImages(data);
      const theme = selectTheme(data);
      html = buildLpHtml(finalContent, data, images, theme);

      // AI画像URLをHTMLに埋め込み
      if (Object.keys(imageUrls).length > 0) {
        html = embedImageUrls(html, imageUrls);
      }

      console.log(`[generate-bg] LP complete: ${((Date.now() - start) / 1000).toFixed(1)}s, ${html.length}chars, ${Object.keys(imageUrls).length} AI images`);

    } else if (type === "ad_creative") {
      await writeStatus(sessionId, type, "processing", { step: "generating" });
      html = await generateAd(data, processedTranscript, apiKey);
    } else if (type === "minutes") {
      await writeStatus(sessionId, type, "processing", { step: "generating" });
      html = await generateMinutes(data, processedTranscript, apiKey);
    } else {
      await writeStatus(sessionId, type, "processing", { step: "generating" });
      html = await generateGeneric(type, data, processedTranscript, apiKey, sessionId);
    }

    console.log(`[generate-bg] ${type} total: ${((Date.now() - start) / 1000).toFixed(1)}s, ${html.length}chars`);

    // HTML を Blobs に保存
    const blobKey = `${sessionId}/${type}`;
    const store = getStore("deliverables");
    await store.set(blobKey, html, { metadata: { type, sessionId, createdAt: new Date().toISOString() } });

    // ステータス: completed
    await writeStatus(sessionId, type, "completed");

  } catch (error) {
    console.error("[generate-bg] error:", error);
    if (sessionId && type) {
      const msg = error instanceof Error ? error.message : "生成エラー";
      await writeStatus(sessionId, type, "failed", { error: `制作物の生成に失敗しました: ${msg}` });
    }
  }

  // Background Functionのレスポンスは無視されるが、形式上返す
  return new Response(null, { status: 202 });
}

export const config: Config = {
  path: "/api/generate-lp",
  method: ["POST", "OPTIONS"],
};
