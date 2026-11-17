-- TIER: 2. AUTHOR: Codex. AFFECTS: existing service-only schema manifest.
-- WHY: CHECK17 must prove installed private helpers without granting RPC access
-- merely to expose them in service-role OpenAPI. Preserve existing manifest keys.
-- This reads catalog metadata only; no function body is executed or returned.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.fn_schema_manifest()'::regprocedure))<>'350e49468553f4dc6cbcfe63b818e138' THEN
  RAISE EXCEPTION 'Schema Manifest Source Changed'; END IF;
 IF has_function_privilege('anon','public.fn_schema_manifest()','EXECUTE')
 OR has_function_privilege('authenticated','public.fn_schema_manifest()','EXECUTE')
 OR NOT has_function_privilege('service_role','public.fn_schema_manifest()','EXECUTE') THEN
  RAISE EXCEPTION 'Schema Manifest Authority Changed'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fn_schema_manifest() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $function$
 SELECT jsonb_build_object(
  'tables',(SELECT coalesce(jsonb_agg(table_name ORDER BY table_name),'[]'::jsonb)
   FROM information_schema.tables WHERE table_schema='public' AND table_type IN('BASE TABLE','VIEW')),
  'functions',(SELECT coalesce(jsonb_agg(DISTINCT proname ORDER BY proname),'[]'::jsonb)
   FROM pg_proc WHERE pronamespace='public'::regnamespace),
  'function_contracts',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'schema','public','name',p.proname,'identity_arguments',pg_get_function_identity_arguments(p.oid),
   'input_argument_names',a.names,'input_argument_types',a.types,
   'result_type',pg_get_function_result(p.oid),'security_definer',p.prosecdef,
   'volatility',p.provolatile::text,
   'execute',jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')),
   'definition_md5',md5(pg_get_functiondef(p.oid)),'body_md5',md5(p.prosrc)
  ) ORDER BY p.proname,p.oid),'[]'::jsonb)
  FROM pg_proc p CROSS JOIN LATERAL (
   SELECT coalesce(jsonb_agg(p.proargnames[v.ordinality] ORDER BY v.ordinality),'[]'::jsonb) names,
    coalesce(jsonb_agg(format_type(v.typ,NULL) ORDER BY v.ordinality),'[]'::jsonb) types
   FROM unnest(coalesce(p.proallargtypes,p.proargtypes::oid[])) WITH ORDINALITY AS v(typ,ordinality)
   WHERE p.proargmodes IS NULL OR p.proargmodes[v.ordinality] IN('i','b','v')
  ) a WHERE p.pronamespace='public'::regnamespace AND p.prokind='f')
 )
$function$;
-- CREATE OR REPLACE preserves the existing service-only ACL; assert it rather
-- than opening execution on any private function being inspected.
DO $$ BEGIN
 IF has_function_privilege('anon','public.fn_schema_manifest()','EXECUTE')
 OR has_function_privilege('authenticated','public.fn_schema_manifest()','EXECUTE')
 OR NOT has_function_privilege('service_role','public.fn_schema_manifest()','EXECUTE')
 OR NOT (public.fn_schema_manifest() ?& ARRAY['tables','functions','function_contracts']) THEN
  RAISE EXCEPTION 'Schema Manifest Contract Assertion Failed'; END IF;
END $$;
COMMIT;
