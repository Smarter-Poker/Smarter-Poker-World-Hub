-- 2026-08-20: fn_union_treasury_selftest timed out AGAIN, and this time the
-- cause was the rake_wallet ledger reconciliation, not the BBJ scan that was
-- bounded earlier today.
--
-- The leg was:
--     SELECT SUM(amount) FILTER (WHERE direction='credit'), ...
--       FROM union_wallet_transactions
--      WHERE union_id = ? AND wallet = 'rake_wallet';
--
-- No date bound and no usable index: a sequential scan of a 186 MB table
-- holding 609,174 rake_wallet rows and growing ~69,000 rows/day. It ran
-- every 30 minutes from the settler and had crossed the statement timeout,
-- so the ENTIRE union treasury sentinel (wallet non-negativity, ledger
-- reconciliation, lapsed-week detection, BBJ duplicate/conservation checks,
-- settler lag) was aborting on every cycle and detecting nothing.
--
-- A date bound is NOT available here: the check compares the live wallet
-- balance against the sum of ALL ledger entries, so truncating the window
-- changes what the invariant means. Instead this uses the same incremental
-- design as the union rake daily rollup:
--
--   * idx_uwt_rake_wallet_recon -- partial covering index on the rake_wallet
--     rows, keyed (union_id, created_at) INCLUDE (amount, direction).
--     Created CONCURRENTLY outside this file (a non-concurrent build takes a
--     SHARE lock that would stall live rake writes on a hot table); the
--     IF NOT EXISTS statement below is the auditable, replayable record.
--     Full sum via this index: 599 ms, down from a seq scan that never
--     finished inside the timeout.
--
--   * union_rake_ledger_checkpoint -- cumulative (credits, debits, rows_seen)
--     folded in up to an exclusive `as_of`. fn_union_rake_ledger_totals
--     returns checkpoint + a bounded live tail, so per-cycle cost is O(rows
--     written in the last hour) instead of O(all history). Without this the
--     index alone is a band-aid: at the current write rate the full scan is
--     ~600 ms today, ~6 s in a year, and back over the timeout after that.
--
-- The one-hour lag on `as_of` is a commit-skew guard. A row can be assigned
-- created_at = T and commit slightly after T; if the checkpoint advanced
-- past T in that gap the row would be folded into neither the checkpoint nor
-- the tail and would be lost from the total permanently. Writes here settle
-- in well under a second, so an hour is enormous headroom.
--
-- Because an incremental total can in principle drift from truth (a fold-in
-- bug, or someone mutating/deleting historical ledger rows -- which a ledger
-- should never permit but nothing structurally prevents),
-- fn_union_rake_ledger_checkpoint_verify does a full recompute, compares it
-- against what the incremental path believed, overwrites the checkpoint with
-- truth, and raises a critical financial_alert on any disagreement. The
-- selftest calls it when last_verified_at is older than 24h -- so the cheap
-- path runs every cycle and the expensive truth check runs once a day.
--
-- Ground truth at the time of writing (union fade0000-...-0001):
--   credits 1,705,184.47 - debits 1,090,486.21 = 614,698.26
--   wallet 614,652.65, drift -45.61 (tolerance 150) -> healthy.
--
-- Applied to production via Supabase MCP apply_migration as
-- 'union_rake_ledger_checkpoint' on 2026-08-20.

CREATE INDEX IF NOT EXISTS idx_uwt_rake_wallet_recon
  ON public.union_wallet_transactions (union_id, created_at)
  INCLUDE (amount, direction)
  WHERE wallet = 'rake_wallet';

CREATE TABLE IF NOT EXISTS public.union_rake_ledger_checkpoint (
  union_id         uuid PRIMARY KEY,
  as_of            timestamptz NOT NULL,
  credits          numeric NOT NULL DEFAULT 0,
  debits           numeric NOT NULL DEFAULT 0,
  rows_seen        bigint  NOT NULL DEFAULT 0,
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.union_rake_ledger_checkpoint ENABLE ROW LEVEL SECURITY;
-- No policies: service role and SECURITY DEFINER functions only.

-- Cumulative rake_wallet totals: checkpoint + bounded live tail.
CREATE OR REPLACE FUNCTION public.fn_union_rake_ledger_totals(p_union_id uuid)
RETURNS TABLE(total_credits numeric, total_debits numeric,
              total_rows bigint, checkpoint_as_of timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_as_of  timestamptz;
  v_cr     numeric;
  v_db     numeric;
  v_rows   bigint;
  v_target timestamptz := now() - interval '1 hour';
  d_cr     numeric;
  d_db     numeric;
  d_rows   bigint;
BEGIN
  SELECT c.as_of, c.credits, c.debits, c.rows_seen
    INTO v_as_of, v_cr, v_db, v_rows
    FROM union_rake_ledger_checkpoint c WHERE c.union_id = p_union_id;
  IF NOT FOUND THEN
    v_as_of := '-infinity'::timestamptz; v_cr := 0; v_db := 0; v_rows := 0;
  END IF;

  IF v_target > v_as_of THEN
    -- Advancing the checkpoint is a pure optimization: if it fails (read-only
    -- context, lock trouble) the totals below are still exact, just computed
    -- over a longer tail.
    BEGIN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('union_rake_ledger_cp:' || p_union_id::text, 42));

      -- Re-read under the lock; a concurrent caller may have advanced it.
      SELECT c.as_of, c.credits, c.debits, c.rows_seen
        INTO v_as_of, v_cr, v_db, v_rows
        FROM union_rake_ledger_checkpoint c WHERE c.union_id = p_union_id;
      IF NOT FOUND THEN
        v_as_of := '-infinity'::timestamptz; v_cr := 0; v_db := 0; v_rows := 0;
      END IF;

      IF v_target > v_as_of THEN
        SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'credit'), 0),
               COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'debit'), 0),
               COUNT(*)
          INTO d_cr, d_db, d_rows
          FROM union_wallet_transactions t
         WHERE t.union_id = p_union_id AND t.wallet = 'rake_wallet'
           AND t.created_at >= v_as_of AND t.created_at < v_target;

        INSERT INTO union_rake_ledger_checkpoint
              (union_id, as_of, credits, debits, rows_seen, last_verified_at, updated_at)
        VALUES (p_union_id, v_target, v_cr + d_cr, v_db + d_db, v_rows + d_rows, now(), now())
        ON CONFLICT (union_id) DO UPDATE
          SET as_of     = EXCLUDED.as_of,
              credits   = EXCLUDED.credits,
              debits    = EXCLUDED.debits,
              rows_seen = EXCLUDED.rows_seen,
              updated_at = now();

        -- Only adopt the advanced values after the write succeeded.
        v_as_of := v_target;
        v_cr    := v_cr + d_cr;
        v_db    := v_db + d_db;
        v_rows  := v_rows + d_rows;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- best effort; fall through with the un-advanced checkpoint
    END;
  END IF;

  RETURN QUERY
  SELECT v_cr   + COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'credit'), 0),
         v_db   + COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'debit'), 0),
         v_rows + COUNT(t.*),
         v_as_of
    FROM union_wallet_transactions t
   WHERE t.union_id = p_union_id AND t.wallet = 'rake_wallet'
     AND t.created_at >= v_as_of;
END;
$function$;

-- Full recompute. Compares truth against what the incremental path believed,
-- overwrites the checkpoint with truth, alerts on any disagreement.
CREATE OR REPLACE FUNCTION public.fn_union_rake_ledger_checkpoint_verify(p_union_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_target   timestamptz := now() - interval '1 hour';
  v_cr       numeric; v_db numeric; v_rows bigint;
  v_old_cr   numeric; v_old_db numeric; v_old_as_of timestamptz;
  v_tail_cr  numeric; v_tail_db numeric;
  v_believed numeric; v_truth numeric; v_drift numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('union_rake_ledger_cp:' || p_union_id::text, 42));

  SELECT c.credits, c.debits, c.as_of
    INTO v_old_cr, v_old_db, v_old_as_of
    FROM union_rake_ledger_checkpoint c WHERE c.union_id = p_union_id;

  SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'credit'), 0),
         COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'debit'), 0),
         COUNT(*)
    INTO v_cr, v_db, v_rows
    FROM union_wallet_transactions t
   WHERE t.union_id = p_union_id AND t.wallet = 'rake_wallet'
     AND t.created_at < v_target;
  v_truth := v_cr - v_db;

  IF v_old_as_of IS NOT NULL THEN
    SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'credit'), 0),
           COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'debit'), 0)
      INTO v_tail_cr, v_tail_db
      FROM union_wallet_transactions t
     WHERE t.union_id = p_union_id AND t.wallet = 'rake_wallet'
       AND t.created_at >= v_old_as_of AND t.created_at < v_target;
    v_believed := (v_old_cr + v_tail_cr) - (v_old_db + v_tail_db);
    v_drift    := round(v_believed - v_truth, 2);
  END IF;

  INSERT INTO union_rake_ledger_checkpoint
        (union_id, as_of, credits, debits, rows_seen, last_verified_at, updated_at)
  VALUES (p_union_id, v_target, v_cr, v_db, v_rows, now(), now())
  ON CONFLICT (union_id) DO UPDATE
    SET as_of            = EXCLUDED.as_of,
        credits          = EXCLUDED.credits,
        debits           = EXCLUDED.debits,
        rows_seen        = EXCLUDED.rows_seen,
        last_verified_at = now(),
        updated_at       = now();

  IF COALESCE(v_drift, 0) <> 0 THEN
    INSERT INTO financial_alerts (severity, source, message, context)
    SELECT 'critical', 'fn_union_rake_ledger_checkpoint_verify',
           'Union rake ledger checkpoint drifted from recomputed truth',
           jsonb_build_object('union_id', p_union_id, 'drift', v_drift,
                              'believed', v_believed, 'truth', v_truth)
     WHERE NOT EXISTS (
       SELECT 1 FROM financial_alerts
        WHERE source = 'fn_union_rake_ledger_checkpoint_verify'
          AND resolved IS NOT TRUE
          AND context->>'union_id' = p_union_id::text);
  END IF;

  RETURN jsonb_build_object(
    'union_id', p_union_id, 'as_of', v_target,
    'credits', v_cr, 'debits', v_db, 'rows_seen', v_rows,
    'net', v_truth, 'drift', COALESCE(v_drift, 0));
END;
$function$;

-- Definer-owned internals. These read the union money ledger; no client role
-- may call them (see fn_anon_exposure_check, 20260821f).
REVOKE EXECUTE ON FUNCTION public.fn_union_rake_ledger_totals(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_union_rake_ledger_checkpoint_verify(uuid)
  FROM PUBLIC, anon, authenticated;
