-- ─────────────────────────────────────────────────────────────────────────────
-- THE SEAT OFFERS THAT WENT TO HORSES (Dan 2026-08-30)
--
-- Between 2026-08-23 and 2026-08-27 the seat-offer path notified 551 HORSES,
-- 2,337 times. The bug is long fixed — the human-only filter landed on
-- 2026-08-27, and since 2026-08-30 the choice happens inside
-- `fn_offer_open_seat` where it cannot be forgotten — but the rows are still
-- here, and they are not harmless bookkeeping:
--
--   - `push_outbox` holds 2,337 of them, every one `skipped/no_subscription`,
--     which is 95% of everything that table has ever been asked to deliver. Any
--     honest look at delivery health has to mentally subtract them first, and
--     /admin/push-health does not.
--   - `notifications` holds the matching rows against accounts that have no
--     bell to read them.
--
-- WHAT IS NOT DONE HERE, and why. Horses are players (CLAUDE.md 10.5) and their
-- records are not junk by default: a horse's hand history, stats, VIP points,
-- commissions and ledger rows are all real and stay. This deletes ONE
-- notification type, in ONE closed date range, that was created by a bug and
-- that the recipient could not act on because it needs a phone. It is not a
-- precedent for pruning horse data.
--
-- Deliberately bounded by the fix date rather than by `is_horse` alone: a
-- horse-addressed seat offer AFTER 2026-08-27 would mean the filter had
-- regressed, and deleting those would erase the evidence. The assertion at the
-- bottom checks for exactly that instead.
--
-- ROLLBACK: none. These rows are the residue of a bug and carry no state
-- anything reads. The counts before deletion are recorded in the NOTICE below.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_fix_date CONSTANT timestamptz := '2026-08-28 00:00:00+00';
  v_outbox   bigint;
  v_notifs   bigint;
  v_after    bigint;
BEGIN
  -- REGRESSION CHECK FIRST. If the human-only filter has broken again, say so
  -- and change nothing: a cleanup that also erases the evidence of a live bug
  -- is worse than no cleanup.
  SELECT count(*) INTO v_after
    FROM public.notifications n
    JOIN public.profiles p ON p.id = n.user_id
   WHERE n.type = 'waitlist_seat_open'
     AND COALESCE(p.is_horse, false)
     AND n.created_at >= v_fix_date;

  IF v_after > 0 THEN
    RAISE EXCEPTION
      'refusing to prune: % seat offer(s) were sent to horses AFTER the fix date — the human-only filter has regressed, fix that first',
      v_after;
  END IF;

  SELECT count(*) INTO v_outbox
    FROM public.push_outbox o
    JOIN public.profiles p ON p.id = o.recipient_user_id
   WHERE o.event = 'waitlist_seat_open'
     AND COALESCE(p.is_horse, false)
     AND o.created_at < v_fix_date;

  SELECT count(*) INTO v_notifs
    FROM public.notifications n
    JOIN public.profiles p ON p.id = n.user_id
   WHERE n.type = 'waitlist_seat_open'
     AND COALESCE(p.is_horse, false)
     AND n.created_at < v_fix_date;

  RAISE NOTICE 'pruning horse seat offers: % push_outbox row(s), % notification(s)', v_outbox, v_notifs;

  -- Outbox first: its rows reference notifications through related_entity_id,
  -- and deleting the parent first would leave them pointing at nothing.
  DELETE FROM public.push_outbox o
   USING public.profiles p
   WHERE p.id = o.recipient_user_id
     AND o.event = 'waitlist_seat_open'
     AND COALESCE(p.is_horse, false)
     AND o.created_at < v_fix_date;

  DELETE FROM public.notifications n
   USING public.profiles p
   WHERE p.id = n.user_id
     AND n.type = 'waitlist_seat_open'
     AND COALESCE(p.is_horse, false)
     AND n.created_at < v_fix_date;
END $$;

-- Post-apply assertions.
DO $$
DECLARE
  v_left_notifs bigint;
  v_left_outbox bigint;
  v_humans      bigint;
BEGIN
  SELECT count(*) INTO v_left_notifs
    FROM public.notifications n
    JOIN public.profiles p ON p.id = n.user_id
   WHERE n.type = 'waitlist_seat_open' AND COALESCE(p.is_horse, false);

  SELECT count(*) INTO v_left_outbox
    FROM public.push_outbox o
    JOIN public.profiles p ON p.id = o.recipient_user_id
   WHERE o.event = 'waitlist_seat_open' AND COALESCE(p.is_horse, false);

  IF v_left_notifs > 0 OR v_left_outbox > 0 THEN
    RAISE EXCEPTION 'post-apply failed: % notification(s) and % outbox row(s) for horses survived', v_left_notifs, v_left_outbox;
  END IF;

  -- AND NO HUMAN LOST A THING. This is the assertion that matters — a prune
  -- that took a real player's notification would be invisible otherwise.
  SELECT count(*) INTO v_humans
    FROM public.notifications n
    LEFT JOIN public.profiles p ON p.id = n.user_id
   WHERE n.type = 'waitlist_seat_open' AND NOT COALESCE(p.is_horse, false);

  IF v_humans = 0 THEN
    RAISE EXCEPTION 'post-apply failed: every human seat offer is gone too — this deleted more than it was asked to';
  END IF;

  RAISE NOTICE 'human seat offers still present: %', v_humans;
END $$;
