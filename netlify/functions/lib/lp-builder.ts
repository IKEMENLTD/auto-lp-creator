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

  // Award badge image (laurel wreath + No.1) from reference LP
  const awardImg = "data:image/png;base64,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";

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
.fv-badge{position:relative;width:240px;text-align:center}
.fv-badge-img{width:100%;height:auto;display:block}
.fv-badge-overlay{position:absolute;top:0;left:0;right:0;height:52%;background:#fff;display:flex;align-items:center;justify-content:center;padding:4px 8px}
.fv-badge-cat{font-size:11px;color:#555;line-height:1.4;font-weight:600}
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
.logo-strip{padding:48px 0;background:var(--bg2);border-bottom:1px solid var(--bd)}
.logo-strip-label{text-align:center;font-size:13px;color:var(--t3);font-weight:600;letter-spacing:.1em;margin-bottom:24px}
.logo-strip-list{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:24px 40px;max-width:960px;margin:0 auto;padding:0 24px}
.logo-strip-item{display:inline-flex;align-items:center;gap:8px;font-family:'Inter','Noto Sans JP',sans-serif;font-size:16px;font-weight:800;color:var(--t2);letter-spacing:.04em;white-space:nowrap;opacity:.45;transition:opacity .3s;padding:8px 0}
.logo-strip-item:hover{opacity:.75}
.logo-strip-item:nth-child(odd){font-style:italic}
.logo-strip-item:nth-child(3n+1){font-family:'Inter',sans-serif;letter-spacing:.08em;text-transform:uppercase;font-size:14px}
.logo-strip-item:nth-child(3n+2){font-family:'Noto Sans JP',sans-serif;font-size:17px;letter-spacing:.02em;font-style:normal}
.logo-strip-item:nth-child(3n){font-family:'Inter',sans-serif;font-weight:900;font-size:15px;letter-spacing:.12em}
.logo-strip-ico{width:20px;height:20px;border-radius:4px;background:var(--c);opacity:.35;display:inline-block;flex-shrink:0}
.logo-strip-item:nth-child(even) .logo-strip-ico{border-radius:50%}
.logo-strip-item:nth-child(3n) .logo-strip-ico{border-radius:2px;transform:rotate(45deg);width:14px;height:14px}
@media(max-width:750px){.logo-strip{padding:32px 0}.logo-strip-list{gap:16px 28px}.logo-strip-item{font-size:14px}.logo-strip-item:nth-child(3n+1){font-size:12px}.logo-strip-item:nth-child(3n+2){font-size:15px}.logo-strip-item:nth-child(3n){font-size:13px}}
@media(max-width:480px){.logo-strip-list{gap:12px 20px}.logo-strip-ico{width:16px;height:16px}.logo-strip-item:nth-child(3n) .logo-strip-ico{width:12px;height:12px}}

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
.uc-card-overlay{position:absolute;top:0;left:0;right:0;height:200px;background:linear-gradient(180deg,rgba(0,0,0,.1) 0%,rgba(0,0,0,.45) 100%);display:flex;align-items:center;justify-content:center}
.uc-ico{width:64px;height:64px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.2);backdrop-filter:blur(8px);border-radius:16px;border:1px solid rgba(255,255,255,.25)}
.uc-ico svg{width:28px;height:28px;color:#fff}
.uc-card-body{padding:20px}
.uc-card-body h4{font-size:15px;font-weight:800;margin-bottom:8px}
.uc-card-body p{font-size:13px;color:var(--t2);line-height:1.8;margin:0}
@media(max-width:750px){.uc-grid{grid-template-columns:1fr;gap:16px}.uc-card-img{height:160px}.uc-card-overlay{height:160px}}

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
.fv-badge{width:200px}
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
.inner{padding:0 16px}.hd-logo{font-size:14px}
/* hero */
.fv-lead{font-size:18px!important}.fv-service-name{font-size:22px}
.fv-btns{flex-direction:column}.fv-btns .btn{width:100%;min-width:auto}
.fv-badge{width:160px}
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
${badges.length > 0 ? `<div class="fv-awards"><div class="fv-award-row">${badges.slice(0, 2).map(b => `<div class="fv-badge"><img class="fv-badge-img" src="${awardImg}" alt="No.1"><div class="fv-badge-overlay"><span class="fv-badge-cat">${esc(b)}</span></div></div>`).join("")}</div><p class="fv-award-notes">※ 自社調べ</p></div>` : ""}
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
<p class="logo-strip-label">多くの企業様にご導入いただいています</p>
<div class="logo-strip-list">
<span class="logo-strip-item"><span class="logo-strip-ico"></span>NovaCross</span>
<span class="logo-strip-item"><span class="logo-strip-ico"></span>ZenithFlow</span>
<span class="logo-strip-item"><span class="logo-strip-ico"></span>CrestVision</span>
<span class="logo-strip-item"><span class="logo-strip-ico"></span>SolarisNeo</span>
<span class="logo-strip-item"><span class="logo-strip-ico"></span>TerraGrow</span>
<span class="logo-strip-item"><span class="logo-strip-ico"></span>Verdics</span>
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
<div class="uc-card-overlay"><div class="uc-ico">${ucIcon}</div></div>
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
