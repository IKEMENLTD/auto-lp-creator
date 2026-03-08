/**
 * 抽出プレビューAPI - Netlify Function
 *
 * POST /api/extract-preview
 *
 * 長文対応: 5000字超のトランスクリプトはチャンク分割→各チャンクで抽出→マージ
 */

import type { Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// 定数
// ============================================================

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2500;
const CHUNK_SIZE = 4000; // 1チャンクの最大文字数
const CHUNK_OVERLAP = 500; // チャンク間のオーバーラップ
const MAX_CHUNKS = 5; // 最大チャンク数（コスト制限）

// ============================================================
// 型定義
// ============================================================

interface ExtractedField {
  value: string | string[];
  confidence: number;
}

type ExtractedData = Record<string, ExtractedField>;

// ============================================================
// CORSヘッダー
// ============================================================

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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

{"company_name":{"value":"会社名","confidence":0},"industry":{"value":"業種","confidence":0},"service_name":{"value":"主要サービス名","confidence":0},"target_customer":{"value":"ターゲット顧客（具体的に）","confidence":0},"price_range":{"value":"価格帯・料金体系（具体的な金額）","confidence":0},"strengths":{"value":["強み（具体的な数字付き）"],"confidence":0},"pain_points":{"value":["顧客が抱える具体的課題"],"confidence":0},"current_marketing":{"value":"現在の集客方法","confidence":0},"specific_numbers":{"value":["商談中に言及された全ての数字（例: 採択率92%、年間300件）"],"confidence":0},"case_studies":{"value":["具体的な事例・エピソード（50字以内で各1つ）"],"confidence":0},"competitive_advantages":{"value":["競合と比べた差別化ポイント"],"confidence":0},"pricing_details":{"value":"詳細な料金体系（月額、成果報酬率、着手金など）","confidence":0},"company_scale":{"value":"従業員数・拠点・設立年数など","confidence":0},"key_persons":{"value":["登場人物の名前と役職"],"confidence":0}}`;
}

// ============================================================
// Haiku API呼び出し
// ============================================================

async function callHaiku(transcript: string, apiKey: string, targetCompany: string | null = null): Promise<ExtractedData> {
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

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Haiku応答なし");
  }

  let text = block.text.trim();
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m?.[1]) text = m[1].trim();

  return JSON.parse(text) as ExtractedData;
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
// 抽出結果マージ（最高confidence優先）
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

      // 配列フィールド: マージして重複排除
      if (Array.isArray(field.value) && Array.isArray(existing.value)) {
        const combined = [...new Set([...existing.value, ...field.value])];
        merged[key] = {
          value: combined,
          confidence: Math.max(existing.confidence, field.confidence),
        };
        continue;
      }

      // 文字列フィールド: より高いconfidenceを採用
      if (field.confidence > existing.confidence) {
        merged[key] = field;
      } else if (field.confidence === existing.confidence) {
        // 同confidence: より長い値を採用（情報量が多い）
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
// メインハンドラー
// ============================================================

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "POST only" }),
      { status: 405, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const transcript = body["transcript"] as string | undefined;

    if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "transcript は必須です" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS } },
      );
    }

    const targetCompany = (body["target_company"] as string | undefined) || null;

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY 未設定" }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
      );
    }

    // チャンク分割
    const chunks = splitTranscript(transcript.trim());
    console.log(`[extract] ${transcript.length}chars → ${chunks.length}chunks, target=${targetCompany || "auto"}`);

    const startTime = Date.now();

    let extractedData: ExtractedData;

    if (chunks.length === 1) {
      extractedData = await callHaiku(chunks[0]!, apiKey, targetCompany);
    } else {
      const results = await Promise.all(
        chunks.map(chunk => callHaiku(chunk, apiKey, targetCompany))
      );
      extractedData = mergeExtractions(results);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[extract] done: ${elapsed}s, ${Object.keys(extractedData).length} fields`);

    return new Response(
      JSON.stringify({ extracted_data: extractedData }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
    );
  } catch (error) {
    console.error("[extract] error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "抽出エラー" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
}

export const config: Config = {
  path: "/api/extract-preview",
  method: ["POST", "OPTIONS"],
};
