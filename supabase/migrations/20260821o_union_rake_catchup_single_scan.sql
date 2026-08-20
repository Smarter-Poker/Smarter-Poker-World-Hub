-- 2026-08-20: the union rake rollup catch-up was timing out on every settler
-- cycle. Found in the engine log:
--
--   [RakebackSettler.rake_rollup_catchup_rpc] Error:
--   fn_union_rake_rollup_catchup_all failed: canceling statement due to
--   statement timeout
--
-- It failed on 1 of 1 runs in the window checked, so this was not a blip.
--
-- CAUSE 1 -- N scans, done twice.
--   fn_union_rake_rollup_catchup called fn_union_rake_day_is_fresh once per
--   day to select the stale days, and then AGAIN once per day to count how
--   many were left over. Each call is a full-day COUNT over rake_records
--   (~100k rows/day) joined to tables to filter by union. With the old 10-day
--   lookback that is roughly twenty separate scans per union per cycle.
--
--   Replaced with fn_union_rake_stale_days: ONE set-based scan that groups the
--   whole window by day and compares against union_rake_rollup_days. The
--   leftover count is derived from that same array rather than re-counting, so
--   the reporting step can no longer time out on its own.
--
-- CAUSE 2 -- a generic plan.
--   The identical SQL is 2.3s written with literal values but 19.2s inside the
--   function with parameters: the planner caches a GENERIC plan that cannot
--   use the real union_id and date bounds to pick index scans or estimate
--   rows. plan_cache_mode = force_custom_plan makes it re-plan per call, which
--   is what a once-per-cycle maintenance query wants. 19.2s -> 4.0s.
--
-- CAUSE 3 -- the window was simply too long.
--   Cost is linear in the window. Ten days is 4.0s even with a custom plan,
--   too close to the 8s statement timeout to survive a busy moment -- and when
--   it trips, the entire catch-up aborts. Lookback default 10 -> 4.
--
--   Nothing depends on the longer window for CORRECTNESS. A stale day is
--   detected by record-count mismatch and recomputed live at read time by
--   fn_union_rake_paid_by_club over whatever window the caller asks for, so a
--   day that drifts outside the catch-up window is still fixed the moment it
--   is read. This function exists purely to keep that work OUT of the Monday
--   settlement transaction, and four days achieves that. Pass
--   p_lookback_days explicitly for a deeper sweep.
--
-- Result: timeout -> 2.64s for fn_union_rake_rollup_catchup_all(3), roughly 3x
-- headroom under the 8s limit.
--
-- Verified after the change: catch-up returns
-- {"rolled":[], "failed":[], "stale_remaining":0} and every rolled day still
-- matches its live count exactly (2026-08-16..19: 102171, 112263, 132351,
-- 91301, all equal).
--
-- KNOWN, NOT CHANGED HERE: fn_union_rake_paid_by_club and
-- fn_union_rake_paid_readonly still call fn_union_rake_day_is_fresh once per
-- day across their own window, so they carry the same per-day cost inside the
-- settlement read path. That path is verified working and is deliberately not
-- being rewritten in the same pass as an unrelated fix; it should be moved to
-- fn_union_rake_stale_days next, with a settlement dry-run to prove no
-- regression.
--
-- Applied to production via Supabase MCP apply_migration in three steps:
-- 'union_rake_stale_days_single_scan', then
-- 'union_rake_stale_days_force_custom_plan', then
-- 'union_rake_catchup_shorter_lookback'. This file is the final state.

CREATE OR REPLACE FUNCTION public.fn_union_rake_stale_days(
  p_union_id uuid, p_from date, p_to_exclusive date)
RETURNS SETOF date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH live AS (
    SELECT (r.created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
      FROM rake_records r
      JOIN tables t ON t.id = r.table_id AND t.union_id = p_union_id
     WHERE r.created_at >= (p_from::timestamp AT TIME ZONE 'UTC')
       AND r.created_at <  (p_to_exclusive::timestamp AT TIME ZONE 'UTC')
       AND r.player_contributions IS NOT NULL AND r.rake_amount > 0
     GROUP BY 1
  ),
  days AS (
    SELECT gs::date AS day
      FROM generate_series(p_from, p_to_exclusive - 1, interval '1 day') gs
  )
  SELECT d.day
    FROM days d
    LEFT JOIN live l ON l.day = d.day
    LEFT JOIN union_rake_rollup_days u
      ON u.union_id = p_union_id AND u.day = d.day
   WHERE u.day IS NULL
      OR u.records_seen IS DISTINCT FROM COALESCE(l.n, 0)
   ORDER BY d.day;
$function$;

ALTER FUNCTION public.fn_union_rake_stale_days(uuid, date, date)
  SET plan_cache_mode TO 'force_custom_plan';

CREATE OR REPLACE FUNCTION public.fn_union_rake_rollup_catchup(
  p_union_id uuid, p_max_days integer DEFAULT 3, p_lookback_days integer DEFAULT 4)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  d date;
  v_stale date[];
  v_done text[] := '{}';
  v_failed text[] := '{}';
  v_rolled int := 0;
BEGIN
  -- ONE scan for the whole window. This used to call
  -- fn_union_rake_day_is_fresh once per day to pick the stale days and then
  -- AGAIN once per day to count what was left -- about 20 separate full-day
  -- counts over rake_records for the old 10-day lookback, each joining ~100k
  -- rows to tables. That reliably exceeded the 8s statement timeout, so the
  -- catch-up aborted on every settler cycle and the rollup was only ever kept
  -- current by its lazy readers.
  v_stale := ARRAY(
    SELECT s FROM fn_union_rake_stale_days(p_union_id, v_today - p_lookback_days, v_today) s
  );

  FOREACH d IN ARRAY v_stale LOOP
    EXIT WHEN v_rolled >= GREATEST(p_max_days, 0);
    BEGIN
      PERFORM fn_union_rake_rollup_refresh_day(p_union_id, d);
      v_done := v_done || d::text;
      v_rolled := v_rolled + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || (d::text || ':' || SQLERRM);
      v_rolled := v_rolled + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'union_id', p_union_id,
    'rolled', to_jsonb(v_done),
    'failed', to_jsonb(v_failed),
    -- Everything we did not get to this cycle. Derived from the single scan
    -- above rather than re-counting, so reporting cannot itself time out.
    'stale_remaining', GREATEST(COALESCE(array_length(v_stale, 1), 0) - v_rolled, 0));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_rake_stale_days(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
