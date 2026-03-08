/**
 * haiku-client テスト
 *
 * Python haiku_extraction.py の移植が正確であることを検証する。
 */

import {
  buildExtractionPrompt,
  parseExtractionResponse,
  mergeExtractedData,
  checkGenerationReadiness,
  flattenExtractedData,
  createEmptyExtractedData,
  isEmpty,
  ALL_FIELDS,
} from "../netlify/functions/lib/haiku-client.js";
import type {
  ExtractedDataWithConfidence,
  ConfidenceField,
} from "../netlify/functions/lib/types.js";

// ============================================================
// テストデータ
// ============================================================

const sampleHaikuResponse = `{
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
  "upsell_signals": {"value": ["ウェブ集客に課題感あり"], "confidence": 0.6}
}`;

// ============================================================
// buildExtractionPrompt テスト
// ============================================================

describe("buildExtractionPrompt", () => {
  test("初回（previousJsonなし）のプロンプト構築", () => {
    const prompt = buildExtractionPrompt("テスト会話テキスト", null);
    expect(prompt).toContain("## 今回の会話テキスト");
    expect(prompt).toContain("テスト会話テキスト");
    expect(prompt).not.toContain("前回までの抽出結果");
  });

  test("2回目以降（previousJsonあり）のプロンプト構築", () => {
    const previous = createEmptyExtractedData();
    const prompt = buildExtractionPrompt("テスト会話テキスト", previous);
    expect(prompt).toContain("## 前回までの抽出結果");
    expect(prompt).toContain("## 今回の会話テキスト");
    expect(prompt).toContain("テスト会話テキスト");
  });
});

// ============================================================
// parseExtractionResponse テスト
// ============================================================

describe("parseExtractionResponse", () => {
  test("正常なJSONレスポンスをパースできる", () => {
    const result = parseExtractionResponse(sampleHaikuResponse);
    expect(result.company_name.value).toBe("田中法律事務所");
    expect(result.company_name.confidence).toBe(1.0);
    expect(result.industry.value).toBe("士業");
    expect(result.strengths.value).toEqual(["離婚案件専門", "相続専門"]);
  });

  test("コードブロック付きレスポンスをパースできる", () => {
    const wrapped = "```json\n" + sampleHaikuResponse + "\n```";
    const result = parseExtractionResponse(wrapped);
    expect(result.company_name.value).toBe("田中法律事務所");
  });

  test("フィールド欠落時はデフォルト値が設定される", () => {
    const partial = `{
      "company_name": {"value": "テスト会社", "confidence": 1.0}
    }`;
    const result = parseExtractionResponse(partial);
    expect(result.company_name.value).toBe("テスト会社");
    expect(result.industry.value).toBeNull();
    expect(result.industry.confidence).toBe(0.3);
    expect(result.strengths.value).toEqual([]);
    expect(result.contact_info.value).toEqual({
      phone: null, email: null, line: null, address: null,
    });
  });

  test("不正なindustryは正規化される", () => {
    const data = `{
      "company_name": {"value": "テスト", "confidence": 1.0},
      "industry": {"value": "法律事務所", "confidence": 1.0}
    }`;
    const result = parseExtractionResponse(data);
    // "法律事務所"はどの業種にも部分一致しないため「その他」
    expect(result.industry.value).toBe("その他");
    expect(result.industry.confidence).toBe(0.3);
  });

  test("部分一致する業種は正規化される", () => {
    const data = `{
      "industry": {"value": "飲食", "confidence": 1.0}
    }`;
    const result = parseExtractionResponse(data);
    expect(result.industry.value).toBe("飲食・サロン");
  });

  test("confidenceスコアは有効値にスナップされる", () => {
    const data = `{
      "company_name": {"value": "テスト", "confidence": 0.8}
    }`;
    const result = parseExtractionResponse(data);
    // 0.8は1.0に最も近い
    expect(result.company_name.confidence).toBe(1.0);
  });

  test("strengths/pain_pointsは最大5件に制限される", () => {
    const data = `{
      "strengths": {"value": ["1","2","3","4","5","6","7"], "confidence": 1.0}
    }`;
    const result = parseExtractionResponse(data);
    expect(result.strengths.value).toHaveLength(5);
  });

  test("JSONが検出できない場合はエラー", () => {
    expect(() => parseExtractionResponse("これはJSONではありません")).toThrow(
      "レスポンスからJSONを検出できませんでした",
    );
  });

  test("不正なJSONの場合はエラー", () => {
    expect(() => parseExtractionResponse("{invalid json}")).toThrow("JSONパースエラー");
  });
});

// ============================================================
// mergeExtractedData テスト
// ============================================================

describe("mergeExtractedData", () => {
  test("空の前回データに新データをマージ", () => {
    const previous = createEmptyExtractedData();
    const newData = parseExtractionResponse(sampleHaikuResponse);
    const merged = mergeExtractedData(previous, newData);

    expect(merged.company_name.value).toBe("田中法律事務所");
    expect(merged.industry.value).toBe("士業");
  });

  test("confidenceが高い方が優先される", () => {
    const previous: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      company_name: { value: "旧会社名", confidence: 0.6 },
    };
    const newData: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      company_name: { value: "新会社名", confidence: 1.0 },
    };
    const merged = mergeExtractedData(previous, newData);
    expect(merged.company_name.value).toBe("新会社名");
    expect(merged.company_name.confidence).toBe(1.0);
  });

  test("同じconfidenceなら新しい値が採用される", () => {
    const previous: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      company_name: { value: "旧会社名", confidence: 1.0 },
    };
    const newData: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      company_name: { value: "新会社名", confidence: 1.0 },
    };
    const merged = mergeExtractedData(previous, newData);
    expect(merged.company_name.value).toBe("新会社名");
  });

  test("新しい値が低confidenceで旧値が高confidenceなら旧値を維持", () => {
    const previous: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      company_name: { value: "確定会社名", confidence: 1.0 },
    };
    const newData: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      company_name: { value: "推測会社名", confidence: 0.3 },
    };
    const merged = mergeExtractedData(previous, newData);
    expect(merged.company_name.value).toBe("確定会社名");
  });

  test("配列フィールドは重複除去してマージされる", () => {
    const previous: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      strengths: { value: ["強み1", "強み2"], confidence: 0.6 },
    };
    const newData: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      strengths: { value: ["強み2", "強み3"], confidence: 0.6 },
    };
    const merged = mergeExtractedData(previous, newData);
    expect(merged.strengths.value).toEqual(["強み1", "強み2", "強み3"]);
  });

  test("配列フィールドで新confidenceが高ければ全置換", () => {
    const previous: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      strengths: { value: ["旧強み1", "旧強み2"], confidence: 0.3 },
    };
    const newData: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      strengths: { value: ["新強み1"], confidence: 1.0 },
    };
    const merged = mergeExtractedData(previous, newData);
    expect(merged.strengths.value).toEqual(["新強み1"]);
  });

  test("contact_infoはフィールドごとにマージされる", () => {
    const previous: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      contact_info: {
        value: { phone: "03-1234-5678", email: null, line: null, address: null },
        confidence: 0.6,
      },
    };
    const newData: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      contact_info: {
        value: { phone: null, email: "test@example.com", line: null, address: null },
        confidence: 0.6,
      },
    };
    const merged = mergeExtractedData(previous, newData);
    expect(merged.contact_info.value.phone).toBe("03-1234-5678");
    expect(merged.contact_info.value.email).toBe("test@example.com");
  });

  test("新しい値がnull/空の場合は前回を維持", () => {
    const previous: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      company_name: { value: "保持する会社名", confidence: 0.6 },
    };
    const newData: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      company_name: { value: null, confidence: 0.3 },
    };
    const merged = mergeExtractedData(previous, newData);
    expect(merged.company_name.value).toBe("保持する会社名");
  });
});

// ============================================================
// checkGenerationReadiness テスト
// ============================================================

describe("checkGenerationReadiness", () => {
  test("全フィールド埋まっている場合は全制作物がready", () => {
    const data = parseExtractionResponse(sampleHaikuResponse);
    // price_rangeがnullなのでチラシはNG
    const readiness = checkGenerationReadiness(data);
    expect(readiness["LP"]?.ready).toBe(true);
    expect(readiness["チラシ"]?.ready).toBe(false);
    expect(readiness["チラシ"]?.missing).toContain("price_range");
    expect(readiness["議事録"]?.ready).toBe(true); // 必須フィールドなし
  });

  test("空データの場合はフォームと議事録以外NG", () => {
    const data = createEmptyExtractedData();
    const readiness = checkGenerationReadiness(data);
    expect(readiness["LP"]?.ready).toBe(false);
    expect(readiness["広告"]?.ready).toBe(false);
    expect(readiness["議事録"]?.ready).toBe(true);
  });

  test("confidence_avgが正しく計算される", () => {
    const data: ExtractedDataWithConfidence = {
      ...createEmptyExtractedData(),
      company_name: { value: "テスト", confidence: 1.0 },
      service_name: { value: "サービス", confidence: 0.6 },
      industry: { value: "士業", confidence: 1.0 },
      target_customer: { value: "個人", confidence: 0.6 },
      strengths: { value: ["強み"], confidence: 1.0 },
    };
    const readiness = checkGenerationReadiness(data);
    // LP: 5フィールド全部埋まり、平均 = (1.0+0.6+1.0+0.6+1.0)/5 = 0.84
    expect(readiness["LP"]?.ready).toBe(true);
    expect(readiness["LP"]?.confidence_avg).toBe(0.84);
  });
});

// ============================================================
// flattenExtractedData テスト
// ============================================================

describe("flattenExtractedData", () => {
  test("confidence付きデータをフラット化できる", () => {
    const data = parseExtractionResponse(sampleHaikuResponse);
    const flat = flattenExtractedData(data);
    expect(flat["company_name"]).toBe("田中法律事務所");
    expect(flat["strengths"]).toEqual(["離婚案件専門", "相続専門"]);
    expect(flat["price_range"]).toBeNull();
  });

  test("全フィールドが含まれる", () => {
    const data = createEmptyExtractedData();
    const flat = flattenExtractedData(data);
    for (const field of ALL_FIELDS) {
      expect(field in flat).toBe(true);
    }
  });
});

// ============================================================
// isEmpty テスト
// ============================================================

describe("isEmpty", () => {
  test("nullはtrue", () => expect(isEmpty(null)).toBe(true));
  test("undefinedはtrue", () => expect(isEmpty(undefined)).toBe(true));
  test("空文字はtrue", () => expect(isEmpty("")).toBe(true));
  test("空白のみはtrue", () => expect(isEmpty("  ")).toBe(true));
  test("空配列はtrue", () => expect(isEmpty([])).toBe(true));
  test("全null objectはtrue", () => expect(isEmpty({ a: null, b: null })).toBe(true));
  test("値ありstringはfalse", () => expect(isEmpty("テスト")).toBe(false));
  test("値あり配列はfalse", () => expect(isEmpty(["a"])).toBe(false));
  test("値ありobjectはfalse", () => expect(isEmpty({ a: "value" })).toBe(false));
});
