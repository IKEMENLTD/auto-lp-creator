/**
 * 企業検出API - Netlify Function
 *
 * POST /api/detect-companies
 *
 * トランスクリプトから登場企業を検出し、各社の基本情報を返す。
 * ユーザーが対象企業を選択するためのステップ。
 */

import type { Config } from "@netlify/functions";
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

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY 未設定" }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
      );
    }

    const client = new Anthropic({ apiKey });

    // 長文は先頭15000字に制限
    const input = transcript.trim().slice(0, 15000);

    const res = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `以下の商談トランスクリプトから登場企業を検出:\n\n${input}` }],
    });

    const block = res.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Haiku応答なし");
    }

    let text = block.text.trim();
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m?.[1]) text = m[1].trim();

    const parsed = JSON.parse(text) as { companies: DetectedCompany[] };
    const companies = parsed.companies || [];

    console.log(`[detect] found ${companies.length} companies`);

    return new Response(
      JSON.stringify({ companies }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
    );
  } catch (error) {
    console.error("[detect] error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "企業検出エラー" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
}

export const config: Config = {
  path: "/api/detect-companies",
  method: ["POST", "OPTIONS"],
};
