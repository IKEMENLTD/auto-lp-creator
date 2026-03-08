/**
 * replace-engine テスト
 */

import {
  replaceHeadPlaceholders,
  replaceBodyPlaceholders,
  replaceAll,
  scanTemplate,
} from "../netlify/functions/lib/replace-engine.js";

describe("replaceHeadPlaceholders", () => {
  it("should replace {{variable}} placeholders with provided data", () => {
    const html = "<title>{{product_name}} | {{company_name}}</title>";
    const data = { product_name: "テストサービス", company_name: "テスト株式会社" };

    const [result, unreplaced] = replaceHeadPlaceholders(html, data);

    expect(result).toBe("<title>テストサービス | テスト株式会社</title>");
    expect(unreplaced).toHaveLength(0);
  });

  it("should leave unknown placeholders and report them", () => {
    const html = "<meta content='{{og_image}}' /><title>{{product_name}}</title>";
    const data = { product_name: "サービス" };

    const [result, unreplaced] = replaceHeadPlaceholders(html, data);

    expect(result).toContain("{{og_image}}");
    expect(result).toContain("サービス");
    expect(unreplaced).toEqual(["og_image"]);
  });

  it("should handle empty data gracefully", () => {
    const html = "{{a}} {{b}} {{c}}";
    const [result, unreplaced] = replaceHeadPlaceholders(html, {});

    expect(result).toBe("{{a}} {{b}} {{c}}");
    expect(unreplaced).toEqual(["a", "b", "c"]);
  });
});

describe("replaceBodyPlaceholders", () => {
  it("should replace data-placeholder content", () => {
    const html = '<h1 data-placeholder="hero_headline">古いテキスト</h1>';
    const copyData = { hero_headline: "新しいヘッドライン" };

    const [result, unreplaced] = replaceBodyPlaceholders(html, copyData);

    expect(result).toBe('<h1 data-placeholder="hero_headline">新しいヘッドライン</h1>');
    expect(unreplaced).toHaveLength(0);
  });

  it("should handle multiple placeholders", () => {
    const html =
      '<h1 data-placeholder="title">old</h1>' +
      '<p data-placeholder="desc">old desc</p>';
    const copyData = { title: "新タイトル", desc: "新説明" };

    const [result, unreplaced] = replaceBodyPlaceholders(html, copyData);

    expect(result).toContain("新タイトル");
    expect(result).toContain("新説明");
    expect(unreplaced).toHaveLength(0);
  });

  it("should leave unmatched placeholders and report them", () => {
    const html = '<p data-placeholder="missing_key">元のテキスト</p>';
    const [result, unreplaced] = replaceBodyPlaceholders(html, {});

    expect(result).toContain("元のテキスト");
    expect(unreplaced).toEqual(["missing_key"]);
  });

  it("should handle placeholders with attributes", () => {
    const html =
      '<span class="text" data-placeholder="hero_sub" id="sub">古いサブ</span>';
    const copyData = { hero_sub: "新しいサブ" };

    const [result, unreplaced] = replaceBodyPlaceholders(html, copyData);

    expect(result).toContain("新しいサブ");
    expect(unreplaced).toHaveLength(0);
  });
});

describe("replaceAll", () => {
  it("should replace both meta and body placeholders", () => {
    const html =
      '<html><head><title>{{product_name}}</title></head>' +
      '<body><h1 data-placeholder="hero_headline">old</h1></body></html>';
    const metaData = { product_name: "サービスX" };
    const copyData = { hero_headline: "業務を変革する" };

    const result = replaceAll(html, metaData, copyData);

    expect(result.html).toContain("サービスX");
    expect(result.html).toContain("業務を変革する");
    expect(result.stats.meta_replaced).toBe(1);
    expect(result.stats.body_replaced).toBe(1);
  });

  it("should return stats with correct counts", () => {
    const html =
      "{{a}} {{b}} {{c}}" +
      '<p data-placeholder="x">old</p>' +
      '<p data-placeholder="y">old</p>';
    const metaData = { a: "A", b: "B" };
    const copyData = { x: "X" };

    const result = replaceAll(html, metaData, copyData);

    expect(result.stats.meta_replaced).toBe(2);
    expect(result.stats.body_replaced).toBe(1);
    // "c" is in the template but not in metaData, so it's unreplaced
    expect(result.meta_unreplaced).toEqual(["c"]);
    expect(result.body_unreplaced).toEqual(["y"]);
  });
});

describe("scanTemplate", () => {
  it("should find all placeholders in template", () => {
    const html =
      "{{product_name}} {{company_name}} {{og_image}}" +
      '<h1 data-placeholder="hero">x</h1>' +
      '<p data-placeholder="desc">y</p>';

    const result = scanTemplate(html);

    expect(result.meta_placeholders).toEqual(["company_name", "og_image", "product_name"]);
    expect(result.body_placeholders).toEqual(["desc", "hero"]);
    expect(result.meta_count).toBe(3);
    expect(result.body_count).toBe(2);
  });

  it("should deduplicate placeholders", () => {
    const html = "{{name}} {{name}} {{name}}";
    const result = scanTemplate(html);

    expect(result.meta_placeholders).toEqual(["name"]);
    expect(result.meta_count).toBe(1);
  });

  it("should handle empty template", () => {
    const result = scanTemplate("<html></html>");

    expect(result.meta_count).toBe(0);
    expect(result.body_count).toBe(0);
  });
});
