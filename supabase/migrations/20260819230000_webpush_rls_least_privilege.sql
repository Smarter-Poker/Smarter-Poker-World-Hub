-- ============================================================================
-- WEB PUSH RLS -- least privilege. Applied to production 2026-08-19 via MCP.
--
-- FINDING 1: push_subscriptions granted authenticated users ALL (including
-- INSERT and UPDATE) on their own rows. Because a row is "theirs" by user_id, a
-- user could write an arbitrary `endpoint` into their own row -- including
-- another person's device endpoint -- and their notifications would then be
-- delivered to that device. Not a data leak, but a real harassment vector, and
-- it bypasses the one-account-per-device enforcement that only
-- /api/push/subscribe performs.
--
-- Verified before removing: nothing client-side writes this table. Only
-- pages/api/** and src/lib/push/** reference it, all through the service-role
-- client, which bypasses RLS entirely.
--
-- FINDING 2: the push stack added an ALL policy to notification_preferences on
-- top of three pre-existing policies that already covered SELECT/INSERT/UPDATE.
-- The redundant policy silently also granted DELETE, which nothing needs.
-- ============================================================================

DROP POLICY IF EXISTS "user manages own push subs" ON public.push_subscriptions;

-- Users may SEE their own devices (a "your devices" UI can be built on this).
DROP POLICY IF EXISTS "user reads own push subs" ON public.push_subscriptions;
CREATE POLICY "user reads own push subs" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users may revoke their own device even if the API is unavailable.
DROP POLICY IF EXISTS "user deletes own push subs" ON public.push_subscriptions;
CREATE POLICY "user deletes own push subs" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Deliberately NO INSERT/UPDATE policy: creating or mutating a subscription is
-- the exclusive job of /api/push/subscribe and /api/push/rotate, which run as
-- service_role, validate the payload and enforce one-account-per-device.

DROP POLICY IF EXISTS "user manages own notification prefs" ON public.notification_preferences;

DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(policyname, ', ') INTO v_bad
  FROM pg_policies
  WHERE schemaname='public' AND tablename='push_subscriptions' AND cmd IN ('INSERT','UPDATE','ALL');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'push_subscriptions still has write policies: %', v_bad;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
             AND tablename='notification_preferences'
             AND policyname='user manages own notification prefs') THEN
    RAISE EXCEPTION 'redundant notification_preferences ALL policy was not dropped';
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename='notification_preferences') < 3 THEN
    RAISE EXCEPTION 'notification_preferences lost policies the settings UI needs';
  END IF;
END $$;

-- ROLLBACK
-- CREATE POLICY "user manages own push subs" ON public.push_subscriptions
--   FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- CREATE POLICY "user manages own notification prefs" ON public.notification_preferences
--   FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
