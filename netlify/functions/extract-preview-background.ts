/**
 * 抽出プレビューAPI - Netlify Background Function
 *
 * POST /api/extract-preview
 *
 * Sonnetで高品質抽出（Background Functionで15分制限）。
 * 結果はNetlify Blobsに保存し、フロントエンドはpoll-statusでポーリング。
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// 定数
// ============================================================

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 3000;
const CHUNK_SIZE = 8000;
const CHUNK_OVERLAP = 500;
const MAX_CHUNKS = 3;

// ============================================================
// 型定義
// ============================================================

interface ExtractedField {
  value: string | string[];
  confidence: number;
}

type ExtractedData = Record<string, ExtractedField>;

// ============================================================
// ステータス・結果Blob書き込み
// ============================================================

async function clearOldStatus(sessionId: string): Promise<void> {
  try {
    const statusStore = getStore("job-status");
    await statusStore.delete(`status/${sessionId}/extract`);
    const resultStore = getStore("job-results");
    await resultStore.delete(`result/${sessionId}/extract`);
  } catch {
    // 削除失敗は無視
  }
}

async function writeStatus(sessionId: string, status: string, extra?: Record<string, string>): Promise<void> {
  try {
    const store = getStore("job-status");
    const key = `status/${sessionId}/extract`;
    await store.set(key, JSON.stringify({ status, updatedAt: new Date().toISOString(), ...extra }));
  } catch (err) {
    console.warn("[extract-bg] status write failed:", err);
  }
}

async function writeResult(sessionId: string, extractedData: ExtractedData): Promise<void> {
  try {
    const store = getStore("job-results");
    const key = `result/${sessionId}/extract`;
    await store.set(key, JSON.stringify({ extracted_data: extractedData }));
  } catch (err) {
    console.warn("[extract-bg] result write failed:", err);
  }
}

// ============================================================
// システムプロンプト
// ============================================================

function buildSystemPrompt(targetCompany: string | null): string {
  const focusRule = targetCompany
    ? `【最重要】「${targetCompany}」の情報のみを抽出すること。他の会社の情報は含めない。この会社のサービス・強み・価格・ターゲットにフォーカスする。`
    : `商談に複数の会社が登場する場合、最も主要なサービス提供者の情報を抽出する。`;

  return `日本語の商談トランスクリプトからビジネス情報を抽出。以下のJSON形式で出力。他のテキストは不要。

${focusRule}

各フィールド: value + confidence(0.0-1.0)。明確に言及=0.8-1.0、推測=0.3-0.6、情報なし=0.0(valueは""か[])。
商談中の具体的な数字・事例・エピソードは正確かつ詳細に抽出すること。曖昧にまとめず原文のニュアンスを保持。

{"company_name":{"value":"会社名","confidence":0},"industry":{"value":"業種","confidence":0},"service_name":{"value":"主要サービス名","confidence":0},"target_customer":{"value":"ターゲット顧客（具体的に）","confidence":0},"price_range":{"value":"価格帯・料金体系（具体的な金額）","confidence":0},"strengths":{"value":["強み・特長（数字があれば含める。数字がなくても「安さ」「速さ」等の定性的な強みも必ず抽出）"],"confidence":0},"pain_points":{"value":["顧客が抱える具体的課題"],"confidence":0},"current_marketing":{"value":"現在の集客方法","confidence":0},"specific_numbers":{"value":["商談中に言及された全ての数字（例: 採択率92%、年間300件）"],"confidence":0},"case_studies":{"value":["具体的な事例・エピソード（50字以内で各1つ）"],"confidence":0},"competitive_advantages":{"value":["競合と比べた差別化ポイント"],"confidence":0},"pricing_details":{"value":"詳細な料金体系（月額、成果報酬率、着手金など）","confidence":0},"company_scale":{"value":"従業員数・拠点・設立年数など","confidence":0},"key_persons":{"value":["登場人物の名前と役職"],"confidence":0}}`;
}

// ============================================================
// Claude API呼び出し
// ============================================================

async function callClaude(transcript: string, apiKey: string, targetCompany: string | null = null): Promise<ExtractedData> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(targetCompany),
    messages: [{
      role: "user",
      content: `トランスクリプトからビジネス情報を抽出:\n\n${transcript}`,
    }],
  });

  console.log(`[extract-bg] stop=${response.stop_reason} usage=${JSON.stringify(response.usage)}`);

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Claude応答なし");
  }

  let text = block.text.trim();
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m?.[1]) {
    text = m[1].trim();
  } else {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  // 切れたJSONの修復
  if (response.stop_reason === "max_tokens") {
    console.warn("[extract-bg] OUTPUT TRUNCATED - attempting repair");
    let repaired = text;
    repaired = repaired.replace(/,\s*"[^"]*"?\s*$/, "");
    repaired = repaired.replace(/,\s*\{[^}]*$/, "");
    repaired = repaired.replace(/,\s*\[[^\]]*$/, "");
    repaired = repaired.replace(/,\s*$/, "");

    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    const opens = (repaired.match(/{/g) || []).length;
    const closes = (repaired.match(/}/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += "]";
    for (let i = 0; i < opens - closes; i++) repaired += "}";

    try {
      return JSON.parse(repaired) as ExtractedData;
    } catch {
      console.error("[extract-bg] repair failed, trying original");
    }
  }

  try {
    return JSON.parse(text) as ExtractedData;
  } catch (e) {
    console.error("[extract-bg] JSON parse failed. first 300 chars:", text.slice(0, 300), "last 100 chars:", text.slice(-100));
    throw e;
  }
}

// ============================================================
// チャンク分割
// ============================================================

function splitTranscript(transcript: string): string[] {
  if (transcript.length <= CHUNK_SIZE) return [transcript];

  const chunks: string[] = [];
  let start = 0;

  while (start < transcript.length && chunks.length < MAX_CHUNKS) {
    const end = Math.min(start + CHUNK_SIZE, transcript.length);
    chunks.push(transcript.slice(start, end));
    start = end - CHUNK_OVERLAP;
    if (start >= transcript.length) break;
  }

  return chunks;
}

// ============================================================
// 抽出結果マージ
// ============================================================

function mergeExtractions(results: ExtractedData[]): ExtractedData {
  if (results.length === 1) return results[0]!;

  const merged: ExtractedData = {};

  for (const result of results) {
    for (const [key, field] of Object.entries(result)) {
      const existing = merged[key];

      if (!existing) {
        merged[key] = field;
        continue;
      }

      if (Array.isArray(field.value) && Array.isArray(existing.value)) {
        const combined = [...new Set([...existing.value, ...field.value])];
        merged[key] = { value: combined, confidence: Math.max(existing.confidence, field.confidence) };
        continue;
      }

      if (field.confidence > existing.confidence) {
        merged[key] = field;
      } else if (field.confidence === existing.confidence) {
        const existStr = typeof existing.value === "string" ? existing.value : "";
        const newStr = typeof field.value === "string" ? field.value : "";
        if (newStr.length > existStr.length) {
          merged[key] = field;
        }
      }
    }
  }

  return merged;
}

// ============================================================
// メインハンドラー（Background Function）
// ============================================================

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  let sessionId = "unknown";

  try {
    const body = (await request.json()) as Record<string, unknown>;
    sessionId = (body["session_id"] as string) || "unknown";
    const transcript = body["transcript"] as string | undefined;

    if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
      console.error("[extract-bg] no transcript");
      return new Response(null, { status: 202 });
    }

    const targetCompany = (body["target_company"] as string | undefined) || null;

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      await writeStatus(sessionId, "failed", { error: "ANTHROPIC_API_KEY未設定" });
      return new Response(null, { status: 202 });
    }

    await clearOldStatus(sessionId);
    await writeStatus(sessionId, "processing");

    const chunks = splitTranscript(transcript.trim());
    console.log(`[extract-bg] ${transcript.length}chars → ${chunks.length}chunks, target=${targetCompany || "auto"}`);

    const startTime = Date.now();

    let extractedData: ExtractedData;

    if (chunks.length === 1) {
      extractedData = await callClaude(chunks[0]!, apiKey, targetCompany);
    } else {
      const results = await Promise.all(
        chunks.map(chunk => callClaude(chunk, apiKey, targetCompany))
      );
      extractedData = mergeExtractions(results);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[extract-bg] done: ${elapsed}s, ${Object.keys(extractedData).length} fields`);

    await writeResult(sessionId, extractedData);
    await writeStatus(sessionId, "completed");

  } catch (error) {
    console.error("[extract-bg] error:", error);
    const msg = error instanceof Error ? error.message : "抽出エラー";
    await writeStatus(sessionId, "failed", { error: msg });
  }

  return new Response(null, { status: 202 });
}

export const config: Config = {
  path: "/api/extract-preview",
  method: ["POST", "OPTIONS"],
};
