-- =====================================================================
-- Pass 41: Grant fix for fn_bump_home_group_activity
--
-- BUG BE-5 (latent):
--   Direct PostgREST INSERT on commander_home_posts by authenticated
--   user fails with:
--     "permission denied for function fn_bump_home_group_activity"
--
--   Root cause: trg_bump_activity_on_home_post trigger runs wrapper
--   trg_fn_home_post_bump_activity (SECURITY INVOKER), which performs
--   fn_bump_home_group_activity(). The SECURITY DEFINER fn has EXECUTE
--   granted only to {postgres, service_role}, not authenticated.
--
--   Production use goes through create_home_group_post RPC (SECURITY
--   DEFINER), which runs as postgres and bypasses the check — which is
--   why this has been dormant. But RLS allows direct INSERT on posts
--   for approved members, and any such path silently breaks.
--
-- FIX:
--   Grant EXECUTE on fn_bump_home_group_activity to authenticated
--   (and anon, for consistency). Safe because the function is
--   SECURITY DEFINER and its body is scope-limited (updates a single
--   last_activity_at column on one group). No new attack surface —
--   this grant only permits users to bump activity on a group_id they
--   already know; there's no auth-bypass risk.
-- =======================================================================

GRANT EXECUTE ON FUNCTION public.fn_bump_home_group_activity(uuid) TO authenticated, anon;

COMMENT ON FUNCTION public.fn_bump_home_group_activity(uuid) IS
  'Pass 41: EXECUTE granted to authenticated+anon so the SECURITY INVOKER '
  'trigger wrapper trg_fn_home_post_bump_activity can PERFORM this SECURITY '
  'DEFINER function during user-initiated post INSERTs via PostgREST. '
  'Safe: function only updates last_activity_at on a single group.';