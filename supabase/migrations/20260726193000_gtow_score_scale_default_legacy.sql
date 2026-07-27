-- roadmap #25 follow-up — remove the deploy-order race.
--
-- The rescale migrations are live in production but the code that EMITS signed
-- scores has not deployed. With score_scale defaulting to 2, every row written
-- by the currently-deployed (0..100) code would be stamped "signed" while
-- holding a legacy value -- silently mixing scales in one column, which is the
-- exact failure the marker exists to prevent.
--
-- Defaulting to 1 makes the schema correct in BOTH deploy states:
--   * currently-deployed code writes 0..100 -> row labelled 1 (legacy)
--   * this build writes signed values and sets score_scale = 2 explicitly
-- No timing dependency between migration and deploy in either direction.
--
-- Already-converted rows keep their score_scale = 2; changing a DEFAULT does
-- not rewrite existing rows.
-- Applied to production 2026-07-26 via Supabase MCP.

ALTER TABLE public.training_sessions    ALTER COLUMN score_scale SET DEFAULT 1;
ALTER TABLE public.training_leaderboard ALTER COLUMN score_scale SET DEFAULT 1;
