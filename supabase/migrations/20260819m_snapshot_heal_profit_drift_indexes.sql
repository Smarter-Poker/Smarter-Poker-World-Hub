-- ═══════════════════════════════════════════════════════════════════════════
-- SNAPSHOT SELF-HEAL, PROFIT DRIFT MEASUREMENT, READ-PATH INDEXES  2026-08-19
-- ═══════════════════════════════════════════════════════════════════════════
-- Function bodies dumped from the live catalog so this file cannot drift.
--
-- 1. SNAPSHOT SELF-HEAL. Every period leaderboard is a delta against
--    player_stats_snapshots. The 00:05 UTC pg_cron capture has 21 runs and 1
--    failure - 2026-08-09, which is exactly the day missing from the table. On
--    a miss the RPCs fall back to an older snapshot and "This Week" silently
--    becomes a longer window. A missed day cannot be reconstructed afterwards
--    (a snapshot is a point-in-time capture of counters that have since moved),
--    so the mitigation is to make the miss unlikely and loud:
--      fn_snapshot_player_stats_if_missing() captures TODAY only when today has
--      no rows, making it safely re-runnable - a retry fills a gap left by a
--      failed 00:05 run, and a retry after a SUCCESSFUL run is a no-op instead
--      of overwriting the morning baseline with midday values.
--      fn_snapshot_health() is what a monitor reads.
--    Driven from the EXISTING club-stats-maintenance handler (every 15 min):
--    CLAUDE.md 11.5 fails CI on net-new pages/api/cron files and 11 routes new
--    scheduled work to Open Claw rather than pg_cron, so this adds neither.
--
-- 2. CLUB DASHBOARD PROFIT DRIFT (read-only diagnosis, no repair).
--    club_member_daily_stats.profit is a stack delta counted only when an
--    "attributable" heuristic passes; when it fails the row is DROPPED. A rebuy
--    looks like a gain, so failures skew toward dropped LOSSES. Measured on
--    2026-08-18 for Club JAQK against that feature's own rake rollup, where
--    player profit + house cut must equal 0:
--        house cut            154,815.40
--        dashboard profit     -16,567.66   ->  drift  138,247.74
--        exact ledger        -154,802.06   ->  drift       13.34   (0.009%)
--    The exact ledger is the leaderboard's: winnings from hand_history.winners,
--    losses from the engine's per-player contributions.
--    fn_club_member_daily_profit_exact() returns the correct per-user number so
--    a repair can be made deliberately by the owning feature; nothing here
--    writes to that table, which is under active development by another agent.
--    Exact only for dates >= 2026-08-20; earlier snapshots were backfilled from
--    raked hands only and carry that partial basis.
--
-- 3. READ-PATH INDEXES. Both boards probe player_stats_snapshots for three
--    dates and aggregate per user. idx_pss_date covered only snapshot_date, so
--    every probe still hit the heap for the measure columns. Covering indexes
--    make them index-only scans:
--        global board  166.99 ms -> 29.13 ms   (reads 305 -> 46)
--        club board                 40.74 ms
--
-- ROLLBACK:
--   DROP FUNCTION fn_snapshot_player_stats_if_missing();
--   DROP FUNCTION fn_snapshot_health(integer);
--   DROP FUNCTION fn_club_member_daily_profit_exact(uuid, date);
--   DROP FUNCTION fn_club_profit_drift(uuid, date);
--   DROP INDEX IF EXISTS idx_pss_date_user_measures;
--   DROP INDEX IF EXISTS idx_pss_club_date_user_measures;
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_pss_date_user_measures
  ON player_stats_snapshots (snapshot_date, user_id)
  INCLUDE (hands_dealt, sum_big_blind, total_winnings, total_losses, tournaments_won);

CREATE INDEX IF NOT EXISTS idx_pss_club_date_user_measures
  ON player_stats_snapshots (club_id, snapshot_date, user_id)
  INCLUDE (hands_dealt, sum_big_blind, total_winnings, total_losses, tournaments_won, total_rake);

CREATE OR REPLACE FUNCTION public.fn_snapshot_player_stats_if_missing()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_exists boolean; v_res jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM player_stats_snapshots WHERE snapshot_date = CURRENT_DATE
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object(
      'healed', false, 'reason', 'snapshot_already_present', 'date', CURRENT_DATE);
  END IF;

  v_res := fn_snapshot_player_stats();
  RETURN jsonb_build_object(
    'healed', true, 'date', CURRENT_DATE, 'capture', v_res);
END; $function$
;

CREATE OR REPLACE FUNCTION public.fn_snapshot_health(p_days integer DEFAULT 35)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'today', CURRENT_DATE,
    'today_captured', EXISTS (SELECT 1 FROM player_stats_snapshots WHERE snapshot_date = CURRENT_DATE),
    'latest_snapshot', (SELECT max(snapshot_date) FROM player_stats_snapshots),
    'missing_days', COALESCE(
      (SELECT jsonb_agg(missing_date ORDER BY missing_date)
         FROM fn_leaderboard_snapshot_gaps(p_days)), '[]'::jsonb),
    'missing_count', (SELECT count(*) FROM fn_leaderboard_snapshot_gaps(p_days))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.fn_club_member_daily_profit_exact(p_club_id uuid, p_date date)
 RETURNS TABLE(user_id uuid, exact_profit numeric, basis text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT b.user_id,
         (a.total_winnings - b.total_winnings) - (a.total_losses - b.total_losses),
         CASE WHEN p_date >= DATE '2026-08-20' THEN 'exact'
              ELSE 'partial_raked_hands_only' END
    FROM player_stats_snapshots b
    JOIN player_stats_snapshots a
      ON a.user_id = b.user_id AND a.club_id = b.club_id AND a.snapshot_date = p_date + 1
   WHERE b.snapshot_date = p_date AND b.club_id = p_club_id;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_club_profit_drift(p_club_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH dash AS (
    SELECT COALESCE(round(SUM(profit)::numeric, 2), 0) AS s
      FROM club_member_daily_stats WHERE club_id = p_club_id AND stat_date = p_date
  ), house AS (
    SELECT COALESCE(round((rake + bbj)::numeric, 2), 0) AS s
      FROM club_hand_daily WHERE club_id = p_club_id AND stat_date = p_date
  ), exact AS (
    SELECT COALESCE(round(SUM(exact_profit)::numeric, 2), 0) AS s
      FROM fn_club_member_daily_profit_exact(p_club_id, p_date)
  )
  SELECT jsonb_build_object(
    'club_id', p_club_id,
    'stat_date', p_date,
    'dashboard_player_profit', (SELECT s FROM dash),
    'exact_player_profit',     (SELECT s FROM exact),
    'house_cut',               (SELECT s FROM house),
    -- Both must satisfy: player profit + house cut = 0.
    'dashboard_drift', (SELECT s FROM dash)  + (SELECT s FROM house),
    'exact_drift',     (SELECT s FROM exact) + (SELECT s FROM house)
  );
$function$
;

GRANT EXECUTE ON FUNCTION fn_snapshot_player_stats_if_missing() TO service_role;
GRANT EXECUTE ON FUNCTION fn_snapshot_health(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_club_member_daily_profit_exact(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_club_profit_drift(uuid, date) TO authenticated, service_role;
