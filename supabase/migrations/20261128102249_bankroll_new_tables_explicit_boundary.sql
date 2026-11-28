-- ═══════════════════════════════════════════════════════════════════════
-- 20261128102249_bankroll_new_tables_explicit_boundary.sql
-- INSTALLED on production 2026-11-28 10:22:49 UTC as version 20261128102249 (supabase_migrations.schema_migrations).
-- Repo SQL equals the installed statements (comments and blank lines aside). Never edit.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (grants only)
-- AUTHOR:      Claude (Bankroll Manager programme, Wave 4 db lane, 2026-11-28)
-- AFFECTS:     grants: public.bankroll_ledger_changes, public.staking_share_links,
--              sequence public.bankroll_ledger_changes_id_seq
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS: none. No server route or script uses
--   either table with the service key (grep of pages/api, src/lib and scripts,
--   2026-11-28); the browser uses them as `authenticated` under RLS, and the
--   history trigger writes as its SECURITY DEFINER owner.
--
-- WHY:
--   20261128101805_bankroll_ledger_changes and 20261128101849_staking_share_links
--   revoked PUBLIC, anon and authenticated but not service_role, so
--   service_role kept Supabase's implicit ALL (read from
--   information_schema.role_table_grants 2026-11-28: DELETE, INSERT,
--   REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on both).
--   scripts/ci/check-explicit-table-access.mjs requires every new public
--   table to state its whole boundary, because Supabase stops supplying those
--   implicit grants; a rebuilt database would differ from production. The
--   identity sequence behind bankroll_ledger_changes also kept implicit
--   USAGE/UPDATE for anon and authenticated, which let a client burn ids.
--
-- HOW:
--   - REVOKE ALL on both tables FROM service_role (it needs nothing).
--   - REVOKE ALL on the history id sequence FROM PUBLIC, anon, authenticated,
--     service_role (only the trigger's owner inserts).
--   - Assert the intended browser grants are untouched.
--
-- BREAK WINDOW: the database refuses DDL from :50 to :03 UTC every hour, and
-- the nightly release schema freeze (23:45-04:15 America/Chicago,
-- smarter_private.fn_ca_release_freeze_ddl_guard) refuses it too. A refused
-- run applied nothing - apply ONCE when the window is open.
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regclass('public.bankroll_ledger_changes') IS NULL OR to_regclass('public.staking_share_links') IS NULL
     OR to_regclass('public.bankroll_ledger_changes_id_seq') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: bankroll_ledger_changes, its id sequence or staking_share_links is missing';
  END IF;
END
$pre$;

-- ─── 2. THE CHANGE ────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.bankroll_ledger_changes FROM service_role;
REVOKE ALL ON TABLE public.staking_share_links FROM service_role;
REVOKE ALL ON SEQUENCE public.bankroll_ledger_changes_id_seq FROM PUBLIC, anon, authenticated, service_role;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $post$
DECLARE op text;
BEGIN
  FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('service_role', 'public.bankroll_ledger_changes', op)
       OR has_table_privilege('service_role', 'public.staking_share_links', op) THEN
      RAISE EXCEPTION 'post-apply: service_role still holds % on a new bankroll table', op;
    END IF;
  END LOOP;
  IF has_sequence_privilege('anon', 'public.bankroll_ledger_changes_id_seq', 'USAGE')
     OR has_sequence_privilege('authenticated', 'public.bankroll_ledger_changes_id_seq', 'USAGE') THEN
    RAISE EXCEPTION 'post-apply: a client role can still use the history id sequence';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.bankroll_ledger_changes', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.bankroll_ledger_changes', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.staking_share_links', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.staking_share_links', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.staking_share_links', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.staking_share_links', 'DELETE') THEN
    RAISE EXCEPTION 'post-apply: an intended authenticated grant is missing';
  END IF;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (restores the implicit grants this removed):
-- BEGIN;
-- GRANT ALL ON TABLE public.bankroll_ledger_changes, public.staking_share_links TO service_role;
-- GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.bankroll_ledger_changes_id_seq TO anon, authenticated, service_role;
-- COMMIT;
-- ═══════════════════════════════════════════════════════════════════════
