-- ============================================================
-- seed.sql - テスト用シードデータ
-- ============================================================

-- 固定UUIDでテストデータを作成 (再実行可能)
-- テスト用ユーザーID
DO $$
DECLARE
    v_user_id UUID := '00000000-0000-4000-a000-000000000001';
    v_session_id UUID := '10000000-0000-4000-a000-000000000001';
    v_chunk_1_id UUID := '20000000-0000-4000-a000-000000000001';
    v_chunk_2_id UUID := '20000000-0000-4000-a000-000000000002';
    v_chunk_3_id UUID := '20000000-0000-4000-a000-000000000003';
    v_extraction_id UUID := '30000000-0000-4000-a000-000000000001';
    v_template_1_id UUID := '40000000-0000-4000-a000-000000000001';
    v_template_2_id UUID := '40000000-0000-4000-a000-000000000002';
    v_template_3_id UUID := '40000000-0000-4000-a000-000000000003';
BEGIN

-- ============================================================
-- テスト用セッション 1件
-- ============================================================
INSERT INTO sessions (id, user_id, status, started_at)
VALUES (
    v_session_id,
    v_user_id,
    'active',
    now() - INTERVAL '30 minutes'
)
ON CONFLICT (id) DO UPDATE SET status = 'active';

-- ============================================================
-- テスト用チャンク 3件
-- ============================================================
INSERT INTO chunks (id, session_id, text, chunk_index, speaker, processed)
VALUES
(
    v_chunk_1_id,
    v_session_id,
    'はい、弊社はクラウドCUSというクラウド型の顧客管理システムを提供しています。主にBtoBのSaaS企業様向けのサービスになります。',
    0,
    'sales',
    TRUE
),
(
    v_chunk_2_id,
    v_session_id,
    'なるほど、顧客管理ですか。うちは今Excelで管理していて、情報の共有がうまくいかなくて困っているんですよね。営業チームが10人くらいいるのですが。',
    1,
    'customer',
    TRUE
),
(
    v_chunk_3_id,
    v_session_id,
    'そうなんですね。クラウドCUSなら、営業チーム全員がリアルタイムで顧客情報を共有できます。導入実績は500社以上で、月額3万円からご利用いただけます。Excel管理からの移行もサポートしています。',
    2,
    'sales',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- テスト用extracted_data 1件 (BtoBサービスの完全なJSON)
-- ============================================================
INSERT INTO extracted_data (id, session_id, data_json, version)
VALUES (
    v_extraction_id,
    v_session_id,
    '{
        "company_name": "クラウドCUS株式会社",
        "service_name": "クラウドCUS",
        "industry": "IT・SaaS",
        "target_customer": "BtoB SaaS企業の営業チーム (10〜50名規模)",
        "strengths": [
            "リアルタイム顧客情報共有",
            "500社以上の導入実績",
            "Excel管理からの移行サポート付き",
            "月額3万円からの低コスト導入"
        ],
        "pain_points": [
            "Excel管理による情報共有の困難さ",
            "営業チーム間の情報断絶",
            "手動更新による最新情報の欠落"
        ],
        "price_range": "月額30,000円〜",
        "desired_outcome": "営業チーム全体での顧客情報リアルタイム共有と売上向上",
        "tone_keywords": ["信頼", "効率", "成長"],
        "faq": [
            {
                "q": "導入にどれくらいかかりますか？",
                "a": "最短3営業日で導入可能です。Excel移行サポートも無料で提供しています。"
            },
            {
                "q": "無料トライアルはありますか？",
                "a": "14日間の無料トライアルをご用意しています。全機能をお試しいただけます。"
            }
        ],
        "company_info": {
            "name": "クラウドCUS株式会社",
            "address": "東京都渋谷区神宮前1-2-3",
            "representative": "田中太郎",
            "established": "2020年4月",
            "capital": "5,000万円",
            "business": "クラウド型顧客管理システムの開発・運営"
        }
    }'::jsonb,
    2
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- テンプレート 3件 (テンプレート 1, 2, 3 のメタ情報)
-- ============================================================
INSERT INTO templates (id, industry, name, html_size, config)
VALUES
(
    v_template_1_id,
    'IT・SaaS',
    'テンプレート1: CloudCUS系 (SaaS・クラウドサービス向け)',
    245000,
    '{
        "template_id": 1,
        "sections": ["hero", "problem", "solution", "benefit", "case_study", "pricing", "faq", "cta"],
        "color_scheme": "blue-corporate",
        "responsive": true,
        "meta_placeholders": 25,
        "body_placeholders": 40
    }'::jsonb
),
(
    v_template_2_id,
    '自動車・製造',
    'テンプレート2: AUTOHUNT系 (製造・検索サービス向け)',
    312000,
    '{
        "template_id": 2,
        "sections": ["hero", "search_feature", "benefit", "flow", "testimonial", "company", "cta"],
        "color_scheme": "dark-industrial",
        "responsive": true,
        "meta_placeholders": 22,
        "body_placeholders": 35
    }'::jsonb
),
(
    v_template_3_id,
    'コンサルティング',
    'テンプレート3: ERUCORE系 (コンサルティング・専門サービス向け)',
    289000,
    '{
        "template_id": 3,
        "sections": ["hero", "about", "service", "strength", "flow", "team", "contact"],
        "color_scheme": "minimal-professional",
        "responsive": true,
        "meta_placeholders": 20,
        "body_placeholders": 38
    }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

END $$;
