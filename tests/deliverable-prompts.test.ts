/**
 * deliverable-prompts テスト
 * 6制作物のパーサー・バリデーション・プロンプト構築を検証
 */

import {
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
} from "../netlify/functions/lib/deliverable-prompts.js";
import type { ExtractedData } from "../netlify/functions/lib/types.js";

// ============================================================
// テストデータ
// ============================================================

const baseData: ExtractedData = {
  company_name: "テスト株式会社",
  service_name: "スマート営業くん",
  industry: "BtoBサービス",
  target_customer: "従業員50名以下の中小企業経営者",
  strengths: ["導入実績200社以上", "月額9,800円から", "専任サポート付き"],
  pain_points: ["営業が属人化", "リード獲得コスト高"],
  price_range: "月額9,800円〜",
  phone: "03-1234-5678",
};

// ============================================================
// ユーティリティ関数テスト
// ============================================================

describe("extractTag", () => {
  it("should extract content from XML tag", () => {
    const text = "<hero>テスト見出し</hero>";
    expect(extractTag(text, "hero")).toBe("テスト見出し");
  });

  it("should return empty string for missing tag", () => {
    expect(extractTag("no tags here", "missing")).toBe("");
  });

  it("should strip HTML tags except br", () => {
    const text = "<hero><strong>太字</strong>テスト<br/>改行</hero>";
    expect(extractTag(text, "hero")).toBe("太字テスト<br/>改行");
  });

  it("should handle multiline content", () => {
    const text = "<body>\n行1\n行2\n</body>";
    expect(extractTag(text, "body")).toBe("行1\n行2");
  });
});

describe("trimToLimit", () => {
  it("should not trim text within limit", () => {
    expect(trimToLimit("短い", 10)).toBe("短い");
  });

  it("should trim text exceeding limit", () => {
    const long = "あ".repeat(50);
    const result = trimToLimit(long, 20);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("should prefer cutting at punctuation", () => {
    const text = "これは長いテキストです。ここで切りたい。さらに続く文章";
    const result = trimToLimit(text, 20);
    expect(result.endsWith("。") || result.length <= 20).toBe(true);
  });
});

describe("parseBulletList", () => {
  it("should parse bullet list with hyphens", () => {
    const text = "- 項目1\n- 項目2\n- 項目3";
    expect(parseBulletList(text)).toEqual(["項目1", "項目2", "項目3"]);
  });

  it("should parse bullet list with asterisks", () => {
    const text = "* 項目A\n* 項目B";
    expect(parseBulletList(text)).toEqual(["項目A", "項目B"]);
  });

  it("should filter empty lines", () => {
    const text = "- 項目1\n\n- 項目2\n  \n- 項目3";
    expect(parseBulletList(text)).toEqual(["項目1", "項目2", "項目3"]);
  });
});

describe("validateRequiredFields", () => {
  it("should pass for valid data", () => {
    expect(() => {
      validateRequiredFields(baseData, ["company_name", "service_name"]);
    }).not.toThrow();
  });

  it("should throw for missing fields", () => {
    const data: ExtractedData = {
      ...baseData,
      company_name: "",
    };
    expect(() => {
      validateRequiredFields(data, ["company_name"]);
    }).toThrow("company_name");
  });
});

// ============================================================
// 制作物1: Meta広告クリエイティブ
// ============================================================

describe("Ad Creative", () => {
  const mockAdResponse = `
<ad_A_primary>こんなお悩みありませんか？営業が属人化して困っている経営者の方へ</ad_A_primary>
<ad_A_headline>営業DXで売上30%アップ</ad_A_headline>
<ad_A_description>スマート営業くんで業務効率化</ad_A_description>
<ad_A_image_direction>困っている表情の経営者と、解決後の笑顔を対比したビジュアル</ad_A_image_direction>
<ad_B_primary>導入実績200社以上！平均売上30%アップを実現したスマート営業くん</ad_B_primary>
<ad_B_headline>200社が選んだ営業DXツール</ad_B_headline>
<ad_B_description>月額9,800円から導入可能</ad_B_description>
<ad_B_image_direction>実績グラフと導入企業ロゴを配置した信頼感のあるデザイン</ad_B_image_direction>
<ad_C_primary>今だけ初月無料！スマート営業くんで営業効率を劇的に改善しませんか</ad_C_primary>
<ad_C_headline>期間限定：初月完全無料キャンペーン</ad_C_headline>
<ad_C_description>残り枠わずか！今すぐ申込</ad_C_description>
<ad_C_image_direction>カウントダウンタイマーと「今だけ」バッジを目立たせたデザイン</ad_C_image_direction>`;

  describe("parseAdResponse", () => {
    it("should parse 3 patterns from response", () => {
      const result = parseAdResponse(mockAdResponse);
      expect(result.patterns).toHaveLength(3);
    });

    it("should parse pattern A fields correctly", () => {
      const result = parseAdResponse(mockAdResponse);
      const patternA = result.patterns[0];
      expect(patternA).toBeDefined();
      expect(patternA!.primary).toContain("お悩み");
      expect(patternA!.headline).toContain("営業DX");
      expect(patternA!.description).toContain("スマート営業くん");
      expect(patternA!.image_direction).toContain("経営者");
    });

    it("should trim fields exceeding character limits", () => {
      const longResponse = `
<ad_A_primary>${"あ".repeat(200)}</ad_A_primary>
<ad_A_headline>${"い".repeat(60)}</ad_A_headline>
<ad_A_description>${"う".repeat(50)}</ad_A_description>
<ad_A_image_direction>${"え".repeat(150)}</ad_A_image_direction>
<ad_B_primary>B</ad_B_primary>
<ad_B_headline>B</ad_B_headline>
<ad_B_description>B</ad_B_description>
<ad_B_image_direction>B</ad_B_image_direction>
<ad_C_primary>C</ad_C_primary>
<ad_C_headline>C</ad_C_headline>
<ad_C_description>C</ad_C_description>
<ad_C_image_direction>C</ad_C_image_direction>`;

      const result = parseAdResponse(longResponse);
      const p = result.patterns[0];
      expect(p!.primary.length).toBeLessThanOrEqual(125);
      expect(p!.headline.length).toBeLessThanOrEqual(40);
      expect(p!.description.length).toBeLessThanOrEqual(30);
      expect(p!.image_direction.length).toBeLessThanOrEqual(100);
    });
  });

  describe("validateAdResult", () => {
    it("should pass for valid result", () => {
      const result = parseAdResponse(mockAdResponse);
      expect(() => validateAdResult(result)).not.toThrow();
    });

    it("should throw for empty pattern fields", () => {
      const emptyResult = parseAdResponse("<nothing/>");
      expect(() => validateAdResult(emptyResult)).toThrow();
    });
  });

  describe("buildAdUserPrompt", () => {
    it("should include all required fields", () => {
      const prompt = buildAdUserPrompt(baseData);
      expect(prompt).toContain("スマート営業くん");
      expect(prompt).toContain("従業員50名以下");
      expect(prompt).toContain("営業が属人化");
      expect(prompt).toContain("導入実績200社以上");
      expect(prompt).toContain("BtoBサービス");
    });
  });
});

// ============================================================
// 制作物2: チラシ
// ============================================================

describe("Flyer", () => {
  const mockFlyerResponse = `
<flyer_headline>売上を伸ばす秘訣</flyer_headline>
<flyer_sub>中小企業のための営業DXツール</flyer_sub>
<flyer_point_1>導入実績200社以上</flyer_point_1>
<flyer_point_2>月額9,800円から</flyer_point_2>
<flyer_point_3>専任サポート付き</flyer_point_3>
<flyer_cta>今すぐ無料相談</flyer_cta>
<flyer_detail>スマート営業くんは中小企業の営業効率化を支援するクラウドツールです。リード管理から商談フォローまで一気通貫でサポートします。</flyer_detail>
<flyer_flow_1>お問い合わせ</flyer_flow_1>
<flyer_flow_2>無料デモ体験</flyer_flow_2>
<flyer_flow_3>導入開始</flyer_flow_3>`;

  describe("parseFlyerResponse", () => {
    it("should parse front and back sections", () => {
      const result = parseFlyerResponse(mockFlyerResponse);
      expect(result.front.headline).toBe("売上を伸ばす秘訣");
      expect(result.front.sub).toContain("営業DXツール");
      expect(result.front.points).toHaveLength(3);
      expect(result.front.cta).toBe("今すぐ無料相談");
      expect(result.back.detail).toContain("スマート営業くん");
      expect(result.back.flow).toHaveLength(3);
    });

    it("should trim fields exceeding limits", () => {
      const longResponse = `
<flyer_headline>${"あ".repeat(30)}</flyer_headline>
<flyer_sub>サブ</flyer_sub>
<flyer_point_1>ポイント</flyer_point_1>
<flyer_point_2>ポイント</flyer_point_2>
<flyer_point_3>ポイント</flyer_point_3>
<flyer_cta>CTA</flyer_cta>
<flyer_detail>詳細</flyer_detail>
<flyer_flow_1>ステップ1</flyer_flow_1>
<flyer_flow_2>ステップ2</flyer_flow_2>
<flyer_flow_3>ステップ3</flyer_flow_3>`;

      const result = parseFlyerResponse(longResponse);
      expect(result.front.headline.length).toBeLessThanOrEqual(20);
    });
  });

  describe("validateFlyerResult", () => {
    it("should pass for valid result", () => {
      const result = parseFlyerResponse(mockFlyerResponse);
      expect(() => validateFlyerResult(result)).not.toThrow();
    });

    it("should throw when headline is empty", () => {
      const result = parseFlyerResponse("<nothing/>");
      expect(() => validateFlyerResult(result)).toThrow("メインコピー");
    });
  });

  describe("buildFlyerUserPrompt", () => {
    it("should include company and service info", () => {
      const prompt = buildFlyerUserPrompt(baseData);
      expect(prompt).toContain("テスト株式会社");
      expect(prompt).toContain("スマート営業くん");
      expect(prompt).toContain("月額9,800円〜");
    });

    it("should add strength expansion instruction when strengths are few", () => {
      const fewStrengths: ExtractedData = {
        ...baseData,
        strengths: ["唯一の強み"],
      };
      const prompt = buildFlyerUserPrompt(fewStrengths);
      expect(prompt).toContain("強みを拡張");
    });
  });
});

// ============================================================
// 制作物3: ヒアリングフォーム
// ============================================================

describe("Hearing Form", () => {
  const mockHearingResponse = `[
    {"q": "現在の集客方法は？", "type": "select", "options": ["Web", "紹介", "広告"], "priority": 1},
    {"q": "月間問い合わせ数は？", "type": "select", "options": ["1-10件", "11-30件", "31件以上"], "priority": 2},
    {"q": "課題を教えてください", "type": "text", "priority": 3},
    {"q": "予算はどのくらい？", "type": "select", "options": ["10万以下", "10-50万", "50万以上"], "priority": 4},
    {"q": "導入時期は？", "type": "date", "priority": 5}
  ]`;

  describe("parseHearingResponse", () => {
    it("should parse JSON array of questions", () => {
      const result = parseHearingResponse(mockHearingResponse);
      expect(result.questions).toHaveLength(5);
      expect(result.questions[0]!.q).toBe("現在の集客方法は？");
      expect(result.questions[0]!.type).toBe("select");
      expect(result.questions[0]!.options).toEqual(["Web", "紹介", "広告"]);
    });

    it("should handle response with extra text", () => {
      const withExtraText = `ここに質問リストを出力します：\n${mockHearingResponse}\n以上です。`;
      const result = parseHearingResponse(withExtraText);
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it("should default to text type for invalid type", () => {
      const response = '[{"q": "質問", "type": "invalid", "priority": 1}]';
      const result = parseHearingResponse(response);
      expect(result.questions[0]!.type).toBe("text");
    });

    it("should throw for non-JSON response", () => {
      expect(() => parseHearingResponse("not json")).toThrow("JSONパース");
    });
  });

  describe("validateHearingResult", () => {
    it("should pass for valid result", () => {
      const result = parseHearingResponse(mockHearingResponse);
      expect(() => validateHearingResult(result)).not.toThrow();
    });

    it("should throw for empty questions", () => {
      expect(() => validateHearingResult({ questions: [] })).toThrow("空です");
    });

    it("should throw for select without options", () => {
      const badResult = {
        questions: [{ q: "質問", type: "select" as const, priority: 1 }],
      };
      expect(() => validateHearingResult(badResult)).toThrow("選択肢");
    });
  });

  describe("getHearingPreset", () => {
    it("should return preset for known industry", () => {
      const preset = getHearingPreset("士業");
      expect(preset.length).toBe(10);
      expect(preset[0]!.q).toContain("集客");
    });

    it("should return generic preset for unknown industry", () => {
      const preset = getHearingPreset("宇宙産業");
      expect(preset.length).toBe(10);
    });

    it("should match partial industry name", () => {
      const preset = getHearingPreset("BtoBサービス");
      expect(preset[0]!.q).toContain("サービス");
    });
  });

  describe("HEARING_PRESETS", () => {
    it("should have at least 5 industries", () => {
      const industries = Object.keys(HEARING_PRESETS);
      expect(industries.length).toBeGreaterThanOrEqual(5);
    });

    it("should have 10 questions per industry", () => {
      for (const [industry, questions] of Object.entries(HEARING_PRESETS)) {
        expect(questions).toHaveLength(10);
        // verify each question has required fields
        for (const q of questions) {
          expect(q.q).toBeTruthy();
          expect(q.type).toBeTruthy();
        }
      }
    });
  });
});

// ============================================================
// 制作物4: LINE導線設計書
// ============================================================

describe("LINE Design", () => {
  const mockLineResponse = `
<line_day0>友だち追加ありがとうございます！スマート営業くんの公式LINEです。</line_day0>
<line_day1>営業効率化の3つのポイントをご紹介します。まずは現状把握が大切です。</line_day1>
<line_day3>導入企業A社様の事例：営業工数50%削減に成功！</line_day3>
<line_day5>こんな課題ありませんか？営業の属人化、解決策をお伝えします。</line_day5>
<line_day7>今なら初月無料！まずは無料デモをお試しください。</line_day7>
<line_strategy>段階的に信頼構築し、Day7でオファーに誘導。価値提供を先行させる。</line_strategy>`;

  describe("parseLineResponse", () => {
    it("should parse 5 day messages and strategy", () => {
      const result = parseLineResponse(mockLineResponse);
      expect(result.days).toHaveLength(5);
      expect(result.days[0]!.day).toBe(0);
      expect(result.days[0]!.message).toContain("友だち追加");
      expect(result.days[4]!.day).toBe(7);
      expect(result.strategy).toContain("信頼構築");
    });

    it("should trim messages exceeding 100 characters", () => {
      const longResponse = `
<line_day0>${"あ".repeat(150)}</line_day0>
<line_day1>短い</line_day1>
<line_day3>短い</line_day3>
<line_day5>短い</line_day5>
<line_day7>短い</line_day7>
<line_strategy>戦略</line_strategy>`;

      const result = parseLineResponse(longResponse);
      expect(result.days[0]!.message.length).toBeLessThanOrEqual(100);
    });

    it("should trim strategy exceeding 200 characters", () => {
      const longResponse = `
<line_day0>メッセージ</line_day0>
<line_day1>メッセージ</line_day1>
<line_day3>メッセージ</line_day3>
<line_day5>メッセージ</line_day5>
<line_day7>メッセージ</line_day7>
<line_strategy>${"あ".repeat(300)}</line_strategy>`;

      const result = parseLineResponse(longResponse);
      expect(result.strategy.length).toBeLessThanOrEqual(200);
    });
  });

  describe("validateLineResult", () => {
    it("should pass for valid result", () => {
      const result = parseLineResponse(mockLineResponse);
      expect(() => validateLineResult(result)).not.toThrow();
    });

    it("should throw when majority of messages are empty", () => {
      const emptyResult = parseLineResponse("<nothing/>");
      expect(() => validateLineResult(emptyResult)).toThrow("半数以上が空");
    });
  });

  describe("buildLineUserPrompt", () => {
    it("should include service and target info", () => {
      const prompt = buildLineUserPrompt(baseData);
      expect(prompt).toContain("スマート営業くん");
      expect(prompt).toContain("従業員50名以下");
      expect(prompt).toContain("導入実績200社以上");
    });
  });
});

// ============================================================
// 制作物5: 議事録
// ============================================================

describe("Minutes", () => {
  const mockMinutesResponse = `
<summary>テスト株式会社との商談。営業DXツールの導入について協議。現状の課題確認と提案方針を合意した。</summary>
<key_points>
- 現在の営業は属人化が深刻で、トップ営業退職リスクがある
- 月間リード数は約50件だが成約率が10%以下
- 予算は月額10万円程度を想定
</key_points>
<actions>
- [営業担当] 導入提案書の作成 (3月15日まで)
- [技術担当] デモ環境の準備 (3月10日まで)
- [先方] 社内稟議の事前確認 (3月20日まで)
</actions>
<next_meeting>3月25日 14:00 オンライン</next_meeting>
<upsell_notes>チャットボット連携にも興味あり。カスタマイズ開発のニーズが見込める。</upsell_notes>`;

  describe("parseMinutesResponse", () => {
    it("should parse all sections", () => {
      const result = parseMinutesResponse(mockMinutesResponse);
      expect(result.summary).toContain("テスト株式会社");
      expect(result.key_points).toHaveLength(3);
      expect(result.actions).toHaveLength(3);
      expect(result.next_meeting).toContain("3月25日");
      expect(result.upsell_notes).toContain("チャットボット");
    });

    it("should parse key_points as bullet list", () => {
      const result = parseMinutesResponse(mockMinutesResponse);
      expect(result.key_points[0]).toContain("属人化");
      expect(result.key_points[1]).toContain("リード数");
    });

    it("should parse actions with assignee and deadline", () => {
      const result = parseMinutesResponse(mockMinutesResponse);
      expect(result.actions[0]).toContain("営業担当");
      expect(result.actions[0]).toContain("3月15日");
    });

    it("should trim summary exceeding 200 characters", () => {
      const longResponse = `<summary>${"あ".repeat(300)}</summary>
<key_points>- ポイント</key_points>
<actions>- アクション</actions>
<next_meeting>未定</next_meeting>
<upsell_notes>なし</upsell_notes>`;

      const result = parseMinutesResponse(longResponse);
      expect(result.summary.length).toBeLessThanOrEqual(200);
    });
  });

  describe("validateMinutesResult", () => {
    it("should pass for valid result", () => {
      const result = parseMinutesResponse(mockMinutesResponse);
      expect(() => validateMinutesResult(result)).not.toThrow();
    });

    it("should throw when summary is empty", () => {
      const emptyResult = parseMinutesResponse("<nothing/>");
      expect(() => validateMinutesResult(emptyResult)).toThrow("要約が空");
    });
  });

  describe("buildMinutesUserPrompt", () => {
    it("should include transcript and company name", () => {
      const prompt = buildMinutesUserPrompt("会話内容", baseData);
      expect(prompt).toContain("テスト株式会社");
      expect(prompt).toContain("会話内容");
    });
  });
});

// ============================================================
// 制作物6: プロフィール
// ============================================================

describe("Profile", () => {
  const mockProfileResponse = `{
    "title": "テスト株式会社",
    "service": "スマート営業くん",
    "strengths": ["導入実績200社以上", "月額9,800円から", "専任サポート付き"],
    "target": "従業員50名以下の中小企業経営者",
    "contact": { "phone": "03-1234-5678", "email": "info@test.co.jp", "line": "@smart-sales" }
  }`;

  describe("parseProfileResponse", () => {
    it("should parse JSON profile data", () => {
      const result = parseProfileResponse(mockProfileResponse);
      expect(result.title).toBe("テスト株式会社");
      expect(result.service).toBe("スマート営業くん");
      expect(result.strengths).toHaveLength(3);
      expect(result.target).toContain("中小企業");
      expect(result.contact.phone).toBe("03-1234-5678");
      expect(result.contact.email).toBe("info@test.co.jp");
      expect(result.contact.line).toBe("@smart-sales");
    });

    it("should handle response with extra text", () => {
      const withText = `プロフィールデータ：\n${mockProfileResponse}\n以上です。`;
      const result = parseProfileResponse(withText);
      expect(result.title).toBe("テスト株式会社");
    });

    it("should handle missing contact fields", () => {
      const noContact = '{"title": "テスト", "service": "サービス", "strengths": ["強み"], "target": "ターゲット"}';
      const result = parseProfileResponse(noContact);
      expect(result.contact.phone).toBe("");
      expect(result.contact.email).toBe("");
    });

    it("should throw for non-JSON response", () => {
      expect(() => parseProfileResponse("not json")).toThrow("JSONパース");
    });
  });

  describe("validateProfileResult", () => {
    it("should pass for valid result", () => {
      const result = parseProfileResponse(mockProfileResponse);
      expect(() => validateProfileResult(result)).not.toThrow();
    });

    it("should throw when title is empty", () => {
      const noTitle = '{"title": "", "service": "サービス", "strengths": [], "target": ""}';
      const result = parseProfileResponse(noTitle);
      expect(() => validateProfileResult(result)).toThrow("タイトル");
    });

    it("should throw when service is empty", () => {
      const noService = '{"title": "タイトル", "service": "", "strengths": [], "target": ""}';
      const result = parseProfileResponse(noService);
      expect(() => validateProfileResult(result)).toThrow("サービス名");
    });
  });

  describe("buildProfileUserPrompt", () => {
    it("should include company info and contact", () => {
      const prompt = buildProfileUserPrompt(baseData);
      expect(prompt).toContain("テスト株式会社");
      expect(prompt).toContain("スマート営業くん");
      expect(prompt).toContain("03-1234-5678");
    });
  });
});

// ============================================================
// システムプロンプト検証
// ============================================================

describe("System Prompts", () => {
  it("SYSTEM_PROMPT_AD should contain pattern instructions", () => {
    expect(SYSTEM_PROMPT_AD).toContain("パターンA");
    expect(SYSTEM_PROMPT_AD).toContain("パターンB");
    expect(SYSTEM_PROMPT_AD).toContain("パターンC");
    expect(SYSTEM_PROMPT_AD).toContain("ad_A_primary");
  });

  it("SYSTEM_PROMPT_FLYER should contain front and back instructions", () => {
    expect(SYSTEM_PROMPT_FLYER).toContain("表面");
    expect(SYSTEM_PROMPT_FLYER).toContain("裏面");
    expect(SYSTEM_PROMPT_FLYER).toContain("flyer_headline");
    expect(SYSTEM_PROMPT_FLYER).toContain("flyer_detail");
  });

  it("SYSTEM_PROMPT_HEARING should contain JSON format instruction", () => {
    expect(SYSTEM_PROMPT_HEARING).toContain("JSON");
    expect(SYSTEM_PROMPT_HEARING).toContain("text|select|scale|date");
  });

  it("SYSTEM_PROMPT_LINE should contain day tags", () => {
    expect(SYSTEM_PROMPT_LINE).toContain("line_day0");
    expect(SYSTEM_PROMPT_LINE).toContain("line_day7");
    expect(SYSTEM_PROMPT_LINE).toContain("line_strategy");
  });

  it("SYSTEM_PROMPT_MINUTES should contain all output sections", () => {
    expect(SYSTEM_PROMPT_MINUTES).toContain("summary");
    expect(SYSTEM_PROMPT_MINUTES).toContain("key_points");
    expect(SYSTEM_PROMPT_MINUTES).toContain("actions");
    expect(SYSTEM_PROMPT_MINUTES).toContain("next_meeting");
    expect(SYSTEM_PROMPT_MINUTES).toContain("upsell_notes");
  });

  it("SYSTEM_PROMPT_PROFILE should contain JSON output format", () => {
    expect(SYSTEM_PROMPT_PROFILE).toContain("JSON");
    expect(SYSTEM_PROMPT_PROFILE).toContain("title");
    expect(SYSTEM_PROMPT_PROFILE).toContain("contact");
  });
});
