-- ============================================================================
-- 20260823010000_lock_down_db_saturation_selftest_log.sql
-- TIER: 3  |  AFFECTS: grants + RLS on one table. No data is read or written.
--
-- THE SAME FOOT-GUN, NINETY MINUTES LATER
--
-- public.db_saturation_selftest_log was created on 2026-08-22 to record
-- fn_db_saturation_selftest runs - in its own words, "so a recurrence is
-- visible in data rather than only in player complaints". It arrived
-- RLS-disabled with INSERT/UPDATE/DELETE granted to anon and authenticated,
-- and failed the same required invariant that
-- commander_blind_structure_backup_20260822 failed earlier the same evening:
-- no_rls_off_tables_writable_by_clients (CHECK 10 of the Build Safety Gate).
--
-- Two instances in ninety minutes, from two different agents, neither of whom
-- did anything wrong. CREATE TABLE in `public` on this project simply inherits
-- write grants for the client roles. Whoever creates a table next inherits them
-- too - and because CHECK 10 reads the LIVE catalog rather than the branch, the
-- whole repository's merge queue stops on a failure attached to nobody's diff.
--
-- Only the WRITER here is the service role: fn_db_saturation_selftest is
-- SECURITY DEFINER and is the only thing in the database that touches this
-- table. No client reads it, so service_role-only costs nothing.
--
-- RLS is enabled as well as the grants revoked, for the same reason as the
-- first instance: REVOKE satisfies the invariant today, RLS keeps a future
-- GRANT from quietly undoing it, and service_role bypasses RLS so the self-test
-- keeps writing.
--
-- THE PATTERN IS DELIBERATELY NOT FIXED HERE
--
-- A schema-wide answer - ALTER DEFAULT PRIVILEGES, or an event trigger that
-- enables RLS on every newly created table - changes behaviour for every future
-- table in the estate, including one another agent intends to be
-- client-readable, which would then return zero rows until a policy is written.
-- That is a decision with a blast radius, not a cleanup, and it is raised for
-- Dan rather than taken unilaterally. Until it is taken, expect a third
-- instance; CHECK 10 will catch it, loudly and for everyone.
--
-- ROLLBACK - do not:
--   ALTER TABLE public.db_saturation_selftest_log DISABLE ROW LEVEL SECURITY;
--   GRANT ALL ON public.db_saturation_selftest_log TO anon, authenticated;
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'db_saturation_selftest_log' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'db_saturation_selftest_log does not exist - nothing to lock down';
    RETURN;
  END IF;

  EXECUTE 'REVOKE ALL ON public.db_saturation_selftest_log FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON public.db_saturation_selftest_log FROM anon, authenticated';
  EXECUTE 'GRANT ALL ON public.db_saturation_selftest_log TO service_role';
  EXECUTE 'ALTER TABLE public.db_saturation_selftest_log ENABLE ROW LEVEL SECURITY';
END $$;

-- ── Post-apply: assert the WHOLE invariant, not just this table ─────────────
DO $$
DECLARE v_bad text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO v_bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE c.relkind = 'r'
     AND NOT c.relrowsecurity
     AND c.relname <> 'spatial_ref_sys'
     AND (has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
       OR has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE'));

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'no_rls_off_tables_writable_by_clients still fails for: %', v_bad;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.db_saturation_selftest_log'::regclass) THEN
    RAISE EXCEPTION 'RLS was not enabled on db_saturation_selftest_log';
  END IF;
END $$;

-- ============================================================================
-- APPLY HISTORY
--
-- Applied to production 2026-08-22 as `lock_down_db_saturation_selftest_log`.
-- Verified immediately afterwards by calling public.economy_invariants():
-- 12 checks, 0 failing.
-- ============================================================================
