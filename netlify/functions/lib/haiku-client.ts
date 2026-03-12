/**
 * Haiku 情報抽出クライアント - TypeScript移植
 * Python haiku_extraction.py からの忠実な移植
 *
 * 営業アポ中の会話テキストから、Claude Haikuが
 * ビジネスJSON情報を構造化抽出する。
 * 30秒チャンクごとの累積マージ方式。
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  ConfidenceScore,
  ConfidenceField,
  ContactInfo,
  ExtractedDataWithConfidence,
  IndustryCategory,
  ProductReadiness,
} from "./types.js";

// ============================================================
// 定数
// ============================================================

/** Haiku モデル名 */
const HAIKU_MODEL = "claude-3-haiku-20240307";

/** Haiku API タイムアウト (ms) */
const HAIKU_TIMEOUT_MS = 15_000;

/** Haiku 最大トークン */
const HAIKU_MAX_TOKENS = 2000;

/** 最大リトライ回数 */
const HAIKU_MAX_RETRIES = 2;

/** 有効な業種カテゴリ */
const VALID_INDUSTRIES: readonly IndustryCategory[] = [
  "士業",
  "飲食・サロン",
  "BtoBサービス",
  "不動産・建設",
  "コンサル",
  "その他",
];

/** 全フィールド一覧 */
const ALL_FIELDS: readonly string[] = [
  "company_name", "industry", "service_name",
  "target_customer", "price_range", "strengths",
  "pain_points", "current_marketing", "desired_outcome",
  "contact_info", "tone_keywords", "upsell_signals",
];

/** 配列型フィールド */
const ARRAY_FIELDS: ReadonlySet<string> = new Set([
  "strengths", "pain_points", "tone_keywords", "upsell_signals",
]);

/** オブジェクト型フィールド */
const OBJECT_FIELDS: ReadonlySet<string> = new Set(["contact_info"]);

/** 有効なconfidenceスコア */
const VALID_CONFIDENCES: readonly ConfidenceScore[] = [1.0, 0.6, 0.3];

/** 制作物ごとの必須フィールド定義 */
const REQUIRED_FIELDS_BY_PRODUCT: Readonly<Record<string, readonly string[]>> = {
  "LP": ["company_name", "service_name", "industry", "target_customer", "strengths"],
  "広告": ["service_name", "target_customer", "pain_points", "strengths", "industry"],
  "チラシ": ["company_name", "service_name", "industry", "strengths", "price_range"],
  "フォーム": ["industry", "service_name", "company_name"],
  "議事録": [],
};

// ============================================================
// System プロンプト
// ============================================================

const SYSTEM_PROMPT_EXTRACTION = `あなたは営業アポイント中の会話テキストからビジネス情報を構造化抽出するAIです。

## ルール

1. 出力は必ず有効なJSONのみ。説明文やマークダウンは一切含めないこと。
2. 各フィールドにconfidenceスコアを付与する：
   - 1.0 = 会話中で明示的に言及されている
   - 0.6 = 文脈から合理的に推測できる
   - 0.3 = 間接的な情報からの推定
3. 会話に該当情報がない場合はnull（文字列・オブジェクト）または空配列（配列）を設定する。
4. industry は以下のいずれかのみ: "士業", "飲食・サロン", "BtoBサービス", "不動産・建設", "コンサル", "その他"
5. strengths, pain_points は最大5件まで。
6. 前回までの抽出結果が提供されている場合、新しい情報があれば更新し、なければそのまま維持する。
7. confidenceが高い情報で低い情報を上書きする。同じconfidenceの場合は新しい情報を採用する。

## 出力JSON形式

\`\`\`json
{
  "company_name": {"value": "会社名または null", "confidence": 1.0},
  "industry": {"value": "業種カテゴリまたは null", "confidence": 1.0},
  "service_name": {"value": "サービス名または null", "confidence": 1.0},
  "target_customer": {"value": "ターゲット顧客層または null", "confidence": 1.0},
  "price_range": {"value": "価格帯または null", "confidence": 1.0},
  "strengths": {"value": ["強み1", "強み2"], "confidence": 1.0},
  "pain_points": {"value": ["課題1", "課題2"], "confidence": 1.0},
  "current_marketing": {"value": "集客方法または null", "confidence": 1.0},
  "desired_outcome": {"value": "理想の状態または null", "confidence": 1.0},
  "contact_info": {
    "value": {"phone": null, "email": null, "line": null, "address": null},
    "confidence": 0.3
  },
  "tone_keywords": {"value": ["キーワード1"], "confidence": 0.6},
  "upsell_signals": {"value": ["シグナル1"], "confidence": 0.6}
}
\`\`\`

## few-shot 例

### 例1: BtoBサービス
会話テキスト:
「うちは従業員30名の製造業で、最近受注管理が追いつかなくて。今はエクセルで管理してるんですけど、ミスが多くて...月額だと2万くらいまでなら検討できます」

出力:
\`\`\`json
{
  "company_name": {"value": null, "confidence": 0.3},
  "industry": {"value": "BtoBサービス", "confidence": 0.6},
  "service_name": {"value": null, "confidence": 0.3},
  "target_customer": {"value": "従業員30名規模の製造業", "confidence": 1.0},
  "price_range": {"value": "月額2万円まで", "confidence": 1.0},
  "strengths": {"value": [], "confidence": 0.3},
  "pain_points": {"value": ["受注管理が追いつかない", "エクセル管理でミスが多い"], "confidence": 1.0},
  "current_marketing": {"value": null, "confidence": 0.3},
  "desired_outcome": {"value": "受注管理の効率化・ミス削減", "confidence": 0.6},
  "contact_info": {"value": {"phone": null, "email": null, "line": null, "address": null}, "confidence": 0.3},
  "tone_keywords": {"value": ["実務的", "コスト意識"], "confidence": 0.6},
  "upsell_signals": {"value": ["業務システム導入に前向き", "予算感を提示している"], "confidence": 0.6}
}
\`\`\`

### 例2: 士業
会話テキスト:
「田中法律事務所の田中です。今はホームページからの問い合わせがメインなんですが、なかなか新規が来なくて。離婚案件と相続が専門です」

出力:
\`\`\`json
{
  "company_name": {"value": "田中法律事務所", "confidence": 1.0},
  "industry": {"value": "士業", "confidence": 1.0},
  "service_name": {"value": "離婚・相続法律相談", "confidence": 0.6},
  "target_customer": {"value": "離婚・相続で悩む個人", "confidence": 0.6},
  "price_range": {"value": null, "confidence": 0.3},
  "strengths": {"value": ["離婚案件専門", "相続専門"], "confidence": 1.0},
  "pain_points": {"value": ["新規問い合わせが少ない"], "confidence": 1.0},
  "current_marketing": {"value": "ホームページ", "confidence": 1.0},
  "desired_outcome": {"value": "新規顧客の獲得増加", "confidence": 0.6},
  "contact_info": {"value": {"phone": null, "email": null, "line": null, "address": null}, "confidence": 0.3},
  "tone_keywords": {"value": ["信頼感", "専門性", "誠実"], "confidence": 0.6},
  "upsell_signals": {"value": ["ウェブ集客に課題感あり", "専門分野が明確"], "confidence": 0.6}
}
\`\`\`

### 例3: 飲食・サロン
会話テキスト:
「駅前でイタリアンやってます、10席くらいの小さい店で。インスタはやってるんですけど、フォロワーが全然増えなくて」

出力:
\`\`\`json
{
  "company_name": {"value": null, "confidence": 0.3},
  "industry": {"value": "飲食・サロン", "confidence": 1.0},
  "service_name": {"value": "イタリアンレストラン", "confidence": 1.0},
  "target_customer": {"value": "駅前周辺の顧客", "confidence": 0.6},
  "price_range": {"value": null, "confidence": 0.3},
  "strengths": {"value": ["駅前立地"], "confidence": 0.6},
  "pain_points": {"value": ["SNSフォロワーが増えない"], "confidence": 1.0},
  "current_marketing": {"value": "Instagram", "confidence": 1.0},
  "desired_outcome": {"value": "SNS経由の集客増加", "confidence": 0.6},
  "contact_info": {"value": {"phone": null, "email": null, "line": null, "address": "駅前"}, "confidence": 0.6},
  "tone_keywords": {"value": ["親しみやすい", "カジュアル"], "confidence": 0.6},
  "upsell_signals": {"value": ["SNS運用に課題", "小規模店舗で手が回らない"], "confidence": 0.6}
}
\`\`\``;

// ============================================================
// JSON抽出用正規表現（事前コンパイル）
// ============================================================

const JSON_CODE_BLOCK_RE = /```json\s*(.*?)\s*```/s;
const JSON_OBJECT_RE = /\{.*\}/s;

// ============================================================
// ヘルパー関数
// ============================================================

/**
 * 値が空（null、空文字、空リスト、全Noneのdict）かを判定。
 * Python版 _is_empty の移植。
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string" && value.trim() === "") {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    return Object.values(obj).every((v) => v === null || v === undefined);
  }
  return false;
}

/**
 * confidenceスコアを最も近い有効値にスナップする。
 */
function snapConfidence(raw: unknown): ConfidenceScore {
  if (typeof raw !== "number" || isNaN(raw)) {
    return 0.3;
  }
  let closest: ConfidenceScore = 0.3;
  let minDiff = Infinity;
  for (const valid of VALID_CONFIDENCES) {
    const diff = Math.abs(valid - raw);
    if (diff < minDiff) {
      minDiff = diff;
      closest = valid;
    }
  }
  return closest;
}

/**
 * デフォルトのContactInfoを生成する。
 */
function defaultContactInfo(): ContactInfo {
  return { phone: null, email: null, line: null, address: null };
}

/**
 * デフォルトの空データを生成する。
 */
function createEmptyExtractedData(): ExtractedDataWithConfidence {
  return {
    company_name: { value: null, confidence: 0.3 },
    industry: { value: null, confidence: 0.3 },
    service_name: { value: null, confidence: 0.3 },
    target_customer: { value: null, confidence: 0.3 },
    price_range: { value: null, confidence: 0.3 },
    strengths: { value: [], confidence: 0.3 },
    pain_points: { value: [], confidence: 0.3 },
    current_marketing: { value: null, confidence: 0.3 },
    desired_outcome: { value: null, confidence: 0.3 },
    contact_info: { value: defaultContactInfo(), confidence: 0.3 },
    tone_keywords: { value: [], confidence: 0.3 },
    upsell_signals: { value: [], confidence: 0.3 },
  };
}

// ============================================================
// プロンプト構築
// ============================================================

/**
 * チャンクテキスト + 前回JSONからuserプロンプトを構築する。
 * Python版 build_extraction_prompt の移植。
 */
export function buildExtractionPrompt(
  chunkText: string,
  previousJson: ExtractedDataWithConfidence | null,
): string {
  const parts: string[] = [];

  if (previousJson !== null) {
    parts.push("## 前回までの抽出結果");
    parts.push("以下は前回までの累積抽出結果です。新しい情報があれば更新し、なければそのまま維持してください。");
    parts.push(`\`\`\`json\n${JSON.stringify(previousJson, null, 2)}\n\`\`\``);
    parts.push("");
  }

  parts.push("## 今回の会話テキスト");
  parts.push("以下の会話テキストからビジネス情報を抽出してください。");
  parts.push(`\`\`\`\n${chunkText}\n\`\`\``);
  parts.push("");
  parts.push("上記の会話テキストからビジネス情報をJSON形式で抽出してください。JSONのみを出力し、他のテキストは含めないでください。");

  return parts.join("\n");
}

// ============================================================
// レスポンスパース
// ============================================================

/**
 * Haikuレスポンスをパースしてバリデーション済みのデータを返す。
 * Python版 parse_extraction_response の移植。
 */
export function parseExtractionResponse(responseText: string): ExtractedDataWithConfidence {
  // JSONブロックの抽出
  const codeBlockMatch = JSON_CODE_BLOCK_RE.exec(responseText);
  let jsonStr: string;

  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1];
  } else {
    const objectMatch = JSON_OBJECT_RE.exec(responseText);
    if (objectMatch?.[0]) {
      jsonStr = objectMatch[0];
    } else {
      throw new Error("レスポンスからJSONを検出できませんでした");
    }
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラー";
    throw new Error(`JSONパースエラー: ${message}`);
  }

  return validateAndNormalizeFields(data);
}

/**
 * パースしたJSONフィールドのバリデーションと正規化。
 */
function validateAndNormalizeFields(
  data: Record<string, unknown>,
): ExtractedDataWithConfidence {
  const result: Record<string, ConfidenceField<unknown>> = {};

  for (const field of ALL_FIELDS) {
    const rawEntry = data[field];

    // フィールドが欠落している場合のデフォルト
    if (rawEntry === undefined || rawEntry === null) {
      if (ARRAY_FIELDS.has(field)) {
        result[field] = { value: [], confidence: 0.3 };
      } else if (OBJECT_FIELDS.has(field)) {
        result[field] = { value: defaultContactInfo(), confidence: 0.3 };
      } else {
        result[field] = { value: null, confidence: 0.3 };
      }
      continue;
    }

    const entry = rawEntry as Record<string, unknown>;

    // {"value": ..., "confidence": ...} 形式でない場合の補正
    if (typeof entry !== "object" || !("value" in entry)) {
      if (ARRAY_FIELDS.has(field)) {
        const val = Array.isArray(rawEntry) ? rawEntry : [];
        result[field] = { value: val.map(String), confidence: 0.6 };
      } else if (OBJECT_FIELDS.has(field)) {
        const val = typeof rawEntry === "object" && !Array.isArray(rawEntry)
          ? rawEntry as ContactInfo
          : defaultContactInfo();
        result[field] = { value: val, confidence: 0.6 };
      } else {
        result[field] = { value: rawEntry, confidence: 0.6 };
      }
      continue;
    }

    let confidence = snapConfidence(entry["confidence"]);
    let value: unknown = entry["value"];

    // 型バリデーション
    if (ARRAY_FIELDS.has(field)) {
      if (!Array.isArray(value)) {
        value = value === null || value === undefined ? [] : [String(value)];
      } else {
        const maxItems = (field === "strengths" || field === "pain_points") ? 5 : 10;
        value = (value as unknown[]).slice(0, maxItems).map(String);
      }
    } else if (OBJECT_FIELDS.has(field)) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        value = defaultContactInfo();
      }
    } else if (field === "industry") {
      // 業種の正規化
      if (value !== null && typeof value === "string") {
        if (!VALID_INDUSTRIES.includes(value as IndustryCategory)) {
          let matched = false;
          for (const valid of VALID_INDUSTRIES) {
            if (valid.includes(value) || value.includes(valid)) {
              value = valid;
              matched = true;
              break;
            }
          }
          if (!matched) {
            value = "その他";
            confidence = 0.3;
          }
        }
      }
    }

    result[field] = { value, confidence };
  }

  return result as unknown as ExtractedDataWithConfidence;
}

// ============================================================
// マージ処理
// ============================================================

/**
 * 前回と今回の抽出結果をマージする。
 * confidenceが高い方を優先。同スコアなら新しい方を採用。
 * Python版 merge_extracted_data の移植。
 */
export function mergeExtractedData(
  previous: ExtractedDataWithConfidence,
  newData: ExtractedDataWithConfidence,
): ExtractedDataWithConfidence {
  const merged: Record<string, ConfidenceField<unknown>> = {};
  const prevRecord = previous as unknown as Record<string, ConfidenceField<unknown>>;
  const newRecord = newData as unknown as Record<string, ConfidenceField<unknown>>;

  for (const field of ALL_FIELDS) {
    let prevEntry = prevRecord[field];
    let newEntry = newRecord[field];

    // 型ガード
    if (!prevEntry || typeof prevEntry !== "object" || !("value" in prevEntry)) {
      prevEntry = { value: null, confidence: 0.3 };
    }
    if (!newEntry || typeof newEntry !== "object" || !("value" in newEntry)) {
      newEntry = { value: null, confidence: 0.3 };
    }

    const prevConf = prevEntry.confidence;
    const newConf = newEntry.confidence;
    const prevVal = prevEntry.value;
    const newVal = newEntry.value;

    // 新しい値が空なら前回を維持
    if (isEmpty(newVal)) {
      merged[field] = prevEntry;
      continue;
    }

    // 前回が空なら新しい値を採用
    if (isEmpty(prevVal)) {
      merged[field] = newEntry;
      continue;
    }

    // 配列フィールドの場合はマージ（重複除去）
    if (ARRAY_FIELDS.has(field)) {
      if (Array.isArray(prevVal) && Array.isArray(newVal)) {
        if (newConf > prevConf) {
          merged[field] = newEntry;
        } else {
          const combined = [...prevVal as string[]];
          for (const item of newVal as string[]) {
            if (!combined.includes(item)) {
              combined.push(item);
            }
          }
          const maxItems = (field === "strengths" || field === "pain_points") ? 5 : 10;
          merged[field] = {
            value: combined.slice(0, maxItems),
            confidence: Math.max(prevConf, newConf) as ConfidenceScore,
          };
        }
        continue;
      }
    }

    // オブジェクトフィールド（contact_info）の場合はフィールドごとマージ
    if (OBJECT_FIELDS.has(field)) {
      if (typeof prevVal === "object" && typeof newVal === "object" &&
          prevVal !== null && newVal !== null &&
          !Array.isArray(prevVal) && !Array.isArray(newVal)) {
        const mergedObj = { ...(prevVal as Record<string, unknown>) };
        for (const [k, v] of Object.entries(newVal as Record<string, unknown>)) {
          if (v !== null && v !== undefined) {
            mergedObj[k] = v;
          }
        }
        merged[field] = {
          value: mergedObj,
          confidence: Math.max(prevConf, newConf) as ConfidenceScore,
        };
        continue;
      }
    }

    // スカラー値: confidenceが高い方を採用（同値なら新しい方）
    if (newConf >= prevConf) {
      merged[field] = newEntry;
    } else {
      merged[field] = prevEntry;
    }
  }

  return merged as unknown as ExtractedDataWithConfidence;
}

// ============================================================
// 生成可能判定
// ============================================================

/**
 * 各制作物の生成可能/不足判定を行う。
 * Python版 check_generation_readiness の移植。
 */
export function checkGenerationReadiness(
  data: ExtractedDataWithConfidence,
): Record<string, ProductReadiness> {
  const result: Record<string, ProductReadiness> = {};
  const dataRecord = data as unknown as Record<string, ConfidenceField<unknown>>;

  for (const [product, requiredFields] of Object.entries(REQUIRED_FIELDS_BY_PRODUCT)) {
    const missing: string[] = [];
    const filled: string[] = [];
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (const field of requiredFields) {
      let entry = dataRecord[field];
      if (!entry || typeof entry !== "object" || !("value" in entry)) {
        entry = { value: null, confidence: 0.3 };
      }

      if (isEmpty(entry.value)) {
        missing.push(field);
      } else {
        filled.push(field);
        confidenceSum += entry.confidence;
        confidenceCount += 1;
      }
    }

    const confidenceAvg = confidenceCount > 0
      ? Math.round((confidenceSum / confidenceCount) * 100) / 100
      : 0;

    result[product] = {
      ready: missing.length === 0,
      missing,
      filled,
      confidence_avg: confidenceAvg,
    };
  }

  return result;
}

// ============================================================
// フラット化
// ============================================================

/**
 * confidence付きデータを sonnet_prompts が期待するフラット形式に変換。
 * Python版 flatten_extracted_data の移植。
 */
export function flattenExtractedData(
  data: ExtractedDataWithConfidence,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const dataRecord = data as unknown as Record<string, ConfidenceField<unknown>>;

  for (const field of ALL_FIELDS) {
    const entry = dataRecord[field];
    if (entry && typeof entry === "object" && "value" in entry) {
      flat[field] = entry.value;
    } else {
      flat[field] = entry;
    }
  }

  return flat;
}

// ============================================================
// Haiku API呼び出し
// ============================================================

/**
 * Claude Haiku APIを呼び出して抽出結果を取得。
 * AbortController + タイムアウト必須。
 */
export async function callHaiku(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
): Promise<string> {
  const client = new Anthropic({ apiKey });

  for (let attempt = 0; attempt <= HAIKU_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);

    try {
      const response = await client.messages.create(
        {
          model: HAIKU_MODEL,
          max_tokens: HAIKU_MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        },
        { signal: controller.signal },
      );

      const firstBlock = response.content[0];
      if (!firstBlock || firstBlock.type !== "text") {
        throw new Error("Haiku APIからテキストレスポンスが返されませんでした");
      }
      return firstBlock.text;
    } catch (error) {
      if (attempt < HAIKU_MAX_RETRIES) {
        console.warn(
          `Haiku API リトライ ${attempt + 1}/${HAIKU_MAX_RETRIES}: ${error instanceof Error ? error.message : "不明なエラー"}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error("Haiku API呼び出しに失敗しました (全リトライ失敗)");
}

// ============================================================
// 統合: 抽出パイプライン
// ============================================================

/**
 * テキストチャンクからHaiku抽出を実行し、前回データとマージする。
 */
export async function extractAndMerge(
  chunkText: string,
  previousData: ExtractedDataWithConfidence | null,
  apiKey: string,
): Promise<{
  merged: ExtractedDataWithConfidence;
  fieldsUpdated: readonly string[];
}> {
  const userPrompt = buildExtractionPrompt(chunkText, previousData);
  const responseText = await callHaiku(SYSTEM_PROMPT_EXTRACTION, userPrompt, apiKey);
  const newData = parseExtractionResponse(responseText);

  if (previousData === null) {
    const fieldsUpdated = getFilledFields(newData);
    return { merged: newData, fieldsUpdated };
  }

  const merged = mergeExtractedData(previousData, newData);
  const fieldsUpdated = getChangedFields(previousData, merged);
  return { merged, fieldsUpdated };
}

/**
 * 抽出データ内の値が埋まっているフィールド名を返す。
 */
function getFilledFields(data: ExtractedDataWithConfidence): string[] {
  const filled: string[] = [];
  const dataRecord = data as unknown as Record<string, ConfidenceField<unknown>>;

  for (const field of ALL_FIELDS) {
    const entry = dataRecord[field];
    if (entry && !isEmpty(entry.value)) {
      filled.push(field);
    }
  }
  return filled;
}

/**
 * 前回と今回で値が変わったフィールド名を返す。
 */
function getChangedFields(
  previous: ExtractedDataWithConfidence,
  current: ExtractedDataWithConfidence,
): string[] {
  const changed: string[] = [];
  const prevRecord = previous as unknown as Record<string, ConfidenceField<unknown>>;
  const curRecord = current as unknown as Record<string, ConfidenceField<unknown>>;

  for (const field of ALL_FIELDS) {
    const prevEntry = prevRecord[field];
    const curEntry = curRecord[field];
    if (JSON.stringify(prevEntry) !== JSON.stringify(curEntry)) {
      changed.push(field);
    }
  }
  return changed;
}

// Re-export for external use
export {
  SYSTEM_PROMPT_EXTRACTION,
  ALL_FIELDS,
  VALID_INDUSTRIES,
  createEmptyExtractedData,
  isEmpty,
};
