-- ═══════════════════════════════════════════════════════════════════════
-- 20261022171756_daily_reports_fit_their_budgets.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (production error sweep, 2026-10-22)
-- AFFECTS:     indexes on public.diamond_transactions; function
--              public.trivia_ledger_health_v1; pg_cron job
--              sp-daily-metrics-snapshot (jobid 495)
-- IRREVERSIBLE: no
--
-- WHY:
-- 1. /api/cron/trivia-economy-audit failed with "canceling statement due to
--    statement timeout" (service_role has an 8 s budget). trivia_ledger_health_v1
--    measured 17.4 s cold: two counts walked all ~330k diamond_transactions
--    and called trivia_ledger_platform_family on every row, though only 541
--    rows belong to a trivia family. run_trivia_economy_audit_v1 spent 1.7 s
--    scanning 30 days for the 252 rows with no reference.
-- 2. The 7 AM daily digest email failed three times on 2026-10-21 and went out
--    7.5 hours late. Its nightly snapshot (fn_sp_daily_metrics_snapshot, 3-9
--    minutes alongside the accounting jobs) hit its 600 s budget on all three
--    tries (00:15, 00:45, 01:15 Chicago), so the 7 AM run tried to build it
--    inline inside the 8 s API budget.
--
-- WHAT:
-- 1. Two partial indexes (built CONCURRENTLY before this file was recorded;
--    IF NOT EXISTS here): trivia-family rows by created_at, and rows with no
--    reference by created_at.
-- 2. trivia_ledger_health_v1: the unjournaled count states the family filter
--    in the scan itself so the partial index applies. Same result set.
-- 3. sp-daily-metrics-snapshot: 25 minute budget (runs never overlap the
--    next 30 minute tick) and retries every half hour until 06:45 Chicago,
--    skipping 04:15 (the daily engine reset), so the 7 AM email finds it.
--
-- ROLLBACK: DROP the two indexes; re-apply trivia_ledger_health_v1 from its
-- prior migration; cron.alter_job(495, schedule := '15,45 5,6 * * *') with
-- the previous command (600 s, ticks 00:15/00:45/01:15).

BEGIN;

CREATE INDEX IF NOT EXISTS diamond_transactions_trivia_family_created_idx
    ON public.diamond_transactions (created_at)
 WHERE amount <> 0
   AND public.trivia_ledger_platform_family(COALESCE(NULLIF(btrim(transaction_type), ''), type), reference_id) IS NOT NULL;

CREATE INDEX IF NOT EXISTS diamond_transactions_missing_reference_created_idx
    ON public.diamond_transactions (created_at)
 WHERE NULLIF(btrim(reference_id), '') IS NULL;

-- Edit exactly one clause of the installed function; fail if it is not there.
DO $m$
DECLARE
  v_def text := pg_get_functiondef('public.trivia_ledger_health_v1'::regproc);
  v_old text := E'WHERE d.created_at >= v_epoch AND d.amount <> 0\n';
  v_new text := E'WHERE d.created_at >= v_epoch AND d.amount <> 0\n'
             || E'             AND public.trivia_ledger_platform_family(COALESCE(NULLIF(btrim(d.transaction_type), \'\'), d.type), d.reference_id) IS NOT NULL\n';
BEGIN
  IF position(v_new IN v_def) > 0 THEN
    RETURN;  -- already applied
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'trivia_ledger_health_v1: expected exactly one unjournaled scan clause';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$m$;

SELECT cron.alter_job(
  job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'sp-daily-metrics-snapshot'),
  schedule := '15,45 5-12 * * *',
  command  := $cmd$SET statement_timeout = '1500s'; SELECT public.fn_sp_daily_metrics_snapshot()
     WHERE to_char(clock_timestamp() AT TIME ZONE 'America/Chicago','HH24:MI') = '00:15'
        OR (to_char(clock_timestamp() AT TIME ZONE 'America/Chicago','HH24:MI') IN
              ('00:45','01:15','01:45','02:15','02:45','03:15','03:45','04:45','05:15','05:45','06:15','06:45')
            AND NOT EXISTS (SELECT 1 FROM public.sp_daily_metrics WHERE day = (clock_timestamp() AT TIME ZONE 'America/Chicago')::date - 1));$cmd$
);

DO $assert$
BEGIN
  IF position('trivia_ledger_platform_family(COALESCE(NULLIF(btrim(d.transaction_type)' IN pg_get_functiondef('public.trivia_ledger_health_v1'::regproc)) = 0 THEN
    RAISE EXCEPTION 'trivia_ledger_health_v1 was not updated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sp-daily-metrics-snapshot' AND schedule = '15,45 5-12 * * *' AND command LIKE '%1500s%') THEN
    RAISE EXCEPTION 'sp-daily-metrics-snapshot was not updated';
  END IF;
END
$assert$;

COMMIT;
