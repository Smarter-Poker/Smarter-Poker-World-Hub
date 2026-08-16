-- APPLIED TO PRODUCTION 2026-08-16 15:37:11 UTC (version 20260816153711)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- One call that answers "is the anon-grant guard still standing?"
--
-- Covers the three ways this hardening can silently die:
--   1. the event trigger is dropped        -> EVENT_TRIGGER_MISSING
--   2. the event trigger is disabled       -> EVENT_TRIGGER_DISABLED
--   3. its watched tag list is narrowed    -> EVENT_TRIGGER_TAGS_NARROWED
-- plus the two data-level regressions:
--   4. a locked function got anon/PUBLIC EXECUTE back -> LOCK_VIOLATION
--   5. a locked function no longer resolves           -> LOCK_STALE
-- and the standing counts from the tiered audit.
--
-- status='OK' on every row means the guard is intact.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_grant_guard_health()
RETURNS TABLE(check_name text, status text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled  char;
  v_tags     text[];
  v_missing  text[];
  n_viol     int;
  n_stale    int;
  n_crit     int;
  n_med      int;
  n_low      int;
  n_locked   int;
BEGIN
  SELECT evtenabled, evttags INTO v_enabled, v_tags
    FROM pg_event_trigger WHERE evtname = 'trg_autorevoke_privileged_anon';

  IF v_enabled IS NULL THEN
    check_name := 'event_trigger'; status := 'EVENT_TRIGGER_MISSING';
    detail := 'trg_autorevoke_privileged_anon does not exist. New money RPCs will inherit PUBLIC EXECUTE.';
    RETURN NEXT;
  ELSE
    IF v_enabled = 'D' THEN
      check_name := 'event_trigger'; status := 'EVENT_TRIGGER_DISABLED';
      detail := 'trg_autorevoke_privileged_anon exists but is DISABLED.';
      RETURN NEXT;
    ELSE
      check_name := 'event_trigger'; status := 'OK';
      detail := 'enabled (' || v_enabled || '), tags: ' || array_to_string(v_tags, ',');
      RETURN NEXT;
    END IF;

    v_missing := ARRAY(
      SELECT t FROM unnest(ARRAY['CREATE FUNCTION','ALTER FUNCTION','GRANT']) t
       WHERE t <> ALL (COALESCE(v_tags, ARRAY[]::text[]))
    );
    IF array_length(v_missing, 1) > 0 THEN
      check_name := 'event_trigger_tags'; status := 'EVENT_TRIGGER_TAGS_NARROWED';
      detail := 'missing watched tags: ' || array_to_string(v_missing, ',');
      RETURN NEXT;
    ELSE
      check_name := 'event_trigger_tags'; status := 'OK';
      detail := 'watches CREATE FUNCTION, ALTER FUNCTION, GRANT';
      RETURN NEXT;
    END IF;
  END IF;

  SELECT count(*) INTO n_locked FROM public.privileged_function_lock;
  SELECT count(*) FILTER (WHERE NOT missing), count(*) FILTER (WHERE missing)
    INTO n_viol, n_stale
    FROM public.fn_verify_privileged_lock();

  check_name := 'lock_violations';
  status := CASE WHEN n_viol = 0 THEN 'OK' ELSE 'LOCK_VIOLATION' END;
  detail := n_viol || ' of ' || n_locked || ' locked functions have anon/PUBLIC EXECUTE back';
  RETURN NEXT;

  check_name := 'lock_stale_entries';
  status := CASE WHEN n_stale = 0 THEN 'OK' ELSE 'LOCK_STALE' END;
  detail := n_stale || ' locked signatures no longer resolve (dropped or renamed)';
  RETURN NEXT;

  SELECT count(*) FILTER (WHERE severity='CRITICAL'),
         count(*) FILTER (WHERE severity='MEDIUM'),
         count(*) FILTER (WHERE severity='LOW')
    INTO n_crit, n_med, n_low
    FROM public.fn_audit_privileged_grants();

  check_name := 'audit_critical';
  status := CASE WHEN n_crit = 0 THEN 'OK' ELSE 'CRITICAL_ANON_SECDEF' END;
  detail := n_crit || ' SECURITY DEFINER money functions are anon-executable';
  RETURN NEXT;

  check_name := 'audit_backlog';
  status := 'OK';
  detail := n_med || ' MEDIUM + ' || n_low || ' LOW anon-executable money functions remain, draining in reviewed batches';
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_grant_guard_health() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.fn_grant_guard_health() IS
  'Single health call for the privileged-grant guard. Every row status=OK means the guard is intact.';
