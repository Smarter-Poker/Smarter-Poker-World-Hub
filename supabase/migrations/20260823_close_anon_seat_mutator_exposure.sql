-- ═══════════════════════════════════════════════════════════════════════
-- 20260823_close_anon_seat_mutator_exposure.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Claude (Cowork)
-- AFFECTS:      EXECUTE grants on four public functions. No table data.
-- IRREVERSIBLE: no
--
-- WHY:
--   CHECK 10 (Diamond economy invariants) fails the Build Safety Gate on
--       anon_mutating_definer_functions_check_auth_uid
--   which asks: is there a SECURITY DEFINER function that `anon` may execute,
--   that writes, and that never consults auth.uid()? There were four:
--
--     fn_bust_player_from_table(p_table_id, p_user_id)
--     fn_clear_table_seats(p_table_id, p_reopen)
--     fn_repair_seat_first_games(p_limit)
--     fn_sync_seat_first_player_count(p_tournament_id)
--
--   SECURITY DEFINER means they run as the owner, so RLS does not apply.
--   `anon` means no session is required. Together, an unauthenticated request
--   carrying only the publishable key could call
--       fn_bust_player_from_table(<any table>, <any player>)
--   and knock a stranger out of a live game, or fn_clear_table_seats to empty
--   a table outright. Neither checks who is asking, because when they were
--   written nothing outside the server was ever going to call them.
--
--   This is why the gate exists and why it must stay red until it is true.
--   It is NOT a regression from the 2026-08-23 economy work; it was surfaced
--   by that work because CHECK 10 blocked the PR carrying it. Earlier sweeps
--   (20260819_revoke_anon_exec_mutating_definer_fns,
--   20260821g_close_agent_commission_anon_exposure) missed these four.
--
-- HOW:
--   Revoke EXECUTE from anon and authenticated. service_role keeps it, which
--   is the only caller these have ever had: a search across pages/, src/,
--   scripts/ and the built client bundles in public/ finds zero references to
--   any of the four. Nothing in a browser calls them, so nothing breaks.
--
--   Revoking rather than adding an auth.uid() check, on purpose. These are
--   operator and repair routines; the correct caller is the service role, and
--   an ownership check inside a function nobody should reach is a weaker
--   guarantee than not being reachable.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. PRE-FLIGHT ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE
    v_exposed integer;
BEGIN
    SELECT count(*) INTO v_exposed
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.prosrc ~* '\m(insert|update|delete)\M'
       AND p.prosrc !~* 'auth\.uid\(\)';

    IF v_exposed = 0 THEN
        RAISE EXCEPTION 'pre-flight failed: no anon-exposed mutating definer functions — already closed';
    END IF;

    RAISE NOTICE 'pre-flight: % anon-exposed mutating definer function(s)', v_exposed;
END $$;

-- ── 2. THE ACTUAL CHANGES ───────────────────────────────────────────────
--
-- FROM PUBLIC, not just FROM anon. Three of the four carry EXECUTE through
-- the PUBLIC pseudo-role, which is Postgres's default for every new function.
-- Revoking from `anon` alone changes nothing there: has_function_privilege
-- still answers true because anon inherits from PUBLIC. Revoking anon only
-- and calling it closed is precisely how these four survived two earlier
-- anon-exposure sweeps.
--
-- Revoking PUBLIC also takes the privilege away from service_role, so it is
-- granted back explicitly below. Explicit is what we want anyway: the grant
-- then states who may call these, rather than leaving it to a default.
REVOKE EXECUTE ON FUNCTION public.fn_bust_player_from_table(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_clear_table_seats(uuid, boolean)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_repair_seat_first_games(integer)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_seat_first_player_count(uuid)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_bust_player_from_table(uuid, uuid)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_clear_table_seats(uuid, boolean)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_repair_seat_first_games(integer)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_sync_seat_first_player_count(uuid)
    TO service_role;

-- ── 3. POST-APPLY ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE
    v_exposed integer;
    v_svc     boolean;
    v_inv     boolean;
BEGIN
    SELECT count(*) INTO v_exposed
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.prosrc ~* '\m(insert|update|delete)\M'
       AND p.prosrc !~* 'auth\.uid\(\)';
    IF v_exposed > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % still anon-callable and mutating', v_exposed;
    END IF;

    -- The server must keep working.
    SELECT bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
      INTO v_svc
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('fn_bust_player_from_table', 'fn_clear_table_seats',
                         'fn_repair_seat_first_games', 'fn_sync_seat_first_player_count');
    IF NOT COALESCE(v_svc, false) THEN
        RAISE EXCEPTION 'post-apply failed: service_role lost EXECUTE on a seat routine';
    END IF;

    -- And the gate this exists to satisfy must now pass.
    SELECT ok INTO v_inv FROM public.economy_invariants()
     WHERE check_name = 'anon_mutating_definer_functions_check_auth_uid';
    IF NOT COALESCE(v_inv, false) THEN
        RAISE EXCEPTION 'post-apply failed: economy_invariants still reports the anon exposure';
    END IF;

    RAISE NOTICE 'post-apply OK: 0 anon-exposed mutators, service_role intact, CHECK 10 green';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if a real client caller is discovered)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.fn_bust_player_from_table(uuid, uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_clear_table_seats(uuid, boolean) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_repair_seat_first_games(integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_sync_seat_first_player_count(uuid) TO authenticated;
-- COMMIT;
-- Do NOT re-grant to anon. If an authenticated client genuinely needs one of
-- these, give the function an auth.uid() ownership check in the same change,
-- or CHECK 10 will simply go red again -- correctly.
