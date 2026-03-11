/**
 * 制作物生成API - Netlify Function
 *
 * POST /api/generate-lp
 *
 * LP生成は3ステップパイプライン:
 *   step=draft    → セクション設計 + コピー生成 (JSON返却)
 *   step=evaluate → 品質評価 + 修正 (JSON返却)
 *   step=build    → HTML構築 + Blobs保存 (HTML返却)
 *
 * LP以外(ad_creative, minutes等)は従来通り1ステップ。
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

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// LP生成はHaiku（速度重視: 26秒制限内に確実に収める）
const LP_MODEL = "claude-haiku-4-5-20251001";
// LP以外（ad, minutes等）は出力が少ないのでSonnetでOK
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const VALID_TYPES = new Set<string>(["lp", "ad_creative", "flyer", "hearing_form", "line_design", "minutes", "profile", "system_proposal", "proposal"]);

// ============================================================
// Claude API呼び出し
// ============================================================

async function callClaudeJson<T>(system: string, user: string, apiKey: string, maxTokens = 4000, model = CLAUDE_MODEL): Promise<T> {
  const client = new Anthropic({ apiKey });

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.log(`[generate] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
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
      console.warn(`[generate] Retryable error (attempt ${attempt + 1}): ${msg}`);
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

  console.log(`[generate] model=${model} stop=${res.stop_reason} usage=${JSON.stringify(res.usage)}`);

  const block = res.content[0];
  if (!block || block.type !== "text") throw new Error("Claude応答なし");

  if (res.stop_reason === "max_tokens") {
    console.error("[generate] OUTPUT TRUNCATED - max_tokens reached. output_tokens:", res.usage?.output_tokens);
  }

  let text = block.text.trim();

  // JSON抽出: コードブロック → 最初の{...}最後の} を試す
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

  // 切れたJSONの修復を試みる
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
      console.log("[generate] Repaired truncated JSON successfully");
      return JSON.parse(repaired) as T;
    } catch {
      console.error("[generate] Repair failed, trying original");
    }
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error("[generate] JSON parse failed, model:", model, "stop:", res.stop_reason, "first 500 chars:", text.slice(0, 500), "last 200 chars:", text.slice(-200));
    throw new Error("Claude応答のJSON解析に失敗しました");
  }
}

// ============================================================
// LP Draft / Evaluate
// ============================================================

async function lpDraft(d: ReturnType<typeof flatten>, transcript: string, apiKey: string, rawData?: Record<string, unknown>): Promise<LpContent> {
  return callClaudeJson<LpContent>(LP_DRAFT_PROMPT, bizContext(d, transcript, rawData), apiKey, 4000, LP_MODEL);
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

  return callClaudeJson<LpContent>(LP_EVALUATE_PROMPT, input, apiKey, 4000, LP_MODEL);
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

async function generateGeneric(type: string, d: ReturnType<typeof flatten>, transcript: string, apiKey: string): Promise<string> {
  const content = await callClaudeJson<GenericContent>(
    GENERIC_PROMPTS[type] || GENERIC_PROMPTS["profile"]!,
    bizContext(d, transcript),
    apiKey,
  );
  return buildGenericHtml(content, d, type);
}

// ============================================================
// レート制限 (インメモリ — Netlify Function単位)
// ============================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

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

function cleanupRateLimitMap(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

// ============================================================
// メインハンドラー
// ============================================================

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "POST only" }), { status: 405, headers: { "Content-Type": "application/json", ...CORS } });
  }

  if (rateLimitMap.size > 100) cleanupRateLimitMap();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sessionId = body["session_id"] as string | undefined;
    const type = body["type"] as string | undefined;
    const step = (body["step"] as string) || "";
    const transcript = (body["transcript"] as string) || "";
    const rawData = (body["extracted_data"] as Record<string, unknown>) || {};
    const draftContent = body["draft_content"] as LpContent | undefined;

    if (!sessionId) return new Response(JSON.stringify({ success: false, error: "session_id必須" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
    if (!type || !VALID_TYPES.has(type)) return new Response(JSON.stringify({ success: false, error: "無効なtype" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });

    if (!checkRateLimit(sessionId)) {
      return new Response(JSON.stringify({ success: false, error: "リクエスト頻度が高すぎます。しばらく待ってから再試行してください。" }), { status: 429, headers: { "Content-Type": "application/json", ...CORS } });
    }

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) return new Response(JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY未設定" }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });

    const data = flatten(rawData);
    const start = Date.now();

    // ============================================================
    // LP 3ステップパイプライン
    // ============================================================
    if (type === "lp" && step) {
      if (step === "draft") {
        console.log(`[generate] LP draft start, transcript=${transcript.length}chars`);
        const processedTranscript = truncateTranscript(transcript);
        const draft = await lpDraft(data, processedTranscript, apiKey, rawData);
        console.log(`[generate] LP draft done: ${((Date.now() - start) / 1000).toFixed(1)}s`);
        return new Response(
          JSON.stringify({ success: true, step: "draft", content: draft }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
        );
      }

      if (step === "evaluate") {
        if (!draftContent) return new Response(JSON.stringify({ success: false, error: "draft_content必須" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
        console.log(`[generate] LP evaluate start`);
        const revised = await lpEvaluate(draftContent, data, transcript, apiKey);
        console.log(`[generate] LP evaluate done: ${((Date.now() - start) / 1000).toFixed(1)}s`);
        return new Response(
          JSON.stringify({ success: true, step: "evaluate", content: revised }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
        );
      }

      if (step === "build") {
        if (!draftContent) return new Response(JSON.stringify({ success: false, error: "draft_content必須" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
        console.log(`[generate] LP build start`);

        const images = selectImages(data);
        console.log(`[generate] images: ${images.length} selected for industry="${data.industry}"`);

        const theme = selectTheme(data);
        console.log(`[generate] theme: ${theme}`);
        const html = buildLpHtml(draftContent as LpContent, data, images, theme);

        const blobKey = `${sessionId}/${type}`;
        try {
          const store = getStore("deliverables");
          await store.set(blobKey, html, { metadata: { type, sessionId, createdAt: new Date().toISOString() } });
        } catch (blobErr) {
          console.warn("[generate] blob save failed:", blobErr);
        }

        const viewUrl = `/view/${encodeURIComponent(sessionId)}/${encodeURIComponent(type)}`;
        console.log(`[generate] LP build done: ${((Date.now() - start) / 1000).toFixed(1)}s, ${html.length}chars`);
        return new Response(
          JSON.stringify({ success: true, step: "build", html, type, view_url: viewUrl }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
        );
      }
    }

    // ============================================================
    // LP以外 or LP旧互換（step未指定）
    // ============================================================
    console.log(`[generate] ${type} start, transcript=${transcript.length}chars`);
    const processedTranscript = truncateTranscript(transcript);

    let html: string;
    if (type === "lp") {
      const draft = await lpDraft(data, processedTranscript, apiKey, rawData);
      const images = selectImages(data);
      const lpTheme = selectTheme(data);
      html = buildLpHtml(draft, data, images, lpTheme);
    } else if (type === "ad_creative") html = await generateAd(data, processedTranscript, apiKey);
    else if (type === "minutes") html = await generateMinutes(data, processedTranscript, apiKey);
    else html = await generateGeneric(type, data, processedTranscript, apiKey);

    console.log(`[generate] ${type} done: ${((Date.now() - start) / 1000).toFixed(1)}s, ${html.length}chars`);

    const blobKey = `${sessionId}/${type}`;
    try {
      const store = getStore("deliverables");
      await store.set(blobKey, html, { metadata: { type, sessionId, createdAt: new Date().toISOString() } });
    } catch (blobErr) {
      console.warn("[generate] blob save failed:", blobErr);
    }

    const viewUrl = `/view/${encodeURIComponent(sessionId)}/${encodeURIComponent(type as string)}`;
    return new Response(JSON.stringify({ success: true, html, type, view_url: viewUrl }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
  } catch (error) {
    console.error("[generate] error:", error);
    const msg = error instanceof Error ? error.message : "生成エラー";
    return new Response(JSON.stringify({ success: false, error: `制作物の生成に失敗しました: ${msg}` }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
  }
}

export const config: Config = {
  path: "/api/generate-lp",
  method: ["POST", "OPTIONS"],
};
