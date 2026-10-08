-- TIER: 1 (view-only correction); AUTHOR: Codex
-- AFFECTS: public.trivia_tournament_metrics_v1; IRREVERSIBLE: no
-- WHY: Genuine operator requests fail with 42501 because this security-invoker
-- view calls a private clock RPC. The installed RPC returns clock_timestamp().
-- HOW: Replace only that dependency with the identical built-in wall clock,
-- preserving the view owner, invoker security, columns and existing ACLs.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $repair$
DECLARE
    v_before text := pg_catalog.pg_get_viewdef('public.trivia_tournament_metrics_v1'::regclass, true);
    v_after text;
    v_acl aclitem[];
    v_owner oid;
BEGIN
    IF pg_catalog.md5(v_before) <> '8b9af9352c2de3716ae33a99725d2b5d' THEN
        RAISE EXCEPTION 'Trivia metrics preimage differs; investigate before applying';
    END IF;
    IF (SELECT pg_catalog.btrim(prosrc) FROM pg_catalog.pg_proc
        WHERE oid = 'public.trivia_tournament_clock()'::regprocedure)
        IS DISTINCT FROM 'SELECT pg_catalog.clock_timestamp()' THEN
        RAISE EXCEPTION 'Tournament clock semantics differ; investigate before applying';
    END IF;
    SELECT relacl, relowner INTO v_acl, v_owner
      FROM pg_catalog.pg_class WHERE oid = 'public.trivia_tournament_metrics_v1'::regclass;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class
                   WHERE oid = 'public.trivia_tournament_metrics_v1'::regclass
                     AND 'security_invoker=true' = ANY(reloptions)) THEN
        RAISE EXCEPTION 'Trivia metrics must remain security invoker';
    END IF;
    v_after := pg_catalog.replace(v_before, 'trivia_tournament_clock()', 'pg_catalog.clock_timestamp()');
    IF v_after = v_before OR pg_catalog.strpos(v_after, 'trivia_tournament_clock') > 0 THEN
        RAISE EXCEPTION 'Expected exactly the private clock dependency';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW public.trivia_tournament_metrics_v1 WITH (security_invoker=true) AS ' || v_after;
    IF pg_catalog.replace(pg_catalog.pg_get_viewdef('public.trivia_tournament_metrics_v1'::regclass, true),
                          'clock_timestamp()', 'trivia_tournament_clock()') <> v_before
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class
                   WHERE oid = 'public.trivia_tournament_metrics_v1'::regclass
                     AND (relacl IS DISTINCT FROM v_acl OR relowner <> v_owner)) THEN
        RAISE EXCEPTION 'Trivia metrics changed beyond the wall-clock dependency';
    END IF;
    IF pg_catalog.has_function_privilege('authenticated', 'public.trivia_tournament_clock()', 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', 'public.trivia_tournament_clock()', 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', 'public.trivia_tournament_clock()', 'EXECUTE') THEN
        RAISE EXCEPTION 'Private tournament clock privileges unexpectedly widened';
    END IF;
END
$repair$;
COMMIT;
-- Rollback as a NEW migration, retaining the same view ACL and invoker security:
-- BEGIN;
-- DO $rollback$ DECLARE d text; BEGIN
-- d := pg_catalog.pg_get_viewdef('public.trivia_tournament_metrics_v1'::regclass, true);
-- IF pg_catalog.strpos(d, 'clock_timestamp()') = 0 THEN RAISE EXCEPTION 'Rollback preimage differs'; END IF;
-- EXECUTE 'CREATE OR REPLACE VIEW public.trivia_tournament_metrics_v1 WITH (security_invoker=true) AS '
--   || pg_catalog.replace(d, 'clock_timestamp()', 'public.trivia_tournament_clock()');
-- END $rollback$;
-- COMMIT;
