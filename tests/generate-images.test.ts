/**
 * generate-images テスト
 *
 * updateHtmlWithImages のHTML変換ロジックを中心にテスト。
 * 外部API依存のハンドラーテストはCORS/バリデーションのみ検証。
 */

import { updateHtmlWithImages } from "../netlify/functions/generate-images.js";

// ============================================================
// updateHtmlWithImages テスト
// ============================================================

describe("updateHtmlWithImages", () => {
  it("should add hero background-image to fv section without existing style", () => {
    const html = '<section class="fv"><div class="fv-overlay"></div></section>';
    const result = updateHtmlWithImages(html, {
      hero: "/.netlify/blobs/images/sess1/hero.webp",
    });

    expect(result).toContain(
      "style=\"background-image:url('/.netlify/blobs/images/sess1/hero.webp')\"",
    );
    expect(result).toContain('class="fv"');
  });

  it("should replace existing hero background-image in fv section", () => {
    const html =
      '<section class="fv" style="background-image:url(\'https://images.unsplash.com/photo-abc?w=1600&h=1000\')"><div class="fv-overlay"></div></section>';
    const result = updateHtmlWithImages(html, {
      hero: "/.netlify/blobs/images/sess1/hero.webp",
    });

    expect(result).toContain(
      "background-image:url('/.netlify/blobs/images/sess1/hero.webp')",
    );
    expect(result).not.toContain("unsplash");
  });

  it("should add background-image to data-img elements without style", () => {
    const html = '<div data-img="about" class="img-slot"></div>';
    const result = updateHtmlWithImages(html, {
      about: "/.netlify/blobs/images/sess1/about.webp",
    });

    expect(result).toContain(
      "style=\"background-image:url('/.netlify/blobs/images/sess1/about.webp')\"",
    );
  });

  it("should append background-image to data-img elements with existing style", () => {
    const html =
      '<div data-img="about" class="img-slot" style="width:100%"></div>';
    const result = updateHtmlWithImages(html, {
      about: "/.netlify/blobs/images/sess1/about.webp",
    });

    expect(result).toContain("width:100%");
    expect(result).toContain(
      "background-image:url('/.netlify/blobs/images/sess1/about.webp')",
    );
  });

  it("should handle multiple image replacements", () => {
    const html = `
<section class="fv"><div class="fv-overlay"></div></section>
<div data-img="about" style="height:200px"></div>
<div data-img="badge"></div>
    `.trim();

    const result = updateHtmlWithImages(html, {
      hero: "/img/hero.webp",
      about: "/img/about.webp",
      badge: "/img/badge.webp",
    });

    expect(result).toContain("background-image:url('/img/hero.webp')");
    expect(result).toContain("background-image:url('/img/about.webp')");
    expect(result).toContain("background-image:url('/img/badge.webp')");
  });

  it("should not modify HTML when no images provided", () => {
    const html = '<section class="fv"><div></div></section>';
    const result = updateHtmlWithImages(html, {});

    expect(result).toBe(html);
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

  it("should skip hero key in data-img processing", () => {
    const html =
      '<section class="fv"></section><div data-img="about"></div>';
    const result = updateHtmlWithImages(html, {
      hero: "/img/hero.webp",
      about: "/img/about.webp",
    });

    expect(result).toContain(
      '<section class="fv" style="background-image:url(\'/img/hero.webp\')"',
    );
    expect(result).toContain(
      "data-img=\"about\" style=\"background-image:url('/img/about.webp')\"",
    );
  });

  it("should handle multiple data-img elements of same section", () => {
    const html = `
<div data-img="reason1" class="a"></div>
<div data-img="reason1" class="b"></div>
    `.trim();

    const result = updateHtmlWithImages(html, {
      reason1: "/img/reason1.webp",
    });

    const matches = result.match(/background-image:url\('\/img\/reason1\.webp'\)/g);
    expect(matches).toHaveLength(2);
  });

  it("should preserve existing fv section style when replacing background-image", () => {
    const html =
      '<section class="fv" style="background-image:url(\'old.jpg\')"><div></div></section>';
    const result = updateHtmlWithImages(html, {
      hero: "/img/new-hero.webp",
    });

    expect(result).toContain("background-image:url('/img/new-hero.webp')");
    expect(result).not.toContain("old.jpg");
  });
});
