/**
 * 文字起こしチャンク受信API - Netlify Function
 *
 * POST /api/transcribe-chunk
 *
 * ブラウザから音声チャンク(webm/opus)を受け取り、
 * Groq Whisper API（無料）で文字起こしして返す。
 *
 * Groq は Whisper-large-v3 を無料・高速で提供。
 */

import type { Config } from "@netlify/functions";

// ============================================================
// CORSヘッダー
// ============================================================

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ============================================================
// 定数
// ============================================================

const MIN_AUDIO_SIZE = 1000;
const GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

// ============================================================
// メインハンドラー
// ============================================================

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed. Use POST." }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  try {
    // APIキー取得（Groq優先、OpenAIフォールバック）
    const groqKey = process.env["GROQ_API_KEY"];
    const openaiKey = process.env["OPENAI_API_KEY"];
    const apiKey = groqKey || openaiKey;
    const apiUrl = groqKey
      ? GROQ_WHISPER_URL
      : "https://api.openai.com/v1/audio/transcriptions";
    const model = groqKey ? "whisper-large-v3" : "whisper-1";

    if (!apiKey) {
      console.error("GROQ_API_KEY も OPENAI_API_KEY も設定されていません");
      return new Response(
        JSON.stringify({ error: "サーバー設定エラー: APIキーが未設定です" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // マルチパートFormDataからフィールドを取得
    const formData = await request.formData();
    const audioFile = formData.get("audio");
    const sessionId = formData.get("session_id");
    const speaker = formData.get("speaker") as string | null;

    if (!sessionId || typeof sessionId !== "string") {
      return new Response(
        JSON.stringify({ error: "session_id は必須パラメータです" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!audioFile || !(audioFile instanceof Blob)) {
      return new Response(
        JSON.stringify({ error: "audio は必須パラメータです" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // 音声が小さすぎる場合は無音
    if (audioFile.size < MIN_AUDIO_SIZE) {
      return new Response(
        JSON.stringify({ success: true, text: "", speaker: null }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    console.log(`[TRANSCRIBE] ${sessionId} - ${audioFile.size} bytes, type="${audioFile.type}" → ${groqKey ? 'Groq' : 'OpenAI'} ${model}`);

    // 音声データをバッファに保存（リトライ用）
    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());

    // Whisper API呼び出し（リトライ付き）
    let whisperResponse: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      // File オブジェクトを毎回新規作成（ストリームは1回しか読めないため）
      const file = new File([audioBytes], "audio.webm", { type: "audio/webm" });
      const whisperFormData = new FormData();
      whisperFormData.append("file", file);
      whisperFormData.append("model", model);
      whisperFormData.append("language", "ja");
      whisperFormData.append("response_format", "json");

      whisperResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperFormData,
      });

      if (whisperResponse.status === 429) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 4000);
        console.warn(`Whisper 429 - ${waitMs}ms後にリトライ (${attempt + 1}/3)`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      break;
    }

    if (!whisperResponse || !whisperResponse.ok) {
      const status = whisperResponse?.status ?? 0;
      const errorBody = whisperResponse ? await whisperResponse.text() : "no response";
      console.error(`Whisper APIエラー: ${status}`, errorBody);
      return new Response(
        JSON.stringify({
          error: "文字起こしAPIの呼び出しに失敗しました",
          details: `Whisper API returned ${status}: ${errorBody.substring(0, 200)}`,
        }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const whisperResult = (await whisperResponse.json()) as { text?: string };
    const transcribedText = whisperResult.text?.trim() ?? "";

    if (transcribedText === "") {
      return new Response(
        JSON.stringify({ success: true, text: "", speaker: null }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    console.log(`[TRANSCRIBE] ${sessionId} → "${transcribedText.substring(0, 50)}..."`);

    return new Response(
      JSON.stringify({ success: true, text: transcribedText, speaker: speaker || "自分" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    console.error("文字起こしチャンク処理エラー:", error);
    return new Response(
      JSON.stringify({
        error: "文字起こしチャンクの処理に失敗しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
}

export const config: Config = {
  path: "/api/transcribe-chunk",
  method: ["POST", "OPTIONS"],
};
