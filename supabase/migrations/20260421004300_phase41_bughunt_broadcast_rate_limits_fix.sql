-- =====================================================================
-- Pass 46.1: Fix broadcast rate limits (was BJ-1/BJ-2, fix didn't hold)
--
-- The Pass 46 counter against notifications.actor_id was inert:
-- fn_emit_home_notification does not populate actor_id on the
-- notifications table, so the counter always read 0 and never
-- triggered. Verified with 7-call burst — all 7 succeeded.
--
-- FIX:
--   Introduce fn_try_consume_home_rate_limit — a VOLATILE check-and-
--   increment using the commander_rate_limits table. Atomic upsert:
--     • If no current window row exists → insert with count=1, return true
--     • If current window has room → bump count, return true
--     • If current window is exhausted → return false
--   Uses advisory lock keyed on (actor, endpoint) to serialize under
--   concurrent broadcasts.
--
--   Revert fn_check_home_rate_limit to its pre-Pass-46 shape (the
--   broadcast WHEN-arms added in Pass 46 were dead code). Wire the
--   broadcast RPCs to call fn_try_consume_home_rate_limit instead.
-- ========================================================================

-- ── Revert fn_check_home_rate_limit to original 5 actions ──
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
    ELSE
      RETURN true;
  END CASE;
  RETURN (v_count < v_limit);
END;
$function$;

-- ── Atomic check-and-consume for per-action per-actor windows ──
CREATE OR REPLACE FUNCTION public.fn_try_consume_home_rate_limit(
  p_actor_id uuid,
  p_endpoint text,
  p_max_requests int,
  p_window_minutes int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_now timestamptz := now();
  v_window_start_cutoff timestamptz := v_now - (p_window_minutes || ' minutes')::interval;
  v_lock_key bigint;
BEGIN
  IF p_actor_id IS NULL OR p_endpoint IS NULL THEN
    RETURN true;
  END IF;

  -- Advisory lock serializes concurrent consumes for the same (actor, endpoint)
  -- Key = hash64( actor_uuid_bytes || endpoint )
  v_lock_key := hashtextextended(p_actor_id::text || '|' || p_endpoint, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT * INTO v_row
  FROM commander_rate_limits
  WHERE identifier = p_actor_id::text
    AND identifier_type = 'user'
    AND endpoint = p_endpoint
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO commander_rate_limits (
      identifier, identifier_type, endpoint,
      request_count, window_start, window_minutes, max_requests,
      last_request_at
    ) VALUES (
      p_actor_id::text, 'user', p_endpoint,
      1, v_now, p_window_minutes, p_max_requests,
      v_now
    );
    RETURN true;
  END IF;

  -- If window has rolled over, reset
  IF v_row.window_start < v_window_start_cutoff THEN
    UPDATE commander_rate_limits
       SET request_count = 1,
           window_start  = v_now,
           window_minutes = p_window_minutes,
           max_requests  = p_max_requests,
           last_request_at = v_now,
           is_blocked = false,
           blocked_until = NULL,
           block_reason = NULL
     WHERE id = v_row.id;
    RETURN true;
  END IF;

  -- Still within window — check remaining quota
  IF v_row.request_count < p_max_requests THEN
    UPDATE commander_rate_limits
       SET request_count = v_row.request_count + 1,
           last_request_at = v_now
     WHERE id = v_row.id;
    RETURN true;
  END IF;

  -- Quota exhausted
  UPDATE commander_rate_limits
     SET is_blocked = true,
         blocked_until = v_row.window_start + (p_window_minutes || ' minutes')::interval,
         block_reason = 'Quota exhausted for endpoint ' || p_endpoint
   WHERE id = v_row.id;
  RETURN false;
END;
$function$;

COMMENT ON FUNCTION public.fn_try_consume_home_rate_limit(uuid, text, int, int) IS
  'Pass 46.1: Atomic check-and-increment rate limiter backed by '
  'commander_rate_limits. Returns true if the actor still has quota '
  'for the endpoint in the current window (and consumes one), false if '
  'exhausted. Use for RPCs with fan-out cost (broadcasts, invites).';

-- ────────────────────────────────────────────────────────────────────
-- Patch broadcast_to_home_group_roster: use fn_try_consume_home_rate_limit
-- ─────────────────────────────────────────────────────────────────────
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

    -- Pass 46.1 BJ-1: atomic rate limit, 5/hr per caller (service_role bypass)
    IF v_role <> 'service_role' AND NOT public.fn_try_consume_home_rate_limit(
         p_caller_user_id, 'home_broadcast_group', 5, 60) THEN
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
        SELECT m.user_id FROM commander_home_members m
         WHERE m.group_id = p_group_id AND m.status = 'approved'
           AND m.user_id <> p_caller_user_id
           AND COALESCE(m.notify_announcements, true) = true
      LOOP
        PERFORM public.fn_emit_home_notification(
            v_recipient, 'home_group_announcement',
            v_group.name || ': ' || p_title, p_body, v_link,
            jsonb_build_object('group_id', p_group_id, 'via', 'announcement'),
            'home_game_announcements'
        );
        v_members_sent := v_members_sent + 1;
      END LOOP;
    END IF;

    IF p_include_followers THEN
      FOR v_recipient IN
        SELECT f.user_id FROM commander_home_group_follows f
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
            v_recipient, 'home_group_announcement_followed',
            v_group.name || ': ' || p_title, p_body, v_link,
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
-- Patch broadcast_to_home_game_rsvps: use fn_try_consume_home_rate_limit
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

    -- Pass 46.1 BJ-2: atomic rate limit, 10/hr per caller (service_role bypass)
    IF v_role <> 'service_role' AND NOT public.fn_try_consume_home_rate_limit(
         p_caller_user_id, 'home_broadcast_game', 10, 60) THEN
      RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED'
        USING HINT = 'Host broadcasts limited to 10 per hour per sender.';
    END IF;

    SELECT sp.slug INTO v_slug FROM social_pages sp
     WHERE sp.linked_entity_type='home_group' AND sp.linked_entity_id=v_group.id::text LIMIT 1;

    v_title := 'Host message: ' || COALESCE(v_game.title, v_group.name);

    FOR v_recipient IN
        SELECT DISTINCT user_id FROM commander_home_rsvps
         WHERE game_id = p_game_id
           AND ( response = 'yes' OR (p_include_maybe AND response = 'maybe') )
    LOOP
        PERFORM public.fn_emit_home_notification(
            v_recipient.user_id, 'home_game_host_broadcast',
            v_title, LEFT(p_message, 500),
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