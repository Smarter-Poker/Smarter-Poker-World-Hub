-- ═══════════════════════════════════════════════════════════════════════
-- 20260825120000_notification_action_url_backfill.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                    (additive: new function + trigger, fills a NULL column)
-- AUTHOR:      cowork-notifications
-- AFFECTS:     tables: public.notifications (action_url only, and only where NULL)
--              functions: public.fn_notification_action_url
--              triggers: trg_notification_fill_action_url (BEFORE INSERT)
-- IRREVERSIBLE: no
--
-- WHY:
--   Dan, 2026-08-25: tapping a notification "currently just silently fails".
--
--   The in-app fix is World Hub PR #745 -- one resolver, run at read time by
--   /api/notifications/feed. That fixes the app. It does NOT fix PUSH.
--
--   fn_mirror_notification_to_push_outbox (20260819230100) builds the push
--   URL as:
--       COALESCE(NULLIF(btrim(link),''), NULLIF(btrim(action_url),''), '/hub')
--   so every notification with neither column set sends a push that opens
--   the generic hub. Counted in production on 2026-08-25:
--
--       friend_accept       3188 rows   0 with a link
--       waitlist_seat_open  1219 rows   0 with a link   <- "Seat Open"
--       friend_request      1193 rows   0 with a link
--       like / comment        18 rows   0 with a link
--       union_invoice          4 rows   0 with a link
--
--   That is ~5,600 push notifications that could not deep-link, and every
--   future one of those types would have joined them.
--
-- HOW:
--   - fn_notification_action_url() mirrors the routing rules in
--     src/lib/notificationRoute.js.
--   - A BEFORE INSERT trigger fills action_url when the producer left both
--     link and action_url empty, so this stops being a per-producer chase:
--     any producer, in any repo, now gets a working push deep link.
--     The push mirror is an AFTER trigger, so the value is always in place
--     before it reads it.
--   - One-time backfill of existing rows, NULL action_url only.
--
--   DRIFT NOTE: this SQL and notificationRoute.js encode the same rules in
--   two languages. That is deliberate and bounded -- the JS is authoritative
--   for what the app does at read time, this is a best-effort default so the
--   value is durable enough for push. If you change one, change the other;
--   the JS has 25 tests in the prebuild gate, this has assertions below.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'notifications'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.notifications not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='notifications' AND column_name='action_url'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: notifications.action_url not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='notifications' AND column_name='data'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: notifications.data not found';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_notification_action_url(
    p_type      text,
    p_data      jsonb,
    p_metadata  jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    -- Producers disagree about which JSON column and which casing they use.
    -- Flatten both; `data` wins on collision because that is what the live
    -- triggers write.
    d          jsonb := COALESCE(p_metadata, '{}'::jsonb) || COALESCE(p_data, '{}'::jsonb);
    t          text  := COALESCE(btrim(p_type), '');
    ca         text  := '/hub/club-arena';
    v_table    text  := COALESCE(d->>'table_id',      d->>'tableId');
    v_union    text  := COALESCE(d->>'union_id',      d->>'unionId');
    v_club     text  := COALESCE(d->>'club_id',       d->>'clubId');
    v_post     text  := COALESCE(d->>'post_id',       d->>'postId');
    v_tourn    text  := COALESCE(d->>'tournament_id', d->>'tournamentId');
    v_convo    text  := COALESCE(d->>'conversation_id', d->>'conversationId');
    v_pagetype text  := COALESCE(d->>'page_type',     d->>'pageType');
    v_pageid   text  := COALESCE(d->>'page_id',       d->>'pageId');
    v_sender   text  := COALESCE(d->>'sender_id',     d->>'actor_id', d->>'senderId');
    v_username text;
    v_is_reel  boolean := (d->>'is_reel') = 'true' OR (d->>'post_type') = 'reel';
BEGIN
    -- Poker: the seat-open alert is the largest dead population.
    IF t IN ('waitlist_seat_open','seat_available','waitlist_ready','table_ready') THEN
        RETURN CASE WHEN v_table IS NOT NULL THEN ca || '/table/' || v_table
                    ELSE ca || '/waitlist' END;
    END IF;

    IF t IN ('table_invite','your_turn','your_turn_reminder','time_bank_active','hand_won') THEN
        RETURN CASE WHEN v_table IS NOT NULL THEN ca || '/table/' || v_table ELSE NULL END;
    END IF;

    IF t IN ('tournament_starting','tournament_start','tournament_registered') THEN
        RETURN CASE WHEN v_tourn IS NOT NULL THEN ca || '/tournaments/' || v_tourn
                    ELSE ca || '/tournaments' END;
    END IF;

    -- Union money.
    IF t = 'union_invoice' THEN
        RETURN CASE WHEN v_union IS NOT NULL THEN ca || '/unions/' || v_union || '/statements'
                    ELSE ca || '/unions' END;
    END IF;

    IF t IN ('settlement','settlement_failed') THEN
        IF v_union IS NOT NULL THEN RETURN ca || '/unions/' || v_union || '/settlement'; END IF;
        IF v_club  IS NOT NULL THEN RETURN ca || '/clubs/'  || v_club  || '/settlement'; END IF;
        RETURN ca || '/settlement-dashboard';
    END IF;

    IF t IN ('cashout_request','cashout_approved','cashout_denied') THEN
        RETURN CASE WHEN v_club IS NOT NULL THEN ca || '/clubs/' || v_club || '/financials'
                    ELSE ca || '/wallet' END;
    END IF;

    -- Club scoped.
    IF t IN ('club_announcement','club_invite') THEN
        RETURN CASE WHEN v_club IS NOT NULL THEN ca || '/clubs/' || v_club ELSE NULL END;
    END IF;

    IF t IN ('bonus','promotion','rakeback') THEN
        RETURN CASE WHEN v_club IS NOT NULL THEN ca || '/clubs/' || v_club || '/promotions'
                    ELSE ca || '/bonuses' END;
    END IF;

    IF t IN ('achievement','achievement_unlocked') THEN
        RETURN ca || '/achievements';
    END IF;

    -- Social posts. These previously dropped the post id entirely.
    IF t IN ('like','comment','mention','post_like','post_comment','reply','tag') THEN
        IF v_post IS NOT NULL THEN
            RETURN CASE WHEN v_is_reel THEN '/hub/reels?id=' || v_post
                        ELSE '/hub/social-media?post=' || v_post END;
        END IF;
        RETURN '/hub/social-media';
    END IF;

    -- Social people. Resolve the username so push opens the actual profile.
    IF t IN ('friend_request','friend_accept','friend_accepted','new_follow','follow','follow_request') THEN
        IF v_sender IS NOT NULL THEN
            BEGIN
                SELECT username INTO v_username
                FROM public.profiles
                WHERE id = v_sender::uuid
                LIMIT 1;
            EXCEPTION WHEN OTHERS THEN
                v_username := NULL;   -- malformed uuid in data; fall through
            END;
        END IF;
        RETURN CASE WHEN v_username IS NOT NULL AND btrim(v_username) <> ''
                    THEN '/hub/user/' || v_username
                    ELSE '/hub/friends' END;
    END IF;

    IF t IN ('message','direct_message','new_message') THEN
        RETURN CASE WHEN v_convo IS NOT NULL THEN '/hub/messenger?conversation=' || v_convo
                    ELSE '/hub/messenger' END;
    END IF;

    -- Generic payload shapes for types we do not know by name.
    IF v_pagetype IS NOT NULL AND v_pageid IS NOT NULL THEN
        IF v_pagetype = 'venue'  THEN RETURN '/hub/venues/' || v_pageid; END IF;
        IF v_pagetype = 'tour'   THEN RETURN '/hub/tours/'  || v_pageid; END IF;
        IF v_pagetype = 'series' THEN RETURN '/hub/series/' || v_pageid; END IF;
        RETURN '/club/' || v_pageid;
    END IF;

    IF v_club   IS NOT NULL THEN RETURN '/club/' || v_club; END IF;
    IF v_pageid IS NOT NULL THEN RETURN '/hub/social-pages/' || v_pageid; END IF;
    IF v_post   IS NOT NULL THEN
        RETURN CASE WHEN v_is_reel THEN '/hub/reels?id=' || v_post
                    ELSE '/hub/social-media?post=' || v_post END;
    END IF;
    IF v_tourn  IS NOT NULL THEN RETURN ca || '/tournaments/' || v_tourn; END IF;
    IF v_table  IS NOT NULL THEN RETURN ca || '/table/' || v_table; END IF;

    -- Nowhere to go. NULL, not '/hub' -- the push mirror already supplies
    -- that fallback, and a real NULL keeps "unroutable" measurable.
    RETURN NULL;
END $$;

COMMENT ON FUNCTION public.fn_notification_action_url(text, jsonb, jsonb) IS
    'Default deep-link for a notification. Mirrors src/lib/notificationRoute.js in the World Hub repo; that file is authoritative for in-app routing, this exists so push notifications have a durable URL. Change both together.';

-- Fill action_url at insert time when the producer supplied neither column.
CREATE OR REPLACE FUNCTION public.fn_notification_fill_action_url()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NULLIF(btrim(COALESCE(NEW.link, '')), '') IS NULL
       AND NULLIF(btrim(COALESCE(NEW.action_url, '')), '') IS NULL THEN
        BEGIN
            NEW.action_url := public.fn_notification_action_url(NEW.type, NEW.data, NEW.metadata);
        EXCEPTION WHEN OTHERS THEN
            -- Never block a notification insert over a routing default.
            RAISE WARNING 'fn_notification_fill_action_url failed for type %: %', NEW.type, SQLERRM;
        END;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notification_fill_action_url ON public.notifications;
CREATE TRIGGER trg_notification_fill_action_url
    BEFORE INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_notification_fill_action_url();

-- One-time backfill. NULL action_url only: never overwrite a producer's value.
UPDATE public.notifications n
SET    action_url = public.fn_notification_action_url(n.type, n.data, n.metadata)
WHERE  NULLIF(btrim(COALESCE(n.link, '')), '') IS NULL
  AND  NULLIF(btrim(COALESCE(n.action_url, '')), '') IS NULL
  AND  public.fn_notification_action_url(n.type, n.data, n.metadata) IS NOT NULL;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    v_dead_seat  int;
    v_dead_union int;
    v_sample     text;
BEGIN
    -- The three types Dan can see in his own notification list must now route.
    SELECT count(*) INTO v_dead_seat
    FROM public.notifications
    WHERE type = 'waitlist_seat_open'
      AND data ? 'table_id'
      AND NULLIF(btrim(COALESCE(action_url,'')),'') IS NULL
      AND NULLIF(btrim(COALESCE(link,'')),'') IS NULL;
    IF v_dead_seat > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % waitlist_seat_open rows still have no destination', v_dead_seat;
    END IF;

    SELECT count(*) INTO v_dead_union
    FROM public.notifications
    WHERE type = 'union_invoice'
      AND data ? 'union_id'
      AND NULLIF(btrim(COALESCE(action_url,'')),'') IS NULL
      AND NULLIF(btrim(COALESCE(link,'')),'') IS NULL;
    IF v_dead_union > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % union_invoice rows still have no destination', v_dead_union;
    END IF;

    -- And the shape must be a path, not a bare word.
    SELECT action_url INTO v_sample
    FROM public.notifications
    WHERE type = 'waitlist_seat_open' AND action_url IS NOT NULL
    LIMIT 1;
    IF v_sample IS NOT NULL AND left(v_sample, 1) <> '/' THEN
        RAISE EXCEPTION 'post-apply failed: action_url is not a path: %', v_sample;
    END IF;

    -- The trigger must exist, or every future row rejoins the dead pile.
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_notification_fill_action_url' AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'post-apply failed: trg_notification_fill_action_url missing';
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a NEW _revert_ migration if ever needed)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_notification_fill_action_url ON public.notifications;
-- DROP FUNCTION IF EXISTS public.fn_notification_fill_action_url();
-- DROP FUNCTION IF EXISTS public.fn_notification_action_url(text, jsonb, jsonb);
-- -- The backfilled action_url values are left in place on purpose: they are
-- -- correct destinations, and blanking them would re-break push deep links.
-- -- To undo them anyway you would need a backup, since the pre-backfill
-- -- state was simply NULL and is not otherwise recoverable.
-- COMMIT;
