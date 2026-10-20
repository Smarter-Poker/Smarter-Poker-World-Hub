-- Browser entitlement INSERT proves no payment; retire only that capability.
-- Existing browser paid flow already fails the private debit EXECUTE check.
-- Preserve all other rights/policies and every canonical money function.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
DO $admit$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='premium_feature_access' AND c.relkind='r' AND c.relowner='postgres'::regrole AND c.relrowsecurity) THEN RAISE EXCEPTION 'Premium access relation drift'; END IF;
 IF (SELECT array_agg(attname::text ORDER BY attnum) FROM pg_attribute WHERE attrelid='public.premium_feature_access'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM ARRAY['id','user_id','feature_key','expires_at','diamonds_spent','created_at'] THEN RAISE EXCEPTION 'Premium access column drift'; END IF;
 IF (SELECT array_agg(format_type(atttypid,atttypmod) ORDER BY attnum) FROM pg_attribute WHERE attrelid='public.premium_feature_access'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM ARRAY['uuid','uuid','text','timestamp with time zone','integer','timestamp with time zone'] THEN RAISE EXCEPTION 'Premium access column type drift'; END IF;
 IF to_regprocedure('public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)') IS NULL OR has_function_privilege('authenticated','public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)','EXECUTE') OR has_function_privilege('anon','public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)','EXECUTE') THEN RAISE EXCEPTION 'Legacy debit privacy changed: qualify paid caller compatibility first'; END IF;
END;
$admit$;
CREATE TEMP TABLE premium_issuance_before ON COMMIT DROP AS
SELECT jsonb_build_object('relation',(SELECT jsonb_build_array(c.relowner,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions) FROM pg_class c WHERE c.oid='public.premium_feature_access'::regclass),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid='public.premium_feature_access'::regclass),'table_acl',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE c.oid='public.premium_feature_access'::regclass AND NOT(x.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid) AND x.privilege_type='INSERT')),'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.attnotnull,pg_get_expr(d.adbin,d.adrelid),(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type) FROM aclexplode(a.attacl) x WHERE NOT(x.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid) AND x.privilege_type='INSERT'))) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.premium_feature_access'::regclass AND a.attnum>0 AND NOT a.attisdropped)) AS value;
REVOKE INSERT ON TABLE public.premium_feature_access FROM PUBLIC,anon,authenticated;
REVOKE INSERT(id,user_id,feature_key,expires_at,diamonds_spent,created_at) ON public.premium_feature_access FROM PUBLIC,anon,authenticated;
DO $verify$
DECLARE after_value jsonb;
BEGIN
 IF has_table_privilege('anon','public.premium_feature_access','INSERT') OR has_table_privilege('authenticated','public.premium_feature_access','INSERT') OR has_any_column_privilege('anon','public.premium_feature_access','INSERT') OR has_any_column_privilege('authenticated','public.premium_feature_access','INSERT') THEN RAISE EXCEPTION 'Browser premium INSERT remains'; END IF;
 SELECT jsonb_build_object('relation',(SELECT jsonb_build_array(c.relowner,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions) FROM pg_class c WHERE c.oid='public.premium_feature_access'::regclass),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid='public.premium_feature_access'::regclass),'table_acl',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE c.oid='public.premium_feature_access'::regclass AND NOT(x.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid) AND x.privilege_type='INSERT')),'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.attnotnull,pg_get_expr(d.adbin,d.adrelid),(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type) FROM aclexplode(a.attacl) x WHERE NOT(x.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid) AND x.privilege_type='INSERT'))) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.premium_feature_access'::regclass AND a.attnum>0 AND NOT a.attisdropped)) INTO after_value;
 IF after_value IS DISTINCT FROM (SELECT value FROM premium_issuance_before) THEN RAISE EXCEPTION 'Unrelated premium metadata or privileges changed'; END IF;
END;
$verify$;
COMMIT;
