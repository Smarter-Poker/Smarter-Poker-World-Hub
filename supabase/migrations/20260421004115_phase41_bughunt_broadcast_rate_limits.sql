-- =====================================================================
-- Pass 46: Broadcast rate limiting (BJ-1, BJ-2)
--
-- BUGS:
--   BJ-1  broadcast_to_home_group_roster has NO rate limiting.
--         A group owner/admin can spam every member + follower with
--         push notifications at arbitrary frequency — potentially
--         thousands of notifications per hour per target user, at
--         per-send cost and trust impact.
--
--   BJ-2  broadcast_to_home_game_rsvps has NO rate limiting.
--         A game host/admin can spam every yes/maybe RSVP with host
--         messages at arbitrary frequency.
--
--   Neither RPC consults fn_check_home_rate_limit (which covers
--   join/post/comment/invite_token/rsvp) nor any other limiter.
--   check_rate_limit() is a stub that always returns true (dead code).
--
-- FIX:
--   1) Extend fn_check_home_rate_limit with two new actions:
--        'broadcast_group' — limit 5/hour per caller
--        'broadcast_game'  — limit 10/hour per caller
--      Counting source: notifications.actor_id + type LIKE pattern.
--      Notifications are already persisted on every broadcast, so no
--      schema change required — just a COUNT query against a time window.
--
--   2) Patch both broadcast RPCs to call the check and return a
--      structured error (RATE_LIMIT_EXCEEDED) when hit, mirroring their
--      existing error-return pattern.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_check_home_rate_limit(
  p_caller_user_id uuid,
  p_action text,
  p_window_minutes integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_limit int;
  v_since timestamptz := NOW() - (p_window_minutes || ' minutes')::interval;
BEGIN
  CASE p_action
    WHEN 'join' THEN
      v_limit := 20;
      SELECT COUNT(*) INTO v_count FROM commander_home_members
        WHERE user_id = p_caller_user_id AND created_at > v_since;
    WHEN 'post' THEN
      v_limit := 30;
      SELECT COUNT(*) INTO v_count FROM commander_home_posts
        WHERE author_id = p_caller_user_id AND created_at > v_since;
    WHEN 'comment' THEN
      v_limit := 60;
      SELECT COUNT(*) INTO v_count FROM commander_home_post_comments
        WHERE author_id = p_caller_user_id AND created_at > v_since;
    WHEN 'invite_token' THEN
      v_limit := 15;
      SELECT COUNT(*) INTO v_count FROM commander_home_invite_tokens
        WHERE created_by = p_caller_user_id AND created_at > v_since;
    WHEN 'rsvp' THEN
      v_limit := 40;
      SELECT COUNT(*) INTO v_count FROM commander_home_rsvps
        WHERE user_id = p_caller_user_id AND responded_at > v_since;
    WHEN 'broadcast_group' THEN
      -- Pass 46 BJ-1: one group-roster broadcast fans out to dozens/
      -- hundreds of notification rows. Count distinct (actor_id, title)
      -- across the announcement types so one broadcast = 1 tick.
      v_limit := 5;
      SELECT COUNT(DISTINCT (actor_id, title, created_at)) INTO v_count
        FROM notifications
        WHERE actor_id = p_caller_user_id
          AND type IN ('home_group_announcement','home_group_announcement_followed')
          AND created_at > v_since;
    WHEN 'broadcast_game' THEN
      -- Pass 46 BJ-2: game-RSVP broadcasts. Also fan-out.
      v_limit := 10;
      SELECT COUNT(DISTINCT (actor_id, title, created_at)) INTO v_count
        FROM notifications
        WHERE actor_id = p_caller_user_id
          AND type = 'home_game_host_broadcast'
          AND created_at > v_since;
    ELSE
      RETURN true;
  END CASE;

  RETURN (v_count < v_limit);
END;
$function$;

COMMENT ON FUNCTION public.fn_check_home_rate_limit(uuid, text, integer) IS
  'Pass 46: Extended with broadcast_group (5/hr) and broadcast_game (10/hr) '
  'actions. Counts via notifications.actor_id + type patterns — no schema '
  'change. Original post/comment/rsvp/invite_token/join actions preserved.';

-- ──────────────────────────────────────────────────────────────────────
-- Patch broadcast_to_home_group_roster: call fn_check_home_rate_limit
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.broadcast_to_home_group_roster(
  p_group_id uuid,
  p_caller_user_id uuid,
  p_title text,
  p_body text,
  p_include_members boolean DEFAULT true,
  p_include_followers boolean DEFAULT true,
  p_link_path text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
    v_caller uuid := auth.uid();
    v_role   text := auth.role();
    v_group  RECORD;
    v_recipient uuid;
    v_members_sent int := 0;
    v_followers_sent int := 0;
    v_slug text;
    v_link text;
BEGIN
    IF v_role <> 'service_role' THEN
      IF v_caller IS NULL OR v_caller <> p_caller_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'AUTH_MISMATCH');
      END IF;
    END IF;

    IF COALESCE(TRIM(p_title), '') = '' OR COALESCE(TRIM(p_body), '') = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'MISSING_TITLE_OR_BODY');
    END IF;
    IF length(p_title) > 200 OR length(p_body) > 2000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'CONTENT_TOO_LONG');
    END IF;
    IF p_include_members = false AND p_include_followers = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_AUDIENCE');
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'GROUP_NOT_FOUND');
    END IF;

    IF NOT (
      v_group.owner_id = p_caller_user_id
      OR EXISTS (SELECT 1 FROM commander_home_members
                  WHERE group_id = p_group_id AND user_id = p_caller_user_id
                    AND role = 'admin' AND status = 'approved')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'NOT_GROUP_STAFF');
    END IF;

    -- Pass 46 BJ-1: rate-limit group broadcasts to 5/hour per caller.
    -- service_role bypasses (legit server code such as scheduled digests).
    IF v_role <> 'service_role' AND NOT public.fn_check_home_rate_limit(
         p_caller_user_id, 'broadcast_group', 60) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'RATE_LIMIT_EXCEEDED',
        'detail', 'Group broadcasts limited to 5 per hour per sender.'
      );
    END IF;

    SELECT sp.slug INTO v_slug FROM social_pages sp
     WHERE sp.linked_entity_type='home_group'
       AND sp.linked_entity_id = p_group_id::text LIMIT 1;

    v_link := COALESCE(p_link_path,
                       '/hub/home-games/' || COALESCE(v_slug, p_group_id::text));

    IF p_include_members THEN
      FOR v_recipient IN
        SELECT m.user_id
          FROM commander_home_members m
         WHERE m.group_id = p_group_id
           AND m.status = 'approved'
           AND m.user_id <> p_caller_user_id
           AND COALESCE(m.notify_announcements, true) = true
      LOOP
        PERFORM public.fn_emit_home_notification(
            v_recipient,
            'home_group_announcement',
            v_group.name || ': ' || p_title,
            p_body,
            v_link,
            jsonb_build_object('group_id', p_group_id, 'via', 'announcement'),
            'home_game_announcements'
        );
        v_members_sent := v_members_sent + 1;
      END LOOP;
    END IF;

    IF p_include_followers THEN
      FOR v_recipient IN
        SELECT f.user_id
          FROM commander_home_group_follows f
         WHERE f.group_id = p_group_id
           AND f.notify_announcements = true
           AND f.user_id <> p_caller_user_id
           AND (NOT p_include_members
                OR NOT EXISTS (SELECT 1 FROM commander_home_members m
                                WHERE m.group_id = p_group_id
                                  AND m.user_id = f.user_id
                                  AND m.status = 'approved'))
      LOOP
        PERFORM public.fn_emit_home_notification(
            v_recipient,
            'home_group_announcement_followed',
            v_group.name || ': ' || p_title,
            p_body,
            v_link,
            jsonb_build_object('group_id', p_group_id, 'via', 'follow'),
            NULL
        );
        v_followers_sent := v_followers_sent + 1;
      END LOOP;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'members_notified', v_members_sent,
      'followers_notified', v_followers_sent,
      'total', v_members_sent + v_followers_sent
    );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- Patch broadcast_to_home_game_rsvps: call fn_check_home_rate_limit
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.broadcast_to_home_game_rsvps(
  p_game_id uuid,
  p_message text,
  p_caller_user_id uuid,
  p_include_maybe boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_game RECORD; v_group RECORD; v_slug text;
    v_recipient RECORD; v_sent int := 0;
    v_title text;
    v_role text := auth.role();
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
      RAISE EXCEPTION 'EMPTY_MESSAGE';
    END IF;
    IF length(p_message) > 1000 THEN RAISE EXCEPTION 'MESSAGE_TOO_LONG'; END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;

    IF v_game.host_id <> p_caller_user_id AND v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members
                        WHERE group_id = v_game.group_id AND user_id = p_caller_user_id
                          AND role = 'admin' AND status = 'approved')
    THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

    -- Pass 46 BJ-2: rate-limit host broadcasts to 10/hour per caller.
    IF v_role <> 'service_role' AND NOT public.fn_check_home_rate_limit(
         p_caller_user_id, 'broadcast_game', 60) THEN
      RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED'
        USING HINT = 'Host broadcasts limited to 10 per hour per sender.';
    END IF;

    SELECT sp.slug INTO v_slug FROM social_pages sp
     WHERE sp.linked_entity_type='home_group' AND sp.linked_entity_id=v_group.id::text LIMIT 1;

    v_title := 'Host message: ' || COALESCE(v_game.title, v_group.name);

    FOR v_recipient IN
        SELECT DISTINCT user_id FROM commander_home_rsvps
         WHERE game_id = p_game_id
           AND ( response = 'yes'
                 OR (p_include_maybe AND response = 'maybe') )
    LOOP
        PERFORM public.fn_emit_home_notification(
            v_recipient.user_id,
            'home_game_host_broadcast',
            v_title,
            LEFT(p_message, 500),
            '/hub/home-games/' || COALESCE(v_slug, v_group.id::text),
            jsonb_build_object('game_id', p_game_id, 'from_host', p_caller_user_id, 'full_message', p_message),
            NULL
        );
        v_sent := v_sent + 1;
    END LOOP;

    INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (v_group.id, p_caller_user_id, 'game', p_game_id, 'host_broadcast',
            jsonb_build_object('recipients', v_sent, 'preview', LEFT(p_message, 100)));

    RETURN jsonb_build_object('success', true, 'recipients_count', v_sent);
END;
$function$;