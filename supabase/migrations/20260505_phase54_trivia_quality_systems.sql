-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 54 — Quality hardening systems for the trivia pool
-- Date: 2026-05-05
--
-- Adds 8 separate quality signals so the autonomous fill produces a clean
-- pool, not just a big one:
--   #2 pgvector — near-duplicate detection (catches paraphrased dupes
--      that the keyword-overlap dedup misses)
--   #3 theme — granular topic tag for diversity capping (no more 80%
--      Black Friday questions inside poker_history)
--   #4 circuit breaker — track recent audit pass rate per category;
--      generation handler pauses a category if it goes below threshold
--   #5 player success rate — derived view computed from times_shown +
--      times_correct, used to retag mislabeled difficulty
--   #6 user reports — table + API for "report this question" button
--   #7 reading clarity — column for grok-3-mini's English-quality grade
--   #9 regression — generic stats table the daily test cron writes to
--   #10 skip rate — track per-question skip events from gameplay
-- ═══════════════════════════════════════════════════════════════════════════

-- pgvector extension (idempotent — Supabase ships it)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── trivia_questions — new columns ───────────────────────────────────────

ALTER TABLE trivia_questions
    ADD COLUMN IF NOT EXISTS embedding vector(384),       -- #2 — text embedding for dup detection
    ADD COLUMN IF NOT EXISTS theme TEXT,                  -- #3 — granular topic e.g. "Black Friday", "Hellmuth bracelets"
    ADD COLUMN IF NOT EXISTS clarity_score INTEGER,       -- #7 — 1-10 English-quality grade
    ADD COLUMN IF NOT EXISTS clarity_flesch NUMERIC(5,2), -- #7 — Flesch reading-ease score
    ADD COLUMN IF NOT EXISTS skipped_count INTEGER DEFAULT 0,    -- #10 — bumped on each skip
    ADD COLUMN IF NOT EXISTS retagged_difficulty TEXT;    -- #5 — original difficulty preserved if player data forces a re-tag

CREATE INDEX IF NOT EXISTS idx_trivia_questions_theme
    ON trivia_questions(category, theme);
CREATE INDEX IF NOT EXISTS idx_trivia_questions_embedding
    ON trivia_questions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_trivia_questions_skipped
    ON trivia_questions(skipped_count DESC)
    WHERE skipped_count > 0;
CREATE INDEX IF NOT EXISTS idx_trivia_questions_clarity
    ON trivia_questions(clarity_score)
    WHERE clarity_score IS NOT NULL;

-- ─── #4 Circuit breaker — per-category audit-pass-rate snapshot ───────────

CREATE TABLE IF NOT EXISTS trivia_category_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    audited_count INTEGER NOT NULL DEFAULT 0,
    verified_true_count INTEGER NOT NULL DEFAULT 0,
    verified_false_count INTEGER NOT NULL DEFAULT 0,
    pass_rate NUMERIC(4, 3),          -- verified_true / audited_count
    generation_paused BOOLEAN NOT NULL DEFAULT FALSE,
    pause_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_trivia_category_health_lookup
    ON trivia_category_health(category, snapshot_at DESC);

-- ─── #6 User reports — "report this question" ────────────────────────────

CREATE TABLE IF NOT EXISTS trivia_question_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES trivia_questions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK (reason IN ('wrong_answer', 'unclear', 'duplicate', 'offensive', 'broken', 'other')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution TEXT  -- 'flagged' | 'demoted' | 'deleted' | 'dismissed'
);

CREATE INDEX IF NOT EXISTS idx_trivia_reports_question ON trivia_question_reports(question_id);
CREATE INDEX IF NOT EXISTS idx_trivia_reports_unresolved
    ON trivia_question_reports(created_at DESC)
    WHERE resolved_at IS NULL;

ALTER TABLE trivia_question_reports ENABLE ROW LEVEL SECURITY;

-- Auth users can insert their own reports
CREATE POLICY "Users can report questions"
    ON trivia_question_reports FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can read their own reports
CREATE POLICY "Users can view their own reports"
    ON trivia_question_reports FOR SELECT
    USING (auth.uid() = user_id);

-- Admins can read all + manage
CREATE POLICY "Admins can manage all reports"
    ON trivia_question_reports FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

-- Service role can manage all
CREATE POLICY "Service role manages reports"
    ON trivia_question_reports FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT ON trivia_question_reports TO authenticated;

-- Increment skipped_count atomically (called from gameplay)
CREATE OR REPLACE FUNCTION public.increment_trivia_skipped(p_question_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    UPDATE trivia_questions
    SET skipped_count = COALESCE(skipped_count, 0) + 1
    WHERE id = p_question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_trivia_skipped(UUID) TO authenticated;

-- ─── #5 Player success rate — derived view ───────────────────────────────

CREATE OR REPLACE VIEW trivia_question_player_stats AS
SELECT
    id,
    category,
    difficulty,
    times_shown,
    times_correct,
    skipped_count,
    CASE WHEN times_shown >= 30 THEN ROUND((times_correct::numeric / times_shown) * 100, 1) ELSE NULL END AS success_rate_pct,
    CASE
        WHEN times_shown >= 30 AND difficulty = 'easy'   AND (times_correct::numeric / times_shown) < 0.40 THEN 'too-hard-or-wrong'
        WHEN times_shown >= 30 AND difficulty = 'hard'   AND (times_correct::numeric / times_shown) > 0.95 THEN 'mislabeled-easy'
        WHEN times_shown >= 30 AND difficulty = 'medium' AND (times_correct::numeric / times_shown) < 0.30 THEN 'suspect-bad'
        WHEN times_shown >= 30 AND skipped_count::numeric / times_shown > 0.20 THEN 'high-skip'
        ELSE 'ok'
    END AS player_signal,
    quality_score
FROM trivia_questions;

GRANT SELECT ON trivia_question_player_stats TO authenticated;

-- ─── #9 Regression test results — daily test cron writes here ───────────

CREATE TABLE IF NOT EXISTS trivia_regression_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    test_name TEXT NOT NULL,        -- 'position_bias' | 'length_parity' | 'reveal_check' | 'theme_density' | 'embedding_dup'
    category TEXT,                  -- nullable — some tests are global
    passed BOOLEAN NOT NULL,
    metric NUMERIC,                 -- value that was measured
    threshold NUMERIC,              -- threshold the metric was compared to
    sample_size INTEGER,
    details JSONB                   -- per-test free-form payload (sample failing rows, etc)
);

CREATE INDEX IF NOT EXISTS idx_trivia_regression_runs_ran_at
    ON trivia_regression_runs(ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_trivia_regression_runs_failed
    ON trivia_regression_runs(ran_at DESC)
    WHERE passed = FALSE;

ALTER TABLE trivia_category_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_regression_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages category health"
    ON trivia_category_health FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Admins read category health"
    ON trivia_category_health FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

CREATE POLICY "Service role manages regression runs"
    ON trivia_regression_runs FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Admins read regression runs"
    ON trivia_regression_runs FOR SELECT
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));

GRANT SELECT ON trivia_category_health TO authenticated;
GRANT SELECT ON trivia_regression_runs TO authenticated;

COMMENT ON TABLE trivia_category_health IS 'Phase 54 — circuit-breaker telemetry. The audit cron writes a snapshot per category each run; the generation cron reads the latest pass_rate and pauses generation if pass_rate < 0.85.';
COMMENT ON TABLE trivia_question_reports IS 'Phase 54 — user-submitted "report this question" flags. Surfaces in /admin/trivia-pool for triage.';
COMMENT ON TABLE trivia_regression_runs IS 'Phase 54 — daily regression test cron output. Each row is one (test, category) result.';
