/**
 * 企業検出API - Netlify Background Function
 *
 * POST /api/detect-companies
 *
 * Background Function: 即座に202を返し、裏でSonnetによる企業検出を実行。
 * 結果はNetlify Blobsに保存。
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// 型定義
// ============================================================

interface DetectedCompany {
  name: string;
  role: string;
  description: string;
  key_person: string;
  key_numbers: string[];
}

// ============================================================
// 定数
// ============================================================

const CLAUDE_MODEL = "claude-sonnet-4-6-20250514";

const SYSTEM_PROMPT = `商談トランスクリプトに登場する全ての企業・組織を検出し、JSON配列で出力してください。

【ルール】
- 個人（紹介者・仲介者のみの人）ではなく「企業・組織」単位で検出
- 各企業の商談内での役割を正確に判断
- 具体的な数字・実績があれば key_numbers に含める
- description は50字以内で簡潔に
- 個人事業主やフリーランスも1つの企業として扱う

【role の種類】
- "サービス提供者" : 自社サービス・商品を持っている会社
- "支援会社" : コンサルや代行などの支援を提供する会社
- "紹介者" : 商談を仲介・紹介した人の所属先
- "顧客候補" : サービスの導入を検討している側
- "パートナー" : 協業・提携先

【出力JSON形式】
{"companies":[{"name":"会社名","role":"役割","description":"50字以内の説明","key_person":"担当者名","key_numbers":["数字1","数字2"]}]}
JSONのみ出力。他のテキスト不要。`;

// ============================================================
// ステータスBlob書き込み
// ============================================================

async function clearOldStatus(sessionId: string): Promise<void> {
  try {
    const statusStore = getStore("job-status");
    await statusStore.delete(`status/${sessionId}/detect`);
    const resultStore = getStore("job-results");
    await resultStore.delete(`result/${sessionId}/detect`);
  } catch {
    // 削除失敗は無視
  }
}

async function writeStatus(sessionId: string, status: string, extra?: Record<string, string>): Promise<void> {
  try {
    const store = getStore("job-status");
    const key = `status/${sessionId}/detect`;
    const data = JSON.stringify({
      status,
      updatedAt: new Date().toISOString(),
      ...extra,
    });
    await store.set(key, data);
  } catch (err) {
    console.warn("[detect-bg] status write failed:", err);
  }
}

async function writeResult(sessionId: string, companies: DetectedCompany[]): Promise<void> {
  try {
    const store = getStore("job-results");
    const key = `result/${sessionId}/detect`;
    await store.set(key, JSON.stringify({ companies }));
  } catch (err) {
    console.warn("[detect-bg] result write failed:", err);
  }
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

    if (!sessionId || sessionId === "unknown" || !transcript || transcript.trim().length === 0) {
      console.error("[detect-bg] invalid params");
      return new Response(null, { status: 202 });
    }

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      await writeStatus(sessionId, "failed", { error: "ANTHROPIC_API_KEY未設定" });
      return new Response(null, { status: 202 });
    }

    await clearOldStatus(sessionId);
    await writeStatus(sessionId, "processing");

    const client = new Anthropic({ apiKey });
    const input = transcript.trim().slice(0, 15000);

    const res = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `以下の商談トランスクリプトから登場企業を検出:\n\n${input}` }],
    });

    const block = res.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Claude応答なし");
    }

    let text = block.text.trim();
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m?.[1]) text = m[1].trim();

    const parsed = JSON.parse(text) as { companies: DetectedCompany[] };
    const companies = parsed.companies || [];

    console.log(`[detect-bg] found ${companies.length} companies`);

    await writeResult(sessionId, companies);
    await writeStatus(sessionId, "completed");

  } catch (error) {
    console.error("[detect-bg] error:", error);
    const msg = error instanceof Error ? error.message : "企業検出エラー";
    await writeStatus(sessionId, "failed", { error: msg });
  }

  return new Response(null, { status: 202 });
}

export const config: Config = {
  path: "/api/detect-companies",
  method: ["POST", "OPTIONS"],
};
