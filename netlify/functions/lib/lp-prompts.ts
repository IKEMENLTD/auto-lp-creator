/**
 * LP生成 - プロンプト定義・ビジネスコンテキスト
 */

import type { FlatData } from "./lp-types";

// ============================================================
// ビジネスコンテキスト
// ============================================================

const TRANSCRIPT_MAX_CHARS = 8000;

export function truncateTranscript(transcript: string): string {
  if (!transcript || transcript.length <= TRANSCRIPT_MAX_CHARS) return transcript;
  return transcript.slice(0, TRANSCRIPT_MAX_CHARS);
}

export function bizContext(d: FlatData, transcript: string, rawData?: Record<string, unknown>): string {
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

export const LP_DRAFT_PROMPT = `商談トランスクリプトから「課題解決型ページ」用コンテンツをJSON生成。

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
  "dashboard_metrics": [{"label":"業種に合った指標名4字","pct":85},{"label":"指標名4字","pct":72},{"label":"指標名4字","pct":93}],
  "columns": [{"title":"ターゲットが検索しそうな疑問形タイトル30字","desc":"記事概要50字"}],
  "cases": [{"category":"案件カテゴリ","detail":"具体内容50字","result":"成果数字20字"}],
  "comparison": [{"feature":"比較項目","us":"自社の方法","other":"一般的な方法"}],
  "flow": [{"title":"ステップ10字","desc":"説明40字"}],
  "faq": [{"q":"質問","a":"回答50字"}],
  "cta_text": "8字以内",
  "cta_sub": "20字以内",
  "company_profile": "会社概要80字"
}
problems3-4,strengths3,services3,reasons3,use_cases3,stats4,dashboard_metrics3,columns2,comparison4-5,flow4,faq4。
cases:トランスクリプトに具体的事例があれば最大3件（なければ空配列[]）。捏造厳禁。
JSONのみ出力。`;

// ============================================================
// LP Step 2: Evaluate + Revise (品質評価+修正)
// ============================================================

export const LP_EVALUATE_PROMPT = `あなたは課題解決型ページ専門のコピーライター。入力JSONを改善してください。

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
12. dashboard_metrics: 業種に合った指標名（4字以内）とパーセンテージ（50-99）。3個。statsと重複しない
13. columns: ターゲットが検索しそうな「〜とは？」「〜の方法」形式のタイトル。業種に特化した実用的な内容。2個
14. faq: 料金・期間・進め方・対象範囲をカバー。4個
15. cta_text: 8字以内

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

// ============================================================
// 汎用生成プロンプト
// ============================================================

export const GENERIC_PROMPTS: Record<string, string> = {
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

export const GENERIC_TITLES: Record<string, string> = {
  flyer: "チラシ",
  hearing_form: "ヒアリングフォーム",
  line_design: "LINE導線設計書",
  profile: "プロフィールシート",
  system_proposal: "システム開発提案書",
  proposal: "提案資料",
};
