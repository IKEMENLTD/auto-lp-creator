-- analytics テーブルに不足していた UPDATE/DELETE ポリシーを追加
-- 自分のセッションに紐づくレコードのみ操作可能

CREATE POLICY analytics_update_own ON analytics
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = analytics.session_id
              AND sessions.user_id = auth.uid()
        )
    );

CREATE POLICY analytics_delete_own ON analytics
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.id = analytics.session_id
              AND sessions.user_id = auth.uid()
        )
    );
