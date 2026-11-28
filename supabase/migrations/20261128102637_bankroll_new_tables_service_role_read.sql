-- ═══════════════════════════════════════════════════════════════════════
-- 20261128102637_bankroll_new_tables_service_role_read.sql
-- INSTALLED on production 2026-11-28 10:26:37 UTC as version 20261128102637 (supabase_migrations.schema_migrations).
-- Repo SQL equals the installed statements (comments and blank lines aside). Never edit.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (one explicit grant)
-- AUTHOR:      Claude (Bankroll Manager programme, Wave 4 db lane, 2026-11-28)
-- AFFECTS:     grants: public.bankroll_ledger_changes, public.staking_share_links (service_role)
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS:
--   scripts/ci/check-migrations-applied.mjs (CHECK 17, Pre-Deploy Safety
--   Checks) proves a migration's tables are live by reading PostgREST's
--   OpenAPI document with the service key. PostgREST lists only relations the
--   requesting role holds a privilege on, so after
--   20261128102249_bankroll_new_tables_explicit_boundary removed service_role's
--   implicit ALL, both tables would read as "never applied".
--
-- WHY:
--   service_role needs to SEE these tables (schema verification, support
--   reads) but has no reason to write them: history rows are written only by
--   the SECURITY DEFINER trigger, and share links only by their owner under
--   RLS. So it gets SELECT and nothing else, stated explicitly as the
--   explicit-table-access rule asks.
--
-- HOW:
--   GRANT SELECT on both tables TO service_role; assert it holds SELECT and
--   still holds no write privilege.
--
-- DDL WINDOWS: the database refuses DDL from :50 to :03 UTC every hour and
-- during the nightly release freeze (23:45-04:15 America/Chicago,
-- smarter_private.fn_ca_release_freeze_ddl_guard). A refused run applied
-- nothing - apply ONCE when the window is open.
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regclass('public.bankroll_ledger_changes') IS NULL OR to_regclass('public.staking_share_links') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: bankroll_ledger_changes or staking_share_links is missing';
  END IF;
END
$pre$;

-- ─── 2. THE CHANGE ────────────────────────────────────────────────────
GRANT SELECT ON TABLE public.bankroll_ledger_changes, public.staking_share_links TO service_role;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $post$
DECLARE op text;
BEGIN
  IF NOT has_table_privilege('service_role', 'public.bankroll_ledger_changes', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.staking_share_links', 'SELECT') THEN
    RAISE EXCEPTION 'post-apply: service_role cannot read a new bankroll table';
  END IF;
  FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('service_role', 'public.bankroll_ledger_changes', op)
       OR has_table_privilege('service_role', 'public.staking_share_links', op) THEN
      RAISE EXCEPTION 'post-apply: service_role holds % on a new bankroll table', op;
    END IF;
  END LOOP;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (CHECK 17 would then report both tables as not applied):
-- BEGIN;
-- REVOKE SELECT ON TABLE public.bankroll_ledger_changes, public.staking_share_links FROM service_role;
-- COMMIT;
-- ═══════════════════════════════════════════════════════════════════════
