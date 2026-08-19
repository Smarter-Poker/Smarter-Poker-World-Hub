-- ============================================================================
-- MIRROR BURST PROTECTION. Applied to production 2026-08-19 via MCP.
--
-- THE RISK THE MIRROR INTRODUCED
-- trg_mirror_notification_to_push_outbox turns every `notifications` row into a
-- push. That is the point -- but this table takes bulk writes. Measured from
-- production history, rows created in a single second:
--   1,682  friend_accept              (2026-05-13)
--     997  home_group_friend_joined   (2026-05-12)
--     721 / 701  friend_accept        (2026-05-12)
--     350  live                       (2026-05-16)
-- Those are backfills and migrations, not organic activity. Mirrored naively,
-- the next backfill is a mass-push incident: thousands of phones buzzing about
-- events that already happened, plus an ~85-minute drain at the old 100-rows-
-- per-5-minute rate that starves every real notification queued behind it.
--
-- Two guards, both in the trigger so nothing downstream has to care:
--
--  1. PER-USER PENDING CAP (20). If a user already has that many undelivered
--     pushes queued, stop queueing more for them. Nobody needs 40 banners, and
--     the in-app bell still receives every notification -- that is the durable
--     record. Bounds the blast radius per person.
--
--  2. STALENESS (30 min). A notification inserted with an old created_at --
--     exactly what a backfill does -- is not news, so it is never mirrored.
--
-- Both are deliberately generous: they exist to stop catastrophes, not to
-- second-guess normal traffic. The dispatcher carries a matching belt-and-braces
-- MAX_DELIVERY_AGE_MS for rows that sit through an outage.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mirror_notification_to_push_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pending  int;
  c_max_pending  CONSTANT int := 20;
  c_max_age      CONSTANT interval := interval '30 minutes';
BEGIN
  -- The JS gateway already decided about push for this row.
  IF NEW.data IS NOT NULL AND (NEW.data ->> '_push') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL OR NEW.title IS NULL OR btrim(NEW.title) = '' THEN
    RETURN NEW;
  END IF;

  -- GUARD 2: backfilled / replayed rows are not news.
  IF NEW.created_at IS NOT NULL AND NEW.created_at < (now() - c_max_age) THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- GUARD 1: per-user pending cap.
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

-- Makes the per-user pending count an index-only lookup instead of a scan.
CREATE INDEX IF NOT EXISTS push_outbox_recipient_pending_idx
  ON public.push_outbox (recipient_user_id)
  WHERE status IN ('pending', 'processing');

-- ---- assertions ------------------------------------------------------------
DO $$
DECLARE v_user uuid; v_notif uuid; v_n int; i int;
BEGIN
  SELECT id INTO v_user FROM auth.users
  WHERE id NOT IN (SELECT recipient_user_id FROM public.push_outbox WHERE recipient_user_id IS NOT NULL)
  LIMIT 1;
  IF v_user IS NULL THEN SELECT id INTO v_user FROM auth.users LIMIT 1; END IF;

  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (v_user, 'system', 'burst assert fresh', 'b') RETURNING id INTO v_notif;
  SELECT count(*) INTO v_n FROM public.push_outbox WHERE related_entity_id = v_notif;
  IF v_n <> 1 THEN RAISE EXCEPTION 'fresh row not mirrored (%)', v_n; END IF;
  DELETE FROM public.push_outbox WHERE related_entity_id = v_notif;
  DELETE FROM public.notifications WHERE id = v_notif;

  INSERT INTO public.notifications (user_id, type, title, message, created_at)
  VALUES (v_user, 'system', 'burst assert stale', 'b', now() - interval '2 hours')
  RETURNING id INTO v_notif;
  SELECT count(*) INTO v_n FROM public.push_outbox WHERE related_entity_id = v_notif;
  IF v_n <> 0 THEN RAISE EXCEPTION 'stale row was mirrored (%)', v_n; END IF;
  DELETE FROM public.notifications WHERE id = v_notif;

  FOR i IN 1..25 LOOP
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (v_user, 'system', 'burst assert cap ' || i, 'b');
  END LOOP;
  SELECT count(*) INTO v_n FROM public.push_outbox
   WHERE recipient_user_id = v_user AND status = 'pending';
  IF v_n > 20 THEN RAISE EXCEPTION 'per-user pending cap exceeded: %', v_n; END IF;
  IF v_n < 20 THEN RAISE EXCEPTION 'cap engaged too early: only % queued', v_n; END IF;

  DELETE FROM public.push_outbox WHERE recipient_user_id = v_user AND title LIKE 'burst assert cap%';
  DELETE FROM public.notifications WHERE title LIKE 'burst assert cap%';
END $$;

-- ROLLBACK: re-apply 20260819230100 to restore the unguarded mirror.
