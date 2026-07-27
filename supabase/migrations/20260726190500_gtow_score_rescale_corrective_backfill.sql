-- CORRECTIVE to 20260726190000_gtow_score_rescale_to_signed_range.
--
-- That migration added score_scale with DEFAULT 2. Postgres applies a column
-- default to every EXISTING row immediately, so the rows were stamped
-- "already migrated" before the backfill ran and the guarded UPDATE
-- (WHERE score_scale <> 2) matched nothing. Values stayed on the legacy 0..100
-- scale while claiming to be signed.
--
-- The original range assertion could not catch this: legacy values (74..100)
-- sit inside -100..100, so the check passed on unconverted data. The lesson is
-- that a range assertion is not an assertion of having actually converted.
--
-- Safe to convert unconditionally at this point: the application code emitting
-- signed scores had not shipped, so no genuine scale-2 row existed. One-shot --
-- must not be re-run after the code deploys.
-- Applied to production 2026-07-26. Verified: sessions 74 -> 48 (max 100),
-- leaderboard 38.5 -> -23.0.

UPDATE public.training_sessions
SET gtow_score = (gtow_score * 2) - 100
WHERE gtow_score IS NOT NULL;

UPDATE public.training_leaderboard
SET gtow_score_avg = (gtow_score_avg * 2) - 100
WHERE gtow_score_avg IS NOT NULL;

-- ROLLBACK:
--   UPDATE public.training_sessions    SET gtow_score     = (gtow_score + 100) / 2     WHERE gtow_score IS NOT NULL;
--   UPDATE public.training_leaderboard SET gtow_score_avg = (gtow_score_avg + 100) / 2 WHERE gtow_score_avg IS NOT NULL;
