-- ═══════════════════════════════════════════════════════════════════════
-- 20260823_close_anon_exposure_fn_seat_late_registrant.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Claude (Cowork)
-- AFFECTS:      EXECUTE grants on one function. No data, no schema.
-- IRREVERSIBLE: no
--
-- WHY:
--   CHECK 10's `anon_mutating_definer_functions_check_auth_uid` went red again
--   hours after 20260823_close_anon_seat_mutator_exposure cleared it. The
--   offender is new: `fn_seat_late_registrant(uuid, uuid)`, shipped today with
--   the seat-first-count work.
--
--   SECURITY DEFINER, so RLS does not apply. Granted to `anon`, so no session
--   is required. It writes. It never consults auth.uid(). An unauthenticated
--   request holding only the publishable key could seat ANY user into ANY
--   tournament.
--
--   Same shape as the four functions closed earlier today — which is the
--   point. The invariant caught the regression the same day it appeared, on
--   an unrelated PR, which is exactly the job it exists to do.
--
-- HOW:
--   Revoke from PUBLIC and anon. `authenticated` KEEPS execute: this is a
--   seating routine a signed-in client may legitimately drive, and the
--   invariant is specifically about anonymous reachability. service_role is
--   granted explicitly so revoking PUBLIC cannot strip the engine.
--
--   FOR WHOEVER OWNS THIS FUNCTION: it still takes p_user_id from the caller
--   without checking it against auth.uid(), so an authenticated player can
--   pass someone else's id and seat them. That is an ownership check the
--   function should grow. Revoking anon closes the unauthenticated hole
--   today; it does not make the function safe against a hostile signed-in
--   client.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. PRE-FLIGHT ASSERTIONS ────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='fn_seat_late_registrant'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: fn_seat_late_registrant not found';
    END IF;
    IF NOT has_function_privilege('anon','public.fn_seat_late_registrant(uuid,uuid)','EXECUTE') THEN
        RAISE EXCEPTION 'pre-flight failed: anon already lacks EXECUTE — re-audit';
    END IF;
END $$;

-- ── 2. THE ACTUAL CHANGES ───────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_seat_late_registrant(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_seat_late_registrant(uuid, uuid) TO service_role, authenticated;

-- ── 3. POST-APPLY ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE v_inv boolean; v_exposed integer;
BEGIN
    IF has_function_privilege('anon','public.fn_seat_late_registrant(uuid,uuid)','EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: anon still holds EXECUTE';
    END IF;
    IF NOT has_function_privilege('service_role','public.fn_seat_late_registrant(uuid,uuid)','EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: service_role lost EXECUTE';
    END IF;

    SELECT count(*) INTO v_exposed
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.prosrc ~* '\m(insert|update|delete)\M'
       AND p.prosrc !~* 'auth\.uid\(\)';
    IF v_exposed > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % anon-callable mutating definer fn(s) remain', v_exposed;
    END IF;

    SELECT ok INTO v_inv FROM public.economy_invariants()
     WHERE check_name = 'anon_mutating_definer_functions_check_auth_uid';
    IF NOT COALESCE(v_inv, false) THEN
        RAISE EXCEPTION 'post-apply failed: economy_invariants still red';
    END IF;

    RAISE NOTICE 'post-apply OK: anon exposure closed, CHECK 10 green';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if a genuine anonymous caller is discovered — there is none
-- in src/ or server/src/ today)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.fn_seat_late_registrant(uuid, uuid) TO anon;
-- COMMIT;
-- Do not run this without ALSO adding an auth.uid() ownership check, or
-- CHECK 10 will go red again — correctly.
