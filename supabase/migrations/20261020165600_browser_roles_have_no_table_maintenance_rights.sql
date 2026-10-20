-- TIER: 2. Browser Data API roles require row operations, never SQL table
-- structure/maintenance privileges. RLS does not protect TRUNCATE. SECURITY
-- DEFINER owners, not browser roles, own any legitimate trigger/FK maintenance.
-- Read-only PokerIQ catalog 2026-10-20: 1642 base tables, all RLS; browser
-- TRIGGER/REFERENCES/MAINTAIN still present, TRUNCATE already absent. 392
-- column ACLs on 13 relations preserve deliberate column-read privacy.
-- Revoke only structural privileges from PUBLIC/anon/authenticated. Keep all
-- DML, every column ACL, all other relation ACL entries (including service),
-- effective service permissions, owners/RLS/policy metadata exactly unchanged.
-- Abort on inherited/column structural residue instead of guessing its intent.
-- No rows, functions or business policies change. No default grant widening.
-- Rollback requires captured exact per-relation ACL preimage; never GRANT ALL.
-- Read-only live pg_default_acl confirms postgres/public browser structural
-- defaults. Remove only those four rights; retain default DML/service rights
-- and every other owner/schema/object-type default exactly. Other owners
-- (including supabase_admin/public) are explicitly outside this correction.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $access$
DECLARE
  v_defaults_before jsonb; v_defaults_after jsonb;
  v_default_service_before jsonb; v_default_service_after jsonb;
  v_acl_before jsonb; v_acl_after jsonb;
  v_columns_before jsonb; v_columns_after jsonb;
  v_metadata_before jsonb; v_metadata_after jsonb;
  v_effective_before jsonb; v_effective_after jsonb;
BEGIN
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'PostgreSQL 17 or later required for MAINTAIN verification';
  END IF;
  SELECT jsonb_agg(jsonb_build_array(c.oid,a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      ORDER BY c.oid,a.grantor,a.grantee,a.privilege_type,a.is_grantable)
    INTO v_acl_before FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
   WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f','S')
     AND NOT (a.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid)
       AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'));
  SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attacl::text) ORDER BY a.attrelid,a.attnum)
    INTO v_columns_before FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
   WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;
  SELECT jsonb_build_array(
    (SELECT jsonb_agg(jsonb_build_array(oid,relowner,relrowsecurity,relforcerowsecurity) ORDER BY oid)
       FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p','v','m','f','S')),
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
       WHERE c.relnamespace='public'::regnamespace)) INTO v_metadata_before;
  SELECT jsonb_agg(jsonb_build_array(c.oid,r.role,p.privilege,has_table_privilege(r.role,c.oid,p.privilege))
      ORDER BY c.oid,r.role,p.privilege) INTO v_effective_before
    FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(role)
    CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
   WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
     AND (r.role='service_role' OR p.privilege IN ('SELECT','INSERT','UPDATE','DELETE'));

SELECT jsonb_agg(jsonb_build_array(d.defaclrole,d.defaclnamespace,d.defaclobjtype,a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype,a.grantor,a.grantee,a.privilege_type,a.is_grantable)
    INTO v_defaults_before FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE NOT (d.defaclrole='postgres'::regrole::oid AND d.defaclnamespace='public'::regnamespace
     AND d.defaclobjtype='r' AND a.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid)
     AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'));
  SELECT jsonb_agg(jsonb_build_array(x.defaclrole,x.defaclnamespace,x.defaclobjtype,x.privilege_type)
      ORDER BY x.defaclrole,x.defaclnamespace,x.defaclobjtype,x.privilege_type)
    INTO v_default_service_before FROM (
      SELECT DISTINCT d.defaclrole,d.defaclnamespace,d.defaclobjtype,a.privilege_type
        FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
       WHERE a.grantee=0 OR pg_has_role('service_role',a.grantee,'USAGE')
    ) x;

    REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public
    FROM PUBLIC, anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM PUBLIC, anon, authenticated;

  SELECT jsonb_agg(jsonb_build_array(d.defaclrole,d.defaclnamespace,d.defaclobjtype,a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype,a.grantor,a.grantee,a.privilege_type,a.is_grantable)
    INTO v_defaults_after FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE NOT (d.defaclrole='postgres'::regrole::oid AND d.defaclnamespace='public'::regnamespace
     AND d.defaclobjtype='r' AND a.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid)
     AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'));
  SELECT jsonb_agg(jsonb_build_array(x.defaclrole,x.defaclnamespace,x.defaclobjtype,x.privilege_type)
      ORDER BY x.defaclrole,x.defaclnamespace,x.defaclobjtype,x.privilege_type)
    INTO v_default_service_after FROM (
      SELECT DISTINCT d.defaclrole,d.defaclnamespace,d.defaclobjtype,a.privilege_type
        FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
       WHERE a.grantee=0 OR pg_has_role('service_role',a.grantee,'USAGE')
    ) x;
  IF v_defaults_before IS DISTINCT FROM v_defaults_after
     OR v_default_service_before IS DISTINCT FROM v_default_service_after THEN
    RAISE EXCEPTION 'Unexpected default DML/service/other-owner/schema ACL change; nothing may commit';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole='postgres'::regrole::oid AND d.defaclobjtype='r'
      AND d.defaclnamespace IN (0,'public'::regnamespace::oid)
      AND (a.grantee=0 OR pg_has_role('anon',a.grantee,'USAGE') OR pg_has_role('authenticated',a.grantee,'USAGE'))
      AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')) THEN
    RAISE EXCEPTION 'Postgres public future-table structural defaults remain; review inherited/global source';
  END IF;


  SELECT jsonb_agg(jsonb_build_array(c.oid,a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      ORDER BY c.oid,a.grantor,a.grantee,a.privilege_type,a.is_grantable)
    INTO v_acl_after FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
   WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f','S')
     AND NOT (a.grantee IN (0,'anon'::regrole::oid,'authenticated'::regrole::oid)
       AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'));
  SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attacl::text) ORDER BY a.attrelid,a.attnum)
    INTO v_columns_after FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
   WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL;
  SELECT jsonb_build_array(
    (SELECT jsonb_agg(jsonb_build_array(oid,relowner,relrowsecurity,relforcerowsecurity) ORDER BY oid)
       FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p','v','m','f','S')),
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
       WHERE c.relnamespace='public'::regnamespace)) INTO v_metadata_after;
  SELECT jsonb_agg(jsonb_build_array(c.oid,r.role,p.privilege,has_table_privilege(r.role,c.oid,p.privilege))
      ORDER BY c.oid,r.role,p.privilege) INTO v_effective_after
    FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(role)
    CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
   WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
     AND (r.role='service_role' OR p.privilege IN ('SELECT','INSERT','UPDATE','DELETE'));
  IF v_acl_before IS DISTINCT FROM v_acl_after
     OR v_columns_before IS DISTINCT FROM v_columns_after
     OR v_metadata_before IS DISTINCT FROM v_metadata_after
     OR v_effective_before IS DISTINCT FROM v_effective_after THEN
    RAISE EXCEPTION 'ACL/column privacy/service/owner/RLS/policy boundary changed; nothing may commit';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated')) r(role)
     WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
       AND (has_table_privilege(r.role,c.oid,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
         OR has_any_column_privilege(r.role,c.oid,'REFERENCES'))
  ) THEN
    RAISE EXCEPTION 'Browser inherited/column structural privilege remains; review its source';
  END IF;
END $access$;
COMMIT;
