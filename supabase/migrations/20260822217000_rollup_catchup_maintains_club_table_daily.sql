-- Keep club_table_daily fresh from the hourly job that already exists.
--
-- The Club Data screen reads club_table_daily. Something has to maintain it,
-- and CLAUDE.md section 11 forbids adding a new scheduled trigger -- no new
-- pg_cron job, no new vercel.json cron, no new GitHub schedule. The sanctioned
-- move is to add a step to a job that already runs, so this hangs off
-- fn_club_rake_rollup_catchup, called hourly at :25 by the existing pg_cron
-- job club-rake-rollup-catchup.
--
-- Two days of lookback: fn_club_table_daily_catchup always redoes today and
-- yesterday (both still moving) and repairs any older day whose stored
-- source_rows no longer matches the rake_records count. The function already
-- carries statement_timeout 600s, and a day costs a few seconds.
--
-- Wrapped so a rollup failure can never break the rake rollup this job exists
-- for; the outcome is returned as club_table_daily instead of swallowed.
--
-- Body is otherwise byte-identical to the previous definition.
--
-- Applied to production via Supabase MCP as
-- 'rollup_catchup_maintains_club_table_daily'.
CREATE OR REPLACE FUNCTION public.fn_club_rake_rollup_catchup(p_days integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '600s'
AS $function$
DECLARE
  rec record; d date;
  v_days int := 0; v_rows int := 0; v_fail int := 0; v_gaps int := 0;
  v_ctd jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.fn_is_platform_admin() THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  FOR rec IN
    SELECT DISTINCT club_id FROM union_clubs
    UNION
    SELECT DISTINCT r.club_id FROM rake_records r
     WHERE r.club_id IS NOT NULL
       AND r.created_at >= current_date - GREATEST(p_days,1) - 1
  LOOP
    FOR d IN
      SELECT gs::date FROM generate_series(
               current_date - GREATEST(p_days,1), current_date - 1, interval '1 day') gs
    LOOP
      IF EXISTS (SELECT 1 FROM club_rake_rollup_complete
                  WHERE club_id = rec.club_id AND day = d) THEN
        CONTINUE;
      END IF;
      BEGIN
        v_rows := v_rows + public.fn_club_rake_rollup_day(rec.club_id, d);
        v_days := v_days + 1;
      EXCEPTION WHEN OTHERS THEN
        v_fail := v_fail + 1;
      END;
    END LOOP;
  END LOOP;

  SELECT count(*) INTO v_gaps
    FROM (SELECT DISTINCT club_id AS cid FROM rake_records
           WHERE created_at >= current_date - GREATEST(p_days,1) - 1
             AND club_id IS NOT NULL) src
    CROSS JOIN generate_series(current_date - GREATEST(p_days,1),
                               current_date - 1, interval '1 day') g
   WHERE NOT EXISTS (SELECT 1 FROM club_rake_rollup_complete rc
                      WHERE rc.club_id = src.cid AND rc.day = g::date);

  IF v_gaps > 0 THEN
    INSERT INTO financial_alerts (severity, source, message, context)
    VALUES ('warning', 'fn_club_rake_rollup_catchup',
            'Club rake rollup has uncovered days — the live downline view is falling back to full scans',
            jsonb_build_object('gap_club_days', v_gaps, 'lookback_days', p_days,
                               'failures', v_fail, 'ran_at', now()));
  END IF;

  -- Club Data screen rollup. Additive; never allowed to break the above.
  BEGIN
    v_ctd := public.fn_club_table_daily_catchup(2);
  EXCEPTION WHEN OTHERS THEN
    v_ctd := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  RETURN jsonb_build_object('days_built', v_days, 'rows', v_rows,
                            'failures', v_fail, 'remaining_gaps', v_gaps,
                            'club_table_daily', v_ctd,
                            'ran_at', now());
END $function$;

DO $$
BEGIN
  IF position('fn_club_table_daily_catchup' in
       pg_get_functiondef('public.fn_club_rake_rollup_catchup(integer)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'hourly catchup does not maintain club_table_daily';
  END IF;
  RAISE NOTICE 'club_table_daily wired into the hourly rollup job';
END $$;
