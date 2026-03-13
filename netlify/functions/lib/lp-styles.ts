/**
 * LP生成 - インラインCSS
 */

import { SCROLL_ANIM, SEC_HEADER, WAVE_DIVIDER, DOT_BG, CARD_BORDERED, CARD_STAT, BTN_PRIMARY, MICRO_COPY, PROBLEM_CARD, STRENGTH_CARD, SERVICE_CARD, TESTIMONIAL_CARD, COMPARISON, CARD_GRID, STATS_GRID, FLOW, FAQ, CORPORATE_THEME } from "../templates/lp-components";
import type { LpTheme } from "./lp-builder";

interface StyleParams {
  primary: string;
  gradient: string;
  accent: string;
  cRgb: string;
  theme: LpTheme;
}

export function buildLpStyles(p: StyleParams): string {
  return `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
.only-sp{display:none}
:root{--c:${p.primary};--cg:${p.gradient};--ca:${p.accent};--c-rgb:${p.cRgb};--dark:#0f172a;--t1:#1e293b;--t2:#475569;--t3:#94a3b8;--bg:#fff;--bg2:#f1f5f9;--bd:#e2e8f0;--r:10px}
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
${p.theme === "corporate" ? CORPORATE_THEME : ""}

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
.logo-strip-list{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;column-gap:80px;row-gap:40px;max-width:1200px;margin:0 auto;padding:0 40px}
.logo-strip-item{display:inline-flex;align-items:center;height:120px;padding:8px 0}
.logo-strip-item img{height:100%;width:auto;object-fit:contain}
@media(max-width:750px){.logo-strip{padding:30px 0}.logo-strip-label{font-size:18px;margin-bottom:30px}.logo-strip-list{column-gap:40px;row-gap:24px}.logo-strip-item{height:70px}}
@media(max-width:480px){.logo-strip-list{column-gap:28px;row-gap:20px}.logo-strip-item{font-size:13px}}
/* ===== BANNER ===== */
.banner-sec{padding:0 0 50px;background:#fff}
.banner-list{display:flex;justify-content:center;gap:16px;max-width:800px;margin:0 auto;padding:0 24px;list-style:none}
.banner-item{width:calc((100% - 20px) / 2);border-radius:8px;overflow:hidden;box-shadow:6px 6px 6px 0 rgba(0,0,0,.45);transition:all .3s;cursor:pointer;position:relative}
.banner-item:hover{opacity:.8}
.banner-item-inner{display:flex;align-items:stretch;min-height:120px;color:#fff;position:relative;overflow:hidden}
.banner-item-inner::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(120deg,transparent,transparent 40px,rgba(255,255,255,.03) 40px,rgba(255,255,255,.03) 80px),linear-gradient(135deg,rgba(255,255,255,.05) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.05) 50%,rgba(255,255,255,.05) 75%,transparent 75%);background-size:100% 100%,20px 20px;z-index:0}
.banner-item:nth-child(1) .banner-item-inner{background:linear-gradient(135deg,var(--c) 0%,#1a3a4a 100%)}
.banner-item:nth-child(2) .banner-item-inner{background:linear-gradient(135deg,#1a2744 0%,#2a4a7a 100%)}
.banner-item-text{flex:1;padding:18px 20px;position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center}
.banner-item-text h4{font-size:15px;font-weight:900;line-height:1.5;margin-bottom:8px;text-shadow:0 1px 3px rgba(0,0,0,.3)}
.banner-item-cta{display:inline-block;background:var(--c);color:#fff;font-size:11px;font-weight:700;padding:6px 16px;border-radius:20px;width:fit-content;text-shadow:none}
.banner-item:nth-child(2) .banner-item-cta{background:#3b82f6}
.banner-item-mockup{width:130px;flex-shrink:0;position:relative;z-index:1;display:flex;align-items:center;justify-content:center;padding:12px 14px 12px 0}
.banner-item-doc{width:90px;background:#fff;border-radius:3px;box-shadow:4px 4px 12px rgba(0,0,0,.3);padding:8px 7px;transform:rotate(-3deg)}
.banner-item-doc-title{font-size:7px;color:#333;font-weight:700;line-height:1.4;margin-bottom:6px;text-align:center}
.banner-item-doc-line{height:3px;background:#e5e7eb;border-radius:2px;margin-bottom:4px}
.banner-item-doc-line:nth-child(3){width:80%}
.banner-item-doc-line:nth-child(4){width:60%}
.banner-item-doc-line:nth-child(5){width:90%}
.banner-item-doc-chart{display:flex;align-items:flex-end;gap:3px;height:24px;margin-top:8px;justify-content:center}
.banner-item-doc-bar{width:8px;background:var(--c);border-radius:2px 2px 0 0;opacity:.7}
.banner-item:nth-child(2) .banner-item-doc-bar{background:#3b82f6}
@media(max-width:750px){.banner-list{flex-direction:column;gap:16px}.banner-item{width:100%}.banner-item-text h4{font-size:18px}.banner-item-mockup{width:140px;padding:12px 16px 12px 0}.banner-item-doc{width:100px}}
@media(max-width:480px){.banner-item-text{padding:20px}.banner-item-text h4{font-size:16px}.banner-item-mockup{width:120px;padding:10px 12px 10px 0}.banner-item-doc{width:85px;padding:8px}}

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
/* Center when fewer than 3 items */
.feat-grid.items-1,.feat-grid.items-2{display:flex;flex-wrap:wrap;justify-content:center}
.feat-grid.items-1 .feat-card,.feat-grid.items-2 .feat-card{width:calc((100% - 48px) / 3);min-width:280px}
@media(max-width:750px){.feat-grid{grid-template-columns:1fr;gap:16px}.feat-grid.items-1 .feat-card,.feat-grid.items-2 .feat-card{width:100%;min-width:auto}.feat-card-img{height:180px}.feat-body{padding:16px}}

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
/* Center when fewer than 3 items */
.uc-grid.items-1,.uc-grid.items-2{display:flex;flex-wrap:wrap;justify-content:center}
.uc-grid.items-1 .uc-card,.uc-grid.items-2 .uc-card{width:calc((100% - 48px) / 3);min-width:280px}
@media(max-width:750px){.uc-grid{grid-template-columns:1fr;gap:16px}.uc-grid.items-1 .uc-card,.uc-grid.items-2 .uc-card{width:100%;min-width:auto}.uc-card-img{height:160px}}

/* ===== FUNCTIONS (主な機能) ===== */
.func-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1000px;margin:0 auto}
.func-card{overflow:hidden;border-radius:var(--r);background:var(--bg);border:1px solid var(--bd);transition:box-shadow .4s,transform .4s}
.func-card:hover{box-shadow:0 12px 36px rgba(0,0,0,.08);transform:translateY(-4px)}
.func-card-img{width:100%;height:160px;object-fit:cover;display:block}
.func-body{padding:20px}
.func-body h4{font-size:15px;font-weight:800;margin-bottom:6px}
.func-body p{font-size:13px;color:var(--t2);line-height:1.8;margin:0}
/* Center when fewer than 3 items */
.func-grid.items-1,.func-grid.items-2{display:flex;flex-wrap:wrap;justify-content:center}
.func-grid.items-1 .func-card,.func-grid.items-2 .func-card{width:calc((100% - 48px) / 3);min-width:280px}
@media(max-width:750px){.func-grid{grid-template-columns:1fr;gap:16px}.func-grid.items-1 .func-card,.func-grid.items-2 .func-card{width:100%;min-width:auto}.func-card-img{height:140px}.func-body{padding:16px}}

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
.cta-sec{padding:60px 24px 60px;background:#f5f7fa;text-align:center}
.cta-tit{font-size:clamp(18px,2.8vw,24px);font-weight:900;color:var(--t1);margin-bottom:8px;line-height:1.6}
.cta-sub{font-size:14px;color:var(--t2);margin-bottom:32px}
.cta-cards{display:flex;justify-content:center;column-gap:45px;max-width:760px;margin:0 auto;flex-wrap:wrap}
.cta-card{width:calc((100% - 45px) / 2);background:#fff;box-shadow:0 0 17.8px 2.2px rgba(0,0,0,.05);padding:28px 20px;display:flex;flex-direction:column;align-items:center;gap:12px}
.cta-card figure{margin-bottom:6px}
.cta-card figure svg{display:block}
.cta-card h3{font-size:15px;font-weight:700;color:var(--t1);line-height:1.6;margin:0;text-align:center}
.cta-card .btn{margin-top:auto;display:flex;align-items:center;justify-content:center;position:relative;font-weight:700;font-size:15px;padding:10px 20px;border-radius:34px;min-width:200px;text-decoration:none;transition:.2s}
.cta-card .btn-trial{background:var(--c);color:#fff;border:none}
.cta-card .btn-trial:hover{opacity:.85}
.cta-card .btn-outline{background:#fff;color:var(--c);border:2px solid var(--c)}
.cta-card .btn-outline:hover{background:var(--c);color:#fff}
.cta-card .btn::after{content:">";position:absolute;right:20px;top:50%;transform:translateY(-50%);font-size:16px}
@media(max-width:600px){.cta-cards{flex-direction:column;align-items:center;row-gap:24px}.cta-card{width:100%;max-width:340px}}

/* ===== FOOTER ===== */
.ft{padding:20px 24px;background:#fff;border-top:1px solid var(--bd);font-size:12px;color:var(--t3)}
.ft-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap}
.ft-left{display:flex;flex-direction:column;gap:12px}
.ft-brand{display:flex;align-items:center;gap:14px}
.ft-logo{width:40px;height:40px;border-radius:8px;background:var(--cg);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:18px;flex-shrink:0}
.ft-company{font-size:16px;font-weight:800;color:var(--t1)}
.ft-address{font-size:12px;color:var(--t3);margin-top:4px}
.ft-right{display:flex;flex-direction:column;align-items:flex-end;gap:20px}
.ft-links{display:flex;flex-direction:column;gap:0}
.ft-links a{font-size:14px;color:var(--t2);text-decoration:none;transition:color .2s;padding:4px 0}
.ft-links a:hover{color:var(--c)}
.ft-copy{font-size:14px;color:var(--t3);text-align:right}
@media(max-width:750px){.ft-inner{flex-direction:column;align-items:center;text-align:center;gap:24px}.ft-left{align-items:center}.ft-brand{justify-content:center}.ft-right{align-items:center}.ft-links{align-items:center}.ft-copy{text-align:center}}

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
`;
}
