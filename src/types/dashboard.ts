/**
 * ダッシュボードUI型定義
 *
 * フロントエンド専用の型。バックエンドの types.ts とは独立。
 * Supabase Realtime から受け取るデータの型を定義する。
 */

// ============================================================
// 制作物関連
// ============================================================

/** 制作物タイプ (7種) */
export type DeliverableType =
  | 'lp'
  | 'ad_creative'
  | 'flyer'
  | 'hearing_form'
  | 'line_design'
  | 'minutes'
  | 'profile';

/** 制作物カードの4ステータス */
export type DeliverableStatus = 'insufficient' | 'ready' | 'generating' | 'completed';

/** 制作物ジョブ情報 */
export interface GenerationJob {
  readonly id: string;
  readonly session_id: string;
  readonly type: DeliverableType;
  readonly status: 'queued' | 'processing' | 'completed' | 'failed';
  readonly result_url: string | null;
  readonly error: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
}

/** 制作物定義 (UI用) */
export interface DeliverableDefinition {
  readonly type: DeliverableType;
  readonly label: string;
  readonly requiredFields: readonly string[];
}

// ============================================================
// 抽出データ関連
// ============================================================

/** confidence 付きフィールド値 */
export interface ConfidenceFieldValue {
  readonly value: string | readonly string[] | null;
  readonly confidence: number;
}

/** 抽出フィールド (UIカード表示用) */
export interface ExtractionField {
  readonly key: string;
  readonly label: string;
  readonly value: string | readonly string[] | null;
  readonly confidence: number;
}

/** 抽出データ全体 (Supabase data_json のフロントエンド表現) */
export type ExtractedDataMap = Record<string, ConfidenceFieldValue>;

// ============================================================
// セッション関連
// ============================================================

/** セッションステータス */
export type SessionStatus = 'active' | 'paused' | 'ended';

/** セッション情報 */
export interface SessionInfo {
  readonly id: string;
  readonly status: SessionStatus;
  readonly started_at: string;
  readonly ended_at: string | null;
}

// ============================================================
// 文字起こし関連
// ============================================================

/** 文字起こしチャンク */
export interface TranscriptChunk {
  readonly text: string;
  readonly timestamp: string;
  readonly speaker?: string;
}

// ============================================================
// 共有関連
// ============================================================

/** 共有メソッド */
export type ShareMethod = 'line' | 'email' | 'qr';

// ============================================================
// APIレスポンス
// ============================================================

/** セッション開始APIレスポンス */
export interface StartSessionResponse {
  readonly session_id: string;
}

/** 制作物生成APIレスポンス */
export interface GenerateDeliverableResponse {
  readonly success: boolean;
  readonly deploy_url?: string;
  readonly error?: string;
}

/** フィールド更新APIレスポンス */
export interface UpdateFieldResponse {
  readonly success: boolean;
  readonly error?: string;
}

/** セッション終了APIレスポンス */
export interface EndSessionResponse {
  readonly success: boolean;
  readonly error?: string;
}

/** 共有APIレスポンス */
export interface ShareAllResponse {
  readonly success: boolean;
  readonly share_url?: string;
  readonly error?: string;
}
