-- Phase 74 — Add composite index supporting Phase 72/73's CST-anchored
-- daily-cap query pattern in src/lib/trivia/diamondCap.js and the
-- per-mode display queries in time-attack.js / survival.js.
--
-- The new query shape is:
--   SELECT diamonds_earned FROM trivia_scores
--   WHERE user_id = $1 AND mode = $2 AND created_at >= $3
--   LIMIT 500
--
-- Existing indexes (verified via pg_indexes):
--   - idx_trivia_scores_user_id (user_id) — leading on user_id but no
--     (mode, created_at), so the planner has to filter the per-user slice
--     in memory. As cap-eligible users accumulate scores, this will scan
--     all of a user's lifetime trivia_scores rows on every cap check.
--   - idx_trivia_scores_leaderboard (mode, play_date, score DESC) — wrong
--     leading column for per-user lookup.
--
-- This new index is sized for the cap-query exactly:
--   (user_id, mode, created_at DESC)
--
-- Verified via EXPLAIN that the cap query was doing a Seq Scan (table is
-- still tiny — 1 row at index-creation time — but as soon as a few
-- thousand games are played this would become a real hot-path cost).

CREATE INDEX IF NOT EXISTS idx_trivia_scores_user_mode_created
    ON public.trivia_scores
    USING btree (user_id, mode, created_at DESC);

COMMENT ON INDEX public.idx_trivia_scores_user_mode_created IS
    'Phase 74 — supports CST-anchored daily-diamond-cap queries from '
    'src/lib/trivia/diamondCap.js (every trivia mode) and the per-mode '
    'display queries in time-attack.js / survival.js. Index leading '
    'columns match the WHERE clause exactly.';
