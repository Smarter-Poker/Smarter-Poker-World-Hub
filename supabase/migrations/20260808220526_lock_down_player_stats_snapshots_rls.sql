-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260808220526_lock_down_player_stats_snapshots_rls.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- player_stats_snapshots shipped with RLS DISABLED, no policies, and anon
-- holding SELECT + INSERT + UPDATE on 12,645 rows of per-player financial
-- history: total_winnings, total_losses, total_rake, tournaments_won,
-- keyed by user_id and club_id.
--
-- Anyone with the publishable key could read every player's win/loss/rake
-- record and could also INSERT or UPDATE arbitrary rows, poisoning the
-- leaderboards computed from this table. This is an ERROR-level advisor
-- finding (rls_disabled_in_public) and a direct exposure.
--
-- SAFE TO LOCK: nothing in Smarter-Poker-World-Hub, smarter-poker-commander
-- or club-arena references this table by name. Its only accessors are four
-- SECURITY DEFINER functions —
--   fn_snapshot_player_stats     (writer)
--   fn_club_leaderboard_period   (reader)
--   fn_user_rank_period          (reader)
--   fn_union_leaderboard_period  (reader)
-- all owned by postgres, so they BYPASS RLS and are unaffected by this
-- change. The leaderboards keep working; only the raw per-row financial
-- read/write over PostgREST is closed.
--
-- After: anon has no access at all; an authenticated user may read only
-- their OWN snapshots (defense in depth for any future "my stats" page);
-- all writes are service-role / definer-function only. Naming `public` in
-- the revoke matters — revoking from anon alone is a no-op when the grant
-- is held by PUBLIC.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.player_stats_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.player_stats_snapshots FROM public, anon, authenticated;
GRANT SELECT ON public.player_stats_snapshots TO authenticated;
GRANT ALL   ON public.player_stats_snapshots TO service_role;

DROP POLICY IF EXISTS player_stats_snapshots_own_read ON public.player_stats_snapshots;
CREATE POLICY player_stats_snapshots_own_read
  ON public.player_stats_snapshots
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Post-condition
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.player_stats_snapshots'::regclass) THEN
    RAISE EXCEPTION 'RLS was not enabled';
  END IF;
  IF has_table_privilege('anon','public.player_stats_snapshots','SELECT')
     OR has_table_privilege('anon','public.player_stats_snapshots','INSERT')
     OR has_table_privilege('anon','public.player_stats_snapshots','UPDATE') THEN
    RAISE EXCEPTION 'anon still holds a grant on player_stats_snapshots';
  END IF;
  IF has_table_privilege('authenticated','public.player_stats_snapshots','INSERT') THEN
    RAISE EXCEPTION 'authenticated still holds a write grant';
  END IF;
  IF NOT has_table_privilege('service_role','public.player_stats_snapshots','SELECT') THEN
    RAISE EXCEPTION 'service_role lost access';
  END IF;
END $$;

COMMIT;
