-- ═══════════════════════════════════════════════════════════════════════
-- TIER 2 (additive: one GRANT)
-- APPLIED TO PRODUCTION 2026-08-26.
--
-- The same fault as the fn_is_platform_admin grant, on three more tables --
-- and FOUND BY THE CI CHECK WRITTEN IMMEDIATELY AFTER IT, on its first run.
--
-- `disputes`, `settlement_invoices` and `settlement_locks` each carry a SELECT
-- policy calling public.fn_is_club_admin_uid(uuid), and `authenticated` had no
-- EXECUTE on it. Postgres does not short-circuit the OR in a policy, so the
-- privilege error fired for every caller. Verified as the `authenticated` role
-- inside a rolled-back transaction:
--
--   SELECT count(*) FROM disputes            -> permission denied for function fn_is_club_admin_uid
--   SELECT count(*) FROM settlement_invoices -> permission denied for function fn_is_club_admin_uid
--   SELECT count(*) FROM settlement_locks    -> permission denied for function fn_is_club_admin_uid
--
-- `disputes` is player-facing: a player could not read their own dispute.
--
-- WHY THE GRANT IS SAFE. The whole function is:
--
--   SELECT EXISTS (
--     SELECT 1 FROM public.club_members cm
--     WHERE cm.club_id = p_club_id
--       AND cm.user_id = auth.uid()
--       AND cm.role IN ('owner','admin','manager')
--       AND COALESCE(cm.status,'active') = 'active');
--
-- STABLE, SECURITY DEFINER, search_path pinned. It answers one question --
-- "is the CALLER a club admin of this club" -- about the caller's own
-- membership. It returns no data and grants no access on its own.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE v_count int; v_secdef boolean; v_src text;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_is_club_admin_uid';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'PRE-FLIGHT: expected exactly 1 fn_is_club_admin_uid, found %.', v_count;
  END IF;

  SELECT p.prosecdef, p.prosrc INTO v_secdef, v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_is_club_admin_uid';

  IF NOT v_secdef THEN
    RAISE EXCEPTION 'PRE-FLIGHT: fn_is_club_admin_uid is no longer SECURITY DEFINER.';
  END IF;
  IF v_src NOT LIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'PRE-FLIGHT: fn_is_club_admin_uid no longer keys on auth.uid(). Refusing to grant.';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_is_club_admin_uid(uuid) TO authenticated;

DO $$
DECLARE v_ok boolean; v_gaps int;
BEGIN
  SELECT has_function_privilege('authenticated','public.fn_is_club_admin_uid(uuid)','EXECUTE') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'POST-APPLY: grant did not take.'; END IF;

  -- The whole point: the CI check must now come back clean.
  SELECT count(*) INTO v_gaps FROM public.fn_policy_function_grant_gaps();
  IF v_gaps > 0 THEN
    RAISE EXCEPTION 'POST-APPLY: % policy/function/role gap(s) remain.', v_gaps;
  END IF;

  RAISE NOTICE 'POST-APPLY OK: no policy calls a function its own role cannot execute.';
END $$;

COMMIT;

-- ROLLBACK -- re-breaks disputes, settlement_invoices and settlement_locks.
--   BEGIN;
--   REVOKE EXECUTE ON FUNCTION public.fn_is_club_admin_uid(uuid) FROM authenticated;
--   COMMIT;
