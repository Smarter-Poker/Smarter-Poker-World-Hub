BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- PostgREST already exposes these SECURITY DEFINER boundaries only to the
-- service_role database role. Modern sb_secret credentials do not populate
-- the retired request.jwt.claim.role setting, so the duplicate body assertion
-- rejects the very role that owns EXECUTE. Remove only that obsolete assertion
-- while preserving the service-only ACL and every reconciliation invariant.
DO $repair_service_boundary$
DECLARE
  v_oid regprocedure;
  v_definition text;
  v_repaired text;
  v_gate text := $gate$IF\s+current_setting\('request\.jwt\.claim\.role', true\) IS DISTINCT FROM 'service_role' THEN\s+RAISE EXCEPTION 'service role required';\s+END IF;$gate$;
BEGIN
  FOREACH v_oid IN ARRAY ARRAY[
    'public.reconcile_social_reel_duplicates_phase2_unsafe(text,uuid,uuid[],text,uuid)'::regprocedure,
    'public.reconcile_social_reel_duplicates(text,uuid,uuid[],text,uuid)'::regprocedure,
    'public.remove_owned_social_reel(uuid,uuid)'::regprocedure
  ]
  LOOP
    SELECT pg_get_functiondef(v_oid) INTO v_definition;
    IF regexp_count(v_definition, v_gate) <> 1 THEN
      RAISE EXCEPTION 'Reels service authority compatibility refused: expected legacy gate missing from %', v_oid;
    END IF;
    v_repaired := regexp_replace(v_definition, v_gate, '');
    EXECUTE v_repaired;
  END LOOP;
END
$repair_service_boundary$;

REVOKE ALL ON FUNCTION public.reconcile_social_reel_duplicates_phase2_unsafe(text, uuid, uuid[], text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_owned_social_reel(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_social_reel_duplicates_phase2_unsafe(text, uuid, uuid[], text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_owned_social_reel(uuid, uuid)
  TO service_role;

DO $postapply$
BEGIN
  IF has_function_privilege('anon', 'public.reconcile_social_reel_duplicates(text,uuid,uuid[],text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reconcile_social_reel_duplicates(text,uuid,uuid[],text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.remove_owned_social_reel(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.remove_owned_social_reel(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.reconcile_social_reel_duplicates(text,uuid,uuid[],text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.remove_owned_social_reel(uuid,uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Reels service authority compatibility post-apply ACL failed';
  END IF;
END
$postapply$;

COMMIT;

-- Guarded rollback is a forward reapplication of the exact three-line legacy
-- body assertion only after proving the installed function definitions still
-- match this migration's post-state. Do not revoke the service-only ACL.
