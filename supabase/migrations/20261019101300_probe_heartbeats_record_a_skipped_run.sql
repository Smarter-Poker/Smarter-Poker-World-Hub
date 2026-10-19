-- ═══════════════════════════════════════════════════════════════════════
-- 20261019101300_probe_heartbeats_record_a_skipped_run.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Claude (launch bug fixes, 2026-10-19)
-- AFFECTS:      public.probe_heartbeats CHECK constraint probe_heartbeats_status_check
-- IRREVERSIBLE: no
--
-- WHY:
--   pages/api/cron/table-socket-probe.js records a run that it deliberately
--   did not judge - the hourly maintenance break, or a declared owner floor
--   park - as status 'skipped' (pinned by
--   __tests__/a-declared-floor-park-is-not-a-table-outage.test.mjs). The
--   CHECK allowed only ok / failed / partial, so every one of those inserts
--   failed (23514) and the probe left no trace for that hour: the history
--   could not tell "skipped on purpose" from "never ran".
--
--   'skipped' is the honest value. Writing 'ok' would show a green probe
--   while no table was checked, and 'failed' would count a planned break as
--   an outage. Every reader filters explicitly on 'ok' or 'failed'
--   (auth_health_view, signup_health_view, fn_sp_daily_metrics_compute), so a
--   skipped row counts as neither; the admin health pages render it grey.
--
-- HOW:
--   - drop and re-add the CHECK with 'skipped' added (NOT VALID, then
--     VALIDATE, so the ~54k existing rows are checked without a long lock)
--   - assert the new definition
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '3s';

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.probe_heartbeats'::regclass
                    AND conname = 'probe_heartbeats_status_check') THEN
    RAISE EXCEPTION 'pre-flight failed: probe_heartbeats_status_check not found';
  END IF;
END $pre$;

ALTER TABLE public.probe_heartbeats DROP CONSTRAINT probe_heartbeats_status_check;
ALTER TABLE public.probe_heartbeats
  ADD CONSTRAINT probe_heartbeats_status_check
  CHECK (status = ANY (ARRAY['ok'::text, 'failed'::text, 'partial'::text, 'skipped'::text])) NOT VALID;
ALTER TABLE public.probe_heartbeats VALIDATE CONSTRAINT probe_heartbeats_status_check;

DO $post$
DECLARE d text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
   WHERE conrelid = 'public.probe_heartbeats'::regclass AND conname = 'probe_heartbeats_status_check' AND convalidated;
  IF d IS NULL OR position('skipped' in d) = 0 OR position('partial' in d) = 0
     OR position('failed' in d) = 0 OR position('''ok''' in d) = 0 THEN
    RAISE EXCEPTION 'post-apply failed: unexpected constraint %', d;
  END IF;
END $post$;

COMMIT;

-- ROLLBACK (forward migration; only after no 'skipped' rows remain):
-- ALTER TABLE public.probe_heartbeats DROP CONSTRAINT probe_heartbeats_status_check;
-- ALTER TABLE public.probe_heartbeats ADD CONSTRAINT probe_heartbeats_status_check
--   CHECK (status = ANY (ARRAY['ok'::text, 'failed'::text, 'partial'::text]));
