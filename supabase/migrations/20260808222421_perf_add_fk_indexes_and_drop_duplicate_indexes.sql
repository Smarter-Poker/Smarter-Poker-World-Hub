-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260808222421_perf_add_fk_indexes_and_drop_duplicate_indexes.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Performance advisor cleanup (additive + strictly-redundant only).
--
-- (1) Three foreign keys had no covering index. Without one, a DELETE or
--     UPDATE on the referenced parent must sequentially scan the child to
--     enforce the FK, and joins on the column can't use an index. All three
--     columns verified to exist.
--
-- (2) Four pairs of byte-identical indexes. Each pair has the same table,
--     same columns, same order; neither member is UNIQUE or backs a
--     constraint (verified via pg_constraint), so one of each pair is dead
--     weight that only slows writes and wastes space. The more descriptively
--     named member is kept.
--
-- Nothing here changes query results. Index creation is not CONCURRENT
-- (these run in a migration transaction); the affected tables are small,
-- so the brief lock is immaterial.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- (1) covering indexes for unindexed foreign keys
CREATE INDEX IF NOT EXISTS idx_promotion_leaderboards_user_id
  ON public.promotion_leaderboards (user_id);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_code_id
  ON public.referral_redemptions (code_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_satellite_target_id
  ON public.tournaments (satellite_target_id);

-- (2) drop the redundant duplicate of each identical pair
DROP INDEX IF EXISTS public.idx_merchandise_orders_user;          -- keep idx_merchandise_orders_user_created
DROP INDEX IF EXISTS public.idx_coach_results_created;            -- keep idx_sandbox_coach_results_user_created
DROP INDEX IF EXISTS public.idx_sandbox_shared_scenarios_creator; -- keep idx_sandbox_shared_scenarios_creator_id
DROP INDEX IF EXISTS public.idx_trivia_tourn_notif_tournament;    -- keep idx_trivia_tournament_notifications_tournament_id

-- Post-condition
DO $$
DECLARE missing text := ''; still text := '';
BEGIN
  IF to_regclass('public.idx_promotion_leaderboards_user_id') IS NULL THEN missing := missing||'promo_lb '; END IF;
  IF to_regclass('public.idx_referral_redemptions_code_id') IS NULL THEN missing := missing||'referral '; END IF;
  IF to_regclass('public.idx_tournaments_satellite_target_id') IS NULL THEN missing := missing||'satellite '; END IF;
  IF to_regclass('public.idx_merchandise_orders_user') IS NOT NULL THEN still := still||'merch '; END IF;
  IF to_regclass('public.idx_coach_results_created') IS NOT NULL THEN still := still||'coach '; END IF;
  IF to_regclass('public.idx_sandbox_shared_scenarios_creator') IS NOT NULL THEN still := still||'scenarios '; END IF;
  IF to_regclass('public.idx_trivia_tourn_notif_tournament') IS NOT NULL THEN still := still||'trivia '; END IF;
  -- the kept indexes must survive
  IF to_regclass('public.idx_merchandise_orders_user_created') IS NULL
     OR to_regclass('public.idx_sandbox_coach_results_user_created') IS NULL
     OR to_regclass('public.idx_sandbox_shared_scenarios_creator_id') IS NULL
     OR to_regclass('public.idx_trivia_tournament_notifications_tournament_id') IS NULL THEN
    RAISE EXCEPTION 'a kept index was dropped by mistake';
  END IF;
  IF missing<>'' OR still<>'' THEN RAISE EXCEPTION 'fk indexes missing:[%]; dup still present:[%]', missing, still; END IF;
END $$;

COMMIT;
