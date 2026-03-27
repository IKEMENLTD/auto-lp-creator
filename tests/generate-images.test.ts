/**
 * generate-images テスト
 *
 * updateHtmlWithImages のHTML変換ロジックを中心にテスト。
 * 外部API依存のハンドラーテストはCORS/バリデーションのみ検証。
 */

import { updateHtmlWithImages } from "../netlify/functions/generate-images-background.js";

// ============================================================
// updateHtmlWithImages テスト
// ============================================================

describe("updateHtmlWithImages", () => {
  // ---- hero (fvセクション) ----

  it("should add hero background-image to fv section without fv-bg div", () => {
    const html = '<section class="fv"><div class="fv-overlay"></div></section>';
    const result = updateHtmlWithImages(html, {
      hero: "/img/hero.webp",
    });

    expect(result).toContain("style=\"background-image:url('/img/hero.webp')\"");
    expect(result).toContain('class="fv"');
  });

  it("should replace hero background-image via fv-bg div", () => {
    const html =
      '<section class="fv"><div class="fv-bg" style="background-image:url(https://images.unsplash.com/photo-abc)"></div></section>';
    const result = updateHtmlWithImages(html, {
      hero: "/img/hero.webp",
    });

    expect(result).toContain("background-image:url('/img/hero.webp')");
    expect(result).not.toContain("unsplash");
  });

  it("should handle hero section with extra attributes", () => {
    const html =
      '<section class="fv" id="hero" data-anim="fade"><div class="fv-overlay"></div></section>';
    const result = updateHtmlWithImages(html, {
      hero: "/img/hero.webp",
    });

    expect(result).toContain('class="fv"');
    expect(result).toContain("background-image:url('/img/hero.webp')");
    expect(result).toContain('id="hero"');
  });

  it("should preserve existing fv section style when replacing via fv-bg", () => {
    const html =
      '<section class="fv"><div class="fv-bg" style="background-image:url(old.jpg)"></div></section>';
    const result = updateHtmlWithImages(html, {
      hero: "/img/new-hero.webp",
    });

    expect(result).toContain("background-image:url('/img/new-hero.webp')");
    expect(result).not.toContain("old.jpg");
  });

  // ---- 非heroセクション (img[data-img] の src 差し替え) ----

  it("should replace src on img with data-img attribute", () => {
    const html = '<img data-img="about" src="placeholder.jpg" class="img-slot" />';
    const result = updateHtmlWithImages(html, {
      about: "/img/about.webp",
    });

    expect(result).toContain('src="/img/about.webp"');
    expect(result).not.toContain("placeholder.jpg");
  });

  it("should replace src on multiple img elements with same data-img", () => {
    const html = `
<img data-img="reason1" src="old1.jpg" class="a" />
<img data-img="reason1" src="old2.jpg" class="b" />
    `.trim();

    const result = updateHtmlWithImages(html, {
      reason1: "/img/reason1.webp",
    });

    const matches = result.match(/src="\/img\/reason1\.webp"/g);
    expect(matches).toHaveLength(2);
  });

  it("should handle hero + non-hero image replacements together", () => {
    const html = `
<section class="fv"><div class="fv-overlay"></div></section>
<img data-img="about" src="old.jpg" />
    `.trim();

    const result = updateHtmlWithImages(html, {
      hero: "/img/hero.webp",
      about: "/img/about.webp",
    });

    expect(result).toContain("background-image:url('/img/hero.webp')");
    expect(result).toContain('src="/img/about.webp"');
  });

  it("should remove display:none from img after src replacement", () => {
    const html = '<img data-img="about" src="placeholder.jpg" style="display:none" />';
    const result = updateHtmlWithImages(html, {
      about: "/img/about.webp",
    });

    expect(result).toContain('src="/img/about.webp"');
    expect(result).not.toContain("display:none");
  });

  it("should skip hero key in data-img processing (hero uses fv section)", () => {
    const html =
      '<section class="fv"></section><img data-img="about" src="old.jpg" />';
    const result = updateHtmlWithImages(html, {
      hero: "/img/hero.webp",
      about: "/img/about.webp",
    });

    expect(result).toContain("background-image:url('/img/hero.webp')");
    expect(result).toContain('src="/img/about.webp"');
  });

  // ---- エッジケース ----

  it("should not modify HTML when no images provided", () => {
    const html = '<section class="fv"><div></div></section>';
    const result = updateHtmlWithImages(html, {});

    expect(result).toBe(html);
  });

  it("should not modify HTML when data-img element has no src attribute", () => {
    const html = '<div data-img="about" class="img-slot"></div>';
    const result = updateHtmlWithImages(html, {
      about: "/img/about.webp",
    });

    // div (not img) with data-img won't match the img pattern
    expect(result).toBe(html);
  });
});
