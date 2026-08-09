-- =======================================================================
-- 20260808220000_economy_invariants_function.sql
-- =======================================================================
-- TIER:        2                          (additive: one reporting function)
-- AUTHOR:      claude (cowork session, 2026-08-08)
-- AFFECTS:     new function public.economy_invariants()
-- IRREVERSIBLE: no
--
-- WHY
-- ───────────────────────────────────────────────────────────────────────
-- Every defect fixed in this session was invisible because nothing ever
-- asserted the property it broke. Each one was found by a human-driven audit,
-- which does not scale and does not run on Tuesday:
--
--   * deduct_diamonds wrote one balance column while every credit wrote two
--   * award_diamonds_v2's VIP guard failed OPEN on NULL, handing the VIP
--     earning ceiling to 470 accounts that never paid
--   * easter_egg counted toward the daily cap, so legendary eggs were
--     clamped and the excess destroyed
--   * a public view carried write grants to anon, allowing unauthenticated
--     UPDATEs of tournament prize pools
--   * the balance RPCs were revoked from `authenticated` and the browser
--     kept calling them, so paid features silently failed for days
--
-- This function turns all of those into standing assertions. It is called by
-- scripts/check-economy-invariants.mjs, which the Build Safety Gate runs on
-- every push (CHECK 10). A regression now fails CI instead of waiting to be
-- noticed in an audit.
--
-- Each row is (check_name, ok, detail). CI fails if ANY row has ok = false.
-- Add a row here whenever a new economic invariant is established; that is
-- cheaper than rediscovering it.
--
-- SECURITY: SECURITY DEFINER so it can read pg_proc / pg_class / information_
-- schema, EXECUTE granted to service_role only. It returns no user data —
-- only boolean facts about schema shape — but it is not a public surface.
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
    -- ── 1. Both balance columns move together ─────────────────────────────
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

    -- ── 2. The balance mutators stay server-only ──────────────────────────
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

    -- ── 3. Users cannot grant themselves money or VIP ─────────────────────
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

    -- ── 4. The VIP ceiling guard is NULL-safe ─────────────────────────────
    -- `NULL = 'lifetime'` is NULL, not false, so an unguarded comparison makes
    -- the downgrade IF never fire and hands the VIP ceiling to every profile
    -- with a stray is_vip flag. This cost 470 accounts' worth of ceiling.
    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'award_diamonds_v2' LIMIT 1;
    check_name := 'award_v2_vip_check_is_null_safe';
    ok := v_src IS NOT NULL AND position('COALESCE(v_vip_tier' in v_src) > 0;
    detail := 'VIP tier comparison must COALESCE or it fails open on NULL';
    RETURN NEXT;

    -- ── 5. Easter eggs sit OUTSIDE the daily cap ──────────────────────────
    -- If this flips true, legendary eggs are clamped to the daily remainder
    -- and the excess is destroyed while the reference_id is burned.
    check_name := 'easter_eggs_exempt_from_daily_cap';
    SELECT COALESCE(bool_and(NOT counts_toward_daily_cap), true) INTO ok
      FROM public.diamond_reward_catalog WHERE action_key = 'easter_egg';
    detail := 'the store promises eggs pay on top of the daily cap';
    RETURN NEXT;

    -- ── 6. No API-exposed view accepts writes from clients ────────────────
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

    -- ── 7. Anon-callable mutating SECURITY DEFINER functions must gate ────
    -- Every such function must reference auth.uid(); one that trusts a
    -- parameter instead is an unauthenticated write primitive.
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

    RETURN;
END;
$$;

COMMENT ON FUNCTION public.economy_invariants() IS
    'Standing assertions for the diamond economy. Called by scripts/check-economy-invariants.mjs in CI (CHECK 10). Any row with ok=false is a regression.';

REVOKE EXECUTE ON FUNCTION public.economy_invariants() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.economy_invariants() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.economy_invariants() TO service_role;

-- --- POST-APPLY --------------------------------------------------------
DO $postcheck$
DECLARE
    v_fail integer;
    v_rows integer;
BEGIN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE NOT ok)
      INTO v_rows, v_fail
      FROM public.economy_invariants();

    IF v_rows < 11 THEN
        RAISE EXCEPTION 'post-apply failed: expected at least 11 invariants, got %', v_rows;
    END IF;

    -- The function must be able to report a clean bill of health right now;
    -- if it cannot, either an invariant is genuinely broken or the check is
    -- miswritten, and both need to be dealt with before this lands.
    IF v_fail > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % invariant(s) already failing', v_fail;
    END IF;

    IF has_function_privilege('authenticated', 'public.economy_invariants()', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: authenticated can EXECUTE economy_invariants';
    END IF;
END
$postcheck$;
