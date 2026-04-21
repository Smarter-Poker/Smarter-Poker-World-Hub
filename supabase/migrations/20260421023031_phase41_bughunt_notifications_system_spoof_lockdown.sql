-- =====================================================================
-- Pass 47 (BL-1): Seal cross-user "system notification" spoofing vector
--
-- BUG (verified live, user_a inserted row into user_b's feed):
--   Policy `notifications_insert_system` with with_check = `type = 'system'`
--   is scoped to PUBLIC roles (authenticated + anon) and has NO binding
--   between NEW.user_id and auth.uid(). Any authenticated user (or anon
--   caller via the public API key) can INSERT a notification with
--   type='system' into ANY other user's feed, with arbitrary title,
--   message, link, and data payload.
--
--   This is a phishing vector: fake "Your account has been flagged, click
--   here" system-branded notifications appearing in a victim's feed
--   indistinguishable from legitimate platform notifications.
--
-- ROOT CAUSE:
--   Policy was introduced in an old migration (now archived) as a stopgap
--   for client-side system-notification writes. Source audit shows zero
--   live callers — every legitimate `type='system'` insert goes through
--   supabaseAdmin / getSupabaseAdmin() (service_role). The remaining
--   `type: 'system'` hits in source are in-memory React chat-message
--   objects, NOT notifications rows. The public policy is orphaned.
--
-- FIX:
--   DROP policy `notifications_insert_system` entirely. Server code
--   continues to INSERT system notifications via service_role (covered
--   by "Service role inserts" policy). Users retain ability to INSERT
--   into their own feed via `notifications_insert_own` (user_id =
--   auth.uid()).
-- =====================================================================

DROP POLICY IF EXISTS "notifications_insert_system" ON public.notifications;

-- Defensive re-assertion: the remaining INSERT policies are what we want.
-- No-op DO block to make the state explicit in migration history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    WHERE c.relname = 'notifications'
      AND pol.polname = 'notifications_insert_system'
  ) THEN
    RAISE EXCEPTION 'BL-1 fix failed: notifications_insert_system still present';
  END IF;
END $$;