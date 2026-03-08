/**
 * LP Engine - 型定義
 */

// ============================================================
// リクエスト / レスポンス
// ============================================================

/** テンプレートID (1: CloudCUS系, 2: AUTOHUNT系, 3: ERUCORE系) */
export type TemplateId = 1 | 2 | 3;

/** FAQ項目 */
export interface FaqItem {
  readonly q: string;
  readonly a: string;
}

/** 会社情報 */
export interface CompanyInfo {
  readonly name?: string;
  readonly address?: string;
  readonly representative?: string;
  readonly established?: string;
  readonly capital?: string;
  readonly business?: string;
}

/** Haiku抽出データ (APIリクエストbody.extracted_data) */
export interface ExtractedData {
  readonly company_name: string;
  readonly service_name: string;
  readonly industry: string;
  readonly target_customer: string;
  readonly strengths: readonly string[];
  readonly pain_points?: readonly string[];
  readonly price_range?: string;
  readonly desired_outcome?: string;
  readonly tone_keywords?: readonly string[];
  readonly og_url?: string;
  readonly og_image?: string;
  readonly canonical_url?: string;
  readonly favicon_url?: string;
  readonly site_url?: string;
  readonly contact_url?: string;
  readonly cta_url?: string;
  readonly form_action_url?: string;
  readonly phone?: string;
  readonly privacy_policy?: string;
  readonly download_form_url?: string;
  readonly contact_form_url?: string;
  readonly seminar_url?: string;
  readonly wp_url?: string;
  readonly login_url?: string;
  readonly logo_icon_url?: string;
  readonly logo_banner_url?: string;
  readonly badge_image_url?: string;
  readonly badge_image_2_url?: string;
  readonly usecase_detail_url?: string;
  readonly usecase_list_url?: string;
  readonly company_about_url?: string;
  readonly privacy_policy_url?: string;
  readonly security_policy_url?: string;
  readonly privacy_statement_url?: string;
  readonly terms_url?: string;
  readonly faq?: readonly FaqItem[];
  readonly company_info?: CompanyInfo;
  readonly about_description?: string;
}

/** generate-lp リクエストボディ */
export interface GenerateLpRequest {
  readonly session_id: string;
  readonly template_id?: TemplateId;
  readonly extracted_data: ExtractedData;
}

/** 置換統計 */
export interface ReplaceStats {
  readonly meta_replaced: number;
  readonly body_replaced: number;
  readonly meta_total_in_template: number;
  readonly body_total_in_template: number;
}

/** generate-lp 成功レスポンス */
export interface GenerateLpSuccessResponse {
  readonly success: true;
  readonly deploy_url: string;
  readonly stats: ReplaceStats;
}

/** generate-lp エラーレスポンス */
export interface GenerateLpErrorResponse {
  readonly success: false;
  readonly error: string;
  readonly details?: string;
}

/** generate-lp レスポンス */
export type GenerateLpResponse = GenerateLpSuccessResponse | GenerateLpErrorResponse;

/** session-status レスポンス */
export interface SessionStatusResponse {
  readonly status: "pending" | "processing" | "completed" | "error";
  readonly session_id: string;
  readonly extracted_fields?: readonly string[];
  readonly generation_ready: {
    readonly lp: boolean;
    readonly ad: boolean;
    readonly email: boolean;
  };
}

// ============================================================
// 内部型
// ============================================================

/** Sonnet生成コピーのキー名 */
export type SonnetCopyKey =
  | "hero_headline"
  | "hero_sub"
  | "problem_1"
  | "problem_1_body"
  | "problem_2"
  | "problem_2_body"
  | "problem_3"
  | "problem_3_body"
  | "benefit_1"
  | "benefit_1_body"
  | "benefit_2"
  | "benefit_2_body"
  | "benefit_3"
  | "benefit_3_body"
  | "cta_text"
  | "cta_sub"
  | "about_description"
  | "product_description";

/** Sonnet生成コピーデータ (部分的: パース結果はすべて揃わない可能性がある) */
export type SonnetCopyData = Partial<Record<SonnetCopyKey, string>>;

/** meta_data: {{variable}} 用の置換データ */
export type MetaData = Record<string, string>;

/** copy_data: data-placeholder 用の置換データ */
export type CopyData = Record<string, string>;

/** replace_all の戻り値 */
export interface ReplaceResult {
  readonly html: string;
  readonly meta_unreplaced: readonly string[];
  readonly body_unreplaced: readonly string[];
  readonly stats: ReplaceStats;
}

/** テンプレートスキャン結果 */
export interface TemplateScanResult {
  readonly meta_placeholders: readonly string[];
  readonly body_placeholders: readonly string[];
  readonly meta_count: number;
  readonly body_count: number;
}

/** 業種デフォルト値 */
export interface IndustryDefault {
  readonly tone: string;
  readonly pain_points: readonly string[];
  readonly cta_label: string;
}

/** 文字数制限マップ */
export type CharLimits = Record<SonnetCopyKey, number>;

// ============================================================
// 音声パイプライン型定義 (Phase A)
// ============================================================

/** 有効なconfidenceスコア */
export type ConfidenceScore = 0.3 | 0.6 | 1.0;

/** confidence付きフィールド値 */
export interface ConfidenceField<T> {
  readonly value: T;
  readonly confidence: ConfidenceScore;
}

/** 連絡先情報 */
export interface ContactInfo {
  readonly phone: string | null;
  readonly email: string | null;
  readonly line: string | null;
  readonly address: string | null;
}

/** Haiku抽出の confidence 付きデータ (内部蓄積用) */
export interface ExtractedDataWithConfidence {
  readonly company_name: ConfidenceField<string | null>;
  readonly industry: ConfidenceField<string | null>;
  readonly service_name: ConfidenceField<string | null>;
  readonly target_customer: ConfidenceField<string | null>;
  readonly price_range: ConfidenceField<string | null>;
  readonly strengths: ConfidenceField<readonly string[]>;
  readonly pain_points: ConfidenceField<readonly string[]>;
  readonly current_marketing: ConfidenceField<string | null>;
  readonly desired_outcome: ConfidenceField<string | null>;
  readonly contact_info: ConfidenceField<ContactInfo>;
  readonly tone_keywords: ConfidenceField<readonly string[]>;
  readonly upsell_signals: ConfidenceField<readonly string[]>;
}

/** 業種カテゴリ */
export type IndustryCategory =
  | "士業"
  | "飲食・サロン"
  | "BtoBサービス"
  | "不動産・建設"
  | "コンサル"
  | "その他";

/** 文字起こしチャンク */
export interface TranscriptChunk {
  readonly id: string;
  readonly session_id: string;
  readonly text: string;
  readonly chunk_index: number;
  readonly speaker?: string;
  readonly timestamp: number;
  readonly processed: boolean;
  readonly status: "pending" | "processing" | "completed" | "failed";
  readonly error_message?: string;
}

/** 制作物の生成可能判定 */
export interface ProductReadiness {
  readonly ready: boolean;
  readonly missing: readonly string[];
  readonly filled: readonly string[];
  readonly confidence_avg: number;
}

/** 抽出結果 */
export interface ExtractionResult {
  readonly data: ExtractedDataWithConfidence;
  readonly version: number;
  readonly fields_updated: readonly string[];
  readonly readiness: Record<string, ProductReadiness>;
}

/** tl;dv Webhookイベント: transcript.chunk */
export interface TldvTranscriptChunkEvent {
  readonly event: "transcript.chunk";
  readonly meeting_id: string;
  readonly text: string;
  readonly timestamp: number;
  readonly speaker: string;
}

/** tl;dv Webhookイベント: meeting.ended */
export interface TldvMeetingEndedEvent {
  readonly event: "meeting.ended";
  readonly meeting_id: string;
  readonly full_transcript: string;
}

/** tl;dv Webhookイベント (union) */
export type TldvWebhookEvent = TldvTranscriptChunkEvent | TldvMeetingEndedEvent;

/** transcribe-chunk レスポンス */
export interface TranscribeChunkResponse {
  readonly text: string;
  readonly extracted_fields_updated: readonly string[];
}

/** Supabase セッションレコード */
export interface SessionRecord {
  readonly id: string;
  readonly session_id: string;
  readonly meeting_id?: string;
  readonly extracted_data: ExtractedDataWithConfidence | null;
  readonly version: number;
  readonly status: "active" | "completed" | "error";
  readonly full_transcript?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

// ============================================================
// 制作物型定義 (P1-8: 6制作物)
// ============================================================

/** Meta広告パターン */
export interface AdPattern {
  readonly primary: string;
  readonly headline: string;
  readonly description: string;
  readonly image_direction: string;
}

/** Meta広告クリエイティブ結果 */
export interface AdCreativeResult {
  readonly patterns: readonly [AdPattern, AdPattern, AdPattern];
}

/** チラシ表面 */
export interface FlyerFront {
  readonly headline: string;
  readonly sub: string;
  readonly points: readonly [string, string, string];
  readonly cta: string;
}

/** チラシ裏面 */
export interface FlyerBack {
  readonly detail: string;
  readonly flow: readonly [string, string, string];
}

/** チラシ結果 */
export interface FlyerResult {
  readonly front: FlyerFront;
  readonly back: FlyerBack;
}

/** ヒアリングフォーム質問タイプ */
export type HearingQuestionType = "text" | "select" | "scale" | "date";

/** ヒアリングフォーム質問 */
export interface HearingQuestion {
  readonly q: string;
  readonly type: HearingQuestionType;
  readonly options?: readonly string[];
  readonly priority: number;
}

/** ヒアリングフォーム結果 */
export interface HearingFormResult {
  readonly questions: readonly HearingQuestion[];
}

/** LINE導線 日別メッセージ */
export interface LineDayMessage {
  readonly day: number;
  readonly message: string;
}

/** LINE導線設計結果 */
export interface LineDesignResult {
  readonly days: readonly LineDayMessage[];
  readonly strategy: string;
}

/** 議事録結果 */
export interface MinutesResult {
  readonly summary: string;
  readonly key_points: readonly string[];
  readonly actions: readonly string[];
  readonly next_meeting: string;
  readonly upsell_notes: string;
}

/** プロフィール連絡先 */
export interface ProfileContact {
  readonly phone: string;
  readonly email: string;
  readonly line: string;
}

/** プロフィール結果 */
export interface ProfileResult {
  readonly title: string;
  readonly service: string;
  readonly strengths: readonly string[];
  readonly target: string;
  readonly contact: ProfileContact;
}
