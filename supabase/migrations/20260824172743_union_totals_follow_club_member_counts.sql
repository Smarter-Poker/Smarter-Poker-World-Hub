-- ═══════════════════════════════════════════════════════════════════════════
-- The union total follows its clubs (Dan 2026-08-24)
--
--   "HOW CAN THE UNION ONLY HAVE 328 PLAYERS BUT 551 PLAYERS CURRENTLY PLAYING.
--    THE UNION TOTAL IS THE TOTAL OF ALL MEMBERS IN ALL CLUBS = TOTAL MEMBERS
--    IN THE UNION, EVEN IF THE SAME PLAYER IS IN MULTIPLE CLUBS IN THE UNION,
--    THEY GET COUNTED TWICE, 3X ETC."
--
-- The definition was already right: recompute_union_levels() sets
-- unions.total_players to SUM(clubs.member_count) over union_clubs, which
-- counts a player once per club exactly as Dan describes.
--
-- WHAT WAS ACTUALLY BROKEN: nothing ever called it when a club's membership
-- changed. The full set of triggers before this migration was
--
--   club_members  -> trg_recompute_club_level_on_member_change  (club level)
--                 -> trg_club_members_level_sync                (club level)
--                 -> trg_sync_agent_player_counts               (agent counts)
--   union_clubs   -> trg_recompute_union_level_on_club_change   (union totals)
--
-- so the union total was refreshed ONLY when a club joined or left the union.
-- Every player who joined a club in between was invisible to the union, and the
-- number sat frozen at whatever it was on the day the last club joined while
-- the clubs underneath it grew. recompute_union_levels() is not on any cron
-- either (cron.job holds union-integrity-sweep, union-law-selftest and the two
-- weekly rakeback jobs; none of them call it), so nothing else caught it.
--
-- The fix goes where the write arrives, not on a timer: when a member club's
-- denormalised counts change, the union that owns that club is recomputed in
-- the same statement.
--
-- SAFETY
--   * Statement-level with transition tables, so a bulk membership import
--     recomputes each affected union ONCE, not once per row.
--   * Only fires when a count column actually changed value -- clubs is
--     updated constantly for unrelated reasons.
--   * recompute_union_levels writes to `unions` only, and this trigger reads
--     `clubs`, so there is no recursion path back into itself.
--   * lock_timeout is set because CREATE TRIGGER needs AccessExclusiveLock on
--     clubs, which is read constantly by a live table fleet. The first attempt
--     at this migration DEADLOCKED against that traffic. Failing fast and being
--     re-run is correct; waiting indefinitely on a hot table is not.
--
-- VERIFIED after apply: UPDATE clubs SET member_count = member_count + 7 inside
-- a transaction moved unions.total_players 1172 -> 1179 in the same statement;
-- ROLLBACK returned it to 1172.
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_union_totals_follow_club_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT uc.union_id
      FROM newrows n
      JOIN oldrows o ON o.id = n.id
      JOIN union_clubs uc ON uc.club_id = n.id
     WHERE COALESCE(n.member_count, 0)      IS DISTINCT FROM COALESCE(o.member_count, 0)
        OR COALESCE(n.admin_count, 0)       IS DISTINCT FROM COALESCE(o.admin_count, 0)
        OR COALESCE(n.super_agent_count, 0) IS DISTINCT FROM COALESCE(o.super_agent_count, 0)
        OR COALESCE(n.agent_count, 0)       IS DISTINCT FROM COALESCE(o.agent_count, 0)
  LOOP
    PERFORM public.recompute_union_levels(r.union_id, true);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_union_totals_follow_club_counts ON public.clubs;
CREATE TRIGGER trg_union_totals_follow_club_counts
  AFTER UPDATE ON public.clubs
  REFERENCING NEW TABLE AS newrows OLD TABLE AS oldrows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_union_totals_follow_club_counts();

RESET lock_timeout;

-- One-time catch-up for the drift that has already accumulated.
SELECT public.recompute_union_levels(NULL, true);

DO $$
DECLARE
  v_bad text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'clubs' AND t.tgname = 'trg_union_totals_follow_club_counts'
  ) THEN
    RAISE EXCEPTION 'trg_union_totals_follow_club_counts was not created';
  END IF;

  SELECT string_agg(format('%s: stored %s, live %s', x.name, x.stored, x.live), '; ')
    INTO v_bad
    FROM (
      SELECT u.name,
             COALESCE(u.total_players, 0) AS stored,
             COALESCE((SELECT SUM(c.member_count)
                         FROM union_clubs uc
                         JOIN clubs c ON c.id = uc.club_id
                        WHERE uc.union_id = u.id), 0) AS live
        FROM unions u
    ) x
   WHERE x.stored <> x.live;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'union totals still disagree with their clubs after catch-up: %', v_bad;
  END IF;
END $$;
