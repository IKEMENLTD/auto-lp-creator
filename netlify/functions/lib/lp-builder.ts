/**
 * LP生成 - HTML構築
 */

import type { FlatData, LpContent, AdContent, MinutesContent, GenericContent } from "./lp-types";
import { esc, hexToRgb } from "./lp-types";
import { bizContext } from "./lp-prompts";
import { unsplashUrl, PHOTO_LIBRARY } from "./lp-images";
import { buildLpStyles } from "./lp-styles";

// Re-export for external consumers
export type { LpImage } from "./lp-images";
export { selectImages, unsplashUrl, PHOTO_LIBRARY } from "./lp-images";
export { bizContext };

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

export function sanitizePersonName(name: string | undefined, keyPersons: string[]): string {
  if (!name || name.trim().length === 0) return "";

  const trimmed = name.trim();

  if (keyPersons.some(kp => kp.includes(trimmed) || trimmed.includes(kp))) {
    const match = keyPersons
      .filter(kp => trimmed.includes(kp))
      .sort((a, b) => b.length - a.length)[0];
    if (match) return match;
  }

  if (trimmed.length > 6) {
    for (const kp of keyPersons) {
      if (trimmed.startsWith(kp) || kp.startsWith(trimmed.slice(0, 4))) {
        return kp;
      }
    }
    return trimmed.slice(0, 4);
  }

  return trimmed;
}

// ============================================================
// LP テーマ自動選択
// ============================================================

export type LpTheme = "dark" | "corporate";

export function selectTheme(d: FlatData): LpTheme {
  const industry = d.industry.toLowerCase();
  const service = d.service_name.toLowerCase();
  if (/コンサル|法律|会計|金融|保険|不動産|建設|製造|医療|IT|システム|SaaS|saas/.test(industry)) return "corporate";
  if (/システム|ツール|プラットフォーム|ソリューション|クラウド|管理/.test(service)) return "corporate";
  return "dark";
}

// ============================================================
// LP Step 3: Build HTML (高品質テンプレート)
// ============================================================

export function buildLpHtml(c: LpContent, d: FlatData, images: import("./lp-images").LpImage[] = [], theme: LpTheme = "dark"): string {
  const prob = c.problems || [];
  const str = c.strengths || [];
  const svc = c.services || [];
  const s = c.stats || [];
  const cmp = c.comparison || [];
  const cas = c.cases || [];
  const reasons = c.reasons || [];
  const useCases = c.use_cases || [];
  const columns = c.columns || [];
  const funcs = c.functions || [];
  const dm = c.dashboard_metrics || [{ label: "効率", pct: 85 }, { label: "削減", pct: 72 }, { label: "満足度", pct: 93 }];
  const f = c.flow || [];
  const faq = c.faq || [];
  const hf = c.hero_features || [];
  const badges = c.trust_badges || [];
  const colors = getDecoColors(d.industry);
  const hasImg = images.length > 0;
  const pName = sanitizePersonName(c.person_name, d.key_persons) || d.company_name;
  const pTitle = c.person_title || d.industry;
  const rawBrand = d.service_name || d.company_name;
  const brandName = rawBrand.replace(/[（(].+?[）)]/g, "").trim();
  const brandSub = (rawBrand.match(/[（(](.+?)[）)]/) || [])[1] || "";

  // CTAテキストから矢印記号を除去（arrowSvgとの二重表示防止）
  if (c.cta_text) c.cta_text = c.cta_text.replace(/[→>＞►▶➤➜➡⇒\s]+$/g, "").trim();

  // Award badge image (laurel wreath + No.1) - served as static asset
  const awardImg = "/images/award-01.png";

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
${buildLpStyles({ primary: colors.primary, gradient: colors.gradient, accent: colors.accent, cRgb, theme })}
</style>
</head><body>

<!-- HEADER -->
<header class="hd"><div class="hd-wrap">
<p class="hd-logo">${esc(brandName)}</p>
<nav class="hd-nav">
<a href="#about">${esc(brandName)}とは</a>
<a href="#features">できること</a>
${reasons.length > 0 ? '<a href="#reasons">選ばれる理由</a>' : ''}
${useCases.length > 0 ? '<a href="#usecases">活用シーン</a>' : ''}
${cas.length > 0 ? '<a href="#cases">導入事例</a>' : ''}
${funcs.length > 0 ? '<a href="#functions">主な機能</a>' : ''}
<a href="#contact" class="btn btn-md btn-accent">${esc(c.cta_text)}</a>
</nav>
</div></header>

<!-- HERO -->
<section class="fv">
${hasImg && images[0] ? `<div class="fv-bg" style="background-image:url('${esc(images[0].url.replace(/w=\d+/, "w=1600").replace(/h=\d+/, "h=1000"))}')"></div>` : ""}
<div class="inner">
<div class="fv-left">
<p class="fv-lead" style="font-size:${c.hero_headline.length <= 12 ? '40px' : c.hero_headline.length <= 20 ? '34px' : c.hero_headline.length <= 28 ? '28px' : '24px'}">${esc(c.hero_headline)}</p>
<p class="fv-service-label">${esc(d.industry)}</p>
<h1 class="fv-service-name">${esc(brandName)}${brandSub ? `<span class="fv-service-sub">${esc(brandSub)}</span>` : ""}</h1>
${badges.length > 0 ? `<div class="fv-awards"><div class="fv-award-row">${badges.slice(0, 2).map((b, i) => `<div class="fv-badge"><p class="fv-badge-cat">${esc(b)}</p><div class="fv-badge-img-wrap"><img class="fv-badge-img" src="${awardImg}" alt="No.1"><span class="fv-badge-note">※${i + 1}</span></div></div>`).join("")}</div><p class="fv-award-notes">※1※2 自社調べ</p></div>` : ""}
<div class="fv-btns">
<a href="#contact" class="btn btn-lg btn-accent">${esc(c.cta_text)}</a>
<a href="#features" class="btn btn-lg btn-outline-accent">詳しく見る</a>
</div>
</div>
<div class="fv-right">
<div class="hero-dash">
<div class="hero-dash-header"><span class="hero-dash-title">Dashboard</span><span class="hero-dash-badge">Live</span></div>
<div class="hero-dash-stats">${s.slice(0, 3).map(st => `<div class="hero-dash-stat"><div class="hero-dash-stat-num">${esc(st.number)}</div><div class="hero-dash-stat-label">${esc(st.label)}</div></div>`).join("")}</div>
<div class="hero-dash-bars">${dm.map((m, i) => `<div class="hero-dash-bar-row"><span class="hero-dash-bar-label">${esc(m.label)}</span><div class="hero-dash-bar-track"><div class="hero-dash-bar-fill b${i + 1}" style="width:${m.pct}%"></div></div><span class="hero-dash-bar-pct">${m.pct}%</span></div>`).join("")}</div>
<div class="hero-dash-footer"><span class="hero-dash-footer-dot"></span><span class="hero-dash-footer-text">リアルタイム更新中</span></div>
</div>
</div>
</div>
</section>

<!-- LOGO STRIP: 導入企業 -->
<div class="logo-strip">
<p class="logo-strip-label">多種多様な企業様に<br class="only-sp">ご利用いただいております</p>
<div class="logo-strip-list">
<span class="logo-strip-item"><img src="/images/logos/logo-01.png" alt="未来医療福祉コンソーシアム"></span>
<span class="logo-strip-item"><img src="/images/logos/logo-02.png" alt="VELOX.AI"></span>
<span class="logo-strip-item"><img src="/images/logos/logo-03.png" alt="INTEGRA LINK"></span>
<span class="logo-strip-item"><img src="/images/logos/logo-04.png" alt="ARCHETYPE SERVICES"></span>
</div>
</div>

<!-- BANNER -->
${columns.length >= 2 ? `<div class="banner-sec">
<ul class="banner-list">
${columns.slice(0, 2).map((col, i) => `<li class="banner-item">
<div class="banner-item-inner">
<div class="banner-item-text">
<h4>${esc(col.title)}</h4>
<span class="banner-item-cta">無料で資料ダウンロード</span>
</div>
<div class="banner-item-mockup">
<div class="banner-item-doc">
<p class="banner-item-doc-title">${esc(d.service_name)}<br>〜ダウンロード資料〜</p>
<div class="banner-item-doc-line"></div>
<div class="banner-item-doc-line"></div>
<div class="banner-item-doc-line"></div>
<div class="banner-item-doc-line"></div>
<div class="banner-item-doc-chart">
<div class="banner-item-doc-bar" style="height:10px"></div>
<div class="banner-item-doc-bar" style="height:18px"></div>
<div class="banner-item-doc-bar" style="height:14px"></div>
<div class="banner-item-doc-bar" style="height:22px"></div>
<div class="banner-item-doc-bar" style="height:16px"></div>
</div>
</div>
</div>
</div>
</li>`).join("")}
</ul>
</div>` : ""}

<!-- ABOUT: 〇〇とは（課題 + 解決アプローチ） -->
<section class="sec" id="about">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">About</p><p class="sec-eng">About</p><h2 class="sec-tit fi">${esc(d.service_name)}とは</h2></div>
${prob.length > 0 ? `<div class="about-pain fi">
${prob.map(item => `<span class="about-pain-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>${esc(item.title)}</span>`).join("")}
</div>` : ""}
<div class="about-grid fi">
<div class="about-img">
${hasImg && images[0] ? `<img src="${esc(images[0].url.replace(/w=\d+/, "w=800").replace(/h=\d+/, "h=600"))}" alt="${esc(d.service_name)}" loading="lazy">` : ""}
</div>
<div class="about-text">
<h3>${esc(c.solution_title || `${d.company_name}が解決します`)}</h3>
<p>${esc(c.solution_text || "")}</p>
</div>
</div>
</div>
</section>

${theme === "corporate" ? `<!-- MID-CTA: About後 -->
<div class="mid-cta">
<a href="#contact" class="trial">${esc(c.cta_text)}</a>
<a href="#contact" class="doc">資料ダウンロード</a>
</div>` : ""}

<!-- FEATURES: できること（サービス + 強み統合） -->
<section class="sec dot-bg" id="features" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Features</p><p class="sec-eng">Features</p><h2 class="sec-tit fi">${esc(d.service_name)}でできること</h2></div>
<div class="feat-grid">
${svc.map((item, i) => {
  const featImg = images[i + 1] ? images[i + 1].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["business"][(i + 1) % 15], 600, 400);
  return `<div class="feat-card fi">
<img class="feat-card-img" src="${esc(featImg)}" alt="${esc(item.title)}" loading="lazy">
<div class="feat-body">
<h4>${esc(item.title)}</h4>
<p>${esc(item.desc)}</p>
</div>
</div>`;
}).join("")}
</div>
</div>
</section>

${theme === "corporate" ? `<!-- MID-CTA: Features後 -->
<div class="mid-cta">
<a href="#contact" class="trial">${esc(c.cta_text)}</a>
<a href="#contact" class="doc">資料ダウンロード</a>
</div>` : ""}

<!-- REASONS: 選ばれる理由 -->
${reasons.length > 0 ? `<section class="sec" id="reasons">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Reason</p><p class="sec-eng">Why Choose Us</p><h2 class="sec-tit fi">${esc(d.company_name)}が選ばれる理由</h2></div>
<div class="reason-list">
${reasons.map((item, i) => {
  const reasonImg = images[i + 4] ? images[i + 4].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["business"][(i + 4) % 15], 600, 400);
  return `<div class="reason-card fi">
<img class="reason-img" src="${esc(reasonImg)}" alt="${esc(item.title)}" loading="lazy">
<div class="reason-body">
<div class="reason-num">REASON ${i + 1}</div>
<h4>${esc(item.title)}</h4>
<p>${esc(item.desc)}</p>
</div>
</div>`;
}).join("")}
</div>
</div>
</section>` : ""}

<!-- USE CASES: 活用シーン -->
${useCases.length > 0 ? `<section class="sec" id="usecases" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">UseCase</p><p class="sec-eng">Use Cases</p><h2 class="sec-tit fi">活用シーン</h2></div>
<div class="uc-grid">
${useCases.map((item, i) => {
  const ucIcoMap: Record<string, string> = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  };
  const ucIcon = ucIcoMap[item.icon_keyword] || ucIcoMap["zap"];
  const ucImg = images[i + 5] ? images[i + 5].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["business"][(i + 7) % 15], 600, 400);
  return `<div class="uc-card fi">
<img class="uc-card-img" src="${esc(ucImg)}" alt="${esc(item.title)}" loading="lazy">
<div class="uc-card-body">
<h4>${esc(item.title)}</h4>
<p>${esc(item.desc)}</p>
</div>
</div>`;
}).join("")}
</div>
</div>
</section>` : ""}

<!-- FUNCTIONS: 主な機能 -->
${funcs.length > 0 ? `<section class="sec" id="functions">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Functions</p><p class="sec-eng">Main Features</p><h2 class="sec-tit fi">${esc(d.service_name)}の主な機能</h2></div>
<div class="func-grid">
${funcs.map((item, i) => {
  const funcImg = images[i + 8] ? images[i + 8].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["tech"][(i + 5) % 15], 600, 400);
  return `<div class="func-card fi">
<img class="func-card-img" src="${esc(funcImg)}" alt="${esc(item.title)}" loading="lazy">
<div class="func-body">
<h4>${esc(item.title)}</h4>
<p>${esc(item.desc)}</p>
</div>
</div>`;
}).join("")}
</div>
</div>
</section>` : ""}

<!-- COLUMNS: お役立ち記事 -->
${columns.length > 0 ? `<section class="sec">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Column</p><p class="sec-eng">Column</p><h2 class="sec-tit fi">お役立ち情報</h2></div>
<div class="col-grid">
${columns.map((col, i) => {
  const colImg = images[i + 14] ? images[i + 14].url.replace(/w=\d+/, "w=200").replace(/h=\d+/, "h=200") : unsplashUrl(PHOTO_LIBRARY["business"][(i + 11) % 15], 200, 200);
  return `<div class="col-card fi">
<img class="col-thumb" src="${esc(colImg)}" alt="${esc(col.title)}" loading="lazy">
<div class="col-body">
<span class="col-tag">COLUMN</span>
<h4>${esc(col.title)}</h4>
<p>${esc(col.desc)}</p>
</div>
</div>`;
}).join("")}
</div>
</div>
</section>` : ""}

<!-- WAVE: → CTA1(accent) — concave dip -->
<div class="dvd dvd-tall"><svg viewBox="0 0 1200 120" preserveAspectRatio="none"><rect width="1200" height="120" fill="var(--c)"/><path d="M0,0 Q600,140 1200,0 L1200,0 L0,0 Z" fill="${columns.length > 0 ? 'var(--bg)' : useCases.length > 0 ? 'var(--bg2)' : 'var(--bg)'}"/></svg></div>

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

<!-- CASES: 導入事例 -->
${cas.length > 0 ? `<section class="sec" id="cases" style="background:var(--bg2)">
<div class="inner">
<div class="sec-hd"><p class="sec-bg-txt">Results</p><p class="sec-eng">Case Results</p><h2 class="sec-tit fi">実績事例</h2></div>
<div class="tm-grid">
${cas.map((item, i) => {
  const caseImg = images[i + 11] ? images[i + 11].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["business"][(i + 13) % 15], 600, 400);
  return `<div class="tm-card fi">
<img class="tm-card-img" src="${esc(caseImg)}" alt="${esc(item.category)}" loading="lazy">
<div class="tm-card-body">
<div class="tm-result">${esc(item.result)}</div>
<p class="tm-text">${esc(item.detail)}</p>
<div class="tm-author">
<div class="tm-avatar" style="font-size:12px">${esc(item.category.slice(0,2))}</div>
<div><div class="tm-name">${esc(item.category)}</div></div>
</div>
</div>
</div>`;
}).join("")}
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
${faq.map(item => `<dl class="faq-item"><dt class="faq-q">${esc(item.q)}</dt><dd class="faq-a">${esc(item.a)}</dd></dl>`).join("")}
</div>
</div>` : ""}
</div>
</section>

<!-- FINAL CTA -->
<section class="cta-sec" id="contact">
<div class="cta-tit">「<span style="color:var(--c)">${esc(brandName)}</span>」導入に関してご不明な点がございましたら<br>お気軽にお問い合わせください</div>
<div class="cta-sub">${esc(c.cta_sub || "")}</div>
<div class="cta-cards">
<div class="cta-card">
<div class="cta-card-icon dl"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
<h3>料金プランやサービス詳細など<br>サービス紹介資料はこちら</h3>
<a href="#contact" class="btn btn-primary">${esc(c.cta_text)} ${arrowSvg}</a>
</div>
<div class="cta-card">
<div class="cta-card-icon contact"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></div>
<h3>${esc(pName)}に直接相談したい方は<br>こちらからお問い合わせください</h3>
<a href="#contact" class="btn btn-primary">お問い合わせ ${arrowSvg}</a>
</div>
</div>
</section>

<!-- FOOTER -->
<footer class="ft">
<div class="ft-inner">
<div class="ft-left">
<div class="ft-brand">
<div class="ft-logo">${esc(d.company_name.charAt(0))}</div>
<div class="ft-company">${esc(d.company_name)}</div>
</div>
<div class="ft-desc">${esc(c.company_profile || d.service_name + "を提供しています。")}</div>
<div class="ft-address">〒000-0000 ○○県○○市○○区0-00-000</div>
</div>
<div class="ft-right">
<div class="ft-links">
<a href="#">運営会社</a>
<a href="#">プライバシーポリシー</a>
<a href="#">利用規約</a>
</div>
<div class="ft-copy">&copy; ${esc(d.company_name)} All Rights Reserved.</div>
</div>
</div>
</footer>

<!-- MOBILE CTA -->
<div class="m-cta"><a href="#contact">${esc(c.cta_text)}</a><p class="m-cta-sub">${esc(pName)} / 相談無料 / オンライン対応</p></div>

<!-- SCROLL ANIMATION + FAQ TOGGLE -->
<script>
document.addEventListener('DOMContentLoaded',function(){var o=new IntersectionObserver(function(e){e.forEach(function(en){if(en.isIntersecting){en.target.classList.add('vis');o.unobserve(en.target)}})},{threshold:.12,rootMargin:'0px 0px -40px 0px'});document.querySelectorAll('.fi').forEach(function(el){o.observe(el)});document.querySelectorAll('.faq-q').forEach(function(dt){dt.addEventListener('click',function(){var dl=this.parentElement;if(dl.classList.contains('open')){dl.classList.remove('open')}else{dl.classList.add('open')}})});document.querySelectorAll('img[src*="unsplash"]').forEach(function(img){img.onerror=function(){var fallbacks=['1497366216548-37526070297c','1553877522-43269d4ea984','1600880292203-757bb62b4baf','1521737711867-e3b97375f902','1542744173-8e7e91415657'];var idx=Math.floor(Math.random()*fallbacks.length);var w=this.width||800;var h=this.height||600;this.onerror=function(){this.onerror=null;this.style.display='none';var p=this.parentElement;if(p){p.style.background='linear-gradient(135deg,#e2e8f0,#cbd5e1)';p.style.minHeight='200px'}};this.src='https://images.unsplash.com/photo-'+fallbacks[idx]+'?auto=format&fit=crop&w='+w+'&h='+h+'&q=80'}})});
</script>
</body></html>`;
}

// ============================================================
// 広告クリエイティブ生成
// ============================================================

export function buildAdHtml(content: AdContent, d: FlatData): string {
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
// 議事録HTML生成
// ============================================================

export function buildMinutesHtml(content: MinutesContent, d: FlatData): string {
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
// 汎用HTML生成 (flyer, hearing_form, line_design, profile等)
// ============================================================

export function buildGenericHtml(content: GenericContent, d: FlatData, type: string): string {
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
  const title = { flyer: "チラシ", hearing_form: "ヒアリングフォーム", line_design: "LINE導線設計書", profile: "プロフィールシート", system_proposal: "システム開発提案書", proposal: "提案資料" }[type] || type;

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
