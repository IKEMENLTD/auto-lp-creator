/**
 * sonnet-prompts テスト
 */

import {
  getIndustryDefaults,
  selectTemplate,
  buildUserPrompt,
  parseSonnetResponse,
  validateAndTrim,
  mapToTemplatePlaceholders,
  SYSTEM_PROMPT_LP,
  INDUSTRY_DEFAULTS,
} from "../netlify/functions/lib/sonnet-prompts.js";
import type { ExtractedData, SonnetCopyData } from "../netlify/functions/lib/types.js";

// ============================================================
// テストデータ
// ============================================================

const baseExtractedData: ExtractedData = {
  company_name: "テスト株式会社",
  service_name: "スマート営業くん",
  industry: "BtoBサービス",
  target_customer: "従業員50名以下の中小企業経営者",
  strengths: ["導入実績200社以上", "月額9,800円から", "専任サポート付き"],
  pain_points: ["営業が属人化", "リード獲得コスト高"],
};

const mockSonnetResponse = `
<hero_headline>業務効率を劇的に改善</hero_headline>
<hero_sub>テストサービスが中小企業の成長を加速させます</hero_sub>
<problem_1>リード獲得コストの増大</problem_1>
<problem_1_body>広告費は年々上昇。獲得単価が高止まりで利益を圧迫していませんか？</problem_1_body>
<problem_2>営業の属人化</problem_2>
<problem_2_body>トップ営業マンが辞めたら売上が激減。そんなリスクを抱えていませんか？</problem_2_body>
<problem_3>デジタル化の遅れ</problem_3>
<problem_3_body>エクセル管理の限界。データ活用で競合に差をつけられていませんか？</problem_3_body>
<benefit_1>導入実績100社以上</benefit_1>
<benefit_1_body>製造業からIT企業まで幅広い業種で成果を実証。平均30%の業務効率改善を実現。</benefit_1_body>
<benefit_2>24時間365日サポート</benefit_2>
<benefit_2_body>困った時はいつでも相談可能。専任担当が導入から運用まで伴走します。</benefit_2_body>
<benefit_3>業界最安値クラス</benefit_3>
<benefit_3_body>月額9,800円から。初期費用0円で始められるので、小さく始めて大きく育てられます。</benefit_3_body>
<cta_text>無料で資料請求</cta_text>
<cta_sub>3分で完了。営業電話は一切しません</cta_sub>
<about_description>テストサービスは中小企業の業務効率化を支援するクラウドサービスです。</about_description>
<product_description>導入実績100社以上のテストサービスが、リード獲得から営業管理まで一気通貫で支援。</product_description>
`;

// ============================================================
// テスト
// ============================================================

describe("getIndustryDefaults", () => {
  it("should return matching industry defaults", () => {
    const result = getIndustryDefaults("BtoBサービス");
    expect(result.tone).toBe("シャープ・論理的・実績ベース");
    expect(result.pain_points).toHaveLength(3);
  });

  it("should return fallback for unknown industry", () => {
    const result = getIndustryDefaults("宇宙産業");
    expect(result.tone).toBe("明快・プロフェッショナル");
  });

  it("should match partial industry name", () => {
    const result = getIndustryDefaults("士業");
    expect(result.cta_label).toBe("無料相談を予約する");
  });
});

describe("selectTemplate", () => {
  it("should return correct template for BtoB", () => {
    expect(selectTemplate("BtoBサービス")).toBe(2);
  });

  it("should return correct template for 士業", () => {
    expect(selectTemplate("士業")).toBe(1);
  });

  it("should return default template for unknown industry", () => {
    expect(selectTemplate("未知の業種")).toBe(2);
  });
});

describe("buildUserPrompt", () => {
  it("should build prompt with all fields", () => {
    const prompt = buildUserPrompt(baseExtractedData);

    expect(prompt).toContain("テスト株式会社");
    expect(prompt).toContain("スマート営業くん");
    expect(prompt).toContain("BtoBサービス");
    expect(prompt).toContain("導入実績200社以上");
  });

  it("should add strength instruction when only one strength", () => {
    const data: ExtractedData = {
      ...baseExtractedData,
      strengths: ["唯一の強み"],
    };
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("強みが1つのみです");
  });

  it("should use defaults for missing pain_points", () => {
    const data: ExtractedData = {
      ...baseExtractedData,
      pain_points: undefined,
    };
    const prompt = buildUserPrompt(data);

    // BtoBのデフォルト pain_points を使用
    expect(prompt).toContain("リード獲得コストが高い");
  });

  it("should include price_range when provided", () => {
    const data: ExtractedData = {
      ...baseExtractedData,
      price_range: "月額9,800円〜",
    };
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("価格帯: 月額9,800円〜");
  });
});

describe("parseSonnetResponse", () => {
  it("should parse all tags from response", () => {
    const result = parseSonnetResponse(mockSonnetResponse);

    expect(result.hero_headline).toBe("業務効率を劇的に改善");
    expect(result.hero_sub).toContain("中小企業の成長");
    expect(result.cta_text).toBe("無料で資料請求");
    expect(Object.keys(result)).toHaveLength(18);
  });

  it("should strip HTML tags except br", () => {
    const response =
      '<hero_headline><strong>テスト</strong>ヘッドライン</hero_headline>';
    const result = parseSonnetResponse(response);

    expect(result.hero_headline).toBe("テストヘッドライン");
  });

  it("should handle missing tags gracefully", () => {
    const response = "<hero_headline>テスト</hero_headline>";
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

    const result = parseSonnetResponse(response);

    expect(result.hero_headline).toBe("テスト");
    expect(result.hero_sub).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe("validateAndTrim", () => {
  it("should trim text exceeding character limits", () => {
    const data: SonnetCopyData = {
      hero_headline: "これは30文字を超える非常に長いヘッドラインテキストです。さらに長くします。",
      cta_text: "短いCTA",
    };

    const result = validateAndTrim(data);

    expect((result.hero_headline || "").length).toBeLessThanOrEqual(30);
    expect(result.cta_text).toBe("短いCTA");
  });

  it("should not modify text within limits", () => {
    const data: SonnetCopyData = {
      hero_headline: "短いコピー",
      hero_sub: "サブコピーです",
    };

    const result = validateAndTrim(data);

    expect(result.hero_headline).toBe("短いコピー");
    expect(result.hero_sub).toBe("サブコピーです");
  });
});

describe("mapToTemplatePlaceholders", () => {
  const sonnetCopy: SonnetCopyData = {
    hero_headline: "テストヘッドライン",
    hero_sub: "テストサブ",
    benefit_1: "強み1",
    benefit_1_body: "強み1の説明",
    benefit_2: "強み2",
    benefit_2_body: "強み2の説明",
    benefit_3: "強み3",
    benefit_3_body: "強み3の説明",
    problem_1: "課題1",
    problem_1_body: "課題1の説明",
    problem_2: "課題2",
    problem_2_body: "課題2の説明",
    problem_3: "課題3",
    problem_3_body: "課題3の説明",
    cta_text: "無料相談",
    cta_sub: "今すぐ",
    about_description: "サービス概要",
    product_description: "サービス詳細",
  };

  it("should map template 1 placeholders correctly", () => {
    const [meta, copy] = mapToTemplatePlaceholders(
      sonnetCopy,
      baseExtractedData,
      1,
    );

    expect(meta["product_name"]).toBe("スマート営業くん");
    expect(meta["company_name"]).toBe("テスト株式会社");
    expect(copy["hero_headline"]).toBe("テストヘッドライン");
    expect(copy["point_text_3"]).toBe("強み1の説明");
    expect(copy["feature_3_desc"]).toBe("課題1の説明");
  });

  it("should map template 2 placeholders correctly", () => {
    const [meta, copy] = mapToTemplatePlaceholders(
      sonnetCopy,
      baseExtractedData,
      2,
    );

    expect(meta["site_name"]).toBe("スマート営業くん");
    expect(copy["hero_headline"]).toBe("テストヘッドライン");
    expect(copy["about_title"]).toBe("サービス概要");
    expect(copy["feature_0_title"]).toBe("強み1");
  });

  it("should map template 3 placeholders correctly", () => {
    const [meta, copy] = mapToTemplatePlaceholders(
      sonnetCopy,
      baseExtractedData,
      3,
    );

    expect(meta["json_ld_script"]).toContain("schema.org");
    expect(copy["hero_headline"]).toBe("テストヘッドライン");
    expect(copy["about_problem_0"]).toBe("課題1");
    expect(copy["feature_0_title"]).toBe("強み1");
    expect(copy["support_0_title"]).toBe("導入実績200社以上");
    expect(copy["flow_0_title"]).toBe("お問い合わせ");
    expect(copy["form_label_email"]).toBe("メールアドレス");
  });

  it("should include common meta fields for all templates", () => {
    for (const templateId of [1, 2, 3] as const) {
      const [meta] = mapToTemplatePlaceholders(
        sonnetCopy,
        baseExtractedData,
        templateId,
      );

      expect(meta["product_name"]).toBe("スマート営業くん");
      expect(meta["company_name"]).toBe("テスト株式会社");
      expect(meta["og_title"]).toContain("スマート営業くん");
    }
  });
});

describe("SYSTEM_PROMPT_LP", () => {
  it("should contain required instructions", () => {
    expect(SYSTEM_PROMPT_LP).toContain("日本語");
    expect(SYSTEM_PROMPT_LP).toContain("hero_headline");
    expect(SYSTEM_PROMPT_LP).toContain("product_description");
  });
});

describe("INDUSTRY_DEFAULTS", () => {
  it("should have all expected industries", () => {
    const industries = Object.keys(INDUSTRY_DEFAULTS);
    expect(industries).toContain("士業");
    expect(industries).toContain("飲食・サロン");
    expect(industries).toContain("BtoBサービス");
    expect(industries).toContain("汎用");
  });
});
