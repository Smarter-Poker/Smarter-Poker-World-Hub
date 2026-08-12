-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260808220745_revoke_anon_execute_on_triggers_and_maintenance_fns.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Remove anon/authenticated EXECUTE from SECURITY DEFINER functions that
-- carry no internal identity check and have no business being called by a
-- browser. Two groups:
--
-- (a) Six TRIGGER functions. Postgres checks EXECUTE at trigger-creation
--     time, not at fire time, so revoking here does not affect the
--     triggers — it only removes the ability to invoke them directly over
--     PostgREST. Includes economy-sensitive ones (fn_deliver_shop_purchase,
--     fn_award_vip_points_from_rake, fn_commander_staff_hash_pin) which were
--     NOT directly exploitable precisely because they are triggers, but
--     should not be exposed regardless.
--
-- (b) Five no-arg maintenance / writer / manifest functions that anon (or
--     any logged-in user) could call to recompute every player's stats,
--     force-resolve friend challenges, expire queue entries en masse, or
--     read the schema/columns manifest. These are cron/CI/server helpers
--     that run as service_role; no user action invokes them.
--
-- Deliberately LEFT anon-executable (intentional public reads, unchanged):
--   find_live_games_nearby, find_similar_questions,
--   get_public_profile_by_username, and the three leaderboard readers
--   fn_club_leaderboard_period / fn_union_leaderboard_period /
--   fn_user_rank_period. The leaderboard readers trust their id/metric
--   params and read player_stats_snapshots; whether a 'winnings' metric
--   should be publicly rankable is a product decision, recorded for review
--   rather than changed here — breaking a public leaderboard to satisfy an
--   advisor would repeat the live_gifts mistake.
--
-- service_role retains EXECUTE throughout. Naming `public` in the revoke
-- matters: revoking from anon alone is a no-op when the grant is PUBLIC.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  fn text;
  names text[] := ARRAY[
    -- (a) triggers
    'fn_award_vip_points_from_rake','fn_commander_staff_hash_pin','fn_deliver_shop_purchase',
    'fn_survival_progress_monotonic','fn_trivia_pvp_match_sync_columns','fn_trivia_tournament_sync_player_count',
    -- (b) maintenance / writer / manifest
    'expire_old_queue_entries','fn_columns_manifest','fn_schema_manifest',
    'fn_resolve_expired_friend_challenges','fn_snapshot_player_stats'];
BEGIN
  FOREACH fn IN ARRAY names LOOP
    -- all eleven are zero-argument functions
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname=fn AND p.pronargs=0) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM public, anon, authenticated', fn);
    ELSE
      RAISE EXCEPTION 'expected zero-arg public.%(), not found as such', fn;
    END IF;
  END LOOP;
END $$;

-- Post-condition: none of the eleven may remain anon-executable; and the
-- intentional public readers must be untouched.
DO $$
DECLARE
  leaked text := '';
  broke  text := '';
  fn text;
  locked text[] := ARRAY[
    'fn_award_vip_points_from_rake','fn_commander_staff_hash_pin','fn_deliver_shop_purchase',
    'fn_survival_progress_monotonic','fn_trivia_pvp_match_sync_columns','fn_trivia_tournament_sync_player_count',
    'expire_old_queue_entries','fn_columns_manifest','fn_schema_manifest',
    'fn_resolve_expired_friend_challenges','fn_snapshot_player_stats'];
BEGIN
  FOREACH fn IN ARRAY locked LOOP
    IF has_function_privilege('anon', ('public.'||fn||'()')::text, 'EXECUTE') THEN
      leaked := leaked || fn || ' ';
    END IF;
  END LOOP;
  -- intentional public readers must still be callable by anon
  IF NOT has_function_privilege('anon','public.get_public_profile_by_username(text)','EXECUTE') THEN
    broke := broke || 'get_public_profile_by_username ';
  END IF;
  IF NOT has_function_privilege('anon','public.find_live_games_nearby(double precision,double precision,numeric,text,text)','EXECUTE') THEN
    broke := broke || 'find_live_games_nearby ';
  END IF;
  IF leaked <> '' OR broke <> '' THEN
    RAISE EXCEPTION 'post-condition failed. still anon-exec: [%]; broke public reader: [%]', leaked, broke;
  END IF;
END $$;
