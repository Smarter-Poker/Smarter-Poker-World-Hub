-- ═══════════════════════════════════════════════════════════════════════════
-- Training Sessions — Performance Indexes & Hardening
-- Wave 2: Session persistence for custom-solve, multiway-quiz, pvp-match
-- ═══════════════════════════════════════════════════════════════════════════

-- Performance index: fetch sessions by user + game for stats/leaderboard
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_game
    ON training_sessions (user_id, game_id);

-- Performance index: fetch recent sessions ordered by date
CREATE INDEX IF NOT EXISTS idx_training_sessions_created
    ON training_sessions (created_at DESC);

-- Performance index: leaderboard queries by game + score
CREATE INDEX IF NOT EXISTS idx_training_sessions_game_score
    ON training_sessions (game_id, gtow_score DESC);

-- Ensure RLS is enabled
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for API routes using service_role key)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'training_sessions'
        AND policyname = 'service_role_full_access'
    ) THEN
        CREATE POLICY service_role_full_access ON training_sessions
            FOR ALL
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- Users can read their own sessions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'training_sessions'
        AND policyname = 'users_read_own_sessions'
    ) THEN
        CREATE POLICY users_read_own_sessions ON training_sessions
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;
END $$;
