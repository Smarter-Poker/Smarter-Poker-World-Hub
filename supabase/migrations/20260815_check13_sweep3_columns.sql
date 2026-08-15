-- CHECK 13 sweep-3 additive columns (content-engine + poker-engine).
-- Applied to production 2026-08-15 via Supabase MCP (this file is the mirror).
--
-- 1. seeded_content.scheduled_for — horse content scheduling never worked
--    (insert + due-posts filter both 42703'd; status 'scheduled' was already
--    in the schema).
-- 2. hand_history.reported/reported_at — HorsesAdmin reported-hands review
--    workflow was dead.
-- 3. hand_private_state.table_id/hand_number/saved_at + unique(table_id) —
--    the engine's crash-recovery hole-card stash always 42703'd; hole cards
--    were lost on engine restart mid-hand (0 rows; per-player columns kept).
-- 4. horse_opponent_reads.slow_play_tendency — opponent-model triple.
-- 5. content_authors.personality jsonb — horse personalities regenerated
--    randomly on every restart because the save-back always failed.
ALTER TABLE public.seeded_content ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
ALTER TABLE public.hand_history
  ADD COLUMN IF NOT EXISTS reported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz;
ALTER TABLE public.hand_private_state
  ADD COLUMN IF NOT EXISTS table_id uuid,
  ADD COLUMN IF NOT EXISTS hand_number integer,
  ADD COLUMN IF NOT EXISTS saved_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hand_private_state_table
  ON public.hand_private_state (table_id) WHERE table_id IS NOT NULL;
ALTER TABLE public.horse_opponent_reads ADD COLUMN IF NOT EXISTS slow_play_tendency numeric;
ALTER TABLE public.content_authors ADD COLUMN IF NOT EXISTS personality jsonb;
-- ROLLBACK: drop the added columns/index (see the applied migration for the pasted statements).
