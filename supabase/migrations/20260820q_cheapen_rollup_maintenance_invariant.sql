-- REGRESSION FIX (2026-08-20, mine, same day): the
-- `union_rake_rollup_unmaintained` invariant I added earlier today calls
-- fn_union_rake_day_is_fresh once per day per union, and that probe does a
-- count(*) over a full day of rake_records (~130k rows) joined to tables.
-- Seven days per union = 12.4s measured, inside a governance sweep that the
-- engine sentinel runs EVERY 30 MINUTES (full sweep measured at 57s). That is
-- precisely the unbounded recurring cost this whole session has been
-- removing, introduced by me while adding a check meant to protect against
-- slow settlements.
--
-- Fix: the invariant now tests DAY PRESENCE only -- an index lookup on
-- union_rake_rollup_days, effectively free. That still catches the condition
-- it exists for (the rollup is not being maintained, so Monday's settlement
-- would build days inline while holding treasury locks).
--
-- Staleness is deliberately NOT re-tested here: it is already handled twice,
-- both cheaply and closer to the source --
--   * fn_union_rake_rollup_catchup re-validates and re-rolls stale days every
--     settler cycle, and reports failures to engine telemetry;
--   * fn_union_rake_paid_readonly recomputes any stale day live at read time,
--     so a stale cache can never produce a wrong number regardless.
--
-- Measured after: governance sweep back to 0.94s.
-- Applied to production via Supabase MCP as
-- 'cheapen_rollup_maintenance_invariant'.
DO $$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_union_governance_check';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'fn_union_governance_check not found';
  END IF;

  v_new := replace(
    v_src,
    'WHERE NOT fn_union_rake_day_is_fresh(un.id, gs::date)) AS stale_days',
    'WHERE NOT EXISTS (SELECT 1 FROM union_rake_rollup_days rd'
    || E'\n                                  WHERE rd.union_id = un.id'
    || E'\n                                    AND rd.day = gs::date)) AS stale_days');

  v_new := replace(
    v_new,
    'Unions with 3+ stale/missing rake rollup days in the last week',
    'Unions with 3+ missing rake rollup days in the last week');

  IF v_new = v_src THEN
    RAISE EXCEPTION 'expected rollup-invariant text not found; refusing to rewrite governance blindly';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.fn_union_governance_check() '
    'RETURNS TABLE(invariant text, severity text, offenders bigint, detail text) '
    'LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_new);
END $$;
