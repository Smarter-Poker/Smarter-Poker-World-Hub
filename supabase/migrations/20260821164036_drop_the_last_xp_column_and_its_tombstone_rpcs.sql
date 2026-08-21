-- THE LAST XP COLUMN.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'drop_the_last_xp_column_and_its_tombstone_rpcs' (version 20260821164036).
--
-- Dan: "WHY THE FUCK ARE WE TALKING ABOUT XP, WE REMOVED THAT LIKE 8 MONTHS
-- AGO, REMOVE ANY AND ALL REMAINING REFERENCES TO XP."
--
-- Fair. club_members.reputation_xp survived that removal, and it was not inert.
--
-- WHAT IT WAS ACTUALLY DOING:
--
--   1. IT MADE club_members UNDEPLOYABLE. The xp_ban_guard event trigger
--      rejects ANY DDL against a table holding an XP-shaped column, so no
--      constraint, column or index on the single most-edited table in the club
--      system could be changed, and the error talked about XP whatever you
--      were really doing. Adding 'co_owner' to the role constraint earlier the
--      same day had to disable the guard for one statement to get past it.
--
--   2. THE PLATFORM'S OWN HEALTH CHECK HAD BEEN FAILING. verify_home_games_health
--      asserts "zero XP columns + event trigger enforcing permanent ban" and
--      counts columns matching the XP pattern. That count was 1, so the check
--      reported a failure for months. Nobody was reading it. It now reports OK.
--
--   3. IT WAS SORTING TWO SCREENS. ClubsService ordered club member lists by
--      reputation_xp in two places, one of them a "top 50". Ordering by a
--      column that is 0 on every row is not an order: Postgres returns
--      whatever it likes and it can differ between two loads of the same page.
--      Fixed client-side to order by chip balance, then join date.
--
-- All 1,499 rows were 0. Nothing read the value; the only two functions
-- mentioning the column were xp_ban_guard_fn and verify_home_games_health,
-- both of which name it in a pattern asserting it should not exist.
--
-- SEQUENCING. The client shipped first and was verified live before this ran -
-- production served ca_sha ae8a7ee94 (Club Arena bundle with no reputation_xp)
-- and World Hub c06f4df0 (agent-dashboard no longer aliases it). Selecting a
-- dropped column raises 42703 and takes the whole query with it, so dropping
-- first would have emptied the agent dashboard and two member lists until the
-- deploy caught up.
--
-- xp_ban_guard STAYS. It is the thing keeping XP out, not a thing to be
-- removed along with it. With the column gone it no longer blocks club_members,
-- which is the entire point. Verified afterwards by running real DDL against
-- club_members with the guard fully enabled, then rolling it back.
--
-- ROLLBACK
--   ALTER TABLE public.club_members ADD COLUMN reputation_xp integer DEFAULT 0;
--   -- (would require disabling xp_ban_guard, which is the policy telling you
--   --  not to do this)

DO $$
DECLARE v_nonzero bigint;
BEGIN
  SELECT count(*) INTO v_nonzero FROM club_members WHERE COALESCE(reputation_xp, 0) <> 0;
  IF v_nonzero > 0 THEN
    RAISE EXCEPTION 'pre-flight failed: % rows carry a non-zero reputation_xp', v_nonzero;
  END IF;
END $$;

ALTER EVENT TRIGGER xp_ban_guard DISABLE;
ALTER TABLE public.club_members DROP COLUMN IF EXISTS reputation_xp;
ALTER EVENT TRIGGER xp_ban_guard ENABLE;

-- Two tombstones. fn_award_social_xp was `BEGIN RETURN; END` and
-- get_user_total_xp was `BEGIN RETURN 0; END` - kept so old callers would not
-- break. Both callers are gone (a hook nothing outside itself used, and a
-- verification script), so the stubs go too. fn_calculate_level(p_xp) was
-- `RETURN 1;` with no caller anywhere.
DROP FUNCTION IF EXISTS public.fn_award_social_xp(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.get_user_total_xp(uuid);
DROP FUNCTION IF EXISTS public.fn_calculate_level(integer);

DO $$
DECLARE v_cols int; v_fns int; v_enabled char;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name ~* '(^xp$|_xp$|^xp_|_xp_|^reputation_xp$|^total_xp$|^xp_total$|^xp_earned$|^xp_reward$|^bonus_xp_|^social_xp$)';
  IF v_cols <> 0 THEN RAISE EXCEPTION 'XP columns still present: %', v_cols; END IF;

  SELECT count(*) INTO v_fns FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('fn_award_social_xp','get_user_total_xp','fn_calculate_level');
  IF v_fns <> 0 THEN RAISE EXCEPTION 'XP functions still present: %', v_fns; END IF;

  SELECT evtenabled INTO v_enabled FROM pg_event_trigger WHERE evtname = 'xp_ban_guard';
  IF v_enabled IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'xp_ban_guard was left disabled (evtenabled=%)', v_enabled;
  END IF;
END $$;
