# ARCHITECTURE.md — リアルタイムアポ制作物自動生成システム

> **Updated**: 2026-03-10 | auto-lp-creator

## 概要

商談中にリアルタイムで音声→文字起こし→AI分析→制作物9種を自動生成するWebアプリ。

| 項目 | 値 |
|------|-----|
| リポジトリ | `github.com/IKEMENLTD/auto-lp-creator` |
| デプロイ | `auto-lp-creator.netlify.app` |
| ローカル | `/tmp/lp_engine/netlify/` |
| スタック | React + Netlify Functions v2 + Claude API + Whisper(Groq) + Gemini Imagen + Supabase |

---

## ディレクトリ構成

```
/tmp/lp_engine/netlify/
├── src/                                    # React Frontend
│   ├── pages/
│   │   ├── Dashboard.tsx                   # メイン画面（SPA、状態遷移で全画面管理）
│   │   └── SessionStart.tsx                # 未使用
│   ├── components/
│   │   ├── StatusBar.tsx                   # 上部バー（経過時間・ステータス・戻るボタン）
│   │   ├── RecordingControls.tsx           # 録音操作（開始/一時停止/停止/新規）
│   │   ├── TranscriptView.tsx             # リアルタイム文字起こし表示
│   │   ├── CompanySelector.tsx            # 企業選択モーダル
│   │   ├── ExtractionCards.tsx            # 抽出情報カード（confidence表示）
│   │   ├── DeliverableGrid.tsx            # 制作物9種グリッド
│   │   ├── DeliverableCard.tsx            # 個別カード（4ステータス + PDF出力）
│   │   ├── EditFieldModal.tsx             # フィールド手動編集
│   │   └── ActionBar.tsx                  # アクションバー（共有: LINE/メール/QR/クリップボード）
│   ├── hooks/
│   │   ├── useSession.ts                  # セッション状態管理（抽出・生成・ジョブ・localStorage永続化）
│   │   └── useAudioCapture.ts             # デュアルストリーム音声キャプチャ
│   ├── lib/
│   │   ├── api.ts                         # HTTP client（fetchWithTimeout 120s）
│   │   ├── audio-capture.ts               # MediaRecorder + Whisper送信
│   │   ├── constants.ts                   # フィールドラベル・必須フィールド・表示順
│   │   └── supabase-client.ts             # Supabase ブラウザクライアント
│   ├── types/
│   │   └── dashboard.ts                   # DeliverableType(9種), ExtractedDataMap, GenerationJob
│   ├── App.tsx                            # ルート（Dashboard直接レンダリング）
│   ├── main.tsx                           # Viteエントリ
│   └── index.css                          # グローバルCSS
│
├── netlify/functions/                      # Netlify Functions v2（サーバーレス）
│   ├── generate-lp.ts                     # POST /api/generate-lp  ★メインオーケストレータ（~1430行）
│   ├── generate-images.ts                 # POST /api/generate-images（Haiku→Gemini Imagen画像生成）
│   ├── extract-preview.ts                 # POST /api/extract-preview（Haiku抽出）
│   ├── detect-companies.ts                # POST /api/detect-companies（Sonnet企業検出）
│   ├── transcribe-chunk.ts                # POST /api/transcribe-chunk（Whisper文字起こし）
│   ├── view-deliverable.ts                # GET  /view/:session_id/:type（Blob→HTML配信）
│   ├── session-start.ts                   # POST /api/session/start
│   ├── session-status.ts                  # GET  /api/session-status
│   ├── session-data.ts                    # PATCH /api/session/:id/data（stub）
│   ├── session-end.ts                     # POST /api/session/:id/end（stub）
│   ├── session-share.ts                   # POST /api/session/:id/share（stub）
│   ├── webhook-tldv.ts                    # POST /api/webhook/tldv（tl;dv連携）
│   ├── templates/
│   │   └── lp-components.ts               # CSSコンポーネント集（18種: 17種 + CORPORATE_THEME）
│   └── lib/
│       ├── types.ts                       # バックエンド型定義
│       ├── haiku-client.ts                # Haiku抽出エンジン（confidence付きマージ）
│       ├── sonnet-prompts.ts              # コピー生成プロンプト集
│       ├── deliverable-prompts.ts         # 構造化生成プロンプト集
│       ├── replace-engine.ts              # テンプレート置換エンジン（{{}} / data-placeholder）
│       ├── deploy.ts                      # Netlify APIデプロイ
│       ├── supabase.ts                    # Supabaseサーバークライアント
│       └── audio-pipeline.ts              # 音声パイプライン
│
├── supabase/migrations/                    # DBスキーマ
│   ├── 001_initial_schema.sql             # sessions, chunks, extracted_data, generation_jobs, templates, analytics
│   ├── 002_realtime_and_functions.sql
│   └── seed.sql
│
├── tests/                                  # Jest ESMテスト（11ファイル）
├── dist/                                   # Viteビルド出力（index.html + assets/）
│
├── netlify.toml                            # Netlify設定（ルーティング・タイムアウト・ヘッダー）
├── vite.config.ts                          # Vite設定（root:src, proxy:/api→8888）
├── tsconfig.json                           # Functions用（ES2022, strict）
├── tsconfig.frontend.json                  # React用（ESNext, react-jsx）
├── package.json                            # 依存関係・スクリプト
└── tailwind.config.js                      # Tailwind CSS
```

---

## データフロー

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                        │
│  Dashboard.tsx → useSession + useAudioCapture                │
└────┬──────────────────┬──────────────────┬──────────────────┘
     │ マイク/画面共有     │ テキスト貼り付け    │ 制作物生成ボタン
     ▼                   ▼                   │
┌─────────────┐   ┌──────────────┐          │
│ Whisper(Groq)│   │ 直接テキスト  │          │
│ 7秒チャンク   │   │ 入力          │          │
└────┬────────┘   └─────┬────────┘          │
     │ transcriptChunks  │                   │
     └────────┬──────────┘                   │
              ▼                              │
     ┌────────────────┐                      │
     │ detect-companies│ POST /api/detect-companies
     │ (Sonnet 4)      │ → 企業名リスト抽出
     └───────┬────────┘                      │
             ▼                               │
     ┌────────────────┐                      │
     │ CompanySelector │ → target_company選択  │
     └───────┬────────┘                      │
             ▼                               │
     ┌────────────────┐                      │
     │extract-preview │ POST /api/extract-preview
     │(Haiku 4.5)     │ → 14フィールド + confidence
     │チャンク分割対応  │ → 4000字×最大5チャンク
     └───────┬────────┘                      │
             │ extractedData                  │
             ▼                               ▼
     ┌─────────────────────────────────────────┐
     │ generate-lp (POST /api/generate-lp)     │
     │                                         │
     │  LP (3ステップ):                         │
     │    Draft  → Haiku 4000tok               │
     │    Evaluate → Haiku 4000tok (+transcript)│
     │    Build  → HTMLテンプレート構築           │
     │                                         │
     │  LP以外 (1ステップ):                      │
     │    ad_creative → Sonnet                  │
     │    minutes → Sonnet                      │
     │    proposal → Generic (Sonnet)            │
     │    system_proposal → Generic (Sonnet)     │
     │    その他 → Generic (Sonnet)              │
     └───────┬─────────────────────────────────┘
             │ HTML
             ▼
     ┌────────────────┐
     │ Netlify Blobs  │ key: {sessionId}/{type}
     └───────┬────────┘
             ▼
     GET /view/{sessionId}/{type} → HTML配信（Cache 1h）

             │ （非同期・オプション）
             ▼
     ┌─────────────────────────────────────────┐
     │ generate-images (POST /api/generate-images)│
     │                                           │
     │  Step 1: Haiku → 英語画像プロンプト生成    │
     │  Step 2: Gemini Imagen 3.0 → 画像生成(並列) │
     │  Step 3: Netlify Blobs → 画像保存          │
     │  Step 4: 既存HTML → data-img属性で画像埋込  │
     └───────────────────────────────────────────┘
```

---

## AIモデル使い分け

| モデル | 用途 | Max Tokens | 速度 | 理由 |
|--------|------|-----------|------|------|
| `claude-haiku-4-5-20251001` | LP draft/evaluate, extract-preview | 2000-4000 | 200-400 tok/s | 26秒制限内に確実に収まる |
| `claude-sonnet-4-20250514` | detect-companies, ad_creative, minutes, generic | 1000-2500 | 60-100 tok/s | 出力量が少ない用途のみ |
| `gemini-imagen-3.0-generate-002` | LP画像生成（hero/about/reason等） | - | 5-15s/枚 | Haiku→プロンプト→Gemini Imagen（REST直接） |

---

## 制作物9種

| # | type | ラベル | アイコン | 生成方式 | 必須フィールド |
|---|------|--------|---------|---------|--------------|
| 1 | `lp` | LP | Globe | 3ステップ（Haiku） | company_name, service_name, industry, target_customer, strengths |
| 2 | `ad_creative` | 広告 | Megaphone | 1ステップ（Sonnet） | company_name, service_name, target_customer, strengths |
| 3 | `flyer` | チラシ | FileText | Generic（Sonnet） | company_name, service_name, target_customer, strengths |
| 4 | `hearing_form` | フォーム | ClipboardList | Generic（Sonnet） | industry, service_name |
| 5 | `line_design` | LINE設計 | MessageCircle | Generic（Sonnet） | company_name, service_name, target_customer |
| 6 | `minutes` | 議事録 | NotebookPen | 1ステップ（Sonnet） | company_name |
| 7 | `profile` | プロフィール | User | Generic（Sonnet） | company_name, service_name, strengths, target_customer |
| 8 | `system_proposal` | システム提案 | Code | Generic（Sonnet） | company_name, service_name, target_customer, pain_points |
| 9 | `proposal` | 提案資料 | Presentation | Generic（Sonnet） | company_name, service_name, target_customer, strengths, pain_points |

### 提案資料（proposal）の生成セクション

| # | セクション | 内容 |
|---|-----------|------|
| 1 | ご挨拶・御礼 | 商談の要点振り返り + 感謝 |
| 2 | 貴社の現状と課題 | 相手の言葉を引用形式で列挙（「○○とのこと」） |
| 3 | ご提案内容 | 課題に対する具体的解決策 |
| 4 | 弊社の強み・実績 | 数字付き実績（商談で言及したもののみ。捏造厳禁） |
| 5 | ご提供プラン・料金 | 価格帯・プラン構成・支払い条件 |
| 6 | 導入スケジュール | フェーズ分け + 期間目安 |
| 7 | 期待される効果 | 定量的（コスト削減額、売上向上率等） |
| 8 | 次のステップ | 具体的アクション + 期限 |
| 9 | 会社概要 | 社名・代表・所在地・設立・主要事業 |

---

## LP生成パイプライン詳細

### Step 1: Draft（設計+コピー生成）
- **モデル**: Haiku 4.5 / 4000 tokens
- **入力**: LP_DRAFT_PROMPT + bizContext（transcript + 抽出データ）
- **出力**: `LpContent` JSON（19フィールド）
- **情報帰属ルール**: 協業サービスOK / 他社の社内指標NG

### Step 2: Evaluate（品質評価+修正）
- **モデル**: Haiku 4.5 / 4000 tokens
- **入力**: LP_EVALUATE_PROMPT + draft JSON + transcript（先頭4000字）
- **出力**: 修正済み `LpContent` JSON
- **チェック項目**: person_name検証, 数字使い回し, 情報帰属

### Step 3: Build（HTML構築）
- **API不要**（テンプレート置換のみ）
- **入力**: 修正済みLpContent + FlatData + 業種別画像
- **出力**: 完全なHTML（CSSコンポーネント内包）+ テーマ自動選択（dark/corporate）
- **後処理**: sanitizePersonName() → Netlify Blobs保存

### Step 4: 画像生成（非同期・オプション）
- **エンドポイント**: POST /api/generate-images（フロントエンドから非同期呼び出し）
- **パイプライン**: Haiku（英語プロンプト生成）→ Gemini Imagen 3.0（画像生成）→ Blob保存 → HTML更新
- **制約**: 1回最大3枚並列、GOOGLE_API_KEY未設定時はスキップ
- **画像スロット**: hero(16:9), about(1:1), reason1-3(1:1), badge(1:1)
- **HTML埋め込み**: data-img属性で識別、background-imageとして設定

### LPテーマシステム
- **dark**: デフォルト（暗い背景、ネオンアクセント）
- **corporate**: 業種自動判定で選択（白背景、ティールグリーン#1ab394、pillボタン）
- **判定ロジック**: `selectTheme()` — コンサル/金融/IT/医療等 → corporate、それ以外 → dark
- **実装方式**: CORPORATE_THEMEをCSS cascadeでdarkテーマの後に追記して上書き

### LpContent インターフェース
```typescript
interface LpContent {
  person_name: string;      // sanitizePersonName()で検証
  person_title: string;
  hero_headline: string;    // 30字以内
  hero_sub: string;         // 50字以内
  hero_features: string[];  // 実績数字x3
  badge_text: string;       // 12字以内
  problems: { title: string; desc: string }[];       // 3-4個
  solution_title: string;   // 25字以内
  solution_text: string;    // 120字以内
  strengths: { title: string; desc: string }[];      // 3個
  services: { title: string; desc: string }[];       // 3個
  stats: { number: string; label: string }[];        // 4個
  cases: { category: string; detail: string; result: string }[];  // 0-3個（捏造厳禁）
  comparison: { feature: string; us: string; other: string }[];   // 4-5行
  flow: { title: string; desc: string }[];           // 4個
  faq: { q: string; a: string }[];                   // 4個
  cta_text: string;         // 8字以内
  cta_sub: string;          // 20字以内
  company_profile: string;  // 80字
}
```

---

## LP HTMLテンプレート構成

```
Header (固定ナビ: ロゴ + Solution/Service + CTAボタン)
  |
Hero (背景画像 + オーバーレイ + ヘッドライン + バッジ + features)
  ├── fv-stats (実績数字バー: 4列→2x2レスポンシブ)
  |
Wave divider
  |
Problems セクション (PROBLEM_CARD: 赤左ボーダー)
  |
Wave divider
  |
Solution セクション (STRENGTH_CARD premium: 3列グリッド + グラデアイコン + ナンバーバッジ)
  |
Service セクション (SERVICE_CARD premium: グラデヘッダー + アイコンリング + 下線アニメ)
  |
Wave concave (大きな凹みカーブ 120px)
  |
CTA accent (青背景: 相談ボタン + マイクロコピー)
  |
横線 (border-top)
  |
Comparison セクション (COMPARISON: 2列比較 + RECOMMENDバッジ)
  |
Cases セクション (TESTIMONIAL_CARD転用: 実績カード)
  |
Stats セクション (CARD_STAT + STATS_GRID: 4列→2列)
  |
Flow セクション (FLOW: タイムライン形式)
  |
Company + FAQ セクション
  |
Wave divider (山+谷シンプル)
  |
Final CTA (dark背景)
  |
Footer
  |
Mobile CTA Bar (固定下部: 750px以下で表示)
```

### CSSコンポーネント（18種 / lp-components.ts）

| コンポーネント | 用途 |
|--------------|------|
| SCROLL_ANIM | フェードイン（.fi → .fi.vis） |
| SEC_HEADER | セクションヘッダー（背景テキスト + 英字 + タイトル） |
| WAVE_DIVIDER | ウェーブ区切り（72px / モバイル48px） |
| DOT_BG | ドットパターン背景 |
| CARD_BORDERED | 枠付きカード（ホバーリフト） |
| CARD_STAT | 数字ハイライトカード（グラデテキスト） |
| BTN_PRIMARY | CTAボタン（white/dark/accent） |
| MICRO_COPY | マイクロコピー（安心テキスト） |
| PROBLEM_CARD | 問題カード（赤左ボーダー） |
| STRENGTH_CARD | 強みカード premium（3列グリッド + グラデライン + ナンバーバッジ） |
| SERVICE_CARD | サービスカード premium（グラデヘッダー + アイコンリング + 下線アニメ） |
| TESTIMONIAL_CARD | テスティモニアル（引用マーク + 星 + アバター） |
| COMPARISON | 比較テーブル（2列 + RECOMMENDバッジ） |
| CARD_GRID | 3列→1列レスポンシブグリッド |
| STATS_GRID | 4列→2列レスポンシブグリッド |
| FLOW | フローステップ（タイムライン + 番号バッジ） |
| FAQ | アコーディオン（details/summary） |
| CORPORATE_THEME | コーポレートテーマ上書き（白背景/ティール/pill/ソフトシャドウ） |

---

## レスポンシブ対応（3ブレークポイント）

| ブレークポイント | 主な変更 |
|----------------|---------|
| デスクトップ (751px+) | 4列stats、3列カード、フルナビ |
| タブレット (750px) | 2x2 stats(relative)、1列カード、ナビ非表示、モバイルCTAバー表示、wave-tall:72px |
| モバイル (480px) | stats 18px/9px、sec-bg-txt 36px、全パーツpadding/font縮小、wave-tall:56px |

---

## フロントエンド状態遷移

```
idle --+--> recording <-> paused --> selecting --> ended
       |                                           ^
       +--> pasting -------------------> selecting -+
                                          |
                                          +--> ended（企業未検出時）
```

| 状態 | 画面 | 戻るボタン | 行き先 |
|------|------|-----------|--------|
| `idle` | ホーム（録音/貼り付け選択） | なし | エントリーポイント |
| `recording` | ダッシュボード（StatusBar） | あり | → idle（録音停止） |
| `paused` | ダッシュボード（StatusBar） | あり | → idle |
| `pasting` | テキスト入力画面 | あり | → idle |
| `selecting` | 企業選択画面 | あり | → ended |
| `ended` | ダッシュボード（結果表示） | あり | → idle |

---

## 音声キャプチャ（デュアルストリーム）

| ストリーム | API | ラベル | 用途 |
|-----------|-----|--------|------|
| マイク | `getUserMedia({ audio: true })` | "自分" | 自分の発言 |
| システム音声 | `getDisplayMedia({ audio: true })` | "相手" | Google Meet等の相手の声 |

- チャンク間隔: 7秒
- フォーマット: WebM/Opus（フォールバック: Ogg, MP4）
- 音質: 16kHz, 32kbps, echoCancellation, noiseSuppression
- 文字起こし: Groq Whisper `whisper-large-v3`（フォールバック: OpenAI `whisper-1`）

---

## 制約・定数

| 定数 | 値 | 理由 |
|------|-----|------|
| 関数タイムアウト | 26秒 | Netlify無料プラン上限 |
| フロントエンドタイムアウト | 120秒 | fetchWithTimeout |
| TRANSCRIPT_MAX_CHARS | 8000 | LP生成時のトランスクリプト上限 |
| CHUNK_SIZE | 4000字 | extract-preview分割単位 |
| CHUNK_OVERLAP | 500字 | チャンク間重複 |
| MAX_CHUNKS | 5 | コスト制限 |
| LP_MODEL max_tokens | 4000 | Draft/Evaluate |
| extract max_tokens | 2000 | Haiku抽出 |
| Confidence閾値 | 0.6 | フィールド充足判定 |
| Blob Cache | 3600秒 | /view/* の Cache-Control |
| Claude APIリトライ | 3回 | 指数バックオフ 1s→2s→4s（overloaded/rate_limit/5xx） |
| Rate Limit (generate-lp) | 20回/分/session | インメモリMap（サーバーレスのためベストエフォート） |
| Rate Limit (extract-preview) | 30回/分/session | 同上 |
| Rate Limit (generate-images) | 5回/分/session | 画像生成は重いため厳しめ |
| MAX_IMAGES_PER_REQUEST | 3枚 | タイムアウト対策で1回3枚まで並列 |
| Gemini API Timeout | 20秒 | 画像生成1枚あたり |
| localStorage TTL | 24時間 | セッション永続化（最大10セッション） |

---

## 環境変数

```
ANTHROPIC_API_KEY          # Claude API（必須）
GROQ_API_KEY               # Whisper文字起こし
OPENAI_API_KEY             # Whisperフォールバック
GOOGLE_API_KEY             # Gemini Imagen画像生成（オプション、未設定時はスキップ）
NETLIFY_AUTH_TOKEN         # デプロイAPI
SUPABASE_URL               # DB接続
SUPABASE_ANON_KEY          # ブラウザ用
SUPABASE_SERVICE_ROLE_KEY  # サーバー用
TLDV_WEBHOOK_SECRET        # tl;dv Webhook検証（オプション）
```

---

## ビルド・開発

```bash
npm run dev                # Vite開発サーバー
npm run dev:netlify        # Netlifyローカルエミュレーション（port 8888）
npm run build:client       # 本番ビルド → dist/
npm run typecheck          # Functions型チェック
npm run typecheck:frontend # React型チェック
npm run test               # Jest ESMテスト
```

---

## 主要な設計判断

1. **Haiku vs Sonnet**: LP生成は26秒制限のためHaiku一択。Sonnetは出力少量の用途のみ
2. **3ステップLP**: draft→evaluateで品質を上げ、buildはAPI不要（テンプレート置換）
3. **情報帰属ルール**: 協業サービスは記載OK、他社の社内指標はNG
4. **sanitizePersonName**: Whisper誤認識対策（key_persons照合 + 長さチェック）
5. **evaluateにtranscript**: 情報帰属チェックに原文が必要（先頭4000字）
6. **デュアルストリーム**: Google Meet等で自分/相手の音声を分離キャプチャ
7. **Netlify Blobs**: 生成HTMLの永続化。URLは `/view/{sessionId}/{type}`
8. **CSSコンポーネント分離**: lp-components.tsで18種を管理、generate-lp.tsのHTML内にインライン展開
9. **テーマ自動選択**: 業種/サービス名でdark/corporateを判定、CSS cascade overrideで実装
10. **画像生成分離**: 別エンドポイント（generate-images）で非同期実行、LP生成の26秒制限に影響しない
11. **localStorage永続化**: セッション状態をlocalStorageに自動保存（24h TTL、最大10件）、ブラウザリロード耐性
12. **PDF出力**: window.print()によるブラウザネイティブPDF（LP/提案資料/議事録対応）
13. **共有機能**: Web Share API（モバイル）→ clipboard fallback（デスクトップ）、LINE/メール直接共有
14. **APIリトライ**: Claude API呼び出しに指数バックオフ（overloaded/rate_limit/5xx検出）
15. **esc()安全性**: null/undefined安全 + HTMLエンティティ5種（&, <, >, ", '）
