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
import { SCROLL_ANIM, SEC_HEADER, WAVE_DIVIDER, DOT_BG, CARD_BORDERED, CARD_STAT, BTN_PRIMARY, MICRO_COPY, PROBLEM_CARD, STRENGTH_CARD, SERVICE_CARD, TESTIMONIAL_CARD, COMPARISON, CARD_GRID, STATS_GRID, FLOW, FAQ, CORPORATE_THEME } from "./templates/lp-components";

// ============================================================
// 型定義
// ============================================================

type DeliverableType = "lp" | "ad_creative" | "flyer" | "hearing_form" | "line_design" | "minutes" | "profile" | "system_proposal" | "proposal";

interface FlatData {
  company_name: string;
  service_name: string;
  industry: string;
  target_customer: string;
  strengths: string[];
  pain_points: string[];
  price_range: string;
  current_marketing: string;
  key_persons: string[];
}

interface LpContent {
  // Person
  person_name: string;
  person_title: string;
  // Hero
  hero_headline: string;
  hero_sub: string;
  hero_features: string[];
  badge_text: string;
  // Problems
  problems: { title: string; desc: string }[];
  // Solution
  solution_title: string;
  solution_text: string;
  strengths: { title: string; desc: string }[];
  // Services
  services: { title: string; desc: string }[];
  // Reasons (選ばれる理由)
  reasons: { title: string; desc: string }[];
  // Use Cases (活用シーン)
  use_cases: { title: string; desc: string; icon_keyword: string }[];
  // Stats
  stats: { number: string; label: string }[];
  // Cases (real data from transcript only)
  cases: { category: string; detail: string; result: string }[];
  // Comparison
  comparison: { feature: string; us: string; other: string }[];
  // Flow
  flow: { title: string; desc: string }[];
  faq: { q: string; a: string }[];
  // CTA
  cta_text: string;
  cta_sub: string;
  // Company
  company_profile: string;
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
const VALID_TYPES = new Set<string>(["lp", "ad_creative", "flyer", "hearing_form", "line_design", "minutes", "profile", "system_proposal", "proposal"]);

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
    key_persons: getArr("key_persons"),
  };
}

// ============================================================
// Claude API呼び出し
// ============================================================

async function callClaudeJson<T>(system: string, user: string, apiKey: string, maxTokens = 4000, model = CLAUDE_MODEL): Promise<T> {
  const client = new Anthropic({ apiKey });

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.log(`[generate] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      return await callClaudeJsonOnce<T>(client, system, user, maxTokens, model);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      // リトライ対象: ネットワーク系・レート制限・サーバーエラー
      const isRetryable = msg.includes('overloaded') || msg.includes('rate_limit') ||
        msg.includes('529') || msg.includes('500') || msg.includes('502') ||
        msg.includes('503') || msg.includes('timeout') || msg.includes('ECONNRESET') ||
        msg.includes('fetch failed');
      if (!isRetryable) throw lastError;
      console.warn(`[generate] Retryable error (attempt ${attempt + 1}): ${msg}`);
    }
  }
  throw lastError ?? new Error('Claude API呼び出しに失敗しました');
}

async function callClaudeJsonOnce<T>(client: Anthropic, system: string, user: string, maxTokens: number, model: string): Promise<T> {
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

const TRANSCRIPT_MAX_CHARS = 8000; // Haiku入力は高速。重要情報が後半にあるケース対策

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

  return `【トランスクリプト（複数企業の発言が混在。話者ラベルで企業を区別せよ）】
${transcript || "（なし）"}

【対象企業（このページの主役。この企業の情報のみ使用せよ）】
企業名:${d.company_name}
サービス:${d.service_name}
業種:${d.industry}
ターゲット:${d.target_customer}
強み:${d.strengths.join("/")}
課題:${d.pain_points.join("/")}
${d.key_persons.length > 0 ? `登場人物:${d.key_persons.join("/")}` : ""}
${extra}
※上記は抽出済みデータ。他社の社内指標が混入している可能性あり。
※協業サービスの記載はOKだが、他社の社内指標（社員数、ソースコード数、育成速度等）を対象企業の実績として書くな。`;
}

// ============================================================
// LP Step 1: Draft (設計+コピー生成)
// ============================================================

const LP_DRAFT_PROMPT = `商談トランスクリプトから「課題解決型ページ」用コンテンツをJSON生成。

【最重要ルール】
- 【対象企業】に記載の企業の、商談に実際に参加し発言している担当者が対象
- 話者ラベルを確認せよ。名前のみ言及された人物（代表者等）は対象外
- 数字はトランスクリプトに含まれるものだけ使え。捏造禁止
- 形容詞禁止。数字で語れ
- ページの目的:「この人/会社に相談すれば課題が解決できる」と思わせること

【情報帰属ルール（厳守）】
- 商談には複数の企業/人が参加している。話者ラベルで「誰が言った情報か」を必ず確認
- 協業・連携で提供するサービスは対象企業のサービスとして記載OK（例:「パートナーと連携しシステム開発も対応」）
- ただし他社の社内指標（社員育成速度、社内ソースコード数等）を対象企業の実績として書くのは禁止
- stats/strengthsに使う数字は対象企業自身の実績のみ（採択率、対応件数、顧客満足度など）
- 例: A社のページで「B社と連携しシステム開発も対応」→OK。「ソースコード300個の資産」→NG（B社の資産）

出力JSON（全フィールド必須）:
{
  "person_name": "実際に発言している担当者名（話者ラベルから特定）",
  "person_title": "肩書き（発言内容から推定）",
  "hero_headline": "30字以内。ターゲットの課題を問いかけ形式で",
  "hero_sub": "50字以内。この会社/人がどう解決するか",
  "hero_features": ["実績数字12字×3"],
  "badge_text": "12字以内。専門分野",
  "problems": [{"title":"課題15字","desc":"ターゲットの具体的困りごと50字"}],
  "solution_title": "解決提案タイトル25字",
  "solution_text": "解決アプローチ120字。具体的な方法論",
  "strengths": [{"title":"強み15字","desc":"数字入り解決力50字"}],
  "services": [{"title":"サービス名20字","desc":"内容+対象+成果80字"}],
  "reasons": [{"title":"選ばれる理由15字","desc":"競合ではなく当社を選ぶ具体的理由60字。実績・信頼性・独自性"}],
  "use_cases": [{"title":"活用シーン15字","desc":"具体的な利用場面50字","icon_keyword":"search|chart|users|shield|zap|target"}],
  "stats": [{"number":"92%","label":"採択率"}],
  "cases": [{"category":"案件カテゴリ","detail":"具体内容50字","result":"成果数字20字"}],
  "comparison": [{"feature":"比較項目","us":"自社の方法","other":"一般的な方法"}],
  "flow": [{"title":"ステップ10字","desc":"説明40字"}],
  "faq": [{"q":"質問","a":"回答50字"}],
  "cta_text": "8字以内",
  "cta_sub": "20字以内",
  "company_profile": "会社概要80字"
}
problems3-4,strengths3,services3,reasons3,use_cases3,stats4,comparison4-5,flow4,faq4。
cases:トランスクリプトに具体的事例があれば最大3件（なければ空配列[]）。捏造厳禁。
JSONのみ出力。`;

async function lpDraft(d: FlatData, transcript: string, apiKey: string, rawData?: Record<string, unknown>): Promise<LpContent> {
  return callClaudeJson<LpContent>(LP_DRAFT_PROMPT, bizContext(d, transcript, rawData), apiKey, 4000, LP_MODEL);
}

// ============================================================
// LP Step 2: Evaluate + Revise (品質評価+修正)
// ============================================================

const LP_EVALUATE_PROMPT = `あなたは課題解決型ページ専門のコピーライター。入力JSONを改善してください。

【ページの目的】「この人/会社に相談すれば課題が解決できる」と思わせること。

【品質ルール】
1. person_name: 話者ラベルと一致する実名か検証。名前のみ言及された人物に差し替えるな
2. hero_headline: ターゲットの課題を刺す問いかけ。30字以内
3. problems: ターゲットが共感する具体的課題。抽象禁止。3-4個
4. solution_text: 課題→解決の論理的つながり。120字以内
5. strengths: 各項目に異なる数字。課題に対する具体的解決力。3個
6. services: 各サービスの対象と成果を数字で。3個
7. reasons: 競合ではなく当社を選ぶ理由。実績・信頼性・独自性で差別化。3個
8. use_cases: 具体的な利用場面。ターゲットがイメージしやすい状況。3個
9. comparison: 「一般的な方法」vs「この会社の場合」で差を明確に。4-5行
10. cases: トランスクリプトに言及あればそのまま。なければ空配列[]維持。捏造厳禁
11. stats: 4つ異なるカテゴリ
12. faq: 料金・期間・進め方・対象範囲をカバー。4個
13. cta_text: 8字以内

【情報帰属チェック（厳守）】
- トランスクリプトの話者ラベルを確認し、各情報の出典を検証せよ
- 協業サービスの記載はOK（例:「連携してシステム開発も対応」）
- ただし他社の社内指標（エンジニア育成速度、社内ソースコード数等）を対象企業のstats/strengthsに含めていたら除去
- stats/strengthsの数字は対象企業自身の実績のみ許可

【絶対NG】
- 他社の実績・能力を対象企業に帰属させること
- 架空の実績・数字の捏造
- 「寄り添う」「丁寧」「真心」等の抽象語
- 同じ数字の使い回し
- フィールド省略

入力と同じJSON構造で出力。JSON以外不要。`;

async function lpEvaluate(draft: LpContent, d: FlatData, transcript: string, apiKey: string): Promise<LpContent> {
  // トランスクリプトも渡して情報帰属の検証を可能にする
  const truncated = transcript.length > 4000 ? transcript.slice(0, 4000) + "\n…(省略)" : transcript;
  const input = `【対象企業】${d.company_name}（${d.service_name}）
【対象人物】${draft.person_name}（${draft.person_title}）
【ターゲット】${d.target_customer}
【強み】${d.strengths.join(" / ")}
${d.key_persons.length > 0 ? `【商談参加者】${d.key_persons.join(" / ")}` : ""}

【トランスクリプト（情報帰属の検証用。話者ラベルで誰の発言か確認せよ）】
${truncated}

【評価対象のコピー】
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
  if (i.includes("it") || i.includes("テック") || i.includes("開発") || i.includes("システム")) return { primary: "#7c3aed", gradient: "linear-gradient(135deg,#7c3aed,#a78bfa)", accent: "#a78bfa" };
  if (i.includes("飲食") || i.includes("食")) return { primary: "#ea580c", gradient: "linear-gradient(135deg,#ea580c,#f97316)", accent: "#fb923c" };
  if (i.includes("教育") || i.includes("学")) return { primary: "#0d9488", gradient: "linear-gradient(135deg,#0d9488,#2dd4bf)", accent: "#2dd4bf" };
  if (i.includes("建") || i.includes("不動産")) return { primary: "#b45309", gradient: "linear-gradient(135deg,#92400e,#b45309)", accent: "#d97706" };
  if (i.includes("金融") || i.includes("保険")) return { primary: "#1e40af", gradient: "linear-gradient(135deg,#1e3a8a,#2563eb)", accent: "#3b82f6" };
  return { primary: "#1d4ed8", gradient: "linear-gradient(135deg,#1e3a8a,#2563eb)", accent: "#3b82f6" };
}

// ============================================================
// 人名バリデーション（Whisper誤認識対策）
// ============================================================

/**
 * Whisperの音声認識は人名を頻繁に誤認識する（例: 「荒木明治」→「荒木明治奈良樹」）。
 * key_personsリストと照合し、最も近い名前を返す。
 * 照合できない場合は長さチェックで明らかな異常を除去。
 */
function sanitizePersonName(name: string | undefined, keyPersons: string[]): string {
  if (!name || name.trim().length === 0) return "";

  const trimmed = name.trim();

  // key_personsに完全一致があればそのまま
  if (keyPersons.some(kp => kp.includes(trimmed) || trimmed.includes(kp))) {
    // key_personsの中で、trimmedに含まれる最長の名前を採用
    const match = keyPersons
      .filter(kp => trimmed.includes(kp))
      .sort((a, b) => b.length - a.length)[0];
    if (match) return match;
  }

  // 日本語名は通常2〜6文字（姓1-3 + 名1-3）。7文字以上は誤認識の可能性大
  if (trimmed.length > 6) {
    // key_personsから部分一致を試みる
    for (const kp of keyPersons) {
      if (trimmed.startsWith(kp) || kp.startsWith(trimmed.slice(0, 4))) {
        return kp;
      }
    }
    // 救済不可：最初の4文字を信頼（姓2+名2が最も一般的）
    return trimmed.slice(0, 4);
  }

  return trimmed;
}

// ============================================================
// LP テーマ自動選択
// ============================================================

type LpTheme = "dark" | "corporate";

/** 業種・サービス名からコーポレートテーマを自動判定 */
function selectTheme(d: FlatData): LpTheme {
  const industry = d.industry.toLowerCase();
  const service = d.service_name.toLowerCase();
  // BtoB/コーポレート向けはcorporate
  if (/コンサル|法律|会計|金融|保険|不動産|建設|製造|医療|IT|システム|SaaS|saas/.test(industry)) return "corporate";
  // サービス名にBtoB感があるもの
  if (/システム|ツール|プラットフォーム|ソリューション|クラウド|管理/.test(service)) return "corporate";
  return "dark";
}

// ============================================================
// LP Step 3: Build HTML (高品質テンプレート)
// ============================================================

function buildLpHtml(c: LpContent, d: FlatData, images: LpImage[] = [], theme: LpTheme = "dark"): string {
  const prob = c.problems || [];
  const str = c.strengths || [];
  const svc = c.services || [];
  const s = c.stats || [];
  const cmp = c.comparison || [];
  const cas = c.cases || [];
  const reasons = c.reasons || [];
  const useCases = c.use_cases || [];
  const f = c.flow || [];
  const faq = c.faq || [];
  const hf = c.hero_features || [];
  const colors = getDecoColors(d.industry);
  const hasImg = images.length > 0;
  const pName = sanitizePersonName(c.person_name, d.key_persons) || d.company_name;
  const pTitle = c.person_title || d.industry;

  const ico = [
    `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="var(--c)" opacity=".12"/><path d="M14 20l4 4 8-10" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="var(--c)" opacity=".12"/><path d="M20 12v8l5 3" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="var(--c)" opacity=".12"/><path d="M14 26l5-10 5 6 5-8" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ];

  const checkSvg = `<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  const clockSvg = `<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  const shieldSvg = `<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>`;
  const alertSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>`;
  const microHtml = `<p class="micro micro-light"><span>${checkSvg}相談無料</span><span>${shieldSvg}秘密厳守</span><span>${clockSvg}オンライン対応</span></p>`;
  const microDarkHtml = `<p class="micro micro-dark"><span>${checkSvg}相談無料</span><span>${shieldSvg}秘密厳守</span><span>${clockSvg}オンライン対応</span></p>`;
  const cmpCheck = `<svg width="16" height="16" viewBox="0 0 20 20" fill="var(--c)"><path d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"/></svg>`;
  const cmpCross = `<svg width="16" height="16" viewBox="0 0 20 20" fill="#94a3b8"><path d="M6.3 6.3a1 1 0 011.4 0L10 8.6l2.3-2.3a1 1 0 111.4 1.4L11.4 10l2.3 2.3a1 1 0 01-1.4 1.4L10 11.4l-2.3 2.3a1 1 0 01-1.4-1.4L8.6 10 6.3 7.7a1 1 0 010-1.4z"/></svg>`;
  const arrowSvg = `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>`;

  const cRgb = `${parseInt(colors.primary.slice(1,3),16)},${parseInt(colors.primary.slice(3,5),16)},${parseInt(colors.primary.slice(5,7),16)}`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.company_name)} - ${esc(d.service_name)} | ${esc(pName)}</title>
<meta property="og:title" content="${esc(d.company_name)} - ${esc(pName)}">
<meta property="og:description" content="${esc(c.hero_headline)}">
<meta property="og:type" content="website">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--c:${colors.primary};--cg:${colors.gradient};--ca:${colors.accent};--c-rgb:${cRgb};--dark:#0f172a;--t1:#1e293b;--t2:#475569;--t3:#94a3b8;--bg:#fff;--bg2:#f1f5f9;--bd:#e2e8f0;--r:10px}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:'Noto Sans JP','Inter',sans-serif;color:var(--t1);background:var(--bg);line-height:1.8;-webkit-font-smoothing:antialiased}
a{text-decoration:none;color:inherit}
img{max-width:100%;display:block}
.inner{max-width:1100px;margin:0 auto;padding:0 24px}

/* ===== ALL COMPONENTS ===== */
${SCROLL_ANIM}
${SEC_HEADER}
${WAVE_DIVIDER}
.dvd-tall{height:120px}
@media(max-width:750px){.dvd-tall{height:80px}}
${DOT_BG}
${CARD_BORDERED}
${CARD_STAT}
${BTN_PRIMARY}
${MICRO_COPY}
${PROBLEM_CARD}
${STRENGTH_CARD}
${SERVICE_CARD}
${TESTIMONIAL_CARD}
${COMPARISON}
${CARD_GRID}
${STATS_GRID}
${FLOW}
${FAQ}
${theme === "corporate" ? CORPORATE_THEME : ""}

/* ===== HEADER ===== */
.hd{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--bd);height:64px;display:flex;align-items:center}
.hd .inner{display:flex;align-items:center;justify-content:space-between;width:100%}
.hd-logo{font-weight:800;font-size:18px;color:var(--c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:50%}
.hd-nav{display:flex;gap:24px;align-items:center;flex-shrink:0}
.hd-nav a{font-size:13px;color:var(--t2);font-weight:500;transition:color .2s;white-space:nowrap}
.hd-nav a:hover{color:var(--c)}
.hd-nav a.btn-accent{color:#fff}

/* ===== HERO ===== */
.fv{position:relative;min-height:100svh;display:flex;align-items:center;overflow:hidden;padding-top:64px;background-size:cover;background-position:center;background-repeat:no-repeat}
.fv-overlay{position:absolute;inset:0;background:linear-gradient(135deg,rgba(15,23,42,.88) 0%,rgba(15,23,42,.72) 50%,rgba(15,23,42,.55) 100%);z-index:0}
.fv .inner{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;padding-top:80px;padding-bottom:120px}
.fv-left{text-align:left}
.fv-right{display:flex;align-items:center;justify-content:center}
.fv-badge{display:inline-block;padding:6px 18px;border:1px solid rgba(255,255,255,.25);border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.15em;color:var(--ca);text-transform:uppercase;margin-bottom:20px}
.fv-name{font-size:clamp(14px,1.6vw,16px);color:var(--ca);font-weight:700;margin-bottom:8px;letter-spacing:.05em}
.fv-headline{font-size:clamp(24px,4vw,42px);font-weight:900;line-height:1.3;color:#fff;margin-bottom:16px}
.fv-sub{font-size:clamp(14px,1.6vw,17px);color:rgba(255,255,255,.75);margin-bottom:28px;line-height:1.8}
.fv-features{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:36px;justify-content:flex-start}
.fv-features span{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:rgba(255,255,255,.12);backdrop-filter:blur(4px);color:#fff;font-size:13px;font-weight:700;letter-spacing:.03em;border-radius:var(--r);border:1px solid rgba(255,255,255,.1)}
.fv-features span::before{content:'';width:5px;height:5px;background:var(--ca);border-radius:50%}
.fv-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,.95);backdrop-filter:blur(10px);z-index:2}
.fv-stat{padding:24px 16px;text-align:center;border-right:1px solid var(--bd)}
.fv-stat:last-child{border-right:none}
.fv-stat-num{font-family:'Inter',sans-serif;font-size:clamp(22px,3.5vw,40px);font-weight:900;background:var(--cg);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.1;white-space:nowrap}
.fv-stat-label{font-size:12px;color:var(--t2);margin-top:4px;letter-spacing:.05em;font-weight:600}

/* ===== HERO DASHBOARD MOCKUP ===== */
@keyframes heroFadeUp{0%{opacity:0;transform:translateY(20px)}100%{opacity:1;transform:translateY(0)}}
@keyframes heroBarGrow{0%{width:0}100%{width:var(--bar-w)}}
@keyframes heroPulse{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes heroFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.hero-dash{width:100%;max-width:420px;background:rgba(255,255,255,.07);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:24px;animation:heroFloat 4s ease-in-out infinite}
.hero-dash-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.hero-dash-title{font-size:13px;font-weight:700;color:rgba(255,255,255,.9);display:flex;align-items:center;gap:8px}
.hero-dash-title::before{content:'';width:8px;height:8px;background:var(--ca);border-radius:50%;animation:heroPulse 2s ease-in-out infinite}
.hero-dash-badge{font-size:10px;padding:3px 10px;background:rgba(255,255,255,.12);border-radius:12px;color:rgba(255,255,255,.6)}
.hero-dash-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
.hero-dash-stat{background:rgba(255,255,255,.06);border-radius:10px;padding:14px 10px;text-align:center;animation:heroFadeUp .6s ease both}
.hero-dash-stat:nth-child(2){animation-delay:.15s}
.hero-dash-stat:nth-child(3){animation-delay:.3s}
.hero-dash-stat-num{font-family:'Inter',sans-serif;font-size:20px;font-weight:900;color:var(--ca);line-height:1}
.hero-dash-stat-label{font-size:10px;color:rgba(255,255,255,.5);margin-top:4px}
.hero-dash-bars{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
.hero-dash-bar-row{display:flex;align-items:center;gap:10px;animation:heroFadeUp .6s ease both}
.hero-dash-bar-row:nth-child(1){animation-delay:.4s}
.hero-dash-bar-row:nth-child(2){animation-delay:.55s}
.hero-dash-bar-row:nth-child(3){animation-delay:.7s}
.hero-dash-bar-label{font-size:10px;color:rgba(255,255,255,.5);width:48px;flex-shrink:0;text-align:right}
.hero-dash-bar-track{flex:1;height:8px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden}
.hero-dash-bar-fill{height:100%;border-radius:4px;background:var(--cg);animation:heroBarGrow 1.2s ease both}
.hero-dash-bar-fill.b1{--bar-w:85%;animation-delay:.6s}
.hero-dash-bar-fill.b2{--bar-w:72%;animation-delay:.75s}
.hero-dash-bar-fill.b3{--bar-w:93%;animation-delay:.9s}
.hero-dash-bar-pct{font-size:10px;color:rgba(255,255,255,.6);width:32px;font-weight:700}
.hero-dash-footer{display:flex;align-items:center;gap:8px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
.hero-dash-footer-dot{width:6px;height:6px;border-radius:50%;background:var(--ca)}
.hero-dash-footer-text{font-size:10px;color:rgba(255,255,255,.45)}

/* ===== LOGO STRIP ===== */
.logo-strip{padding:40px 0;background:var(--bg);border-bottom:1px solid var(--bd)}
.logo-strip-label{text-align:center;font-size:13px;color:var(--t3);font-weight:600;letter-spacing:.1em;margin-bottom:20px}
.logo-strip-list{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:32px 48px;max-width:900px;margin:0 auto;padding:0 24px}
.logo-strip-item{font-family:'Inter','Noto Sans JP',sans-serif;font-size:15px;font-weight:800;color:var(--t3);letter-spacing:.05em;white-space:nowrap;opacity:.55;transition:opacity .3s}
.logo-strip-item:hover{opacity:.85}
@media(max-width:750px){.logo-strip{padding:28px 0}.logo-strip-list{gap:20px 32px}.logo-strip-item{font-size:13px}}
@media(max-width:480px){.logo-strip-list{gap:16px 24px}.logo-strip-item{font-size:12px}}

/* ===== REASONS (選ばれる理由) ===== */
.reason-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1000px;margin:0 auto}
.reason-card{position:relative;overflow:hidden;border-radius:var(--r);background:var(--bg);border:1px solid var(--bd);transition:box-shadow .4s,transform .4s}
.reason-card:hover{box-shadow:0 16px 48px rgba(0,0,0,.08);transform:translateY(-4px)}
.reason-img{width:100%;height:180px;object-fit:cover;display:block}
.reason-body{padding:24px}
.reason-num-badge{position:absolute;top:12px;left:12px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--c);color:#fff;font-family:'Inter',sans-serif;font-weight:900;font-size:14px;border-radius:8px;z-index:1}
.reason-body h4{font-size:16px;font-weight:800;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.reason-body h4 span{font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:var(--c);letter-spacing:.15em;text-transform:uppercase}
.reason-body p{font-size:14px;color:var(--t2);line-height:1.8;margin:0}
@media(max-width:750px){.reason-grid{grid-template-columns:1fr;gap:16px}.reason-img{height:160px}.reason-body{padding:20px}}

/* ===== USE CASES (活用シーン) ===== */
.uc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:960px;margin:0 auto}
.uc-card{padding:28px 24px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);text-align:center;transition:box-shadow .3s,transform .3s}
.uc-card:hover{box-shadow:0 12px 36px rgba(0,0,0,.06);transform:translateY(-3px)}
.uc-ico{width:64px;height:64px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;background:rgba(var(--c-rgb),.08);border-radius:16px}
.uc-ico svg{width:28px;height:28px;color:var(--c)}
.uc-card h4{font-size:15px;font-weight:800;margin-bottom:8px}
.uc-card p{font-size:13px;color:var(--t2);line-height:1.8;margin:0}
@media(max-width:750px){.uc-grid{grid-template-columns:1fr;gap:16px}.uc-card{padding:24px 20px}}

/* ===== PROBLEMS ===== */
.prob-grid{display:flex;flex-direction:column;gap:10px;max-width:680px;margin:0 auto}

/* ===== SOLUTION ===== */
.sol-text{font-size:15px;color:var(--t2);line-height:2;max-width:640px;margin:0 auto 40px;text-align:center}

/* ===== OFFER / CTA ===== */
.offer{padding:56px 0;background:var(--dark);color:#fff;text-align:center;position:relative;overflow:hidden}
.offer::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:400px;background:radial-gradient(circle,rgba(255,255,255,.04),transparent 70%)}
.offer-accent{background:var(--c);padding:72px 0}
.offer-tit{font-size:clamp(18px,3vw,24px);font-weight:800;margin-bottom:8px;position:relative}
.offer-sub{font-size:14px;color:rgba(255,255,255,.55);margin-bottom:20px;position:relative}

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
/* header */
.hd{height:56px}.hd-logo{font-size:15px;max-width:60%}.hd-nav{gap:0}.hd-nav a:not(.btn){display:none}
/* hero */
.fv{min-height:auto;padding-top:56px}.fv .inner{padding-top:48px;padding-bottom:24px;max-width:100%;grid-template-columns:1fr;text-align:center}
.fv-left{text-align:center}
.fv-left .fv-features{justify-content:center}
.fv-left>div:last-child{align-items:center}
.fv-right{margin-top:24px}
.hero-dash{max-width:100%;padding:16px}
.hero-dash-stat-num{font-size:16px}
.hero-dash-bar-label{font-size:9px;width:40px}
.fv-headline{font-size:clamp(20px,5.5vw,28px)}.fv-sub{font-size:14px}.fv-name{font-size:13px}
.fv-badge{font-size:11px;padding:5px 14px}.fv-features{gap:6px;margin-bottom:24px}
.fv-features span{padding:6px 12px;font-size:11px}
/* stats: 2×2 grid, relative position */
.fv-stats{grid-template-columns:repeat(2,1fr);position:relative;bottom:auto}
.fv-stat{padding:16px 12px}.fv-stat-num{font-size:clamp(18px,5vw,26px)}.fv-stat-label{font-size:10px}
/* problems */
.prob p{font-size:13px}.prob span{font-size:12px}.prob{padding:14px 16px;gap:10px}
.prob-ico{width:32px;height:32px}.prob-ico svg{width:16px;height:16px}
/* solution */
.sol-text{font-size:14px}
/* service */
.svc-head{padding:22px 20px 16px}.svc-ico-ring{width:44px;height:44px;border-radius:10px}
.svc-body{padding:16px 20px 22px}.svc-body p{font-size:13px}
/* CTA */
.offer{padding:40px 0}.offer-accent{padding:48px 0}.offer-tit{font-size:clamp(16px,4.5vw,20px)}
.offer-sub{font-size:13px;margin-bottom:16px}
/* micro copy: stack on mobile */
.micro{flex-wrap:wrap;gap:8px 14px}
/* comparison */
.cmp-card{padding:22px}
/* testimonial */
.tm-card{padding:24px}.tm-text{font-size:14px}
/* company */
.company-box{flex-direction:column;text-align:left;padding:24px;gap:16px}
.company-logo{width:52px;height:52px;font-size:20px}.company-info strong{font-size:15px}.company-info p{font-size:13px}
/* FAQ */
.faq-q{padding:14px 16px;font-size:14px}.faq-a{padding:0 16px 14px;font-size:14px}
/* final CTA */
.cta-sec{padding:64px 20px}.cta-tit{font-size:clamp(18px,5vw,24px)}
/* footer + mobile CTA bar */
.ft{padding:20px 16px;font-size:11px}.m-cta{display:block}body{padding-bottom:72px}
/* buttons */
.btn-lg{padding:14px 32px;font-size:14px}
/* flow */
.flow-item{gap:14px;padding:14px 0}.flow-num{width:44px;height:44px;font-size:16px}
.flow-list::before{left:22px}.flow-h3{font-size:14px}.flow-desc{font-size:13px}
/* wave dividers */
.dvd-tall{height:72px}
}

/* ============================== */
/* RESPONSIVE 480px               */
/* ============================== */
@media(max-width:480px){
.inner{padding:0 16px}.hd-logo{font-size:14px}
/* hero */
.fv-headline{font-size:20px}.fv-features span{padding:5px 8px;font-size:10px}
.hero-dash{padding:14px}.hero-dash-stats{gap:8px}.hero-dash-stat{padding:10px 6px}
.hero-dash-stat-num{font-size:14px}.hero-dash-bar-pct{font-size:9px}
/* stats: keep 2×2 but tighter */
.fv-stats{grid-template-columns:1fr 1fr}.fv-stat{padding:12px 8px}.fv-stat-num{font-size:18px}
.fv-stat-label{font-size:9px}
/* section headers */
.sec-bg-txt{font-size:36px;margin-bottom:-12px}
/* buttons */
.btn-lg{padding:12px 24px;font-size:13px}.btn-md{padding:10px 20px;font-size:12px}
/* CTA */
.offer-tit{font-size:16px}.offer-accent{padding:40px 0}
/* flow */
.flow-num{width:36px;height:36px;font-size:14px}.flow-list::before{left:18px}
/* final CTA */
.cta-tit{font-size:18px}.m-cta a{padding:12px;font-size:13px}
/* stats grid (separate section) */
.stats-grid .stat-num{font-size:clamp(22px,6vw,32px)}
/* wave */
.dvd-tall{height:56px}
/* FAQ tighter */
.faq-q{padding:12px 14px;font-size:13px}.faq-a{font-size:13px}
/* testimonial */
.tm-card{padding:20px}.tm-text{font-size:13px}.tm-result{font-size:11px}
/* comparison */
.cmp-card{padding:18px}.cmp-title{font-size:14px}.cmp-row{font-size:13px}
/* service */
.svc-card h3{font-size:15px}.svc-body p{font-size:12px}
}
</style>
</head><body>

<!-- HEADER -->
<header class="hd"><div class="inner">
<p class="hd-logo">${esc(d.company_name)}</p>
<nav class="hd-nav">
<a href="#solution">Solution</a>
<a href="#service">Service</a>
<a href="#contact" class="btn btn-md btn-accent">${esc(c.cta_text)}</a>
</nav>
</div></header>

<!-- HERO: 課題提起 + 信頼の人物 -->
<section class="fv"${hasImg && images[0] ? ` style="background-image:url('${esc(images[0].url.replace(/w=\d+/, "w=1600").replace(/h=\d+/, "h=1000"))}')"` : ""}>
<div class="fv-overlay"></div>
<div class="inner">
<div class="fv-left">
<div class="fv-badge">${esc(c.badge_text || d.industry)}</div>
<p class="fv-name">${esc(pName)} / ${esc(pTitle)} / ${esc(d.company_name)}</p>
<h1 class="fv-headline">${esc(c.hero_headline)}</h1>
<p class="fv-sub">${esc(c.hero_sub)}</p>
<div class="fv-features">
${hf.map(ft => `<span>${esc(ft)}</span>`).join("")}
</div>
<div style="display:flex;flex-direction:column;align-items:flex-start;gap:10px">
<a href="#contact" class="btn btn-lg btn-white">${esc(c.cta_text)} ${arrowSvg}</a>
${microHtml}
</div>
</div>
<div class="fv-right">
<div class="hero-dash">
<div class="hero-dash-header">
<span class="hero-dash-title">Dashboard</span>
<span class="hero-dash-badge">Live</span>
</div>
<div class="hero-dash-stats">
<div class="hero-dash-stat"><div class="hero-dash-stat-num">${s[0] ? esc(s[0].number) : "98%"}</div><div class="hero-dash-stat-label">${s[0] ? esc(s[0].label) : "満足度"}</div></div>
<div class="hero-dash-stat"><div class="hero-dash-stat-num">${s[1] ? esc(s[1].number) : "3.2x"}</div><div class="hero-dash-stat-label">${s[1] ? esc(s[1].label) : "効率化"}</div></div>
<div class="hero-dash-stat"><div class="hero-dash-stat-num">${s[2] ? esc(s[2].number) : "500+"}</div><div class="hero-dash-stat-label">${s[2] ? esc(s[2].label) : "導入社数"}</div></div>
</div>
<div class="hero-dash-bars">
<div class="hero-dash-bar-row"><span class="hero-dash-bar-label">効率</span><div class="hero-dash-bar-track"><div class="hero-dash-bar-fill b1"></div></div><span class="hero-dash-bar-pct">85%</span></div>
<div class="hero-dash-bar-row"><span class="hero-dash-bar-label">削減</span><div class="hero-dash-bar-track"><div class="hero-dash-bar-fill b2"></div></div><span class="hero-dash-bar-pct">72%</span></div>
<div class="hero-dash-bar-row"><span class="hero-dash-bar-label">満足度</span><div class="hero-dash-bar-track"><div class="hero-dash-bar-fill b3"></div></div><span class="hero-dash-bar-pct">93%</span></div>
</div>
<div class="hero-dash-footer"><span class="hero-dash-footer-dot"></span><span class="hero-dash-footer-text">リアルタイム更新中</span></div>
</div>
</div>
</div>
<div class="fv-stats">
${s.map(st => `<div class="fv-stat"><div class="fv-stat-num">${esc(st.number)}</div><div class="fv-stat-label">${esc(st.label)}</div></div>`).join("")}
</div>
</section>

<!-- LOGO STRIP: 導入企業 -->
<div class="logo-strip">
<p class="logo-strip-label">多くの企業様にご導入いただいています</p>
<div class="logo-strip-list">
<span class="logo-strip-item">NovaCross</span>
<span class="logo-strip-item">ZenithFlow</span>
<span class="logo-strip-item">CrestVision</span>
<span class="logo-strip-item">SolarisNeo</span>
<span class="logo-strip-item">TerraGrow</span>
<span class="logo-strip-item">Verdics</span>
</div>
</div>

<!-- PROBLEMS: ターゲットの課題 (PROBLEM_CARD) -->
<section class="sec dot-bg" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Problems</p><p class="sec-eng">Problems</p><h2 class="sec-tit fi">こんな課題はありませんか？</h2></div>
<div class="prob-grid">
${prob.map(item => `<div class="prob fi">
<div class="prob-ico">${alertSvg}</div>
<p>${esc(item.title)}<br/><span>${esc(item.desc)}</span></p>
</div>`).join("")}
</div>
</div>
</section>

<!-- WAVE: problems(bg2) → solution(white) -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--bg)"/><path d="M0,0 C300,55 600,70 800,40 C1000,10 1150,45 1200,25 L1200,0 L0,0 Z" fill="var(--bg2)"/></svg></div>

<!-- SOLUTION: 解決アプローチ (STRENGTH_CARD premium) -->
<section class="sec" id="solution" data-img="about">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Solution</p><p class="sec-eng">Solution</p><h2 class="sec-tit fi">${esc(c.solution_title || `${d.company_name}が解決します`)}</h2></div>
<p class="sol-text fi">${esc(c.solution_text || "")}</p>
<div class="str-grid">
${str.map((item, i) => `<div class="str fi" data-img="reason${i + 1}">
<span class="str-num">${String(i + 1).padStart(2, "0")}</span>
<div class="str-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
<h4>${esc(item.title)}</h4>
<p>${esc(item.desc)}</p>
</div>`).join("")}
</div>
</div>
</section>

${theme === "corporate" ? `<!-- MID-CTA: Solution後 -->
<div class="mid-cta">
<a href="#contact" class="trial">${esc(c.cta_text)}</a>
<a href="#contact" class="doc">資料ダウンロード</a>
</div>` : ""}

<!-- SERVICES: 提供サービス (SERVICE_CARD premium) -->
<section class="sec dot-bg" id="service" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Service</p><p class="sec-eng">Service</p><h2 class="sec-tit fi">提供サービス</h2></div>
<div class="svc-grid">
${svc.map((item, i) => `<div class="svc-card fi">
<div class="svc-head">
<div class="svc-ico-ring">${ico[i] || ico[0]}</div>
<h3>${esc(item.title)}</h3>
</div>
<div class="svc-body">
<p>${esc(item.desc)}</p>
</div>
</div>`).join("")}
</div>
</div>
</section>

${theme === "corporate" ? `<!-- MID-CTA: Service後 -->
<div class="mid-cta">
<a href="#contact" class="trial">${esc(c.cta_text)}</a>
<a href="#contact" class="doc">資料ダウンロード</a>
</div>` : ""}

<!-- REASONS: 選ばれる理由 -->
${reasons.length > 0 ? `<section class="sec">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Reason</p><p class="sec-eng">Why Choose Us</p><h2 class="sec-tit fi">${esc(d.company_name)}が選ばれる理由</h2></div>
<div class="reason-grid">
${reasons.map((item, i) => {
  const reasonImg = images[i + 1] ? images[i + 1].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["business"][i] || PHOTO_LIBRARY["business"][0], 600, 400);
  return `<div class="reason-card fi">
<div class="reason-num-badge">${i + 1}</div>
<img class="reason-img" src="${esc(reasonImg)}" alt="${esc(item.title)}" loading="lazy">
<div class="reason-body">
<h4><span>REASON</span>${esc(item.title)}</h4>
<p>${esc(item.desc)}</p>
</div>
</div>`;
}).join("")}
</div>
</div>
</section>` : ""}

<!-- USE CASES: 活用シーン -->
${useCases.length > 0 ? `<section class="sec" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">UseCase</p><p class="sec-eng">Use Cases</p><h2 class="sec-tit fi">活用シーン</h2></div>
<div class="uc-grid">
${useCases.map(item => {
  const ucIcoMap: Record<string, string> = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  };
  const ucIcon = ucIcoMap[item.icon_keyword] || ucIcoMap["zap"];
  return `<div class="uc-card fi">
<div class="uc-ico">${ucIcon}</div>
<h4>${esc(item.title)}</h4>
<p>${esc(item.desc)}</p>
</div>`;
}).join("")}
</div>
</div>
</section>` : ""}

<!-- WAVE: → CTA1(accent) — concave dip -->
<div class="dvd dvd-tall"><svg viewBox="0 0 1200 120" preserveAspectRatio="none"><rect width="1200" height="120" fill="var(--c)"/><path d="M0,0 Q600,140 1200,0 L1200,0 L0,0 Z" fill="${useCases.length > 0 ? 'var(--bg2)' : 'var(--bg)'}"/></svg></div>

<!-- CTA (accent) -->
<section class="offer offer-accent">
<div class="inner" style="position:relative;z-index:1">
<p class="offer-tit">${esc(c.cta_sub || "まずはお気軽にご相談ください")}</p>
<p class="offer-sub" style="color:rgba(255,255,255,.7)">${esc(pName)}が直接対応します</p>
<a href="#contact" class="btn btn-lg btn-white">${esc(c.cta_text)} ${arrowSvg}</a>
${microHtml}
</div>
</section>

<!-- CTA1(accent) → comparison(white): straight line -->
<div style="height:0;border-top:1px solid var(--bd)"></div>

<!-- COMPARISON (COMPARISON component) -->
${cmp.length > 0 ? `<section class="sec">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Compare</p><p class="sec-eng">Comparison</p><h2 class="sec-tit fi">一般的な方法との比較</h2></div>
<div class="cmp-grid">
<div class="cmp-card cmp-muted">
<div class="cmp-title">一般的な方法</div>
${cmp.map(row => `<div class="cmp-row">${cmpCross} <span>${esc(row.feature)}: ${esc(row.other)}</span></div>`).join("")}
</div>
<div class="cmp-card cmp-us" style="position:relative">
<div class="cmp-title">${esc(d.company_name)}の場合</div>
${cmp.map(row => `<div class="cmp-row">${cmpCheck} <span><strong>${esc(row.feature)}</strong>: ${esc(row.us)}</span></div>`).join("")}
</div>
</div>
</div>
</section>` : ""}

<!-- CASES: 実績事例 (TESTIMONIAL_CARD repurposed) -->
${cas.length > 0 ? `<section class="sec" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Results</p><p class="sec-eng">Case Results</p><h2 class="sec-tit fi">実績事例</h2></div>
<div class="tm-grid">
${cas.map(item => `<div class="tm-card fi">
<div class="tm-result">${esc(item.result)}</div>
<p class="tm-text">${esc(item.detail)}</p>
<div class="tm-author">
<div class="tm-avatar" style="font-size:12px">${esc(item.category.slice(0,2))}</div>
<div><div class="tm-name">${esc(item.category)}</div></div>
</div>
</div>`).join("")}
</div>
</div>
</section>` : ""}

<!-- STATS: 実績数字 (CARD_STAT + STATS_GRID) -->
<section class="sec${cas.length > 0 ? "" : " dot-bg"}"${cas.length > 0 ? "" : ` style="background:var(--bg2)"`}>
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Results</p><p class="sec-eng">Track Record</p><h2 class="sec-tit fi">数字で見る実績</h2></div>
<div class="stats-grid" style="margin-top:0">
${s.map(st => `<div class="card stat-card fi">
<div class="stat-num">${esc(st.number)}</div>
<div class="stat-label">${esc(st.label)}</div>
</div>`).join("")}
</div>
${microDarkHtml}
</div>
</section>

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

<!-- COMPANY + FAQ -->
<section class="sec">
<div class="inner">
${c.company_profile ? `<div class="company-box fi" style="margin-bottom:64px">
<div class="company-logo">${esc(d.company_name.charAt(0))}</div>
<div class="company-info"><strong>${esc(d.company_name)}</strong><p>${esc(c.company_profile)}</p></div>
</div>` : ""}
${faq.length > 0 ? `<div style="max-width:720px;margin:0 auto">
<div class="sec-hd"><p class="sec-bg-txt">FAQ</p><p class="sec-eng">FAQ</p><h2 class="sec-tit fi">よくある質問</h2></div>
<div class="faq-list fi">
${faq.map(item => `<details class="faq-item"><summary class="faq-q">${esc(item.q)}</summary><div class="faq-a">${esc(item.a)}</div></details>`).join("")}
</div>
</div>` : ""}
</div>
</section>

<!-- WAVE: → final CTA (simple valley+peak) -->
<div class="dvd"><svg viewBox="0 0 1200 72" preserveAspectRatio="none"><rect width="1200" height="72" fill="var(--dark)"/><path d="M0,0 C300,60 600,60 900,20 C1050,0 1150,25 1200,15 L1200,0 L0,0 Z" fill="var(--bg)"/></svg></div>

<!-- FINAL CTA -->
<section class="cta-sec" id="contact">
<div class="cta-tit" style="position:relative">${esc(pName)}に相談する</div>
<div class="cta-sub">${esc(c.cta_sub || "")}</div>
<a href="#contact" class="btn btn-lg btn-white" style="position:relative">${esc(c.cta_text)} ${arrowSvg}</a>
${microHtml}
</section>

<!-- FOOTER -->
<footer class="ft">&copy; ${esc(d.company_name)} All Rights Reserved.</footer>

<!-- MOBILE CTA -->
<div class="m-cta"><a href="#contact">${esc(c.cta_text)}</a><p class="m-cta-sub">${esc(pName)} / 相談無料 / オンライン対応</p></div>

<!-- SCROLL ANIMATION -->
<script>
document.addEventListener('DOMContentLoaded',function(){var o=new IntersectionObserver(function(e){e.forEach(function(en){if(en.isIntersecting){en.target.classList.add('vis');o.unobserve(en.target)}})},{threshold:.12,rootMargin:'0px 0px -40px 0px'});document.querySelectorAll('.fi').forEach(function(el){o.observe(el)})});
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
  system_proposal: `システム開発提案書をJSON生成:
{"headline":"提案タイトル","sub":"提案概要（1行）","sections":[{"title":"セクション名","content":"内容"}]}
以下のセクションを含めること:
1. 現状の課題整理（商談で言及された業務課題・非効率を具体的に）
2. 提案システム概要（課題を解決するシステムの全体像）
3. 主要機能一覧（機能名と説明を箇条書き形式で）
4. 技術スタック（推奨する技術構成）
5. 開発スケジュール（フェーズ分けと期間目安）
6. 概算見積（規模感に基づく概算。補助金活用時の実質負担も記載）
7. 期待される効果（定量的に。工数削減率、コスト削減額など）
8. 補助金活用プラン（対象となる補助金名と申請の流れ）
商談中の具体的な数字・要望を最大限反映すること。JSONのみ出力。`,
  proposal: `商談後に送る提案資料をJSON生成:
{"headline":"提案タイトル（相手企業名+提案内容）","sub":"提案の一言サマリー","sections":[{"title":"セクション名","content":"内容"}]}
以下のセクションを必ず含めること:
1. ご挨拶・本日のお打ち合わせ御礼（商談の要点を簡潔に振り返り、感謝を伝える）
2. 貴社の現状と課題の整理（商談で聞いた相手の課題・悩みを具体的に列挙。「○○とのこと」形式で相手の言葉を引用）
3. ご提案内容（課題に対する解決策を具体的に。サービス名・手法・対象範囲を明記）
4. 弊社の強み・実績（数字付きの実績。採択率、対応件数、事例など商談で言及したもの）
5. ご提供プラン・料金（価格帯、プラン構成、支払い条件。商談で話した内容ベース。不明なら「別途お見積り」）
6. 導入スケジュール（フェーズ分け。初回相談→○○→○○→完了の流れ）
7. 期待される効果（定量的に。コスト削減額、売上向上率、業務効率化など）
8. 次のステップ（具体的なアクション。「○日までにご返答」「次回お打ち合わせ日程」など）
9. 会社概要（簡潔に。社名、代表、所在地、設立、主要事業）

【重要ルール】
- 商談中の具体的な数字・固有名詞・エピソードを最大限反映
- 相手企業の課題は相手の言葉で書く（「御社では○○が課題とのこと」）
- 自社の実績は商談で実際に言及したものだけ使う。捏造厳禁
- フォーマルだが堅すぎないトーン。「です/ます」調
- 各セクションは箇条書きを活用し読みやすく
JSONのみ出力。`,
};

const GENERIC_TITLES: Record<string, string> = {
  flyer: "チラシ",
  hearing_form: "ヒアリングフォーム",
  line_design: "LINE導線設計書",
  profile: "プロフィールシート",
  system_proposal: "システム開発提案書",
  proposal: "提案資料",
};

async function generateGeneric(type: string, d: FlatData, transcript: string, apiKey: string): Promise<string> {
  const content = await callClaudeJson<GenericContent>(
    GENERIC_PROMPTS[type] || GENERIC_PROMPTS["profile"]!,
    bizContext(d, transcript),
    apiKey,
  );

  const title = GENERIC_TITLES[type] || type;

  // 制作物タイプ別のアクセントカラー
  const accentColors: Record<string, string> = {
    flyer: '#e74c3c',
    hearing_form: '#27ae60',
    line_design: '#06c755',
    profile: '#3b82f6',
    system_proposal: '#8b5cf6',
    proposal: '#2563eb',
    minutes: '#6b7280',
    ad_creative: '#f59e0b',
  };
  const accent = accentColors[type] || '#3b82f6';

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - ${esc(d.service_name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--ac:${accent};--ac-rgb:${hexToRgb(accent)}}
body{font-family:'Noto Sans JP',sans-serif;background:#fafafa;color:#1a1a1a;min-height:100vh}
@media print{.no-print{display:none}body{background:#fff}}

/* ヘッダー */
.doc-header{background:linear-gradient(135deg,var(--ac),color-mix(in srgb,var(--ac) 70%,#000));color:#fff;padding:48px 24px 40px;text-align:center}
.doc-header .company{font-size:13px;opacity:.8;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px}
.doc-header h1{font-size:clamp(22px,5vw,32px);font-weight:900;line-height:1.3;margin-bottom:8px}
.doc-header .sub{font-size:15px;opacity:.85;max-width:600px;margin:0 auto}

/* コンテナ */
.doc-body{max-width:760px;margin:-24px auto 0;padding:0 16px 48px;position:relative;z-index:1}

/* セクションカード */
.sec-card{background:#fff;border-radius:12px;padding:28px 24px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);border:1px solid #f0f0f0;transition:box-shadow .2s}
.sec-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.08)}
.sec-head{display:flex;align-items:flex-start;gap:14px;margin-bottom:16px}
.sec-num{width:36px;height:36px;background:linear-gradient(135deg,var(--ac),color-mix(in srgb,var(--ac) 80%,#000));color:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;flex-shrink:0}
.sec-head h2{font-size:17px;font-weight:700;line-height:1.4;padding-top:6px}
.sec-content{color:#4a4a4a;font-size:14.5px;line-height:1.85;white-space:pre-line;padding-left:50px}

/* フッター */
.doc-footer{text-align:center;padding:24px 16px 32px;color:#aaa;font-size:12px;border-top:1px solid #eee;max-width:760px;margin:0 auto}

/* モバイル */
@media(max-width:600px){
  .doc-header{padding:32px 16px 28px}
  .sec-card{padding:20px 16px;border-radius:8px}
  .sec-content{padding-left:0;margin-top:8px}
  .sec-head{gap:10px}
  .sec-num{width:30px;height:30px;font-size:13px;border-radius:8px}
  .sec-head h2{font-size:15px}
}
</style>
</head><body>
<header class="doc-header">
<p class="company">${esc(d.company_name)}</p>
<h1>${esc(content.headline)}</h1>
<p class="sub">${esc(content.sub)}</p>
</header>
<main class="doc-body">
${(content.sections || []).map((s, i) => `<article class="sec-card">
<div class="sec-head"><span class="sec-num">${i + 1}</span><h2>${esc(s.title)}</h2></div>
<div class="sec-content">${esc(s.content)}</div>
</article>`).join("\n")}
</main>
<footer class="doc-footer">${esc(d.company_name)}</footer>
</body></html>`;
}

// ============================================================
// HTMLエスケープ
// ============================================================

function esc(s: string): string {
  return (s ?? '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

// ============================================================
// メインハンドラー
// ============================================================

// ============================================================
// レート制限 (インメモリ — Netlify Function単位)
// ============================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1分
const RATE_LIMIT_MAX = 20; // 1分あたり最大20リクエスト/セッション

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// 古いエントリをクリーンアップ（メモリリーク防止）
function cleanupRateLimitMap(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "POST only" }), { status: 405, headers: { "Content-Type": "application/json", ...CORS } });
  }

  // 定期クリーンアップ
  if (rateLimitMap.size > 100) cleanupRateLimitMap();

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

    // レート制限チェック
    if (!checkRateLimit(sessionId)) {
      return new Response(JSON.stringify({ success: false, error: "リクエスト頻度が高すぎます。しばらく待ってから再試行してください。" }), { status: 429, headers: { "Content-Type": "application/json", ...CORS } });
    }

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
        const revised = await lpEvaluate(draftContent, data, transcript, apiKey);
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

        const theme = selectTheme(data);
        console.log(`[generate] theme: ${theme}`);
        const html = buildLpHtml(draftContent as LpContent, data, images, theme);

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
      const lpTheme = selectTheme(data);
      html = buildLpHtml(draft, data, images, lpTheme);
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
