-- Regression probe for fn_record_operational_alert's ON CONFLICT branch.
-- Rolls back everything it does; no row survives this script. Run against
-- any database carrying the operational_alert_events schema (staging or
-- production), after the companion migration is applied.
--
-- Root cause pinned: before the fix, a redelivery of an alert identity that
-- was first recorded WITHOUT payload.target_task_id could never pick one up
-- later, even from a sender that now correctly stamps it -- the ON CONFLICT
-- branch touched only last_received_at/delivery_count. Fails on pre-fix code,
-- passes after.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '3s';

CREATE FUNCTION pg_temp.assert_probe(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'operational-alert-conflict-backfill probe failed: %', label;
  END IF;
END $$;

-- 1. First delivery carries no destination (the historical/legacy shape --
--    any caller from before the 2026-09-20 operationalAlerts.mjs fix, or any
--    caller that still omits it today).
SELECT fn_record_operational_alert(
  'qual-conflict-backfill-probe', 'probe-identity-1', 'ProbeAlert', 'firing', 'warning',
  jsonb_build_object('summary', 'first delivery, no destination stamped')
);
SELECT pg_temp.assert_probe(
  (SELECT NOT (payload ? 'target_task_id') AND delivery_count = 1
     FROM operational_alert_events
    WHERE source = 'qual-conflict-backfill-probe' AND event_key = 'probe-identity-1'),
  'first delivery lands exactly as sent, no destination');

-- 2. Redelivery of the SAME identity from a corrected sender that now stamps
--    target_task_id. Must backfill the destination without losing the first
--    delivery's original evidence, and must still bump delivery_count.
SELECT fn_record_operational_alert(
  'qual-conflict-backfill-probe', 'probe-identity-1', 'ProbeAlert', 'firing', 'warning',
  jsonb_build_object('summary', 'redelivery, destination now stamped',
    'target_task_id', '01a09b86-5ba8-7290-8657-1041f13dd3ca')
);
SELECT pg_temp.assert_probe(
  (SELECT payload->>'target_task_id' = '01a09b86-5ba8-7290-8657-1041f13dd3ca'
     AND payload->>'summary' = 'first delivery, no destination stamped'
     AND delivery_count = 2
     FROM operational_alert_events
    WHERE source = 'qual-conflict-backfill-probe' AND event_key = 'probe-identity-1'),
  'conflict backfills the missing destination, keeps the original evidence, bumps delivery_count');

-- 3. A THIRD delivery must never overwrite an existing target_task_id, even
--    with a different one attached (custody: never let a later delivery
--    silently re-route an already-routed alert).
SELECT fn_record_operational_alert(
  'qual-conflict-backfill-probe', 'probe-identity-1', 'ProbeAlert', 'firing', 'warning',
  jsonb_build_object('summary', 'third delivery, different destination',
    'target_task_id', '00000000-0000-4000-8000-000000000000')
);
SELECT pg_temp.assert_probe(
  (SELECT payload->>'target_task_id' = '01a09b86-5ba8-7290-8657-1041f13dd3ca' AND delivery_count = 3
     FROM operational_alert_events
    WHERE source = 'qual-conflict-backfill-probe' AND event_key = 'probe-identity-1'),
  'an already-routed alert is never re-routed by a later delivery');

-- 4. A brand-new identity that ships with a destination from the start is
--    unaffected (baseline, not just the conflict path).
SELECT fn_record_operational_alert(
  'qual-conflict-backfill-probe', 'probe-identity-2', 'ProbeAlert', 'firing', 'warning',
  jsonb_build_object('target_task_id', '01a09b86-5ba8-7290-8657-1041f13dd3ca')
);
SELECT pg_temp.assert_probe(
  (SELECT payload->>'target_task_id' = '01a09b86-5ba8-7290-8657-1041f13dd3ca'
     FROM operational_alert_events
    WHERE source = 'qual-conflict-backfill-probe' AND event_key = 'probe-identity-2'),
  'a fresh delivery that already carries a destination is recorded as sent');

SELECT 'operational-alert-conflict-backfill probe: all assertions passed';
ROLLBACK;
