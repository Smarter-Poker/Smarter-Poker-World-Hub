-- ═══════════════════════════════════════════════════════════════════════
-- 20260908230551_fn_ci_check_constraints.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (additive: one read-only RPC)
-- AUTHOR:      cowork-estate (Claude)
-- AFFECTS:     rpcs: fn_ci_check_constraints (service_role only)
-- IRREVERSIBLE: no
-- APPLIED:     2026-09-08 via the Supabase MCP apply_migration, recorded as
--              version 20260908230551. Dry-run in a rolled-back transaction first.
--
-- WHY:
--   Three defects shipped green on 2026-09-08 because nothing compared what
--   the code emits with what the database and the model API accept: the
--   receipt sheet opened the entry form with category 'session', which
--   bankroll_ledger_category_check has never allowed, so every scanned buy-in
--   was refused with 23514. PostgREST's OpenAPI document (what CHECK 11, 13
--   and 17 read) exposes columns but not CHECK values. This function lets
--   scripts/ci/check-live-contracts.mjs read them with the service role.
--
-- HOW:
--   - SECURITY DEFINER over pg_constraint, public schema, CHECK constraints only
--   - EXECUTE revoked from PUBLIC, anon and authenticated; granted to service_role
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_ci_check_constraints()
RETURNS TABLE(table_name text, constraint_name text, definition text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT c.conrelid::regclass::text, c.conname::text, pg_get_constraintdef(c.oid)
  FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname = 'public' AND c.contype = 'c'
$$;

REVOKE ALL ON FUNCTION public.fn_ci_check_constraints() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ci_check_constraints() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fn_ci_check_constraints() WHERE constraint_name = 'bankroll_ledger_category_check') THEN
    RAISE EXCEPTION 'post-apply failed: fn_ci_check_constraints does not see bankroll_ledger_category_check';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
