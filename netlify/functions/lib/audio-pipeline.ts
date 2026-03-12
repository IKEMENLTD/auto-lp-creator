/**
 * 音声パイプライン共通ロジック
 *
 * tl;dv WebhookとWhisper API直接呼出の両方から呼ばれる。
 * チャンクテキストを受け取り、Haiku抽出 → マージ → DB更新を行う。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExtractionResult,
  ExtractedDataWithConfidence,
} from "./types.js";
import {
  extractAndMerge,
  checkGenerationReadiness,
  createEmptyExtractedData,
} from "./haiku-client.js";

// ============================================================
// 共通パイプライン処理
// ============================================================

/**
 * tl;dvとWhisper両方から呼ばれる共通処理。
 *
 * 1. chunksテーブルにINSERT
 * 2. 前回のextracted_dataを取得
 * 3. Haiku API呼出で差分抽出
 * 4. merge処理
 * 5. extracted_dataテーブルをUPDATE (version increment)
 * 6. generation_readiness判定を返す
 */
export async function processTranscriptChunk(
  sessionId: string,
  text: string,
  chunkIndex: number,
  supabaseClient: SupabaseClient,
  options?: {
    readonly speaker?: string;
    readonly timestamp?: number;
  },
): Promise<ExtractionResult> {
  const anthropicApiKey = process.env["ANTHROPIC_API_KEY"];
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY 環境変数が設定されていません");
  }

  const now = new Date().toISOString();
  const chunkTimestamp = options?.timestamp ?? Date.now();

  // 1. chunksテーブルにINSERT (status: processing)
  const { data: insertedChunk, error: insertError } = await supabaseClient
    .from("chunks")
    .insert({
      session_id: sessionId,
      text,
      chunk_index: chunkIndex,
      speaker: options?.speaker ?? null,
      timestamp: chunkTimestamp,
      processed: false,
      status: "processing",
      created_at: now,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("チャンク挿入エラー:", insertError.message);
    throw new Error(`チャンクの保存に失敗しました: ${insertError.message}`);
  }

  const chunkId = (insertedChunk as { id: string }).id;

  try {
    // 2. 前回のextracted_dataを取得
    const { data: sessionData, error: sessionError } = await supabaseClient
      .from("sessions")
      .select("extracted_data, version")
      .eq("session_id", sessionId)
      .single();

    if (sessionError) {
      console.error("セッション取得エラー:", sessionError.message);
      throw new Error(`セッション情報の取得に失敗しました: ${sessionError.message}`);
    }

    const session = sessionData as {
      extracted_data: ExtractedDataWithConfidence | null;
      version: number;
    } | null;

    const previousData: ExtractedDataWithConfidence | null =
      session?.extracted_data ?? null;
    const previousVersion = session?.version ?? 0;

    // 3-4. Haiku API呼出 + マージ
    const { merged, fieldsUpdated } = await extractAndMerge(
      text,
      previousData,
      anthropicApiKey,
    );

    // 5. extracted_dataテーブルをUPDATE (version increment)
    const newVersion = previousVersion + 1;

    const { error: updateError } = await supabaseClient
      .from("sessions")
      .update({
        extracted_data: merged,
        version: newVersion,
        updated_at: now,
      })
      .eq("session_id", sessionId);

    if (updateError) {
      console.error("セッション更新エラー:", updateError.message);
      throw new Error(`抽出データの更新に失敗しました: ${updateError.message}`);
    }

    // チャンクを completed に更新
    await supabaseClient
      .from("chunks")
      .update({
        processed: true,
        status: "completed",
      })
      .eq("id", chunkId);

    // 6. generation_readiness判定
    const readiness = checkGenerationReadiness(merged);

    return {
      data: merged,
      version: newVersion,
      fields_updated: fieldsUpdated,
      readiness,
    };
  } catch (error) {
    // エラー時はchunkを "failed" ステータスで保存して次に進む
    const errorMessage = error instanceof Error ? error.message : "不明なエラー";

    await supabaseClient
      .from("chunks")
      .update({
        processed: false,
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", chunkId);

    throw error;
  }
}

// ============================================================
// セッション管理ヘルパー
// ============================================================

/**
 * meeting_id から session_id を検索する。
 * tl;dv Webhook用。見つからなければ新規作成する。
 */
export async function resolveSessionFromMeetingId(
  meetingId: string,
  supabaseClient: SupabaseClient,
): Promise<{ sessionId: string; chunkIndex: number }> {
  // 既存セッションを検索
  const { data: existing, error: lookupError } = await supabaseClient
    .from("sessions")
    .select("session_id")
    .eq("meeting_id", meetingId)
    .single();

  if (lookupError && lookupError.code !== "PGRST116") {
    // PGRST116 = no rows found (これは正常)
    throw new Error(`セッション検索に失敗しました: ${lookupError.message}`);
  }

  if (existing) {
    const sessionId = (existing as { session_id: string }).session_id;

    // 現在のチャンク数を取得
    const { count, error: countError } = await supabaseClient
      .from("chunks")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (countError) {
      throw new Error(`チャンク数の取得に失敗しました: ${countError.message}`);
    }

    return { sessionId, chunkIndex: count ?? 0 };
  }

  // 新規セッション作成
  const sessionId = `tldv_${meetingId}_${Date.now()}`;
  const now = new Date().toISOString();

  const { error: createError } = await supabaseClient
    .from("sessions")
    .insert({
      session_id: sessionId,
      meeting_id: meetingId,
      extracted_data: createEmptyExtractedData(),
      version: 0,
      status: "active",
      created_at: now,
      updated_at: now,
    });

  if (createError) {
    throw new Error(`セッション作成に失敗しました: ${createError.message}`);
  }

  return { sessionId, chunkIndex: 0 };
}

/**
 * ミーティング終了時の全文保存処理。
 */
export async function saveMeetingTranscript(
  meetingId: string,
  fullTranscript: string,
  supabaseClient: SupabaseClient,
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabaseClient
    .from("sessions")
    .update({
      full_transcript: fullTranscript,
      status: "completed",
      updated_at: now,
    })
    .eq("meeting_id", meetingId);

  if (error) {
    throw new Error(`全文トランスクリプトの保存に失敗しました: ${error.message}`);
  }
}
