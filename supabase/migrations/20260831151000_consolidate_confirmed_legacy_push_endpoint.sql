-- Consolidate a legacy endpoint only when delivery telemetry proves it is the
-- current endpoint for the same browser identity. A pre-device-id endpoint and
-- a device-id endpoint can belong to one iOS PWA after a service-worker scope
-- migration; sending to both produces two banners from one outbox row.
--
-- This repair is deliberately narrow:
--   * exactly two active rows share user, full user agent and device label;
--   * exactly one row has a device_id and exactly one is legacy/null;
--   * the legacy row is newer and has a newer confirmed display receipt;
--   * both endpoints were accepted in the same five-minute delivery window.
--
-- The confirmed endpoint inherits the stable device id and the superseded row
-- is retained as inactive history. The partial unique index then prevents the
-- pair from becoming active together again through a modern client.

DO $repair$
DECLARE
  v_group record;
  v_repaired integer := 0;
BEGIN
  FOR v_group IN
    SELECT
      user_id,
      user_agent,
      device_label,
      (array_agg(id) FILTER (WHERE device_id IS NULL))[1] AS confirmed_legacy_id,
      (array_agg(id) FILTER (WHERE device_id IS NOT NULL))[1] AS superseded_id,
      min(device_id) FILTER (WHERE device_id IS NOT NULL) AS stable_device_id,
      min(created_at) FILTER (WHERE device_id IS NULL) AS legacy_created_at,
      min(created_at) FILTER (WHERE device_id IS NOT NULL) AS identified_created_at,
      min(last_receipt_at) FILTER (WHERE device_id IS NULL) AS legacy_receipt_at,
      min(last_receipt_at) FILTER (WHERE device_id IS NOT NULL) AS identified_receipt_at,
      min(last_used_at) FILTER (WHERE device_id IS NULL) AS legacy_used_at,
      min(last_used_at) FILTER (WHERE device_id IS NOT NULL) AS identified_used_at
    FROM public.push_subscriptions
    WHERE is_active
      AND user_agent IS NOT NULL
      AND device_label IS NOT NULL
    GROUP BY user_id, user_agent, device_label
    HAVING count(*) = 2
       AND count(*) FILTER (WHERE device_id IS NULL) = 1
       AND count(*) FILTER (WHERE device_id IS NOT NULL) = 1
  LOOP
    CONTINUE WHEN v_group.legacy_created_at <= v_group.identified_created_at;
    CONTINUE WHEN v_group.legacy_receipt_at IS NULL;
    CONTINUE WHEN v_group.identified_receipt_at IS NOT NULL
      AND v_group.identified_receipt_at >= v_group.legacy_receipt_at;
    CONTINUE WHEN v_group.legacy_used_at IS NULL OR v_group.identified_used_at IS NULL;
    CONTINUE WHEN abs(extract(epoch FROM (v_group.legacy_used_at - v_group.identified_used_at))) > 300;

    UPDATE public.push_subscriptions
       SET is_active = false,
           last_failure_reason = 'superseded_by_confirmed_legacy_endpoint',
           updated_at = now()
     WHERE id = v_group.superseded_id
       AND is_active;

    UPDATE public.push_subscriptions
       SET device_id = v_group.stable_device_id,
           updated_at = now()
     WHERE id = v_group.confirmed_legacy_id
       AND is_active
       AND device_id IS NULL;

    IF FOUND THEN v_repaired := v_repaired + 1; END IF;
  END LOOP;

  RAISE NOTICE 'consolidated % confirmed legacy push endpoint pair(s)', v_repaired;
END;
$repair$;

DO $assertions$
DECLARE v_duplicate_groups integer;
BEGIN
  SELECT count(*) INTO v_duplicate_groups
  FROM (
    SELECT user_id, device_id
    FROM public.push_subscriptions
    WHERE is_active AND device_id IS NOT NULL
    GROUP BY user_id, device_id
    HAVING count(*) > 1
  ) duplicate_groups;

  IF v_duplicate_groups > 0 THEN
    RAISE EXCEPTION 'active push device identity duplication remains: % group(s)', v_duplicate_groups;
  END IF;
END;
$assertions$;
