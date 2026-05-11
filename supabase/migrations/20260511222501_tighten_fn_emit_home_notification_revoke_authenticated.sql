-- Dan-fix/audit (2026-05-11 follow-up): the earlier migration granted EXECUTE
-- on fn_emit_home_notification to `authenticated` to unblock the trigger cascade.
-- But with SECURITY DEFINER, that grant creates a real abuse vector — any
-- logged-in user can directly call this fn with arbitrary args and spam
-- notifications to any user's inbox (verified via probe).
--
-- The cascade works WITHOUT the authenticated grant because
-- fn_notify_friends_of_home_join was made SECURITY DEFINER in the same
-- migration. When the trigger fires:
--   1. Table engine invokes fn_notify_friends_of_home_join (no EXECUTE check)
--   2. SECDEF on that fn means body runs as postgres (the owner)
--   3. Inner PERFORM of fn_emit_home_notification checks EXECUTE for postgres
--   4. postgres is the owner → has EXECUTE → call succeeds
--
-- Keep SECDEF on both, REVOKE the unnecessary direct-call grant.

REVOKE EXECUTE ON FUNCTION public.fn_emit_home_notification(uuid, text, text, text, text, jsonb, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_notify_friends_of_home_join() FROM authenticated;
