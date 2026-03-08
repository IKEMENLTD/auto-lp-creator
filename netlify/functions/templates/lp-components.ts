/**
 * LP HTMLテンプレート用 CSSコンポーネント
 *
 * 再利用可能なデザインパーツ集。
 * buildLpHtml()から参照して使う。
 */

// ============================================================
// カード系コンポーネント
// ============================================================

/** 枠付きカード（ボーダー + ホバー） */
export const CARD_BORDERED = `
.card{padding:32px 28px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);position:relative;transition:box-shadow .3s,transform .3s}
.card:hover{box-shadow:0 12px 36px rgba(0,0,0,.07);transform:translateY(-3px)}
.card-accent{border-top:3px solid var(--c)}
.card-highlight{border-color:var(--c);background:rgba(var(--c-rgb),.02);box-shadow:0 4px 20px rgba(var(--c-rgb),.08)}
`;

/** 数字ハイライトカード */
export const CARD_STAT = `
.stat-card{text-align:center;padding:28px 20px}
.stat-num{font-family:'Inter',sans-serif;font-size:clamp(28px,4vw,44px);font-weight:900;background:var(--cg);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.1}
.stat-label{font-size:12px;color:var(--t2);margin-top:6px;font-weight:600;letter-spacing:.05em}
`;

// ============================================================
// ボタン系
// ============================================================

/** プライマリCTAボタン */
export const BTN_PRIMARY = `
.btn{display:inline-flex;align-items:center;gap:8px;font-weight:800;border-radius:var(--r);transition:transform .2s,box-shadow .2s;cursor:pointer;text-decoration:none;border:none}
.btn:hover{transform:translateY(-2px)}
.btn-lg{padding:18px 48px;font-size:16px}
.btn-md{padding:14px 32px;font-size:14px}
.btn-white{background:#fff;color:var(--dark)}.btn-white:hover{box-shadow:0 12px 32px rgba(0,0,0,.15)}
.btn-dark{background:var(--dark);color:#fff}.btn-dark:hover{box-shadow:0 8px 24px rgba(0,0,0,.2)}
.btn-accent{background:var(--c);color:#fff}.btn-accent:hover{box-shadow:0 8px 24px rgba(var(--c-rgb),.3)}
`;

/** マイクロコピー（CTA下の安心テキスト） */
export const MICRO_COPY = `
.micro{font-size:12px;display:flex;align-items:center;justify-content:center;gap:14px;margin-top:10px}
.micro span{display:flex;align-items:center;gap:4px}
.micro svg{width:14px;height:14px;fill:none;stroke-width:2}
.micro-light{color:rgba(255,255,255,.5)}.micro-light svg{stroke:var(--ca)}
.micro-dark{color:var(--t3)}.micro-dark svg{stroke:var(--c)}
`;

// ============================================================
// セクション系
// ============================================================

/** セクションヘッダー（英語背景テキスト + 見出し） */
export const SEC_HEADER = `
.sec{padding:100px 0;position:relative;overflow:hidden}
.sec-hd{text-align:center;margin-bottom:56px}
.sec-bg-txt{font-family:'Inter',sans-serif;font-size:clamp(48px,8vw,96px);font-weight:900;color:var(--c);opacity:.03;text-transform:uppercase;letter-spacing:-.03em;line-height:1;margin-bottom:-30px;position:relative;z-index:0}
.sec-eng{font-family:'Inter',sans-serif;font-size:12px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--c);margin-bottom:8px}
.sec-tit{font-size:clamp(22px,3.5vw,32px);font-weight:900;line-height:1.35;position:relative;z-index:1}
.sec-sub{font-size:15px;color:var(--t2);margin-top:12px;max-width:560px;margin-left:auto;margin-right:auto}
@media(max-width:750px){.sec{padding:64px 0}.sec-bg-txt{font-size:48px;margin-bottom:-16px}}
`;

/** ウェーブディバイダー */
export const WAVE_DIVIDER = `
.dvd{position:relative;height:72px;margin-top:-1px;z-index:3;overflow:hidden}
.dvd svg{width:100%;height:100%;display:block}
@media(max-width:750px){.dvd{height:48px}}
`;

// ============================================================
// 装飾系
// ============================================================

/** ドットパターン背景 */
export const DOT_BG = `
.dot-bg{background-image:radial-gradient(circle at 1px 1px,rgba(0,0,0,.04) 1px,transparent 0);background-size:24px 24px}
`;

/** スクロールアニメーション */
export const SCROLL_ANIM = `
.fi{opacity:0;transform:translateY(28px);transition:opacity .7s ease,transform .7s ease}
.fi.vis{opacity:1;transform:translateY(0)}
`;

/** 問題カード（赤ボーダー） */
export const PROBLEM_CARD = `
.prob{display:flex;align-items:center;gap:14px;padding:16px 20px;background:var(--bg);border:1px solid var(--bd);border-left:3px solid #ef4444;border-radius:var(--r);transition:box-shadow .2s}
.prob:hover{box-shadow:0 4px 12px rgba(0,0,0,.05)}
.prob-ico{flex-shrink:0;width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:rgba(239,68,68,.08);border-radius:8px}
.prob-ico svg{width:18px;height:18px;color:#ef4444}
.prob p{font-size:14px;font-weight:600}
.prob span{font-weight:400;font-size:13px;color:var(--t2)}
`;

/** テスティモニアルカード */
export const TESTIMONIAL_CARD = `
.tm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.tm-card{padding:32px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);position:relative;transition:box-shadow .3s,transform .3s}
.tm-card:hover{box-shadow:0 12px 40px rgba(0,0,0,.08);transform:translateY(-4px)}
.tm-card::before{content:'"';position:absolute;top:12px;right:20px;font-family:Georgia,serif;font-size:64px;color:var(--c);opacity:.1;line-height:1}
.tm-stars{display:flex;gap:3px;margin-bottom:14px}
.tm-text{font-size:15px;color:var(--t1);line-height:1.9;margin-bottom:18px;font-style:italic}
.tm-result{display:inline-block;padding:6px 16px;background:rgba(var(--c-rgb),.1);color:var(--c);font-size:13px;font-weight:800;border-radius:20px;margin-bottom:16px}
.tm-author{display:flex;align-items:center;gap:12px;border-top:1px solid var(--bd);padding-top:16px}
.tm-avatar{width:48px;height:48px;border-radius:50%;background:var(--cg);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px}
.tm-name{font-size:14px;font-weight:800}
.tm-role{font-size:12px;color:var(--t3)}
@media(max-width:750px){.tm-grid{grid-template-columns:1fr}}
`;

/** 比較テーブル */
export const COMPARISON = `
.cmp-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.cmp-card{padding:28px;border:2px solid var(--bd);border-radius:var(--r);background:var(--bg)}
.cmp-us{border-color:var(--c);background:rgba(var(--c-rgb),.02);box-shadow:0 4px 24px rgba(var(--c-rgb),.08)}
.cmp-us::before{content:'RECOMMEND';position:absolute;top:-13px;left:20px;background:var(--c);color:#fff;font-size:10px;font-weight:700;letter-spacing:.15em;padding:4px 14px;font-family:'Inter',sans-serif;border-radius:4px}
.cmp-title{font-size:15px;font-weight:800;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--bd)}
.cmp-us .cmp-title{color:var(--c)}
.cmp-row{display:flex;align-items:flex-start;gap:10px;padding:10px 0;font-size:14px;color:var(--t2)}
.cmp-row strong{color:var(--t1)}
.cmp-muted{background:var(--bg2);border-color:var(--bg2)}
.cmp-muted .cmp-title{color:var(--t3)}
@media(max-width:750px){.cmp-grid{grid-template-columns:1fr}}
`;

/** フローステップ */
export const FLOW = `
.flow-list{position:relative;display:grid;gap:0}
.flow-list::before{content:'';position:absolute;left:28px;top:28px;bottom:28px;width:2px;background:var(--bd)}
.flow-item{display:flex;gap:20px;padding:20px 0}
.flow-num{position:relative;z-index:1;flex-shrink:0;width:56px;height:56px;display:flex;align-items:center;justify-content:center;background:var(--cg);color:#fff;font-family:'Inter',sans-serif;font-weight:900;font-size:20px;border-radius:var(--r)}
.flow-h3{font-weight:700;font-size:15px;margin-bottom:4px}
.flow-desc{font-size:14px;color:var(--t2)}
.flow-body{padding-top:14px}
`;

/** FAQアコーディオン */
export const FAQ = `
.faq-list{display:flex;flex-direction:column;gap:10px}
.faq-item{border:1px solid var(--bd);border-radius:var(--r);overflow:hidden}
.faq-q{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;cursor:pointer;font-weight:700;font-size:15px;list-style:none;transition:background .15s}
.faq-q:hover{background:var(--bg2)}
.faq-q::-webkit-details-marker{display:none}
.faq-q::after{content:'+';font-size:20px;color:var(--t3);transition:transform .25s}
details[open] .faq-q::after{transform:rotate(45deg)}
.faq-a{padding:0 20px 18px;font-size:15px;color:var(--t2);line-height:1.9;border-top:1px solid var(--bd)}
`;

/** カードグリッド（3列→1列レスポンシブ） */
export const CARD_GRID = `
.card-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.card-grid .card{display:flex;flex-direction:column}
.card-ico{color:var(--c);margin-bottom:16px}
.card h3{font-size:16px;font-weight:800;margin-bottom:8px}
.card p{font-size:14px;color:var(--t2);line-height:1.8}
@media(max-width:750px){.card-grid{grid-template-columns:1fr}}
`;

/** スタッツグリッド（4列→2列レスポンシブ） */
export const STATS_GRID = `
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:48px}
.stats-grid .card{text-align:center}
@media(max-width:750px){.stats-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:480px){.stats-grid{grid-template-columns:1fr 1fr;gap:12px}}
`;

/** 強みカード（アクセントカラー版PROBLEM_CARD） */
export const STRENGTH_CARD = `
.str{display:flex;align-items:center;gap:14px;padding:16px 20px;background:var(--bg);border:1px solid var(--bd);border-left:3px solid var(--c);border-radius:var(--r);transition:box-shadow .2s}
.str:hover{box-shadow:0 4px 12px rgba(var(--c-rgb),.08)}
.str-ico{flex-shrink:0;width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:rgba(var(--c-rgb),.08);border-radius:8px}
.str-ico svg{width:18px;height:18px;color:var(--c)}
.str p{font-size:14px;font-weight:600}
.str span{font-weight:400;font-size:13px;color:var(--t2)}
`;
