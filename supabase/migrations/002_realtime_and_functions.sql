-- ============================================================
-- 002_realtime_and_functions.sql
-- Supabase Realtime有効化 + PostgreSQL関数
-- ============================================================

-- ============================================================
-- Supabase Realtime有効化
-- extracted_data と generation_jobs のみ
-- ============================================================

-- Supabase Realtime publication にテーブルを追加
-- ダッシュボードがリアルタイムで更新を受け取る
ALTER PUBLICATION supabase_realtime ADD TABLE extracted_data;
ALTER PUBLICATION supabase_realtime ADD TABLE generation_jobs;

-- ============================================================
-- 関数: increment_extraction_version
-- extracted_data の version をインクリメントし、最新行を返す
-- ============================================================
CREATE OR REPLACE FUNCTION increment_extraction_version(
    p_session_id UUID
)
RETURNS TABLE (
    id UUID,
    session_id UUID,
    data_json JSONB,
    version INTEGER,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_version INTEGER;
    v_current_data JSONB;
    v_extracted_id UUID;
BEGIN
    -- 最新バージョンを取得
    SELECT ed.id, ed.version, ed.data_json
    INTO v_extracted_id, v_current_version, v_current_data
    FROM extracted_data ed
    WHERE ed.session_id = p_session_id
    ORDER BY ed.version DESC
    LIMIT 1;

    IF v_extracted_id IS NULL THEN
        RAISE EXCEPTION 'セッション % の抽出データが見つかりません', p_session_id;
    END IF;

    -- バージョンをインクリメント
    UPDATE extracted_data ed
    SET version = v_current_version + 1,
        updated_at = now()
    WHERE ed.id = v_extracted_id
    RETURNING ed.id, ed.session_id, ed.data_json, ed.version, ed.updated_at
    INTO id, session_id, data_json, version, updated_at;

    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION increment_extraction_version(UUID)
IS 'extracted_data の最新バージョンをインクリメントする';

-- ============================================================
-- 関数: check_generation_readiness
-- 各制作物の生成可能判定をSQLで行う
-- 必須フィールドが抽出済みかチェック
-- ============================================================
CREATE OR REPLACE FUNCTION check_generation_readiness(
    p_session_id UUID
)
RETURNS TABLE (
    job_type TEXT,
    is_ready BOOLEAN,
    missing_fields TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_data JSONB;
    v_has_company BOOLEAN;
    v_has_service BOOLEAN;
    v_has_industry BOOLEAN;
    v_has_target BOOLEAN;
    v_has_strengths BOOLEAN;
    v_has_pain_points BOOLEAN;
    v_missing TEXT[];
BEGIN
    -- 最新の抽出データを取得
    SELECT ed.data_json INTO v_data
    FROM extracted_data ed
    WHERE ed.session_id = p_session_id
    ORDER BY ed.version DESC
    LIMIT 1;

    -- データが存在しない場合は全て未準備
    IF v_data IS NULL THEN
        FOR job_type IN
            SELECT unnest(ARRAY['lp', 'ad_creative', 'flyer', 'hearing_form', 'line_design', 'minutes', 'profile'])
        LOOP
            is_ready := FALSE;
            missing_fields := ARRAY['data_not_found'];
            RETURN NEXT;
        END LOOP;
        RETURN;
    END IF;

    -- フィールド存在チェック
    v_has_company := v_data ? 'company_name' AND length(v_data->>'company_name') > 0;
    v_has_service := v_data ? 'service_name' AND length(v_data->>'service_name') > 0;
    v_has_industry := v_data ? 'industry' AND length(v_data->>'industry') > 0;
    v_has_target := v_data ? 'target_customer' AND length(v_data->>'target_customer') > 0;
    v_has_strengths := v_data ? 'strengths' AND jsonb_array_length(v_data->'strengths') > 0;
    v_has_pain_points := v_data ? 'pain_points' AND jsonb_array_length(v_data->'pain_points') > 0;

    -- LP: company_name, service_name, industry, target_customer, strengths が必須
    v_missing := ARRAY[]::TEXT[];
    IF NOT v_has_company THEN v_missing := array_append(v_missing, 'company_name'); END IF;
    IF NOT v_has_service THEN v_missing := array_append(v_missing, 'service_name'); END IF;
    IF NOT v_has_industry THEN v_missing := array_append(v_missing, 'industry'); END IF;
    IF NOT v_has_target THEN v_missing := array_append(v_missing, 'target_customer'); END IF;
    IF NOT v_has_strengths THEN v_missing := array_append(v_missing, 'strengths'); END IF;
    job_type := 'lp';
    is_ready := array_length(v_missing, 1) IS NULL;
    missing_fields := v_missing;
    RETURN NEXT;

    -- ad_creative: company_name, service_name, target_customer, strengths が必須
    v_missing := ARRAY[]::TEXT[];
    IF NOT v_has_company THEN v_missing := array_append(v_missing, 'company_name'); END IF;
    IF NOT v_has_service THEN v_missing := array_append(v_missing, 'service_name'); END IF;
    IF NOT v_has_target THEN v_missing := array_append(v_missing, 'target_customer'); END IF;
    IF NOT v_has_strengths THEN v_missing := array_append(v_missing, 'strengths'); END IF;
    job_type := 'ad_creative';
    is_ready := array_length(v_missing, 1) IS NULL;
    missing_fields := v_missing;
    RETURN NEXT;

    -- flyer: company_name, service_name, industry, strengths が必須
    v_missing := ARRAY[]::TEXT[];
    IF NOT v_has_company THEN v_missing := array_append(v_missing, 'company_name'); END IF;
    IF NOT v_has_service THEN v_missing := array_append(v_missing, 'service_name'); END IF;
    IF NOT v_has_industry THEN v_missing := array_append(v_missing, 'industry'); END IF;
    IF NOT v_has_strengths THEN v_missing := array_append(v_missing, 'strengths'); END IF;
    job_type := 'flyer';
    is_ready := array_length(v_missing, 1) IS NULL;
    missing_fields := v_missing;
    RETURN NEXT;

    -- hearing_form: company_name, industry, target_customer が必須
    v_missing := ARRAY[]::TEXT[];
    IF NOT v_has_company THEN v_missing := array_append(v_missing, 'company_name'); END IF;
    IF NOT v_has_industry THEN v_missing := array_append(v_missing, 'industry'); END IF;
    IF NOT v_has_target THEN v_missing := array_append(v_missing, 'target_customer'); END IF;
    job_type := 'hearing_form';
    is_ready := array_length(v_missing, 1) IS NULL;
    missing_fields := v_missing;
    RETURN NEXT;

    -- line_design: company_name, service_name が必須
    v_missing := ARRAY[]::TEXT[];
    IF NOT v_has_company THEN v_missing := array_append(v_missing, 'company_name'); END IF;
    IF NOT v_has_service THEN v_missing := array_append(v_missing, 'service_name'); END IF;
    job_type := 'line_design';
    is_ready := array_length(v_missing, 1) IS NULL;
    missing_fields := v_missing;
    RETURN NEXT;

    -- minutes: セッションにchunksが存在すれば生成可能
    job_type := 'minutes';
    IF EXISTS (SELECT 1 FROM chunks c WHERE c.session_id = p_session_id LIMIT 1) THEN
        is_ready := TRUE;
        missing_fields := ARRAY[]::TEXT[];
    ELSE
        is_ready := FALSE;
        missing_fields := ARRAY['no_chunks'];
    END IF;
    RETURN NEXT;

    -- profile: company_name, service_name, industry が必須
    v_missing := ARRAY[]::TEXT[];
    IF NOT v_has_company THEN v_missing := array_append(v_missing, 'company_name'); END IF;
    IF NOT v_has_service THEN v_missing := array_append(v_missing, 'service_name'); END IF;
    IF NOT v_has_industry THEN v_missing := array_append(v_missing, 'industry'); END IF;
    job_type := 'profile';
    is_ready := array_length(v_missing, 1) IS NULL;
    missing_fields := v_missing;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION check_generation_readiness(UUID)
IS '各制作物タイプの生成可能判定を行い、不足フィールドを返す';

-- ============================================================
-- 関数: session_summary
-- セッションの統計サマリーを返す
-- ============================================================
CREATE OR REPLACE FUNCTION session_summary(
    p_session_id UUID
)
RETURNS TABLE (
    session_status TEXT,
    total_chunks INTEGER,
    processed_chunks INTEGER,
    unprocessed_chunks INTEGER,
    extraction_version INTEGER,
    total_jobs INTEGER,
    completed_jobs INTEGER,
    failed_jobs INTEGER,
    queued_jobs INTEGER,
    processing_jobs INTEGER,
    session_duration_seconds NUMERIC,
    last_chunk_at TIMESTAMPTZ,
    last_extraction_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_session sessions%ROWTYPE;
BEGIN
    -- セッション取得
    SELECT * INTO v_session
    FROM sessions s
    WHERE s.id = p_session_id;

    IF v_session IS NULL THEN
        RAISE EXCEPTION 'セッション % が見つかりません', p_session_id;
    END IF;

    session_status := v_session.status;

    -- チャンク統計
    SELECT
        count(*)::INTEGER,
        count(*) FILTER (WHERE c.processed = TRUE)::INTEGER,
        count(*) FILTER (WHERE c.processed = FALSE)::INTEGER
    INTO total_chunks, processed_chunks, unprocessed_chunks
    FROM chunks c
    WHERE c.session_id = p_session_id;

    -- 抽出バージョン
    SELECT COALESCE(max(ed.version), 0)
    INTO extraction_version
    FROM extracted_data ed
    WHERE ed.session_id = p_session_id;

    -- ジョブ統計
    SELECT
        count(*)::INTEGER,
        count(*) FILTER (WHERE gj.status = 'completed')::INTEGER,
        count(*) FILTER (WHERE gj.status = 'failed')::INTEGER,
        count(*) FILTER (WHERE gj.status = 'queued')::INTEGER,
        count(*) FILTER (WHERE gj.status = 'processing')::INTEGER
    INTO total_jobs, completed_jobs, failed_jobs, queued_jobs, processing_jobs
    FROM generation_jobs gj
    WHERE gj.session_id = p_session_id;

    -- セッション経過時間 (秒)
    session_duration_seconds := EXTRACT(EPOCH FROM (
        COALESCE(v_session.ended_at, now()) - v_session.started_at
    ));

    -- 最終チャンク日時
    SELECT max(c.created_at)
    INTO last_chunk_at
    FROM chunks c
    WHERE c.session_id = p_session_id;

    -- 最終抽出更新日時
    SELECT max(ed.updated_at)
    INTO last_extraction_at
    FROM extracted_data ed
    WHERE ed.session_id = p_session_id;

    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION session_summary(UUID)
IS 'セッションの統計サマリー (チャンク数、ジョブ状況、経過時間等)';
