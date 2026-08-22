-- ═══════════════════════════════════════════════════════════════════════
-- 20260822090000_close_the_three_economy_invariants.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3                              (privilege revocation)
-- AUTHOR:      claude (cowork session, 2026-08-22)
-- AFFECTS:     grants on 2 views, 4 tables, 6 functions; RLS on 3 tables
-- IRREVERSIBLE: no                            (ROLLBACK section at the end)
--
-- WHY:
--   public.economy_invariants() has been returning three failures, and
--   Pre-Deploy Safety Checks (CHECK 10) has been red on main because of it.
--   Nothing required that check, so nothing stopped a push and nobody looked.
--   This is the only reason World Hub's `main` could not gate on its own
--   safety gate - the repo that serves production was the least protected
--   branch in the estate.
--
--   All three findings are real. None is theoretical:
--
--     no_client_writable_views
--       public.club_memberships and public.v_spin_tier_availability both
--       carry INSERT/UPDATE/DELETE to anon AND authenticated.
--
--     no_rls_off_tables_writable_by_clients
--       avatar_photo_migration_backup, commander_finish_position_backup_
--       20260820 and horse_avatar_swap_backup have RLS off and grant
--       INSERT/UPDATE/DELETE to anon. An unauthenticated visitor can write to
--       them. spatial_ref_sys additionally grants TRUNCATE to anon, which is
--       PostGIS's default and a footgun nobody needs.
--
--     anon_mutating_definer_functions_check_auth_uid
--       Six SECURITY DEFINER functions are EXECUTE-able by anon, write rows,
--       and never consult auth.uid(). fn_seed_horses_to_floor spawns AI
--       players into any club by uuid; fn_ensure_upcoming_mtts creates
--       tournaments in any club by uuid. Those are unauthenticated write
--       primitives against the game economy.
--
-- HOW:
--   Every change here revokes something nothing uses. Verified before
--   writing, not after:
--     - no code writes through either view. Club Arena's PlayerInviteModal
--       inserts into club_members (the real table); the only reference to
--       v_spin_tier_availability is a .select() in useSpinTierAvailability.ts.
--       club_memberships is security_invoker=true anyway, so its writes were
--       already RLS-checked - the grant was pointless rather than dangerous.
--     - the three backup tables are referenced by no application code at all.
--     - of the six functions, exactly one has a caller:
--       ca_refresh_stat_distribution, from pages/api/cron/club-stats-
--       maintenance.js, which uses SUPABASE_SERVICE_ROLE_KEY. service_role
--       keeps EXECUTE. Two of the six are trigger functions on tables owned
--       by postgres, so their triggers fire regardless of client grants.
--
--   SELECT is left alone everywhere. This removes the ability to WRITE, not
--   the ability to read.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- NOTE ON TRANSACTIONS: no explicit BEGIN/COMMIT. This is applied through
-- the Supabase migration runner, which wraps the whole file in one
-- transaction; a nested BEGIN would warn and a COMMIT would end the runner's
-- transaction early, so the assertions below would no longer be able to roll
-- the changes back. Every RAISE EXCEPTION here still aborts the entire
-- migration - that is the point of them.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
-- If the shape of the problem is not what was measured, stop. A migration
-- that revokes grants on a schema it does not recognise is a migration
-- taking production down for a reason nobody can reconstruct later.
DO $preflight$
DECLARE
    v_missing text;
    v_fail    integer;
BEGIN
    SELECT string_agg(x.n, ', ')
      INTO v_missing
      FROM (VALUES
            ('club_memberships'), ('v_spin_tier_availability'),
            ('avatar_photo_migration_backup'),
            ('commander_finish_position_backup_20260820'),
            ('horse_avatar_swap_backup')
           ) AS x(n)
     WHERE to_regclass('public.' || quote_ident(x.n)) IS NULL;
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'pre-flight failed: missing relation(s): %', v_missing;
    END IF;

    -- club_memberships MUST be security_invoker. If somebody ever flips it to
    -- a definer view, the write grants removed below would become a real RLS
    -- bypass, and that is worth knowing at apply time.
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        WHERE c.relname = 'club_memberships'
          AND c.reloptions @> ARRAY['security_invoker=true']
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.club_memberships is no longer security_invoker - re-audit before revoking';
    END IF;

    -- The one function with a live caller must keep working afterwards, so
    -- assert service_role can execute it BEFORE anything is touched.
    IF NOT has_function_privilege('service_role', 'public.ca_refresh_stat_distribution(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'pre-flight failed: service_role cannot execute ca_refresh_stat_distribution - revoking anon would break the stats cron';
    END IF;

    SELECT COUNT(*) FILTER (WHERE NOT ok) INTO v_fail FROM public.economy_invariants();
    IF v_fail <> 3 THEN
        RAISE EXCEPTION 'pre-flight failed: expected exactly 3 failing invariants, found % - the ground has moved, re-audit', v_fail;
    END IF;
END
$preflight$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

-- ── 2a. Views: read-only to clients ───────────────────────────────────
-- v_spin_tier_availability is not even auto-updatable (no key-preserving base
-- relation, no INSTEAD OF trigger), so these grants could never have worked.
-- club_memberships IS auto-updatable, and while security_invoker meant RLS
-- still applied, a write path nothing uses is a write path nobody watches.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.club_memberships         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.v_spin_tier_availability FROM anon, authenticated;

-- ── 2b. Backup tables: not a client surface at all ────────────────────
-- One-off snapshots taken during past migrations. Referenced by no
-- application code, they contain user data, and anon could write to them.
-- RLS on with no policies denies every client outright; service_role bypasses
-- RLS, so anything server-side that ever needs them still works.
REVOKE ALL ON public.avatar_photo_migration_backup             FROM anon, authenticated;
REVOKE ALL ON public.commander_finish_position_backup_20260820 FROM anon, authenticated;
REVOKE ALL ON public.horse_avatar_swap_backup                  FROM anon, authenticated;

ALTER TABLE public.avatar_photo_migration_backup             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commander_finish_position_backup_20260820 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horse_avatar_swap_backup                  ENABLE ROW LEVEL SECURITY;

-- spatial_ref_sys belongs to the PostGIS extension, so RLS cannot be enabled
-- on it and it does not need to be - it is a static reference table. What it
-- does not need is anon holding TRUNCATE. SELECT stays: PostGIS clients read it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM anon, authenticated;

-- ── 2c. Server-side functions stop being client-callable ──────────────
-- Each is SECURITY DEFINER, writes rows, and never checks auth.uid(). None is
-- called from a browser. Two are trigger functions, whose triggers fire as the
-- table owner and are unaffected by this.
--
-- FROM PUBLIC IS NOT OPTIONAL, and leaving it out is how the first attempt at
-- this migration failed. Every one of these carries `=X/postgres` in its ACL -
-- a PUBLIC grant - and anon is a member of PUBLIC. Revoking from anon and
-- authenticated alone leaves has_function_privilege('anon', ...) returning
-- true, because the privilege is still arriving by the other route. The
-- post-apply assertion caught it and rolled the whole thing back, which is
-- exactly what those assertions are for: the revocations LOOKED like they
-- worked and the outcome said otherwise.
REVOKE EXECUTE ON FUNCTION public.ca_refresh_stat_distribution(integer)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ensure_upcoming_mtts(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_on_table_status_change()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_club_activity_counts(uuid)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_release_seats_on_tournament_finish()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_seed_horses_to_floor(uuid, numeric)          FROM PUBLIC, anon, authenticated;

-- service_role holds an explicit grant on all six already; these make the
-- three with any plausible server-side future explicit rather than inherited.
GRANT EXECUTE ON FUNCTION public.fn_ensure_upcoming_mtts(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_refresh_club_activity_counts(uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_seed_horses_to_floor(uuid, numeric)          TO service_role;

-- Belt and braces for the one with a live caller: make the grant explicit
-- rather than inherited, so a future REVOKE ... FROM PUBLIC cannot silently
-- take the stats cron down with it.
GRANT EXECUTE ON FUNCTION public.ca_refresh_stat_distribution(integer) TO service_role;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $postcheck$
DECLARE
    v_fail  integer;
    v_names text;
BEGIN
    SELECT COUNT(*) FILTER (WHERE NOT ok),
           string_agg(check_name, ', ') FILTER (WHERE NOT ok)
      INTO v_fail, v_names
      FROM public.economy_invariants();

    IF v_fail > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % invariant(s) still failing: %', v_fail, v_names;
    END IF;

    -- The stats cron must still run. This is the one thing this migration
    -- could plausibly break, so assert it rather than hope.
    IF NOT has_function_privilege('service_role', 'public.ca_refresh_stat_distribution(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: service_role lost EXECUTE on ca_refresh_stat_distribution';
    END IF;

    -- And the client must have genuinely lost it.
    -- All six, not a spot check. The first attempt asserted one function and
    -- would have passed while five others stayed open if the ACLs had differed.
    FOR v_names IN
        SELECT p.oid::regprocedure::text
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('ca_refresh_stat_distribution','fn_ensure_upcoming_mtts',
                             'fn_on_table_status_change','fn_refresh_club_activity_counts',
                             'fn_release_seats_on_tournament_finish','fn_seed_horses_to_floor')
           AND (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    LOOP
        RAISE EXCEPTION 'post-apply failed: a client can still execute %', v_names;
    END LOOP;

    -- Reads were never the target. If a client lost SELECT on the spin view,
    -- the Club Arena spin tier UI goes blank and this migration caused it.
    IF NOT has_table_privilege('authenticated', 'public.v_spin_tier_availability', 'SELECT') THEN
        RAISE EXCEPTION 'post-apply failed: authenticated lost SELECT on v_spin_tier_availability';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.club_memberships', 'SELECT') THEN
        RAISE EXCEPTION 'post-apply failed: authenticated lost SELECT on club_memberships';
    END IF;
END
$postcheck$;

-- ─── 4. SCHEMA-CACHE RELOAD ───────────────────────────────────────────
-- PostgREST caches which functions it exposes. Without this, the revoked
-- functions stay callable through the API until the next restart.
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a NEW _revert_close_the_three_economy_invariants.sql)
-- ═══════════════════════════════════════════════════════════════════════
-- Restoring these re-opens three real holes. Do it only to unblock a
-- production outage, and only after identifying WHICH single grant is
-- actually needed - then restore that one, not all of them.
--
-- BEGIN;
-- GRANT INSERT, UPDATE, DELETE ON public.club_memberships         TO anon, authenticated;
-- GRANT INSERT, UPDATE, DELETE ON public.v_spin_tier_availability TO anon, authenticated;
-- ALTER TABLE public.avatar_photo_migration_backup             DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.commander_finish_position_backup_20260820 DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.horse_avatar_swap_backup                  DISABLE ROW LEVEL SECURITY;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.avatar_photo_migration_backup             TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.commander_finish_position_backup_20260820 TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.horse_avatar_swap_backup                  TO anon, authenticated;
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.ca_refresh_stat_distribution(integer)           TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_ensure_upcoming_mtts(uuid, integer, integer) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_on_table_status_change()                     TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_refresh_club_activity_counts(uuid)           TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_release_seats_on_tournament_finish()         TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_seed_horses_to_floor(uuid, numeric)          TO anon, authenticated;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
