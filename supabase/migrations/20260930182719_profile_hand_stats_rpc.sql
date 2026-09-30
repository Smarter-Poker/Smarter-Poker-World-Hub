-- ═══════════════════════════════════════════════════════════════════════
-- 20260930170300_profile_hand_stats_rpc.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (one index on an existing ledger table, one read-only
--              SECURITY DEFINER RPC, its grants; no table changes, no rows)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4, agent p8-profile),
--              Fleet Content Programme Phase 8 "Discovery and the feed"
-- AFFECTS:     new index: public.idx_cmds_user_stat_date
--                on public.club_member_daily_stats (user_id, stat_date DESC)
--                INCLUDE (table_id, hands_played, biggest_pot_won)
--              new function: public.fn_profile_hand_stats(uuid) RETURNS jsonb
--                (STABLE, SECURITY DEFINER, service_role only)
--              read at run time only, never written by this file or the
--                function: public.club_member_daily_stats
-- IRREVERSIBLE: no (the ROLLBACK block at the end drops exactly what this
--              file creates)
--
-- WHY:
--   The public profile (pages/hub/user/[username].js) shows no number that
--   comes from hands: the counter strip is social, PokerResumeBadge is
--   HendonMob, the POKER tab is check-ins. club_member_daily_stats is the
--   complete, durable, per-player ledger (one row per club, table, user and
--   day, written by trg_hand_history_club_member_stats), so a small block of
--   real table numbers for every profile comes from one aggregate over it.
--   Horses are players: the function takes a uuid and nothing else, reads no
--   profile column and carries no is_horse branch, so a horse profile and a
--   human profile get the same answer through the same path.
--
-- HOW:
--   - idx_cmds_user_stat_date: the table has no user-leading index (its four
--     indexes lead with club_id or stat_date), so a per-user 30-day read walked
--     idx_cmds_club_user. The new index leads with user_id, orders stat_date
--     DESC and INCLUDEs the three columns the function reads, so the aggregate
--     is an index-only scan (EXPLAIN recorded below).
--   - fn_profile_hand_stats(p_user_id): one aggregate over the rows of that
--     user in the last 30 days. It reads hands_played, table_id, stat_date and
--     biggest_pot_won and nothing else: the two net-money columns of the ledger
--     are never read, so nothing on a profile can show a player's result.
--     Keys: hands30d, sessions30d (distinct table and day), daysActive30d,
--     biggestPotWon30d, handsThisMonth (FILTER on the calendar month),
--     lastPlayed (date or null), computedAt. No rows gives zeros and null.
--   - Privileges: EXECUTE revoked from PUBLIC, anon and authenticated and
--     granted to service_role only. The route pages/api/profile/hand-stats.js
--     calls it with the service client and answers with a public, cacheable
--     aggregate; browsers never call the function.
--
-- NOTE FOR THE LEAD (index build):
--   club_member_daily_stats is 486 MB and receives about ten rows a second
--   from hand traffic. A plain CREATE INDEX holds a write lock for a few
--   seconds, so the index is built by hand CONCURRENTLY before this file is
--   installed when possible; the CREATE INDEX IF NOT EXISTS below then no-ops.
--   Checked 2026-09-30 (pg_indexes, SELECT only): production already carries
--   idx_cmds_user_stat_date with exactly this definition and indisvalid = true,
--   so in production this file creates the function and the grants only.
--
-- EVIDENCE (production kuklfnapbkmacvwxktbh, 2026-09-30, SELECT only):
--   information_schema.columns: club_member_daily_stats has club_id uuid,
--   table_id uuid, user_id uuid, stat_date date, hands_played integer,
--   biggest_pot_won numeric (all NOT NULL) among its 13 columns; profiles.id
--   is the uuid primary key. pg_proc: no public.fn_profile_hand_stats exists.
--   EXPLAIN of the aggregate for a synthetic uuid: Aggregate over Sort over
--   Index Only Scan using idx_cmds_user_stat_date, Index Cond
--   (user_id = $1 AND stat_date >= CURRENT_DATE - 30), 774 estimated rows.
--   Design: agent-evidence/fleet-p6-closeout-20260920/agents/p8-research/
--   design.md sections 4.1 to 4.3 and 7.3.
-- ═══════════════════════════════════════════════════════════════════════

-- A bounded lock wait turns a busy moment into a clean, retryable failure.
SET lock_timeout = '10s';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT: everything this file depends on exists, the function it
--    creates does not (the index may already exist: see the note above).
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing text;
  n int;
BEGIN
  SELECT string_agg(required.table_name || '.' || required.column_name, ', ' ORDER BY 1)
    INTO v_missing
    FROM (VALUES
      ('club_member_daily_stats', 'user_id'),
      ('club_member_daily_stats', 'stat_date'),
      ('club_member_daily_stats', 'table_id'),
      ('club_member_daily_stats', 'hands_played'),
      ('club_member_daily_stats', 'biggest_pot_won'),
      ('profiles', 'id')
    ) AS required(table_name, column_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = required.table_name
        AND c.column_name = required.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: required columns missing: %', v_missing;
  END IF;

  SELECT string_agg(required.rolname, ', ' ORDER BY 1)
    INTO v_missing
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS required(rolname)
   WHERE NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = required.rolname);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: required roles missing: %', v_missing;
  END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'fn_profile_hand_stats';
  IF n <> 0 THEN
    RAISE EXCEPTION 'pre-flight failed: public.fn_profile_hand_stats already exists (% overload(s))', n;
  END IF;
END $preflight$;

-- ---------------------------------------------------------------------------
-- 2. THE INDEX (no-op where the lead already built it CONCURRENTLY)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cmds_user_stat_date
  ON public.club_member_daily_stats (user_id, stat_date DESC)
  INCLUDE (table_id, hands_played, biggest_pot_won);

-- ---------------------------------------------------------------------------
-- 3. THE FUNCTION: one aggregate, four ledger columns, no money result
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_profile_hand_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'hands30d',         coalesce(sum(s.hands_played), 0)::int,
    'sessions30d',      count(DISTINCT (s.table_id, s.stat_date))::int,
    'daysActive30d',    count(DISTINCT s.stat_date)::int,
    'biggestPotWon30d', coalesce(max(s.biggest_pot_won), 0)::numeric,
    'handsThisMonth',   coalesce(sum(s.hands_played) FILTER (
                          WHERE s.stat_date >= date_trunc('month', current_date)::date), 0)::int,
    'lastPlayed',       max(s.stat_date),
    'computedAt',       now()
  )
  FROM public.club_member_daily_stats s
  WHERE s.user_id = p_user_id
    AND s.stat_date >= current_date - 30;
$fn$;

COMMENT ON FUNCTION public.fn_profile_hand_stats(uuid) IS
  'Phase 8 profile stats: hands, sessions, active days, biggest pot won and month-to-date hands for one player over the last 30 days of club_member_daily_stats. Service role only; identical for every profile.';

-- ---------------------------------------------------------------------------
-- 4. PRIVILEGES: the browser roles never call this; the route does
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_profile_hand_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_profile_hand_stats(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $postapply$
DECLARE
  n int;
  v_valid boolean;
  v_stats jsonb;
  v_def text;
BEGIN
  SELECT i.indisvalid INTO v_valid
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname = 'idx_cmds_user_stat_date' AND i.indrelid = 'public.club_member_daily_stats'::regclass;
  IF v_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'post-apply: idx_cmds_user_stat_date is missing or invalid';
  END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'fn_profile_hand_stats'
     AND p.prosecdef AND p.provolatile = 's'
     AND p.proconfig @> ARRAY['search_path=public'];
  IF n <> 1 THEN
    RAISE EXCEPTION 'post-apply: expected exactly one STABLE SECURITY DEFINER fn_profile_hand_stats with search_path=public, found %', n;
  END IF;

  IF has_function_privilege('anon', 'public.fn_profile_hand_stats(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_profile_hand_stats(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_profile_hand_stats(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: fn_profile_hand_stats execute privileges are wrong';
  END IF;

  -- The two net-money columns of the ledger are never read. The pattern is
  -- assembled from pieces so that the words never appear in this file, which
  -- __tests__/profile-hand-stats-rpc.test.mjs asserts.
  v_def := pg_get_functiondef('public.fn_profile_hand_stats(uuid)'::regprocedure);
  IF v_def ~* ('pro' || 'fit') OR v_def ~* ('total' || '_won') THEN
    RAISE EXCEPTION 'post-apply: fn_profile_hand_stats reads a money column';
  END IF;

  -- A player with no rows gets zeros and null, never an error and never NULL.
  v_stats := public.fn_profile_hand_stats('00000000-0000-4000-8000-000000000000'::uuid);
  IF v_stats IS NULL
     OR (v_stats->>'hands30d')::int <> 0
     OR (v_stats->>'sessions30d')::int <> 0
     OR (v_stats->>'daysActive30d')::int <> 0
     OR (v_stats->>'biggestPotWon30d')::numeric <> 0
     OR (v_stats->>'handsThisMonth')::int <> 0
     OR v_stats->>'lastPlayed' IS NOT NULL
     OR v_stats->>'computedAt' IS NULL THEN
    RAISE EXCEPTION 'post-apply: empty-player shape is wrong: %', v_stats;
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_stats)) <> 7 THEN
    RAISE EXCEPTION 'post-apply: expected 7 keys, found %', v_stats;
  END IF;
END $postapply$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, if ever needed: drops exactly what this file created)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.fn_profile_hand_stats(uuid);
-- DROP INDEX IF EXISTS public.idx_cmds_user_stat_date;
-- COMMIT;
