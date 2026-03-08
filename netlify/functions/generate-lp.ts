/**
 * 制作物生成API - Netlify Function
 *
 * POST /api/generate-lp
 *
 * LP生成は3ステップパイプライン:
 *   step=draft    → セクション設計 + コピー生成 (JSON返却)
 *   step=evaluate → 品質評価 + 修正 (JSON返却)
 *   step=build    → HTML構築 + Blobs保存 (HTML返却)
 *
 * LP以外(ad_creative, minutes等)は従来通り1ステップ。
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";
import { SCROLL_ANIM, SEC_HEADER, WAVE_DIVIDER, DOT_BG, CARD_BORDERED, CARD_STAT, BTN_PRIMARY, MICRO_COPY, STRENGTH_CARD, TESTIMONIAL_CARD, CARD_GRID, STATS_GRID, FLOW, FAQ } from "./templates/lp-components";

// ============================================================
// 型定義
// ============================================================

type DeliverableType = "lp" | "ad_creative" | "flyer" | "hearing_form" | "line_design" | "minutes" | "profile";

interface FlatData {
  company_name: string;
  service_name: string;
  industry: string;
  target_customer: string;
  strengths: string[];
  pain_points: string[];
  price_range: string;
  current_marketing: string;
}

interface LpContent {
  // Profile
  profile_name: string;
  profile_title: string;
  // Hero
  hero_headline: string;
  hero_sub: string;
  hero_features: string[];
  badge_text: string;
  // About
  about_title: string;
  about_text: string;
  strengths: { title: string; desc: string }[];
  // Expertise
  expertise: { title: string; desc: string }[];
  // Merits
  merits: { title: string; desc: string }[];
  // CTA
  cta_text: string;
  cta_sub: string;
  guarantee_text: string;
  urgency_text: string;
  // Data
  stats: { number: string; label: string }[];
  flow: { title: string; desc: string }[];
  faq: { q: string; a: string }[];
  testimonials: { name: string; role: string; text: string; result: string }[];
  company_profile: string;
  // Legacy compat
  problems?: { title: string; desc: string }[];
  benefits?: { title: string; desc: string }[];
  comparison?: { feature: string; us: string; other: string }[];
  about?: string;
  transition_text?: string;
}

interface AdContent {
  patterns: { primary: string; headline: string; description: string; targeting: string; image_direction: string }[];
}

interface MinutesContent {
  date: string;
  participants_self: string;
  participants_other: string;
  purpose: string;
  topics: { title: string; summary: string }[];
  decisions: string[];
  actions: { item: string; owner: string; deadline: string }[];
  next_meeting: string;
  upsell_notes: string;
}

interface GenericContent {
  sections: { title: string; content: string }[];
  headline: string;
  sub: string;
}

// ============================================================
// 定数
// ============================================================

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// LP生成はHaiku（速度重視: 26秒制限内に確実に収める）
// Sonnetは60-100 tokens/秒 → 2500 tokens = 25-41秒 → タイムアウト確実
// Haikuは200-400 tokens/秒 → 2500 tokens = 6-12秒 → 安全マージンあり
const LP_MODEL = "claude-haiku-4-5-20251001";
// LP以外（ad, minutes等）は出力が少ないのでSonnetでOK
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const VALID_TYPES = new Set<string>(["lp", "ad_creative", "flyer", "hearing_form", "line_design", "minutes", "profile"]);

// ============================================================
// データ変換
// ============================================================

function flatten(raw: Record<string, unknown>): FlatData {
  const get = (key: string): string => {
    const v = raw[key];
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (typeof obj["value"] === "string") return obj["value"];
    }
    return "";
  };
  const getArr = (key: string): string[] => {
    const v = raw[key];
    if (Array.isArray(v)) return v.filter((s): s is string => typeof s === "string");
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (Array.isArray(obj["value"])) return (obj["value"] as unknown[]).filter((s): s is string => typeof s === "string");
    }
    return [];
  };
  return {
    company_name: get("company_name") || "企業",
    service_name: get("service_name") || "サービス",
    industry: get("industry") || "",
    target_customer: get("target_customer") || "企業の経営者・担当者",
    strengths: getArr("strengths").length > 0 ? getArr("strengths") : ["実績豊富"],
    pain_points: getArr("pain_points").length > 0 ? getArr("pain_points") : ["課題あり"],
    price_range: get("price_range"),
    current_marketing: get("current_marketing"),
  };
}

// ============================================================
// Claude API呼び出し
// ============================================================

async function callClaudeJson<T>(system: string, user: string, apiKey: string, maxTokens = 4000, model = CLAUDE_MODEL): Promise<T> {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  console.log(`[generate] model=${model} stop=${res.stop_reason} usage=${JSON.stringify(res.usage)}`);

  const block = res.content[0];
  if (!block || block.type !== "text") throw new Error("Claude応答なし");

  // max_tokensで切れた場合は明示的にエラー
  if (res.stop_reason === "max_tokens") {
    console.error("[generate] OUTPUT TRUNCATED - max_tokens reached. output_tokens:", res.usage?.output_tokens);
  }

  let text = block.text.trim();

  // JSON抽出: コードブロック → 最初の{...}最後の} を試す
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) {
    text = codeBlock[1].trim();
  } else {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  // 切れたJSONの修復を試みる: 末尾に閉じ括弧を追加
  if (res.stop_reason === "max_tokens") {
    let repaired = text;
    // 開き括弧と閉じ括弧のバランスを取る
    const opens = (repaired.match(/{/g) || []).length;
    const closes = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    // 末尾の不完全なvalue/keyを除去
    repaired = repaired.replace(/,\s*"[^"]*"?\s*$/, "");
    repaired = repaired.replace(/,\s*\{[^}]*$/, "");
    repaired = repaired.replace(/,\s*$/, "");

    // 閉じ括弧を追加
    for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += "]";
    for (let i = 0; i < opens - closes; i++) repaired += "}";

    try {
      console.log("[generate] Repaired truncated JSON successfully");
      return JSON.parse(repaired) as T;
    } catch {
      console.error("[generate] Repair failed, trying original");
    }
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error("[generate] JSON parse failed, model:", model, "stop:", res.stop_reason, "first 500 chars:", text.slice(0, 500), "last 200 chars:", text.slice(-200));
    throw new Error("Claude応答のJSON解析に失敗しました");
  }
}

// ============================================================
// ビジネスコンテキスト
// ============================================================

const TRANSCRIPT_MAX_CHARS = 4000; // Sonnet 26秒制限対策（入力トークン削減）

function truncateTranscript(transcript: string): string {
  if (!transcript || transcript.length <= TRANSCRIPT_MAX_CHARS) return transcript;
  return transcript.slice(0, TRANSCRIPT_MAX_CHARS);
}

function bizContext(d: FlatData, transcript: string, rawData?: Record<string, unknown>): string {
  // 新しい抽出フィールドがあれば活用
  const getField = (key: string): string => {
    if (!rawData) return "";
    const v = rawData[key];
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (typeof obj["value"] === "string") return obj["value"];
      if (Array.isArray(obj["value"])) return (obj["value"] as string[]).join(" / ");
    }
    return "";
  };

  const specificNumbers = getField("specific_numbers");
  const caseStudies = getField("case_studies");
  const competitiveAdv = getField("competitive_advantages");
  const pricingDetails = getField("pricing_details");
  const companyScale = getField("company_scale");

  const extra = [
    d.price_range ? `価格:${d.price_range}` : "",
    specificNumbers ? `数字:${specificNumbers}` : "",
    caseStudies ? `事例:${caseStudies}` : "",
    competitiveAdv ? `差別化:${competitiveAdv}` : "",
    pricingDetails ? `料金:${pricingDetails}` : "",
    companyScale ? `規模:${companyScale}` : "",
  ].filter(Boolean).join("\n");

  return `【トランスクリプト】
${transcript || "（なし）"}

【サマリー】
${d.company_name}/${d.service_name}/${d.industry}
ターゲット:${d.target_customer}
強み:${d.strengths.join("/")}
課題:${d.pain_points.join("/")}
${extra}`;
}

// ============================================================
// LP Step 1: Draft (設計+コピー生成)
// ============================================================

const LP_DRAFT_PROMPT = `商談情報から「サービス提供者のプロフィールページ」用コンテンツをJSON生成。
この人に仕事を依頼したくなるプロフィールページ。数字で語れ。形容詞禁止。

出力JSON（全フィールド必須）:
{
  "profile_name": "氏名（商談から推定）",
  "profile_title": "肩書き（例: 補助金採択コンサルタント）",
  "hero_headline": "25字以内。この人を一言で。数字必須",
  "hero_sub": "50字以内。何をしている人か",
  "hero_features": ["実績12字×3（数字入り）"],
  "badge_text": "12字以内。専門分野",
  "about_title": "自己紹介タイトル20字",
  "about_text": "人柄が伝わる自己紹介120字。経歴+実績+想い",
  "strengths": [{"title":"強み15字","desc":"具体的に数字入り50字"}],
  "expertise": [{"title":"サービス名20字","desc":"内容+成果を数字で80字"}],
  "merits": [{"title":"選ばれる理由20字","desc":"数字で裏付け80字"}],
  "cta_text": "8字以内（例:「話を聞いてみる」）",
  "cta_sub": "20字以内",
  "stats": [{"number":"92%","label":"採択率"}],
  "flow": [{"title":"ステップ10字","desc":"説明40字"}],
  "faq": [{"q":"質問","a":"回答50字"}],
  "guarantee_text": "安心ポイント30字",
  "testimonials": [{"name":"実名","role":"業種 役職","text":"この人に頼んだ感想60字","result":"定量成果20字"}],
  "company_profile": "会社概要80字",
  "urgency_text": "数字入り限定感20字"
}
strengths3,expertise3,merits3,stats4,flow4,faq4,testimonials3。JSONのみ出力。`;

async function lpDraft(d: FlatData, transcript: string, apiKey: string, rawData?: Record<string, unknown>): Promise<LpContent> {
  return callClaudeJson<LpContent>(LP_DRAFT_PROMPT, bizContext(d, transcript, rawData), apiKey, 4000, LP_MODEL);
}

// ============================================================
// LP Step 2: Evaluate + Revise (品質評価+修正)
// ============================================================

const LP_EVALUATE_PROMPT = `あなたはプロフィールページ専門のコピーライター。入力JSONを"この人に頼みたい"と思わせるプロフィールに書き換えてください。

【字数制限（厳守）】
- profile_name: 実名。商談から推定できなければ「担当者」
- profile_title: 20字以内。専門性が伝わる肩書き
- hero_headline: 25字以内。数字必須。型:「○○件の実績を持つ△△専門家」
- hero_sub: 50字以内。具体的な仕事内容
- hero_features: 各12字以内×3。各項目に異なる数字
- badge_text: 12字以内
- about_text: 120字以内。経歴→実績→信念の流れ
- urgency_text: 20字以内。数字入り
- cta_text: 8字以内

【品質ルール】
1. 形容詞禁止。「豊富な」→「年間200件の」
2. 人物像を具体化。「専門家」→「補助金採択率92%のコンサルタント」
3. strengths: 3つそれぞれに異なる数字。この人ならではの強み
4. expertise: 3サービスそれぞれに具体的な成果数字
5. testimonials: 3件。異なる業種+改善数字。resultは定量的
6. stats: 4つ異なるカテゴリ（実績数、満足度、経験年数、対応速度等）
7. faq: 「料金」「期間」「進め方」「相性」をカバー
8. merits: この人に頼む理由。他の人との違いを数字で

【絶対NG】
- 「寄り添う」「丁寧」「真心」等の抽象語
- 同じ数字の使い回し
- フィールド省略・空配列

入力と同じJSON構造で出力。JSON以外不要。`;

async function lpEvaluate(draft: LpContent, d: FlatData, apiKey: string): Promise<LpContent> {
  const input = `【対象企業】${d.company_name}（${d.service_name}）
【ターゲット】${d.target_customer}
【強み】${d.strengths.join(" / ")}

【評価対象のLPコピー】
${JSON.stringify(draft)}`;

  return callClaudeJson<LpContent>(LP_EVALUATE_PROMPT, input, apiKey, 4000, LP_MODEL);
}

// ============================================================
// Unsplash画像取得
// ============================================================

// ============================================================
// 画像: Unsplash CDN直接URL（APIキー不要、業種別キュレーション）
// ============================================================

interface LpImage {
  url: string;
  alt: string;
}

// Unsplash写真ID → CDN URL（認証不要、永続URL）
const unsplashUrl = (id: string, w = 800, h = 600): string =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

// 業種別キュレーション済み写真ライブラリ
const PHOTO_LIBRARY: Record<string, string[]> = {
  business: [
    "1497366216548-37526070297c", // モダンオフィス
    "1553877522-43269d4ea984", // チームミーティング
    "1600880292203-757bb62b4baf", // ビジネスディスカッション
    "1521737711867-e3b97375f902", // コワーキングスペース
    "1542744173-8e7e91415657", // ノートPCワーク
  ],
  tech: [
    "1518770660439-4636190af475", // コード画面
    "1531297484001-80022131f5a1", // ノートPC作業
    "1504384308090-c894fdcc538d", // テックオフィス
    "1519389950473-47ba0277781c", // プログラミング
    "1573164713988-8665fc963095", // サーバールーム
  ],
  medical: [
    "1576091160550-2173dba999ef", // 医療チーム
    "1579684385127-1ef15d508118", // ヘルスケア
    "1551076805-e1869033e561", // 病院廊下
    "1538108149393-fbbd81895907", // 医療機器
    "1559757175-5700dde675bc", // ドクター
  ],
  food: [
    "1517248135467-4c7edcad34c4", // レストラン
    "1414235077428-338989a2e8c0", // カフェ内装
    "1552566626-52f8b828add9", // フードプレゼン
    "1559339352-11d035aa65de", // キッチン
    "1466978913421-dad2ebd01d17", // ダイニング
  ],
  education: [
    "1524178232363-1fb2b075b655", // 教室
    "1427504494785-3a9ca7044f45", // ライブラリ
    "1523050854058-8df90110c9f1", // 卒業
    "1509062522246-3755977927d7", // 講義
    "1503676260728-1c00da094a0b", // 大学キャンパス
  ],
  construction: [
    "1504307651254-35680f356dfd", // 建設現場
    "1541888946425-d81bb19240f5", // 建築設計
    "1503387762-592deb58ef4e", // ビル群
    "1486406146926-c627a92ad1ab", // モダン建築
    "1487958449943-2429e8be8625", // 建築図面
  ],
  finance: [
    "1460925895917-afdab827c52f", // 金融グラフ
    "1611974789855-9c2a0a7236a3", // 株チャート
    "1554224155-6726b3ff858f", // ビジネス分析
    "1579532537598-459ecdaf39cc", // 電卓・書類
    "1526304640581-d334cdbbf45e", // ファイナンス
  ],
  beauty: [
    "1560066984-138dadb4c035", // サロン内装
    "1522337360788-8b13dee7a37e", // ビューティー
    "1516975080664-ed2fc6a32937", // スパ
    "1570172619644-dfd03ed5d881", // ヘアサロン
    "1487412912498-0447578fcca8", // 化粧品
  ],
  manufacturing: [
    "1565043589221-4e5bfe5a2a3f", // 工場内部
    "1581091226825-a6a2a5aee158", // 製造ライン
    "1504917595217-d4dc5ebe6122", // 産業機械
    "1558618666-fcd25c85f82e", // 自動化
    "1533417479674-390fca4b5f73", // 品質管理
  ],
};

function selectImages(d: FlatData): LpImage[] {
  const industry = d.industry.toLowerCase();

  // 業種判定
  let category = "business";
  if (industry.includes("医") || industry.includes("健康") || industry.includes("福祉")) category = "medical";
  else if (industry.includes("it") || industry.includes("テック") || industry.includes("開発") || industry.includes("システム")) category = "tech";
  else if (industry.includes("飲食") || industry.includes("食") || industry.includes("レストラン")) category = "food";
  else if (industry.includes("教育") || industry.includes("学") || industry.includes("スクール")) category = "education";
  else if (industry.includes("建") || industry.includes("不動産") || industry.includes("建築")) category = "construction";
  else if (industry.includes("金融") || industry.includes("保険") || industry.includes("銀行")) category = "finance";
  else if (industry.includes("美容") || industry.includes("サロン") || industry.includes("エステ")) category = "beauty";
  else if (industry.includes("製造") || industry.includes("工場") || industry.includes("メーカー")) category = "manufacturing";

  const photos = PHOTO_LIBRARY[category] || PHOTO_LIBRARY["business"]!;

  // 会社名のハッシュでランダム選択（同じ会社なら同じ画像セット）
  let hash = 0;
  for (let i = 0; i < d.company_name.length; i++) {
    hash = ((hash << 5) - hash + d.company_name.charCodeAt(i)) | 0;
  }
  const offset = Math.abs(hash) % photos.length;

  return [
    { url: unsplashUrl(photos[offset % photos.length]!, 1920, 1080), alt: `${d.company_name} ヒーロー画像` },
    { url: unsplashUrl(photos[(offset + 1) % photos.length]!, 800, 600), alt: `${d.service_name} サービス画像` },
    { url: unsplashUrl(photos[(offset + 2) % photos.length]!, 800, 600), alt: `${d.service_name} 特徴1` },
    { url: unsplashUrl(photos[(offset + 3) % photos.length]!, 800, 600), alt: `${d.service_name} 特徴2` },
    { url: unsplashUrl(photos[(offset + 4) % photos.length]!, 800, 600), alt: `${d.service_name} 特徴3` },
  ];
}

// ============================================================
// カラーパレット
// ============================================================

function getDecoColors(industry: string): { primary: string; gradient: string; accent: string } {
  const i = industry.toLowerCase();
  if (i.includes("医") || i.includes("健康") || i.includes("福祉")) return { primary: "#0891b2", gradient: "linear-gradient(135deg,#0891b2,#06b6d4)", accent: "#06b6d4" };
  if (i.includes("IT") || i.includes("テック") || i.includes("開発")) return { primary: "#7c3aed", gradient: "linear-gradient(135deg,#7c3aed,#a78bfa)", accent: "#a78bfa" };
  if (i.includes("飲食") || i.includes("食")) return { primary: "#ea580c", gradient: "linear-gradient(135deg,#ea580c,#f97316)", accent: "#fb923c" };
  if (i.includes("教育") || i.includes("学")) return { primary: "#0d9488", gradient: "linear-gradient(135deg,#0d9488,#2dd4bf)", accent: "#2dd4bf" };
  if (i.includes("建") || i.includes("不動産")) return { primary: "#b45309", gradient: "linear-gradient(135deg,#92400e,#b45309)", accent: "#d97706" };
  if (i.includes("金融") || i.includes("保険")) return { primary: "#1e40af", gradient: "linear-gradient(135deg,#1e3a8a,#2563eb)", accent: "#3b82f6" };
  return { primary: "#1d4ed8", gradient: "linear-gradient(135deg,#1e3a8a,#2563eb)", accent: "#3b82f6" };
}

// ============================================================
// LP Step 3: Build HTML (高品質テンプレート)
// ============================================================

function buildLpHtml(c: LpContent, d: FlatData, images: LpImage[] = []): string {
  // Compat: legacy field mapping
  const str = c.strengths?.length ? c.strengths : (c.problems || []);
  const exp = c.expertise?.length ? c.expertise : (c.benefits || []);
  const m = c.merits || [];
  const s = c.stats || [];
  const f = c.flow || [];
  const faq = c.faq || [];
  const hf = c.hero_features || [];
  const tm = c.testimonials || [];
  const colors = getDecoColors(d.industry);
  const hasImg = images.length > 0;
  const pName = c.profile_name || d.company_name;
  const pTitle = c.profile_title || d.industry;

  const ico = [
    `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="var(--c)" opacity=".12"/><path d="M14 20l4 4 8-10" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="var(--c)" opacity=".12"/><path d="M20 12v8l5 3" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="var(--c)" opacity=".12"/><path d="M14 26l5-10 5 6 5-8" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ];

  const starSvg = `<svg width="18" height="18" viewBox="0 0 20 20" fill="#f59e0b"><path d="M10 1l2.39 4.84L18 6.71l-4 3.9.94 5.5L10 13.38 5.06 16.1 6 10.6l-4-3.9 5.61-.87L10 1z"/></svg>`;
  const checkSvg = `<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  const clockSvg = `<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  const microHtml = `<p class="micro micro-light"><span>${checkSvg}無料</span><span>${clockSvg}30秒で完了</span><span>${checkSvg}営業電話なし</span></p>`;

  const cRgb = `${parseInt(colors.primary.slice(1,3),16)},${parseInt(colors.primary.slice(3,5),16)},${parseInt(colors.primary.slice(5,7),16)}`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pName)} - ${esc(pTitle)} | ${esc(d.company_name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--c:${colors.primary};--cg:${colors.gradient};--ca:${colors.accent};--c-rgb:${cRgb};--dark:#0f172a;--t1:#1e293b;--t2:#475569;--t3:#94a3b8;--bg:#fff;--bg2:#f1f5f9;--bd:#e2e8f0;--r:10px}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:'Noto Sans JP','Inter',sans-serif;color:var(--t1);background:var(--bg);line-height:1.8;-webkit-font-smoothing:antialiased}
a{text-decoration:none;color:inherit}
img{max-width:100%;display:block}
.inner{max-width:1100px;margin:0 auto;padding:0 24px}

/* ===== COMPONENTS ===== */
${SCROLL_ANIM}
${SEC_HEADER}
${WAVE_DIVIDER}
${DOT_BG}
${CARD_BORDERED}
${CARD_STAT}
${BTN_PRIMARY}
${MICRO_COPY}
${STRENGTH_CARD}
${TESTIMONIAL_CARD}
${CARD_GRID}
${STATS_GRID}
${FLOW}
${FAQ}

/* ===== HEADER ===== */
.hd{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--bd);height:64px;display:flex;align-items:center}
.hd .inner{display:flex;align-items:center;justify-content:space-between;width:100%}
.hd-logo{font-weight:800;font-size:18px;color:var(--c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:50%}
.hd-nav{display:flex;gap:24px;align-items:center;flex-shrink:0}
.hd-nav a{font-size:13px;color:var(--t2);font-weight:500;transition:color .2s;white-space:nowrap}
.hd-nav a:hover{color:var(--c)}

/* ===== HERO ===== */
.fv{position:relative;min-height:100svh;display:flex;align-items:center;overflow:hidden;padding-top:64px;background-size:cover;background-position:center;background-repeat:no-repeat}
.fv-overlay{position:absolute;inset:0;background:linear-gradient(135deg,rgba(15,23,42,.88) 0%,rgba(15,23,42,.72) 50%,rgba(15,23,42,.55) 100%);z-index:0}
.fv .inner{position:relative;z-index:1;max-width:800px;text-align:center;padding-top:80px;padding-bottom:120px}
.fv-badge{display:inline-block;padding:6px 18px;border:1px solid rgba(255,255,255,.25);border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.15em;color:var(--ca);text-transform:uppercase;margin-bottom:20px}
.fv-name{font-size:clamp(32px,5.5vw,56px);font-weight:900;line-height:1.1;color:#fff;margin-bottom:6px}
.fv-role{font-size:clamp(14px,1.6vw,16px);color:var(--ca);font-weight:700;margin-bottom:16px;letter-spacing:.05em}
.fv-headline{font-size:clamp(16px,2vw,20px);color:rgba(255,255,255,.8);margin-bottom:28px;line-height:1.7}
.fv-features{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:36px;justify-content:center}
.fv-features span{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:rgba(255,255,255,.12);backdrop-filter:blur(4px);color:#fff;font-size:13px;font-weight:700;letter-spacing:.03em;border-radius:var(--r);border:1px solid rgba(255,255,255,.1)}
.fv-features span::before{content:'';width:5px;height:5px;background:var(--ca);border-radius:50%}
.fv-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,.95);backdrop-filter:blur(10px);z-index:2}
.fv-stat{padding:24px 16px;text-align:center;border-right:1px solid var(--bd)}
.fv-stat:last-child{border-right:none}
.fv-stat-num{font-family:'Inter',sans-serif;font-size:clamp(24px,3.5vw,40px);font-weight:900;background:var(--cg);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.1}
.fv-stat-label{font-size:12px;color:var(--t2);margin-top:4px;letter-spacing:.05em;font-weight:600}

/* ===== ABOUT ===== */
.about{background:var(--bg2)}
.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.about-txt{font-size:15px;color:var(--t2);line-height:2;margin-bottom:24px}
.about-strengths{display:flex;flex-direction:column;gap:10px}
.about-visual{position:relative;display:flex;align-items:center;justify-content:center;min-height:320px;border-radius:var(--r);overflow:hidden}
.about-visual::before{content:'';position:absolute;inset:0;background:var(--cg);opacity:.06;border-radius:16px}
.about-avatar{position:relative;z-index:1;width:160px;height:160px;border-radius:50%;background:var(--cg);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:64px;box-shadow:0 12px 40px rgba(var(--c-rgb),.2)}
.about-img{width:100%;height:100%;object-fit:cover;border-radius:var(--r);position:absolute;inset:0;z-index:1}

/* ===== OFFER / CTA ===== */
.offer{padding:56px 0;background:var(--dark);color:#fff;text-align:center;position:relative;overflow:hidden}
.offer::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:400px;background:radial-gradient(circle,rgba(255,255,255,.04),transparent 70%)}
.offer-accent{background:var(--c);padding:72px 0}
.offer-tit{font-size:clamp(18px,3vw,24px);font-weight:800;margin-bottom:8px;position:relative}
.offer-sub{font-size:14px;color:rgba(255,255,255,.55);margin-bottom:20px;position:relative}
.offer-urgency{display:inline-flex;align-items:center;gap:8px;padding:6px 16px;border:1px solid rgba(255,255,255,.2);border-radius:20px;font-size:12px;color:#fff;font-weight:700;margin-bottom:20px;position:relative}
.offer-urgency svg{width:14px;height:14px;fill:none;stroke:var(--ca);stroke-width:2}

/* ===== COMPANY ===== */
.company-box{max-width:720px;margin:0 auto;padding:32px;border:1px solid var(--bd);border-radius:var(--r);display:flex;align-items:center;gap:24px}
.company-logo{flex-shrink:0;width:64px;height:64px;border-radius:var(--r);background:var(--cg);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:24px}
.company-info p{font-size:14px;color:var(--t2);line-height:1.8}
.company-info strong{color:var(--t1);font-size:16px;display:block;margin-bottom:4px}

/* ===== FINAL CTA ===== */
.cta-sec{padding:100px 24px;background:var(--dark);text-align:center;position:relative;overflow:hidden}
.cta-sec::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;height:500px;background:radial-gradient(circle,rgba(255,255,255,.04),transparent 70%)}
.cta-tit{font-size:clamp(22px,3.5vw,30px);font-weight:900;color:#fff;margin-bottom:10px;position:relative}
.cta-sub{font-size:14px;color:rgba(255,255,255,.5);margin-bottom:24px;position:relative}

/* ===== FOOTER ===== */
.ft{padding:28px;text-align:center;border-top:1px solid var(--bd);font-size:12px;color:var(--t3)}

/* ===== MOBILE CTA BAR ===== */
.m-cta{display:none;position:fixed;bottom:0;left:0;right:0;padding:10px 16px;background:rgba(255,255,255,.95);backdrop-filter:blur(12px);border-top:1px solid var(--bd);z-index:100}
.m-cta a{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:14px;background:var(--c);color:#fff;font-weight:800;font-size:14px;border-radius:var(--r)}
.m-cta-sub{font-size:10px;color:var(--t3);text-align:center;margin-top:4px}

/* ============================== */
/* RESPONSIVE 750px               */
/* ============================== */
@media(max-width:750px){
.hd{height:56px}.hd-logo{font-size:15px;max-width:60%}.hd-nav{gap:0}.hd-nav a:not(.btn){display:none}
.fv{min-height:auto;padding-top:56px}.fv .inner{padding-top:48px;padding-bottom:100px;max-width:100%}
.fv-name{font-size:clamp(26px,7vw,36px)}.fv-role{font-size:13px}.fv-headline{font-size:14px;margin-bottom:20px}
.fv-badge{font-size:11px;padding:5px 14px}.fv-features{gap:6px;margin-bottom:24px}
.fv-features span{padding:6px 12px;font-size:11px}.fv-stats{grid-template-columns:repeat(2,1fr);position:relative}
.fv-stat{padding:16px 12px}.fv-stat-num{font-size:clamp(20px,5vw,28px)}.fv-stat-label{font-size:10px}
.about-grid{grid-template-columns:1fr;gap:24px}.about-visual{order:-1;min-height:200px!important}
.about-avatar{width:120px;height:120px;font-size:48px}.about-txt{font-size:14px}
.offer{padding:48px 0}.offer-accent{padding:56px 0}.offer-tit{font-size:clamp(16px,4.5vw,22px)}
.company-box{flex-direction:column;text-align:center;padding:24px;gap:16px}
.company-logo{width:52px;height:52px;font-size:20px}.company-info strong{font-size:15px}.company-info p{font-size:13px}
.cta-sec{padding:64px 20px}.cta-tit{font-size:clamp(18px,5vw,24px)}
.ft{padding:20px 16px;font-size:11px}.m-cta{display:block}body{padding-bottom:72px}
.btn-lg{padding:14px 32px;font-size:14px}
.flow-item{gap:14px;padding:14px 0}.flow-num{width:44px;height:44px;font-size:16px}
.flow-list::before{left:22px}.flow-h3{font-size:14px}.flow-desc{font-size:13px}
}
@media(max-width:480px){
.inner{padding:0 16px}.hd-logo{font-size:14px}
.fv-name{font-size:24px}.fv-features span{padding:5px 8px;font-size:10px}
.fv-stats{grid-template-columns:1fr 1fr}.fv-stat{padding:12px 8px}.fv-stat-num{font-size:20px}
.about-avatar{width:100px;height:100px;font-size:36px}
.btn-lg{padding:12px 24px;font-size:13px}.btn-md{padding:10px 20px;font-size:12px}
.offer-urgency{font-size:11px}.offer-tit{font-size:16px}
.flow-num{width:36px;height:36px;font-size:14px}.flow-list::before{left:18px}
.cta-tit{font-size:18px}.m-cta a{padding:12px;font-size:13px}
}
</style>
</head><body>

<!-- HEADER -->
<header class="hd"><div class="inner">
<p class="hd-logo">${esc(pName)}</p>
<nav class="hd-nav">
<a href="#about">About</a>
<a href="#expertise">Expertise</a>
<a href="#voice">Voice</a>
<a href="#contact" class="btn btn-md btn-accent">${esc(c.cta_text)}</a>
</nav>
</div></header>

<!-- HERO -->
<section class="fv"${hasImg && images[0] ? ` style="background-image:url('${esc(images[0].url.replace(/w=\d+/, "w=1600").replace(/h=\d+/, "h=1000"))}')"` : ""}>
<div class="fv-overlay"></div>
<div class="inner">
<div class="fv-txt">
<div class="fv-badge">${esc(c.badge_text || d.industry)}</div>
<h1 class="fv-name">${esc(pName)}</h1>
<p class="fv-role">${esc(pTitle)} / ${esc(d.company_name)}</p>
<p class="fv-headline">${esc(c.hero_headline)}</p>
<div class="fv-features">
${hf.map(ft => `<span>${esc(ft)}</span>`).join("")}
</div>
<div style="display:flex;flex-direction:column;align-items:center;gap:10px">
<a href="#contact" class="btn btn-lg btn-white">${esc(c.cta_text)} <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a>
${microHtml}
</div>
</div>
</div>
<div class="fv-stats">
${s.map(st => `<div class="fv-stat"><div class="fv-stat-num">${esc(st.number)}</div><div class="fv-stat-label">${esc(st.label)}</div></div>`).join("")}
</div>
</section>

<!-- ABOUT -->
<section class="sec about" id="about">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">About</p><p class="sec-eng">About</p><h2 class="sec-tit fi">${esc(c.about_title || `${pName}について`)}</h2></div>
<div class="about-grid fi">
<div>
<p class="about-txt">${esc(c.about_text || c.about || "")}</p>
<div class="about-strengths">
${str.map(item => `<div class="str">
<div class="str-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
<p>${esc(item.title)}<br/><span>${esc(item.desc)}</span></p>
</div>`).join("")}
</div>
</div>
<div class="about-visual">
${hasImg && images[1] ? `<img class="about-img" src="${esc(images[1].url)}" alt="${esc(pName)}" loading="lazy" onerror="this.style.display='none'">` : `<div class="about-avatar">${esc(pName.charAt(0))}</div>`}
</div>
</div>
</div>
</section>

<!-- DIVIDER: about → expertise -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--bg)"/><path d="M0,0 C300,55 600,70 800,40 C1000,10 1150,45 1200,25 L1200,0 L0,0 Z" fill="var(--bg2)"/></svg></div>

<!-- EXPERTISE (CARD_BORDERED + CARD_STAT) -->
<section class="sec dot-bg" id="expertise">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Expertise</p><p class="sec-eng">Expertise</p><h2 class="sec-tit fi">${esc(pName)}の専門領域</h2></div>
<div class="card-grid">
${exp.map((item, i) => `<div class="card card-accent fi">
<div class="card-ico">${ico[i] || ico[0]}</div>
<h3>${esc(item.title)}</h3>
<p>${esc(item.desc)}</p>
</div>`).join("")}
</div>
${s.length > 0 ? `<div class="stats-grid">
${s.map(st => `<div class="card stat-card fi">
<div class="stat-num">${esc(st.number)}</div>
<div class="stat-label">${esc(st.label)}</div>
</div>`).join("")}
</div>` : ""}
</div>
</section>

<!-- DIVIDER: expertise → cta1 -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--c)"/><path d="M0,0 C250,65 550,20 750,55 C950,72 1100,30 1200,45 L1200,0 L0,0 Z" fill="var(--bg)"/></svg></div>

<!-- CTA 1 (accent) -->
<section class="offer offer-accent">
<div class="inner" style="position:relative;z-index:1">
${c.urgency_text ? `<div class="offer-urgency">${clockSvg}${esc(c.urgency_text)}</div>` : ""}
<p class="offer-tit">${esc(c.cta_sub || "まずはお気軽にご相談ください")}</p>
<p class="offer-sub" style="color:rgba(255,255,255,.7)">${esc(c.guarantee_text || "無料相談・営業電話なし")}</p>
<a href="#contact" class="btn btn-lg btn-white">${esc(c.cta_text)} <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a>
${microHtml}
</div>
</section>

<!-- DIVIDER: cta1 → voice -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--bg)"/><path d="M0,0 C200,50 500,72 750,35 C1000,0 1150,40 1200,20 L1200,0 L0,0 Z" fill="var(--c)"/></svg></div>

<!-- TESTIMONIALS (TESTIMONIAL_CARD component) -->
${tm.length > 0 ? `<section class="sec" id="voice">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Voice</p><p class="sec-eng">Client Voice</p><h2 class="sec-tit fi">${esc(pName)}に依頼した方の声</h2></div>
<div class="tm-grid">
${tm.map(t => `<div class="tm-card fi">
<div class="tm-stars">${starSvg}${starSvg}${starSvg}${starSvg}${starSvg}</div>
<p class="tm-text">${esc(t.text)}</p>
<div class="tm-result">${esc(t.result)}</div>
<div class="tm-author">
<div class="tm-avatar">${esc(t.name.charAt(0))}</div>
<div><div class="tm-name">${esc(t.name)}</div><div class="tm-role">${esc(t.role)}</div></div>
</div>
</div>`).join("")}
</div>
</div>
</section>` : ""}

<!-- WHY CHOOSE ME (CARD_BORDERED highlight) -->
<section class="sec dot-bg" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Merit</p><p class="sec-eng">Why Choose Me</p><h2 class="sec-tit fi">${esc(pName)}が選ばれる理由</h2></div>
<div class="card-grid">
${m.map((item, i) => `<div class="card card-highlight fi">
<div class="card-ico">${ico[i] || ico[0]}</div>
<h3>${esc(item.title)}</h3>
<p>${esc(item.desc)}</p>
</div>`).join("")}
</div>
</div>
</section>

<!-- DIVIDER: merit → cta2 -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--dark)"/><path d="M0,0 C300,55 600,70 800,40 C1000,10 1150,45 1200,25 L1200,0 L0,0 Z" fill="var(--bg2)"/></svg></div>

<!-- CTA 2 (dark) -->
<section class="offer">
<div class="inner" style="position:relative;z-index:1">
<p class="offer-tit">${esc(c.cta_text)}</p>
<p class="offer-sub">${esc(c.cta_sub || "まずはお話を聞かせてください")}</p>
<a href="#contact" class="btn btn-lg btn-white">${esc(c.cta_text)} <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a>
${microHtml}
</div>
</section>

<!-- DIVIDER: cta2 → flow -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--bg2)"/><path d="M0,0 C250,60 550,25 750,55 C950,72 1100,30 1200,45 L1200,0 L0,0 Z" fill="var(--dark)"/></svg></div>

<!-- FLOW -->
<section class="sec" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Flow</p><p class="sec-eng">Flow</p><h2 class="sec-tit fi">ご依頼の流れ</h2></div>
<div class="flow-list fi" style="max-width:640px;margin:0 auto">
${f.map((item, i) => `<div class="flow-item">
<div class="flow-num">${i + 1}</div>
<div class="flow-body"><h3 class="flow-h3">${esc(item.title)}</h3><p class="flow-desc">${esc(item.desc)}</p></div>
</div>`).join("")}
</div>
</div>
</section>

<!-- FAQ (FAQ component) -->
${faq.length > 0 ? `<section class="sec">
<div class="inner" style="max-width:720px">
<div class="sec-hd"><p class="sec-bg-txt">FAQ</p><p class="sec-eng">FAQ</p><h2 class="sec-tit fi">よくある質問</h2></div>
<div class="faq-list fi">
${faq.map(item => `<details class="faq-item"><summary class="faq-q">${esc(item.q)}</summary><div class="faq-a">${esc(item.a)}</div></details>`).join("")}
</div>
</div>
</section>` : ""}

<!-- COMPANY -->
${c.company_profile ? `<section class="sec" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-eng">Company</p><h2 class="sec-tit fi">所属企業</h2></div>
<div class="company-box fi">
<div class="company-logo">${esc(d.company_name.charAt(0))}</div>
<div class="company-info"><strong>${esc(d.company_name)}</strong><p>${esc(c.company_profile)}</p></div>
</div>
</div>
</section>` : ""}

<!-- DIVIDER: → final cta -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--dark)"/><path d="M0,0 C200,60 500,72 700,45 C900,18 1100,50 1200,30 L1200,0 L0,0 Z" fill="var(--bg2)"/></svg></div>

<!-- FINAL CTA -->
<section class="cta-sec" id="contact">
<div class="cta-tit">${esc(pName)}に相談する</div>
<div class="cta-sub">${esc(c.cta_sub || "")}</div>
${c.urgency_text ? `<p style="display:inline-flex;align-items:center;gap:8px;padding:8px 20px;border:1px solid rgba(255,255,255,.12);border-radius:20px;font-size:13px;color:var(--ca);margin-bottom:24px;position:relative">${clockSvg}${esc(c.urgency_text)}</p><br>` : ""}
<a href="#contact" class="btn btn-lg btn-white" style="position:relative">${esc(c.cta_text)} <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a>
<div class="micro micro-light" style="position:relative">${checkSvg}<span>無料</span>${clockSvg}<span>30秒で完了</span>${checkSvg}<span>営業電話なし</span></div>
<p style="font-size:13px;color:rgba(255,255,255,.55);margin-top:20px;position:relative;padding:10px 24px;border:1px solid rgba(255,255,255,.1);border-radius:var(--r);display:inline-block">${esc(c.guarantee_text || "無料相談・営業電話なし")}</p>
</section>

<!-- FOOTER -->
<footer class="ft">&copy; ${esc(d.company_name)} All Rights Reserved.</footer>

<!-- MOBILE CTA -->
<div class="m-cta"><a href="#contact">${esc(c.cta_text)}</a><p class="m-cta-sub">無料・30秒で完了・営業電話なし</p></div>

<!-- SCROLL ANIMATION -->
<script>
(function(){var o=new IntersectionObserver(function(e){e.forEach(function(en){if(en.isIntersecting){en.target.classList.add('vis');o.unobserve(en.target)}})},{threshold:.12,rootMargin:'0px 0px -40px 0px'});document.querySelectorAll('.fi').forEach(function(el){o.observe(el)})})();
</script>
</body></html>`;
}

// ============================================================
// 広告クリエイティブ生成
// ============================================================

async function generateAd(d: FlatData, transcript: string, apiKey: string): Promise<string> {
  const content = await callClaudeJson<AdContent>(
    `商談内容を分析し、Facebook/Instagram広告クリエイティブ3パターンをJSON生成。
商談に複数社いる場合は「サービス提供側」の広告を作成。
商談中の具体的な数字・実績を活用し、ターゲット顧客に刺さるコピーに。
{"patterns":[{"primary":"125字以内の本文","headline":"40字以内の見出し","description":"30字以内","targeting":"具体的なターゲティング案","image_direction":"画像のディレクション"}]×3}
パターン1:数字訴求, パターン2:課題解決型, パターン3:権威性/実績型。JSONのみ出力。`,
    bizContext(d, transcript),
    apiKey,
    2500,
  );

  const pats = content.patterns || [];
  const colors = ["from-blue-600 to-cyan-500", "from-purple-600 to-pink-500", "from-emerald-600 to-teal-500"];

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>広告クリエイティブ - ${esc(d.service_name)}</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>body{font-family:'Noto Sans JP',sans-serif}</style>
</head><body class="bg-gray-50 text-gray-900 min-h-screen p-6 md:p-12">
<div class="max-w-4xl mx-auto">
<h1 class="text-2xl font-bold mb-2">${esc(d.service_name)} 広告クリエイティブ案</h1>
<p class="text-gray-500 mb-8">${esc(d.company_name)} | ${esc(d.target_customer)}向け</p>
<div class="space-y-8">${pats.map((p, i) => `
<div class="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
<div class="px-6 py-3 bg-gradient-to-r ${colors[i] || colors[0]} text-white flex items-center gap-2"><span class="font-bold">パターン ${i + 1}</span></div>
<div class="p-6 space-y-4">
<div><p class="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wider">Primary Text</p><p class="text-gray-700 leading-relaxed">${esc(p.primary)}</p></div>
<div><p class="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wider">Headline</p><p class="text-xl font-bold text-gray-900">${esc(p.headline)}</p></div>
<div><p class="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wider">Description</p><p class="text-gray-600">${esc(p.description)}</p></div>
<div class="pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
<div><p class="text-xs text-gray-400 mb-1 font-medium">Targeting</p><p class="text-sm text-gray-600">${esc(p.targeting)}</p></div>
<div><p class="text-xs text-gray-400 mb-1 font-medium">Image Direction</p><p class="text-sm text-gray-600">${esc(p.image_direction)}</p></div>
</div></div></div>`).join("")}
</div></div></body></html>`;
}

// ============================================================
// 議事録生成
// ============================================================

async function generateMinutes(d: FlatData, transcript: string, apiKey: string): Promise<string> {
  const content = await callClaudeJson<MinutesContent>(
    `商談トランスクリプトから正確な議事録をJSON生成。
【重要】
- 登場人物の名前と所属会社を正確に記載（話者ラベルから判断）
- 商談の種類（営業/協業/紹介ミーティングなど）を正しく判断
- 議題は内容ごとに分けて3-5個
- 具体的な数字・条件・価格を漏らさず記載
- アクションアイテムは商談内で合意された具体的な次のステップ

{"date":"日付(トランスクリプトから推定)","participants_self":"自社参加者(名前と役職)","participants_other":"先方参加者(名前と会社名)","purpose":"商談の目的","topics":[{"title":"議題名","summary":"詳細な内容100字以内"}]を3-5個,"decisions":["決定事項"],"actions":[{"item":"具体的タスク","owner":"担当者名","deadline":"期限"}],"next_meeting":"次回予定","upsell_notes":"追加提案・アップセル機会"}
JSONのみ出力。`,
    bizContext(d, transcript),
    apiKey,
    3000,
  );

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>商談議事録 - ${esc(d.company_name)}</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>body{font-family:'Noto Sans JP',sans-serif}@media print{body{background:#fff!important;color:#000!important}.no-print{display:none}}</style>
</head><body class="bg-white text-gray-900 min-h-screen">
<div class="max-w-3xl mx-auto px-6 py-12">
<div class="flex items-center justify-between mb-8 pb-4 border-b-2 border-gray-200">
<h1 class="text-2xl font-bold">商談議事録</h1>
<span class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">対応中</span>
</div>
<table class="w-full mb-8 text-sm">
<tr class="border-b"><td class="py-2 text-gray-500 w-32">日時</td><td class="py-2 font-medium">${esc(content.date)}</td></tr>
<tr class="border-b"><td class="py-2 text-gray-500">自社</td><td class="py-2">${esc(content.participants_self)}</td></tr>
<tr class="border-b"><td class="py-2 text-gray-500">先方</td><td class="py-2">${esc(content.participants_other)}</td></tr>
<tr class="border-b"><td class="py-2 text-gray-500">目的</td><td class="py-2">${esc(content.purpose)}</td></tr>
</table>
<h2 class="text-lg font-bold mb-4 flex items-center gap-2"><span class="w-1.5 h-6 bg-blue-500 rounded-full inline-block"></span>議題・討議内容</h2>
<div class="space-y-4 mb-8">${(content.topics || []).map(t => `
<div class="p-4 bg-gray-50 rounded-lg"><h3 class="font-bold mb-1">${esc(t.title)}</h3><p class="text-gray-600 text-sm">${esc(t.summary)}</p></div>`).join("")}
</div>
<h2 class="text-lg font-bold mb-4 flex items-center gap-2"><span class="w-1.5 h-6 bg-green-500 rounded-full inline-block"></span>決定事項</h2>
<ul class="mb-8 space-y-2">${(content.decisions || []).map(dd => `<li class="flex items-start gap-2"><svg class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span class="text-sm">${esc(dd)}</span></li>`).join("")}</ul>
<h2 class="text-lg font-bold mb-4 flex items-center gap-2"><span class="w-1.5 h-6 bg-orange-500 rounded-full inline-block"></span>アクションアイテム</h2>
<table class="w-full mb-8 text-sm"><thead><tr class="border-b-2"><th class="text-left py-2">項目</th><th class="text-left py-2 w-24">担当</th><th class="text-left py-2 w-28">期限</th></tr></thead>
<tbody>${(content.actions || []).map(a => `<tr class="border-b"><td class="py-2">${esc(a.item)}</td><td class="py-2">${esc(a.owner)}</td><td class="py-2 text-orange-600 font-medium">${esc(a.deadline)}</td></tr>`).join("")}</tbody></table>
<div class="p-4 bg-blue-50 rounded-lg mb-8"><p class="text-sm text-gray-500 mb-1">次回予定</p><p class="font-medium">${esc(content.next_meeting)}</p></div>
${content.upsell_notes ? `<div class="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200"><p class="text-sm text-purple-600 font-medium mb-1">アップセル機会メモ</p><p class="text-sm text-gray-700">${esc(content.upsell_notes)}</p></div>` : ""}
<p class="text-center text-xs text-gray-400 mt-12">この議事録はAIにより自動生成されました</p>
</div></body></html>`;
}

// ============================================================
// 汎用生成 (flyer, hearing_form, line_design, profile)
// ============================================================

const GENERIC_PROMPTS: Record<string, string> = {
  flyer: `A4チラシの表面・裏面コンテンツをJSON生成:
{"headline":"キャッチコピー","sub":"サブコピー","sections":[{"title":"セクション名","content":"内容"}]}
表面(キャッチ・3ポイント・CTA)と裏面(詳細・流れ・会社情報)を含める。JSONのみ出力。`,
  hearing_form: `ヒアリングフォームをJSON生成:
{"headline":"フォームタイトル","sub":"説明文","sections":[{"title":"質問","content":"選択肢や入力形式の説明"}]}
業種特化の質問10問。JSONのみ出力。`,
  line_design: `7日間LINE配信設計をJSON生成:
{"headline":"設計タイトル","sub":"戦略概要","sections":[{"title":"Day N: タイトル","content":"メッセージ内容と目的"}]}
Day1-7の配信計画。JSONのみ出力。`,
  profile: `プロフィールシートをJSON生成:
{"headline":"キャッチコピー","sub":"サービス概要","sections":[{"title":"セクション名","content":"内容"}]}
強み・ターゲット・実績・連絡先を含める。JSONのみ出力。`,
};

const GENERIC_TITLES: Record<string, string> = {
  flyer: "チラシ",
  hearing_form: "ヒアリングフォーム",
  line_design: "LINE導線設計書",
  profile: "プロフィールシート",
};

async function generateGeneric(type: string, d: FlatData, transcript: string, apiKey: string): Promise<string> {
  const content = await callClaudeJson<GenericContent>(
    GENERIC_PROMPTS[type] || GENERIC_PROMPTS["profile"]!,
    bizContext(d, transcript),
    apiKey,
  );

  const title = GENERIC_TITLES[type] || type;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - ${esc(d.service_name)}</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>body{font-family:'Noto Sans JP',sans-serif}@media print{.no-print{display:none}}</style>
</head><body class="bg-white text-gray-900 min-h-screen">
<div class="max-w-3xl mx-auto px-6 py-12">
<div class="text-center mb-12">
<p class="text-sm text-blue-600 font-semibold mb-2">${esc(d.company_name)}</p>
<h1 class="text-3xl md:text-4xl font-black mb-3">${esc(content.headline)}</h1>
<p class="text-gray-500">${esc(content.sub)}</p>
</div>
<div class="space-y-6">${(content.sections || []).map((s, i) => `
<div class="p-6 rounded-xl ${i % 2 === 0 ? "bg-gray-50" : "bg-blue-50/50"} border border-gray-100">
<h2 class="text-lg font-bold mb-3 flex items-center gap-2"><span class="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm font-bold">${i + 1}</span>${esc(s.title)}</h2>
<div class="text-gray-600 leading-relaxed whitespace-pre-line">${esc(s.content)}</div>
</div>`).join("")}
</div>
<p class="text-center text-xs text-gray-400 mt-12">${esc(d.company_name)}</p>
</div></body></html>`;
}

// ============================================================
// HTMLエスケープ
// ============================================================

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ============================================================
// メインハンドラー
// ============================================================

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "POST only" }), { status: 405, headers: { "Content-Type": "application/json", ...CORS } });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sessionId = body["session_id"] as string | undefined;
    const type = body["type"] as string | undefined;
    const step = (body["step"] as string) || ""; // LP用: draft / evaluate / build
    const transcript = (body["transcript"] as string) || "";
    const rawData = (body["extracted_data"] as Record<string, unknown>) || {};
    const draftContent = body["draft_content"] as LpContent | undefined;

    if (!sessionId) return new Response(JSON.stringify({ success: false, error: "session_id必須" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
    if (!type || !VALID_TYPES.has(type)) return new Response(JSON.stringify({ success: false, error: "無効なtype" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) return new Response(JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY未設定" }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });

    const data = flatten(rawData);
    const start = Date.now();

    // ============================================================
    // LP 3ステップパイプライン
    // ============================================================
    if (type === "lp" && step) {
      if (step === "draft") {
        console.log(`[generate] LP draft start, transcript=${transcript.length}chars`);
        const processedTranscript = truncateTranscript(transcript);
        const draft = await lpDraft(data, processedTranscript, apiKey, rawData);
        console.log(`[generate] LP draft done: ${((Date.now() - start) / 1000).toFixed(1)}s`);
        return new Response(
          JSON.stringify({ success: true, step: "draft", content: draft }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
        );
      }

      if (step === "evaluate") {
        if (!draftContent) return new Response(JSON.stringify({ success: false, error: "draft_content必須" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
        console.log(`[generate] LP evaluate start`);
        const revised = await lpEvaluate(draftContent, data, apiKey);
        console.log(`[generate] LP evaluate done: ${((Date.now() - start) / 1000).toFixed(1)}s`);
        return new Response(
          JSON.stringify({ success: true, step: "evaluate", content: revised }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
        );
      }

      if (step === "build") {
        if (!draftContent) return new Response(JSON.stringify({ success: false, error: "draft_content必須" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
        console.log(`[generate] LP build start`);

        // 業種別キュレーション画像を選択（APIキー不要）
        const images = selectImages(data);
        console.log(`[generate] images: ${images.length} selected for industry="${data.industry}"`);

        const html = buildLpHtml(draftContent as LpContent, data, images);

        // Blobsに保存
        const blobKey = `${sessionId}/${type}`;
        try {
          const store = getStore("deliverables");
          await store.set(blobKey, html, { metadata: { type, sessionId, createdAt: new Date().toISOString() } });
        } catch (blobErr) {
          console.warn("[generate] blob save failed:", blobErr);
        }

        const viewUrl = `/view/${encodeURIComponent(sessionId)}/${encodeURIComponent(type)}`;
        console.log(`[generate] LP build done: ${((Date.now() - start) / 1000).toFixed(1)}s, ${html.length}chars`);
        return new Response(
          JSON.stringify({ success: true, step: "build", html, type, view_url: viewUrl }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
        );
      }
    }

    // ============================================================
    // LP以外 or LP旧互換（step未指定）
    // ============================================================
    console.log(`[generate] ${type} start, transcript=${transcript.length}chars`);
    const processedTranscript = truncateTranscript(transcript);

    let html: string;
    if (type === "lp") {
      const draft = await lpDraft(data, processedTranscript, apiKey, rawData);
      const images = selectImages(data);
      html = buildLpHtml(draft, data, images);
    } else if (type === "ad_creative") html = await generateAd(data, processedTranscript, apiKey);
    else if (type === "minutes") html = await generateMinutes(data, processedTranscript, apiKey);
    else html = await generateGeneric(type, data, processedTranscript, apiKey);

    console.log(`[generate] ${type} done: ${((Date.now() - start) / 1000).toFixed(1)}s, ${html.length}chars`);

    const blobKey = `${sessionId}/${type}`;
    try {
      const store = getStore("deliverables");
      await store.set(blobKey, html, { metadata: { type, sessionId, createdAt: new Date().toISOString() } });
    } catch (blobErr) {
      console.warn("[generate] blob save failed:", blobErr);
    }

    const viewUrl = `/view/${encodeURIComponent(sessionId)}/${encodeURIComponent(type as string)}`;
    return new Response(JSON.stringify({ success: true, html, type, view_url: viewUrl }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
  } catch (error) {
    console.error("[generate] error:", error);
    const msg = error instanceof Error ? error.message : "生成エラー";
    return new Response(JSON.stringify({ success: false, error: `制作物の生成に失敗しました: ${msg}` }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
  }
}

export const config: Config = {
  path: "/api/generate-lp",
  method: ["POST", "OPTIONS"],
};
