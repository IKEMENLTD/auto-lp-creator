/**
 * LP生成 - HTML構築・画像・カラー・テーマ
 */

import { SCROLL_ANIM, SEC_HEADER, WAVE_DIVIDER, DOT_BG, CARD_BORDERED, CARD_STAT, BTN_PRIMARY, MICRO_COPY, PROBLEM_CARD, STRENGTH_CARD, SERVICE_CARD, TESTIMONIAL_CARD, COMPARISON, CARD_GRID, STATS_GRID, FLOW, FAQ, CORPORATE_THEME } from "../templates/lp-components";
import type { FlatData, LpContent, AdContent, MinutesContent, GenericContent } from "./lp-types";
import { esc, hexToRgb } from "./lp-types";
import { bizContext } from "./lp-prompts";

// ============================================================
// Unsplash画像
// ============================================================

export interface LpImage {
  url: string;
  alt: string;
}

const unsplashUrl = (id: string, w = 800, h = 600): string =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

const PHOTO_LIBRARY: Record<string, string[]> = {
  business: [
    "1497366216548-37526070297c",
    "1553877522-43269d4ea984",
    "1600880292203-757bb62b4baf",
    "1521737711867-e3b97375f902",
    "1542744173-8e7e91415657",
  ],
  tech: [
    "1518770660439-4636190af475",
    "1531297484001-80022131f5a1",
    "1504384308090-c894fdcc538d",
    "1519389950473-47ba0277781c",
    "1573164713988-8665fc963095",
  ],
  medical: [
    "1576091160550-2173dba999ef",
    "1579684385127-1ef15d508118",
    "1551076805-e1869033e561",
    "1538108149393-fbbd81895907",
    "1559757175-5700dde675bc",
  ],
  food: [
    "1517248135467-4c7edcad34c4",
    "1414235077428-338989a2e8c0",
    "1552566626-52f8b828add9",
    "1559339352-11d035aa65de",
    "1466978913421-dad2ebd01d17",
  ],
  education: [
    "1524178232363-1fb2b075b655",
    "1427504494785-3a9ca7044f45",
    "1523050854058-8df90110c9f1",
    "1509062522246-3755977927d7",
    "1503676260728-1c00da094a0b",
  ],
  construction: [
    "1504307651254-35680f356dfd",
    "1541888946425-d81bb19240f5",
    "1503387762-592deb58ef4e",
    "1486406146926-c627a92ad1ab",
    "1487958449943-2429e8be8625",
  ],
  finance: [
    "1460925895917-afdab827c52f",
    "1611974789855-9c2a0a7236a3",
    "1554224155-6726b3ff858f",
    "1579532537598-459ecdaf39cc",
    "1526304640581-d334cdbbf45e",
  ],
  beauty: [
    "1560066984-138dadb4c035",
    "1522337360788-8b13dee7a37e",
    "1516975080664-ed2fc6a32937",
    "1570172619644-dfd03ed5d881",
    "1487412912498-0447578fcca8",
  ],
  manufacturing: [
    "1565043589221-4e5bfe5a2a3f",
    "1581091226825-a6a2a5aee158",
    "1504917595217-d4dc5ebe6122",
    "1558618666-fcd25c85f82e",
    "1533417479674-390fca4b5f73",
  ],
};

export function selectImages(d: FlatData): LpImage[] {
  const industry = d.industry.toLowerCase();

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

export function buildLpHtml(c: LpContent, d: FlatData, images: LpImage[] = [], theme: LpTheme = "dark"): string {
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
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
.only-sp{display:none}
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
.hd{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--bd);height:64px;display:flex;align-items:center;padding:0 32px}
.hd-wrap{display:flex;align-items:center;justify-content:space-between;width:100%}
.hd-logo{font-weight:800;font-size:18px;color:var(--c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:50%}
.hd-nav{display:flex;gap:16px;align-items:center;flex-shrink:0}
.hd-nav a{font-size:13px;color:var(--t2);font-weight:500;transition:color .2s;white-space:nowrap}
.hd-nav a:hover{color:var(--c)}
.hd-nav a.btn-accent{color:#fff}

/* ===== HERO ===== */
.fv{position:relative;display:flex;align-items:center;overflow:hidden;padding-top:64px;background:linear-gradient(160deg,#f8fafe 0%,#eef3fb 40%,#f0f7ff 100%)}
.fv::before,.fv::after{content:'';position:absolute;top:0;width:320px;height:100%;z-index:0;opacity:.35;pointer-events:none;background:radial-gradient(ellipse at center,var(--c) 0%,transparent 70%)}
.fv::before{left:-120px}
.fv::after{right:-120px}
.fv-bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.07;z-index:0}
.fv .inner{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center;max-width:1300px;padding:80px 32px 32px;gap:48px}
.fv-left{flex:1;min-width:0}
.fv-right{flex-shrink:0;display:flex;align-items:center;justify-content:center}
.fv-lead{font-weight:800;color:#333;line-height:1.35;margin-bottom:20px}
.fv-service-label{font-size:clamp(13px,1.4vw,16px);color:#555;margin-bottom:12px}
.fv-service-name{font-size:clamp(28px,4.2vw,44px);font-weight:900;color:var(--c);line-height:1.25;margin-bottom:28px}
.fv-service-sub{display:block;font-size:clamp(14px,1.6vw,18px);font-weight:600;color:#555;margin-top:8px;letter-spacing:.02em}
/* Award badges — laurel wreath style */
.fv-awards{display:flex;flex-direction:column;gap:6px;margin-bottom:28px}
.fv-award-row{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}
.fv-badge{width:200px;text-align:center}
.fv-badge-cat{font-size:11px;color:#555;line-height:1.3;font-weight:600;margin-bottom:2px}
.fv-badge-img-wrap{width:100%;position:relative}
.fv-badge-img{width:80%;height:auto;display:block;margin:0 auto}
.fv-badge-note{font-size:9px;color:#888;line-height:1;margin-top:1px}
.fv-award-notes{font-size:10px;color:#8c8c8c;line-height:1.4;margin-top:4px}
.fv-btns{display:flex;gap:15px;flex-wrap:wrap}
.fv-btns .btn{min-width:220px;border-radius:34px;font-size:16px;font-weight:700;padding:15px 28px;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.fv-btns .btn-accent{background:var(--c);color:#fff;border:2px solid var(--c)}
.fv-btns .btn-accent:hover{opacity:.88}
.fv-btns .btn-outline-accent{background:#fff;color:var(--c);border:2px solid var(--c)}
.fv-btns .btn-outline-accent:hover{background:var(--c);color:#fff}
/* Hero dashboard mockup */
@keyframes heroFadeUp{0%{opacity:0;transform:translateY(20px)}100%{opacity:1;transform:translateY(0)}}
@keyframes heroBarGrow{0%{width:0}100%{width:var(--bar-w)}}
@keyframes heroPulse{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes heroFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.hero-dash{width:100%;max-width:420px;background:#1e293b;backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:24px;animation:heroFloat 4s ease-in-out infinite;box-shadow:0 20px 60px rgba(0,0,0,.18)}
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
.hero-dash-bar-fill.b1{animation-delay:.6s}
.hero-dash-bar-fill.b2{animation-delay:.75s}
.hero-dash-bar-fill.b3{animation-delay:.9s}
.hero-dash-bar-pct{font-size:10px;color:rgba(255,255,255,.6);width:32px;font-weight:700}
.hero-dash-footer{display:flex;align-items:center;gap:8px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
.hero-dash-footer-dot{width:6px;height:6px;border-radius:50%;background:var(--ca)}
.hero-dash-footer-text{font-size:10px;color:rgba(255,255,255,.45)}

/* ===== LOGO STRIP ===== */
.logo-strip{padding:70px 0 50px;background:#fff}
.logo-strip-label{text-align:center;font-size:24px;color:var(--c);font-weight:700;margin-bottom:50px}
.logo-strip-list{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;column-gap:80px;row-gap:40px;max-width:960px;margin:0 auto;padding:0 24px}
.logo-strip-item{display:inline-flex;align-items:center;font-family:'Noto Sans JP','Inter',sans-serif;font-size:18px;font-weight:700;color:#333;letter-spacing:.04em;white-space:nowrap;opacity:.5;filter:grayscale(100%);padding:8px 0}
@media(max-width:750px){.logo-strip{padding:30px 0}.logo-strip-label{font-size:18px;margin-bottom:30px}.logo-strip-list{column-gap:40px;row-gap:24px}.logo-strip-item{font-size:15px}}
@media(max-width:480px){.logo-strip-list{column-gap:28px;row-gap:20px}.logo-strip-item{font-size:13px}}

/* ===== ABOUT (〇〇とは) ===== */
.about-pain{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:40px}
.about-pain-item{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:var(--bg2);border:1px solid var(--bd);border-radius:20px;font-size:13px;font-weight:600;color:var(--t2)}
.about-pain-item svg{width:16px;height:16px;color:var(--c);flex-shrink:0}
.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;max-width:960px;margin:0 auto}
.about-text h3{font-size:clamp(18px,3vw,24px);font-weight:900;margin-bottom:12px;line-height:1.4}
.about-text p{font-size:15px;color:var(--t2);line-height:2}
.about-img{border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.08)}
.about-img img{width:100%;height:auto;display:block}
@media(max-width:750px){.about-grid{grid-template-columns:1fr;gap:24px}.about-text h3{font-size:20px}}

/* ===== FEATURES (できること) ===== */
.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1000px;margin:0 auto}
.feat-card{overflow:hidden;border-radius:var(--r);background:var(--bg);border:1px solid var(--bd);box-shadow:0 2px 8px rgba(0,0,0,.06);transition:box-shadow .4s,transform .4s}
.feat-card:hover{box-shadow:0 12px 36px rgba(0,0,0,.08);transform:translateY(-4px)}
.feat-card-img{width:100%;height:200px;object-fit:cover;display:block}
.feat-body{padding:20px}
.feat-body h4{font-size:16px;font-weight:800;margin-bottom:8px}
.feat-body p{font-size:13px;color:var(--t2);line-height:1.8;margin:0}
@media(max-width:750px){.feat-grid{grid-template-columns:1fr;gap:16px}.feat-card-img{height:180px}.feat-body{padding:16px}}

/* ===== REASONS (選ばれる理由) ===== */
.reason-list{display:flex;flex-direction:column;gap:32px;max-width:960px;margin:0 auto}
.reason-card{display:grid;grid-template-columns:280px 1fr;gap:28px;align-items:center;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);transition:box-shadow .4s,transform .4s}
.reason-card:hover{box-shadow:0 12px 36px rgba(0,0,0,.08);transform:translateY(-3px)}
.reason-card:nth-child(even){direction:rtl}.reason-card:nth-child(even)>*{direction:ltr}
.reason-img{width:100%;height:100%;min-height:200px;object-fit:cover;display:block}
.reason-body{padding:28px 28px 28px 0}
.reason-card:nth-child(even) .reason-body{padding:28px 0 28px 28px}
.reason-num{font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:var(--c);letter-spacing:.15em;text-transform:uppercase;margin-bottom:8px}
.reason-body h4{font-size:18px;font-weight:800;margin-bottom:10px;line-height:1.4}
.reason-body p{font-size:14px;color:var(--t2);line-height:1.8;margin:0}
@media(max-width:750px){.reason-card{grid-template-columns:1fr}.reason-card:nth-child(even){direction:ltr}.reason-img{min-height:180px;height:200px}.reason-body,.reason-card:nth-child(even) .reason-body{padding:20px}}

/* ===== USE CASES (活用シーン) ===== */
.uc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:960px;margin:0 auto}
.uc-card{position:relative;overflow:hidden;border-radius:var(--r);border:1px solid var(--bd);transition:box-shadow .3s,transform .3s}
.uc-card:hover{box-shadow:0 12px 36px rgba(0,0,0,.08);transform:translateY(-3px)}
.uc-card-img{width:100%;height:200px;object-fit:cover;display:block}
.uc-card-body{padding:20px}
.uc-card-body h4{font-size:15px;font-weight:800;margin-bottom:8px}
.uc-card-body p{font-size:13px;color:var(--t2);line-height:1.8;margin:0}
@media(max-width:750px){.uc-grid{grid-template-columns:1fr;gap:16px}.uc-card-img{height:160px}}

/* ===== FUNCTIONS (主な機能) ===== */
.func-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1000px;margin:0 auto}
.func-card{overflow:hidden;border-radius:var(--r);background:var(--bg);border:1px solid var(--bd);transition:box-shadow .4s,transform .4s}
.func-card:hover{box-shadow:0 12px 36px rgba(0,0,0,.08);transform:translateY(-4px)}
.func-card-img{width:100%;height:160px;object-fit:cover;display:block}
.func-body{padding:20px}
.func-body h4{font-size:15px;font-weight:800;margin-bottom:6px}
.func-body p{font-size:13px;color:var(--t2);line-height:1.8;margin:0}
@media(max-width:750px){.func-grid{grid-template-columns:1fr;gap:16px}.func-card-img{height:140px}.func-body{padding:16px}}

/* ===== COLUMNS (お役立ち記事) ===== */
.col-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;max-width:800px;margin:0 auto}
.col-card{display:flex;gap:16px;padding:20px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);transition:box-shadow .3s,transform .3s;cursor:default}
.col-card:hover{box-shadow:0 8px 24px rgba(0,0,0,.06);transform:translateY(-2px)}
.col-thumb{flex-shrink:0;width:80px;height:80px;border-radius:8px;object-fit:cover}
.col-body h4{font-size:14px;font-weight:800;line-height:1.5;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.col-body p{font-size:12px;color:var(--t2);line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0}
.col-tag{display:inline-block;font-size:10px;font-weight:700;color:var(--c);letter-spacing:.05em;margin-bottom:4px}
@media(max-width:750px){.col-grid{grid-template-columns:1fr;gap:16px}.col-card{padding:16px}}
@media(max-width:480px){.col-thumb{width:64px;height:64px}.col-body h4{font-size:13px}}

/* ===== PROBLEMS ===== */
.prob-grid{display:flex;flex-direction:column;gap:10px;max-width:680px;margin:0 auto}

/* ===== SOLUTION ===== */
.sol-text{font-size:15px;color:var(--t2);line-height:2;max-width:640px;margin:0 auto 40px;text-align:center}

/* ===== OFFER / CTA ===== */
.offer{padding:40px 0;background:var(--dark);color:#fff;text-align:center;position:relative;overflow:hidden}
.offer::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:400px;background:radial-gradient(circle,rgba(255,255,255,.04),transparent 70%)}
.offer-accent{background:var(--c);padding:48px 0}
.offer-tit{font-size:clamp(18px,3vw,24px);font-weight:800;margin-bottom:8px;position:relative}
.offer-sub{font-size:14px;color:rgba(255,255,255,.55);margin-bottom:20px;position:relative}

/* ===== COMPANY ===== */
.company-box{max-width:720px;margin:0 auto;padding:32px;border:1px solid var(--bd);border-radius:var(--r);display:flex;align-items:center;gap:24px}
.company-logo{flex-shrink:0;width:64px;height:64px;border-radius:var(--r);background:var(--cg);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:24px}
.company-info p{font-size:14px;color:var(--t2);line-height:1.8}
.company-info strong{color:var(--t1);font-size:16px;display:block;margin-bottom:4px}

/* ===== FINAL CTA ===== */
.cta-sec{padding:64px 24px;background:var(--dark);text-align:center;position:relative;overflow:hidden}
.cta-sec::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;height:500px;background:radial-gradient(circle,rgba(255,255,255,.04),transparent 70%)}
.cta-tit{font-size:clamp(22px,3.5vw,30px);font-weight:900;color:#fff;margin-bottom:10px;position:relative}
.cta-sub{font-size:14px;color:rgba(255,255,255,.5);margin-bottom:24px;position:relative}

/* ===== FOOTER ===== */
.ft{padding:48px 24px;border-top:1px solid var(--bd);font-size:12px;color:var(--t3)}
.ft-inner{max-width:1100px;margin:0 auto;display:flex;align-items:flex-start;justify-content:space-between;gap:32px;flex-wrap:wrap}
.ft-brand{display:flex;align-items:center;gap:14px;margin-bottom:12px}
.ft-logo{width:40px;height:40px;border-radius:8px;background:var(--cg);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:18px;flex-shrink:0}
.ft-company{font-size:16px;font-weight:800;color:var(--t1)}
.ft-address{font-size:12px;color:var(--t3);line-height:1.8}
.ft-links{display:flex;gap:20px;flex-wrap:wrap;padding-top:6px}
.ft-links a{font-size:12px;color:var(--t3);text-decoration:none;transition:color .2s}
.ft-links a:hover{color:var(--c)}
.ft-copy{font-size:11px;color:var(--t3);margin-top:12px}
@media(max-width:750px){.ft-inner{flex-direction:column;align-items:center;text-align:center}.ft-brand{justify-content:center}.ft-links{justify-content:center}}

/* ===== MOBILE CTA BAR ===== */
.m-cta{display:none;position:fixed;bottom:0;left:0;right:0;padding:10px 16px;background:rgba(255,255,255,.95);backdrop-filter:blur(12px);border-top:1px solid var(--bd);z-index:100}
.m-cta a{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:14px;background:var(--c);color:#fff;font-weight:800;font-size:14px;border-radius:var(--r)}
.m-cta-sub{font-size:10px;color:var(--t3);text-align:center;margin-top:4px}

/* ============================== */
/* RESPONSIVE 750px               */
/* ============================== */
@media(max-width:750px){
/* header */
.hd{height:56px;padding:0 16px}.hd-logo{font-size:15px;max-width:60%}.hd-nav{gap:0}.hd-nav a:not(.btn){display:none}
/* hero */
.fv{padding-top:56px}.fv .inner{padding:60px 20px 40px;flex-direction:column;text-align:center}
.fv-left{text-align:center}
.fv-btns{justify-content:center}
.fv-right{margin-top:28px}
.fv-product{max-width:100%}
.fv-lead{font-size:clamp(20px,4.5vw,26px)!important}
.fv-service-name{font-size:clamp(22px,5.5vw,32px)}
.fv-award-row{justify-content:center}
.fv-badge{width:170px}
.fv-btns .btn{min-width:180px;font-size:14px}
/* problems */
.prob p{font-size:13px}.prob span{font-size:12px}.prob{padding:14px 16px;gap:10px}
.prob-ico{width:32px;height:32px}.prob-ico svg{width:16px;height:16px}
/* solution */
.sol-text{font-size:14px}
/* service */
.svc-head{padding:22px 20px 16px}.svc-ico-ring{width:44px;height:44px;border-radius:10px}
.svc-body{padding:16px 20px 22px}.svc-body p{font-size:13px}
/* CTA */
.offer{padding:32px 0}.offer-accent{padding:36px 0}.offer-tit{font-size:clamp(16px,4.5vw,20px)}
.offer-sub{font-size:13px;margin-bottom:16px}
/* micro copy: stack on mobile */
.micro{flex-wrap:wrap;gap:8px 14px}
/* comparison */
.cmp-card{padding:22px}
/* testimonial */
.tm-card{padding:22px}
/* mobile CTA bar */
.m-cta{display:block}
/* stats grid */
.stats-grid{grid-template-columns:repeat(2,1fr)}
/* dashboard */
.hero-dash{max-width:360px;padding:20px}
.hero-dash-stat-num{font-size:17px}
}

/* ============================== */
/* RESPONSIVE 480px               */
/* ============================== */
@media(max-width:480px){
.only-sp{display:inline}
.inner{padding:0 16px}.hd-logo{font-size:14px}
/* hero */
.fv-lead{font-size:18px!important}.fv-service-name{font-size:22px}
.fv-btns{flex-direction:column}.fv-btns .btn{width:100%;min-width:auto}
.fv-badge{width:140px}
.fv-badge-cat{font-size:10px}
/* dashboard */
.hero-dash{max-width:100%;padding:16px}
.hero-dash-stat-num{font-size:15px}
.hero-dash-stats{gap:8px}
/* section headers */
.sec-bg-txt{font-size:36px;margin-bottom:-12px}
/* buttons */
.btn-lg{padding:12px 24px;font-size:13px}.btn-md{padding:10px 20px;font-size:12px}
/* CTA */
.offer-tit{font-size:16px}.offer-accent{padding:32px 0}
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
<span class="logo-strip-item">NovaCross</span>
<span class="logo-strip-item">ZenithFlow</span>
<span class="logo-strip-item">CrestVision</span>
<span class="logo-strip-item">SolarisNeo</span>
<span class="logo-strip-item">TerraGrow</span>
</div>
</div>

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
  const featImg = images[i + 1] ? images[i + 1].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["business"][(i + 1) % 5], 600, 400);
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
  const reasonImg = images[i + 1] ? images[i + 1].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["business"][i] || PHOTO_LIBRARY["business"][0], 600, 400);
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
  const ucImg = images[i + 1] ? images[i + 1].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["business"][(i + 2) % 5], 600, 400);
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
  const funcImg = images[i + 2] ? images[i + 2].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["tech"][i % 5], 600, 400);
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
  const colImg = images[i + 2] ? images[i + 2].url.replace(/w=\d+/, "w=200").replace(/h=\d+/, "h=200") : unsplashUrl(PHOTO_LIBRARY["business"][(i + 2) % 5], 200, 200);
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
  const caseImg = images[i + 1] ? images[i + 1].url.replace(/w=\d+/, "w=600").replace(/h=\d+/, "h=400") : unsplashUrl(PHOTO_LIBRARY["business"][(i + 3) % 5], 600, 400);
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
<footer class="ft">
<div class="ft-inner">
<div>
<div class="ft-brand">
<div class="ft-logo">${esc(d.company_name.charAt(0))}</div>
<div class="ft-company">${esc(d.company_name)}</div>
</div>
<div class="ft-address">${esc(d.industry)}</div>
<div class="ft-copy">&copy; ${esc(d.company_name)} All Rights Reserved.</div>
</div>
<div class="ft-links">
<a href="#">運営会社</a>
<a href="#">プライバシーポリシー</a>
<a href="#">利用規約</a>
</div>
</div>
</footer>

<!-- MOBILE CTA -->
<div class="m-cta"><a href="#contact">${esc(c.cta_text)}</a><p class="m-cta-sub">${esc(pName)} / 相談無料 / オンライン対応</p></div>

<!-- SCROLL ANIMATION + FAQ TOGGLE -->
<script>
document.addEventListener('DOMContentLoaded',function(){var o=new IntersectionObserver(function(e){e.forEach(function(en){if(en.isIntersecting){en.target.classList.add('vis');o.unobserve(en.target)}})},{threshold:.12,rootMargin:'0px 0px -40px 0px'});document.querySelectorAll('.fi').forEach(function(el){o.observe(el)});document.querySelectorAll('.faq-q').forEach(function(dt){dt.addEventListener('click',function(){var dl=this.parentElement;if(dl.classList.contains('open')){dl.classList.remove('open')}else{dl.classList.add('open')}})})});
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
