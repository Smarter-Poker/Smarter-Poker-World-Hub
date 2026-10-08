\set ON_ERROR_STOP on

-- The runner applies the exact commented rollback template from the migration
-- to a no-evidence clone before executing these post-rollback assertions.
DO $assert_rollback$
DECLARE
    v_operator_owner text;
    v_settlement_owner text;
    v_rake_owner text;
    v_operator_hash text;
    v_settlement_hash text;
    v_rake_hash text;
BEGIN
    IF to_regclass('public.trivia_settlement_payout_controls_v1') IS NOT NULL
       OR to_regprocedure('public.trivia_settlement_payout_control_apply_v1(uuid,uuid,text,uuid,text)') IS NOT NULL
       OR to_regprocedure('public.trivia_settlement_payout_control_status_v1(uuid,uuid)') IS NOT NULL
       OR to_regprocedure('public.trivia_p11_guard_rake_mutation_v1()') IS NOT NULL
       OR to_regprocedure('public.trivia_operator_execute_before_payout_control_v1(uuid,text,text,text,uuid,jsonb)') IS NOT NULL THEN
        RAISE EXCEPTION 'rollback left payout-control authority behind';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.trivia_settlements'::regclass
           AND NOT tgisinternal
           AND tgname = 'trg_trivia_p11_guard_rake_mutation'
    ) THEN
        RAISE EXCEPTION 'rollback left the cached-rake fence trigger behind';
    END IF;
    IF to_regprocedure('public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_settlement_settle(text,uuid,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'rollback did not restore every canonical function';
    END IF;

    SELECT pg_catalog.pg_get_userbyid(p.proowner)
      INTO v_operator_owner
      FROM pg_catalog.pg_proc p
     WHERE p.oid = 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)'::regprocedure;
    SELECT pg_catalog.pg_get_userbyid(p.proowner)
      INTO v_settlement_owner
      FROM pg_catalog.pg_proc p
     WHERE p.oid = 'public.trivia_settlement_settle(text,uuid,jsonb)'::regprocedure;
    SELECT pg_catalog.pg_get_userbyid(p.proowner)
      INTO v_rake_owner
      FROM pg_catalog.pg_proc p
     WHERE p.oid = 'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)'::regprocedure;

    IF v_operator_owner IS DISTINCT FROM 'postgres'
       OR v_settlement_owner IS DISTINCT FROM 'postgres'
       OR v_rake_owner IS DISTINCT FROM 'postgres' THEN
        RAISE EXCEPTION 'rollback function owner drifted: operator=% settlement=% rake=%',
            v_operator_owner, v_settlement_owner, v_rake_owner;
    END IF;

    IF NOT has_function_privilege('service_role', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_settlement_settle(text,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_settlement_settle(text,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_settlement_settle(text,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'rollback canonical function ACL is not service-role-only';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_proc p
          CROSS JOIN LATERAL pg_catalog.aclexplode(
              COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
          ) acl
         WHERE p.oid IN (
                   'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)'::regprocedure,
                   'public.trivia_settlement_settle(text,uuid,jsonb)'::regprocedure,
                   'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)'::regprocedure
               )
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee = 0
    ) THEN
        RAISE EXCEPTION 'rollback left PUBLIC execute on an authoritative function';
    END IF;

    SELECT encode(extensions.digest(convert_to(pg_get_functiondef(
               'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)'::regprocedure
           ), 'UTF8'), 'sha256'), 'hex'),
           encode(extensions.digest(convert_to(pg_get_functiondef(
               'public.trivia_settlement_settle(text,uuid,jsonb)'::regprocedure
           ), 'UTF8'), 'sha256'), 'hex'),
           encode(extensions.digest(convert_to(pg_get_functiondef(
               'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)'::regprocedure
           ), 'UTF8'), 'sha256'), 'hex')
      INTO v_operator_hash, v_settlement_hash, v_rake_hash;
    IF v_operator_hash IS DISTINCT FROM 'ef2e79dbfc12b3806a073358e1974588ddeaff7a172ae8f6e3b16583bf7d5470'
       OR v_settlement_hash IS DISTINCT FROM 'e994b948469cec91bd72376c05d4bd084ff479f2e92989cbdde9f52a2a4c39c0'
       OR v_rake_hash IS DISTINCT FROM '440e43193839f6b81540fd1126bc92a5d5e6479a971d4f51d1e4719b7026a46c' THEN
        RAISE EXCEPTION 'rollback did not restore exact predecessor definitions: operator=% settlement=% rake=%',
            v_operator_hash, v_settlement_hash, v_rake_hash;
    END IF;

END
$assert_rollback$;

SELECT jsonb_build_object(
    'suite', 'trivia-p11-payout-control-rollback-acl-pg17',
    'status', 'PASS'
);
