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
  hero_headline: string;
  hero_sub: string;
  hero_features: string[];
  badge_text: string;
  about_title: string;
  about_text: string;
  problems: { title: string; desc: string }[];
  transition_text: string;
  benefits: { title: string; desc: string }[];
  merits: { title: string; desc: string }[];
  cta_text: string;
  cta_sub: string;
  stats: { number: string; label: string }[];
  flow: { title: string; desc: string }[];
  comparison: { feature: string; us: string; other: string }[];
  faq: { q: string; a: string }[];
  about: string;
  guarantee_text: string;
  testimonials: { name: string; role: string; text: string; result: string }[];
  company_profile: string;
  urgency_text: string;
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

const LP_DRAFT_PROMPT = `商談情報からLP用コピーをJSON形式で生成。数字で語れ。形容詞禁止。

出力JSON（全フィールド必須）:
{
  "hero_headline": "25字以内。数字+固有名詞必須",
  "hero_sub": "50字以内",
  "hero_features": ["数字入り12字×3"],
  "badge_text": "12字以内",
  "about_title": "20字以内",
  "about_text": "100字以内",
  "problems": [{"title":"15字","desc":"50字"}],
  "transition_text": "20字以内",
  "benefits": [{"title":"20字","desc":"数字+結果で80字"}],
  "merits": [{"title":"20字","desc":"導入後の変化80字"}],
  "cta_text": "8字以内",
  "cta_sub": "20字以内",
  "stats": [{"number":"92%","label":"採択率"}],
  "flow": [{"title":"10字","desc":"40字"}],
  "comparison": [{"feature":"比較項目","us":"数字で自社","other":"一般的"}],
  "faq": [{"q":"質問","a":"50字"}],
  "about": "会社紹介100字",
  "guarantee_text": "安心保証30字",
  "testimonials": [{"name":"実名","role":"業種 役職","text":"数字入り体験談60字","result":"定量的成果20字"}],
  "company_profile": "設立年・実績数80字",
  "urgency_text": "数字入り20字以内"
}
problems3,benefits3,merits3,stats4,flow4,comparison4,faq4,testimonials3。JSONのみ出力。`;

async function lpDraft(d: FlatData, transcript: string, apiKey: string, rawData?: Record<string, unknown>): Promise<LpContent> {
  return callClaudeJson<LpContent>(LP_DRAFT_PROMPT, bizContext(d, transcript, rawData), apiKey, 4000, LP_MODEL);
}

// ============================================================
// LP Step 2: Evaluate + Revise (品質評価+修正)
// ============================================================

const LP_EVALUATE_PROMPT = `あなたはCVR12%超のLP専門コピーライター。入力JSONを"売れるLP"に書き換えてください。

【字数制限（厳守・超過は全て短縮）】
- hero_headline: 25字以内。数字+固有名詞必須。型:「○○が△△を□□した方法」「たった○○で△△%改善」
- hero_sub: 50字以内。headlineの具体的な補足
- hero_features: 各12字以内、3つ。各項目に数字を1つ含める
- badge_text: 12字以内。業種×実績（例:「製造業DX実績No.1」）
- transition_text: 20字以内。課題→解決の橋渡し
- urgency_text: 20字以内。必ず数字入り（例:「3月の無料枠：残り3社」「先着10社限定」）
- cta_text: 8字以内（例:「無料で相談する」「資料をもらう」）
- cta_sub: 20字以内

【品質ルール】
1. 形容詞禁止。「豊富な」→「年間200件の」、「高品質な」→「顧客満足度98%の」
2. 主語を具体化。「多くの企業」→「従業員50名以上の製造業」
3. benefits/features: 3つそれぞれに異なる具体的数字を入れる。同じ表現の繰り返し禁止
4. problems: ターゲットが「あるある」と思う日常的な課題。抽象的な経営課題NG
5. testimonials: 必ず3件。各testimonialに異なる業種名+改善数字。resultは「売上○%UP」「コスト○万円削減」のように定量的
6. comparison: usは具体的数字、otherは「一般的には…」で対比
7. stats: 4つすべて異なるカテゴリの数字（例: 実績数、満足度、削減率、対応速度）
8. faq: 「料金」「期間」「他社との違い」「サポート」の4種を必ずカバー

【絶対NG】
- 「お客様に寄り添う」「丁寧なサポート」等の抽象フレーズ
- 同じ数字の使い回し
- フィールドの省略・空配列

入力と同じJSON構造で出力。JSON以外のテキスト不要。`;

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
  const p = c.problems || [];
  const b = c.benefits || [];
  const m = c.merits?.length ? c.merits : (c.benefits?.length ? c.benefits : []);
  const s = c.stats || [];
  const f = c.flow || [];
  const cmp = c.comparison || [];
  const faq = c.faq || [];
  const hf = c.hero_features || [];
  const tm = c.testimonials || [];
  const colors = getDecoColors(d.industry);
  const hasImg = images.length > 0;

  const ico = [
    `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="var(--c)" opacity=".12"/><path d="M14 20l4 4 8-10" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="var(--c)" opacity=".12"/><path d="M20 12v8l5 3" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="var(--c)" opacity=".12"/><path d="M14 26l5-10 5 6 5-8" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ];

  const starSvg = `<svg width="18" height="18" viewBox="0 0 20 20" fill="#f59e0b"><path d="M10 1l2.39 4.84L18 6.71l-4 3.9.94 5.5L10 13.38 5.06 16.1 6 10.6l-4-3.9 5.61-.87L10 1z"/></svg>`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.service_name)} | ${esc(d.company_name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--c:${colors.primary};--cg:${colors.gradient};--ca:${colors.accent};--dark:#0f172a;--t1:#1e293b;--t2:#475569;--t3:#94a3b8;--bg:#fff;--bg2:#f1f5f9;--bd:#e2e8f0;--r:10px}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:'Noto Sans JP','Inter',sans-serif;color:var(--t1);background:var(--bg);line-height:1.8;-webkit-font-smoothing:antialiased}
a{text-decoration:none;color:inherit}
img{max-width:100%;display:block}
.inner{max-width:1100px;margin:0 auto;padding:0 24px}
.sp{display:none}
@media(max-width:750px){.sp{display:block}.pc{display:none}}

/* SCROLL ANIMATION */
.fi{opacity:0;transform:translateY(28px);transition:opacity .7s ease,transform .7s ease}
.fi.vis{opacity:1;transform:translateY(0)}

/* HEADER */
.hd{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--bd);height:64px;display:flex;align-items:center}
.hd .inner{display:flex;align-items:center;justify-content:space-between;width:100%}
.hd-logo{font-weight:800;font-size:18px;color:var(--c)}
.hd-nav{display:flex;gap:24px;align-items:center}
.hd-nav a{font-size:13px;color:var(--t2);font-weight:500;transition:color .2s}
.hd-nav a:hover{color:var(--c)}
.hd-cta{padding:8px 20px;background:var(--c);color:#fff!important;font-size:13px;font-weight:700;border-radius:var(--r);transition:opacity .2s}
.hd-cta:hover{opacity:.85}
@media(max-width:750px){.hd-nav a:not(.hd-cta){display:none}}

/* HERO - fullscreen bg image */
.fv{position:relative;min-height:100vh;display:flex;align-items:center;overflow:hidden;padding-top:64px;background-size:cover;background-position:center;background-repeat:no-repeat}
.fv-overlay{position:absolute;inset:0;background:linear-gradient(135deg,rgba(15,23,42,.88) 0%,rgba(15,23,42,.72) 50%,rgba(15,23,42,.55) 100%);z-index:0}
.fv .inner{position:relative;z-index:1;max-width:800px;text-align:center;padding-top:80px;padding-bottom:120px}
.fv-txt h1{font-size:clamp(30px,5vw,52px);font-weight:900;line-height:1.2;letter-spacing:-.02em;margin-bottom:18px;color:#fff}
.fv-txt h1 em{font-style:normal;color:var(--ca);position:relative}
.fv-txt h1 em::after{content:'';position:absolute;bottom:2px;left:0;right:0;height:3px;background:var(--ca);opacity:.6}
.fv-sub{font-size:clamp(15px,1.8vw,18px);color:rgba(255,255,255,.75);margin-bottom:32px;line-height:1.9}
.fv-badge{display:inline-block;padding:6px 18px;border:1px solid rgba(255,255,255,.25);border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.15em;color:var(--ca);text-transform:uppercase;margin-bottom:20px}
.fv-features{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:36px;justify-content:center}
.fv-features span{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:rgba(255,255,255,.12);backdrop-filter:blur(4px);color:#fff;font-size:13px;font-weight:700;letter-spacing:.03em;border-radius:var(--r);border:1px solid rgba(255,255,255,.1)}
.fv-features span::before{content:'';width:5px;height:5px;background:var(--ca);border-radius:50%}
.fv-cta-wrap{display:flex;flex-direction:column;align-items:center;gap:10px}
.fv-cta{display:inline-flex;align-items:center;gap:8px;padding:18px 48px;background:#fff;color:var(--dark);font-weight:800;font-size:16px;border-radius:var(--r);transition:transform .2s,box-shadow .2s}
.fv-cta:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.25)}
.fv-micro{font-size:12px;color:rgba(255,255,255,.5);display:flex;align-items:center;gap:14px}
.fv-micro span{display:flex;align-items:center;gap:4px}
.fv-micro svg{width:14px;height:14px;stroke:var(--ca);fill:none;stroke-width:2}
.fv-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,.95);backdrop-filter:blur(10px);z-index:2}
.fv-stat{padding:24px 16px;text-align:center;border-right:1px solid var(--bd)}
.fv-stat:last-child{border-right:none}
.fv-stat-num{font-family:'Inter',sans-serif;font-size:clamp(24px,3.5vw,40px);font-weight:900;background:var(--cg);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.1;font-variant-numeric:tabular-nums}
.fv-stat-label{font-size:12px;color:var(--t2);margin-top:4px;letter-spacing:.05em;font-weight:600}
/* WAVE DIVIDERS */
.dvd{position:relative;height:72px;margin-top:-1px;z-index:3;overflow:hidden}
.dvd svg{width:100%;height:100%;display:block}
@media(max-width:750px){
.fv .inner{padding-top:48px;padding-bottom:100px}
.fv-stats{grid-template-columns:repeat(2,1fr)}
.dvd{height:48px}
}

/* SECTION COMMON */
.sec{padding:100px 0;position:relative;overflow:hidden}
.sec-hd{text-align:center;margin-bottom:56px}
.sec-bg-txt{font-family:'Inter',sans-serif;font-size:clamp(48px,8vw,96px);font-weight:900;color:var(--c);opacity:.03;text-transform:uppercase;letter-spacing:-.03em;line-height:1;margin-bottom:-30px;position:relative;z-index:0}
.sec-eng{font-family:'Inter',sans-serif;font-size:12px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--c);margin-bottom:8px}
.sec-tit{font-size:clamp(22px,3.5vw,32px);font-weight:900;line-height:1.35;position:relative;z-index:1}
.sec-sub{font-size:15px;color:var(--t2);margin-top:12px;max-width:560px;margin-left:auto;margin-right:auto}
@media(max-width:750px){.sec{padding:64px 0}.sec-bg-txt{font-size:48px;margin-bottom:-16px}}

/* DOT DECORATION */
.dot-bg{background-image:radial-gradient(circle at 1px 1px,rgba(0,0,0,.04) 1px,transparent 0);background-size:24px 24px}

/* WAVE SEPARATOR */
.wave-top{position:absolute;top:-1px;left:0;right:0;height:48px;overflow:hidden}
.wave-top svg{width:100%;height:100%;display:block}
.wave-bot{position:absolute;bottom:-1px;left:0;right:0;height:48px;overflow:hidden}
.wave-bot svg{width:100%;height:100%;display:block}

/* ABOUT */
.about{background:var(--bg2)}
.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.about-txt{font-size:15px;color:var(--t2);line-height:2;margin-bottom:24px}
.about-problems{display:flex;flex-direction:column;gap:12px}
.about-problem{display:flex;align-items:center;gap:14px;padding:16px 20px;background:var(--bg);border:1px solid var(--bd);border-left:3px solid #ef4444;border-radius:var(--r);transition:border-color .2s,box-shadow .2s}
.about-problem:hover{box-shadow:0 4px 12px rgba(0,0,0,.05)}
.about-problem-icon{flex-shrink:0;width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:rgba(239,68,68,.08);border-radius:8px}
.about-problem-icon svg{width:18px;height:18px;color:#ef4444}
.about-problem p{font-size:14px;font-weight:600}
.about-visual{position:relative;display:flex;align-items:center;justify-content:center}
.about-visual::before{content:'';position:absolute;inset:0;background:var(--cg);opacity:.06;border-radius:16px}
.about-visual-inner{position:relative;padding:40px;text-align:center}
.about-visual-inner .big-num{font-family:'Inter',sans-serif;font-size:80px;font-weight:900;color:var(--c);opacity:.15;line-height:1}
.about-visual-inner .label{font-size:14px;font-weight:700;color:var(--t1);margin-top:-20px;position:relative}
.about-transition{text-align:center;margin-top:48px;font-size:clamp(16px,2.5vw,20px);font-weight:800;color:var(--c);padding:20px 24px;border:2px solid var(--ca);border-radius:var(--r);background:rgba(${parseInt(colors.primary.slice(1,3),16)},${parseInt(colors.primary.slice(3,5),16)},${parseInt(colors.primary.slice(5,7),16)},.04)}
@media(max-width:750px){.about-grid{grid-template-columns:1fr}.about-visual{margin-bottom:24px;order:-1}}

/* FEATURES */
.features-list{display:flex;flex-direction:column;gap:56px}
.feature-item{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.feature-item:nth-child(even){direction:rtl}
.feature-item:nth-child(even)>*{direction:ltr}
.feature-num{font-family:'Inter',sans-serif;font-size:13px;font-weight:800;color:var(--c);letter-spacing:.15em;margin-bottom:12px}
.feature-h3{font-size:clamp(18px,2.5vw,22px);font-weight:800;margin-bottom:10px}
.feature-desc{font-size:15px;color:var(--t2);line-height:1.9}
.feature-visual{position:relative;aspect-ratio:4/3;overflow:hidden;border-radius:var(--r);display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg2);border:1px solid var(--bd)}
.feature-visual::before{content:'';position:absolute;inset:0;background:var(--cg);opacity:.04}
.feature-visual::after{content:attr(data-num);position:absolute;bottom:12px;right:16px;font-family:'Inter',sans-serif;font-size:100px;font-weight:900;color:var(--c);opacity:.06;line-height:1}
.feature-visual .fv-ico{position:relative;z-index:1;margin-bottom:12px}
.feature-visual .fv-stat-big{font-family:'Inter',sans-serif;font-size:clamp(36px,5vw,56px);font-weight:900;background:var(--cg);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.1;position:relative;z-index:1}
.feature-visual .fv-stat-sub{font-size:13px;color:var(--t3);margin-top:4px;position:relative;z-index:1;font-weight:600}
/* 画像あり時 */
.feature-visual.has-img{background:none;border:none;padding:0}
.feature-visual.has-img::before{display:none}
.feature-visual.has-img::after{display:none}
.feature-visual.has-img img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0;border-radius:var(--r)}
.about-img{width:100%;height:100%;object-fit:cover;border-radius:var(--r);position:absolute;inset:0}
@media(max-width:750px){.feature-item,.feature-item:nth-child(even){grid-template-columns:1fr;direction:ltr}.feature-visual{aspect-ratio:16/9}}

/* TESTIMONIALS */
.tm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.tm-card{padding:32px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);position:relative;transition:box-shadow .3s,transform .3s}
.tm-card:hover{box-shadow:0 12px 40px rgba(0,0,0,.08);transform:translateY(-4px)}
.tm-card::before{content:'"';position:absolute;top:12px;right:20px;font-family:Georgia,serif;font-size:64px;color:var(--c);opacity:.1;line-height:1}
.tm-stars{display:flex;gap:3px;margin-bottom:14px}
.tm-text{font-size:15px;color:var(--t1);line-height:1.9;margin-bottom:18px;font-style:italic}
.tm-result{display:inline-block;padding:6px 16px;background:rgba(${parseInt(colors.primary.slice(1,3),16)},${parseInt(colors.primary.slice(3,5),16)},${parseInt(colors.primary.slice(5,7),16)},.1);color:var(--c);font-size:13px;font-weight:800;border-radius:20px;margin-bottom:16px}
.tm-author{display:flex;align-items:center;gap:12px;border-top:1px solid var(--bd);padding-top:16px}
.tm-avatar{width:48px;height:48px;border-radius:50%;background:var(--cg);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px}
.tm-name{font-size:14px;font-weight:800}
.tm-role{font-size:12px;color:var(--t3)}
@media(max-width:750px){.tm-grid{grid-template-columns:1fr}}

/* MID CTA (OFFER) */
.offer{padding:56px 0;background:var(--dark);color:#fff;text-align:center;position:relative;overflow:hidden}
.offer::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:400px;background:radial-gradient(circle,rgba(255,255,255,.04),transparent 70%)}
.offer-tit{font-size:clamp(18px,3vw,24px);font-weight:800;margin-bottom:8px;position:relative}
.offer-sub{font-size:13px;color:rgba(255,255,255,.5);margin-bottom:12px;position:relative}
.offer-urgency{display:inline-flex;align-items:center;gap:8px;padding:6px 16px;border:1px solid rgba(255,255,255,.15);border-radius:20px;font-size:12px;color:var(--ca);margin-bottom:20px;position:relative}
.offer-urgency svg{width:14px;height:14px;fill:none;stroke:var(--ca);stroke-width:2}
.offer .fv-cta{background:var(--c);border-radius:var(--r);position:relative}
.offer-micro{font-size:12px;color:rgba(255,255,255,.4);margin-top:12px;position:relative}

/* MERIT */
.merit-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.merit-card{position:relative;padding:32px 24px;border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;transition:border-color .3s,box-shadow .3s,transform .3s}
.merit-card:hover{border-color:var(--c);box-shadow:0 12px 32px rgba(0,0,0,.06);transform:translateY(-4px)}
.merit-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--cg)}
.merit-ico{color:var(--c);margin-bottom:16px}
.merit-h3{font-size:16px;font-weight:800;margin-bottom:8px}
.merit-desc{font-size:14px;color:var(--t2);line-height:1.9}
@media(max-width:750px){.merit-grid{grid-template-columns:1fr}}

/* COMPARISON */
.cmp-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.cmp-card{padding:28px;border:2px solid var(--bd);border-radius:var(--r);background:var(--bg)}
.cmp-us{border-color:var(--c);position:relative;background:rgba(${parseInt(colors.primary.slice(1,3),16)},${parseInt(colors.primary.slice(3,5),16)},${parseInt(colors.primary.slice(5,7),16)},.02);box-shadow:0 4px 24px rgba(${parseInt(colors.primary.slice(1,3),16)},${parseInt(colors.primary.slice(3,5),16)},${parseInt(colors.primary.slice(5,7),16)},.08)}
.cmp-us::before{content:'RECOMMEND';position:absolute;top:-13px;left:20px;background:var(--c);color:#fff;font-size:10px;font-weight:700;letter-spacing:.15em;padding:4px 14px;font-family:'Inter',sans-serif;border-radius:4px}
.cmp-title{font-size:15px;font-weight:800;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--bd)}
.cmp-us .cmp-title{color:var(--c)}
.cmp-row{display:flex;align-items:flex-start;gap:10px;padding:10px 0;font-size:14px;color:var(--t2)}
.cmp-row strong{color:var(--t1)}
@media(max-width:750px){.cmp-grid{grid-template-columns:1fr}}

/* FLOW */
.flow-list{position:relative;display:grid;gap:0}
.flow-list::before{content:'';position:absolute;left:28px;top:28px;bottom:28px;width:2px;background:var(--bd)}
.flow-item{display:flex;gap:20px;padding:20px 0}
.flow-num{position:relative;z-index:1;flex-shrink:0;width:56px;height:56px;display:flex;align-items:center;justify-content:center;background:var(--cg);color:#fff;font-family:'Inter',sans-serif;font-weight:900;font-size:20px;border-radius:var(--r)}
.flow-h3{font-weight:700;font-size:15px;margin-bottom:4px}
.flow-desc{font-size:14px;color:var(--t2)}
.flow-body{padding-top:14px}

/* FAQ */
.faq-list{display:flex;flex-direction:column;gap:10px}
.faq-item{border:1px solid var(--bd);border-radius:var(--r);overflow:hidden}
.faq-q{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;cursor:pointer;font-weight:700;font-size:15px;list-style:none;transition:background .15s}
.faq-q:hover{background:var(--bg2)}
.faq-q::-webkit-details-marker{display:none}
.faq-q::after{content:'+';font-size:20px;color:var(--t3);transition:transform .25s}
details[open] .faq-q::after{transform:rotate(45deg)}
.faq-a{padding:0 20px 18px;font-size:15px;color:var(--t2);line-height:1.9;border-top:1px solid var(--bd)}

/* COMPANY */
.company-box{max-width:720px;margin:0 auto;padding:32px;border:1px solid var(--bd);border-radius:var(--r);display:flex;align-items:center;gap:24px}
.company-logo{flex-shrink:0;width:64px;height:64px;border-radius:var(--r);background:var(--cg);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:24px}
.company-info p{font-size:14px;color:var(--t2);line-height:1.8}
.company-info strong{color:var(--t1);font-size:16px;display:block;margin-bottom:4px}
@media(max-width:750px){.company-box{flex-direction:column;text-align:center}}

/* CTA */
.cta-sec{padding:100px 24px;background:var(--dark);text-align:center;position:relative;overflow:hidden}
.cta-sec::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;height:500px;background:radial-gradient(circle,rgba(255,255,255,.04),transparent 70%)}
.cta-tit{font-size:clamp(22px,3.5vw,30px);font-weight:900;color:#fff;margin-bottom:10px;position:relative}
.cta-sub{font-size:14px;color:rgba(255,255,255,.5);margin-bottom:12px;position:relative}
.cta-urgency{display:inline-flex;align-items:center;gap:8px;padding:8px 20px;border:1px solid rgba(255,255,255,.12);border-radius:20px;font-size:13px;color:var(--ca);margin-bottom:24px;position:relative}
.cta-urgency svg{width:14px;height:14px;fill:none;stroke:var(--ca);stroke-width:2}
.cta-btn{display:inline-flex;align-items:center;gap:8px;padding:18px 48px;background:#fff;color:var(--dark);font-weight:800;font-size:15px;border-radius:var(--r);transition:transform .2s,box-shadow .2s;position:relative}
.cta-btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(255,255,255,.12)}
.cta-micro{font-size:13px;color:rgba(255,255,255,.45);margin-top:14px;position:relative;display:flex;justify-content:center;gap:16px}
.cta-micro span{display:flex;align-items:center;gap:4px}
.cta-micro svg{width:14px;height:14px;fill:none;stroke:rgba(255,255,255,.5);stroke-width:2}
.cta-g{font-size:13px;color:rgba(255,255,255,.55);margin-top:20px;position:relative;padding:10px 24px;border:1px solid rgba(255,255,255,.1);border-radius:var(--r);display:inline-block}

/* FOOTER */
.ft{padding:28px;text-align:center;border-top:1px solid var(--bd);font-size:12px;color:var(--t3)}

/* MOBILE CTA */
.m-cta{display:none;position:fixed;bottom:0;left:0;right:0;padding:10px 16px;background:rgba(255,255,255,.95);backdrop-filter:blur(12px);border-top:1px solid var(--bd);z-index:100}
.m-cta a{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:14px;background:var(--c);color:#fff;font-weight:800;font-size:14px;border-radius:var(--r)}
.m-cta-sub{font-size:10px;color:var(--t3);text-align:center;margin-top:4px}
@media(max-width:750px){.m-cta{display:block}body{padding-bottom:72px}}
</style>
</head><body>

<!-- HEADER -->
<header class="hd"><div class="inner">
<p class="hd-logo">${esc(d.service_name || d.company_name)}</p>
<nav class="hd-nav">
<a href="#about">About</a>
<a href="#features">Features</a>
<a href="#voice">Voice</a>
<a href="#merit">Merit</a>
<a href="#contact" class="hd-cta">${esc(c.cta_text)}</a>
</nav>
</div></header>

<!-- HERO (fullscreen image bg) -->
<section class="fv"${hasImg && images[0] ? ` style="background-image:url('${esc(images[0].url.replace(/w=\d+/, "w=1600").replace(/h=\d+/, "h=1000"))}')"` : ""}>
<div class="fv-overlay"></div>
<div class="inner">
<div class="fv-txt">
<div class="fv-badge">${esc(c.badge_text || d.industry)}</div>
<h1>${esc(c.hero_headline)}</h1>
<p class="fv-sub">${esc(c.hero_sub)}</p>
<div class="fv-features">
${hf.map(ft => `<span>${esc(ft)}</span>`).join("")}
</div>
<div class="fv-cta-wrap">
<a href="#contact" class="fv-cta">${esc(c.cta_text)} <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a>
<p class="fv-micro"><span><svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>無料</span><span><svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>30秒で完了</span><span><svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>営業電話なし</span></p>
</div>
</div>
</div>
<div class="fv-stats">
${s.map(st => `<div class="fv-stat"><div class="fv-stat-num">${esc(st.number)}</div><div class="fv-stat-label">${esc(st.label)}</div></div>`).join("")}
</div>
</section>

<!-- DIVIDER: hero → about (wave, dark→gray) -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--bg2)"/><path d="M0,0 C200,60 500,72 700,45 C900,18 1100,50 1200,30 L1200,0 L0,0 Z" fill="var(--dark)"/></svg></div>

<!-- ABOUT -->
<section class="sec about" id="about">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">About</p><p class="sec-eng">About</p><h2 class="sec-tit fi">${esc(c.about_title || `${d.service_name}とは？`)}</h2></div>
<div class="about-grid fi">
<div>
<p class="about-txt">${esc(c.about_text || c.about)}</p>
<div class="about-problems">
${p.map(item => `<div class="about-problem">
<div class="about-problem-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg></div>
<p>${esc(item.title)}<br/><span style="font-weight:400;font-size:13px;color:var(--t2)">${esc(item.desc)}</span></p>
</div>`).join("")}
</div>
</div>
<div class="about-visual" style="position:relative;min-height:320px;border-radius:var(--r);overflow:hidden">
${hasImg && images[1] ? `<img class="about-img" src="${esc(images[1].url)}" alt="${esc(images[1].alt)}" loading="lazy" style="opacity:1">` : `<div class="about-visual-inner"><div class="big-num" style="font-size:64px">${esc(d.service_name.charAt(0) || "S")}</div><div class="label" style="margin-top:-10px">${esc(d.service_name)}</div></div>`}
</div>
</div>
<div class="about-transition fi">${esc(c.transition_text || `${d.service_name}なら、すべて解決します`)}</div>
</div>
</section>

<!-- DIVIDER: about → features (wave, gray→white) -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--bg)"/><path d="M0,0 C300,55 600,70 800,40 C1000,10 1150,45 1200,25 L1200,0 L0,0 Z" fill="var(--bg2)"/></svg></div>

<!-- FEATURES -->
<section class="sec dot-bg" id="features">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Features</p><p class="sec-eng">Features</p><h2 class="sec-tit fi">${esc(d.service_name)}が選ばれる理由</h2></div>
<div class="features-list">
${b.map((item, i) => `<div class="feature-item fi">
<div>
<p class="feature-num">FEATURE ${String(i + 1).padStart(2, "0")}</p>
<h3 class="feature-h3">${esc(item.title)}</h3>
<p class="feature-desc">${esc(item.desc)}</p>
</div>
<div class="feature-visual${hasImg && images[i + 2] ? " has-img" : ""}" data-num="${String(i + 1).padStart(2, "0")}">
${hasImg && images[i + 2] ? `<img src="${esc(images[i + 2]!.url)}" alt="${esc(images[i + 2]!.alt)}" loading="lazy">` : `${ico[i] || ico[0]}
${s[i + 1] ? `<div class="fv-stat-big">${esc(s[i + 1]?.number || "")}</div><div class="fv-stat-sub">${esc(s[i + 1]?.label || "")}</div>` : `<div class="fv-stat-big">${String(i + 1).padStart(2, "0")}</div>`}`}
</div>
</div>`).join("")}
</div>
</div>
</section>

<!-- DIVIDER: features → cta1 (wave, white→accent) -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--c)"/><path d="M0,0 C250,65 550,20 750,55 C950,72 1100,30 1200,45 L1200,0 L0,0 Z" fill="var(--bg)"/></svg></div>

<!-- MID CTA 1 (OFFER - primary, accent gradient) -->
<section class="offer" style="background:var(--cg);padding:72px 0">
<div class="inner" style="position:relative;z-index:1">
${c.urgency_text ? `<div class="offer-urgency" style="border-color:rgba(255,255,255,.3);color:#fff;font-weight:700"><svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${esc(c.urgency_text)}</div>` : ""}
<p class="offer-tit" style="font-size:clamp(20px,3.5vw,28px)">${esc(c.cta_sub || "まずはお気軽にご相談ください")}</p>
<p class="offer-sub" style="color:rgba(255,255,255,.7)">${esc(c.guarantee_text || "無料相談・しつこい営業は一切ありません")}</p>
<br><a href="#contact" class="fv-cta" style="background:#fff;color:var(--dark);font-size:16px;padding:18px 48px">${esc(c.cta_text)} <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a>
<p class="offer-micro" style="color:rgba(255,255,255,.55)">30秒で完了 / 無料 / 営業電話なし</p>
</div>
</section>

<!-- DIVIDER: cta1 → testimonials (wave, accent→white) -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--bg)"/><path d="M0,0 C200,50 500,72 750,35 C1000,0 1150,40 1200,20 L1200,0 L0,0 Z" fill="var(--c)"/></svg></div>

<!-- TESTIMONIALS -->
${tm.length > 0 ? `<section class="sec" id="voice">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Voice</p><p class="sec-eng">Voice</p><h2 class="sec-tit fi">お客様の声</h2></div>
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

<!-- MERIT -->
<section class="sec dot-bg" id="merit" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Merit</p><p class="sec-eng">Merit</p><h2 class="sec-tit fi">導入メリット</h2></div>
<div class="merit-grid">
${m.map((item, i) => `<div class="merit-card fi">
<div class="merit-ico">${ico[i] || ico[0]}</div>
<h3 class="merit-h3">${esc(item.title)}</h3>
<p class="merit-desc">${esc(item.desc)}</p>
</div>`).join("")}
</div>
</div>
</section>

<!-- DIVIDER: merit → cta2 (wave, gray→dark) -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--dark)"/><path d="M0,0 C300,55 600,70 800,40 C1000,10 1150,45 1200,25 L1200,0 L0,0 Z" fill="var(--bg2)"/></svg></div>

<!-- MID CTA 2 -->
<section class="offer">
<div class="inner">
<p class="offer-tit">${esc(c.cta_text)}</p>
<p class="offer-sub">${esc(c.cta_sub || "まずはお気軽にご相談ください")}</p>
<a href="#contact" class="fv-cta">${esc(c.cta_text)} <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a>
</div>
</section>

<!-- DIVIDER: cta2 → comparison (wave, dark→white) -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--bg)"/><path d="M0,0 C250,60 550,25 750,55 C950,72 1100,30 1200,45 L1200,0 L0,0 Z" fill="var(--dark)"/></svg></div>

<!-- COMPARISON -->
${cmp.length > 0 ? `<section class="sec">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Compare</p><p class="sec-eng">Comparison</p><h2 class="sec-tit fi">他社との違い</h2></div>
<div class="cmp-grid fi">
<div class="cmp-card cmp-us">
<p class="cmp-title">${esc(d.company_name)}</p>
${cmp.map(r => `<div class="cmp-row"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c)" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg><span><strong>${esc(r.feature)}</strong>: ${esc(r.us)}</span></div>`).join("")}
</div>
<div class="cmp-card" style="background:var(--bg2);border-color:var(--bg2)">
<p class="cmp-title" style="color:var(--t3)">一般的な企業</p>
${cmp.map(r => `<div class="cmp-row"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg><span><strong>${esc(r.feature)}</strong>: ${esc(r.other)}</span></div>`).join("")}
</div>
</div>
</div>
</section>` : ""}

<!-- FLOW -->
<section class="sec" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Flow</p><p class="sec-eng">Flow</p><h2 class="sec-tit fi">ご利用の流れ</h2></div>
<div class="flow-list fi" style="max-width:640px;margin:0 auto">
${f.map((item, i) => `<div class="flow-item">
<div class="flow-num">${i + 1}</div>
<div class="flow-body"><h3 class="flow-h3">${esc(item.title)}</h3><p class="flow-desc">${esc(item.desc)}</p></div>
</div>`).join("")}
</div>
</div>
</section>

<!-- FAQ -->
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
<div class="sec-hd"><p class="sec-eng">Company</p><h2 class="sec-tit fi">会社概要</h2></div>
<div class="company-box fi">
<div class="company-logo">${esc(d.company_name.charAt(0))}</div>
<div class="company-info"><strong>${esc(d.company_name)}</strong><p>${esc(c.company_profile)}</p></div>
</div>
</div>
</section>` : ""}

<!-- DIVIDER: → final cta (wave, gray→dark) -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--dark)"/><path d="M0,0 C200,60 500,72 700,45 C900,18 1100,50 1200,30 L1200,0 L0,0 Z" fill="var(--bg2)"/></svg></div>

<!-- CTA -->
<section class="cta-sec" id="contact">
<div class="cta-tit">${esc(c.cta_text)}</div>
<div class="cta-sub">${esc(c.cta_sub)}</div>
${c.urgency_text ? `<div class="cta-urgency"><svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${esc(c.urgency_text)}</div><br>` : ""}
<a href="#contact" class="cta-btn">${esc(c.cta_text)} <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg></a>
<div class="cta-micro"><span><svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>無料</span><span><svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>30秒で完了</span><span><svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>営業電話なし</span></div>
<p class="cta-g">${esc(c.guarantee_text || "無料相談・しつこい営業は一切ありません")}</p>
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
