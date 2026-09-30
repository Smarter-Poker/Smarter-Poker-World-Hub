-- ═══════════════════════════════════════════════════════════════════════
-- 20260930170400_feed_played_with_fn.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        1 (one new read-only SECURITY DEFINER function, service role
--              only, over an existing indexed table; no table, row or
--              policy change)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4, agent p8-data),
--              Fleet Content Programme Phase 8 "Discovery and the feed"
-- AFFECTS:     new function: public.fn_feed_played_with(uuid, integer, integer)
--                RETURNS TABLE (user_id uuid, shared_hands integer, last_seen timestamptz)
--              reads only: public.ca_hand_player_idx (user_id, hand_id, created_at)
--              untouched: ca_hand_player_idx and its RLS, hand_history,
--                club_member_daily_stats, social_posts, profiles
-- IRREVERSIBLE: no (the ROLLBACK block at the end drops the function)
--
-- WHY:
--   The feed ranks a signed-in viewer page so that posts by players the viewer
--   recently sat with come first (band A), then everything else (band B), each
--   band in arrival order. The only fact needed is the set of players who
--   shared a hand with the viewer recently. public.ca_hand_player_idx is the
--   per-player hand index Club Arena already maintains (one row per player
--   and hand, about the last week of play), indexed by (user_id, created_at
--   DESC) and by (hand_id); no played-with function or table exists today.
--   The identity is profiles.id for every player, so a horse the viewer sat
--   with is a co-player exactly like a human: nothing here reads is_horse,
--   origin_type or metadata.scheduler.
--
-- HOW:
--   - fn_feed_played_with(p_viewer, p_hands DEFAULT 200, p_cap DEFAULT 100):
--     the last p_hands ca_hand_player_idx rows of the viewer by created_at DESC
--     (idx_ca_hand_player_idx_user_time), joined on hand_id to the other
--     rows of the other players in those hands (idx_ca_hand_player_idx_hand_id), the
--     viewer excluded, grouped by user_id with count(*) AS shared_hands and
--     max(created_at) AS last_seen, ORDER BY last_seen DESC LIMIT p_cap.
--   - LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public: the
--     table is owner-read-only under RLS for authenticated, and the feed
--     handler runs with the service key; EXECUTE is revoked from PUBLIC, anon
--     and authenticated and granted to service_role only. A later
--     authenticated caller would add the ca_assert_self style
--     p_viewer = auth.uid() guard first.
--   - A NULL viewer returns no rows; NULL or negative limits fall back to the
--     defaults and to 0 respectively. The feed treats a failed or slow call as
--     an empty set and ranked = false; it never produces an error page.
--
-- EVIDENCE (production kuklfnapbkmacvwxktbh, 2026-09-30, SELECT only):
--   ca_hand_player_idx(user_id uuid, created_at timestamptz, hand_id uuid,
--   asset text default chips), primary key (user_id, hand_id), indexes
--   idx_ca_hand_player_idx_user_time (user_id, created_at DESC) and
--   idx_ca_hand_player_idx_hand_id (hand_id); 19.7M rows, 4.9 GB, a rolling
--   window of about one week. EXPLAIN ANALYZE of this exact query for one
--   viewer: 200 + 998 index rows, 1,225 shared buffers, 754 ms cold and well
--   under 50 ms warm (design report check 12). pg_proc has no function named
--   like played_with, tablemate or opponent.
--   Design: agent-evidence/fleet-p6-closeout-20260920/agents/p8-research/design.md
--   sections 3.4, 7.4 and 9.
-- ═══════════════════════════════════════════════════════════════════════

SET lock_timeout = '10s';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT: the indexed table exists, the function does not.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing text;
  n int;
BEGIN
  SELECT string_agg(required.column_name, ', ' ORDER BY required.column_name)
    INTO v_missing
    FROM (VALUES ('user_id'), ('hand_id'), ('created_at')) AS required(column_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'ca_hand_player_idx'
        AND c.column_name = required.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: ca_hand_player_idx columns missing: %', v_missing;
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'ca_hand_player_idx'
     AND indexname IN ('idx_ca_hand_player_idx_user_time', 'idx_ca_hand_player_idx_hand_id');
  IF n <> 2 THEN
    RAISE EXCEPTION 'pre-flight failed: expected idx_ca_hand_player_idx_user_time and idx_ca_hand_player_idx_hand_id, found %', n;
  END IF;

  SELECT count(*) INTO n FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role');
  IF n <> 3 THEN
    RAISE EXCEPTION 'pre-flight failed: the anon, authenticated and service_role roles are required';
  END IF;

  IF to_regprocedure('public.fn_feed_played_with(uuid, integer, integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.fn_feed_played_with(uuid, integer, integer) already exists';
  END IF;
END $preflight$;

-- ---------------------------------------------------------------------------
-- 2. THE FUNCTION
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_feed_played_with(
  p_viewer uuid,
  p_hands integer DEFAULT 200,
  p_cap integer DEFAULT 100
)
RETURNS TABLE (user_id uuid, shared_hands integer, last_seen timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH viewer_hands AS (
    SELECT v.hand_id
      FROM public.ca_hand_player_idx v
     WHERE v.user_id = p_viewer
     ORDER BY v.created_at DESC
     LIMIT GREATEST(COALESCE(p_hands, 200), 0)
  )
  SELECT o.user_id,
         count(*)::integer AS shared_hands,
         max(o.created_at) AS last_seen
    FROM viewer_hands vh
    JOIN public.ca_hand_player_idx o ON o.hand_id = vh.hand_id
   WHERE o.user_id <> p_viewer
   GROUP BY o.user_id
   ORDER BY max(o.created_at) DESC, o.user_id
   LIMIT GREATEST(COALESCE(p_cap, 100), 0)
$function$;

COMMENT ON FUNCTION public.fn_feed_played_with(uuid, integer, integer) IS
  'Service-role-only feed helper: the players who shared one of the last p_hands hands of the viewer (ca_hand_player_idx), with shared_hands and last_seen, newest first, at most p_cap rows. Horses and humans alike.';

REVOKE ALL ON FUNCTION public.fn_feed_played_with(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_feed_played_with(uuid, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $postapply$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'fn_feed_played_with'
     AND p.prosecdef AND p.provolatile = 's';
  IF n <> 1 THEN RAISE EXCEPTION 'post-apply: expected one STABLE SECURITY DEFINER fn_feed_played_with, found %', n; END IF;

  IF has_function_privilege('anon', 'public.fn_feed_played_with(uuid, integer, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_feed_played_with(uuid, integer, integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_feed_played_with(uuid, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: fn_feed_played_with execute privileges are wrong';
  END IF;

  -- The function answers (an unknown viewer has no co-players) and never errors.
  SELECT count(*) INTO n FROM public.fn_feed_played_with('00000000-0000-0000-0000-000000000000'::uuid, 200, 100);
  IF n <> 0 THEN RAISE EXCEPTION 'post-apply: the nil viewer must have no co-players, found %', n; END IF;
END $postapply$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, if ever needed: drops exactly what this file created)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.fn_feed_played_with(uuid, integer, integer);
-- COMMIT;
