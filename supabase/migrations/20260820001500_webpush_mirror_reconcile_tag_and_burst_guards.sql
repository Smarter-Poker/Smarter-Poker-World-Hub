-- ============================================================================
-- MIRROR TRIGGER -- reconcile two concurrent improvements.
-- Applied to production 2026-08-20 via Supabase MCP.
--
-- Two agents improved this function independently and the second rewrite
-- silently dropped the first's guards. Verified against the LIVE function
-- before writing this, not assumed:
--     has_refined_tag = true, has_per_user_cap = false, has_staleness_guard = false
--
-- KEEP (the other agent's) -- the refined tag. The original `type:user_id` for
-- everything was wrong: two different friend requests would share a tag and
-- REPLACE each other on the lock screen, so a user would only ever see the most
-- recent one. This version collapses only the types where just the newest item
-- matters, and keys everything else on conversation -> actor -> row id so
-- distinct events stay individually visible.
--
-- RESTORE (mine) -- burst protection. Measured from production history, rows
-- created in a SINGLE SECOND: 1,682 friend_accept / 997
-- home_group_friend_joined / 721 friend_accept. Those are backfills, not
-- organic traffic. Without these two guards the next one is a mass-push
-- incident: thousands of phones buzzing about events that already happened.
--   * per-user pending cap (20) -- bounds the blast radius per person. The
--     in-app bell still receives every notification; that is the durable record.
--   * staleness (30 min) -- a backdated row is not news.
--
-- Both guards are deliberately generous: they exist to stop catastrophes, not
-- to second-guess normal traffic. The dispatcher carries a matching
-- MAX_DELIVERY_AGE_MS for rows that sit through an outage rather than arriving
-- backdated.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mirror_notification_to_push_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tag     text;
  v_pending int;
  c_max_pending CONSTANT int      := 20;
  c_max_age     CONSTANT interval := interval '30 minutes';
BEGIN
  -- The JS gateway already decided about push for this row.
  IF NEW.data IS NOT NULL AND (NEW.data ->> '_push') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL OR NEW.title IS NULL OR btrim(NEW.title) = '' THEN
    RETURN NEW;
  END IF;

  -- GUARD: backfilled / replayed rows are not news.
  IF NEW.created_at IS NOT NULL AND NEW.created_at < (now() - c_max_age) THEN
    RETURN NEW;
  END IF;

  -- Types where only the newest item matters: collapse them on purpose so a
  -- burst does not stack five identical banners.
  IF NEW.type IN (
    'system', 'daily_challenge', 'venue_alert', 'bonus', 'vip',
    'live', 'poker_news', 'diamond', 'achievement'
  ) THEN
    v_tag := NEW.type || ':' || NEW.user_id::text;
  ELSE
    -- Everything else must stay individually visible. Prefer the natural
    -- grouping key (a conversation), then the actor, then the row id so two
    -- distinct events can never share a tag.
    v_tag := NEW.type || ':' || COALESCE(
      NULLIF(btrim(COALESCE(NEW.data ->> 'conversationId', '')), ''),
      NULLIF(btrim(COALESCE(NEW.data ->> 'conversation_id', '')), ''),
      NEW.actor_id::text,
      NEW.id::text
    );
  END IF;

  BEGIN
    -- GUARD: per-user pending cap.
    SELECT count(*) INTO v_pending
    FROM public.push_outbox
    WHERE recipient_user_id = NEW.user_id
      AND status IN ('pending', 'processing');

    IF v_pending >= c_max_pending THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.push_outbox (
      recipient_user_id, title, body, url, event, tag, status, related_entity_id
    )
    VALUES (
      NEW.user_id,
      left(NEW.title, 120),
      left(COALESCE(NEW.message, NEW.title), 500),
      COALESCE(NULLIF(btrim(NEW.link), ''), NULLIF(btrim(NEW.action_url), ''), '/hub'),
      NEW.type,
      v_tag,
      'pending',
      NEW.id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mirror_notification_to_push_outbox failed for notification %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$fn$;

-- ---- assertions: BOTH sets of behaviour must hold --------------------------
DO $$
DECLARE v_user uuid; v_notif uuid; v_n int; v_tag text; i int;
BEGIN
  SELECT id INTO v_user FROM auth.users
   WHERE id NOT IN (SELECT recipient_user_id FROM public.push_outbox WHERE recipient_user_id IS NOT NULL)
   LIMIT 1;
  IF v_user IS NULL THEN SELECT id INTO v_user FROM auth.users LIMIT 1; END IF;

  -- refined tag: a collapse-type uses type:user
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (v_user, 'system', 'tag assert collapse', 'b') RETURNING id INTO v_notif;
  SELECT tag INTO v_tag FROM public.push_outbox WHERE related_entity_id = v_notif;
  IF v_tag <> 'system:' || v_user::text THEN
    RAISE EXCEPTION 'collapse-type tag wrong: %', v_tag;
  END IF;
  DELETE FROM public.push_outbox WHERE related_entity_id = v_notif;
  DELETE FROM public.notifications WHERE id = v_notif;

  -- refined tag: a non-collapse type must NOT be keyed on user alone
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (v_user, 'friend_request', 'tag assert distinct', 'b') RETURNING id INTO v_notif;
  SELECT tag INTO v_tag FROM public.push_outbox WHERE related_entity_id = v_notif;
  IF v_tag = 'friend_request:' || v_user::text THEN
    RAISE EXCEPTION 'distinct-type tag collapsed onto the user: %', v_tag;
  END IF;
  DELETE FROM public.push_outbox WHERE related_entity_id = v_notif;
  DELETE FROM public.notifications WHERE id = v_notif;

  -- restored guard: staleness
  INSERT INTO public.notifications (user_id, type, title, message, created_at)
  VALUES (v_user, 'system', 'stale assert', 'b', now() - interval '2 hours')
  RETURNING id INTO v_notif;
  SELECT count(*) INTO v_n FROM public.push_outbox WHERE related_entity_id = v_notif;
  IF v_n <> 0 THEN RAISE EXCEPTION 'staleness guard missing: stale row mirrored'; END IF;
  DELETE FROM public.notifications WHERE id = v_notif;

  -- restored guard: per-user pending cap
  FOR i IN 1..25 LOOP
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (v_user, 'system', 'cap assert ' || i, 'b');
  END LOOP;
  SELECT count(*) INTO v_n FROM public.push_outbox
   WHERE recipient_user_id = v_user AND status = 'pending';
  IF v_n > 20 THEN RAISE EXCEPTION 'per-user pending cap missing: % queued', v_n; END IF;

  DELETE FROM public.push_outbox WHERE recipient_user_id = v_user AND title LIKE 'cap assert%';
  DELETE FROM public.notifications WHERE title LIKE 'cap assert%';
END $$;
