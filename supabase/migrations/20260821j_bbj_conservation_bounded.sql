-- 2026-08-20: fn_bbj_conservation_check was the remaining reason the union
-- treasury sentinel was slow, and it is the same unbounded-aggregate shape
-- that has now caused three separate timeouts in this system.
--
-- It computes whole-history BBJ conservation (all inflow - all outflow -
-- current balances) from six sources. Measured plan before this migration:
--
--   bbj_contributions        parallel seq scan, cost 22,350 (339k rows)
--   union_wallet_transactions
--     tx_type='bbj_fund'     parallel seq scan, cost 21,839 -- 610k rows
--                            scanned to find ~12 matching rows
--   union_wallet_transactions
--     tx_type='bbj_promo_sweep'  same shape
--   wallet_transactions
--     category='promotion' AND
--     description='BBJ promo pool payout'
--                            parallel seq scan, cost 73,467 -- the single
--                            most expensive leg, for ~1 row
--   chip_transactions        already indexed
--   bbj_pools                trivial (310 rows)
--
-- Total 2,701 ms, called every 30 minutes by fn_union_treasury_selftest.
--
-- Fix, in two parts:
--
-- 1. Two tiny partial covering indexes (88 kB and 8 kB) for the two
--    extremely selective filters. A complete fix for those legs, not a
--    band-aid: the matching row counts are tiny and grow only when those
--    rare treasury events actually occur. Created CONCURRENTLY outside this
--    file to avoid a SHARE lock on hot tables; the IF NOT EXISTS statements
--    below are the auditable, replayable record. 2,701 ms -> 513 ms.
--
-- 2. The bbj_contributions inflow sum is genuinely O(all history) and
--    cannot be date-bounded without changing what conservation means, so it
--    gets the same incremental checkpoint used for the union rake ledger in
--    20260821h -- generalised here into money_flow_checkpoint, keyed by a
--    metric name so future whole-history totals can reuse it.
--
-- IMPORTANT CONTRACT NOTE: fn_bbj_conservation_check is STABLE, so it may
-- not write. The naive version of this change (having it advance its own
-- checkpoint) would have forced it to VOLATILE, silently changing a
-- function that other code may depend on being side-effect free. Instead
-- the split is:
--
--   fn_bbj_contributions_total()          STABLE   -- read: checkpoint + tail
--   fn_bbj_contributions_total_advance()  VOLATILE -- fold the tail forward
--   fn_bbj_contributions_total_verify()   VOLATILE -- full recompute + repair
--
-- fn_bbj_conservation_check keeps its exact STABLE/SECURITY DEFINER
-- signature and simply reads. fn_union_treasury_selftest (already VOLATILE)
-- does the advancing before it calls the check. The read is exact whether or
-- not the checkpoint is current -- an un-advanced checkpoint just means a
-- longer tail, never a wrong answer.
--
-- Why exactness is load-bearing here: the conservation gap is compared
-- against a stored baseline with a tolerance of 1.00, so an incremental
-- total that drifted by even a cent would raise a false critical alert.
-- fn_bbj_contributions_total_verify therefore recomputes in full once per
-- 24h, overwrites the checkpoint with truth, and raises a critical
-- financial_alert if the incremental value ever disagreed.
--
-- Output contract verified unchanged against the pre-migration value:
--   gap 59510.86, inflow 306117.43, outflow 229850.95, balances 16755.62,
--   drift_from_baseline 0, healthy true.
--
-- Applied to production via Supabase MCP apply_migration as
-- 'bbj_conservation_bounded' on 2026-08-20.

CREATE INDEX IF NOT EXISTS idx_uwt_bbj_flows
  ON public.union_wallet_transactions (tx_type)
  INCLUDE (amount)
  WHERE tx_type IN ('bbj_fund','bbj_promo_sweep');

CREATE INDEX IF NOT EXISTS idx_wt_bbj_promo_payout
  ON public.wallet_transactions (category)
  INCLUDE (amount)
  WHERE category = 'promotion' AND description = 'BBJ promo pool payout';

-- Generic cumulative-total checkpoint, keyed by metric name.
CREATE TABLE IF NOT EXISTS public.money_flow_checkpoint (
  metric_key       text PRIMARY KEY,
  as_of            timestamptz NOT NULL,
  total            numeric NOT NULL DEFAULT 0,
  rows_seen        bigint  NOT NULL DEFAULT 0,
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.money_flow_checkpoint ENABLE ROW LEVEL SECURITY;
-- No policies: service role and SECURITY DEFINER functions only.

-- READ (STABLE, no writes): checkpoint + bounded tail. Exact regardless of
-- how stale the checkpoint is.
CREATE OR REPLACE FUNCTION public.fn_bbj_contributions_total()
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_as_of timestamptz;
  v_total numeric;
  v_tail  numeric;
BEGIN
  SELECT c.as_of, c.total INTO v_as_of, v_total
    FROM money_flow_checkpoint c WHERE c.metric_key = 'bbj_contributions_inflow';
  IF NOT FOUND THEN
    v_as_of := '-infinity'::timestamptz; v_total := 0;
  END IF;

  SELECT COALESCE(SUM(b.amount), 0) INTO v_tail
    FROM bbj_contributions b WHERE b.created_at >= v_as_of;

  RETURN v_total + v_tail;
END;
$function$;

-- ADVANCE (VOLATILE): fold everything older than one hour into the
-- checkpoint. The one-hour lag is a commit-skew guard -- a row can be
-- assigned created_at = T and commit slightly after T; advancing past T in
-- that gap would drop the row from both checkpoint and tail permanently.
CREATE OR REPLACE FUNCTION public.fn_bbj_contributions_total_advance()
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_key    text := 'bbj_contributions_inflow';
  v_as_of  timestamptz;
  v_total  numeric;
  v_rows   bigint;
  v_target timestamptz := now() - interval '1 hour';
  d_total  numeric;
  d_rows   bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('money_flow_cp:' || v_key, 42));

  SELECT c.as_of, c.total, c.rows_seen INTO v_as_of, v_total, v_rows
    FROM money_flow_checkpoint c WHERE c.metric_key = v_key;
  IF NOT FOUND THEN
    v_as_of := '-infinity'::timestamptz; v_total := 0; v_rows := 0;
  END IF;

  IF v_target <= v_as_of THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(b.amount), 0), COUNT(*)
    INTO d_total, d_rows
    FROM bbj_contributions b
   WHERE b.created_at >= v_as_of AND b.created_at < v_target;

  INSERT INTO money_flow_checkpoint
        (metric_key, as_of, total, rows_seen, last_verified_at, updated_at)
  VALUES (v_key, v_target, v_total + d_total, v_rows + d_rows, now(), now())
  ON CONFLICT (metric_key) DO UPDATE
    SET as_of      = EXCLUDED.as_of,
        total      = EXCLUDED.total,
        rows_seen  = EXCLUDED.rows_seen,
        updated_at = now();
END;
$function$;

-- VERIFY (VOLATILE): full recompute, compare against what the incremental
-- path believed, overwrite with truth, alert on any disagreement.
CREATE OR REPLACE FUNCTION public.fn_bbj_contributions_total_verify()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_key      text := 'bbj_contributions_inflow';
  v_target   timestamptz := now() - interval '1 hour';
  v_total    numeric; v_rows bigint;
  v_old      numeric; v_old_as_of timestamptz;
  v_tail     numeric; v_believed numeric; v_drift numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('money_flow_cp:' || v_key, 42));

  SELECT c.total, c.as_of INTO v_old, v_old_as_of
    FROM money_flow_checkpoint c WHERE c.metric_key = v_key;

  SELECT COALESCE(SUM(b.amount), 0), COUNT(*) INTO v_total, v_rows
    FROM bbj_contributions b WHERE b.created_at < v_target;

  IF v_old_as_of IS NOT NULL THEN
    SELECT COALESCE(SUM(b.amount), 0) INTO v_tail
      FROM bbj_contributions b
     WHERE b.created_at >= v_old_as_of AND b.created_at < v_target;
    v_believed := v_old + v_tail;
    v_drift    := round(v_believed - v_total, 2);
  END IF;

  INSERT INTO money_flow_checkpoint
        (metric_key, as_of, total, rows_seen, last_verified_at, updated_at)
  VALUES (v_key, v_target, v_total, v_rows, now(), now())
  ON CONFLICT (metric_key) DO UPDATE
    SET as_of            = EXCLUDED.as_of,
        total            = EXCLUDED.total,
        rows_seen        = EXCLUDED.rows_seen,
        last_verified_at = now(),
        updated_at       = now();

  IF COALESCE(v_drift, 0) <> 0 THEN
    INSERT INTO financial_alerts (severity, source, message, context)
    SELECT 'critical', 'fn_bbj_contributions_total_verify',
           'BBJ contributions checkpoint drifted from recomputed truth',
           jsonb_build_object('metric_key', v_key, 'drift', v_drift,
                              'believed', v_believed, 'truth', v_total)
     WHERE NOT EXISTS (
       SELECT 1 FROM financial_alerts
        WHERE source = 'fn_bbj_contributions_total_verify'
          AND resolved IS NOT TRUE);
  END IF;

  RETURN jsonb_build_object('metric_key', v_key, 'as_of', v_target,
                            'total', v_total, 'rows_seen', v_rows,
                            'drift', COALESCE(v_drift, 0));
END;
$function$;

-- Conservation check: STABLE and side-effect free, exactly as before. The
-- only change is that the inflow sum is read from the checkpoint instead of
-- seq-scanning the whole of bbj_contributions.
CREATE OR REPLACE FUNCTION public.fn_bbj_conservation_check()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_in numeric; v_out numeric; v_bal numeric; v_gap numeric; v_base record;
BEGIN
  v_in := fn_bbj_contributions_total();
  v_in := v_in + (SELECT COALESCE(SUM(amount),0) FROM union_wallet_transactions WHERE tx_type='bbj_fund');

  v_out := (SELECT COALESCE(SUM(total_amount),0) FROM bbj_payouts)
         + (SELECT COALESCE(SUM(amount),0) FROM union_wallet_transactions WHERE tx_type='bbj_promo_sweep')
         + (SELECT COALESCE(SUM(amount),0) FROM chip_transactions WHERE transaction_type='bbj_promo_sweep')
         + (SELECT COALESCE(SUM(amount),0) FROM wallet_transactions
             WHERE category='promotion' AND description='BBJ promo pool payout');

  SELECT COALESCE(SUM(main_balance+backup_balance+promo_balance),0) INTO v_bal FROM bbj_pools;

  v_gap := round(v_in - v_out - v_bal, 2);
  SELECT * INTO v_base FROM bbj_conservation_baseline WHERE id = 1;

  RETURN jsonb_build_object(
    'inflow', round(v_in,2), 'outflow', round(v_out,2), 'balances', round(v_bal,2),
    'gap', v_gap,
    'baseline_gap', COALESCE(v_base.baseline_gap, 0),
    'drift_from_baseline', round(v_gap - COALESCE(v_base.baseline_gap, 0), 2),
    'tolerance', COALESCE(v_base.tolerance, 1.00),
    'healthy', abs(v_gap - COALESCE(v_base.baseline_gap, 0)) <= COALESCE(v_base.tolerance, 1.00));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bbj_contributions_total()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_bbj_contributions_total_advance()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_bbj_contributions_total_verify()
  FROM PUBLIC, anon, authenticated;
