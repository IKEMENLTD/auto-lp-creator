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

/** テスティモニアルカード（画像付き） */
export const TESTIMONIAL_CARD = `
.tm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.tm-card{overflow:hidden;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);position:relative;transition:box-shadow .3s,transform .3s}
.tm-card:hover{box-shadow:0 12px 40px rgba(0,0,0,.08);transform:translateY(-4px)}
.tm-card-img{width:100%;height:180px;object-fit:cover;display:block}
.tm-card-body{padding:24px;position:relative}
.tm-card-body::before{content:'"';position:absolute;top:8px;right:16px;font-family:Georgia,serif;font-size:56px;color:var(--c);opacity:.1;line-height:1}
.tm-stars{display:flex;gap:3px;margin-bottom:14px}
.tm-text{font-size:15px;color:var(--t1);line-height:1.9;margin-bottom:18px;font-style:italic}
.tm-result{display:inline-block;padding:6px 16px;background:rgba(var(--c-rgb),.1);color:var(--c);font-size:13px;font-weight:800;border-radius:20px;margin-bottom:16px}
.tm-author{display:flex;align-items:center;gap:12px;border-top:1px solid var(--bd);padding-top:16px}
.tm-avatar{width:48px;height:48px;border-radius:50%;background:var(--cg);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px}
.tm-name{font-size:14px;font-weight:800}
.tm-role{font-size:12px;color:var(--t3)}
@media(max-width:750px){.tm-grid{grid-template-columns:1fr}.tm-card-img{height:160px}}
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

/** FAQアコーディオン（dl/dt/dd + JSトグル） */
export const FAQ = `
.faq-list{display:flex;flex-direction:column;gap:10px}
.faq-item{border:1px solid var(--bd);border-radius:var(--r);overflow:hidden}
.faq-q{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;cursor:pointer;font-weight:700;font-size:15px;transition:background .15s;-webkit-user-select:none;user-select:none}
.faq-q:hover{background:var(--bg2)}
.faq-q::after{content:'+';font-size:20px;color:var(--t3);transition:transform .3s;flex-shrink:0}
.faq-item.open .faq-q::after{transform:rotate(45deg)}
.faq-a{display:none;padding:0 20px 18px;font-size:15px;color:var(--t2);line-height:1.9;border-top:1px solid var(--bd)}
.faq-item.open .faq-a{display:block}
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

/** 強みカード（プレミアム版 — グラデアイコン+ホバーリフト+ナンバーバッジ） */
export const STRENGTH_CARD = `
.str-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:960px;margin:0 auto}
.str{position:relative;padding:32px 24px 28px;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);transition:box-shadow .4s,transform .4s,border-color .4s;overflow:hidden}
.str::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--cg);border-radius:var(--r) var(--r) 0 0}
.str:hover{box-shadow:0 16px 48px rgba(var(--c-rgb),.12);transform:translateY(-4px);border-color:rgba(var(--c-rgb),.2)}
.str-num{position:absolute;top:12px;right:16px;font-family:'Inter',sans-serif;font-size:48px;font-weight:900;color:var(--c);opacity:.06;line-height:1}
.str-ico{width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:var(--cg);border-radius:12px;margin-bottom:16px}
.str-ico svg{width:22px;height:22px;color:#fff}
.str h4{font-size:15px;font-weight:800;margin-bottom:6px;color:var(--t1)}
.str p{font-size:14px;color:var(--t2);line-height:1.7;margin:0}
@media(max-width:750px){.str-grid{grid-template-columns:1fr;gap:16px}.str{padding:24px 20px}}
`;

/** カードグリッド・プレミアム版（グラデヘッダー+ホバーグロー+アイコンリング） */
export const SERVICE_CARD = `
.svc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.svc-card{position:relative;background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;transition:box-shadow .4s,transform .4s}
.svc-card:hover{box-shadow:0 20px 60px rgba(var(--c-rgb),.1);transform:translateY(-5px)}
.svc-head{padding:28px 24px 20px;background:linear-gradient(135deg,rgba(var(--c-rgb),.04),rgba(var(--c-rgb),.01));border-bottom:1px solid var(--bd)}
.svc-ico-ring{width:52px;height:52px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:var(--bg);border:2px solid rgba(var(--c-rgb),.15);box-shadow:0 4px 12px rgba(var(--c-rgb),.06);margin-bottom:14px}
.svc-ico-ring svg{width:24px;height:24px;color:var(--c)}
.svc-card h3{font-size:16px;font-weight:800;color:var(--t1);margin:0}
.svc-card h3::after{content:'';display:block;width:24px;height:2px;background:var(--cg);margin-top:10px;border-radius:1px;transition:width .3s}
.svc-card:hover h3::after{width:48px}
.svc-body{padding:20px 24px 28px}
.svc-body p{font-size:14px;color:var(--t2);line-height:1.85;margin:0}
.svc-tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--c);background:rgba(var(--c-rgb),.08);padding:3px 10px;border-radius:4px;margin-top:14px;font-family:'Inter',sans-serif}
@media(max-width:750px){.svc-grid{grid-template-columns:1fr;gap:20px}}
`;

// ============================================================
// コーポレートテーマ（ShtockData風）
// ============================================================

/** コーポレートテーマ: 白背景 + ティールグリーン + ピル型ボタン */
export const CORPORATE_THEME = `
/* コーポレートテーマ上書き */
:root {
  --bg: #ffffff;
  --fg: #333333;
  --c: #1ab394;
  --c-rgb: 26,179,148;
  --cg: linear-gradient(135deg,#1ab394,#16a085);
  --bd: #e8e8e8;
  --muted: #666666;
  --card-bg: #ffffff;
  --card-shadow: 0 0 17.8px 2.2px rgba(0,0,0,.1);
  --sec-alt-bg: #f1f3f5;
  --t1: #333333;
  --t2: #666666;
  --t3: #999999;
  --bg2: #f1f3f5;
  --dark: #2c3e50;
  --ca: #1ab394;
}
body { background: var(--bg); color: var(--fg); }
/* ナビバー: 白背景スクロール変化 */
.hd { background:rgba(255,255,255,.95); backdrop-filter:blur(10px); border-bottom:1px solid var(--bd); }
.hd .hd-logo { color: var(--fg); }
.hd-nav a { color: var(--fg); }
.hd-nav a.btn-accent { background:var(--c); color:#fff; border:none; border-radius:34px; padding:8px 24px; }
/* ヒーロー: 白背景ベース */
.fv { background-color:#f8fafb; min-height:auto; padding:100px 0 120px; }
.fv-overlay { background:none; }
.fv .inner { color:var(--fg); }
.fv-left { text-align:left; }
.fv-badge { color:var(--c); border-color:var(--bd); }
.fv-name { color:var(--muted); }
.fv-headline { color:var(--fg); font-size:clamp(28px,5vw,48px); }
.fv-sub { color:var(--muted); }
.fv-features span { background:var(--sec-alt-bg); border:1px solid var(--bd); color:var(--fg); backdrop-filter:none; }
.fv-features span::before { background:var(--c); }
.fv-stats { background:rgba(255,255,255,.95); border-top:1px solid var(--bd); }
.fv-stat-num { color:var(--c); background:none; -webkit-text-fill-color:var(--c); }
.fv-stat-label { color:var(--muted); }
/* セクション見出し: 2段構成 */
.sec-hd { padding:0 0 40px; }
.sec-eng { color:var(--c); font-size:14px; letter-spacing:3px; text-transform:uppercase; }
.sec-tit { color:var(--fg); font-size:32px; }
.sec-sub { color:var(--muted); }
.sec-bg-txt { display:none; }
/* セクション交互背景 */
section.sec:nth-of-type(even) { background:var(--sec-alt-bg); }
section.sec:nth-of-type(odd) { background:var(--bg); }
/* カード系: 白背景 + 柔影 */
.card { background:var(--card-bg); border:1px solid #f0f0f0; box-shadow:var(--card-shadow); border-radius:12px; }
.card:hover { box-shadow:0 4px 20px rgba(0,0,0,.12); }
/* 課題カード */
.prob { background:var(--card-bg); border:1px solid #f0f0f0; box-shadow:var(--card-shadow); }
.prob p { color:var(--fg); }
.prob span { color:var(--muted); }
/* About: 課題ピル + 解決テキスト */
.about-pain-item { background:var(--sec-alt-bg); border:1px solid var(--bd); color:var(--fg); }
.about-pain-item svg { color:var(--c); }
.about-text h3 { color:var(--fg); }
.about-text p { color:var(--muted); }
.about-img { box-shadow:0 8px 32px rgba(0,0,0,.06); }
/* Features: 画像+アイコン付きカード */
.feat-card { background:var(--card-bg); border:1px solid #f0f0f0; box-shadow:var(--card-shadow); border-radius:12px; overflow:hidden; }
.feat-ico { background:rgba(26,179,148,.08); }
.feat-ico svg { color:var(--c); }
.feat-body h4 { color:var(--fg); }
.feat-body p { color:var(--muted); }
/* ボタン: ピル型 */
.btn { border-radius:34px; }
.btn-lg, .btn-md { border-radius:34px; position:relative; padding-right:40px; }
.btn-lg::after, .btn-md::after { content:">"; position:absolute; right:20px; top:50%; transform:translateY(-50%); font-weight:400; }
.btn-white { background:var(--card-bg); color:var(--c); border:2px solid var(--c); }
.btn-white:hover { box-shadow:0 4px 16px rgba(26,179,148,.2); }
.btn-dark { background:var(--c); color:#fff; border:2px solid var(--c); }
.btn-accent { background:var(--c); color:#fff; border:2px solid var(--c); }
/* 統計 */
.stat-card { background:var(--card-bg); border:1px solid #f0f0f0; }
.stat-num { color:var(--c); background:none; -webkit-text-fill-color:var(--c); }
.stat-label { color:var(--muted); }
/* 比較表 */
.cmp-us { border-color:var(--c); }
.cmp-us::before { background:var(--c); }
.cmp-title { color:var(--fg); }
.cmp-us .cmp-title { color:var(--c); }
.cmp-row { color:var(--fg); }
/* フロー */
.flow-num { background:var(--c); color:#fff; border-radius:50%; }
.flow-list::before { background:var(--bd); }
.flow-h3 { color:var(--fg); }
.flow-desc { color:var(--muted); }
/* 事例カード */
.tm-card { background:var(--card-bg); border:1px solid #f0f0f0; box-shadow:var(--card-shadow); }
.tm-card-body::before { color:var(--c); }
.tm-result { background:rgba(26,179,148,.1); color:var(--c); }
.tm-text { color:var(--fg); }
.tm-name { color:var(--fg); }
.tm-role { color:var(--muted); }
.tm-avatar { background:var(--cg); }
/* FAQ */
.faq-item { background:var(--card-bg); border:1px solid var(--bd); }
.faq-q { color:var(--fg); }
.faq-q::after { color:var(--c); }
.faq-a { color:var(--muted); border-top-color:var(--bd); }
/* CTA中間 */
.offer { background:var(--c); }
.offer::before { display:none; }
.offer-accent { background:var(--c); }
.offer-tit { color:#fff; }
.offer-sub { color:rgba(255,255,255,.7); }
/* CTA */
.cta-sec { background:var(--c); }
.cta-sec::before { display:none; }
.cta-tit { color:#fff; }
.cta-sub { color:rgba(255,255,255,.7); }
/* 中間CTA（セクション間に挿入） */
.mid-cta { text-align:center; padding:30px 0; }
.mid-cta a { display:inline-flex; align-items:center; gap:8px; border-radius:34px; padding:14px 36px; font-weight:700; text-decoration:none; transition:.2s; margin:0 8px; }
.mid-cta a.trial { background:var(--c); color:#fff; }
.mid-cta a.doc { background:var(--card-bg); color:var(--c); border:2px solid var(--c); }
.mid-cta a:hover { opacity:.85; }
/* ヒーローダッシュボード（明るい背景用） */
.hero-dash { background:#fff; border:1px solid var(--bd); box-shadow:0 8px 32px rgba(0,0,0,.08); }
.hero-dash-header { border-bottom:1px solid var(--bd); padding-bottom:14px; margin-bottom:16px; }
.hero-dash-title { color:var(--fg); }
.hero-dash-title::before { background:var(--c); }
.hero-dash-badge { background:rgba(26,179,148,.1); color:var(--c); }
.hero-dash-stat { background:var(--sec-alt-bg); }
.hero-dash-stat-num { color:var(--c); }
.hero-dash-stat-label { color:var(--muted); }
.hero-dash-bars { }
.hero-dash-bar-label { color:var(--muted); }
.hero-dash-bar-track { background:var(--bd); }
.hero-dash-bar-fill { background:var(--cg); }
.hero-dash-bar-pct { color:var(--fg); }
.hero-dash-footer { border-top:1px solid var(--bd); }
.hero-dash-footer-dot { background:var(--c); }
.hero-dash-footer-text { color:var(--muted); }
/* ロゴ帯 */
.logo-strip { border-bottom:1px solid var(--bd); background:var(--bg); }
.logo-strip-label { color:var(--muted); }
.logo-strip-item { color:var(--t2); opacity:.45; }
.logo-strip-item:hover { opacity:.7; }
/* 選ばれる理由 */
.reason-card { background:var(--card-bg); border:1px solid #f0f0f0; box-shadow:var(--card-shadow); border-radius:12px; }
.reason-num-badge { background:var(--c); }
.reason-body h4 span { color:var(--c); }
.reason-body p { color:var(--muted); }
/* 活用シーン */
.uc-card { background:var(--card-bg); border:1px solid #f0f0f0; box-shadow:var(--card-shadow); border-radius:12px; }
.uc-ico { background:rgba(255,255,255,.2); backdrop-filter:blur(8px); }
.uc-ico svg { color:#fff; }
.uc-card-body h4 { color:var(--fg); }
.uc-card-body p { color:var(--muted); }
/* コラム記事 */
.col-card { background:var(--card-bg); border:1px solid #f0f0f0; box-shadow:var(--card-shadow); }
.col-body h4 { color:var(--fg); }
.col-body p { color:var(--muted); }
.col-tag { color:var(--c); }
/* フッター */
.ft { background:#2c3e50; color:rgba(255,255,255,.7); border-top:none; }
.ft-company { color:rgba(255,255,255,.9); }
.ft-address { color:rgba(255,255,255,.5); }
.ft-copy { color:rgba(255,255,255,.4); }
.ft-links a { color:rgba(255,255,255,.5); }
.ft-links a:hover { color:#fff; }
/* 波ディバイダーを非表示（コーポレートはborder線に） */
.dvd { display:none; }
/* マイクロコピー */
.micro-light { color:rgba(255,255,255,.5); }
.micro-light svg { stroke:var(--ca); }
.micro-dark { color:var(--muted); }
.micro-dark svg { stroke:var(--c); }
/* ドット背景無効化 */
.dot-bg { background-image:none; }
/* モバイル調整 */
@media(max-width:768px){
  .sec-tit { font-size:22px; }
  .hd-nav a.btn-accent { font-size:12px; padding:6px 16px; }
  .mid-cta a { padding:10px 24px; font-size:14px; }
  .str-ico { width:48px; height:48px; }
  .fv-headline { font-size:clamp(22px,5vw,32px); }
}
@media(max-width:480px){
  .mid-cta { display:flex; flex-direction:column; align-items:center; gap:8px; }
  .mid-cta a { margin:0; width:80%; justify-content:center; }
}
/* corporate trust badges */
.trust-badge-item { background:rgba(26,179,148,.1); border-color:rgba(26,179,148,.25); color:var(--c); }
.trust-badge-item svg { color:var(--c); }
`;
