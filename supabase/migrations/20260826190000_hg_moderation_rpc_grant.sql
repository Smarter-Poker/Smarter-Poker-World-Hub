-- ═══════════════════════════════════════════════════════════════════════
-- 20260826190000_hg_moderation_rpc_grant.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (additive: one GRANT, no DDL, no data)
-- AUTHOR:      Claude (horses admin round two)
-- AFFECTS:     grants: EXECUTE on
--                public.fn_get_home_games_onboarding_status_admin(uuid, uuid)
--                to authenticated
-- IRREVERSIBLE: no                            (ROLLBACK section below)
--
-- WHY:
--   /horses/hg-moderation has been completely non-functional in production.
--   Its four tabs are backed by seven RPCs, and five of them open with:
--
--       IF auth.uid() IS NULL OR auth.uid() <> p_caller_user_id THEN
--         RAISE EXCEPTION 'UNAUTHORIZED';
--
--   The API routes called every one of them with the module-level
--   SERVICE-ROLE client. Under the service role auth.uid() is NULL, so all
--   five raised UNAUTHORIZED on every request and the routes converted that
--   into a 500. Reports never listed, appeals never listed, nothing could be
--   resolved, and the GDPR erase path could not run.
--
--   The route-side fix (this same PR) forwards the caller's JWT to those RPCs
--   so auth.uid() resolves to the admin who clicked. The functions are all
--   SECURITY DEFINER and re-check profiles.role internally, so they do not
--   need the service role to read their tables -- only an identity.
--
--   That fix is sufficient for six of the seven. The seventh,
--   fn_get_home_games_onboarding_status_admin, has no EXECUTE grant for
--   `authenticated` at all, so calling it as the user fails with
--   42501 permission denied instead. Verified 2026-08-26:
--
--       proname                                    prosecdef  auth_can_execute
--       fn_anonymize_hg_user_content                  t             t
--       fn_get_home_games_onboarding_status_admin     t            [f]
--       get_home_content_report_detail                t             t
--       list_home_content_reports                     t             t
--       resolve_home_content_report                   t             t
--       review_home_ban_appeal                        t             t
--       list_home_ban_appeals_admin                   f             t
--
--   This migration grants that one missing EXECUTE so the Onboarding tab
--   works like its three siblings.
--
-- SAFETY:
--   The function is SECURITY DEFINER and its FIRST two statements are an
--   auth.uid() identity check followed by a profiles.role check against
--   ('admin','superadmin','god'). Granting EXECUTE to `authenticated`
--   therefore does not widen who can obtain the data -- a non-admin calling it
--   gets FORBIDDEN from inside the function. It only changes the failure mode
--   for admins from "permission denied on the function" to "it runs".
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── PRE-FLIGHT ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count int;
  v_secdef boolean;
  v_src text;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_get_home_games_onboarding_status_admin';

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'PRE-FLIGHT: expected exactly 1 fn_get_home_games_onboarding_status_admin, found %. '
      'An overload would make this GRANT ambiguous -- stop and look.', v_count;
  END IF;

  SELECT p.prosecdef, p.prosrc INTO v_secdef, v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_get_home_games_onboarding_status_admin';

  IF NOT v_secdef THEN
    RAISE EXCEPTION
      'PRE-FLIGHT: fn_get_home_games_onboarding_status_admin is no longer SECURITY DEFINER. '
      'The safety argument for this grant does not hold -- re-review before applying.';
  END IF;

  -- The grant is only safe because the function gates itself. If that guard
  -- is ever removed, this migration must not be the thing that lets everyone in.
  IF v_src NOT LIKE '%auth.uid()%' THEN
    RAISE EXCEPTION
      'PRE-FLIGHT: fn_get_home_games_onboarding_status_admin no longer checks auth.uid(). '
      'Refusing to grant EXECUTE to authenticated.';
  END IF;

  IF v_src NOT LIKE '%superadmin%' THEN
    RAISE EXCEPTION
      'PRE-FLIGHT: fn_get_home_games_onboarding_status_admin no longer checks an admin role list. '
      'Refusing to grant EXECUTE to authenticated.';
  END IF;
END $$;

-- ─── CHANGE ────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION
  public.fn_get_home_games_onboarding_status_admin(uuid, uuid)
  TO authenticated;

-- ─── POST-APPLY ASSERTIONS ─────────────────────────────────────────────
DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') INTO v_ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_get_home_games_onboarding_status_admin';

  IF NOT v_ok THEN
    RAISE EXCEPTION 'POST-APPLY: authenticated still cannot execute the function. Grant did not take.';
  END IF;

  RAISE NOTICE 'POST-APPLY OK: authenticated can now execute fn_get_home_games_onboarding_status_admin.';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════
-- Reverting this re-breaks the Onboarding tab for admins; it does not close
-- any hole, because the function gates itself on auth.uid() + profiles.role.
--
--   BEGIN;
--   REVOKE EXECUTE ON FUNCTION
--     public.fn_get_home_games_onboarding_status_admin(uuid, uuid)
--     FROM authenticated;
--   COMMIT;
-- ═══════════════════════════════════════════════════════════════════════
