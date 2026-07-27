-- roadmap #25 — rescale the GTOW Score to GTO Wizard's actual range.
--
-- GTO Wizard scores every move from -100% to +100%. Ours was a 0-100 weighted
-- average of classification weights (BEST 1.0 .. BLUNDER 0.0). Those scales are
-- related by an exact linear transform -- w=1.0 -> +100, w=0.5 -> 0, w=0.0 ->
-- -100 -- so stored values convert losslessly with v*2-100.
--
-- Without this, the code change alone would silently corrupt every stored
-- value: signed scores would be averaged against unsigned ones.
--
-- score_scale marks the convention: 1 = legacy 0..100, 2 = signed -100..+100.
--
-- NOTE: this migration's backfill DID NOT FIRE. See the corrective migration
-- 20260726190500 -- adding the column with DEFAULT 2 stamped every existing row
-- as already-migrated, so the guarded UPDATE matched nothing. Kept as applied
-- history; do not re-run in isolation.
-- Applied to production 2026-07-26 via Supabase MCP.

ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS score_scale smallint NOT NULL DEFAULT 2;

ALTER TABLE public.training_leaderboard
    ADD COLUMN IF NOT EXISTS score_scale smallint NOT NULL DEFAULT 2;

UPDATE public.training_sessions
SET gtow_score = (gtow_score * 2) - 100, score_scale = 2
WHERE gtow_score IS NOT NULL AND score_scale <> 2;

UPDATE public.training_leaderboard
SET gtow_score_avg = (gtow_score_avg * 2) - 100, score_scale = 2
WHERE gtow_score_avg IS NOT NULL AND score_scale <> 2;
