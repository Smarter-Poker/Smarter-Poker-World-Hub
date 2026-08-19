-- ============================================================================
-- THE BRIDGE: every in-app notification becomes a push.
-- Applied to production 2026-08-19 via MCP (final state of the trigger).
--
-- THE PROBLEM THIS SOLVES
-- The push gateway (src/lib/notify.js) was fully built, deployed and correct --
-- and NOTHING CALLED IT. The audit found 21 API routes inserting straight into
-- `notifications`, plus DB triggers (fn_notify_friend_request,
-- fn_notify_friend_accepted) producing the only live traffic on the platform:
-- 505 friend_request rows in 45 days. Every one bypassed push. A user who
-- enabled notifications would have received nothing, ever.
--
-- Rewriting 21 call sites plus the trigger functions would be invasive and
-- would still miss the next writer someone adds. Instead the DATABASE is the
-- single source of truth: any row landing in `notifications`, from any writer,
-- is mirrored into push_outbox and delivered by the dispatch cron.
--
-- SAFETY
--  * Preferences are enforced at SEND time by push-dispatch via
--    src/lib/push/push-gate.js, so mirrored rows are fully subject to mute_all,
--    push_enabled, per-type prefs, the legacy user_notification_preferences
--    columns, quiet hours and the daily cap.
--  * notify() stamps data->>'_push' ('inline' when it is handling the push
--    itself, 'none' when the caller passed withPush:false). ANY marker means
--    the JS layer already decided, so the mirror keeps its hands off. Without
--    the 'none' case this would push exactly the notifications a feature
--    deliberately marked silent -- including push-health's own "push is not
--    reaching you" alerts.
--  * The insert is exception-guarded: a push_outbox problem must never roll
--    back the notification the user is entitled to see in the bell.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mirror_notification_to_push_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- The JS gateway already decided about push for this row.
  IF NEW.data IS NOT NULL AND (NEW.data ->> '_push') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL OR NEW.title IS NULL OR btrim(NEW.title) = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.push_outbox (
      recipient_user_id, title, body, url, event, tag, status, related_entity_id
    )
    VALUES (
      NEW.user_id,
      left(NEW.title, 120),
      left(COALESCE(NEW.message, NEW.title), 500),
      COALESCE(NULLIF(btrim(NEW.link), ''), NULLIF(btrim(NEW.action_url), ''), '/hub'),
      NEW.type,
      -- Per type+user, so a burst of the same kind collapses on the lock screen
      -- instead of stacking twenty identical banners.
      NEW.type || ':' || NEW.user_id::text,
      'pending',
      NEW.id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mirror_notification_to_push_outbox failed for notification %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_mirror_notification_to_push_outbox ON public.notifications;
CREATE TRIGGER trg_mirror_notification_to_push_outbox
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_mirror_notification_to_push_outbox();

-- ---- assertions ------------------------------------------------------------
DO $$
DECLARE v_user uuid; v_notif uuid; v_n int;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (v_user, 'system', 'mirror assert', 'b', '/hub/x') RETURNING id INTO v_notif;
  SELECT count(*) INTO v_n FROM public.push_outbox WHERE related_entity_id = v_notif;
  IF v_n <> 1 THEN RAISE EXCEPTION 'unmarked row not mirrored (%)', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_outbox
                 WHERE related_entity_id = v_notif AND url = '/hub/x'
                   AND event = 'system' AND status = 'pending') THEN
    RAISE EXCEPTION 'mirrored row has wrong url/event/status';
  END IF;
  DELETE FROM public.push_outbox WHERE related_entity_id = v_notif;
  DELETE FROM public.notifications WHERE id = v_notif;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (v_user, 'system', 'none assert', 'b', '{"_push":"none"}'::jsonb) RETURNING id INTO v_notif;
  SELECT count(*) INTO v_n FROM public.push_outbox WHERE related_entity_id = v_notif;
  IF v_n <> 0 THEN RAISE EXCEPTION '_push=none was mirrored (%)', v_n; END IF;
  DELETE FROM public.notifications WHERE id = v_notif;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (v_user, 'system', 'inline assert', 'b', '{"_push":"inline"}'::jsonb) RETURNING id INTO v_notif;
  SELECT count(*) INTO v_n FROM public.push_outbox WHERE related_entity_id = v_notif;
  IF v_n <> 0 THEN RAISE EXCEPTION '_push=inline was mirrored (%)', v_n; END IF;
  DELETE FROM public.notifications WHERE id = v_notif;
END $$;

-- ROLLBACK
-- DROP TRIGGER IF EXISTS trg_mirror_notification_to_push_outbox ON public.notifications;
-- DROP FUNCTION IF EXISTS public.fn_mirror_notification_to_push_outbox();
