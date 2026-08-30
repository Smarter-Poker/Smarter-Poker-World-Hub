-- ─────────────────────────────────────────────────────────────────────────────
-- A SECOND SEAT OFFER REPLACES THE FIRST, IT DOES NOT STACK BESIDE IT
-- (Dan 2026-08-30)
--
-- `fn_mirror_notification_to_push_outbox` tags most rows
-- `<type>:<notification id>` — deliberately, so two genuinely distinct events
-- stay individually visible. For a SEAT OFFER that is the wrong grouping, and
-- it costs twice:
--
--   1. STACKING. Every offer at the same table is a new notification id, so a
--      second offer lands BESIDE the first rather than replacing it. The
--      operating system uses the tag to decide, so identical text with
--      different tags is guaranteed to pile up. This is the same mechanism
--      behind the duplicate banner Dan photographed on 2026-08-29 (two writers,
--      two tags); that had one cause fixed in the engine, and this is the other
--      half.
--
--   2. A DEAD BANNER OUTLIVING ITS OFFER. An offer lapses after three minutes.
--      Nothing dismissed the banner, so "A Seat Just Opened. Tap To Claim It."
--      sat on the lock screen for a seat that was long gone, and tapping it
--      landed the player on a full table. With a per-table tag the expiry
--      notice for that same table REPLACES it in place — which is the only
--      dismissal mechanism a web push has, and it now costs nothing extra.
--
-- So seat-offer types group by `data->>'table_id'`. One live banner per table,
-- always describing the current state of that table's offer.
--
-- `waitlist_offer_expired` is in the set for exactly that replacement, even
-- though `fn_offer_open_seat` writes it with `data->>'_push' = 'skip'` and the
-- trigger therefore returns before it reaches this tag. That is not dead code
-- being written for a hypothetical: the skip is a decision about INTERRUPTING
-- (an expiry is a bell item, not a buzz), and if it is ever revisited the row
-- must land on the offer's tag rather than beside it. Leaving the type out
-- would make revisiting it a silent regression.
--
-- The fallback chain is unchanged and still ends at NEW.id, so a seat offer
-- carrying no table_id keeps its own tag rather than colliding with every other
-- table-less offer under one key.
--
-- ROLLBACK: re-apply 20260820001500_webpush_mirror_reconcile_tag_and_burst_guards.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_mirror_notification_to_push_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- SEAT OFFERS GROUP BY TABLE (2026-08-30). One live banner per table: a new
  -- offer replaces a stale one, and the expiry notice replaces the offer.
  IF NEW.type IN (
    'waitlist_seat_open', 'waitlist_offer_expired',
    'seat_available', 'waitlist_ready', 'table_ready'
  ) THEN
    v_tag := 'seat_offer:' || COALESCE(
      NULLIF(btrim(COALESCE(NEW.data ->> 'table_id', '')), ''),
      NEW.id::text
    );

  -- Types where only the newest item matters: collapse them on purpose so a
  -- burst does not stack five identical banners.
  ELSIF NEW.type IN (
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
$function$;

-- Post-apply assertions. The trigger is what turns a notification into a push,
-- so a version of it that silently did nothing would stop every push on the
-- platform without anything going red.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.fn_mirror_notification_to_push_outbox'::regproc) INTO v_def;

  IF v_def NOT LIKE '%seat_offer:%' THEN
    RAISE EXCEPTION 'post-apply failed: the seat-offer tag branch is not in the live function';
  END IF;

  -- The three guards that were already there must survive this rewrite. Each
  -- one was added after a real incident (see 20260819235000 and 20260820001500).
  IF v_def NOT LIKE '%_push%' THEN
    RAISE EXCEPTION 'post-apply failed: the gateway opt-out guard is gone';
  END IF;
  IF v_def NOT LIKE '%c_max_pending%' THEN
    RAISE EXCEPTION 'post-apply failed: the per-user pending cap is gone';
  END IF;
  IF v_def NOT LIKE '%c_max_age%' THEN
    RAISE EXCEPTION 'post-apply failed: the replayed-row guard is gone';
  END IF;

  -- And the trigger must still be attached, on the same table and timing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'notifications'
       AND t.tgname = 'trg_mirror_notification_to_push_outbox'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'post-apply failed: trg_mirror_notification_to_push_outbox is not attached';
  END IF;
END $$;
