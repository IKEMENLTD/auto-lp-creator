# LP Engine - アーキテクチャ図

## システム全体像

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ブラウザ (React SPA)                         │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │SessionStart│ │Dashboard │  │Transcript│  │ DeliverableGrid   │   │
│  │  ページ   │→│  ページ  │  │  View    │  │ (LP/広告/議事録)  │   │
│  └──────────┘  └────┬─────┘  └──────────┘  └────────┬──────────┘   │
│                     │                                │              │
│         ┌───────────┴────────────────────────────────┘              │
│         │  useSession (状態管理 Hook)                               │
│         │  useAudioCapture (音声キャプチャ Hook)                     │
│         │                                                           │
│         ▼  src/lib/api.ts                                           │
│  ┌─────────────────────────────────────────────────┐               │
│  │ fetchWithTimeout → POST /api/*                  │               │
│  └──────────────────────┬──────────────────────────┘               │
└─────────────────────────┼───────────────────────────────────────────┘
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Netlify Edge / CDN                                │
│                                                                     │
│  dist/index.html + assets (Vite build)                             │
│  SPA fallback: /* → /index.html                                    │
│  CORS headers: /.netlify/functions/*, /api/*                       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ /api/* → Netlify Functions v2
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Netlify Functions (サーバーレス)                     │
│                  timeout: 26秒 (free tier max)                      │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    セッション管理                             │   │
│  │                                                             │   │
│  │  session-start.ts   POST /api/session/start                 │   │
│  │  session-status.ts  GET  /api/session-status                │   │
│  │  session-data.ts    PATCH /api/session/:id/data             │   │
│  │  session-end.ts     POST /api/session/:id/end               │   │
│  │  session-share.ts   POST /api/session/:id/share             │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                    AI処理パイプライン                         │   │
│  │                                                             │   │
│  │  ┌─────────────────┐  Sonnet   ┌─────────────────────┐     │   │
│  │  │ detect-companies │─────────→│ Anthropic Claude API │     │   │
│  │  │ POST /api/detect │  (1000)  │                     │     │   │
│  │  └─────────────────┘          │  claude-sonnet-4     │     │   │
│  │                               │  (企業検出・抽出用)   │     │   │
│  │  ┌─────────────────┐  Sonnet  │                     │     │   │
│  │  │ extract-preview  │─────────→│  claude-haiku-4.5   │     │   │
│  │  │ POST /api/extract│  (2500)  │  (LP生成用・高速)    │     │   │
│  │  └─────────────────┘          └─────────────────────┘     │   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │ generate-lp.ts  POST /api/generate-lp               │   │   │
│  │  │                                                     │   │   │
│  │  │  LP 3ステップパイプライン:                            │   │   │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │   │
│  │  │  │ Step 1   │→│ Step 2   │→│ Step 3           │  │   │   │
│  │  │  │ Draft    │  │ Evaluate │  │ Build HTML       │  │   │   │
│  │  │  │ (Haiku)  │  │ (Haiku)  │  │ (テンプレート)    │  │   │   │
│  │  │  │ 4000tok  │  │ 4000tok  │  │ API呼出なし      │  │   │   │
│  │  │  └──────────┘  └──────────┘  └────────┬─────────┘  │   │   │
│  │  │                                       │            │   │   │
│  │  │  LP以外 (ad_creative, minutes等):      │            │   │   │
│  │  │  Sonnet 1ステップ → HTML生成            │            │   │   │
│  │  └────────────────────────────────────────┼───────────┘   │   │
│  └───────────────────────────────────────────┼───────────────┘   │
│                                              │                     │
│  ┌───────────────────────────────────────────▼───────────────────┐ │
│  │                    ストレージ                                  │ │
│  │                                                               │ │
│  │  Netlify Blobs ("deliverables" store)                        │ │
│  │  Key: {sessionId}/{type}  →  Value: HTML string              │ │
│  │                                                               │ │
│  │  view-deliverable.ts  GET /view/:sessionId/:type             │ │
│  │  → Blobsから取得 → HTML返却                                   │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  webhook-tldv.ts     POST /api/webhook/tldv                  │ │
│  │  transcribe-chunk.ts POST /api/transcribe-chunk              │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## LP生成パイプライン詳細

```
クライアント (useSession.ts)
    │
    │ Step 1: POST /api/generate-lp {step:"draft", transcript, extracted_data}
    ▼
┌──────────────────────────────────────────────┐
│  lpDraft()                                   │
│  Model: claude-haiku-4.5 (速度重視)          │
│  max_tokens: 4000                            │
│  入力: トランスクリプト(4000字) + 抽出データ   │
│  出力: LpContent JSON (20+フィールド)         │
│  所要時間: 8-16秒                             │
└──────────────────┬───────────────────────────┘
                   │ {success:true, content: LpContent}
                   ▼
    │ Step 2: POST /api/generate-lp {step:"evaluate", draft_content}
    ▼
┌──────────────────────────────────────────────┐
│  lpEvaluate()                                │
│  Model: claude-haiku-4.5 (速度重視)          │
│  max_tokens: 4000                            │
│  入力: DraftのJSON + 企業情報                 │
│  出力: 修正版 LpContent JSON                  │
│  所要時間: 8-16秒                             │
│  ※失敗時はDraftをそのまま使用(フォールトトレラント) │
└──────────────────┬───────────────────────────┘
                   │ {success:true, content: LpContent}
                   ▼
    │ Step 3: POST /api/generate-lp {step:"build", draft_content}
    ▼
┌──────────────────────────────────────────────┐
│  buildLpHtml()                               │
│  API呼出なし (テンプレートエンジン)            │
│  入力: LpContent + FlatData                  │
│  処理:                                       │
│    1. 業種→カラーパレット (getDecoColors)     │
│    2. LpContent → HTML (プロテンプレート)     │
│    3. Netlify Blobsに保存                    │
│  出力: 完全なHTML (CSS/JS込み、外部依存なし)   │
│  所要時間: <1秒                               │
└──────────────────┬───────────────────────────┘
                   │ {success:true, html, view_url}
                   ▼
          /view/{sessionId}/lp で閲覧可能
```

## 生成LP HTMLの構造

```
┌─────────────────────────────────────────┐
│  HEADER (固定ナビ + CTAボタン)           │  ← position:fixed
├─────────────────────────────────────────┤
│  HERO                                   │
│  ┌─────────────┬───────────────────┐   │
│  │ badge_text  │                   │   │
│  │ headline    │  Visual (数値)    │   │
│  │ hero_sub    │                   │   │
│  │ [features]  │                   │   │
│  │ CTA + micro │                   │   │
│  └─────────────┴───────────────────┘   │
│  ┌─ stats bar (4列 KPI) ──────────┐   │
├──┴─────────────────────────────────┴───┤
│  ABOUT (sec-bg-txt背景 + fade-in)      │
│  ┌─ about_text ─┬─ problems ×3 ──┐   │
│  └──────────────┴─────────────────┘   │
│  [transition_text ボーダーボックス]      │
├─────────────────────────────────────────┤
│  FEATURES (dot-bg装飾 + 左右交互)       │
│  ┌─ FEATURE 01 ──────────────────┐    │
│  │ [テキスト] | [ビジュアル]       │    │
│  ├─ FEATURE 02 ──────────────────┤    │
│  │ [ビジュアル] | [テキスト] (RTL) │    │
│  └────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  MID CTA 1 (ダーク背景 + urgency)       │  ← CTA #2
├─────────────────────────────────────────┤
│  TESTIMONIALS (お客様の声 ×3)           │
│  ┌──────┐ ┌──────┐ ┌──────┐           │
│  │ 星5  │ │ 星5  │ │ 星5  │           │
│  │ 体験談│ │ 体験談│ │ 体験談│           │
│  │ 成果  │ │ 成果  │ │ 成果  │           │
│  │ 著者  │ │ 著者  │ │ 著者  │           │
│  └──────┘ └──────┘ └──────┘           │
├─────────────────────────────────────────┤
│  MERIT (カード ×3 + ホバーアニメ)       │
├─────────────────────────────────────────┤
│  MID CTA 2                              │  ← CTA #3
├─────────────────────────────────────────┤
│  COMPARISON (自社 vs 一般企業)           │
│  ┌──────────┬──────────┐               │
│  │RECOMMEND │ 一般企業  │               │
│  │ ✓ 自社   │ ✕ 他社   │               │
│  └──────────┴──────────┘               │
├─────────────────────────────────────────┤
│  FLOW (ステップ ×4 + 縦線)              │
├─────────────────────────────────────────┤
│  FAQ (アコーディオン ×4)                 │
├─────────────────────────────────────────┤
│  COMPANY (ロゴ + 会社概要)               │
├─────────────────────────────────────────┤
│  FINAL CTA (ダーク + urgency + micro)   │  ← CTA #4
├─────────────────────────────────────────┤
│  FOOTER                                 │
├─────────────────────────────────────────┤
│  MOBILE STICKY CTA                      │  ← モバイルのみ
└─────────────────────────────────────────┘

CSS特徴:
  - カスタムプロパティ (--c, --cg, --ca, --r:10px)
  - 業種別カラーパレット (getDecoColors)
  - スクロールアニメーション (.fi → .vis)
  - dot-bg装飾パターン
  - sec-bg-txt (大きな英語背景テキスト)
  - 外部依存なし (フォント以外)
```

## フロントエンド コンポーネント構成

```
App.tsx
  ├── SessionStart.tsx (セッション開始ページ)
  │
  └── Dashboard.tsx (メインダッシュボード)
        ├── StatusBar.tsx (接続状態)
        ├── ActionBar.tsx (録音開始/停止)
        ├── RecordingControls.tsx (音声キャプチャ制御)
        ├── CompanySelector.tsx (対象企業選択)
        ├── TranscriptView.tsx (文字起こし表示)
        ├── ExtractionCards.tsx (抽出データ表示/編集)
        │     └── EditFieldModal.tsx
        └── DeliverableGrid.tsx (制作物一覧)
              └── DeliverableCard.tsx ×7
                    状態: insufficient → ready → generating → completed

Hooks:
  useSession.ts    - セッション状態管理、API呼出、LP 3ステップパイプライン
  useAudioCapture.ts - マイク/タブ音声キャプチャ

Lib:
  api.ts           - fetchWithTimeout、API関数群
  constants.ts     - フィールドラベル、必須フィールド定義
  supabase-client.ts - Supabase接続 (将来用)
  audio-capture.ts - Web Audio API ユーティリティ
```

## モデル使い分け戦略

```
┌────────────────────┬───────────────────┬──────────┬───────────┐
│ 機能               │ モデル             │ max_tok  │ 理由      │
├────────────────────┼───────────────────┼──────────┼───────────┤
│ 企業検出           │ Sonnet 4          │ 1000     │ 出力少    │
│ データ抽出         │ Sonnet 4          │ 2500     │ 出力中    │
│ LP Draft          │ Haiku 4.5         │ 4000     │ 速度重視  │
│ LP Evaluate       │ Haiku 4.5         │ 4000     │ 速度重視  │
│ 広告クリエイティブ  │ Sonnet 4          │ 2500     │ 出力少    │
│ 議事録             │ Sonnet 4          │ 3000     │ 出力中    │
│ 汎用 (チラシ等)    │ Sonnet 4          │ 4000     │ デフォルト │
└────────────────────┴───────────────────┴──────────┴───────────┘

制約: Netlify Functions free tier = 26秒タイムアウト
  Sonnet: 60-100 tok/秒 → 4000tok = 40-66秒 → NG
  Haiku:  200-400 tok/秒 → 4000tok = 10-20秒 → OK
```

## デプロイ情報

```
サイト:    https://lp-engine-rt.netlify.app
Site ID:   a3940846-f6f3-4b5d-8424-a7802f7832b2
ビルド:    npm run build:client (Vite)
Functions: netlify/functions/ (esbuild bundler)
ストレージ: Netlify Blobs ("deliverables")
環境変数:  ANTHROPIC_API_KEY
```
