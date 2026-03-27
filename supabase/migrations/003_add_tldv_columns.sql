-- ============================================================
-- 003_add_tldv_columns.sql
-- tl;dv Webhook連携に必要なカラム追加
-- ============================================================

-- sessions: tl;dv meeting_id と全文トランスクリプト
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS meeting_id TEXT,
    ADD COLUMN IF NOT EXISTS full_transcript TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_meeting_id ON sessions (meeting_id)
    WHERE meeting_id IS NOT NULL;

COMMENT ON COLUMN sessions.meeting_id IS 'tl;dv ミーティングID (Webhook連携用)';
COMMENT ON COLUMN sessions.full_transcript IS 'ミーティング終了時の全文トランスクリプト';
