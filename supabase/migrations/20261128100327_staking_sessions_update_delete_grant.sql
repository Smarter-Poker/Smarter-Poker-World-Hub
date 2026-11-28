-- ═══════════════════════════════════════════════════════════════════════
-- 20261128100327_staking_sessions_update_delete_grant.sql
-- INSTALLED on production 2026-11-28 10:03:27 UTC as version 20261128100327 (supabase_migrations.schema_migrations).
-- Repo SQL equals the installed statements (comments and blank lines aside). Never edit.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (Bankroll Manager programme, Wave 4 db lane, 2026-11-28)
-- AFFECTS:     grants: public.staking_sessions (authenticated)
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS:
--   src/lib/bankroll/bankrollSelectors.ts
--     loadStakingDeal        -> .from('staking_sessions').update(...)  (replay rewrite)
--     unlinkStakingSession   -> .from('staking_sessions').delete()
--   Both already run in production today; this migration only makes a
--   database rebuilt from migrations hold the same rights.
--
-- WHY:
--   20261020173409_explicit_legacy_baseline_caller_access recorded
--   staking_sessions as INSERT,SELECT for authenticated, from the callers that
--   existed then. Since #3215 (2026-11-27) the Staking Tracker also UPDATEs
--   stored rows when the played-order makeup replay disagrees with them and
--   DELETEs a row when a session is unlinked. Production already holds
--   UPDATE and DELETE (re-read from information_schema.role_table_grants on
--   2026-11-28: authenticated has DELETE,INSERT,SELECT,UPDATE), protected by
--   RLS policy "Users can manage own staking sessions" (cmd ALL, USING
--   arrangement_id IN the caller's own staking_arrangements; with no WITH
--   CHECK, Postgres applies USING to new rows too). A database rebuilt from
--   migrations would lose both rights and the tracker could no longer
--   correct or unlink. On production this is a no-op.
--
-- HOW:
--   1. Refuse unless RLS is on and the own-arrangements policy exists.
--   2. GRANT UPDATE, DELETE to authenticated (idempotent).
--   3. Assert all four caller rights are held and RLS is still on.
--
-- BREAK WINDOW: the database refuses DDL (GRANT included) from :50 to :03
-- UTC every hour. Run `date -u` first; if refused, nothing applied and no
-- history row was written - apply ONCE after :03, never in a retry loop.
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $pre$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staking_sessions'::regclass) THEN
    RAISE EXCEPTION 'pre-flight failed: RLS is not enabled on public.staking_sessions';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staking_sessions'
      AND policyname = 'Users can manage own staking sessions' AND cmd = 'ALL'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: own-arrangements policy missing on public.staking_sessions';
  END IF;
END
$pre$;

-- ─── 2. THE CHANGE ────────────────────────────────────────────────────
GRANT UPDATE, DELETE ON TABLE public.staking_sessions TO authenticated;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $post$
DECLARE op text;
BEGIN
  FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF NOT has_table_privilege('authenticated', 'public.staking_sessions', op) THEN
      RAISE EXCEPTION 'post-apply assertion failed: authenticated lacks % on staking_sessions', op;
    END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staking_sessions'::regclass) THEN
    RAISE EXCEPTION 'post-apply assertion failed: RLS is off on staking_sessions';
  END IF;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK: none. Production held these rights before this migration; a
-- revoke would break the Staking Tracker's replay rewrite and unlink. Never
-- revoke current production rights as a synthetic rollback.
-- ═══════════════════════════════════════════════════════════════════════
