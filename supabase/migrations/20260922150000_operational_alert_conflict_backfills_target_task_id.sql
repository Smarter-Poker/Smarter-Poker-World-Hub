-- Root cause of persistent "missing payload.target_task_id" routing gaps
-- (measured 2026-09-22: 43,348 of 85,096 operational_alert_events rows, 51%,
-- carry no destination, including rows received AFTER the 2026-09-20 client
-- fix in src/lib/operationalAlerts.mjs withDestination()).
--
-- fn_record_operational_alert's ON CONFLICT branch has only ever refreshed
-- last_received_at and delivery_count. It never touched payload. So once a
-- (source,event_key) identity was first recorded without a destination
-- (any caller before 2026-09-20, or any caller that still omits it today),
-- every later redelivery of that same alert identity -- including one from
-- a now-corrected sender that DOES stamp target_task_id -- collides on the
-- same row and the stamp is silently discarded forever. The 2026-09-20 fix
-- corrected every sender's outgoing payload; it could not repair a row that
-- already existed. Confirmed by measurement: source=alertmanager received
-- 668 events after the fix landed, and 56 of them (8.4%) still show no
-- target_task_id -- every one a redelivery of an alert identity first seen
-- before the fix. source=worldhub.deploy-monitor shows the same mechanism
-- at 0 of 166 before the fix and 5 of 5 (100%) after, once nothing pre-existed
-- to collide with.
--
-- public.operational_alert_events has never carried any destination other
-- than Codex task 01a09b86-5ba8-7290-8657-1041f13dd3ca (see the table
-- COMMENT installed in 20260913164000_operational_alert_inbox.sql; verified
-- by direct query -- across all rows, payload->>'target_task_id' is either
-- that exact id or absent, never a third value), so every existing row
-- missing it belongs to that same task and the one-time backfill below is a
-- straight data-quality repair, not a guess.

-- One-time repair of the damage already done. Never touches a row that
-- already carries a target_task_id, whatever value it holds.
UPDATE public.operational_alert_events
SET payload = payload || jsonb_build_object('target_task_id', '01a09b86-5ba8-7290-8657-1041f13dd3ca')
WHERE NOT (payload ? 'target_task_id');

-- The fix: a conflicting redelivery now backfills a missing destination from
-- whatever the incoming payload carries, without disturbing any other stored
-- evidence and without ever overwriting a target_task_id the row already has.
CREATE OR REPLACE FUNCTION public.fn_record_operational_alert(
  p_source text, p_event_key text, p_alertname text, p_status text,
  p_severity text, p_payload jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.operational_alert_events(source,event_key,alertname,status,severity,payload)
  VALUES(p_source,p_event_key,p_alertname,p_status,p_severity,p_payload)
  ON CONFLICT (source,event_key) DO UPDATE
  SET last_received_at=clock_timestamp(),
      delivery_count=operational_alert_events.delivery_count+1,
      payload = CASE
        WHEN NOT (operational_alert_events.payload ? 'target_task_id')
         AND (EXCLUDED.payload ? 'target_task_id')
        THEN operational_alert_events.payload || jsonb_build_object('target_task_id', EXCLUDED.payload->'target_task_id')
        ELSE operational_alert_events.payload
      END
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
