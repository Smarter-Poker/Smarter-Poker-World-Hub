-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 80.10 — MISSING FK INDEXES + DEAD INDEX REMOVAL
-- Date: 2026-07-26
--
-- Two opposite problems, both pure cost:
--
--   1. Several foreign keys have no index. PostgreSQL does NOT create one for a
--      referencing column, so every DELETE on the parent (auth.users,
--      trivia_questions) takes a sequential scan of each child, and every
--      "rows belonging to X" lookup does the same.
--
--   2. idx_trivia_questions_embedding is an ivfflat index over
--      trivia_questions.embedding — a vector(384) column written by NO code
--      anywhere in the repository (the near-duplicate detector was never
--      built). An ivfflat index on an all-NULL column answers no query and is
--      maintained on every single INSERT and UPDATE of the pool's hottest
--      table, which the daily generation cron hits thousands of times per run.
--      Dropped here; recreate it in the same migration that first writes an
--      embedding. The column itself is kept (dropping it would lose nothing but
--      is not reversible without a rewrite).
--
-- SAFE TO RE-RUN. No manual step required.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. Un-indexed foreign keys
-- ───────────────────────────────────────────────────────────────────────────

-- trivia_question_reports.user_id -> auth.users
CREATE INDEX IF NOT EXISTS idx_trivia_question_reports_user
    ON public.trivia_question_reports (user_id)
    WHERE user_id IS NOT NULL;

-- daily_trivia_plays.user_id already has idx_daily_trivia_plays_user; the
-- (user_id, played_date) lookup in pages/api/trivia/daily.js:525 did not.
CREATE INDEX IF NOT EXISTS idx_daily_trivia_plays_user_date
    ON public.daily_trivia_plays (user_id, played_date DESC);

-- trivia_survival_runs leaderboard + owner reads
CREATE INDEX IF NOT EXISTS idx_survival_runs_user_created
    ON public.trivia_survival_runs (user_id, created_at DESC);



-- The daily roster read in pages/api/trivia/daily.js:470 filters on daily_date
-- AND the quality floor, then orders by order_index.
CREATE INDEX IF NOT EXISTS idx_trivia_questions_daily_roster
    ON public.trivia_questions (daily_date, order_index)
    WHERE daily_date IS NOT NULL;

-- buildRosterFromPool()'s rotation query: least-recently-used above the floor.
CREATE INDEX IF NOT EXISTS idx_trivia_questions_rotation
    ON public.trivia_questions (last_used_at NULLS FIRST)
    WHERE daily_date IS NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Dead index removal
-- ───────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_trivia_questions_embedding;

COMMENT ON COLUMN public.trivia_questions.embedding IS
    'Phase 54 near-duplicate detection. NO WRITER EXISTS — every row is NULL. '
    'Its ivfflat index was dropped in phase 80 (write cost on the hottest table '
    'in the schema, zero read benefit). Recreate the index in the same '
    'migration that first populates this column.';

COMMENT ON COLUMN public.trivia_questions.clarity_score IS
    'Phase 54 readability grade. No writer exists yet; '
    'scripts/trivia-quality-audit-now.js is the intended one.';

COMMENT ON COLUMN public.trivia_questions.skipped_count IS
    'Phase 54 skip telemetry. increment_trivia_skipped() exists and is granted '
    'to authenticated but is called by NO file — HintButtons.jsx implements '
    'skip purely client-side. Wire it there to make '
    'trivia_question_player_stats.player_signal meaningful.';
