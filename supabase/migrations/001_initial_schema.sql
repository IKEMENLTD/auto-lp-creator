-- ============================================================
-- 001_initial_schema.sql
-- リアルタイムアポ制作物自動生成システム - 初期スキーマ
-- ============================================================

-- UUID拡張の有効化
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- sessions: アポセッション管理
-- ============================================================
CREATE TABLE sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_sessions_status CHECK (status IN ('active', 'paused', 'ended'))
);

COMMENT ON TABLE sessions IS 'アポイントメントセッションの管理テーブル';
COMMENT ON COLUMN sessions.id IS 'セッション一意識別子 (UUID v4)';
COMMENT ON COLUMN sessions.user_id IS 'セッション所有者のユーザーID';
COMMENT ON COLUMN sessions.status IS 'セッション状態: active / paused / ended';
COMMENT ON COLUMN sessions.started_at IS 'セッション開始日時';
COMMENT ON COLUMN sessions.ended_at IS 'セッション終了日時 (active/paused時はNULL)';

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_status ON sessions (status);

-- ============================================================
-- chunks: 音声チャンク
-- ============================================================
CREATE TABLE chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    speaker     TEXT,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_chunks_chunk_index CHECK (chunk_index >= 0)
);

COMMENT ON TABLE chunks IS '音声認識で取得したテキストチャンク';
COMMENT ON COLUMN chunks.session_id IS '所属するセッションID';
COMMENT ON COLUMN chunks.text IS '音声認識テキスト';
COMMENT ON COLUMN chunks.chunk_index IS 'セッション内でのチャンク順序番号';
COMMENT ON COLUMN chunks.speaker IS '話者識別 (sales / customer など)';
COMMENT ON COLUMN chunks.processed IS 'Haiku抽出処理済みフラグ';

CREATE INDEX idx_chunks_session_id ON chunks (session_id);
CREATE INDEX idx_chunks_session_processed ON chunks (session_id, processed);

-- ============================================================
-- extracted_data: 累積抽出JSON (バージョン管理)
-- ============================================================
CREATE TABLE extracted_data (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    data_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    version     INTEGER NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_extracted_data_version CHECK (version >= 1)
);

COMMENT ON TABLE extracted_data IS 'Haiku抽出による累積データ (JSONBバージョン管理)';
COMMENT ON COLUMN extracted_data.session_id IS '所属するセッションID';
COMMENT ON COLUMN extracted_data.data_json IS '抽出データJSON (JSONB)';
COMMENT ON COLUMN extracted_data.version IS 'データバージョン番号 (インクリメント)';

CREATE INDEX idx_extracted_data_session_id ON extracted_data (session_id);
CREATE INDEX idx_extracted_data_session_version ON extracted_data (session_id, version DESC);

-- ============================================================
-- generation_jobs: 制作物生成ジョブ (個別管理)
-- ============================================================
CREATE TABLE generation_jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'queued',
    model        TEXT,
    result_url   TEXT,
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_generation_jobs_status CHECK (
        status IN ('queued', 'processing', 'completed', 'failed')
    ),
    CONSTRAINT chk_generation_jobs_type CHECK (
        type IN ('lp', 'ad_creative', 'flyer', 'hearing_form', 'line_design', 'minutes', 'profile')
    )
);

COMMENT ON TABLE generation_jobs IS '制作物生成ジョブの管理テーブル';
COMMENT ON COLUMN generation_jobs.session_id IS '所属するセッションID';
COMMENT ON COLUMN generation_jobs.type IS '制作物種別: lp / ad_creative / flyer / hearing_form / line_design / minutes / profile';
COMMENT ON COLUMN generation_jobs.status IS 'ジョブ状態: queued / processing / completed / failed';
COMMENT ON COLUMN generation_jobs.model IS '使用AIモデル名';
COMMENT ON COLUMN generation_jobs.result_url IS '生成結果URL (完了時)';
COMMENT ON COLUMN generation_jobs.error IS 'エラー詳細 (失敗時)';

CREATE INDEX idx_generation_jobs_session_id ON generation_jobs (session_id);
CREATE INDEX idx_generation_jobs_session_status ON generation_jobs (session_id, status);
CREATE INDEX idx_generation_jobs_status ON generation_jobs (status);

-- ============================================================
-- templates: 業種別テンプレート
-- ============================================================
CREATE TABLE templates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry    TEXT NOT NULL,
    name        TEXT NOT NULL,
    html_size   INTEGER NOT NULL DEFAULT 0,
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_templates_html_size CHECK (html_size >= 0)
);

COMMENT ON TABLE templates IS '業種別LPテンプレートのメタ情報';
COMMENT ON COLUMN templates.industry IS '対象業種';
COMMENT ON COLUMN templates.name IS 'テンプレート名';
COMMENT ON COLUMN templates.html_size IS 'HTMLファイルサイズ (bytes)';
COMMENT ON COLUMN templates.config IS 'テンプレート設定JSON';

CREATE INDEX idx_templates_industry ON templates (industry);

-- ============================================================
-- analytics: 利用ログ
-- ============================================================
CREATE TABLE analytics (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event       TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE analytics IS 'システム利用イベントログ';
COMMENT ON COLUMN analytics.session_id IS '関連するセッションID';
COMMENT ON COLUMN analytics.event IS 'イベント名';
COMMENT ON COLUMN analytics.metadata IS 'イベント付随メタデータ (JSONB)';

CREATE INDEX idx_analytics_session_id ON analytics (session_id);
CREATE INDEX idx_analytics_event ON analytics (event);
CREATE INDEX idx_analytics_created_at ON analytics (created_at DESC);

-- ============================================================
-- updated_at 自動更新トリガー関数
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at トリガー適用
CREATE TRIGGER set_updated_at_sessions
    BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_chunks
    BEFORE UPDATE ON chunks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_extracted_data
    BEFORE UPDATE ON extracted_data
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_generation_jobs
    BEFORE UPDATE ON generation_jobs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- 全テーブルでRLS有効化
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

-- sessions: user_id が自分のもののみ読み書き
CREATE POLICY sessions_select_own ON sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY sessions_insert_own ON sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY sessions_update_own ON sessions
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY sessions_delete_own ON sessions
    FOR DELETE USING (auth.uid() = user_id);

-- chunks: session.user_id が自分のセッションのもののみ
CREATE POLICY chunks_select_own ON chunks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = chunks.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY chunks_insert_own ON chunks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = chunks.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY chunks_update_own ON chunks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = chunks.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY chunks_delete_own ON chunks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = chunks.session_id
              AND sessions.user_id = auth.uid()
        )
    );

-- extracted_data: session.user_id が自分のセッションのもののみ
CREATE POLICY extracted_data_select_own ON extracted_data
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = extracted_data.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY extracted_data_insert_own ON extracted_data
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = extracted_data.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY extracted_data_update_own ON extracted_data
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = extracted_data.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY extracted_data_delete_own ON extracted_data
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = extracted_data.session_id
              AND sessions.user_id = auth.uid()
        )
    );

-- generation_jobs: session.user_id が自分のセッションのもののみ
CREATE POLICY generation_jobs_select_own ON generation_jobs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = generation_jobs.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY generation_jobs_insert_own ON generation_jobs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = generation_jobs.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY generation_jobs_update_own ON generation_jobs
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = generation_jobs.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY generation_jobs_delete_own ON generation_jobs
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = generation_jobs.session_id
              AND sessions.user_id = auth.uid()
        )
    );

-- templates: 全員読み取り可能 (認証済みユーザー)
CREATE POLICY templates_select_all ON templates
    FOR SELECT USING (true);

-- analytics: 自分のセッションのもののみ書き込み・読み取り
CREATE POLICY analytics_select_own ON analytics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = analytics.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY analytics_insert_own ON analytics
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = analytics.session_id
              AND sessions.user_id = auth.uid()
        )
    );
