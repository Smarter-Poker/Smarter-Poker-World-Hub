-- The owner's operational-alert capture trigger preserved the original
-- personal-inbox row (unconditional `RETURN NEW`) instead of suppressing it
-- once captured into public.operational_alert_events. Every push/read-time
-- mask (the mirror trigger's WHEN guard, the RLS restrictive policy, the
-- personal_notifications view) worked correctly, but the underlying
-- public.notifications row for the owner was never actually removed.
--
-- Measured live before this fix: 880 financial_incident/system/
-- engine_break_failed/financial_attestation/estate_digest/guarantee_bank_short
-- rows sitting in the owner's public.notifications, and 727 matching
-- push_outbox rows -- 431 of which already show status='sent' (actually
-- delivered to the owner's phone before the mirror trigger's WHEN guard
-- existed at all).
--
-- Root cause: fn_capture_owner_notification_destination() unconditionally
-- ends with `RETURN NEW`. A BEFORE INSERT trigger that returns NULL instead
-- aborts the row for that INSERT statement -- this makes suppression
-- structural (no personal row is ever written) rather than dependent on
-- every downstream reader consistently re-applying
-- fn_is_owner_operational_notification. The destination row
-- (operational_notification_destinations) already carries the complete
-- original notification as evidence and has no FK to notifications (by
-- design -- see that table's own migration header), so aborting the insert
-- and backfill-deleting the now-redundant existing rows is safe.
--
-- Production Alerts fleet, incident owner-op-notif-routing-defect.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $guard$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc
    WHERE oid = 'public.fn_capture_owner_notification_destination()'::regprocedure))
      IS DISTINCT FROM '64b403e0568e933dba4918a09b9b0ace' THEN
    RAISE EXCEPTION 'fn_capture_owner_notification_destination changed since this fix was written; re-review required';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.fn_capture_owner_notification_destination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $body$
BEGIN
  IF public.fn_is_owner_operational_notification(NEW.user_id,NEW.type,NEW.title,NEW.data) THEN
    INSERT INTO public.operational_notification_destinations(notification_id,recipient_user_id,original_notification)
      VALUES(NEW.id,NEW.user_id,to_jsonb(NEW));
    PERFORM public.fn_try_record_owner_notification(NEW.id);
    -- Preserve the original row byte-for-byte in the destination table. The
    -- INSERT above is the row of record; aborting this INSERT (RETURN NULL)
    -- is what makes suppression structural rather than dependent on every
    -- downstream reader re-applying fn_is_owner_operational_notification.
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$body$;

DO $verify$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc
    WHERE oid = 'public.fn_capture_owner_notification_destination()'::regprocedure))
      IS DISTINCT FROM 'de15ed882ad5073fccf138bfaf35bc72' THEN
    RAISE EXCEPTION 'post-apply failed: fixed trigger function body does not match expected text';
  END IF;
END;
$verify$;

-- Backfill: every existing personal-inbox row for the owner that this
-- trigger already captured (inbox_event_id IS NOT NULL means the operational
-- store holds the confirmed receipt) is now redundant. Bounded to the
-- owner's rows with a confirmed destination receipt only -- never a blind
-- sweep, and never touching a row this trigger has not already captured.
WITH doomed AS (
  SELECT n.id
  FROM public.notifications n
  JOIN public.operational_notification_destinations d ON d.notification_id = n.id
  WHERE n.user_id = '47965354-0e56-43ef-931c-ddaab82af765'::uuid
    AND d.inbox_event_id IS NOT NULL
)
DELETE FROM public.notifications n USING doomed WHERE n.id = doomed.id;

COMMIT;
