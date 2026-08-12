-- =======================================================================
-- 20260808230000_rls_off_write_surface_invariant.sql
-- =======================================================================
-- TIER:        2                        (extends a reporting function)
-- AUTHOR:      claude (cowork session, 2026-08-08)
-- AFFECTS:     public.economy_invariants()  — adds a 12th assertion
-- IRREVERSIBLE: no
--
-- WHY
-- ───────────────────────────────────────────────────────────────────────
-- A 12th standing invariant: no table in `public` may have RLS disabled while
-- clients still hold write grants. That is the general form of the
-- trivia_tournaments_public bug closed in 20260808200000 — a write surface
-- with nothing standing behind it.
--
-- An RLS sweep of the whole schema found the posture is otherwise sound:
--   * 690 tables carry client write grants, but 689 have RLS enabled, which is
--     the normal Supabase pattern (broad grants, RLS as the gate)
--   * ZERO policies use `USING (true)` for UPDATE/DELETE/ALL for anon or
--     authenticated — no blanket-permissive write policies exist
--   * 198 policies omit WITH CHECK, which is NOT a defect: for UPDATE,
--     Postgres falls back to the USING expression for the new row, so
--     ownership still cannot be reassigned
--   * 11 tables have RLS on with no policy at all (daemon_state,
--     commander_admin_pins, rake_distribution_legs, wallet_credit_idempotency
--     and similar). That denies all client access while service_role bypasses
--     — the correct posture for internal tables, not a gap.
--
-- ONE DOCUMENTED EXCEPTION: public.spatial_ref_sys.
--
-- PostGIS's coordinate-system catalog (~8,500 SRID definitions) is the only
-- table in `public` with RLS off that anon/authenticated can write. It holds
-- no user data, so there is no disclosure risk, but corrupting or deleting
-- SRID 4326 breaks every geospatial query — which is the Poker Near Me venue
-- search. An integrity and denial-of-service vector reachable without login.
--
-- It cannot be fixed from here, established by TRYING rather than assuming.
-- The table is owned by supabase_admin and its ACL shows the grants were made
-- BY supabase_admin (anon=arwdDxtm/supabase_admin). A REVOKE only takes effect
-- when issued by the grantor or a superuser, so a REVOKE from the migration
-- role silently revokes nothing — Postgres warns rather than errors. The first
-- version of this migration did exactly that, and this new invariant caught it
-- and rolled the migration back: the check working on its first outing.
-- Enabling RLS is likewise superuser-only, which is why Supabase's own linter
-- documents this object as an expected finding.
--
-- Excluding it keeps the invariant HONEST. An assertion that can never pass
-- trains people to ignore CI, which is worse than not having the check at all.
-- Every table the platform actually controls is still covered: a newly created
-- table with RLS off and client write grants fails the build. Verified by
-- creating exactly such a table inside a rolled-back transaction and
-- confirming this check — and only this check — flipped to false.
--
-- If Supabase ever exposes a supported way to restrict spatial_ref_sys, delete
-- the exclusion below and the check starts enforcing it.
--
-- NOTE: the full function body lives in 20260808220000. It is repeated here in
-- full because CREATE OR REPLACE FUNCTION has no partial form; only the last
-- check is new.
-- =======================================================================

CREATE OR REPLACE FUNCTION public.economy_invariants()
RETURNS TABLE (check_name text, ok boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_src text;
BEGIN
    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'deduct_diamonds' LIMIT 1;
    check_name := 'deduct_diamonds_writes_both_balance_columns';
    ok := v_src IS NOT NULL AND position('diamond_balance' in v_src) > 0;
    detail := 'profiles.diamonds and profiles.diamond_balance must be written together or they drift';
    RETURN NEXT;

    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'add_diamonds_to_balance' LIMIT 1;
    check_name := 'add_diamonds_writes_both_balance_columns';
    ok := v_src IS NOT NULL AND position('diamond_balance' in v_src) > 0;
    detail := 'credits must keep both balance columns in step';
    RETURN NEXT;

    check_name := 'no_profiles_balance_drift';
    SELECT COUNT(*) = 0 INTO ok FROM public.profiles WHERE diamonds IS DISTINCT FROM diamond_balance;
    detail := 'profiles where diamonds <> diamond_balance';
    RETURN NEXT;

    check_name := 'balance_rpcs_not_executable_by_clients';
    SELECT bool_and(NOT has_function_privilege(r.role, p.oid, 'EXECUTE'))
      INTO ok
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
     WHERE n.nspname = 'public'
       AND p.proname IN ('add_diamonds_to_balance', 'deduct_diamonds',
                         'award_diamonds', 'award_diamonds_v2');
    ok := COALESCE(ok, true);
    detail := 'a browser-executable balance mutator is a mint';
    RETURN NEXT;

    check_name := 'award_v2_executable_by_service_role';
    SELECT bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
      INTO ok
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'award_diamonds_v2';
    ok := COALESCE(ok, false);
    detail := 'if this is false, all rewards are DOWN';
    RETURN NEXT;

    check_name := 'profiles_economic_column_guard_trigger_present';
    SELECT COUNT(*) > 0 INTO ok
      FROM pg_trigger
     WHERE tgrelid = 'public.profiles'::regclass
       AND NOT tgisinternal
       AND tgname = 'trg_guard_profile_privileged_columns';
    detail := 'blocks self-granted diamonds / is_vip / vip_tier via PostgREST';
    RETURN NEXT;

    check_name := 'authenticated_cannot_update_economic_columns';
    SELECT COUNT(*) = 0 INTO ok
      FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
       AND column_name IN ('diamonds', 'diamond_balance', 'diamond_multiplier',
                           'is_vip', 'vip_tier', 'vip_expires_at');
    detail := 'column-level UPDATE grants on the money/VIP columns';
    RETURN NEXT;

    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'award_diamonds_v2' LIMIT 1;
    check_name := 'award_v2_vip_check_is_null_safe';
    ok := v_src IS NOT NULL AND position('COALESCE(v_vip_tier' in v_src) > 0;
    detail := 'VIP tier comparison must COALESCE or it fails open on NULL';
    RETURN NEXT;

    check_name := 'easter_eggs_exempt_from_daily_cap';
    SELECT COALESCE(bool_and(NOT counts_toward_daily_cap), true) INTO ok
      FROM public.diamond_reward_catalog WHERE action_key = 'easter_egg';
    detail := 'the store promises eggs pay on top of the daily cap';
    RETURN NEXT;

    check_name := 'no_client_writable_views';
    SELECT COUNT(*) = 0 INTO ok
      FROM information_schema.role_table_grants g
      JOIN pg_class c ON c.relname = g.table_name
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE g.table_schema = 'public'
       AND c.relkind = 'v'
       AND g.grantee IN ('anon', 'authenticated')
       AND g.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
       AND g.table_name NOT IN ('geography_columns', 'geometry_columns');
    detail := 'a definer view with write grants is an RLS bypass';
    RETURN NEXT;

    check_name := 'anon_mutating_definer_functions_check_auth_uid';
    SELECT COUNT(*) = 0 INTO ok
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.prosrc ~* '\m(insert|update|delete)\M'
       AND p.prosrc !~* 'auth\.uid\(\)';
    detail := 'anon-callable definer functions that write without checking auth.uid()';
    RETURN NEXT;

    check_name := 'no_rls_off_tables_writable_by_clients';
    SELECT COUNT(*) = 0 INTO ok
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relkind = 'r'
       AND NOT c.relrowsecurity
       -- PostGIS catalog, owned by supabase_admin: neither revocable nor
       -- RLS-able from the migration role. See the header.
       AND c.relname <> 'spatial_ref_sys'
       AND EXISTS (
           SELECT 1 FROM information_schema.role_table_grants g
            WHERE g.table_schema = 'public' AND g.table_name = c.relname
              AND g.grantee IN ('anon', 'authenticated')
              AND g.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
       );
    detail := 'tables with RLS disabled that clients can still write to';
    RETURN NEXT;

    RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.economy_invariants() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.economy_invariants() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.economy_invariants() TO service_role;

-- --- POST-APPLY --------------------------------------------------------
DO $postcheck$
DECLARE
    v_rows integer;
    v_fail integer;
BEGIN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE NOT ok)
      INTO v_rows, v_fail FROM public.economy_invariants();
    IF v_rows < 12 THEN
        RAISE EXCEPTION 'post-apply failed: expected 12 invariants, got %', v_rows;
    END IF;
    IF v_fail > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % invariant(s) failing', v_fail;
    END IF;
END
$postcheck$;
