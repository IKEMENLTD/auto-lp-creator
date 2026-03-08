/**
 * Sonnet コピー生成プロンプト - TypeScript移植
 * Python sonnet_prompts.py からの移植
 *
 * 各テンプレートの data-placeholder に対応するコピーを
 * Claude Sonnet に生成させるためのプロンプト定義。
 */

import type {
  ExtractedData,
  IndustryDefault,
  SonnetCopyData,
  SonnetCopyKey,
  MetaData,
  CopyData,
  CharLimits,
  TemplateId,
} from "./types.js";

// ============================================================
// 業種別デフォルト値
// ============================================================
export const INDUSTRY_DEFAULTS: Readonly<Record<string, IndustryDefault>> = {
  "士業": {
    tone: "信頼感・誠実・専門性",
    pain_points: [
      "集客に時間が取れない",
      "紹介頼みの営業から脱却したい",
      "ホームページが古いまま",
    ],
    cta_label: "無料相談を予約する",
  },
  "飲食・サロン": {
    tone: "温かみ・親しみやすさ・ビジュアル重視",
    pain_points: [
      "新規客が増えない",
      "リピーターが定着しない",
      "SNS運用に手が回らない",
    ],
    cta_label: "LINE で予約する",
  },
  "BtoBサービス": {
    tone: "シャープ・論理的・実績ベース",
    pain_points: [
      "リード獲得コストが高い",
      "営業の属人化",
      "導入検討に時間がかかる",
    ],
    cta_label: "資料をダウンロード",
  },
  "不動産・建設": {
    tone: "実績重視・安心感・地域密着",
    pain_points: [
      "問い合わせが減っている",
      "競合との差別化が難しい",
      "ネット集客に弱い",
    ],
    cta_label: "無料見積もりを依頼",
  },
  "コンサル": {
    tone: "パーソナル・温かみ・信頼",
    pain_points: [
      "自分の強みを言語化できない",
      "新規獲得ルートが限られる",
      "単価を上げたい",
    ],
    cta_label: "無料セッションに申し込む",
  },
  "汎用": {
    tone: "明快・プロフェッショナル",
    pain_points: [
      "集客が安定しない",
      "他社との違いを伝えきれない",
      "デジタル化が進んでいない",
    ],
    cta_label: "お問い合わせはこちら",
  },
};

/**
 * 業種名からデフォルト値を取得。マッチしなければ汎用。
 */
export function getIndustryDefaults(industry: string): IndustryDefault {
  for (const [key, defaults] of Object.entries(INDUSTRY_DEFAULTS)) {
    if (key.includes(industry) || industry.includes(key)) {
      return defaults;
    }
  }
  const fallback = INDUSTRY_DEFAULTS["汎用"];
  if (!fallback) {
    throw new Error("汎用デフォルト値が見つかりません");
  }
  return fallback;
}

// ============================================================
// 業種 → テンプレートマッピング
// ============================================================
const INDUSTRY_TEMPLATE_MAP: Readonly<Record<string, TemplateId>> = {
  "士業": 1,
  "飲食・サロン": 3,
  "BtoBサービス": 2,
  "不動産・建設": 1,
  "コンサル": 3,
};

/**
 * 業種からテンプレートIDを自動選択。
 */
export function selectTemplate(industry: string): TemplateId {
  for (const [key, tid] of Object.entries(INDUSTRY_TEMPLATE_MAP)) {
    if (key.includes(industry) || industry.includes(key)) {
      return tid as TemplateId;
    }
  }
  return 2; // デフォルトはBtoB系
}

// ============================================================
// Sonnet System プロンプト
// ============================================================
export const SYSTEM_PROMPT_LP = `あなたは日本の中小企業向けLPのコピーライターです。
以下のルールに従ってコピーを生成してください：

1. 全て日本語で出力する
2. ターゲット顧客の言葉で書く（専門用語を避ける）
3. 各セクションを指定のタグで囲んで出力する
4. HTMLタグは絶対に含めない（プレーンテキストのみ）
5. tone_keywordsに従った文体で書く
6. 同じ語句・表現の繰り返しを避ける
7. 具体的な数字や事例を盛り込む（推定でよい）

出力形式：
<hero_headline>メインコピー（30字以内）</hero_headline>
<hero_sub>サブコピー（60字以内）</hero_sub>
<problem_1>課題1の見出し（20字以内）</problem_1>
<problem_1_body>課題1の説明（80字以内）</problem_1_body>
<problem_2>課題2の見出し（20字以内）</problem_2>
<problem_2_body>課題2の説明（80字以内）</problem_2_body>
<problem_3>課題3の見出し（20字以内）</problem_3>
<problem_3_body>課題3の説明（80字以内）</problem_3_body>
<benefit_1>強み1の見出し（20字以内）</benefit_1>
<benefit_1_body>強み1の説明（80字以内）</benefit_1_body>
<benefit_2>強み2の見出し（20字以内）</benefit_2>
<benefit_2_body>強み2の説明（80字以内）</benefit_2_body>
<benefit_3>強み3の見出し（20字以内）</benefit_3>
<benefit_3_body>強み3の説明（80字以内）</benefit_3_body>
<cta_text>CTAボタンテキスト（15字以内）</cta_text>
<cta_sub>CTA下の補足（30字以内）</cta_sub>
<about_description>サービス概要説明（120字以内）</about_description>
<product_description>サービス詳細説明（150字以内）</product_description>`;

// ============================================================
// プロンプト構築
// ============================================================
/**
 * Haiku抽出JSONからSonnet用ユーザープロンプトを構築。
 */
export function buildUserPrompt(extractedData: ExtractedData): string {
  const industry = extractedData.industry || "汎用";
  const defaults = getIndustryDefaults(industry);

  const company = extractedData.company_name || "お客様の会社";
  const service = extractedData.service_name || "お客様のサービス";
  const target = extractedData.target_customer || "中小企業の経営者";

  let strengths = [...extractedData.strengths];
  if (strengths.length === 0) {
    strengths = ["実績が豊富", "サポート充実", "低価格"];
  }

  let painPoints = extractedData.pain_points
    ? [...extractedData.pain_points]
    : [];
  if (painPoints.length === 0) {
    painPoints = [...defaults.pain_points];
  }

  // 強みが1つしかない場合の対策
  let strengthInstruction = "";
  if (strengths.length === 1) {
    strengthInstruction =
      "\n\n※強みが1つのみです。この1つの強みを3つの異なる側面に分解してbenefit_1〜3を生成してください。";
  }

  const tone = extractedData.tone_keywords?.length
    ? [...extractedData.tone_keywords]
    : [defaults.tone];

  let prompt = `以下のビジネス情報に基づいてLPコピーを生成してください。

会社名: ${company}
サービス名: ${service}
業種: ${industry}
ターゲット: ${target}
強み: ${strengths.join(", ")}
課題: ${painPoints.join(", ")}`;

  if (extractedData.price_range) {
    prompt += `\n価格帯: ${extractedData.price_range}`;
  }
  if (extractedData.desired_outcome) {
    prompt += `\n理想の状態: ${extractedData.desired_outcome}`;
  }

  prompt += `\nトーン: ${tone.join(", ")}`;

  if (strengthInstruction) {
    prompt += strengthInstruction;
  }

  return prompt;
}

// ============================================================
// Sonnet レスポンスパーサー
// ============================================================

/** パース対象のタグ名リスト */
const SONNET_TAGS: readonly SonnetCopyKey[] = [
  "hero_headline",
  "hero_sub",
  "problem_1",
  "problem_1_body",
  "problem_2",
  "problem_2_body",
  "problem_3",
  "problem_3_body",
  "benefit_1",
  "benefit_1_body",
  "benefit_2",
  "benefit_2_body",
  "benefit_3",
  "benefit_3_body",
  "cta_text",
  "cta_sub",
  "about_description",
  "product_description",
];

/** HTML除去パターン (br以外) - 事前コンパイル */
const HTML_TAG_STRIP_PATTERN = /<(?!br\s*\/?>)[^>]+>/g;

/**
 * Sonnetのタグ付きレスポンスをパースしてdictに変換。
 */
export function parseSonnetResponse(responseText: string): SonnetCopyData {
  const result: Partial<Record<SonnetCopyKey, string>> = {};
  const missing: string[] = [];

  for (const tag of SONNET_TAGS) {
    const pattern = new RegExp(`<${tag}>(.*?)</${tag}>`, "s");
    const match = pattern.exec(responseText);
    if (match?.[1] !== undefined) {
      // HTMLタグ混入チェック (brは許可)
      let text = match[1].trim();
      text = text.replace(HTML_TAG_STRIP_PATTERN, "");
      result[tag] = text;
    } else {
      missing.push(tag);
    }
  }

  if (missing.length > 0) {
    console.warn(`WARNING: Missing tags in Sonnet response: ${missing.join(", ")}`);
  }

  return result;
}

// ============================================================
// 文字数バリデーション
// ============================================================
const CHAR_LIMITS: CharLimits = {
  hero_headline: 30,
  hero_sub: 60,
  problem_1: 20,
  problem_2: 20,
  problem_3: 20,
  problem_1_body: 80,
  problem_2_body: 80,
  problem_3_body: 80,
  benefit_1: 20,
  benefit_2: 20,
  benefit_3: 20,
  benefit_1_body: 80,
  benefit_2_body: 80,
  benefit_3_body: 80,
  cta_text: 15,
  cta_sub: 30,
  about_description: 120,
  product_description: 150,
};

/**
 * 文字数制限を超える場合はトリム。
 */
export function validateAndTrim(
  copyData: SonnetCopyData,
): SonnetCopyData {
  const trimmed: Partial<Record<SonnetCopyKey, string>> = {};

  for (const [key, text] of Object.entries(copyData)) {
    if (text === undefined) continue;
    const typedKey = key as SonnetCopyKey;
    const limit = CHAR_LIMITS[typedKey];
    if (limit !== undefined && text.length > limit) {
      // 句点で切る試行
      let truncated = text.slice(0, limit);
      const lastPeriod = Math.max(
        truncated.lastIndexOf("。"),
        truncated.lastIndexOf("、"),
      );
      if (lastPeriod > limit * 0.6) {
        truncated = truncated.slice(0, lastPeriod + 1);
      }
      trimmed[typedKey] = truncated;
    } else {
      trimmed[typedKey] = text;
    }
  }

  return trimmed;
}

// ============================================================
// テンプレート別マッピング生成
// ============================================================

/**
 * JSON-LD構造化データを生成。
 */
function buildJsonLd(data: ExtractedData): string {
  const ld = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: data.service_name || "",
    description: data.about_description || "",
    url: data.site_url || "",
    publisher: {
      "@type": "Organization",
      name: data.company_name || "",
    },
  };
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}

/**
 * Sonnet生成コピー + 抽出データ → テンプレート固有のプレースホルダーにマッピング。
 * @returns [meta_data, copy_data]
 */
export function mapToTemplatePlaceholders(
  sonnetCopy: SonnetCopyData,
  extractedData: ExtractedData,
  templateId: TemplateId,
): [MetaData, CopyData] {
  const industry = extractedData.industry || "汎用";
  const defaults = getIndustryDefaults(industry);

  // --- 共通 meta_data ---
  const meta: MetaData = {
    product_name: extractedData.service_name || "サービス名",
    company_name: extractedData.company_name || "会社名",
    meta_description: sonnetCopy.about_description || "",
    meta_keywords: `${extractedData.service_name || ""},${extractedData.industry || ""}`,
    og_url: extractedData.og_url || "{{og_url}}",
    og_image: extractedData.og_image || "{{og_image}}",
    og_title: `${extractedData.service_name || ""} | ${extractedData.company_name || ""}`,
    og_description: sonnetCopy.hero_sub || "",
    canonical_url: extractedData.canonical_url || "{{canonical_url}}",
    favicon_url: extractedData.favicon_url || "{{favicon_url}}",
    site_url: extractedData.site_url || "{{site_url}}",
    copyright_text: `Copyright ${extractedData.company_name || ""} All Rights Reserved.`,
    contact_url: extractedData.contact_url || "#contact",
    cta_url: extractedData.cta_url || "#contact",
  };

  const copy: CopyData = {};

  if (templateId === 1) {
    buildTemplate1Mapping(meta, copy, sonnetCopy, extractedData, defaults);
  } else if (templateId === 2) {
    buildTemplate2Mapping(meta, copy, sonnetCopy, extractedData, defaults);
  } else if (templateId === 3) {
    buildTemplate3Mapping(meta, copy, sonnetCopy, extractedData, defaults);
  }

  return [meta, copy];
}

/**
 * テンプレート1: CloudCUS系 (SaaS LP) マッピング
 */
function buildTemplate1Mapping(
  meta: MetaData,
  copy: CopyData,
  sonnetCopy: SonnetCopyData,
  extractedData: ExtractedData,
  defaults: IndustryDefault,
): void {
  meta["hero_headline"] = sonnetCopy.hero_headline || "";
  meta["hero_subheadline"] = sonnetCopy.hero_sub || "";
  meta["hero_cta"] = sonnetCopy.cta_text || defaults.cta_label;
  meta["page_title"] = meta["og_title"] || "";
  meta["form_action_url"] = extractedData.form_action_url || "#contact";
  meta["company_phone"] = extractedData.phone || "";
  meta["company_phone_raw"] = (extractedData.phone || "").replace(/-/g, "");
  meta["privacy_policy"] =
    extractedData.privacy_policy || "個人情報保護方針はこちら";

  copy["hero_headline"] = sonnetCopy.hero_headline || "";
  copy["hero_subheadline"] = sonnetCopy.hero_sub || "";
  copy["hero_cta"] = sonnetCopy.cta_text || defaults.cta_label;
  copy["point_text_3"] = sonnetCopy.benefit_1_body || "";
  copy["point_text_5"] = sonnetCopy.benefit_2_body || "";
  copy["point_text_7"] = sonnetCopy.benefit_3_body || "";
  copy["feature_3_desc"] = sonnetCopy.problem_1_body || "";
  copy["feature_7_desc"] = sonnetCopy.problem_2_body || "";
  copy["feature_11_desc"] = sonnetCopy.problem_3_body || "";
  copy["feature_15_desc"] = sonnetCopy.about_description || "";

  // FAQ
  const faq = extractedData.faq || [];
  for (let i = 0; i < 5; i++) {
    const faqItem = faq[i];
    if (faqItem) {
      copy[`faq_${i}_q`] = faqItem.q || `よくある質問${i + 1}`;
      copy[`faq_${i}_a`] = faqItem.a || "詳しくはお問い合わせください。";
    }
  }

  // company_info
  const ci = extractedData.company_info;
  if (ci) {
    copy["company_info_0"] = ci.name || extractedData.company_name || "";
    copy["company_info_1"] = ci.address || "";
    copy["company_info_2"] = ci.representative || "";
    copy["company_info_3"] = ci.established || "";
    copy["company_info_4"] = ci.capital || "";
    copy["company_info_5"] = ci.business || "";
  }
  copy["privacy_policy"] = extractedData.privacy_policy || "";
}

/**
 * テンプレート2: AUTOHUNT系 (HR SaaS) マッピング
 */
function buildTemplate2Mapping(
  meta: MetaData,
  copy: CopyData,
  sonnetCopy: SonnetCopyData,
  extractedData: ExtractedData,
  defaults: IndustryDefault,
): void {
  meta["page_title"] = meta["og_title"] || "";
  meta["site_name"] = extractedData.service_name || "";
  meta["download_form_url"] =
    extractedData.download_form_url || "#download";
  meta["contact_form_url"] =
    extractedData.contact_form_url || "#contact";
  meta["seminar_url"] = extractedData.seminar_url || "#";
  meta["wp_url"] = extractedData.wp_url || "#";
  meta["login_url"] = extractedData.login_url || "#";
  meta["logo_icon_url"] =
    extractedData.logo_icon_url || "{{logo_icon_url}}";
  meta["logo_banner_url"] =
    extractedData.logo_banner_url || "{{logo_banner_url}}";
  meta["badge_image_url"] =
    extractedData.badge_image_url || "{{badge_image_url}}";
  meta["badge_image_2_url"] =
    extractedData.badge_image_2_url || "{{badge_image_2_url}}";
  meta["product_description"] = sonnetCopy.product_description || "";
  meta["usecase_detail_url"] =
    extractedData.usecase_detail_url || "#";
  meta["usecase_list_url"] = extractedData.usecase_list_url || "#";
  meta["company_about_url"] =
    extractedData.company_about_url || "#";
  meta["privacy_policy_url"] =
    extractedData.privacy_policy_url || "#";
  meta["security_policy_url"] =
    extractedData.security_policy_url || "#";
  meta["privacy_statement_url"] =
    extractedData.privacy_statement_url || "#";
  meta["terms_url"] = extractedData.terms_url || "#";

  copy["hero_headline"] = sonnetCopy.hero_headline || "";
  copy["hero_subheadline"] = sonnetCopy.hero_sub || "";
  copy["about_title"] = sonnetCopy.about_description || "";
  copy["feature_0_title"] = sonnetCopy.benefit_1 || "";
  copy["feature_1_title"] = sonnetCopy.benefit_2 || "";
  copy["cta_download"] = sonnetCopy.cta_text || defaults.cta_label;
  copy["cta_secondary"] = sonnetCopy.cta_sub || "";
  copy["pricing_subtitle"] =
    extractedData.price_range || "お問い合わせください";
  copy["cases_subtitle"] = "導入事例";

  const faq = extractedData.faq;
  copy["faq_0_q"] = faq?.[0]?.q || "";
}

/**
 * テンプレート3: ERUCORE系 (AI/Tech LP) マッピング
 */
function buildTemplate3Mapping(
  meta: MetaData,
  copy: CopyData,
  sonnetCopy: SonnetCopyData,
  extractedData: ExtractedData,
  _defaults: IndustryDefault,
): void {
  meta["page_title"] = meta["og_title"] || "";
  meta["json_ld_script"] = buildJsonLd(extractedData);

  copy["hero_headline"] = sonnetCopy.hero_headline || "";
  copy["about_title"] = sonnetCopy.hero_sub || "";
  copy["about_text_0"] = sonnetCopy.about_description || "";
  copy["about_text_1"] = sonnetCopy.product_description || "";
  copy["about_text_3"] = sonnetCopy.benefit_1_body || "";
  copy["about_text_6"] = sonnetCopy.benefit_2_body || "";

  copy["about_problem_0"] = sonnetCopy.problem_1 || "";
  copy["about_problem_1"] = sonnetCopy.problem_2 || "";
  copy["about_problem_2"] = sonnetCopy.problem_3 || "";

  copy["feature_0_title"] = sonnetCopy.benefit_1 || "";
  copy["feature_0_desc"] = sonnetCopy.benefit_1_body || "";
  copy["feature_1_title"] = sonnetCopy.benefit_2 || "";
  copy["feature_1_desc"] = sonnetCopy.benefit_2_body || "";
  copy["feature_2_title"] = sonnetCopy.benefit_3 || "";
  copy["feature_2_desc"] = sonnetCopy.benefit_3_body || "";

  copy["merit_0_title"] = sonnetCopy.problem_1 || "";
  copy["merit_0_desc"] = sonnetCopy.problem_1_body || "";
  copy["merit_1_title"] = sonnetCopy.problem_2 || "";
  copy["merit_1_desc"] = sonnetCopy.problem_2_body || "";
  copy["merit_2_title"] = sonnetCopy.problem_3 || "";
  copy["merit_2_desc"] = sonnetCopy.problem_3_body || "";

  // support
  const strengths = [...extractedData.strengths];
  const defaultStrengths = ["サポート充実", "導入簡単", "安心運用"];
  for (let i = 0; i < 3; i++) {
    const s = strengths[i] || defaultStrengths[i] || `サポート${i + 1}`;
    copy[`support_${i}_title`] = s;
    copy[`support_${i}_desc`] = `${s}で安心してご利用いただけます。`;
  }

  // flow
  const flowTitles = ["お問い合わせ", "ヒアリング", "ご提案", "導入開始"];
  const flowDescs = [
    "まずはお気軽にご相談ください",
    "課題やご要望を詳しくお伺いします",
    "最適なプランをご提案します",
    "導入後もしっかりサポートします",
  ];
  for (let i = 0; i < 4; i++) {
    copy[`flow_${i}_title`] = flowTitles[i] || "";
    copy[`flow_${i}_desc`] = flowDescs[i] || "";
  }

  // form labels (固定)
  copy["form_label_lastName"] = "姓";
  copy["form_label_firstName"] = "名";
  copy["form_label_company"] = "会社名";
  copy["form_label_email"] = "メールアドレス";
  copy["form_label_phone"] = "電話番号";
  copy["form_label_position"] = "役職";
  copy["form_label_inquiryStatus"] = "お問い合わせ内容";
  copy["form_label_message"] = "メッセージ";
}
