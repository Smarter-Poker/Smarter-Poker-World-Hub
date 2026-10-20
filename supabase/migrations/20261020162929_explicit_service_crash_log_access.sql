-- TIER: 2. Explicit Data API access, with no reliance on Supabase defaults.
-- The immutable 20260819_client_crash_log migration revokes browser access but
-- never grants the service INSERT used by pages/api/client-crash.js and
-- pages/api/auth/log-client-error.js. bigserial also needs sequence USAGE.
-- Existing production already has these rights; this adds them explicitly for
-- provisioned/reset databases after October 30. No player or game data changes.
-- Rollback: revoke these two grants only on a database that lacked them before
-- this migration. Never revoke existing production service permissions.
-- Admission accepts zero policies or the exact historical insert-only browser
-- policy, which is inert because both table and column DML are denied. Keep
-- that policy unchanged; refuse any other policy or browser ACL drift.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $pre$
BEGIN
  IF to_regclass('public.client_crash_log') IS NULL
     OR to_regclass('public.client_crash_log_id_seq') IS NULL THEN
    RAISE EXCEPTION 'Client crash-log table and sequence must already exist';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.client_crash_log'::regclass)
     OR EXISTS (
       SELECT 1 FROM pg_policy p WHERE p.polrelid='public.client_crash_log'::regclass
         AND (p.polname='client_crash_log_insert_only' AND p.polcmd='a' AND p.polpermissive
           AND cardinality(p.polroles)=2
           AND p.polroles @> ARRAY['anon'::regrole::oid,'authenticated'::regrole::oid]
           AND p.polqual IS NULL AND pg_get_expr(p.polwithcheck,p.polrelid)='true') IS NOT TRUE
     ) THEN
    RAISE EXCEPTION 'Client crash log must remain service-only with RLS and only its known inert policy';
  END IF;
  IF has_table_privilege('anon','public.client_crash_log','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','public.client_crash_log','SELECT,INSERT,UPDATE,DELETE')
     OR has_any_column_privilege('anon','public.client_crash_log','SELECT,INSERT,UPDATE')
     OR has_any_column_privilege('authenticated','public.client_crash_log','SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'Unexpected browser access on client crash log; do not widen it';
  END IF;
END $pre$;
GRANT INSERT ON TABLE public.client_crash_log TO service_role;
GRANT USAGE ON SEQUENCE public.client_crash_log_id_seq TO service_role;
DO $post$
BEGIN
  IF NOT has_table_privilege('service_role','public.client_crash_log','INSERT')
     OR NOT has_sequence_privilege('service_role','public.client_crash_log_id_seq','USAGE') THEN
    RAISE EXCEPTION 'Service crash-log write privileges are incomplete';
  END IF;
END $post$;
COMMIT;
