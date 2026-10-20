-- TIER: 2. Preserve two existing direct-caller permissions without defaults.
-- client_shell_telemetry is owned by Club Arena's immutable
-- 20260830053713_20260830_client_shell_telemetry.sql. The authenticated
-- ShellTelemetryService writes its own rows; it never reads this table.
-- content_sources is owned by Hub's immutable
-- 20260906095751_poker_gets_a_supply_that_renews.sql. The server-side admin
-- video-sources API reads, inserts and updates through its service client.
-- Neither original creation declares these table grants. Arena migration
-- 20261006024500 later grants ALL on content_sources through its content-engine
-- ACL loop. This Hub-owned declaration avoids depending on that separate
-- repository for Hub provisioning; it is not an additional live access gap.
-- Existing production
-- already has all four privileges; this is a no-widening live transition and
-- explicit provision/reset compatibility. No existing grant is revoked, no
-- browser SELECT is added, no RLS/policy/row/sequence changes are made.
-- Scope: these source declarations and callers, not every historical reset.
-- Rollback: only on a database proved to have lacked these grants beforehand,
-- revoke precisely the added rights in a new migration. Never revoke preexisting
-- production permissions. Do not replay either applied historical migration.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $pre$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['client_shell_telemetry','content_sources'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_table AND c.relkind='r'
        AND c.relrowsecurity AND pg_get_userbyid(c.relowner)='postgres'
    ) THEN
      RAISE EXCEPTION 'Expected postgres-owned public.% base table with RLS',v_table;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.client_shell_telemetry'::regclass) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM pg_policy WHERE polrelid='public.client_shell_telemetry'::regclass
         AND polname='client_shell_telemetry_insert_own' AND polcmd='a'
         AND polpermissive AND polqual IS NULL
         AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]
         AND regexp_replace(pg_get_expr(polwithcheck,polrelid),'\s+',' ','g')
           IN ('(user_id = auth.uid())','(user_id = ( SELECT auth.uid() AS uid))')
     ) THEN
    RAISE EXCEPTION 'Shell telemetry must retain only its authenticated own-user INSERT policy';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.content_sources'::regclass) THEN
    RAISE EXCEPTION 'Content sources must retain RLS with no browser policy';
  END IF;
END $pre$;
GRANT INSERT ON TABLE public.client_shell_telemetry TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.content_sources TO service_role;
DO $post$
BEGIN
  IF NOT has_table_privilege('authenticated','public.client_shell_telemetry','INSERT')
     OR NOT has_table_privilege('service_role','public.content_sources','SELECT')
     OR NOT has_table_privilege('service_role','public.content_sources','INSERT')
     OR NOT has_table_privilege('service_role','public.content_sources','UPDATE') THEN
    RAISE EXCEPTION 'Explicit direct-caller privileges are incomplete';
  END IF;
END $post$;
COMMIT;
