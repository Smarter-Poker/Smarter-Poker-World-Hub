-- =====================================================================
-- 20260912042515_restrict_diamond_credit_execute.sql
-- =====================================================================
-- TIER:         2 (ACL only; no balance, row, function-body or signature change)
-- AUTHOR:       G5, under G8-URGENT-DIAMOND-EXECUTE-0001
-- AFFECTS:      EXECUTE for authenticated on the exact overload below
-- IRREVERSIBLE: no (restoring client access requires a separate G8 decision)
--
-- WHY:
--   The current balance_rpcs_not_executable_by_clients invariant refuses
--   this authenticated grant. Root catalog capture 2026-09-12 04:13:43 UTC
--   and the existing full196-line Diamond receipt have the same definition
--   MD5 5d356b15727558df9c498dbb05a745d0. Existing profile/journal guards
--   remain; this permission mismatch is not proof of an unauthorized mint.
--
-- HOW:
--   - Verify exact definition, owner, settings and observed or final ACL.
--   - Revoke only authenticated EXECUTE; no CASCADE or other grant edits.
--   - Require owner/service access, no client access and unchanged body.
--   - Any drift or inherited client access aborts the transaction.
--
-- ROLLBACK:
--   Failed assertions roll back this transaction. After commit prefer a
--   forward correction preserving client refusal. Do not automatically
--   regrant authenticated; that would restore the demonstrated violation.
--   Reversing the unrelated GDPR route patch needs no such regrant.
-- See .agent/audits/2026-09-12-diamond-credit-execute.md.
-- =====================================================================

BEGIN;

DO $precondition$
DECLARE
  v_target oid := pg_catalog.to_regprocedure(
    'public.add_diamonds_to_balance(uuid,integer,text,text,text,uuid)');
  v_owner name;
  v_definer boolean;
  v_config text[];
  v_md5 text;
  v_acl text[];
BEGIN
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Exact Diamond credit overload is absent; permission proposal needs review';
  END IF;

  SELECT pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig,
         pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)),
         ARRAY(SELECT a::text FROM pg_catalog.unnest(p.proacl) AS a ORDER BY a::text)
    INTO v_owner, v_definer, v_config, v_md5, v_acl
    FROM pg_catalog.pg_proc p WHERE p.oid = v_target;

  IF v_owner IS DISTINCT FROM 'postgres'::name
     OR v_definer IS DISTINCT FROM true
     OR v_config IS DISTINCT FROM ARRAY['search_path=public, extensions']::text[]
     OR v_md5 IS DISTINCT FROM '5d356b15727558df9c498dbb05a745d0' THEN
    RAISE EXCEPTION 'Diamond credit definition/owner/settings changed; refuse stale permission proposal';
  END IF;

  -- Permit the observed ACL or the exact already-revoked result, never another
  -- grantor, added role, grant option, PUBLIC grant or unexpected missing grant.
  IF v_acl IS DISTINCT FROM ARRAY[
       'authenticated=X/postgres', 'postgres=X/postgres', 'service_role=X/postgres'
     ]::text[]
     AND v_acl IS DISTINCT FROM ARRAY[
       'postgres=X/postgres', 'service_role=X/postgres'
     ]::text[] THEN
    RAISE EXCEPTION 'Diamond credit ACL changed; preserve unexpected grants for explicit review';
  END IF;

  IF pg_catalog.has_function_privilege('anon', v_target, 'EXECUTE') IS DISTINCT FROM false
     OR pg_catalog.has_function_privilege('service_role', v_target, 'EXECUTE') IS DISTINCT FROM true
     OR pg_catalog.has_function_privilege('postgres', v_target, 'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Diamond credit effective privilege precondition changed';
  END IF;
END;
$precondition$;

REVOKE EXECUTE ON FUNCTION public.add_diamonds_to_balance(
  uuid, integer, text, text, text, uuid
) FROM authenticated RESTRICT;

DO $postcondition$
DECLARE
  v_target oid := pg_catalog.to_regprocedure(
    'public.add_diamonds_to_balance(uuid,integer,text,text,text,uuid)');
  v_owner name;
  v_definer boolean;
  v_config text[];
  v_md5 text;
  v_acl text[];
BEGIN
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Exact Diamond credit overload disappeared';
  END IF;

  SELECT pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig,
         pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)),
         ARRAY(SELECT a::text FROM pg_catalog.unnest(p.proacl) AS a ORDER BY a::text)
    INTO v_owner, v_definer, v_config, v_md5, v_acl
    FROM pg_catalog.pg_proc p WHERE p.oid = v_target;

  IF v_owner IS DISTINCT FROM 'postgres'::name
     OR v_definer IS DISTINCT FROM true
     OR v_config IS DISTINCT FROM ARRAY['search_path=public, extensions']::text[]
     OR v_md5 IS DISTINCT FROM '5d356b15727558df9c498dbb05a745d0'
     OR v_acl IS DISTINCT FROM ARRAY[
       'postgres=X/postgres', 'service_role=X/postgres'
     ]::text[] THEN
    RAISE EXCEPTION 'Diamond credit permission change did not preserve the reviewed object';
  END IF;

  -- Effective checks catch inherited/PUBLIC access that a direct REVOKE cannot
  -- necessarily remove. Abort instead of expanding this migration's scope.
  IF pg_catalog.has_function_privilege('authenticated', v_target, 'EXECUTE') IS DISTINCT FROM false
     OR pg_catalog.has_function_privilege('anon', v_target, 'EXECUTE') IS DISTINCT FROM false
     OR pg_catalog.has_function_privilege('service_role', v_target, 'EXECUTE') IS DISTINCT FROM true
     OR pg_catalog.has_function_privilege('postgres', v_target, 'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Diamond credit effective privilege postcondition failed';
  END IF;
END;
$postcondition$;

COMMIT;
