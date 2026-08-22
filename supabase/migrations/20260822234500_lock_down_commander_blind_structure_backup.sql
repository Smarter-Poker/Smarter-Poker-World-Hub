-- ============================================================================
-- 20260822234500_lock_down_commander_blind_structure_backup.sql
-- TIER: 3  |  AFFECTS: grants + RLS on one table. No data is read or written.
--
-- A BACKUP TABLE WAS LEFT WRITABLE BY THE INTERNET
--
-- public.commander_blind_structure_backup_20260822 was created on 2026-08-22 as
-- a point-in-time copy of the Commander blind structures. It arrived with RLS
-- disabled and INSERT/UPDATE/DELETE granted to BOTH `anon` and `authenticated`
-- - which is simply what CREATE TABLE inherits in this schema. An
-- unauthenticated request could write to it.
--
-- HOW IT SURFACED, AND WHY THAT MATTERS
--
-- CHECK 10 of the Build Safety Gate (`scripts/check-economy-invariants.mjs`)
-- caught it, failing `no_rls_off_tables_writable_by_clients`. That check reads
-- the LIVE catalog rather than the branch, so the failure was not attached to
-- the change that caused it. It went red on EVERY open pull request in this
-- repository at once, hours after the table was made, and stayed red until
-- someone fixed the database rather than their own branch.
--
-- That is the check working exactly as designed - a database-wide invariant
-- should stop the whole line - but it is worth writing down, because the next
-- person to see it will be looking for the bug in their own diff and it will
-- not be there.
--
-- WHAT THIS DOES
--
-- The data is a backup. Nothing in any application reads it and nothing should
-- ever write to it, so the correct posture is service_role only.
--
-- Both halves are applied on purpose:
--   - REVOKE is what satisfies the invariant today.
--   - ENABLE ROW LEVEL SECURITY is what stops a future GRANT from quietly
--     reopening it: with RLS on and no policies, every non-service role is
--     denied regardless of grants. service_role bypasses RLS, so a restore
--     still works.
--
-- THE PATTERN, NOT JUST THE INSTANCE
--
-- Any agent who runs CREATE TABLE in `public` on this project gets a table
-- clients can write to. That is a foot-gun with one instance so far and no
-- reason to think it is the last. Changing the schema's default privileges is
-- the real fix and is deliberately NOT attempted here - it affects every future
-- table in the estate and belongs in its own reviewed change. CHECK 10 is the
-- net until then, and it held.
--
-- ROLLBACK - do not. This is a lock, not a feature. If a restore genuinely
-- needs client access, grant it to `authenticated` narrowly and add an RLS
-- policy, rather than turning both off:
--   ALTER TABLE public.commander_blind_structure_backup_20260822 DISABLE ROW LEVEL SECURITY;
--   GRANT ALL ON public.commander_blind_structure_backup_20260822 TO anon, authenticated;
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'commander_blind_structure_backup_20260822'
       AND c.relkind = 'r'
  ) THEN
    -- The backup may legitimately have been dropped once it was no longer
    -- needed. That is a pass, not a failure.
    RAISE NOTICE 'commander_blind_structure_backup_20260822 no longer exists - nothing to lock down';
    RETURN;
  END IF;

  EXECUTE 'REVOKE ALL ON public.commander_blind_structure_backup_20260822 FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON public.commander_blind_structure_backup_20260822 FROM anon, authenticated';
  EXECUTE 'GRANT ALL ON public.commander_blind_structure_backup_20260822 TO service_role';
  EXECUTE 'ALTER TABLE public.commander_blind_structure_backup_20260822 ENABLE ROW LEVEL SECURITY';
END $$;

COMMENT ON TABLE public.commander_blind_structure_backup_20260822 IS
  'Point-in-time backup of the Commander blind structures, 2026-08-22. service_role only: it arrived RLS-off and writable by anon, which failed CHECK 10 (no_rls_off_tables_writable_by_clients) on every open World Hub PR at once. Restore from it with the service role; nothing else should touch it.';

-- ── Post-apply: the invariant this exists to satisfy must now pass ──────────
DO $$
DECLARE v_bad text[];
BEGIN
  -- The check's own predicate, verbatim, so this migration cannot pass while
  -- the gate it was written for still fails.
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

  IF has_table_privilege('anon', 'public.commander_blind_structure_backup_20260822', 'INSERT')
     OR has_table_privilege('authenticated', 'public.commander_blind_structure_backup_20260822', 'INSERT') THEN
    RAISE EXCEPTION 'the backup table is still client-writable';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.commander_blind_structure_backup_20260822'::regclass) THEN
    RAISE EXCEPTION 'RLS was not enabled on the backup table';
  END IF;
END $$;

-- ============================================================================
-- APPLY HISTORY
--
-- Applied to production 2026-08-22 as `lock_down_commander_blind_structure_backup`.
-- Verified immediately afterwards by calling public.economy_invariants()
-- directly: 12 checks, 12 ok, including no_rls_off_tables_writable_by_clients.
-- ============================================================================
