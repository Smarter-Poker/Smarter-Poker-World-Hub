-- ═══════════════════════════════════════════════════════════════════════
-- 20260824_bbj_credited_report_and_catchup.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER: 2 | AUTHOR: Claude (Cowork) | IRREVERSIBLE: no
--
-- WHY:
--   The companion to 20260824_bbj_attribution_daily_user. That migration
--   works out WHO funded the jackpot; this one is how a person reads it, and
--   how the table keeps filling without anyone remembering to run it.
--
--   Dan asked for the BBJ to be tracked "the same way we track rake credited
--   to players... so agents, clubs and union know who accredited what to the
--   BBJ, back up BBJ and promo fund" — so the report carries the AGENT, and
--   splits every figure three ways rather than reporting one lump.
--
-- HOW:
--   fn_bbj_credited_report(union, days, limit) — leaderboard across the
--     union's clubs, agent resolved through club_members. Union staff only:
--     this is every member's contribution history. A member reading their OWN
--     row goes through the RLS policy on bbj_daily_user, not through here.
--   fn_bbj_rollup_catchup(days) — rolls any COMPLETE day that has
--     contributions and no rows yet. Idempotent; safe on a schedule.
--
--   The report's scope deliberately includes the union's own id as well as
--   its member clubs: hands on union tables are stamped with the UNION as
--   their club_id, so leaving it out reports an empty leaderboard on a live
--   union. (That stamping is itself worth revisiting — per-club attribution
--   of both rake and BBJ is not recoverable while every union table reports
--   the union as its club.)
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_bbj_credited_report(
  p_union_id uuid,
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  user_id uuid, username text, club_id uuid, club_name text,
  agent_id uuid, agent_name text,
  bbj_amount numeric, main_amount numeric, backup_amount numeric,
  promo_amount numeric, hands bigint
)
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_ok  boolean := false;
BEGIN
  IF v_uid IS NULL OR p_union_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM unions u WHERE u.id = p_union_id AND u.owner_id = v_uid)
      OR EXISTS (SELECT 1 FROM union_admins ua WHERE ua.union_id = p_union_id AND ua.user_id = v_uid)
    INTO v_ok;
  IF NOT v_ok THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scope AS (
    SELECT uc.club_id AS cid FROM union_clubs uc WHERE uc.union_id = p_union_id
    UNION SELECT p_union_id
  ), agg AS (
    SELECT d.user_id, d.club_id,
           SUM(d.bbj_amount) AS bbj, SUM(d.main_amount) AS m,
           SUM(d.backup_amount) AS bk, SUM(d.promo_amount) AS pr,
           SUM(d.hands) AS h
      FROM bbj_daily_user d
      JOIN scope s ON s.cid = d.club_id
     WHERE d.day >= (now()::date - GREATEST(COALESCE(p_days, 7), 1))
     GROUP BY d.user_id, d.club_id
  )
  SELECT a.user_id, COALESCE(p.username, 'Player')::text,
         a.club_id, COALESCE(c.name, 'Club')::text,
         cm.agent_id, COALESCE(ap.username, NULL)::text,
         round(a.bbj, 2), round(a.m, 2), round(a.bk, 2), round(a.pr, 2), a.h
    FROM agg a
    LEFT JOIN profiles p  ON p.id = a.user_id
    LEFT JOIN clubs    c  ON c.id = a.club_id
    LEFT JOIN club_members cm ON cm.club_id = a.club_id AND cm.user_id = a.user_id
    LEFT JOIN profiles ap ON ap.id = cm.agent_id
   ORDER BY a.bbj DESC
   LIMIT GREATEST(COALESCE(p_limit, 100), 1);
END;
$fn$ SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.fn_bbj_credited_report(uuid, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_bbj_credited_report(uuid, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_bbj_rollup_catchup(p_days integer DEFAULT 3)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  r record;
  v_done integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT b.club_id, b.created_at::date AS day
      FROM bbj_contributions b
     WHERE b.created_at >= (now()::date - GREATEST(COALESCE(p_days, 3), 1))
       AND b.created_at <  date_trunc('day', now())
       AND NOT EXISTS (SELECT 1 FROM bbj_daily_user d
                        WHERE d.club_id = b.club_id AND d.day = b.created_at::date)
  LOOP
    BEGIN
      PERFORM fn_bbj_rollup_day(r.club_id, r.day);
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One bad club-day must not stop the sweep, but it must be visible.
      RAISE WARNING '[bbj-rollup] % % failed: %', r.club_id, r.day, SQLERRM;
    END;
  END LOOP;
  RETURN v_done;
END;
$fn$ SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.fn_bbj_rollup_catchup(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bbj_rollup_catchup(integer) TO service_role;

DO $$
BEGIN
    IF has_function_privilege('anon','public.fn_bbj_credited_report(uuid,integer,integer)','EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: anon can read the BBJ leaderboard';
    END IF;
    IF has_function_privilege('anon','public.fn_bbj_rollup_catchup(integer)','EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: anon can execute the catch-up';
    END IF;
    RAISE NOTICE 'post-apply OK: report + catch-up ready';
END $$;

COMMIT;
