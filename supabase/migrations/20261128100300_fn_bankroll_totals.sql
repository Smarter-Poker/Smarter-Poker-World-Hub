-- ═══════════════════════════════════════════════════════════════════════
-- 20261128100300_fn_bankroll_totals.sql
-- PROVISIONAL VERSION: not applied yet. The coordinator applies it and this
-- file is renamed to the version recorded in supabase_migrations.schema_migrations.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive: one new read-only function)
-- AUTHOR:      Claude (Bankroll Manager programme, Wave 4 db lane, 2026-11-28)
-- AFFECTS:     rpcs: public.fn_bankroll_totals(date, date, uuid)
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS:
--   src/lib/bankroll/calculations.ts getBankrollStats calls
--   supabase.rpc('fn_bankroll_totals', { p_from, p_to, p_location_id }) and
--   maps the answer with statsFromTotals (src/lib/bankroll/bankrollTotals.mjs).
--   Until this is installed PostgREST answers PGRST202 and the client keeps
--   its paged client-side read (fetchAllRows + periodStats), so the client
--   ships first. scripts/bankroll-totals-parity.mjs proves the two agree.
--
-- WHY:
--   The dashboard reads every ledger row of the period (paged past 1,000) to
--   add them up in the browser. One aggregate in the database returns the
--   same figures in one round trip, whatever the ledger's size.
--
-- WHAT IT RETURNS (jsonb, every money value in INTEGER CENTS):
--   { "version": 1,
--     "balance": { starting_deposit_cents, deposit_cents, withdrawal_cents,
--                  lifetime_results_cents, balance_cents },
--     "period":  { results_cents, poker_cents, non_poker_cents, expense_cents,
--                  session_count, win_count, session_ms, poker_timed_cents,
--                  poker_timed_ms, by_category {category: cents},
--                  by_location [{location_id, cents}], by_month {YYYY-MM: cents},
--                  peak_cumulative_cents, lowest_cumulative_cents } }
--
-- RULES MIRRORED FROM THE CLIENT (ledgerMath.mjs, bankrollStats.mjs,
-- calculations.ts, analyticsView.mjs buildTrend). Change one, change both,
-- and rerun __tests__/bankroll-totals-rpc.test.mjs and the parity script:
--   R1  Caller only: user_id = auth.uid(); signed out raises 28000. SECURITY
--       INVOKER, so bankroll_ledger / bankroll_segments RLS also applies.
--   R2  Rows with is_revision = false only. A NULL is_revision is excluded,
--       exactly as the client's .eq('is_revision', false) excludes it.
--   R3  Cents per value = Math.round(dollars * 100): floor(x * 100 + 0.5).
--       Each column is rounded per row before summing (toCents).
--   R4  Session categories: poker_cash, poker_mtt, casino_table, slots,
--       sports. Result categories: sessions + expense. Movements: deposit,
--       withdrawal. Any other category counts nowhere.
--   R5  Row cents (entryCents): expense = gross_out - |gross_in|; every other
--       category = gross_out - gross_in. (The generated net_result column is
--       NOT used, as getBankrollStats does not use it.)
--   R6  Balance (bankrollBalanceCents), all time, no period or venue filter:
--       sum of initial_deposit over segments whose segment_type is not
--       'life', plus row cents of every result and movement row.
--       deposit_cents = sum of deposit row cents; withdrawal_cents = minus the
--       sum of withdrawal row cents (positive for money taken out);
--       balance_cents = starting + lifetime_results + deposit - withdrawal.
--   R7  Period rows: result rows (deposit/withdrawal excluded) with
--       entry_date >= p_from when given, entry_date <= p_to when given, and
--       location_id = p_location_id when given. entry_date is compared as
--       stored (a date), never shifted by time zone.
--   R8  results_cents = sum of period row cents (sessions + expenses).
--       expense_cents = minus the sum of expense row cents (positive).
--       poker_cents over poker_cash + poker_mtt; non_poker_cents over
--       casino_table + slots + sports.
--   R9  session_count = period session rows; win_count = those with row
--       cents > 0.
--   R10 Session length (sessionHours): 0 when start or end is missing or they
--       are equal; an end before the start ran past midnight, so whole days
--       are added until it is after the start. Measured in milliseconds,
--       timestamps truncated to the millisecond as JavaScript's Date does.
--       session_ms sums every session; poker_timed_ms / poker_timed_cents
--       sum poker sessions with a length > 0 (the hourly rate's basis:
--       round(poker_timed_cents / hours) / 100 dollars).
--   R11 by_category / by_location / by_month: period row cents grouped by
--       category, by location_id (null = no venue), and by
--       to_char(entry_date, 'YYYY-MM').
--   R12 peak / lowest cumulative (buildTrend high / low): period row cents
--       summed per entry_date, run in date order from 0; peak = max(0,
--       running), lowest = min(0, running).
--   Left in the client: leakRisk (leakRiskOf on poker/non-poker cents) and
--   travelROI (latest trip net), both derived, plus dollars formatting.
--   Known difference: a stored value with sub-cent digits can round one cent
--   apart, because JavaScript multiplies the float by 100 and this uses exact
--   numeric. The client writes two decimals, so the parity script reports it
--   rather than hiding it if it ever happens.
--
-- PERFORMANCE: bankroll_ledger reltuples was 22 on 2026-11-28. The function
--   scans the caller's own rows twice (balance and period). If ledgers grow,
--   add CREATE INDEX CONCURRENTLY ON bankroll_ledger (user_id, entry_date)
--   in its own migration (CONCURRENTLY cannot run in a transaction).
--
-- BREAK WINDOW: the database refuses DDL from :50 to :03 UTC every hour.
-- Run `date -u` first; a refused run applied nothing - apply ONCE after :03.
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $pre$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['user_id','category','location_id','entry_date','start_time','end_time','gross_in','gross_out','is_revision'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'bankroll_ledger' AND column_name = col) THEN
      RAISE EXCEPTION 'pre-flight failed: bankroll_ledger.% not found', col;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'bankroll_segments' AND column_name = 'initial_deposit') THEN
    RAISE EXCEPTION 'pre-flight failed: bankroll_segments.initial_deposit not found';
  END IF;
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bankroll_ledger' AND column_name = 'entry_date') <> 'date' THEN
    RAISE EXCEPTION 'pre-flight failed: bankroll_ledger.entry_date is not a date';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bankroll_ledger'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bankroll_segments'::regclass) THEN
    RAISE EXCEPTION 'pre-flight failed: RLS is off on bankroll_ledger or bankroll_segments';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'fn_bankroll_totals') THEN
    RAISE EXCEPTION 'pre-flight failed: fn_bankroll_totals already exists (installed already?)';
  END IF;
END
$pre$;

-- ─── 2. THE CHANGE ────────────────────────────────────────────────────
CREATE FUNCTION public.fn_bankroll_totals(
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

  -- R2, R3, R5: one row per non-revision ledger row with its cents.
  WITH rows AS (
    SELECT l.category,
           floor(l.gross_out * 100 + 0.5)::bigint AS out_c,
           floor(l.gross_in * 100 + 0.5)::bigint AS in_c
      FROM public.bankroll_ledger l
     WHERE l.user_id = v_uid
       AND l.is_revision = false
  ), cents AS (
    SELECT category,
           CASE WHEN category = 'expense' THEN out_c - abs(in_c) ELSE out_c - in_c END AS c
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
           CASE WHEN category = 'expense' THEN out_c - abs(in_c) ELSE out_c - in_c END AS c,
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
  'Bankroll Manager dashboard totals for auth.uid() in integer cents, mirroring ledgerMath.mjs/bankrollStats.mjs rule for rule (see migration header R1-R12). Security invoker. 2026-11-28.';

REVOKE ALL ON FUNCTION public.fn_bankroll_totals(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bankroll_totals(date, date, uuid) TO authenticated;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $post$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_bankroll_totals') <> 1 THEN
    RAISE EXCEPTION 'post-apply: expected exactly one fn_bankroll_totals overload';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_bankroll_totals(date, date, uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'post-apply: fn_bankroll_totals must be SECURITY INVOKER';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_bankroll_totals(date, date, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: authenticated cannot execute fn_bankroll_totals';
  END IF;
  IF has_function_privilege('anon', 'public.fn_bankroll_totals(date, date, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: anon can execute fn_bankroll_totals';
  END IF;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (safe at any time: the client falls back on PGRST202):
-- BEGIN;
-- SET LOCAL lock_timeout = '2s';
-- DROP FUNCTION IF EXISTS public.fn_bankroll_totals(date, date, uuid);
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
-- ═══════════════════════════════════════════════════════════════════════
