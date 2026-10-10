-- TIER: 2. AUTHOR: Codex. AFFECTS: one deferred integrity trigger function.
-- WHY: actual Phase 3 pending-public join fails 23514 because the invoker
-- sees a public group but caller RLS withholds its valid owner-member row.
-- Installed preimage verified 2026-10-10T18:57:01Z, not inferred from history.
-- HOW: preserve all consistency logic, owner, ACL and deferred binding; only
-- authoritative integrity reads use SECDEF and explicitly qualified tables.
-- No data rewrite, table policy, role grant, enum or RPC modification.
-- IRREVERSIBLE: no. Safe recovery is a guarded forward correction; restoring
-- invoker semantics reintroduces false ownership failures. Never replay.
-- Owning runner wraps this file and migration ledger in one transaction.
DO $migration$
DECLARE
  v_oid oid := 'public.verify_home_group_owner_consistency()'::regprocedure;
  v_definition text;
  v_owner oid;
  v_acl aclitem[];
  v_binding text;
  v_expected text;
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='verify_home_group_owner_consistency') <> 1 THEN
    RAISE EXCEPTION 'Home Games owner consistency overload drifted';
  END IF;
  SELECT pg_get_functiondef(oid), proowner, proacl INTO v_definition,v_owner,v_acl FROM pg_proc WHERE oid=v_oid;
  IF md5(v_definition) <> '36996fe4ad8517a9cc096c17ef3e66f4'
     OR v_owner <> 'postgres'::regrole
     OR (SELECT array_agg(r.rolname || ':' || grantor.rolname || ':' || a.privilege_type || ':' || a.is_grantable::text ORDER BY r.rolname)
           FROM aclexplode(v_acl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
             LEFT JOIN pg_roles grantor ON grantor.oid=a.grantor)
        IS DISTINCT FROM ARRAY['postgres:postgres:EXECUTE:false','service_role:postgres:EXECUTE:false']
     OR NOT (SELECT NOT prosecdef AND proconfig=ARRAY['search_path=public, pg_temp']
               AND pg_get_function_arguments(oid)='' AND pg_get_function_result(oid)='trigger'
             FROM pg_proc WHERE oid=v_oid) THEN
    RAISE EXCEPTION 'Home Games owner consistency catalog contract drifted';
  END IF;
  SELECT pg_get_triggerdef(oid) INTO v_binding FROM pg_trigger
   WHERE tgfoid=v_oid AND NOT tgisinternal AND tgrelid='public.commander_home_members'::regclass
     AND tgname='trg_verify_home_group_owner_consistency'
     AND tgdeferrable AND tginitdeferred AND tgenabled='O';
  IF v_binding IS DISTINCT FROM 'CREATE CONSTRAINT TRIGGER trg_verify_home_group_owner_consistency AFTER INSERT OR DELETE OR UPDATE ON public.commander_home_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_home_group_owner_consistency()'
     OR (SELECT count(*) FROM pg_trigger WHERE tgfoid=v_oid AND NOT tgisinternal) <> 1 THEN
    RAISE EXCEPTION 'Home Games owner consistency trigger binding drifted';
  END IF;
  v_expected := replace(replace(replace(replace(v_definition,
    ' LANGUAGE plpgsql', ' LANGUAGE plpgsql' || chr(10) || ' SECURITY DEFINER'),
    'SET search_path TO ''public'', ''pg_temp''', 'SET search_path TO ''public'', ''extensions'''),
    'FROM commander_home_groups', 'FROM public.commander_home_groups'),
    'FROM commander_home_members', 'FROM public.commander_home_members');
  EXECUTE v_expected;
  IF NOT (SELECT proowner=v_owner AND proacl IS NOT DISTINCT FROM v_acl
      AND prosecdef AND proconfig=ARRAY['search_path=public, extensions']
      AND pg_get_functiondef(oid)=v_expected
      AND pg_get_function_arguments(oid)='' AND pg_get_function_result(oid)='trigger'
      FROM pg_proc WHERE oid=v_oid)
     OR (SELECT pg_get_triggerdef(oid) FROM pg_trigger
          WHERE tgfoid=v_oid AND NOT tgisinternal) IS DISTINCT FROM v_binding THEN
    RAISE EXCEPTION 'Home Games owner consistency post-image drifted';
  END IF;
END;
$migration$;
