-- ============================================================================
-- 20261005202700_trivia_p8_gto_render_claims_acl.sql
-- ============================================================================
-- TIER:        2
-- AUTHOR:      Codex Phase 8 ACL closeout
-- AFFECTS:     public.trivia_gto_render_claims table privileges
-- IRREVERSIBLE: no
--
-- WHY:
--   Phase 8 created the force-RLS render-claim custody table with no policies,
--   but it granted the service role without first clearing Supabase's inherited
--   default table ACL. Production therefore retained TRUNCATE, REFERENCES,
--   TRIGGER and MAINTAIN in addition to the four privileges the render-claim
--   RPCs actually require.
--
-- HOW:
--   1. Refuse to run unless the installed table is the exact postgres-owned,
--      force-RLS, policy-free object and still has the observed pre-fix ACL.
--   2. Reset every application-role table privilege, then grant service_role
--      only SELECT, INSERT, UPDATE and DELETE.
--   3. Assert the exact effective eight-privilege matrix and preserved custody
--      boundary before committing.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog;

DO $preflight$
DECLARE
    v_relation pg_catalog.pg_class%ROWTYPE;
    v_role text;
    v_privilege text;
BEGIN
    IF pg_catalog.to_regclass('public.trivia_gto_render_claims') IS NULL THEN
        RAISE EXCEPTION 'TRIVIA_P8_RENDER_CLAIMS_ACL_MISSING_TABLE';
    END IF;

    SELECT relation.*
      INTO v_relation
      FROM pg_catalog.pg_class relation
     WHERE relation.oid = 'public.trivia_gto_render_claims'::pg_catalog.regclass;

    IF v_relation.relkind <> 'r'
       OR v_relation.relowner::pg_catalog.regrole::text <> 'postgres'
       OR NOT v_relation.relrowsecurity
       OR NOT v_relation.relforcerowsecurity THEN
        RAISE EXCEPTION
            'TRIVIA_P8_RENDER_CLAIMS_ACL_UNEXPECTED_TABLE_STATE: kind %, owner %, rls %, force_rls %',
            v_relation.relkind,
            v_relation.relowner::pg_catalog.regrole::text,
            v_relation.relrowsecurity,
            v_relation.relforcerowsecurity;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_policy policy
         WHERE policy.polrelid = v_relation.oid
    ) THEN
        RAISE EXCEPTION 'TRIVIA_P8_RENDER_CLAIMS_ACL_UNEXPECTED_POLICY';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.aclexplode(v_relation.relacl) acl
         WHERE acl.grantee = 0
    ) THEN
        RAISE EXCEPTION 'TRIVIA_P8_RENDER_CLAIMS_ACL_UNEXPECTED_PUBLIC_GRANT';
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        FOREACH v_privilege IN ARRAY ARRAY[
            'SELECT', 'INSERT', 'UPDATE', 'DELETE',
            'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
        ]
        LOOP
            IF pg_catalog.has_table_privilege(v_role, v_relation.oid, v_privilege) THEN
                RAISE EXCEPTION
                    'TRIVIA_P8_RENDER_CLAIMS_ACL_UNEXPECTED_BROWSER_PRIVILEGE: role %, privilege %',
                    v_role,
                    v_privilege;
            END IF;
        END LOOP;
    END LOOP;

    FOREACH v_privilege IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ]
    LOOP
        IF NOT pg_catalog.has_table_privilege(
            'service_role',
            v_relation.oid,
            v_privilege
        ) THEN
            RAISE EXCEPTION
                'TRIVIA_P8_RENDER_CLAIMS_ACL_OBSERVED_PRIVILEGE_MISSING: service_role %',
                v_privilege;
        END IF;
    END LOOP;
END
$preflight$;

REVOKE ALL PRIVILEGES ON TABLE public.trivia_gto_render_claims
    FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.trivia_gto_render_claims
    TO service_role;

DO $postflight$
DECLARE
    v_relation pg_catalog.pg_class%ROWTYPE;
    v_mismatch record;
BEGIN
    SELECT relation.*
      INTO v_relation
      FROM pg_catalog.pg_class relation
     WHERE relation.oid = pg_catalog.to_regclass('public.trivia_gto_render_claims');

    IF v_relation.oid IS NULL
       OR v_relation.relkind <> 'r'
       OR v_relation.relowner::pg_catalog.regrole::text <> 'postgres'
       OR NOT v_relation.relrowsecurity
       OR NOT v_relation.relforcerowsecurity THEN
        RAISE EXCEPTION 'TRIVIA_P8_RENDER_CLAIMS_ACL_POSTCONDITION_TABLE_STATE';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_policy policy
         WHERE policy.polrelid = v_relation.oid
    ) THEN
        RAISE EXCEPTION 'TRIVIA_P8_RENDER_CLAIMS_ACL_POSTCONDITION_POLICY';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.aclexplode(v_relation.relacl) acl
         WHERE acl.grantee = 0
    ) THEN
        RAISE EXCEPTION 'TRIVIA_P8_RENDER_CLAIMS_ACL_POSTCONDITION_PUBLIC_GRANT';
    END IF;

    FOR v_mismatch IN
        WITH expected(role_name, privileges) AS (
            VALUES
                ('anon', ARRAY[]::text[]),
                ('authenticated', ARRAY[]::text[]),
                ('service_role', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[])
        ), privileges(privilege) AS (
            VALUES
                ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
        )
        SELECT expected.role_name,
               privileges.privilege,
               privileges.privilege = ANY(expected.privileges) AS should_have,
               pg_catalog.has_table_privilege(
                   expected.role_name,
                   v_relation.oid,
                   privileges.privilege
               ) AS does_have
          FROM expected
          CROSS JOIN privileges
         WHERE pg_catalog.has_table_privilege(
                   expected.role_name,
                   v_relation.oid,
                   privileges.privilege
               ) IS DISTINCT FROM (
                   privileges.privilege = ANY(expected.privileges)
               )
    LOOP
        RAISE EXCEPTION
            'TRIVIA_P8_RENDER_CLAIMS_ACL_POSTCONDITION_MISMATCH: role %, privilege %, expected %, actual %',
            v_mismatch.role_name,
            v_mismatch.privilege,
            v_mismatch.should_have,
            v_mismatch.does_have;
    END LOOP;
END
$postflight$;

COMMIT;

-- ROLLBACK:
-- Do not restore the overbroad inherited ACL. If the render-claim authority
-- contract changes, ship another forward migration with its new exact matrix.
