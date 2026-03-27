/**
 * 文字起こしチャンク受信API - Netlify Function
 *
 * POST /api/transcribe-chunk
 *
 * ブラウザから音声チャンク(webm/opus)を受け取り、
 * Groq Whisper API（無料）で文字起こしして返す。
 * diarize=true の場合は Deepgram API で話者分離付き文字起こし。
 */

import type { Config } from "@netlify/functions";
import { DeepgramClient } from "@deepgram/sdk";

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

// レート制限: セッションごとに60秒間で最大20リクエスト
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateBuckets = new Map<string, number[]>();

function isRateLimited(sessionId: string): boolean {
  const now = Date.now();
  let timestamps = rateBuckets.get(sessionId);
  if (!timestamps) {
    timestamps = [];
    rateBuckets.set(sessionId, timestamps);
  }
  // 古いタイムスタンプを除去
  while (timestamps.length > 0 && timestamps[0]! < now - RATE_WINDOW_MS) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_MAX) return true;
  timestamps.push(now);
  // メモリリーク防止: 古いセッションを定期的に掃除
  if (rateBuckets.size > 500) {
    for (const [key, ts] of rateBuckets) {
      if (ts.length === 0 || ts[ts.length - 1]! < now - RATE_WINDOW_MS * 5) {
        rateBuckets.delete(key);
      }
    }
  }
  return false;
}

// ============================================================
// Deepgram 話者分離付き文字起こし
// ============================================================

interface DiarizedSegment {
  speaker: string;
  text: string;
}

async function transcribeWithDeepgram(audioBytes: Uint8Array, prevText: string | null): Promise<DiarizedSegment[]> {
  const dgKey = process.env["DEEPGRAM_API_KEY"];
  if (!dgKey) throw new Error("DEEPGRAM_API_KEY未設定");

  const deepgram = new DeepgramClient({ apiKey: dgKey, timeoutInSeconds: 15 });
  const result = await deepgram.listen.v1.media.transcribeFile(
    audioBytes,
    {
      model: "nova-3",
      language: "ja",
      diarize: true,
      utterances: true,
      smart_format: true,
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = result as any;
  const utterances = body?.results?.utterances;
  if (utterances && utterances.length > 0) {
    return utterances.map((u: { speaker?: number; transcript?: string }) => ({
      speaker: `話者${(u.speaker ?? 0) + 1}`,
      text: u.transcript ?? "",
    }));
  }

  // utterancesがない場合はwordsからまとめる
  const words = body?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
  if (words.length === 0) return [];

  const segments: DiarizedSegment[] = [];
  let currentSpeaker = -1;
  let currentText = "";

  for (const w of words) {
    const sp = (w as { speaker?: number }).speaker ?? 0;
    if (sp !== currentSpeaker && currentText) {
      segments.push({ speaker: `話者${currentSpeaker + 1}`, text: currentText.trim() });
      currentText = "";
    }
    currentSpeaker = sp;
    currentText += ((w as { punctuated_word?: string }).punctuated_word ?? (w as { word: string }).word) + " ";
  }
  if (currentText.trim()) {
    segments.push({ speaker: `話者${currentSpeaker + 1}`, text: currentText.trim() });
  }
  return segments;
}

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
    const prevText = formData.get("prev_text") as string | null;
    const diarize = formData.get("diarize") === "true";

    if (!sessionId || typeof sessionId !== "string") {
      return new Response(
        JSON.stringify({ error: "session_id は必須パラメータです" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (isRateLimited(sessionId)) {
      return new Response(
        JSON.stringify({ error: "リクエストが多すぎます。少し待ってから再試行してください" }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } },
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

    // 音声データをバッファに保存
    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());

    // Deepgram話者分離モード
    if (diarize && process.env["DEEPGRAM_API_KEY"]) {
      console.log(`[TRANSCRIBE] ${sessionId} - ${audioFile.size} bytes → Deepgram (diarize)`);
      try {
        const segments = await transcribeWithDeepgram(audioBytes, prevText);
        if (segments.length === 0) {
          return new Response(
            JSON.stringify({ success: true, text: "", speaker: null, segments: [] }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
        const fullText = segments.map(s => `[${s.speaker}] ${s.text}`).join("\n");
        console.log(`[TRANSCRIBE] ${sessionId} → Deepgram ${segments.length} segments`);
        return new Response(
          JSON.stringify({ success: true, text: fullText, speaker: segments[0]?.speaker ?? "話者1", segments }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      } catch (dgErr) {
        console.warn(`[TRANSCRIBE] Deepgram failed, falling back to Whisper:`, dgErr);
        // フォールバック: 下のWhisper処理に続く
      }
    }

    console.log(`[TRANSCRIBE] ${sessionId} - ${audioFile.size} bytes, type="${audioFile.type}" → ${groqKey ? 'Groq' : 'OpenAI'} ${model}`);

    // Whisper API呼び出し（リトライ付き）
    let whisperResponse: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      // Blob で音声データを毎回新規作成（ストリームは1回しか読めないため）
      const blob = new Blob([audioBytes], { type: "audio/webm" });
      const whisperFormData = new FormData();
      whisperFormData.append("file", blob, "audio.webm");
      whisperFormData.append("model", model);
      whisperFormData.append("language", "ja");
      whisperFormData.append("response_format", "json");
      const basePrompt = "ビジネス商談の文字起こしです。企業名、サービス名、業界用語、数値、人名が含まれます。";
      const prompt = prevText ? `${basePrompt}\n前の発言: ${prevText}` : basePrompt;
      whisperFormData.append("prompt", prompt.slice(0, 800));
      whisperFormData.append("temperature", "0");

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
