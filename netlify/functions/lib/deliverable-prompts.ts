/**
 * 制作物プロンプト・パーサー・バリデーション (P1-8)
 *
 * 6制作物:
 *  1. Meta広告クリエイティブ (Sonnet)
 *  2. チラシ A4 PDF (Sonnet)
 *  3. ヒアリングフォーム (Haiku)
 *  4. LINE導線設計書 (Sonnet)
 *  5. 議事録 + アクション (Haiku)
 *  6. プロフィールページ (Haiku)
 */

import type {
  ExtractedData,
  AdCreativeResult,
  AdPattern,
  FlyerResult,
  HearingFormResult,
  HearingQuestion,
  HearingQuestionType,
  LineDesignResult,
  LineDayMessage,
  MinutesResult,
  ProfileResult,
  ProfileContact,
} from "./types.js";

// ============================================================
// 定数
// ============================================================

/** Sonnet API タイムアウト (ms) */
const SONNET_TIMEOUT_MS = 60_000;

/** Haiku API タイムアウト (ms) */
const HAIKU_TIMEOUT_MS = 30_000;

/** Claude API エンドポイント */
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

/** HTMLタグ除去パターン (br以外) - 事前コンパイル */
const HTML_TAG_STRIP_RE = /<(?!br\s*\/?>)[^>]+>/g;

/** 広告パターンラベル */
const AD_PATTERN_LABELS = ["A", "B", "C"] as const;
type AdPatternLabel = (typeof AD_PATTERN_LABELS)[number];

/** 広告フィールドキー */
const AD_FIELD_KEYS = ["primary", "headline", "description", "image_direction"] as const;
type AdFieldKey = (typeof AD_FIELD_KEYS)[number];

/** 広告文字数制限 */
const AD_CHAR_LIMITS: Readonly<Record<AdFieldKey, number>> = {
  primary: 125,
  headline: 40,
  description: 30,
  image_direction: 100,
};

/** チラシ文字数制限 */
const FLYER_CHAR_LIMITS: Readonly<Record<string, number>> = {
  headline: 20,
  sub: 40,
  point: 15,
  cta: 15,
  detail: 200,
  flow: 20,
};

/** LINE文字数制限 */
const LINE_CHAR_LIMITS: Readonly<Record<string, number>> = {
  day_message: 100,
  strategy: 200,
};

/** 議事録文字数制限 */
const MINUTES_CHAR_LIMITS: Readonly<Record<string, number>> = {
  summary: 200,
};

// ============================================================
// 業種別ヒアリング質問プリセット
// ============================================================

interface PresetQuestion {
  readonly q: string;
  readonly type: HearingQuestionType;
  readonly options?: readonly string[];
}

const HEARING_PRESETS: Readonly<Record<string, readonly PresetQuestion[]>> = {
  "士業": [
    { q: "現在の主な集客方法を教えてください", type: "select", options: ["紹介", "Web検索", "SNS", "広告", "その他"] },
    { q: "月間の新規相談件数はどのくらいですか？", type: "select", options: ["1-5件", "6-10件", "11-20件", "21件以上"] },
    { q: "ホームページはお持ちですか？", type: "select", options: ["ある（更新している）", "ある（放置）", "ない"] },
    { q: "専門分野を教えてください", type: "text" },
    { q: "顧客の主な年齢層を教えてください", type: "select", options: ["20-30代", "40-50代", "60代以上", "法人中心"] },
    { q: "競合との差別化ポイントは何ですか？", type: "text" },
    { q: "現在の課題を教えてください", type: "text" },
    { q: "理想の月間問い合わせ数は？", type: "select", options: ["5件", "10件", "20件", "30件以上"] },
    { q: "マーケティング予算（月額）はどのくらいですか？", type: "select", options: ["5万円以下", "5-10万円", "10-30万円", "30万円以上"] },
    { q: "導入希望時期を教えてください", type: "date" },
  ],
  "飲食": [
    { q: "店舗の業態を教えてください", type: "select", options: ["レストラン", "カフェ", "居酒屋", "テイクアウト", "その他"] },
    { q: "席数はどのくらいですか？", type: "select", options: ["10席以下", "11-30席", "31-50席", "51席以上"] },
    { q: "現在のSNS運用状況を教えてください", type: "select", options: ["Instagram", "X(Twitter)", "LINE", "未運用"] },
    { q: "客単価はどのくらいですか？", type: "select", options: ["1000円以下", "1000-3000円", "3000-5000円", "5000円以上"] },
    { q: "リピーター率はどのくらいですか？", type: "scale" },
    { q: "予約システムは導入していますか？", type: "select", options: ["はい", "いいえ", "検討中"] },
    { q: "集客で困っていることを教えてください", type: "text" },
    { q: "ターゲット層を教えてください", type: "text" },
    { q: "デリバリー対応はしていますか？", type: "select", options: ["はい", "いいえ", "検討中"] },
    { q: "導入希望時期を教えてください", type: "date" },
  ],
  "BtoB": [
    { q: "提供サービスの概要を教えてください", type: "text" },
    { q: "ターゲット企業の規模は？", type: "select", options: ["中小企業", "中堅企業", "大企業", "全規模"] },
    { q: "現在のリード獲得方法を教えてください", type: "select", options: ["テレアポ", "展示会", "Web広告", "紹介", "その他"] },
    { q: "営業チームの人数は？", type: "select", options: ["1-3名", "4-10名", "11-30名", "31名以上"] },
    { q: "商談からの成約率はどのくらいですか？", type: "scale" },
    { q: "平均契約単価はどのくらいですか？", type: "select", options: ["10万円以下", "10-50万円", "50-200万円", "200万円以上"] },
    { q: "リードタイムはどのくらいですか？", type: "select", options: ["即日-1週間", "1-3ヶ月", "3-6ヶ月", "半年以上"] },
    { q: "CRM/SFAは導入していますか？", type: "select", options: ["はい", "いいえ", "検討中"] },
    { q: "マーケティング予算（月額）はどのくらいですか？", type: "select", options: ["10万円以下", "10-50万円", "50-100万円", "100万円以上"] },
    { q: "導入希望時期を教えてください", type: "date" },
  ],
  "不動産": [
    { q: "主な取扱物件のタイプは？", type: "select", options: ["売買（住宅）", "売買（投資）", "賃貸", "管理", "その他"] },
    { q: "対象エリアを教えてください", type: "text" },
    { q: "月間の問い合わせ件数はどのくらいですか？", type: "select", options: ["1-10件", "11-30件", "31-50件", "51件以上"] },
    { q: "ポータルサイトは利用していますか？", type: "select", options: ["SUUMO", "HOME'S", "at home", "未利用"] },
    { q: "自社サイトのPV数は？", type: "select", options: ["100以下", "100-1000", "1000-5000", "5000以上"] },
    { q: "スタッフ人数は？", type: "select", options: ["1-3名", "4-10名", "11-20名", "21名以上"] },
    { q: "集客の課題を教えてください", type: "text" },
    { q: "顧客の主な年齢層は？", type: "select", options: ["20-30代", "40-50代", "60代以上", "法人"] },
    { q: "マーケティング予算（月額）は？", type: "select", options: ["10万円以下", "10-30万円", "30-100万円", "100万円以上"] },
    { q: "導入希望時期を教えてください", type: "date" },
  ],
  "コンサル": [
    { q: "専門分野を教えてください", type: "text" },
    { q: "コンサルティングの形態は？", type: "select", options: ["個人向け", "法人向け", "両方"] },
    { q: "現在の主な集客方法を教えてください", type: "select", options: ["紹介", "セミナー", "SNS", "広告", "その他"] },
    { q: "月間のクライアント数は？", type: "select", options: ["1-3社", "4-10社", "11-20社", "21社以上"] },
    { q: "平均契約期間はどのくらいですか？", type: "select", options: ["単発", "3ヶ月", "6ヶ月", "1年以上"] },
    { q: "単価はどのくらいですか？", type: "select", options: ["5万円以下", "5-20万円", "20-50万円", "50万円以上"] },
    { q: "強みや実績を教えてください", type: "text" },
    { q: "ターゲット顧客像を教えてください", type: "text" },
    { q: "今後のビジョンを教えてください", type: "text" },
    { q: "導入希望時期を教えてください", type: "date" },
  ],
};

// ============================================================
// ユーティリティ関数
// ============================================================

/**
 * XMLタグの中身を抽出する。見つからなければ空文字。
 */
function extractTag(text: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`);
  const match = pattern.exec(text);
  if (match?.[1] !== undefined) {
    let content = match[1].trim();
    content = content.replace(HTML_TAG_STRIP_RE, "");
    return content;
  }
  return "";
}

/**
 * 文字数制限でトリム。句点/読点位置で区切る。
 */
function trimToLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let truncated = text.slice(0, limit);
  const lastPeriod = Math.max(
    truncated.lastIndexOf("\u3002"),
    truncated.lastIndexOf("\u3001"),
  );
  if (lastPeriod > limit * 0.6) {
    truncated = truncated.slice(0, lastPeriod + 1);
  }
  return truncated;
}

/**
 * バレットリスト (- で始まる行) をパースして配列に変換。
 */
function parseBulletList(text: string): readonly string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Claude API を呼び出す共通関数。
 */
async function callClaudeApi(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: "sonnet" | "haiku",
): Promise<string> {
  const timeoutMs = model === "sonnet" ? SONNET_TIMEOUT_MS : HAIKU_TIMEOUT_MS;
  const modelId = model === "sonnet"
    ? "claude-sonnet-4-20250514"
    : "claude-haiku-4-20250414";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Claude API エラー (${response.status}): ${errorBody}`);
    }

    const json = await response.json() as {
      content: readonly { type: string; text: string }[];
    };

    const textBlock = json.content.find((block) => block.type === "text");
    if (!textBlock) {
      throw new Error("Claude APIレスポンスにテキストブロックがありません");
    }

    return textBlock.text;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 必須フィールドの存在チェック。
 */
function validateRequiredFields(
  data: ExtractedData,
  requiredFields: readonly string[],
): void {
  const missing: string[] = [];
  for (const field of requiredFields) {
    const value = data[field as keyof ExtractedData];
    if (value === undefined || value === null || value === "") {
      missing.push(field);
    }
    if (Array.isArray(value) && value.length === 0) {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    throw new Error(`必須フィールドが不足しています: ${missing.join(", ")}`);
  }
}

// ============================================================
// 制作物1: Meta広告クリエイティブ (Sonnet)
// ============================================================

const SYSTEM_PROMPT_AD = `あなたはMeta広告のコピーライターです。
以下3パターンを生成してください：
パターンA: 課題訴求型（「こんなお悩みありませんか？」系）
パターンB: 実績訴求型（数字・実績を前面に）
パターンC: 緊急性型（「今だけ」「期間限定」系）

各パターンの出力形式：
<ad_A_primary>メインテキスト（125字以内）</ad_A_primary>
<ad_A_headline>見出し（40字以内）</ad_A_headline>
<ad_A_description>説明文（30字以内）</ad_A_description>
<ad_A_image_direction>画像構成指示（100字以内）</ad_A_image_direction>
（B, Cも同様）`;

const AD_REQUIRED_FIELDS = ["service_name", "target_customer", "pain_points", "strengths", "industry"] as const;

function buildAdUserPrompt(data: ExtractedData): string {
  const painPoints = data.pain_points ?? [];
  return `以下のビジネス情報に基づいてMeta広告コピーを3パターン生成してください。

サービス名: ${data.service_name}
ターゲット: ${data.target_customer}
課題: ${painPoints.join(", ")}
強み: ${data.strengths.join(", ")}
業種: ${data.industry}`;
}

function parseAdResponse(responseText: string): AdCreativeResult {
  const patterns: AdPattern[] = [];

  for (const label of AD_PATTERN_LABELS) {
    const pattern: Record<string, string> = {};
    for (const field of AD_FIELD_KEYS) {
      const tagName = `ad_${label}_${field}`;
      let value = extractTag(responseText, tagName);
      const limit = AD_CHAR_LIMITS[field];
      if (limit !== undefined) {
        value = trimToLimit(value, limit);
      }
      pattern[field] = value;
    }
    patterns.push({
      primary: pattern["primary"] ?? "",
      headline: pattern["headline"] ?? "",
      description: pattern["description"] ?? "",
      image_direction: pattern["image_direction"] ?? "",
    });
  }

  return { patterns: patterns as unknown as readonly [AdPattern, AdPattern, AdPattern] };
}

function validateAdResult(result: AdCreativeResult): void {
  if (result.patterns.length !== 3) {
    throw new Error(`広告パターン数が不正です: ${String(result.patterns.length)}（3パターン必要）`);
  }
  for (let i = 0; i < result.patterns.length; i++) {
    const p = result.patterns[i];
    if (!p) {
      throw new Error(`広告パターン${String(i)}が存在しません`);
    }
    if (!p.primary || !p.headline || !p.description) {
      throw new Error(`広告パターン${AD_PATTERN_LABELS[i] ?? String(i)}のフィールドが不足しています`);
    }
  }
}

export async function generateAdCreative(
  data: ExtractedData,
  apiKey: string,
): Promise<AdCreativeResult> {
  validateRequiredFields(data, AD_REQUIRED_FIELDS);
  const userPrompt = buildAdUserPrompt(data);
  const responseText = await callClaudeApi(SYSTEM_PROMPT_AD, userPrompt, apiKey, "sonnet");
  const result = parseAdResponse(responseText);
  validateAdResult(result);
  return result;
}

// ============================================================
// 制作物2: チラシ A4 PDF (Sonnet)
// ============================================================

const SYSTEM_PROMPT_FLYER = `あなたはA4チラシのコピーライターです。表面と裏面のコピーを生成してください。

表面出力形式:
<flyer_headline>メインコピー（20字以内）</flyer_headline>
<flyer_sub>サブコピー（40字以内）</flyer_sub>
<flyer_point_1>ポイント1（15字以内）</flyer_point_1>
<flyer_point_2>ポイント2（15字以内）</flyer_point_2>
<flyer_point_3>ポイント3（15字以内）</flyer_point_3>
<flyer_cta>行動喚起（15字以内）</flyer_cta>

裏面出力形式:
<flyer_detail>サービス詳細説明（200字以内）</flyer_detail>
<flyer_flow_1>ステップ1（20字以内）</flyer_flow_1>
<flyer_flow_2>ステップ2（20字以内）</flyer_flow_2>
<flyer_flow_3>ステップ3（20字以内）</flyer_flow_3>`;

const FLYER_REQUIRED_FIELDS = ["company_name", "service_name", "industry", "strengths", "price_range"] as const;

function buildFlyerUserPrompt(data: ExtractedData): string {
  const strengths = [...data.strengths];
  let strengthInstruction = "";
  if (strengths.length <= 2) {
    strengthInstruction = "\n\n※強みが少ないため、既存の強みを拡張して3つのポイントを生成してください。";
  }

  let prompt = `以下のビジネス情報に基づいてA4チラシのコピーを生成してください。

会社名: ${data.company_name}
サービス名: ${data.service_name}
業種: ${data.industry}
強み: ${strengths.join(", ")}
価格帯: ${data.price_range ?? "お問い合わせください"}`;

  if (strengthInstruction) {
    prompt += strengthInstruction;
  }

  return prompt;
}

function parseFlyerResponse(responseText: string): FlyerResult {
  const headline = trimToLimit(extractTag(responseText, "flyer_headline"), FLYER_CHAR_LIMITS["headline"] ?? 20);
  const sub = trimToLimit(extractTag(responseText, "flyer_sub"), FLYER_CHAR_LIMITS["sub"] ?? 40);
  const point1 = trimToLimit(extractTag(responseText, "flyer_point_1"), FLYER_CHAR_LIMITS["point"] ?? 15);
  const point2 = trimToLimit(extractTag(responseText, "flyer_point_2"), FLYER_CHAR_LIMITS["point"] ?? 15);
  const point3 = trimToLimit(extractTag(responseText, "flyer_point_3"), FLYER_CHAR_LIMITS["point"] ?? 15);
  const cta = trimToLimit(extractTag(responseText, "flyer_cta"), FLYER_CHAR_LIMITS["cta"] ?? 15);
  const detail = trimToLimit(extractTag(responseText, "flyer_detail"), FLYER_CHAR_LIMITS["detail"] ?? 200);
  const flow1 = trimToLimit(extractTag(responseText, "flyer_flow_1"), FLYER_CHAR_LIMITS["flow"] ?? 20);
  const flow2 = trimToLimit(extractTag(responseText, "flyer_flow_2"), FLYER_CHAR_LIMITS["flow"] ?? 20);
  const flow3 = trimToLimit(extractTag(responseText, "flyer_flow_3"), FLYER_CHAR_LIMITS["flow"] ?? 20);

  return {
    front: {
      headline,
      sub,
      points: [point1, point2, point3],
      cta,
    },
    back: {
      detail,
      flow: [flow1, flow2, flow3],
    },
  };
}

function validateFlyerResult(result: FlyerResult): void {
  if (!result.front.headline) {
    throw new Error("チラシのメインコピーが空です");
  }
  if (!result.front.cta) {
    throw new Error("チラシの行動喚起が空です");
  }
}

export async function generateFlyer(
  data: ExtractedData,
  apiKey: string,
): Promise<FlyerResult> {
  validateRequiredFields(data, FLYER_REQUIRED_FIELDS);
  const userPrompt = buildFlyerUserPrompt(data);
  const responseText = await callClaudeApi(SYSTEM_PROMPT_FLYER, userPrompt, apiKey, "sonnet");
  const result = parseFlyerResponse(responseText);
  validateFlyerResult(result);
  return result;
}

// ============================================================
// 制作物3: ヒアリングフォーム (Haiku)
// ============================================================

const SYSTEM_PROMPT_HEARING = `あなたはヒアリングフォームの質問設計者です。
業種に最適な質問10問を選択し、最適な順番に並べ替えてJSON配列で出力してください。

出力形式:
[
  {"q": "質問文", "type": "text|select|scale|date", "options": ["選択肢1", "選択肢2"], "priority": 1}
]

typeの説明:
- text: 自由記述
- select: 選択式（optionsを必ず含める）
- scale: 5段階評価
- date: 日付入力

priorityは1（最重要）から10（低重要度）で指定してください。
JSON配列のみを出力し、それ以外のテキストは含めないでください。`;

const HEARING_REQUIRED_FIELDS = ["industry", "service_name", "company_name"] as const;

function getHearingPreset(industry: string): readonly PresetQuestion[] {
  for (const [key, preset] of Object.entries(HEARING_PRESETS)) {
    if (key.includes(industry) || industry.includes(key)) {
      return preset;
    }
  }
  // 汎用プリセット
  return [
    { q: "現在の主な集客方法を教えてください", type: "text" },
    { q: "月間の問い合わせ件数はどのくらいですか？", type: "select", options: ["1-10件", "11-30件", "31-50件", "51件以上"] },
    { q: "ホームページはお持ちですか？", type: "select", options: ["ある（更新している）", "ある（放置）", "ない"] },
    { q: "ターゲット層を教えてください", type: "text" },
    { q: "競合との差別化ポイントは何ですか？", type: "text" },
    { q: "現在の課題を教えてください", type: "text" },
    { q: "マーケティング予算（月額）はどのくらいですか？", type: "select", options: ["5万円以下", "5-20万円", "20-50万円", "50万円以上"] },
    { q: "SNSの運用状況を教えてください", type: "select", options: ["運用中", "アカウントのみ", "未開設"] },
    { q: "理想の成果を教えてください", type: "text" },
    { q: "導入希望時期を教えてください", type: "date" },
  ];
}

function buildHearingUserPrompt(data: ExtractedData): string {
  const preset = getHearingPreset(data.industry);
  const presetJson = JSON.stringify(preset, null, 2);

  return `以下のビジネス情報と質問プリセットを参考に、最適な質問10問を選択・カスタマイズしてJSON配列で出力してください。

会社名: ${data.company_name}
サービス名: ${data.service_name}
業種: ${data.industry}

質問プリセット:
${presetJson}`;
}

const VALID_QUESTION_TYPES: readonly HearingQuestionType[] = ["text", "select", "scale", "date"];

function parseHearingResponse(responseText: string): HearingFormResult {
  // JSON部分を抽出（レスポンスに余分なテキストが含まれる場合に対応）
  const jsonMatch = /\[[\s\S]*\]/.exec(responseText);
  if (!jsonMatch) {
    throw new Error("ヒアリングフォームのJSONパースに失敗しました");
  }

  const parsed = JSON.parse(jsonMatch[0]) as readonly Record<string, unknown>[];
  if (!Array.isArray(parsed)) {
    throw new Error("ヒアリングフォームのレスポンスが配列ではありません");
  }

  const questions: HearingQuestion[] = parsed.map((item, index) => {
    const q = typeof item["q"] === "string" ? item["q"] : `質問${String(index + 1)}`;
    const rawType = typeof item["type"] === "string" ? item["type"] : "text";
    const type: HearingQuestionType = VALID_QUESTION_TYPES.includes(rawType as HearingQuestionType)
      ? (rawType as HearingQuestionType)
      : "text";
    const rawOptions = item["options"];
    const options: readonly string[] | undefined = Array.isArray(rawOptions)
      ? rawOptions.filter((o): o is string => typeof o === "string")
      : undefined;
    const rawPriority = item["priority"];
    const priority = typeof rawPriority === "number" ? rawPriority : index + 1;

    const result: HearingQuestion = { q, type, priority };
    if (options !== undefined && options.length > 0) {
      return { ...result, options };
    }
    return result;
  });

  return { questions };
}

function validateHearingResult(result: HearingFormResult): void {
  if (result.questions.length === 0) {
    throw new Error("ヒアリングフォームの質問が空です");
  }
  for (const q of result.questions) {
    if (!q.q) {
      throw new Error("質問文が空の項目があります");
    }
    if (q.type === "select" && (!q.options || q.options.length === 0)) {
      throw new Error(`選択式の質問に選択肢がありません: ${q.q}`);
    }
  }
}

export async function generateHearingForm(
  data: ExtractedData,
  apiKey: string,
): Promise<HearingFormResult> {
  validateRequiredFields(data, HEARING_REQUIRED_FIELDS);
  const userPrompt = buildHearingUserPrompt(data);
  const responseText = await callClaudeApi(SYSTEM_PROMPT_HEARING, userPrompt, apiKey, "haiku");
  const result = parseHearingResponse(responseText);
  validateHearingResult(result);
  return result;
}

// ============================================================
// 制作物4: LINE導線設計書 (Sonnet)
// ============================================================

const SYSTEM_PROMPT_LINE = `あなたはLINEマーケティングの専門家です。
友だち追加後の7日間ステップ配信シナリオを設計してください。

出力形式:
<line_day0>追加直後の挨拶メッセージ（100字以内）</line_day0>
<line_day1>翌日の価値提供メッセージ（100字以内）</line_day1>
<line_day3>事例・実績紹介（100字以内）</line_day3>
<line_day5>課題提起+解決策（100字以内）</line_day5>
<line_day7>オファー+CTA（100字以内）</line_day7>
<line_strategy>全体戦略メモ（200字以内）</line_strategy>`;

const LINE_REQUIRED_FIELDS = ["service_name", "target_customer", "strengths", "industry"] as const;

const LINE_DAY_TAGS = [
  { tag: "line_day0", day: 0 },
  { tag: "line_day1", day: 1 },
  { tag: "line_day3", day: 3 },
  { tag: "line_day5", day: 5 },
  { tag: "line_day7", day: 7 },
] as const;

function buildLineUserPrompt(data: ExtractedData): string {
  return `以下のビジネス情報に基づいてLINEステップ配信シナリオを設計してください。

サービス名: ${data.service_name}
ターゲット: ${data.target_customer}
強み: ${data.strengths.join(", ")}
業種: ${data.industry}`;
}

function parseLineResponse(responseText: string): LineDesignResult {
  const dayLimit = LINE_CHAR_LIMITS["day_message"] ?? 100;
  const strategyLimit = LINE_CHAR_LIMITS["strategy"] ?? 200;

  const days: LineDayMessage[] = LINE_DAY_TAGS.map(({ tag, day }) => {
    const message = trimToLimit(extractTag(responseText, tag), dayLimit);
    return { day, message };
  });

  const strategy = trimToLimit(extractTag(responseText, "line_strategy"), strategyLimit);

  return { days, strategy };
}

function validateLineResult(result: LineDesignResult): void {
  if (result.days.length === 0) {
    throw new Error("LINE配信シナリオが空です");
  }
  const emptyDays = result.days.filter((d) => !d.message);
  if (emptyDays.length > 2) {
    throw new Error("LINE配信メッセージの半数以上が空です");
  }
}

export async function generateLineDesign(
  data: ExtractedData,
  apiKey: string,
): Promise<LineDesignResult> {
  validateRequiredFields(data, LINE_REQUIRED_FIELDS);
  const userPrompt = buildLineUserPrompt(data);
  const responseText = await callClaudeApi(SYSTEM_PROMPT_LINE, userPrompt, apiKey, "sonnet");
  const result = parseLineResponse(responseText);
  validateLineResult(result);
  return result;
}

// ============================================================
// 制作物5: 議事録 + アクション (Haiku)
// ============================================================

const SYSTEM_PROMPT_MINUTES = `あなたは商談議事録の作成者です。以下の形式で出力してください:

<summary>全体要約（200字以内）</summary>
<key_points>
- 重要ポイント1
- 重要ポイント2
</key_points>
<actions>
- [担当] アクション1 (期限)
- [担当] アクション2 (期限)
</actions>
<next_meeting>次回予定</next_meeting>
<upsell_notes>アップセルのヒント（社内共有用、相手には見せない）</upsell_notes>`;

function buildMinutesUserPrompt(transcript: string, data: ExtractedData): string {
  return `以下の商談議事録を要約してください。

会社名: ${data.company_name}

=== 商談全文 ===
${transcript}`;
}

function parseMinutesResponse(responseText: string): MinutesResult {
  const summaryLimit = MINUTES_CHAR_LIMITS["summary"] ?? 200;
  const summary = trimToLimit(extractTag(responseText, "summary"), summaryLimit);
  const keyPointsRaw = extractTag(responseText, "key_points");
  const key_points = parseBulletList(keyPointsRaw);
  const actionsRaw = extractTag(responseText, "actions");
  const actions = parseBulletList(actionsRaw);
  const next_meeting = extractTag(responseText, "next_meeting");
  const upsell_notes = extractTag(responseText, "upsell_notes");

  return { summary, key_points, actions, next_meeting, upsell_notes };
}

function validateMinutesResult(result: MinutesResult): void {
  if (!result.summary) {
    throw new Error("議事録の要約が空です");
  }
}

export async function generateMinutes(
  transcript: string,
  data: ExtractedData,
  apiKey: string,
): Promise<MinutesResult> {
  if (!transcript || transcript.trim().length === 0) {
    throw new Error("議事録の生成にはトランスクリプトが必要です");
  }
  if (!data.company_name) {
    throw new Error("必須フィールドが不足しています: company_name");
  }
  const userPrompt = buildMinutesUserPrompt(transcript, data);
  const responseText = await callClaudeApi(SYSTEM_PROMPT_MINUTES, userPrompt, apiKey, "haiku");
  const result = parseMinutesResponse(responseText);
  validateMinutesResult(result);
  return result;
}

// ============================================================
// 制作物6: プロフィールページ (Haiku)
// ============================================================

const SYSTEM_PROMPT_PROFILE = `以下のJSONデータをプロフィールページの各セクションにマッピングしてください。
コピーは生成せず、JSONの値をそのまま配置してください。

出力形式（JSON）:
{
  "title": "会社名",
  "service": "サービス名",
  "strengths": ["強み1", "強み2", "強み3"],
  "target": "ターゲット",
  "contact": { "phone": "", "email": "", "line": "" }
}

JSONのみを出力し、それ以外のテキストは含めないでください。`;

const PROFILE_REQUIRED_FIELDS = ["company_name", "service_name", "industry", "strengths"] as const;

function buildProfileUserPrompt(data: ExtractedData): string {
  const contactInfo = {
    phone: data.phone ?? "",
    email: "",
    line: "",
  };

  return `以下のビジネス情報をプロフィールページ用のJSONに変換してください。

会社名: ${data.company_name}
サービス名: ${data.service_name}
業種: ${data.industry}
強み: ${data.strengths.join(", ")}
ターゲット: ${data.target_customer ?? ""}
連絡先: ${JSON.stringify(contactInfo)}`;
}

function parseProfileResponse(responseText: string): ProfileResult {
  const jsonMatch = /\{[\s\S]*\}/.exec(responseText);
  if (!jsonMatch) {
    throw new Error("プロフィールのJSONパースに失敗しました");
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  const title = typeof parsed["title"] === "string" ? parsed["title"] : "";
  const service = typeof parsed["service"] === "string" ? parsed["service"] : "";
  const rawStrengths = parsed["strengths"];
  const strengths: readonly string[] = Array.isArray(rawStrengths)
    ? rawStrengths.filter((s): s is string => typeof s === "string")
    : [];
  const target = typeof parsed["target"] === "string" ? parsed["target"] : "";

  const rawContact = parsed["contact"];
  let contact: ProfileContact = { phone: "", email: "", line: "" };
  if (rawContact !== null && typeof rawContact === "object" && !Array.isArray(rawContact)) {
    const c = rawContact as Record<string, unknown>;
    contact = {
      phone: typeof c["phone"] === "string" ? c["phone"] : "",
      email: typeof c["email"] === "string" ? c["email"] : "",
      line: typeof c["line"] === "string" ? c["line"] : "",
    };
  }

  return { title, service, strengths, target, contact };
}

function validateProfileResult(result: ProfileResult): void {
  if (!result.title) {
    throw new Error("プロフィールのタイトルが空です");
  }
  if (!result.service) {
    throw new Error("プロフィールのサービス名が空です");
  }
}

export async function generateProfile(
  data: ExtractedData,
  apiKey: string,
): Promise<ProfileResult> {
  validateRequiredFields(data, PROFILE_REQUIRED_FIELDS);
  const userPrompt = buildProfileUserPrompt(data);
  const responseText = await callClaudeApi(SYSTEM_PROMPT_PROFILE, userPrompt, apiKey, "haiku");
  const result = parseProfileResponse(responseText);
  validateProfileResult(result);
  return result;
}

// ============================================================
// パーサー・バリデーション単体エクスポート (テスト用)
// ============================================================

export {
  extractTag,
  trimToLimit,
  parseBulletList,
  parseAdResponse,
  validateAdResult,
  parseFlyerResponse,
  validateFlyerResult,
  parseHearingResponse,
  validateHearingResult,
  parseLineResponse,
  validateLineResult,
  parseMinutesResponse,
  validateMinutesResult,
  parseProfileResponse,
  validateProfileResult,
  buildAdUserPrompt,
  buildFlyerUserPrompt,
  buildHearingUserPrompt,
  buildLineUserPrompt,
  buildMinutesUserPrompt,
  buildProfileUserPrompt,
  getHearingPreset,
  validateRequiredFields,
  HEARING_PRESETS,
  SYSTEM_PROMPT_AD,
  SYSTEM_PROMPT_FLYER,
  SYSTEM_PROMPT_HEARING,
  SYSTEM_PROMPT_LINE,
  SYSTEM_PROMPT_MINUTES,
  SYSTEM_PROMPT_PROFILE,
};
