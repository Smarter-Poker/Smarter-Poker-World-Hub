-- ═══════════════════════════════════════════════════════════════════════
-- 20261128103322_fn_bankroll_totals_expense_rule.sql
-- INSTALLED on production 2026-11-28 10:33:22 UTC as version 20261128103322 (supabase_migrations.schema_migrations).
-- Repo SQL equals the installed statements (comments and blank lines aside). Never edit.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (CREATE OR REPLACE of one read-only function, same signature)
-- AUTHOR:      Claude (Bankroll Manager programme, Wave 4 db lane, 2026-11-28)
-- AFFECTS:     rpcs: public.fn_bankroll_totals(date, date, uuid)
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS:
--   src/lib/bankroll/calculations.ts getBankrollStats (dashboard tiles) and
--   scripts/bankroll-totals-parity.mjs, which compares this function with
--   src/lib/bankroll/bankrollTotals.mjs totalsFromRows.
--
-- WHY:
--   20261128101707_fn_bankroll_totals mirrored ledgerMath.mjs as it stood that
--   morning, where an expense row's cents were gross_out - |gross_in|. #3289
--   (merged 2026-11-28 10:31 UTC) made one expense rule for every totaller,
--   ledgerMath expenseCostCents: an expense costs |gross_out - gross_in|,
--   whatever sign or column it was typed in (older rows put the amount in
--   gross_out, which the old rule counted as a GAIN). Every other path moved
--   to the new rule, so for those rows the dashboard tiles (this function)
--   and the trend chart, reports, tax and trips disagreed.
--   Rule R5 is now: expense = -|gross_out - gross_in|; every other category
--   = gross_out - gross_in. Every other rule (R1-R4, R6-R12) is unchanged; see
--   the 20261128101707 header.
--
-- HOW:
--   - CREATE OR REPLACE with the identical signature, return type, STABLE,
--     SECURITY INVOKER and search_path; only the two expense CASE arms
--     change. CREATE OR REPLACE keeps the function's ACL (authenticated
--     EXECUTE, no anon), asserted below.
--
-- DDL WINDOWS: the database refuses DDL from :50 to :03 UTC every hour and
-- during the nightly release freeze (23:45-04:15 America/Chicago,
-- smarter_private.fn_ca_release_freeze_ddl_guard). A refused run applied
-- nothing - apply ONCE when the window is open.
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $pre$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_bankroll_totals') <> 1
     OR to_regprocedure('public.fn_bankroll_totals(date, date, uuid)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: expected exactly fn_bankroll_totals(date, date, uuid)';
  END IF;
  IF position('out_c - abs(in_c)' IN pg_get_functiondef('public.fn_bankroll_totals(date, date, uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'pre-flight failed: fn_bankroll_totals no longer carries the old expense rule (applied already?)';
  END IF;
END
$pre$;

-- ─── 2. THE CHANGE ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_bankroll_totals(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_balance jsonb;
  v_period jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '28000';
  END IF;

  -- R2, R3, R5 (expense = -|gross_out - gross_in|, #3289): one row per
  -- non-revision ledger row with its cents.
  WITH rows AS (
    SELECT l.category,
           floor(l.gross_out * 100 + 0.5)::bigint AS out_c,
           floor(l.gross_in * 100 + 0.5)::bigint AS in_c
      FROM public.bankroll_ledger l
     WHERE l.user_id = v_uid
       AND l.is_revision = false
  ), cents AS (
    SELECT category,
           CASE WHEN category = 'expense' THEN -abs(out_c - in_c) ELSE out_c - in_c END AS c
      FROM rows
  ), seg AS (
    SELECT COALESCE(sum(floor(COALESCE(s.initial_deposit, 0) * 100 + 0.5)), 0)::bigint AS start_c
      FROM public.bankroll_segments s
     WHERE s.user_id = v_uid
       AND s.segment_type IS DISTINCT FROM 'life'
  ), agg AS (
    SELECT
      COALESCE(sum(c) FILTER (WHERE category IN ('poker_cash','poker_mtt','casino_table','slots','sports','expense')), 0)::bigint AS results_c,
      COALESCE(sum(c) FILTER (WHERE category = 'deposit'), 0)::bigint AS deposit_c,
      (-COALESCE(sum(c) FILTER (WHERE category = 'withdrawal'), 0))::bigint AS withdrawal_c
      FROM cents
  )
  SELECT jsonb_build_object(
           'starting_deposit_cents', seg.start_c,
           'deposit_cents', agg.deposit_c,
           'withdrawal_cents', agg.withdrawal_c,
           'lifetime_results_cents', agg.results_c,
           'balance_cents', seg.start_c + agg.results_c + agg.deposit_c - agg.withdrawal_c)
    INTO v_balance
    FROM seg, agg;

  -- R7 - R12: the period's result rows.
  WITH rows AS (
    SELECT l.category, l.location_id, l.entry_date,
           floor(l.gross_out * 100 + 0.5)::bigint AS out_c,
           floor(l.gross_in * 100 + 0.5)::bigint AS in_c,
           (extract(epoch FROM date_trunc('milliseconds', l.start_time)) * 1000)::bigint AS start_ms,
           (extract(epoch FROM date_trunc('milliseconds', l.end_time)) * 1000)::bigint AS end_ms
      FROM public.bankroll_ledger l
     WHERE l.user_id = v_uid
       AND l.is_revision = false
       AND l.category IN ('poker_cash','poker_mtt','casino_table','slots','sports','expense')
       AND (p_from IS NULL OR l.entry_date >= p_from)
       AND (p_to IS NULL OR l.entry_date <= p_to)
       AND (p_location_id IS NULL OR l.location_id = p_location_id)
  ), r AS (
    SELECT category, location_id, entry_date,
           CASE WHEN category = 'expense' THEN -abs(out_c - in_c) ELSE out_c - in_c END AS c,
           category IN ('poker_cash','poker_mtt','casino_table','slots','sports') AS is_session,
           CASE
             WHEN start_ms IS NULL OR end_ms IS NULL OR end_ms = start_ms THEN 0
             WHEN end_ms > start_ms THEN end_ms - start_ms
             ELSE end_ms + 86400000 * ceil((start_ms - end_ms) / 86400000.0)::bigint - start_ms
           END AS ms
      FROM rows
  ), days AS (
    SELECT entry_date, sum(c) AS c FROM r GROUP BY entry_date
  ), running AS (
    SELECT sum(c) OVER (ORDER BY entry_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum FROM days
  )
  SELECT jsonb_build_object(
    'results_cents', (SELECT COALESCE(sum(c), 0)::bigint FROM r),
    'poker_cents', (SELECT COALESCE(sum(c), 0)::bigint FROM r WHERE category IN ('poker_cash','poker_mtt')),
    'non_poker_cents', (SELECT COALESCE(sum(c), 0)::bigint FROM r WHERE category IN ('casino_table','slots','sports')),
    'expense_cents', (SELECT (-COALESCE(sum(c), 0))::bigint FROM r WHERE category = 'expense'),
    'session_count', (SELECT count(*) FROM r WHERE is_session),
    'win_count', (SELECT count(*) FROM r WHERE is_session AND c > 0),
    'session_ms', (SELECT COALESCE(sum(ms), 0)::bigint FROM r WHERE is_session),
    'poker_timed_cents', (SELECT COALESCE(sum(c), 0)::bigint FROM r WHERE category IN ('poker_cash','poker_mtt') AND ms > 0),
    'poker_timed_ms', (SELECT COALESCE(sum(ms), 0)::bigint FROM r WHERE category IN ('poker_cash','poker_mtt') AND ms > 0),
    'by_category', (SELECT COALESCE(jsonb_object_agg(category, cents), '{}'::jsonb)
                      FROM (SELECT category, sum(c)::bigint AS cents FROM r GROUP BY category) g),
    'by_location', (SELECT COALESCE(jsonb_agg(jsonb_build_object('location_id', location_id, 'cents', cents)
                                              ORDER BY location_id NULLS FIRST), '[]'::jsonb)
                      FROM (SELECT location_id, sum(c)::bigint AS cents FROM r GROUP BY location_id) g),
    'by_month', (SELECT COALESCE(jsonb_object_agg(month, cents), '{}'::jsonb)
                   FROM (SELECT to_char(entry_date, 'YYYY-MM') AS month, sum(c)::bigint AS cents
                           FROM r GROUP BY to_char(entry_date, 'YYYY-MM')) g),
    'peak_cumulative_cents', (SELECT GREATEST(0, COALESCE(max(cum), 0))::bigint FROM running),
    'lowest_cumulative_cents', (SELECT LEAST(0, COALESCE(min(cum), 0))::bigint FROM running)
  ) INTO v_period;

  RETURN jsonb_build_object('version', 1, 'balance', v_balance, 'period', v_period);
END
$fn$;

COMMENT ON FUNCTION public.fn_bankroll_totals(date, date, uuid) IS
  'Bankroll Manager dashboard totals for auth.uid() in integer cents, mirroring ledgerMath.mjs/bankrollStats.mjs rule for rule (R1-R12; R5 expense = -|gross_out - gross_in| since #3289). Security invoker. 2026-11-28.';

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $post$
DECLARE def text := pg_get_functiondef('public.fn_bankroll_totals(date, date, uuid)'::regprocedure);
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_bankroll_totals') <> 1 THEN
    RAISE EXCEPTION 'post-apply: expected exactly one fn_bankroll_totals overload';
  END IF;
  IF position('out_c - abs(in_c)' IN def) > 0
     OR (length(def) - length(replace(def, '-abs(out_c - in_c)', ''))) / length('-abs(out_c - in_c)') <> 2 THEN
    RAISE EXCEPTION 'post-apply: both expense arms must use -abs(out_c - in_c)';
  END IF;
  IF (SELECT prosecdef OR provolatile <> 's' FROM pg_proc WHERE oid = 'public.fn_bankroll_totals(date, date, uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'post-apply: fn_bankroll_totals must stay STABLE and SECURITY INVOKER';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_bankroll_totals(date, date, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_bankroll_totals(date, date, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: fn_bankroll_totals grants changed';
  END IF;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK: reapply the function body from 20261128101707_fn_bankroll_totals.sql
-- with CREATE OR REPLACE (the dashboard would again count a gross_out expense
-- as a gain, so only do this together with reverting #3289's ledgerMath rule).
-- ═══════════════════════════════════════════════════════════════════════
