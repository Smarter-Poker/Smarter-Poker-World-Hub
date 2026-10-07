-- Phase 9 follow-up: every folded Home Games RPC is called through userDb so
-- auth.uid() remains the caller identity. The canonical permission rewrite is
-- not reachable through PostgREST unless authenticated can execute the exact
-- function. Reassert the complete grant set only after proving every body has
-- the canonical gate installed.

BEGIN;

DO $preflight$
DECLARE
  v_signature text;
  v_oid oid;
  v_definition text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_home_content_report_detail(uuid,uuid)',
    'public.list_home_content_reports(uuid,text,text,integer,integer)',
    'public.resolve_home_content_report(uuid,text,text,uuid)',
    'public.fn_get_home_games_onboarding_status_admin(uuid,uuid)',
    'public.fn_anonymize_hg_user_content(uuid,uuid)',
    'public.list_home_ban_appeals_admin(uuid,text,uuid,integer,integer)',
    'public.review_home_ban_appeal(uuid,text,text,uuid)'
  ]
  LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Phase 9 grant target is missing: %', v_signature;
    END IF;
    SELECT pg_get_functiondef(v_oid) INTO STRICT v_definition;
    IF position('fn_ca_operator_has_permission' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Phase 9 refuses to grant an RPC without the canonical gate: %', v_signature;
    END IF;
    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(v_signature)) THEN
      RAISE EXCEPTION 'Phase 9 refuses to grant a non-SECURITY DEFINER RPC: %', v_signature;
    END IF;
  END LOOP;
END
$preflight$;

REVOKE ALL ON FUNCTION public.get_home_content_report_detail(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_home_content_reports(uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_home_content_report(uuid, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_get_home_games_onboarding_status_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_anonymize_hg_user_content(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_home_ban_appeals_admin(uuid, text, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_home_ban_appeal(uuid, text, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_home_content_report_detail(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_home_content_reports(uuid, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_home_content_report(uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_home_games_onboarding_status_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_anonymize_hg_user_content(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_home_ban_appeals_admin(uuid, text, uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_home_ban_appeal(uuid, text, text, uuid) TO authenticated, service_role;

DO $assert$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_home_content_report_detail(uuid,uuid)',
    'public.list_home_content_reports(uuid,text,text,integer,integer)',
    'public.resolve_home_content_report(uuid,text,text,uuid)',
    'public.fn_get_home_games_onboarding_status_admin(uuid,uuid)',
    'public.fn_anonymize_hg_user_content(uuid,uuid)',
    'public.list_home_ban_appeals_admin(uuid,text,uuid,integer,integer)',
    'public.review_home_ban_appeal(uuid,text,text,uuid)'
  ]
  LOOP
    IF NOT has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated cannot execute %', v_signature;
    END IF;
    IF has_function_privilege('anon', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon must not execute %', v_signature;
    END IF;
  END LOOP;
END
$assert$;

COMMIT;
