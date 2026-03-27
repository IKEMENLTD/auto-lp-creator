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
 * 2. extracted_dataテーブルから前回データ取得
 * 3. Haiku API呼出で差分抽出
 * 4. merge処理
 * 5. extracted_dataテーブルをUPSERT (version increment)
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

  // 1. chunksテーブルにINSERT
  const { data: insertedChunk, error: insertError } = await supabaseClient
    .from("chunks")
    .insert({
      session_id: sessionId,
      text,
      chunk_index: chunkIndex,
      speaker: options?.speaker ?? null,
      timestamp: options?.timestamp ? new Date(options.timestamp).toISOString() : now,
      processed: false,
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
    // 2. extracted_dataテーブルから前回データを取得
    const { data: extractionRow, error: extractionError } = await supabaseClient
      .from("extracted_data")
      .select("id, data_json, version")
      .eq("session_id", sessionId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (extractionError) {
      console.error("抽出データ取得エラー:", extractionError.message);
      throw new Error(`抽出データの取得に失敗しました: ${extractionError.message}`);
    }

    const previousData: ExtractedDataWithConfidence | null =
      (extractionRow?.data_json as ExtractedDataWithConfidence | null) ?? null;
    const previousVersion = extractionRow?.version ?? 0;

    // 3-4. Haiku API呼出 + マージ
    const { merged, fieldsUpdated } = await extractAndMerge(
      text,
      previousData,
      anthropicApiKey,
    );

    // 5. extracted_dataテーブルをUPSERT (version increment)
    const newVersion = previousVersion + 1;

    if (extractionRow) {
      // 既存レコードを更新
      const { error: updateError } = await supabaseClient
        .from("extracted_data")
        .update({
          data_json: merged as unknown as Record<string, unknown>,
          version: newVersion,
        })
        .eq("id", extractionRow.id);

      if (updateError) {
        console.error("抽出データ更新エラー:", updateError.message);
        throw new Error(`抽出データの更新に失敗しました: ${updateError.message}`);
      }
    } else {
      // 新規レコード作成
      const { error: insertExtError } = await supabaseClient
        .from("extracted_data")
        .insert({
          session_id: sessionId,
          data_json: merged as unknown as Record<string, unknown>,
          version: newVersion,
        });

      if (insertExtError) {
        console.error("抽出データ挿入エラー:", insertExtError.message);
        throw new Error(`抽出データの挿入に失敗しました: ${insertExtError.message}`);
      }
    }

    // チャンクを processed: true に更新
    await supabaseClient
      .from("chunks")
      .update({
        processed: true,
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
    // エラー時はchunkを未処理のままにする
    await supabaseClient
      .from("chunks")
      .update({
        processed: false,
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
    .select("id")
    .eq("meeting_id", meetingId)
    .single();

  if (lookupError && lookupError.code !== "PGRST116") {
    // PGRST116 = no rows found (これは正常)
    throw new Error(`セッション検索に失敗しました: ${lookupError.message}`);
  }

  if (existing) {
    const sessionId = (existing as { id: string }).id;

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

  // 新規セッション作成 (ANONYMOUS_USER_ID を使用)
  const ANONYMOUS_USER_ID = "00000000-0000-4000-a000-000000000000";

  const { data: newSession, error: createError } = await supabaseClient
    .from("sessions")
    .insert({
      user_id: ANONYMOUS_USER_ID,
      meeting_id: meetingId,
      status: "active",
    })
    .select("id")
    .single();

  if (createError) {
    throw new Error(`セッション作成に失敗しました: ${createError.message}`);
  }

  const sessionId = (newSession as { id: string }).id;

  // extracted_data の初期レコード作成
  await supabaseClient
    .from("extracted_data")
    .insert({
      session_id: sessionId,
      data_json: createEmptyExtractedData() as unknown as Record<string, unknown>,
      version: 1,
    });

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
  const { error } = await supabaseClient
    .from("sessions")
    .update({
      full_transcript: fullTranscript,
      status: "ended",
      ended_at: new Date().toISOString(),
    })
    .eq("meeting_id", meetingId);

  if (error) {
    throw new Error(`全文トランスクリプトの保存に失敗しました: ${error.message}`);
  }
}
