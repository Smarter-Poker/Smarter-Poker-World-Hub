-- AUTO-GENERATED snapshot of the LIVE Home Games schema.
-- Generated 2026-08-12T23:19:56.229579Z.
--
-- WHY THIS FILE EXISTS
-- ~559 migrations are applied in production but absent from this repo (703
-- files vs 1,263 applied rows). Every Home Games function below existed ONLY
-- in the live database, which is why three hardening changes could be
-- reverted out-of-band without anyone noticing: there was nothing to diff.
--
-- This is a REFERENCE ARTIFACT, not a migration to replay. The ZZZZ_ prefix
-- keeps the Supabase CLI ordering it last so it is never applied ahead of
-- real history.
--
-- Regenerate / drift-check:
--   DATABASE_URL=... node scripts/dump-home-games-schema.mjs
--   DATABASE_URL=... node scripts/dump-home-games-schema.mjs --check
-- (SUPABASE_DB_PASSWORD in .env is currently STALE — refresh it first.)
--
-- FUNCTIONS (163)

CREATE OR REPLACE FUNCTION public.assign_home_game_seat(p_game_id uuid, p_seat_number integer, p_user_id uuid, p_player_name text DEFAULT NULL::text, p_caller_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_game RECORD;
  v_group RECORD;
  v_resolved_name text;
  v_new_status text;
  v_new_seated_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF p_seat_number < 1 OR p_seat_number > 20 THEN
    RAISE EXCEPTION 'INVALID_SEAT_NUMBER';
  END IF;

  SELECT * INTO v_game FROM public.commander_home_games WHERE id = p_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
  IF v_game.status NOT IN ('scheduled','confirmed','in_progress') THEN
    RAISE EXCEPTION 'GAME_NOT_ACTIVE';
  END IF;

  SELECT * INTO v_group FROM public.commander_home_groups WHERE id = v_game.group_id;

  IF v_game.host_id <> p_caller_user_id
     AND v_group.owner_id <> p_caller_user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.commander_home_members
        WHERE group_id = v_game.group_id AND user_id = p_caller_user_id
          AND role = 'admin' AND status = 'approved'
     )
  THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  IF p_seat_number > COALESCE(v_game.max_players, 9) THEN
    RAISE EXCEPTION 'SEAT_EXCEEDS_MAX_PLAYERS';
  END IF;

  v_resolved_name := COALESCE(
    p_player_name,
    (SELECT COALESCE(display_name, full_name, username) FROM public.profiles WHERE id = p_user_id)
  );
  v_new_status := CASE WHEN p_user_id IS NULL THEN 'empty' ELSE 'seated' END;
  v_new_seated_at := CASE WHEN p_user_id IS NULL THEN NULL ELSE NOW() END;

  -- FIX: match the legacy partial unique index
  --   UNIQUE(game_id, seat_number) WHERE table_id IS NULL
  INSERT INTO public.commander_home_seats
    (game_id, seat_number, user_id, player_name, status, seated_at)
  VALUES
    (p_game_id, p_seat_number, p_user_id, v_resolved_name, v_new_status, v_new_seated_at)
  ON CONFLICT (game_id, seat_number) WHERE table_id IS NULL
  DO UPDATE
    SET user_id     = EXCLUDED.user_id,
        player_name = EXCLUDED.player_name,
        status      = EXCLUDED.status,
        seated_at   = EXCLUDED.seated_at,
        away_since  = NULL,
        updated_at  = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'seat_number', p_seat_number,
    'user_id', p_user_id
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.autocreate_home_group_social_page()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- We create a social_page for EVERY group (public and private). The visibility
  -- of the page is derived from the group's privacy flags.
  IF NOT EXISTS (
    SELECT 1 FROM public.social_pages
    WHERE linked_entity_type = 'home_group' AND linked_entity_id = NEW.id::text
  ) THEN
    INSERT INTO public.social_pages (
      owner_id, page_type, name, slug, description,
      avatar_url, cover_url, category,
      location_city, location_state, location_country,
      linked_entity_type, linked_entity_id,
      is_public, allow_member_posts, require_post_approval, metadata
    ) VALUES (
      NEW.owner_id, 'home_game', NEW.name,
      public.unique_home_game_slug(NEW.name),
      coalesce(NEW.description, NEW.tagline, ''),
      NEW.profile_photo_url, NEW.cover_photo_url, 'home game',
      NEW.city, NEW.state, 'US',
      'home_group', NEW.id::text,
      -- is_public reflects the runtime state: active AND not private
      (coalesce(NEW.is_active, true) AND NOT coalesce(NEW.is_private, false)),
      true, false,
      jsonb_build_object(
        'home_group_id', NEW.id,
        'invite_code', NEW.invite_code,
        'club_code', NEW.club_code,
        'default_game_type', NEW.default_game_type,
        'default_stakes', NEW.default_stakes,
        'frequency', NEW.frequency
      )
    );
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.autogeocode_home_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
BEGIN
  IF NEW.latitude IS NULL AND NEW.state IS NOT NULL AND trim(NEW.state) <> '' THEN
    -- Try the city table first.
    IF NEW.city IS NOT NULL AND trim(NEW.city) <> '' THEN
      SELECT lat, lng INTO rec FROM public.geocode_us_city(NEW.city, NEW.state);
      IF rec.lat IS NOT NULL THEN
        NEW.latitude  := rec.lat;
        NEW.longitude := rec.lng;
        RETURN NEW;
      END IF;
    END IF;
    -- Fallback to state center.
    SELECT lat, lng INTO rec FROM public.geocode_us_state_center(NEW.state);
    IF rec.lat IS NOT NULL THEN
      NEW.latitude  := rec.lat;
      NEW.longitude := rec.lng;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.broadcast_to_home_game_rsvps(p_game_id uuid, p_message text, p_caller_user_id uuid, p_include_maybe boolean DEFAULT false)
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
    IF v_role IS DISTINCT FROM 'service_role' AND NOT public.fn_try_consume_home_rate_limit(
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
$function$


CREATE OR REPLACE FUNCTION public.broadcast_to_home_group_roster(p_group_id uuid, p_caller_user_id uuid, p_title text, p_body text, p_include_members boolean DEFAULT true, p_include_followers boolean DEFAULT true, p_link_path text DEFAULT NULL::text)
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
    IF v_role IS DISTINCT FROM 'service_role' THEN
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

    IF v_role IS DISTINCT FROM 'service_role' AND NOT public.fn_try_consume_home_rate_limit(
         p_caller_user_id, 'home_broadcast_group', 5, 60) THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'RATE_LIMIT_EXCEEDED',
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

    -- ★ NEW: audit-log the broadcast (recipient counts + content preview only)
    INSERT INTO public.commander_home_audit_log
      (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (p_group_id, p_caller_user_id, 'group', p_group_id, 'roster_broadcast',
            jsonb_build_object(
              'members_notified',   v_members_sent,
              'followers_notified', v_followers_sent,
              'title',              LEFT(p_title, 100),
              'body_preview',       LEFT(p_body,  200)));

    RETURN jsonb_build_object(
      'success', true,
      'members_notified', v_members_sent,
      'followers_notified', v_followers_sent,
      'total', v_members_sent + v_followers_sent
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.cancel_home_game(p_game_id uuid, p_caller_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_game RECORD; v_group RECORD;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    IF p_reason IS NOT NULL AND length(p_reason) > 1000 THEN
      RAISE EXCEPTION 'REASON_TOO_LONG' USING HINT = 'max 1000 chars';
    END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
    IF v_game.status IN ('completed','cancelled') THEN
        RAISE EXCEPTION 'GAME_ALREADY_FINAL' USING HINT = 'status is ' || v_game.status;
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;

    IF v_game.host_id <> p_caller_user_id
       AND v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members
                        WHERE group_id = v_game.group_id AND user_id = p_caller_user_id
                          AND role = 'admin' AND status = 'approved')
    THEN RAISE EXCEPTION 'NOT_AUTHORIZED_TO_CANCEL'; END IF;

    UPDATE commander_home_games
       SET status='cancelled', cancelled_at=NOW(), cancelled_by=p_caller_user_id,
           cancellation_reason=p_reason, updated_at=NOW()
     WHERE id = p_game_id;

    INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (v_game.group_id, p_caller_user_id, 'game', p_game_id, 'cancelled',
            jsonb_build_object('reason', p_reason, 'scheduled_date', v_game.scheduled_date));

    RETURN jsonb_build_object(
        'success', true, 'game_id', p_game_id, 'new_status', 'cancelled',
        'rsvps_to_notify', (SELECT COUNT(*) FROM commander_home_rsvps
                             WHERE game_id = p_game_id AND response IN ('yes','maybe','waitlist'))
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.checkin_to_home_game(p_game_id uuid, p_member_user_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_game  RECORD;
    v_group RECORD;
    v_rsvp  RECORD;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;

    -- Only host/owner/admin can mark check-ins
    IF v_game.host_id <> p_caller_user_id 
       AND v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members 
                        WHERE group_id = v_game.group_id AND user_id = p_caller_user_id
                          AND role = 'admin' AND status = 'approved')
    THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT * INTO v_rsvp FROM commander_home_rsvps 
     WHERE game_id = p_game_id AND user_id = p_member_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_RSVP' USING HINT = 'member has no RSVP for this game';
    END IF;

    UPDATE commander_home_rsvps
       SET checked_in_at = COALESCE(checked_in_at, NOW()),
           checked_in_by = p_caller_user_id,
           flaked        = false,
           updated_at    = NOW()
     WHERE id = v_rsvp.id;

    RETURN jsonb_build_object(
        'success', true, 
        'rsvp_id', v_rsvp.id, 
        'member_user_id', p_member_user_id,
        'checked_in_at', NOW()
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.claim_home_game_seat(p_game_id uuid, p_seat_number integer, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_game RECORD;
    v_rsvp RECORD;
    v_player_name text;
    v_updated boolean := false;
    v_seat_row_exists boolean;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    IF p_seat_number < 1 OR p_seat_number > 20 THEN
      RAISE EXCEPTION 'INVALID_SEAT_NUMBER';
    END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
    IF v_game.status NOT IN ('scheduled','confirmed','in_progress') THEN
      RAISE EXCEPTION 'GAME_NOT_ACTIVE';
    END IF;
    IF p_seat_number > COALESCE(v_game.max_players, 9) THEN
      RAISE EXCEPTION 'SEAT_EXCEEDS_MAX_PLAYERS';
    END IF;

    SELECT * INTO v_rsvp FROM commander_home_rsvps
     WHERE game_id = p_game_id AND user_id = p_caller_user_id;
    IF NOT FOUND OR v_rsvp.response <> 'yes' THEN
        RAISE EXCEPTION 'NO_YES_RSVP' USING HINT = 'must RSVP yes before claiming a seat';
    END IF;

    IF EXISTS (SELECT 1 FROM commander_home_seats
                WHERE game_id = p_game_id AND user_id = p_caller_user_id
                  AND status IN ('seated','away')) THEN
        RAISE EXCEPTION 'ALREADY_SEATED';
    END IF;

    SELECT COALESCE(display_name, full_name, username, 'Player') INTO v_player_name
      FROM profiles WHERE id = p_caller_user_id;

    UPDATE commander_home_seats
       SET user_id    = p_caller_user_id,
           player_name = v_player_name,
           status     = 'seated',
           seated_at  = NOW(),
           away_since = NULL,
           updated_at = NOW()
     WHERE game_id = p_game_id
       AND seat_number = p_seat_number
       AND status = 'empty';
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF NOT v_updated THEN
      SELECT EXISTS (SELECT 1 FROM commander_home_seats
                      WHERE game_id = p_game_id AND seat_number = p_seat_number)
        INTO v_seat_row_exists;

      IF v_seat_row_exists THEN
        RAISE EXCEPTION 'SEAT_TAKEN'
              USING HINT = 'seat ' || p_seat_number || ' is occupied';
      ELSE
        BEGIN
          INSERT INTO commander_home_seats
            (game_id, seat_number, user_id, player_name, status, seated_at)
          VALUES
            (p_game_id, p_seat_number, p_caller_user_id, v_player_name,
             'seated', NOW());
        EXCEPTION WHEN unique_violation THEN
          RAISE EXCEPTION 'SEAT_TAKEN'
                USING HINT = 'seat ' || p_seat_number || ' was claimed concurrently';
        END;
      END IF;
    END IF;

    -- Pass 13: mark this transaction as a legitimate self-checkin context
    -- so fn_enforce_home_rsvp_field_permissions allows the checked_in_at
    -- self-stamp below.
    PERFORM set_config('app.hg_self_checkin_allowed', '1', true);

    UPDATE commander_home_rsvps
       SET checked_in_at = COALESCE(checked_in_at, NOW()),
           flaked = false, updated_at = NOW()
     WHERE id = v_rsvp.id;

    RETURN jsonb_build_object('success', true, 'seat_number', p_seat_number);
END;
$function$


CREATE OR REPLACE FUNCTION public.clone_home_game(p_source_game_id uuid, p_new_scheduled_date date, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_source  RECORD;
    v_group   RECORD;
    v_new_id  uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    IF p_new_scheduled_date <= CURRENT_DATE THEN RAISE EXCEPTION 'DATE_MUST_BE_FUTURE'; END IF;

    SELECT * INTO v_source FROM commander_home_games WHERE id = p_source_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_GAME_NOT_FOUND'; END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_source.group_id;

    IF v_source.host_id <> p_caller_user_id 
       AND v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members 
                        WHERE group_id = v_source.group_id AND user_id = p_caller_user_id
                          AND role = 'admin' AND status = 'approved')
    THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

    -- Check dup on target date
    IF EXISTS (SELECT 1 FROM commander_home_games 
                WHERE group_id = v_source.group_id 
                  AND scheduled_date = p_new_scheduled_date 
                  AND status NOT IN ('cancelled'))
    THEN RAISE EXCEPTION 'DATE_ALREADY_SCHEDULED'; END IF;

    INSERT INTO commander_home_games (
        group_id, host_id, title, description, 
        game_type, stakes, format, 
        buyin_min, buyin_max,
        scheduled_date, start_time, end_time,
        address, address_visible_to, location_notes, neighborhood,
        max_players, min_players, allow_guests, guest_limit,
        food_drinks, special_rules, status
    ) VALUES (
        v_source.group_id, p_caller_user_id, v_source.title, v_source.description,
        v_source.game_type, v_source.stakes, v_source.format,
        v_source.buyin_min, v_source.buyin_max,
        p_new_scheduled_date, v_source.start_time, v_source.end_time,
        v_source.address, v_source.address_visible_to, v_source.location_notes, v_source.neighborhood,
        v_source.max_players, v_source.min_players, v_source.allow_guests, v_source.guest_limit,
        v_source.food_drinks, v_source.special_rules, 'scheduled'
    ) RETURNING id INTO v_new_id;

    INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (v_source.group_id, p_caller_user_id, 'game', v_new_id, 'cloned',
            jsonb_build_object('source_game_id', p_source_game_id, 'new_date', p_new_scheduled_date));

    RETURN jsonb_build_object('success', true, 'new_game_id', v_new_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.close_home_game_rsvps(p_game_id uuid, p_caller_user_id uuid, p_reopen boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_game RECORD; v_group RECORD;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;

    IF v_game.host_id <> p_caller_user_id AND v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members 
                        WHERE group_id = v_game.group_id AND user_id = p_caller_user_id
                          AND role = 'admin' AND status = 'approved')
    THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

    UPDATE commander_home_games 
       SET rsvps_closed = NOT p_reopen, updated_at = NOW()
     WHERE id = p_game_id;

    RETURN jsonb_build_object('success', true, 'rsvps_closed', NOT p_reopen);
END;
$function$


CREATE OR REPLACE FUNCTION public.complete_home_game(p_game_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_game    RECORD;
    v_group   RECORD;
    v_attended int;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;

    IF v_game.status = 'completed' THEN
        RAISE EXCEPTION 'ALREADY_COMPLETED';
    END IF;
    IF v_game.status = 'cancelled' THEN
        RAISE EXCEPTION 'CANNOT_COMPLETE_CANCELLED';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;

    IF v_game.host_id <> p_caller_user_id 
       AND v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (
           SELECT 1 FROM commander_home_members 
            WHERE group_id = v_game.group_id 
              AND user_id = p_caller_user_id
              AND role = 'admin' AND status = 'approved')
    THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    -- Flip to completed
    UPDATE commander_home_games
       SET status = 'completed', updated_at = NOW()
     WHERE id = p_game_id;

    -- Bump group's games_hosted
    UPDATE commander_home_groups
       SET games_hosted = COALESCE(games_hosted, 0) + 1
     WHERE id = v_game.group_id;

    -- Mark flakes: yes RSVPs that weren't checked in
    UPDATE commander_home_rsvps
       SET flaked = true
     WHERE game_id = p_game_id 
       AND response = 'yes' 
       AND checked_in_at IS NULL;

    -- Increment games_attended for checked-in members
    UPDATE commander_home_members m
       SET games_attended = COALESCE(m.games_attended, 0) + 1,
           last_attended  = NOW()
      FROM commander_home_rsvps r
     WHERE r.game_id = p_game_id
       AND r.user_id = m.user_id
       AND m.group_id = v_game.group_id
       AND r.checked_in_at IS NOT NULL;

    SELECT COUNT(*) INTO v_attended FROM commander_home_rsvps
     WHERE game_id = p_game_id AND checked_in_at IS NOT NULL;

    -- Audit
    INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (v_game.group_id, p_caller_user_id, 'game', p_game_id, 'completed',
            jsonb_build_object('attended', v_attended));

    RETURN jsonb_build_object(
        'success', true,
        'game_id', p_game_id,
        'attended_count', v_attended,
        'flaked_count', (SELECT COUNT(*) FROM commander_home_rsvps 
                          WHERE game_id = p_game_id AND flaked = true)
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.compute_home_group_quality_score(p_group_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group        RECORD;
    v_score        numeric := 0;
    v_avg_rating   numeric;
    v_completion   numeric;
    v_recency_days int;
    v_review_count int;
BEGIN
    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- Logo: required for discovery
    IF v_group.profile_photo_url IS NOT NULL THEN v_score := v_score + 15; END IF;
    -- Description present
    IF v_group.description IS NOT NULL AND length(v_group.description) > 50 THEN v_score := v_score + 10; END IF;
    -- Tagline present
    IF v_group.tagline IS NOT NULL THEN v_score := v_score + 5; END IF;
    -- Location set
    IF v_group.city IS NOT NULL AND v_group.state IS NOT NULL THEN v_score := v_score + 8; END IF;
    IF v_group.location_geog IS NOT NULL THEN v_score := v_score + 4; END IF;
    -- Member traction (capped)
    v_score := v_score + LEAST(15, COALESCE(v_group.member_count, 0) * 1.5);
    -- Games hosted (capped)
    v_score := v_score + LEAST(20, COALESCE(v_group.games_hosted, 0) * 2.0);
    -- Recency bonus
    v_recency_days := EXTRACT(day FROM (NOW() - COALESCE(v_group.last_activity_at, v_group.created_at)))::int;
    IF v_recency_days <= 7 THEN v_score := v_score + 10;
    ELSIF v_recency_days <= 21 THEN v_score := v_score + 6;
    ELSIF v_recency_days <= 45 THEN v_score := v_score + 2;
    END IF;
    -- Reviews
    SELECT COALESCE(AVG(r.rating), 0), COUNT(*) 
      INTO v_avg_rating, v_review_count
      FROM commander_home_game_reviews r
      JOIN commander_home_games g ON g.id = r.game_id
     WHERE g.group_id = p_group_id;
    IF v_review_count >= 3 AND v_avg_rating >= 4.0 THEN v_score := v_score + 8;
    ELSIF v_review_count >= 1 AND v_avg_rating >= 3.5 THEN v_score := v_score + 4;
    END IF;
    -- Tags present
    IF v_group.tags IS NOT NULL AND array_length(v_group.tags, 1) > 0 THEN v_score := v_score + 3; END IF;
    -- Public visibility
    IF NOT v_group.is_private THEN v_score := v_score + 2; END IF;

    RETURN ROUND(LEAST(100, v_score), 1);
END;
$function$


CREATE OR REPLACE FUNCTION public.create_home_game_from_template(p_template_id uuid, p_scheduled_date date, p_caller_user_id uuid, p_title text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_address_visible_to text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_template RECORD; v_group RECORD; v_new_id uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
      RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    IF p_scheduled_date <= CURRENT_DATE THEN
      RAISE EXCEPTION 'DATE_MUST_BE_FUTURE'; END IF;
    IF p_title IS NOT NULL AND length(p_title) > 200 THEN
      RAISE EXCEPTION 'TITLE_TOO_LONG' USING HINT = 'max 200 chars'; END IF;
    IF p_address IS NOT NULL AND length(p_address) > 500 THEN
      RAISE EXCEPTION 'ADDRESS_TOO_LONG' USING HINT = 'max 500 chars'; END IF;

    SELECT * INTO v_template FROM commander_home_game_templates WHERE id = p_template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND'; END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_template.group_id;
    IF v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members
                        WHERE group_id = v_template.group_id AND user_id = p_caller_user_id
                          AND role IN ('admin','owner') AND status='approved')
    THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    IF EXISTS (SELECT 1 FROM commander_home_games
                WHERE group_id = v_template.group_id AND scheduled_date = p_scheduled_date
                  AND status NOT IN ('cancelled'))
    THEN RAISE EXCEPTION 'DATE_ALREADY_SCHEDULED'; END IF;

    INSERT INTO commander_home_games (
        group_id, host_id, title, description,
        game_type, stakes, format, buyin_min, buyin_max,
        scheduled_date, start_time, address, address_visible_to,
        max_players, min_players, allow_guests, guest_limit,
        food_drinks, special_rules, status
    ) VALUES (
        v_template.group_id, p_caller_user_id,
        COALESCE(p_title, v_template.name), v_template.description,
        v_template.game_type, v_template.stakes, v_template.format,
        v_template.buyin_min, v_template.buyin_max,
        p_scheduled_date, v_template.default_start_time,
        p_address,
        COALESCE(p_address_visible_to,
                 CASE WHEN v_group.is_private THEN 'approved' ELSE 'rsvp' END),
        v_template.max_players, v_template.min_players,
        v_template.allow_guests, v_template.guest_limit,
        v_template.food_drinks, v_template.special_rules, 'scheduled'
    ) RETURNING id INTO v_new_id;

    INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (v_template.group_id, p_caller_user_id, 'game', v_new_id, 'from_template',
            jsonb_build_object('template_id', p_template_id, 'date', p_scheduled_date));

    RETURN jsonb_build_object('success', true, 'game_id', v_new_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.create_home_game_template(p_group_id uuid, p_caller_user_id uuid, p_name text, p_description text DEFAULT NULL::text, p_game_type text DEFAULT NULL::text, p_stakes text DEFAULT NULL::text, p_format text DEFAULT 'cash'::text, p_buyin_min numeric DEFAULT NULL::numeric, p_buyin_max numeric DEFAULT NULL::numeric, p_default_start_time time without time zone DEFAULT NULL::time without time zone, p_max_players integer DEFAULT NULL::integer, p_min_players integer DEFAULT NULL::integer, p_allow_guests boolean DEFAULT false, p_guest_limit integer DEFAULT NULL::integer, p_food_drinks text DEFAULT NULL::text, p_special_rules text DEFAULT NULL::text, p_is_default boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM commander_home_groups WHERE id = p_group_id AND owner_id = p_caller_user_id
        UNION
        SELECT 1 FROM commander_home_members WHERE group_id = p_group_id AND user_id = p_caller_user_id 
          AND role IN ('admin','owner') AND status='approved'
    ) THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    -- If setting as default, unset others first
    IF p_is_default THEN
        UPDATE commander_home_game_templates SET is_default = false WHERE group_id = p_group_id;
    END IF;

    INSERT INTO commander_home_game_templates (
        group_id, created_by, name, description,
        game_type, stakes, format, buyin_min, buyin_max,
        default_start_time, max_players, min_players,
        allow_guests, guest_limit, food_drinks, special_rules, is_default
    ) VALUES (
        p_group_id, p_caller_user_id, p_name, p_description,
        p_game_type, p_stakes, p_format, p_buyin_min, p_buyin_max,
        p_default_start_time, p_max_players, p_min_players,
        p_allow_guests, p_guest_limit, p_food_drinks, p_special_rules, p_is_default
    ) RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'template_id', v_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.create_home_group(p_caller_user_id uuid, p_name text, p_description text DEFAULT NULL::text, p_is_private boolean DEFAULT true, p_is_21_plus boolean DEFAULT false, p_is_charity boolean DEFAULT false, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_smoking_policy text DEFAULT NULL::text, p_timezone text DEFAULT 'America/New_York'::text, p_profile_photo_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id uuid;
  v_slug     text;
  v_onboarded_at timestamptz;
BEGIN
  -- Caller identity (fail-closed)
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller_user_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Required field validation
  IF p_name IS NULL OR length(TRIM(p_name)) < 3 THEN
    RAISE EXCEPTION 'NAME_REQUIRED' USING HINT = 'Group name must be 3+ characters';
  END IF;
  IF length(p_name) > 80 THEN
    RAISE EXCEPTION 'NAME_TOO_LONG' USING HINT = 'Max 80 chars';
  END IF;
  IF p_description IS NOT NULL AND length(p_description) > 2000 THEN
    RAISE EXCEPTION 'DESCRIPTION_TOO_LONG' USING HINT = 'Max 2000 chars';
  END IF;

  -- Profile photo required (matches existing trigger enforcement)
  IF p_profile_photo_url IS NULL OR length(TRIM(p_profile_photo_url)) = 0 THEN
    RAISE EXCEPTION 'PROFILE_PHOTO_REQUIRED'
      USING HINT = 'Upload a group photo before creating';
  END IF;

  -- Onboarding check
  SELECT home_games_onboarded_at INTO v_onboarded_at
    FROM public.profiles WHERE id = p_caller_user_id;
  IF v_onboarded_at IS NULL THEN
    RAISE EXCEPTION 'NOT_ONBOARDED'
      USING HINT = 'Complete HG onboarding before creating a group';
  END IF;

  -- Rate limit (3 new groups per hour per user)
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.fn_try_consume_home_rate_limit(
           p_caller_user_id, 'home_group_create', 3, 60) THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED'
      USING HINT = 'Limit of 3 new groups per hour per user';
  END IF;

  -- Create group + initial owner membership atomically
  INSERT INTO public.commander_home_groups
    (name, description, owner_id, is_private, is_21_plus, is_charity,
     city, state, smoking_policy, timezone, profile_photo_url,
     member_count, is_active, created_at)
  VALUES
    (TRIM(p_name), NULLIF(TRIM(COALESCE(p_description, '')), ''),
     p_caller_user_id, p_is_private, p_is_21_plus, p_is_charity,
     NULLIF(TRIM(COALESCE(p_city, '')), ''),
     NULLIF(TRIM(COALESCE(p_state, '')), ''),
     p_smoking_policy, COALESCE(p_timezone, 'America/New_York'),
     p_profile_photo_url, 1, true, NOW())
  RETURNING id INTO v_group_id;

  INSERT INTO public.commander_home_members
    (group_id, user_id, role, status, joined_at, created_at)
  VALUES
    (v_group_id, p_caller_user_id, 'owner', 'approved', NOW(), NOW());

  -- social_pages row auto-creates via trg_fn_autocreate_home_group_social_page
  -- Read slug after trigger fires
  SELECT slug INTO v_slug FROM public.social_pages
   WHERE linked_entity_type='home_group'
     AND linked_entity_id = v_group_id::text
   LIMIT 1;

  -- Audit-log the creation
  INSERT INTO public.commander_home_audit_log
    (group_id, actor_id, target_type, target_id, action, metadata)
  VALUES
    (v_group_id, p_caller_user_id, 'group', v_group_id, 'group_created',
     jsonb_build_object('name', LEFT(p_name, 80),
                        'is_private', p_is_private,
                        'city', p_city));

  RETURN jsonb_build_object(
    'success',  true,
    'group_id', v_group_id,
    'slug',     v_slug,
    'redirect_to', '/hub/home-games/' || COALESCE(v_slug, v_group_id::text) || '/dashboard'
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.create_home_group_invite_token(p_group_id uuid, p_caller_user_id uuid, p_max_uses integer DEFAULT NULL::integer, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_label text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_group RECORD; v_is_host boolean; v_token text; v_new_id uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF NOT public.fn_try_consume_home_rate_limit(
         p_caller_user_id, 'home_invite_token_create', 20, 60) THEN
      RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED' USING HINT = 'invite tokens: 20 per 60 min.';
    END IF;

    IF p_label IS NOT NULL AND length(p_label) > 100 THEN
      RAISE EXCEPTION 'LABEL_TOO_LONG' USING HINT = 'max 100 chars';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF NOT v_group.is_active THEN RAISE EXCEPTION 'GROUP_INACTIVE'; END IF;

    v_is_host := (v_group.owner_id = p_caller_user_id)
              OR EXISTS (SELECT 1 FROM commander_home_members
                          WHERE group_id = p_group_id AND user_id = p_caller_user_id
                            AND role = 'admin' AND status = 'approved');
    IF NOT v_is_host THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    LOOP
        v_token := upper(substr(translate(encode(gen_random_bytes(10), 'base64'), '+/=0O1IL', ''), 1, 12));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM commander_home_invite_tokens WHERE token = v_token);
    END LOOP;

    INSERT INTO commander_home_invite_tokens
        (group_id, created_by, token, max_uses, expires_at, label)
    VALUES
        (p_group_id, p_caller_user_id, v_token, p_max_uses, p_expires_at, p_label)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true, 'token_id', v_new_id, 'token', v_token,
        'share_url_hint', '/hub/home-games/join/' || v_token);
END;
$function$


CREATE OR REPLACE FUNCTION public.create_home_group_poll(p_group_id uuid, p_caller_user_id uuid, p_question text, p_options jsonb, p_poll_type text DEFAULT 'single_choice'::text, p_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group    RECORD;
    v_new_id   uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    IF p_question IS NULL OR length(trim(p_question)) = 0 THEN
        RAISE EXCEPTION 'EMPTY_QUESTION';
    END IF;
    IF jsonb_array_length(p_options) < 2 THEN
        RAISE EXCEPTION 'MIN_TWO_OPTIONS';
    END IF;
    IF jsonb_array_length(p_options) > 20 THEN
        RAISE EXCEPTION 'MAX_TWENTY_OPTIONS';
    END IF;
    IF p_poll_type NOT IN ('single_choice','multi_choice','date_picker') THEN
        RAISE EXCEPTION 'INVALID_POLL_TYPE';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

    -- Any approved member can create polls
    IF v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members 
                        WHERE group_id = p_group_id AND user_id = p_caller_user_id
                          AND status = 'approved')
    THEN
        RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;

    INSERT INTO commander_home_polls 
        (group_id, created_by, question, poll_type, closes_at, options)
    VALUES 
        (p_group_id, p_caller_user_id, trim(p_question), p_poll_type, p_closes_at, p_options)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'poll_id', v_new_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.create_home_group_post(p_group_id uuid, p_caller_user_id uuid, p_content text, p_post_type text DEFAULT 'update'::text, p_image_urls text[] DEFAULT NULL::text[], p_video_url text DEFAULT NULL::text, p_is_pinned boolean DEFAULT false, p_visible_to text DEFAULT 'members'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group         RECORD;
    v_caller_role   text;
    v_caller_status text;
    v_is_host       boolean := false;
    v_new_id        uuid;
    v_valid_types   text[] := ARRAY['announcement','game_recap','photo','update'];
    v_valid_visi    text[] := ARRAY['public','members'];
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    -- Rate limit: 15 posts / 60 min per user
    IF NOT public.fn_try_consume_home_rate_limit(
         p_caller_user_id, 'home_post_create', 15, 60) THEN
      RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED'
            USING HINT = 'post creation: 15 per 60 min.';
    END IF;

    IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
        RAISE EXCEPTION 'EMPTY_CONTENT'; END IF;
    IF length(p_content) > 10000 THEN
        RAISE EXCEPTION 'CONTENT_TOO_LONG'; END IF;
    IF NOT (p_post_type = ANY (v_valid_types)) THEN
        RAISE EXCEPTION 'INVALID_POST_TYPE'
              USING HINT = 'must be one of: announcement, game_recap, photo, update';
    END IF;
    IF NOT (p_visible_to = ANY (v_valid_visi)) THEN
        RAISE EXCEPTION 'INVALID_VISIBILITY'
              USING HINT = 'must be one of: public, members';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF NOT v_group.is_active THEN RAISE EXCEPTION 'GROUP_INACTIVE'; END IF;

    IF v_group.owner_id = p_caller_user_id THEN
        v_caller_role   := 'owner';
        v_caller_status := 'approved';
        v_is_host       := true;
    ELSE
        SELECT role, status INTO v_caller_role, v_caller_status
          FROM commander_home_members
         WHERE group_id = p_group_id AND user_id = p_caller_user_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'NOT_A_MEMBER'; END IF;
        IF v_caller_status = 'banned'   THEN RAISE EXCEPTION 'BANNED'; END IF;
        IF v_caller_status <> 'approved' THEN RAISE EXCEPTION 'MEMBERSHIP_NOT_APPROVED'; END IF;
        v_is_host := (v_caller_role = 'admin');
    END IF;

    IF p_is_pinned AND NOT v_is_host THEN RAISE EXCEPTION 'PIN_REQUIRES_HOST'; END IF;
    IF p_visible_to = 'public' AND NOT v_is_host THEN
        RAISE EXCEPTION 'PUBLIC_VISIBILITY_REQUIRES_HOST';
    END IF;

    INSERT INTO commander_home_posts (
        group_id, author_id, content, post_type,
        image_urls, video_url, is_pinned, is_published, visible_to
    ) VALUES (
        p_group_id, p_caller_user_id, trim(p_content), p_post_type,
        p_image_urls, p_video_url, p_is_pinned, true, p_visible_to
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'post_id', v_new_id,
        'group_id', p_group_id,
        'post_type', p_post_type,
        'visible_to', p_visible_to,
        'is_pinned', p_is_pinned
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.delete_home_group_post(p_post_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_post   RECORD;
    v_group  RECORD;
    v_is_host boolean;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_post FROM commander_home_posts WHERE id = p_post_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', true, 'already_gone', true); END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_post.group_id;

    v_is_host := (v_group.owner_id = p_caller_user_id)
              OR EXISTS (SELECT 1 FROM commander_home_members 
                          WHERE group_id = v_post.group_id AND user_id = p_caller_user_id
                            AND role = 'admin' AND status = 'approved');

    IF v_post.author_id <> p_caller_user_id AND NOT v_is_host THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    DELETE FROM commander_home_posts WHERE id = p_post_id;

    IF v_is_host AND v_post.author_id <> p_caller_user_id THEN
        INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
        VALUES (v_post.group_id, p_caller_user_id, 'post', p_post_id, 'moderated_delete',
                jsonb_build_object('original_author', v_post.author_id));
    END IF;

    RETURN jsonb_build_object('success', true, 'post_id', p_post_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.edit_home_game(p_game_id uuid, p_caller_user_id uuid, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_game    RECORD;
    v_group   RECORD;
    v_is_host boolean;
    v_allowed text[] := ARRAY[
        'title','description','game_type','stakes','format',
        'buyin_min','buyin_max','scheduled_date','start_time','end_time',
        'address','address_visible_to','location_notes','neighborhood',
        'max_players','min_players','allow_guests','guest_limit',
        'food_drinks','special_rules','cover_photo_url','status'
    ];
    v_key text;
    v_bad_keys text[] := ARRAY[]::text[];
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
    IF v_game.status IN ('completed','cancelled') THEN
        RAISE EXCEPTION 'GAME_IS_FINAL';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;

    v_is_host := (v_game.host_id = p_caller_user_id)
              OR (v_group.owner_id = p_caller_user_id)
              OR EXISTS (SELECT 1 FROM commander_home_members 
                          WHERE group_id = v_game.group_id AND user_id = p_caller_user_id
                            AND role = 'admin' AND status = 'approved');
    IF NOT v_is_host THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_updates) LOOP
        IF NOT (v_key = ANY (v_allowed)) THEN
            v_bad_keys := array_append(v_bad_keys, v_key);
        END IF;
    END LOOP;
    IF array_length(v_bad_keys, 1) > 0 THEN
        RAISE EXCEPTION 'DISALLOWED_FIELDS: %', array_to_string(v_bad_keys, ',');
    END IF;

    -- Validate status transition
    IF p_updates ? 'status' AND NOT (p_updates->>'status' IN ('draft','scheduled','confirmed','in_progress')) THEN
        RAISE EXCEPTION 'INVALID_STATUS' 
              USING HINT = 'use cancel_home_game or complete_home_game for final states';
    END IF;

    UPDATE commander_home_games SET
        title              = CASE WHEN p_updates ? 'title' THEN p_updates->>'title' ELSE title END,
        description        = CASE WHEN p_updates ? 'description' THEN p_updates->>'description' ELSE description END,
        game_type          = CASE WHEN p_updates ? 'game_type' THEN p_updates->>'game_type' ELSE game_type END,
        stakes             = CASE WHEN p_updates ? 'stakes' THEN p_updates->>'stakes' ELSE stakes END,
        format             = CASE WHEN p_updates ? 'format' THEN p_updates->>'format' ELSE format END,
        buyin_min          = CASE WHEN p_updates ? 'buyin_min' THEN (p_updates->>'buyin_min')::int ELSE buyin_min END,
        buyin_max          = CASE WHEN p_updates ? 'buyin_max' THEN (p_updates->>'buyin_max')::int ELSE buyin_max END,
        scheduled_date     = CASE WHEN p_updates ? 'scheduled_date' THEN (p_updates->>'scheduled_date')::date ELSE scheduled_date END,
        start_time         = CASE WHEN p_updates ? 'start_time' THEN (p_updates->>'start_time')::time ELSE start_time END,
        end_time           = CASE WHEN p_updates ? 'end_time' THEN (p_updates->>'end_time')::time ELSE end_time END,
        address            = CASE WHEN p_updates ? 'address' THEN p_updates->>'address' ELSE address END,
        address_visible_to = CASE WHEN p_updates ? 'address_visible_to' THEN p_updates->>'address_visible_to' ELSE address_visible_to END,
        location_notes     = CASE WHEN p_updates ? 'location_notes' THEN p_updates->>'location_notes' ELSE location_notes END,
        neighborhood       = CASE WHEN p_updates ? 'neighborhood' THEN p_updates->>'neighborhood' ELSE neighborhood END,
        max_players        = CASE WHEN p_updates ? 'max_players' THEN (p_updates->>'max_players')::int ELSE max_players END,
        min_players        = CASE WHEN p_updates ? 'min_players' THEN (p_updates->>'min_players')::int ELSE min_players END,
        allow_guests       = CASE WHEN p_updates ? 'allow_guests' THEN (p_updates->>'allow_guests')::boolean ELSE allow_guests END,
        guest_limit        = CASE WHEN p_updates ? 'guest_limit' THEN (p_updates->>'guest_limit')::int ELSE guest_limit END,
        food_drinks        = CASE WHEN p_updates ? 'food_drinks' THEN p_updates->>'food_drinks' ELSE food_drinks END,
        special_rules      = CASE WHEN p_updates ? 'special_rules' THEN p_updates->>'special_rules' ELSE special_rules END,
        cover_photo_url    = CASE WHEN p_updates ? 'cover_photo_url' THEN p_updates->>'cover_photo_url' ELSE cover_photo_url END,
        status             = CASE WHEN p_updates ? 'status' THEN p_updates->>'status' ELSE status END,
        updated_at         = NOW()
     WHERE id = p_game_id;

    INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (v_game.group_id, p_caller_user_id, 'game', p_game_id, 'edited',
            jsonb_build_object('fields', (SELECT array_agg(k) FROM jsonb_object_keys(p_updates) k)));

    RETURN jsonb_build_object('success', true, 'game_id', p_game_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.edit_home_group(p_group_id uuid, p_caller_user_id uuid, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group       RECORD;
    v_is_host     boolean;
    v_allowed     text[] := ARRAY[
        'name','description','tagline','profile_photo_url','cover_photo_url',
        'city','state','zip_code','latitude','longitude',
        'default_game_type','default_stakes','typical_buyin_min','typical_buyin_max',
        'max_players','typical_day','typical_time','frequency',
        'is_private','requires_approval','tags'
    ];
    v_key         text;
    v_bad_keys    text[] := ARRAY[]::text[];
    v_new_name    text;
    v_new_lat     numeric;
    v_new_lng     numeric;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

    v_is_host := (v_group.owner_id = p_caller_user_id) OR EXISTS (
        SELECT 1 FROM commander_home_members
         WHERE group_id = p_group_id AND user_id = p_caller_user_id
           AND role = 'admin' AND status = 'approved');

    IF NOT v_is_host THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    -- Allow-list validation
    FOR v_key IN SELECT jsonb_object_keys(p_updates) LOOP
        IF NOT (v_key = ANY (v_allowed)) THEN
            v_bad_keys := array_append(v_bad_keys, v_key);
        END IF;
    END LOOP;
    IF array_length(v_bad_keys, 1) > 0 THEN
        RAISE EXCEPTION 'DISALLOWED_FIELDS: %', array_to_string(v_bad_keys, ',');
    END IF;

    -- F165: reject empty name if name is being set
    IF p_updates ? 'name' THEN
        v_new_name := p_updates->>'name';
        IF v_new_name IS NULL OR length(trim(v_new_name)) = 0 THEN
            RAISE EXCEPTION 'INVALID_NAME'
                  USING HINT = 'name cannot be empty or whitespace';
        END IF;
        -- Also surface the CHECK constraint as a clean app error
        IF length(v_new_name) > 120 THEN
            RAISE EXCEPTION 'NAME_TOO_LONG'
                  USING HINT = 'max 120 characters';
        END IF;
    END IF;

    -- F166: validate lat/lng ranges (Earth coords only)
    IF p_updates ? 'latitude' AND p_updates->>'latitude' IS NOT NULL THEN
        v_new_lat := (p_updates->>'latitude')::numeric;
        IF v_new_lat < -90 OR v_new_lat > 90 THEN
            RAISE EXCEPTION 'INVALID_LATITUDE'
                  USING HINT = 'latitude must be in [-90, 90]';
        END IF;
    END IF;
    IF p_updates ? 'longitude' AND p_updates->>'longitude' IS NOT NULL THEN
        v_new_lng := (p_updates->>'longitude')::numeric;
        IF v_new_lng < -180 OR v_new_lng > 180 THEN
            RAISE EXCEPTION 'INVALID_LONGITUDE'
                  USING HINT = 'longitude must be in [-180, 180]';
        END IF;
    END IF;

    -- Existing guard: profile_photo_url cannot be cleared
    IF p_updates ? 'profile_photo_url'
       AND (p_updates->>'profile_photo_url' IS NULL
            OR trim(p_updates->>'profile_photo_url') = '') THEN
        RAISE EXCEPTION 'CANNOT_CLEAR_LOGO';
    END IF;

    UPDATE commander_home_groups SET
        -- F165 fix: use CASE-WHEN like every other field (was COALESCE)
        name               = CASE WHEN p_updates ? 'name' THEN p_updates->>'name' ELSE name END,
        description        = CASE WHEN p_updates ? 'description' THEN p_updates->>'description' ELSE description END,
        tagline            = CASE WHEN p_updates ? 'tagline' THEN p_updates->>'tagline' ELSE tagline END,
        profile_photo_url  = COALESCE(p_updates->>'profile_photo_url', profile_photo_url),
        cover_photo_url    = CASE WHEN p_updates ? 'cover_photo_url' THEN p_updates->>'cover_photo_url' ELSE cover_photo_url END,
        city               = CASE WHEN p_updates ? 'city' THEN p_updates->>'city' ELSE city END,
        state              = CASE WHEN p_updates ? 'state' THEN p_updates->>'state' ELSE state END,
        zip_code           = CASE WHEN p_updates ? 'zip_code' THEN p_updates->>'zip_code' ELSE zip_code END,
        latitude           = CASE WHEN p_updates ? 'latitude' THEN (p_updates->>'latitude')::numeric ELSE latitude END,
        longitude          = CASE WHEN p_updates ? 'longitude' THEN (p_updates->>'longitude')::numeric ELSE longitude END,
        default_game_type  = CASE WHEN p_updates ? 'default_game_type' THEN p_updates->>'default_game_type' ELSE default_game_type END,
        default_stakes     = CASE WHEN p_updates ? 'default_stakes' THEN p_updates->>'default_stakes' ELSE default_stakes END,
        typical_buyin_min  = CASE WHEN p_updates ? 'typical_buyin_min' THEN (p_updates->>'typical_buyin_min')::int ELSE typical_buyin_min END,
        typical_buyin_max  = CASE WHEN p_updates ? 'typical_buyin_max' THEN (p_updates->>'typical_buyin_max')::int ELSE typical_buyin_max END,
        max_players        = CASE WHEN p_updates ? 'max_players' THEN (p_updates->>'max_players')::int ELSE max_players END,
        typical_day        = CASE WHEN p_updates ? 'typical_day' THEN p_updates->>'typical_day' ELSE typical_day END,
        typical_time       = CASE WHEN p_updates ? 'typical_time' THEN (p_updates->>'typical_time')::time ELSE typical_time END,
        frequency          = CASE WHEN p_updates ? 'frequency' THEN p_updates->>'frequency' ELSE frequency END,
        is_private         = CASE WHEN p_updates ? 'is_private' THEN (p_updates->>'is_private')::boolean ELSE is_private END,
        requires_approval  = CASE WHEN p_updates ? 'requires_approval' THEN (p_updates->>'requires_approval')::boolean ELSE requires_approval END,
        tags               = CASE WHEN p_updates ? 'tags'
                                  THEN ARRAY(SELECT jsonb_array_elements_text(p_updates->'tags'))::text[]
                                  ELSE tags END,
        updated_at         = NOW()
     WHERE id = p_group_id;

    INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (p_group_id, p_caller_user_id, 'group', p_group_id, 'edited',
            jsonb_build_object('fields', (SELECT array_agg(k) FROM jsonb_object_keys(p_updates) k)));

    RETURN jsonb_build_object(
        'success', true,
        'group_id', p_group_id,
        'fields_updated', (SELECT array_agg(k) FROM jsonb_object_keys(p_updates) k)
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.edit_home_group_post(p_post_id uuid, p_caller_user_id uuid, p_content text, p_image_urls text[] DEFAULT NULL::text[], p_is_pinned boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_post   RECORD;
    v_group  RECORD;
    v_is_host boolean;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_post FROM commander_home_posts WHERE id = p_post_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'POST_NOT_FOUND'; END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_post.group_id;

    v_is_host := (v_group.owner_id = p_caller_user_id)
              OR EXISTS (SELECT 1 FROM commander_home_members 
                          WHERE group_id = v_post.group_id AND user_id = p_caller_user_id
                            AND role = 'admin' AND status = 'approved');

    -- Author OR host can edit
    IF v_post.author_id <> p_caller_user_id AND NOT v_is_host THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
        RAISE EXCEPTION 'EMPTY_CONTENT';
    END IF;
    IF length(p_content) > 10000 THEN
        RAISE EXCEPTION 'CONTENT_TOO_LONG';
    END IF;

    -- Only hosts can pin
    IF p_is_pinned IS NOT NULL AND p_is_pinned <> v_post.is_pinned AND NOT v_is_host THEN
        RAISE EXCEPTION 'PIN_REQUIRES_HOST';
    END IF;

    UPDATE commander_home_posts
       SET content     = trim(p_content),
           image_urls  = COALESCE(p_image_urls, image_urls),
           is_pinned   = COALESCE(p_is_pinned, is_pinned),
           updated_at  = NOW()
     WHERE id = p_post_id;

    RETURN jsonb_build_object('success', true, 'post_id', p_post_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.enforce_home_group_logo_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.profile_photo_url IS NULL OR trim(NEW.profile_photo_url) = '' THEN
        RAISE EXCEPTION 'PROFILE_PHOTO_REQUIRED' 
              USING HINT = 'home groups must have a logo (Phase 17 requirement)',
                    ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.export_home_group_members_csv(p_group_id uuid, p_caller_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group   RECORD;
    v_csv     text := '';
    v_member  RECORD;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF v_group.owner_id <> p_caller_user_id 
       AND NOT EXISTS (SELECT 1 FROM commander_home_members 
                        WHERE group_id = p_group_id AND user_id = p_caller_user_id
                          AND role = 'admin' AND status = 'approved')
    THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    -- Header
    v_csv := 'display_name,username,email,role,status,is_regular,games_attended,flake_strikes,last_attended,joined_at' || chr(10);

    FOR v_member IN
        SELECT 
            COALESCE(p.display_name, p.full_name, '') AS display_name,
            COALESCE(p.username, '') AS username,
            COALESCE(au.email, '') AS email,
            m.role, m.status, 
            COALESCE(m.is_regular, false) AS is_regular,
            COALESCE(m.games_attended, 0) AS games_attended,
            COALESCE(m.flake_strikes, 0) AS flake_strikes,
            m.last_attended, m.joined_at
          FROM commander_home_members m
          LEFT JOIN profiles p ON p.id = m.user_id
          LEFT JOIN auth.users au ON au.id = m.user_id
         WHERE m.group_id = p_group_id
         ORDER BY m.joined_at
    LOOP
        v_csv := v_csv 
            || '"' || replace(v_member.display_name, '"', '""') || '",'
            || '"' || replace(v_member.username, '"', '""') || '",'
            || '"' || replace(v_member.email, '"', '""') || '",'
            || v_member.role || ','
            || v_member.status || ','
            || v_member.is_regular || ','
            || v_member.games_attended || ','
            || v_member.flake_strikes || ','
            || COALESCE(v_member.last_attended::text, '') || ','
            || COALESCE(v_member.joined_at::text, '')
            || chr(10);
    END LOOP;

    RETURN v_csv;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_bump_home_group_activity(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_group_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE commander_home_groups
     SET last_activity_at = NOW()
   WHERE id = p_group_id;
END
$function$


CREATE OR REPLACE FUNCTION public.fn_cleanup_home_group_polymorphic_refs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1) Clean up the linked social_page
  BEGIN
    DELETE FROM public.social_pages
    WHERE linked_entity_type = 'home_group'
      AND linked_entity_id = OLD.id::text;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_cleanup_home_group_polymorphic_refs: social_pages cleanup failed for group=%: % (%)',
      OLD.id, SQLERRM, SQLSTATE;
  END;

  -- 2) Clean up the linked conversation
  BEGIN
    IF OLD.messenger_conversation_id IS NOT NULL THEN
      DELETE FROM public.conversations
      WHERE id = OLD.messenger_conversation_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_cleanup_home_group_polymorphic_refs: conversations cleanup failed for group=%: % (%)',
      OLD.id, SQLERRM, SQLSTATE;
  END;

  RETURN OLD;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_cleanup_stale_scheduled_home_games(p_grace_days integer DEFAULT 1)
 RETURNS TABLE(rows_updated integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_updated int;
BEGIN
    IF p_grace_days < 0 THEN
        RAISE EXCEPTION 'p_grace_days must be non-negative' USING ERRCODE = '22023';
    END IF;

    UPDATE commander_home_games
       SET status     = 'completed',
           updated_at = NOW()
     WHERE status = 'scheduled'
       AND scheduled_date < CURRENT_DATE - (p_grace_days || ' days')::interval;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN QUERY SELECT v_updated;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_create_home_group_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_conv_id uuid;
BEGIN
    INSERT INTO conversations (participant_ids, created_by, category, is_pinned, is_read_only)
    VALUES (ARRAY[NEW.owner_id]::uuid[], NEW.owner_id, 'home_group', false, false)
    RETURNING id INTO v_conv_id;
    UPDATE commander_home_groups SET messenger_conversation_id = v_conv_id WHERE id = NEW.id;
    INSERT INTO messenger_participants (conversation_id, user_id, role, joined_at)
    VALUES (v_conv_id, NEW.owner_id, 'admin', NOW()) ON CONFLICT DO NOTHING;
    RETURN NEW;
END; $function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rsvps int;
  v_reservations int;
  v_seats int;
  v_tables int;
BEGIN
  -- Service-role bypass (GUC-gated — cleanup scripts must opt in)
  IF COALESCE(current_setting('app.hg_skip_active_game_delete_check', true), '') = '1' THEN
    RETURN OLD;
  END IF;

  -- Completed/cancelled/ended games are OK to delete — notifications already sent
  IF OLD.status IN ('cancelled','completed','ended') THEN
    RETURN OLD;
  END IF;

  -- Count live dependencies
  SELECT COUNT(*) INTO v_rsvps
    FROM commander_home_rsvps WHERE game_id = OLD.id;
  SELECT COUNT(*) INTO v_reservations
    FROM commander_home_seat_reservations sr
    JOIN commander_home_game_tables gt ON gt.id = sr.table_id
   WHERE gt.game_id = OLD.id AND sr.status <> 'released';
  SELECT COUNT(*) INTO v_seats
    FROM commander_home_seats WHERE game_id = OLD.id AND status <> 'empty';
  SELECT COUNT(*) INTO v_tables
    FROM commander_home_game_tables WHERE game_id = OLD.id;

  IF v_rsvps + v_reservations + v_seats > 0 THEN
    RAISE EXCEPTION 'GAME_HAS_ACTIVE_STATE'
          USING HINT = 'cancel the game first (sends notifications) before deleting. '
                    || 'Dependencies: rsvps=' || v_rsvps
                    || ', reservations=' || v_reservations
                    || ', seats=' || v_seats
                    || '. Completed games can be deleted after status transition.';
  END IF;

  RETURN OLD;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_field_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
    -- Service role and unauthenticated bypass
    IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;

    -- Nested-trigger bypass for legitimate recompute paths
    IF pg_trigger_depth() > 1 THEN
      RETURN NEW;
    END IF;

    IF NEW.rsvp_yes       IS DISTINCT FROM OLD.rsvp_yes
       OR NEW.rsvp_maybe  IS DISTINCT FROM OLD.rsvp_maybe
       OR NEW.rsvp_no     IS DISTINCT FROM OLD.rsvp_no
       OR NEW.waitlist_count IS DISTINCT FROM OLD.waitlist_count
       OR NEW.created_at  IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
            USING HINT = 'rsvp_yes/maybe/no, waitlist_count, and created_at '
                       || 'are maintained by the system; modify via RSVP RPCs';
    END IF;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_insert_and_cancel_meta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
  v_caller uuid := auth.uid();
BEGIN
  -- Service-role / postgres bypass (cancel_home_game, complete_home_game,
  -- clone_home_game, cron jobs, migrations all land here)
  IF v_role IN ('postgres','supabase_admin','service_role',
                'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- ─────────────────────── INSERT guards ───────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Status must be draft or scheduled on user-initiated creation
    IF NEW.status IS NOT NULL AND NEW.status NOT IN ('draft','scheduled') THEN
      RAISE EXCEPTION 'INVALID_INITIAL_STATUS'
        USING HINT = 'new games must start as draft or scheduled; '
                  || 'cannot INSERT with status=' || NEW.status
                  || '. Use the lifecycle RPCs to transition later.';
    END IF;

    -- Cancellation metadata must be NULL on INSERT
    IF NEW.cancelled_at IS NOT NULL
       OR NEW.cancelled_by IS NOT NULL
       OR COALESCE(trim(NEW.cancellation_reason), '') <> '' THEN
      RAISE EXCEPTION 'CANCELLATION_METADATA_ON_INSERT'
        USING HINT = 'cancelled_at, cancelled_by, cancellation_reason must be NULL '
                  || 'on new games. Use cancel_home_game RPC to cancel later.';
    END IF;

    RETURN NEW;
  END IF;

  -- ─────────────────────── UPDATE guards ───────────────────────
  IF TG_OP = 'UPDATE' THEN
    -- Check if any cancellation metadata is being changed
    IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
       OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
    THEN
      -- Only legitimate during a status→cancelled transition
      IF NOT (NEW.status = 'cancelled' AND OLD.status <> 'cancelled') THEN
        RAISE EXCEPTION 'CANCELLATION_METADATA_WITHOUT_TRANSITION'
          USING HINT = 'cancelled_at/cancelled_by/cancellation_reason can only be set '
                    || 'during a status transition to cancelled. Use cancel_home_game RPC.';
      END IF;

      -- Attribution check: cancelled_by must be the caller
      IF NEW.cancelled_by IS NOT NULL AND NEW.cancelled_by <> v_caller THEN
        RAISE EXCEPTION 'CANCEL_ATTRIBUTION_FORGERY'
          USING HINT = 'cancelled_by must equal auth.uid(); '
                    || 'cannot attribute the cancellation to another user';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_lifecycle_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
  v_new_start timestamptz;
  v_scheduled_start timestamptz;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'GAME_STATUS_TERMINAL'
        USING HINT = 'cancelled games cannot be revived';
    END IF;
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'GAME_STATUS_TERMINAL'
        USING HINT = 'completed games cannot transition out of completed';
    END IF;
    IF OLD.status = 'draft' AND NEW.status NOT IN ('scheduled','cancelled') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from draft, allowed next: scheduled or cancelled';
    END IF;
    IF OLD.status = 'scheduled' AND NEW.status NOT IN ('confirmed','in_progress','completed','cancelled','draft') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from scheduled, allowed next: confirmed, in_progress, completed, cancelled, draft';
    END IF;
    IF OLD.status = 'confirmed' AND NEW.status NOT IN ('scheduled','in_progress','completed','cancelled') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from confirmed, allowed next: scheduled, in_progress, completed, cancelled';
    END IF;
    IF OLD.status = 'in_progress' AND NEW.status NOT IN ('completed','cancelled') THEN
      RAISE EXCEPTION 'INVALID_GAME_TRANSITION'
        USING HINT = 'from in_progress, allowed next: completed or cancelled';
    END IF;

    -- Pass 36a: direct completion (scheduled/confirmed → completed) requires
    -- the game's scheduled start time to have elapsed. This prevents hosts
    -- from marking future games as completed to unlock fake reviews.
    IF OLD.status IN ('scheduled','confirmed') AND NEW.status = 'completed' THEN
      v_scheduled_start := (OLD.scheduled_date + OLD.start_time)::timestamptz;
      IF v_scheduled_start IS NULL OR v_scheduled_start > now() THEN
        RAISE EXCEPTION 'GAME_NOT_YET_STARTED'
          USING HINT = 'cannot complete a game whose scheduled start is in the future. '
                    || 'Transition through in_progress first, or wait until the scheduled start time.';
      END IF;
    END IF;
  END IF;

  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     OR NEW.start_time  IS DISTINCT FROM OLD.start_time THEN
    IF OLD.status NOT IN ('draft','scheduled','confirmed') THEN
      RAISE EXCEPTION 'GAME_SCHEDULE_LOCKED'
        USING HINT = 'cannot change schedule on a ' || OLD.status || ' game';
    END IF;
    IF NEW.scheduled_date IS NOT NULL AND NEW.start_time IS NOT NULL THEN
      v_new_start := (NEW.scheduled_date + NEW.start_time)::timestamptz;
      IF v_new_start < now() THEN
        RAISE EXCEPTION 'GAME_SCHEDULE_PAST'
          USING HINT = 'cannot backdate schedule into the past on an active game; cancel instead';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_photos_is_featured()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_host boolean;
BEGIN
  IF auth.role() = 'service_role' OR v_caller IS NULL THEN RETURN NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    SELECT
      EXISTS (SELECT 1 FROM commander_home_games g WHERE g.id = NEW.game_id AND g.host_id = v_caller)
      OR EXISTS (SELECT 1 FROM commander_home_games g
                 JOIN commander_home_groups gr ON gr.id = g.group_id
                 WHERE g.id = NEW.game_id AND gr.owner_id = v_caller)
      OR EXISTS (SELECT 1 FROM commander_home_games g
                 JOIN commander_home_members m ON m.group_id = g.group_id
                 WHERE g.id = NEW.game_id
                   AND m.user_id = v_caller
                   AND m.role = 'admin'
                   AND m.status = 'approved')
    INTO v_is_host;

    IF NOT v_is_host THEN
      RAISE EXCEPTION 'HOST_ONLY_FIELD'
            USING HINT = 'is_featured is a moderation flag; only host/owner/admin can feature photos';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_photos_is_featured_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_host boolean;
BEGIN
  IF auth.role() = 'service_role' OR v_caller IS NULL THEN RETURN NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- If inserter tries to set is_featured=true, verify host/owner/admin
  IF COALESCE(NEW.is_featured, false) = true THEN
    SELECT
      EXISTS (SELECT 1 FROM commander_home_games g
               WHERE g.id = NEW.game_id AND g.host_id = v_caller)
      OR EXISTS (SELECT 1 FROM commander_home_games g
                 JOIN commander_home_groups gr ON gr.id = g.group_id
                 WHERE g.id = NEW.game_id AND gr.owner_id = v_caller)
      OR EXISTS (SELECT 1 FROM commander_home_games g
                 JOIN commander_home_members m ON m.group_id = g.group_id
                 WHERE g.id = NEW.game_id
                   AND m.user_id = v_caller
                   AND m.role = 'admin'
                   AND m.status = 'approved')
    INTO v_is_host;

    IF NOT v_is_host THEN
      -- Quietly sanitize rather than reject, so legitimate uploads
      -- from non-hosts still succeed (just without the feature flag).
      NEW.is_featured := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_reviews_edit_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_role text := current_user;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- created_at immutable
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
          USING HINT = 'created_at is immutable on reviews';
  END IF;

  -- updated_at: user-supplied rejected (touch trigger sets it at depth>1)
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at
     AND pg_trigger_depth() = 1 THEN
    -- Normalize to OLD.updated_at; the touch trigger will set it next
    -- This prevents a user from setting updated_at explicitly; the touch
    -- fires after and overwrites with NOW() anyway.
    RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
          USING HINT = 'updated_at is managed by trg_home_game_reviews_touch_updated_at';
  END IF;

  -- Auto-flip is_edited on content/rating change
  IF NEW.review_text IS DISTINCT FROM OLD.review_text
     OR NEW.rating IS DISTINCT FROM OLD.rating THEN
    NEW.is_edited := true;
  END IF;

  -- Sticky is_edited
  IF OLD.is_edited = true AND NEW.is_edited = false THEN
    RAISE EXCEPTION 'IS_EDITED_STICKY'
          USING HINT = 'is_edited cannot be reset once recorded';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_templates_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_role text := current_user;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD'
          USING HINT = 'group_id is immutable on templates; create a new template in the target group';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD'
          USING HINT = 'created_by is immutable on templates';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD'
          USING HINT = 'created_at is immutable on templates';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_group_activity_and_views()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_role text := current_user;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;
  -- Nested system trigger paths (recomputes) run at depth>1 and bypass
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- view_count: system-managed, direct mutation forbidden at user depth
  IF NEW.view_count IS DISTINCT FROM OLD.view_count THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'view_count is maintained by the system';
  END IF;

  -- last_activity_at can be set to now() (legit revive) but not to the
  -- future. Allow changes where the new value is <= now() + small slop.
  IF NEW.last_activity_at IS DISTINCT FROM OLD.last_activity_at
     AND NEW.last_activity_at IS NOT NULL
     AND NEW.last_activity_at > NOW() + INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'FUTURE_ACTIVITY_AT_FORBIDDEN'
          USING HINT = 'last_activity_at cannot be set to a future time';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_group_field_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
    v_caller uuid := auth.uid();
    v_is_owner boolean;
BEGIN
    -- Service role bypass
    IF auth.role() = 'service_role' OR v_caller IS NULL THEN
      RETURN NEW;
    END IF;

    -- Nested-trigger bypass: when an INSERT/UPDATE/DELETE on another table
    -- fires a trigger that updates THIS table, pg_trigger_depth() > 1.
    -- Those are internal recompute paths (member_count, games_hosted,
    -- last_activity_at, etc.). Direct user UPDATE is always depth = 1.
    IF pg_trigger_depth() > 1 THEN
      RETURN NEW;
    END IF;

    v_is_owner := (NEW.owner_id = v_caller);

    -- Owner-only fields
    IF NEW.invite_code IS DISTINCT FROM OLD.invite_code
       OR NEW.club_code IS DISTINCT FROM OLD.club_code
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
    THEN
      IF NOT v_is_owner THEN
        RAISE EXCEPTION 'OWNER_ONLY_FIELD'
              USING HINT = 'only the group owner can change invite_code, '
                         || 'club_code, or is_active';
      END IF;
    END IF;

    -- Computed/immutable fields blocked for direct UPDATE by anyone
    IF NEW.member_count       IS DISTINCT FROM OLD.member_count
       OR NEW.games_hosted    IS DISTINCT FROM OLD.games_hosted
       OR NEW.share_click_count IS DISTINCT FROM OLD.share_click_count
       OR NEW.created_at      IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
            USING HINT = 'member_count, games_hosted, share_click_count, '
                       || 'created_at are maintained by the system';
    END IF;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_group_follow_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'FOLLOW_GROUP_IMMUTABLE'
          USING HINT = 'unfollow and re-follow the target group instead';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'FOLLOW_USER_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_group_follows_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Service-role / postgres bypass
  IF current_user IN ('postgres','supabase_admin','service_role',
                       'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'FOLLOW_IMMUTABLE_FIELD'
      USING HINT = 'group_id cannot be changed. Unfollow and follow the new group.';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'FOLLOW_IMMUTABLE_FIELD'
      USING HINT = 'user_id cannot be changed.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'FOLLOW_IMMUTABLE_FIELD'
      USING HINT = 'id cannot be changed.';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'FOLLOW_IMMUTABLE_FIELD'
      USING HINT = 'created_at cannot be changed.';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_enforce_home_group_stat_lockdown()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_role text := current_user;
BEGIN
  IF v_role IN ('postgres','supabase_admin','service_role',
                'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN NEW;
  END IF;
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.quality_score IS DISTINCT FROM OLD.quality_score THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'quality_score is computed server-side by the ranking job';
  END IF;
  IF NEW.vitality_score IS DISTINCT FROM OLD.vitality_score THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'vitality_score is computed server-side by the vitality job';
  END IF;
  IF NEW.vitality_refreshed_at IS DISTINCT FROM OLD.vitality_refreshed_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'vitality_refreshed_at is set by the vitality-refresh job';
  END IF;
  IF NEW.vouch_count IS DISTINCT FROM OLD.vouch_count THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'vouch_count is maintained by the vouch trigger';
  END IF;
  IF NEW.promotion_approved_at IS DISTINCT FROM OLD.promotion_approved_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'promotion_approved_at is set by the club-promotion approval flow';
  END IF;
  IF NEW.promotion_requested_at IS DISTINCT FROM OLD.promotion_requested_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'promotion_requested_at is set by request_home_group_promotion RPC';
  END IF;
  IF NEW.inactivity_hidden_sent_at IS DISTINCT FROM OLD.inactivity_hidden_sent_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'inactivity_hidden_sent_at is set by the dormancy-hide job';
  END IF;
  IF NEW.inactivity_warning_sent_at IS DISTINCT FROM OLD.inactivity_warning_sent_at THEN
    RAISE EXCEPTION 'IMMUTABLE_OR_COMPUTED_FIELD'
          USING HINT = 'inactivity_warning_sent_at is set by the dormancy-warning job';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_ensure_social_page_for_home_group(p_group_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_existing_id uuid; v_group RECORD; v_new_id uuid;
BEGIN
    SELECT id INTO v_existing_id FROM social_pages
     WHERE linked_entity_type = 'home_group' AND linked_entity_id = p_group_id::text
     LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

    SELECT id, owner_id, name, description, tagline, profile_photo_url, cover_photo_url,
           city, state, is_private
      INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    INSERT INTO social_pages (
        owner_id, page_type, name, description, avatar_url, cover_url, category,
        location_city, location_state, linked_entity_type, linked_entity_id,
        is_public, metadata
    ) VALUES (
        v_group.owner_id, 'home_game',   -- legacy vocab required by check constraint
        v_group.name, COALESCE(v_group.description, v_group.tagline),
        v_group.profile_photo_url, v_group.cover_photo_url, 'poker',
        v_group.city, v_group.state, 'home_group', v_group.id::text,
        NOT COALESCE(v_group.is_private, false),
        jsonb_build_object('auto_provisioned', true, 'source', 'phase29', 'at', now())
    ) RETURNING id INTO v_new_id;
    RETURN v_new_id;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_ensure_social_page_for_home_group failed for %: %', p_group_id, SQLERRM;
    RETURN NULL;
END; $function$


CREATE OR REPLACE FUNCTION public.fn_generate_recurring_home_games()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group       RECORD;
    v_generated   int := 0;
    v_skipped     int := 0;
    v_target_date date;
    v_week        int;
    v_interval    interval;
    v_day_number  int;  -- 0=Sun..6=Sat
    v_weeks_max   int;
    v_new_game_id uuid;
BEGIN
    FOR v_group IN
        SELECT g.*, grp_sp.slug
          FROM commander_home_groups g
          LEFT JOIN social_pages grp_sp ON grp_sp.linked_entity_type='home_group' AND grp_sp.linked_entity_id=g.id::text
         WHERE g.is_active = true
           AND g.auto_generate_games = true
           AND g.frequency IN ('weekly','biweekly','monthly')
           AND g.typical_day IS NOT NULL
           AND g.typical_time IS NOT NULL
           AND g.last_activity_at > NOW() - INTERVAL '60 days'  -- skip dead groups
    LOOP
        -- Map typical_day text to day-number (0=Sunday..6=Saturday)
        v_day_number := CASE lower(v_group.typical_day)
            WHEN 'sunday' THEN 0 WHEN 'sun' THEN 0
            WHEN 'monday' THEN 1 WHEN 'mon' THEN 1
            WHEN 'tuesday' THEN 2 WHEN 'tue' THEN 2 WHEN 'tues' THEN 2
            WHEN 'wednesday' THEN 3 WHEN 'wed' THEN 3
            WHEN 'thursday' THEN 4 WHEN 'thu' THEN 4 WHEN 'thurs' THEN 4
            WHEN 'friday' THEN 5 WHEN 'fri' THEN 5
            WHEN 'saturday' THEN 6 WHEN 'sat' THEN 6
            ELSE NULL END;
        
        IF v_day_number IS NULL THEN 
            v_skipped := v_skipped + 1; 
            CONTINUE; 
        END IF;

        v_interval := CASE v_group.frequency
            WHEN 'weekly'   THEN INTERVAL '7 days'
            WHEN 'biweekly' THEN INTERVAL '14 days'
            WHEN 'monthly'  THEN INTERVAL '28 days'
            ELSE INTERVAL '7 days' END;

        v_weeks_max := COALESCE(v_group.auto_generate_weeks_ahead, 4);

        -- Find first target date: next occurrence of day_number starting tomorrow
        v_target_date := CURRENT_DATE + 1;
        WHILE EXTRACT(DOW FROM v_target_date)::int <> v_day_number LOOP
            v_target_date := v_target_date + 1;
        END LOOP;

        -- Generate for each cycle up to weeks_ahead
        FOR v_week IN 1..v_weeks_max LOOP
            -- Skip if a game already exists for this group on this date
            IF EXISTS (
                SELECT 1 FROM commander_home_games 
                 WHERE group_id = v_group.id 
                   AND scheduled_date = v_target_date
                   AND status NOT IN ('cancelled')
            ) THEN
                v_skipped := v_skipped + 1;
            ELSE
                INSERT INTO commander_home_games (
                    group_id, host_id, title, 
                    game_type, stakes, format,
                    buyin_min, buyin_max,
                    scheduled_date, start_time, 
                    max_players, 
                    status,
                    address_visible_to
                ) VALUES (
                    v_group.id, v_group.owner_id,
                    v_group.name || ' — ' || to_char(v_target_date, 'Mon DD'),
                    v_group.default_game_type, v_group.default_stakes, 'cash',
                    v_group.typical_buyin_min, v_group.typical_buyin_max,
                    v_target_date, v_group.typical_time,
                    COALESCE(v_group.max_players, 9),
                    'scheduled',
                    CASE WHEN v_group.is_private THEN 'members' ELSE 'rsvpd' END
                ) RETURNING id INTO v_new_game_id;

                INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
                VALUES (v_group.id, NULL, 'game', v_new_game_id, 'auto_generated',
                        jsonb_build_object('source','recurring_cron','scheduled_date', v_target_date,'week', v_week));

                v_generated := v_generated + 1;
            END IF;

            v_target_date := v_target_date + v_interval;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'generated', v_generated,
        'skipped', v_skipped,
        'run_at', NOW()
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_get_home_games_onboarding_status(p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile RECORD;
  v_tos_v   text;
  v_priv_v  text;
  v_cg_v    text;
  v_money_v text;
  v_min_age int;
  v_needs jsonb := '[]'::jsonb;
  v_has_tos   boolean := false;
  v_has_priv  boolean := false;
  v_has_cg    boolean := false;
  v_has_money boolean := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_caller_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT id, over_18_attested_at, jurisdiction_country,
         jurisdiction_region, jurisdiction_acknowledged_at,
         home_games_onboarded_at
    INTO v_profile
    FROM public.profiles WHERE id = p_caller_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  SELECT value INTO v_tos_v   FROM public.platform_policies WHERE key = 'home_games.tos.version';
  SELECT value INTO v_priv_v  FROM public.platform_policies WHERE key = 'home_games.privacy.version';
  SELECT value INTO v_cg_v    FROM public.platform_policies WHERE key = 'home_games.community_guidelines.version';
  SELECT value INTO v_money_v FROM public.platform_policies WHERE key = 'home_games.money_policy.version';
  SELECT value::int INTO v_min_age FROM public.platform_policies WHERE key = 'home_games.minimum_age';
  IF v_min_age IS NULL THEN v_min_age := 18; END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_tos_acceptances
                  WHERE user_id=p_caller_user_id AND policy_key='home_games.tos'
                    AND policy_version = v_tos_v) INTO v_has_tos;
  SELECT EXISTS (SELECT 1 FROM public.user_tos_acceptances
                  WHERE user_id=p_caller_user_id AND policy_key='home_games.privacy'
                    AND policy_version = v_priv_v) INTO v_has_priv;
  SELECT EXISTS (SELECT 1 FROM public.user_tos_acceptances
                  WHERE user_id=p_caller_user_id AND policy_key='home_games.community_guidelines'
                    AND policy_version = v_cg_v) INTO v_has_cg;
  SELECT EXISTS (SELECT 1 FROM public.user_tos_acceptances
                  WHERE user_id=p_caller_user_id AND policy_key='home_games.money_policy'
                    AND policy_version = v_money_v) INTO v_has_money;

  IF v_profile.over_18_attested_at IS NULL THEN
    v_needs := v_needs || jsonb_build_array('over_18_attestation');
  END IF;
  IF v_profile.jurisdiction_acknowledged_at IS NULL THEN
    v_needs := v_needs || jsonb_build_array('jurisdiction_acknowledgement');
  END IF;
  IF NOT v_has_tos   THEN v_needs := v_needs || jsonb_build_array('tos_acceptance');                  END IF;
  IF NOT v_has_priv  THEN v_needs := v_needs || jsonb_build_array('privacy_acceptance');              END IF;
  IF NOT v_has_cg    THEN v_needs := v_needs || jsonb_build_array('community_guidelines_acceptance'); END IF;
  IF NOT v_has_money THEN v_needs := v_needs || jsonb_build_array('money_policy_acknowledgement');    END IF;

  IF jsonb_array_length(v_needs) = 0 AND v_profile.home_games_onboarded_at IS NULL THEN
    UPDATE public.profiles SET home_games_onboarded_at = now() WHERE id = p_caller_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'onboarded',   (jsonb_array_length(v_needs) = 0),
    'needs',       v_needs,
    'versions',    jsonb_build_object(
                     'tos',                  v_tos_v,
                     'privacy',              v_priv_v,
                     'community_guidelines', v_cg_v,
                     'money_policy',         v_money_v
                   ),
    'minimum_age', v_min_age,
    'current_attestations', jsonb_build_object(
       'over_18_at',           v_profile.over_18_attested_at,
       'jurisdiction_country', v_profile.jurisdiction_country,
       'jurisdiction_region',  v_profile.jurisdiction_region,
       'jurisdiction_ack_at',  v_profile.jurisdiction_acknowledged_at
    )
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_get_home_games_onboarding_status_admin(p_caller_user_id uuid, p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role    text;
  v_profile RECORD;
  v_tos_v   text; v_priv_v text; v_cg_v text; v_money_v text;
  v_min_age int;
  v_needs jsonb := '[]'::jsonb;
  v_has_tos   boolean := false;
  v_has_priv  boolean := false;
  v_has_cg    boolean := false;
  v_has_money boolean := false;
BEGIN
  -- Caller identity + admin role
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller_user_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    SELECT role INTO v_role FROM public.profiles WHERE id = p_caller_user_id;
    IF v_role NOT IN ('admin','superadmin','god') THEN
      RAISE EXCEPTION 'FORBIDDEN' USING HINT = 'admin-only lookup';
    END IF;
  END IF;

  SELECT id, over_18_attested_at, jurisdiction_country,
         jurisdiction_region, jurisdiction_acknowledged_at,
         home_games_onboarded_at, role, display_name, username, full_name
    INTO v_profile
    FROM public.profiles WHERE id = p_target_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_FOUND'; END IF;

  SELECT value INTO v_tos_v   FROM public.platform_policies WHERE key='home_games.tos.version';
  SELECT value INTO v_priv_v  FROM public.platform_policies WHERE key='home_games.privacy.version';
  SELECT value INTO v_cg_v    FROM public.platform_policies WHERE key='home_games.community_guidelines.version';
  SELECT value INTO v_money_v FROM public.platform_policies WHERE key='home_games.money_policy.version';
  SELECT value::int INTO v_min_age FROM public.platform_policies WHERE key='home_games.minimum_age';
  IF v_min_age IS NULL THEN v_min_age := 18; END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_tos_acceptances
                  WHERE user_id=p_target_user_id AND policy_key='home_games.tos'
                    AND policy_version = v_tos_v) INTO v_has_tos;
  SELECT EXISTS (SELECT 1 FROM public.user_tos_acceptances
                  WHERE user_id=p_target_user_id AND policy_key='home_games.privacy'
                    AND policy_version = v_priv_v) INTO v_has_priv;
  SELECT EXISTS (SELECT 1 FROM public.user_tos_acceptances
                  WHERE user_id=p_target_user_id AND policy_key='home_games.community_guidelines'
                    AND policy_version = v_cg_v) INTO v_has_cg;
  SELECT EXISTS (SELECT 1 FROM public.user_tos_acceptances
                  WHERE user_id=p_target_user_id AND policy_key='home_games.money_policy'
                    AND policy_version = v_money_v) INTO v_has_money;

  IF v_profile.over_18_attested_at IS NULL           THEN v_needs := v_needs || jsonb_build_array('over_18_attestation');          END IF;
  IF v_profile.jurisdiction_acknowledged_at IS NULL THEN v_needs := v_needs || jsonb_build_array('jurisdiction_acknowledgement'); END IF;
  IF NOT v_has_tos   THEN v_needs := v_needs || jsonb_build_array('tos_acceptance');                  END IF;
  IF NOT v_has_priv  THEN v_needs := v_needs || jsonb_build_array('privacy_acceptance');              END IF;
  IF NOT v_has_cg    THEN v_needs := v_needs || jsonb_build_array('community_guidelines_acceptance'); END IF;
  IF NOT v_has_money THEN v_needs := v_needs || jsonb_build_array('money_policy_acknowledgement');    END IF;

  -- Admin READ does NOT auto-flip home_games_onboarded_at (unlike caller-self fn)

  -- Audit the lookup (PII read)
  INSERT INTO public.commander_home_audit_log
    (group_id, actor_id, target_type, target_id, action, metadata)
  VALUES (NULL, p_caller_user_id, 'user', p_target_user_id, 'admin_onboarding_lookup',
          jsonb_build_object('onboarded', (jsonb_array_length(v_needs) = 0)));

  RETURN jsonb_build_object(
    'success',     true,
    'target_user_id', p_target_user_id,
    'display_name',   COALESCE(v_profile.display_name, v_profile.full_name, v_profile.username, 'Unknown'),
    'role',        v_profile.role,
    'onboarded',   (jsonb_array_length(v_needs) = 0),
    'onboarded_at', v_profile.home_games_onboarded_at,
    'needs',       v_needs,
    'versions',    jsonb_build_object(
                     'tos',                  v_tos_v,
                     'privacy',              v_priv_v,
                     'community_guidelines', v_cg_v,
                     'money_policy',         v_money_v),
    'minimum_age', v_min_age,
    'current_attestations', jsonb_build_object(
       'over_18_at',           v_profile.over_18_attested_at,
       'jurisdiction_country', v_profile.jurisdiction_country,
       'jurisdiction_region',  v_profile.jurisdiction_region,
       'jurisdiction_ack_at',  v_profile.jurisdiction_acknowledged_at)
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_get_home_group_dashboard(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_get_home_group_dashboard(p_group_id, v_uid);
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_get_home_group_dashboard(p_group_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group RECORD; v_is_staff boolean; v_slug text;
  v_next_game_row RECORD; v_recent_game_row RECORD;
  v_pending_reports int; v_pending_join_reqs int; v_open_polls int;
  v_has_template boolean; v_has_first_game boolean; v_has_invite_link boolean;
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller_user_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

  v_is_staff := (v_group.owner_id = p_caller_user_id)
    OR EXISTS (SELECT 1 FROM commander_home_members
                WHERE group_id = p_group_id AND user_id = p_caller_user_id
                  AND role IN ('admin','co_host') AND status = 'approved');
  IF NOT v_is_staff THEN RAISE EXCEPTION 'NOT_GROUP_STAFF' USING ERRCODE = '42501'; END IF;

  SELECT slug INTO v_slug FROM social_pages
   WHERE linked_entity_type='home_group' AND linked_entity_id = p_group_id::text LIMIT 1;

  SELECT gm.id, gm.title,
         (gm.scheduled_date || ' ' || COALESCE(gm.start_time, '19:00:00'::time))::timestamp
           AT TIME ZONE COALESCE(gm.timezone, 'UTC') AS starts_at,
         gm.rsvp_yes, gm.rsvp_maybe, gm.rsvp_no, gm.waitlist_count,
         gm.max_players, gm.stakes, gm.format, gm.address_visible_to, gm.status
    INTO v_next_game_row FROM commander_home_games gm
   WHERE gm.group_id = p_group_id
     AND gm.status IN ('scheduled','confirmed')
     AND gm.scheduled_date >= CURRENT_DATE
   ORDER BY gm.scheduled_date ASC, gm.start_time ASC NULLS LAST LIMIT 1;

  SELECT gm.id, gm.title, gm.scheduled_date, gm.status,
         (SELECT COUNT(*) FROM commander_home_game_reviews r WHERE r.game_id = gm.id) AS review_count
    INTO v_recent_game_row FROM commander_home_games gm
   WHERE gm.group_id = p_group_id AND gm.status IN ('completed','cancelled')
   ORDER BY gm.scheduled_date DESC, gm.start_time DESC NULLS LAST LIMIT 1;

  SELECT COUNT(*)::int INTO v_pending_reports
    FROM commander_home_content_reports r
   WHERE r.status IN ('pending','hidden_pending_review')
     AND (
       (r.reported_type IN ('post','comment')
         AND r.reported_id IN (SELECT p.id FROM commander_home_posts p WHERE p.group_id = p_group_id))
       OR (r.reported_type = 'game'
         AND r.reported_id IN (SELECT g.id FROM commander_home_games g WHERE g.group_id = p_group_id))
       OR (r.reported_type = 'review'
         AND r.reported_id IN (
           SELECT rv.id FROM commander_home_game_reviews rv
           JOIN commander_home_games g ON g.id = rv.game_id WHERE g.group_id = p_group_id))
       OR (r.reported_type = 'member'
         AND r.reported_id IN (SELECT m.id FROM commander_home_members m WHERE m.group_id = p_group_id))
     );

  SELECT COUNT(*)::int INTO v_pending_join_reqs FROM commander_home_members
   WHERE group_id = p_group_id AND status = 'pending';

  -- Fixed table name: commander_home_polls (not *_group_polls)
  SELECT COUNT(*)::int INTO v_open_polls FROM commander_home_polls
   WHERE group_id = p_group_id
     AND (closes_at IS NULL OR closes_at > NOW());

  SELECT EXISTS (SELECT 1 FROM commander_home_game_templates WHERE group_id = p_group_id) INTO v_has_template;
  SELECT EXISTS (SELECT 1 FROM commander_home_games          WHERE group_id = p_group_id) INTO v_has_first_game;
  SELECT EXISTS (SELECT 1 FROM commander_home_invite_tokens
                  WHERE group_id = p_group_id AND is_active = true
                    AND (expires_at IS NULL OR expires_at > NOW())) INTO v_has_invite_link;

  v_result := jsonb_build_object(
    'success', true,
    'group', jsonb_build_object(
      'id', v_group.id, 'name', v_group.name, 'slug', v_slug, 'city', v_group.city,
      'is_private', v_group.is_private, 'is_21_plus', v_group.is_21_plus,
      'member_count', v_group.member_count, 'profile_photo_url', v_group.profile_photo_url,
      'created_at', v_group.created_at,
      'promotion_requested_at', v_group.promotion_requested_at,
      'promoted_to_club_id', v_group.promoted_to_club_id),
    'next_game', CASE WHEN v_next_game_row.id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'id', v_next_game_row.id, 'title', v_next_game_row.title,
        'starts_at', v_next_game_row.starts_at,
        'rsvp_yes', v_next_game_row.rsvp_yes, 'rsvp_maybe', v_next_game_row.rsvp_maybe,
        'rsvp_no', v_next_game_row.rsvp_no, 'waitlist_count', v_next_game_row.waitlist_count,
        'max_players', v_next_game_row.max_players, 'stakes', v_next_game_row.stakes,
        'format', v_next_game_row.format, 'status', v_next_game_row.status,
        'address_visible_to', v_next_game_row.address_visible_to) END,
    'recent_game', CASE WHEN v_recent_game_row.id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'id', v_recent_game_row.id, 'title', v_recent_game_row.title,
        'scheduled_date', v_recent_game_row.scheduled_date,
        'status', v_recent_game_row.status, 'review_count', v_recent_game_row.review_count) END,
    'counters', jsonb_build_object(
      'pending_reports', v_pending_reports,
      'pending_join_requests', v_pending_join_reqs,
      'open_polls', v_open_polls),
    'onboarding_checklist', jsonb_build_object(
      'has_game_template', v_has_template,
      'has_first_game', v_has_first_game,
      'has_invite_link', v_has_invite_link,
      'all_complete', (v_has_template AND v_has_first_game AND v_has_invite_link))
  );
  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_hg_caller_display_name(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(trim(p.display_name), ''),
    NULLIF(trim(p.full_name),    ''),
    NULLIF(trim(p.username),     ''),
    'Player'
  )
  FROM public.profiles p
  WHERE p.id = p_user_id
  LIMIT 1
$function$


CREATE OR REPLACE FUNCTION public.fn_hg_enforce_quotas_on_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid; v_count int;
BEGIN
  -- Bypass service_role / no-auth contexts
  v_uid := auth.uid();
  BEGIN
    IF v_uid IS NULL OR auth.role() = 'service_role' THEN RETURN NEW; END IF;
  EXCEPTION WHEN OTHERS THEN RETURN NEW;
  END;

  IF TG_TABLE_NAME = 'commander_home_groups' THEN
    -- Only enforce when caller is actually creating for themselves
    IF NEW.owner_id = v_uid THEN
      SELECT COUNT(*) INTO v_count FROM public.commander_home_groups
       WHERE owner_id = v_uid AND is_active = true;
      IF v_count >= 20 THEN
        RAISE EXCEPTION 'GROUP_QUOTA_EXCEEDED'
              USING HINT = 'max 20 active groups per user';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'commander_home_invite_tokens' THEN
    IF NEW.created_by = v_uid THEN
      SELECT COUNT(*) INTO v_count FROM public.commander_home_invite_tokens
       WHERE group_id = NEW.group_id
         AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW());
      IF v_count >= 50 THEN
        RAISE EXCEPTION 'TOKEN_QUOTA_EXCEEDED'
              USING HINT = 'max 50 active unexpired tokens per group';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'commander_home_games' THEN
    IF NEW.host_id = v_uid THEN
      SELECT COUNT(*) INTO v_count FROM public.commander_home_games
       WHERE group_id = NEW.group_id
         AND status = 'scheduled'
         AND scheduled_date >= CURRENT_DATE;
      IF v_count >= 100 THEN
        RAISE EXCEPTION 'SCHEDULED_GAMES_QUOTA_EXCEEDED'
              USING HINT = 'max 100 future-scheduled games per group';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_hg_enforce_rsvp_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_game RECORD;
  v_yes_count int;
BEGIN
  IF NEW.response <> 'yes' THEN RETURN NEW; END IF;

  SELECT id, max_players, rsvp_yes
    INTO v_game
    FROM commander_home_games
   WHERE id = NEW.game_id
     FOR UPDATE;

  IF NOT FOUND OR v_game.max_players IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_yes_count
    FROM commander_home_rsvps
   WHERE game_id = NEW.game_id AND response = 'yes';

  IF v_yes_count >= v_game.max_players THEN
    NEW.response := 'waitlist';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_hg_require_onboarded_on_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid            uuid;
  v_target_user_id uuid;
  v_onboarded_at   timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  BEGIN
    IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF    TG_TABLE_NAME = 'commander_home_groups'          THEN v_target_user_id := NEW.owner_id;
  ELSIF TG_TABLE_NAME = 'commander_home_games'           THEN v_target_user_id := NEW.host_id;
  ELSIF TG_TABLE_NAME = 'commander_home_posts'           THEN v_target_user_id := NEW.author_id;
  ELSIF TG_TABLE_NAME = 'commander_home_post_comments'   THEN v_target_user_id := NEW.author_id;
  ELSIF TG_TABLE_NAME = 'commander_home_post_likes'      THEN v_target_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'commander_home_members'         THEN v_target_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'commander_home_rsvps'           THEN v_target_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'commander_home_game_photos'     THEN v_target_user_id := NEW.uploader_id;
  ELSIF TG_TABLE_NAME = 'commander_home_poll_votes'      THEN v_target_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'commander_home_polls'           THEN v_target_user_id := NEW.created_by;
  ELSIF TG_TABLE_NAME = 'commander_home_invite_tokens'   THEN v_target_user_id := NEW.created_by;
  ELSIF TG_TABLE_NAME = 'commander_home_ban_appeals'     THEN v_target_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'commander_home_content_reports' THEN v_target_user_id := NEW.reporter_id;
  ELSIF TG_TABLE_NAME = 'commander_home_game_reviews'    THEN v_target_user_id := NEW.reviewer_id;
  ELSIF TG_TABLE_NAME = 'commander_home_group_follows'   THEN v_target_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'commander_home_game_templates'  THEN v_target_user_id := NEW.created_by;
  ELSE v_target_user_id := NULL;
  END IF;

  IF v_target_user_id IS NULL OR v_target_user_id <> v_uid THEN
    RETURN NEW;
  END IF;

  SELECT home_games_onboarded_at INTO v_onboarded_at
    FROM public.profiles WHERE id = v_uid;
  IF v_onboarded_at IS NOT NULL THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'ONBOARDING_REQUIRED'
    USING HINT = 'Complete the Home Games welcome flow (age, jurisdiction, policy acceptance) before using Home Games.';
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_hg_trg_bump_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_group_id uuid;
BEGIN
  v_group_id := COALESCE(
    (CASE WHEN TG_OP = 'DELETE' THEN OLD.group_id ELSE NEW.group_id END)
  );
  IF v_group_id IS NOT NULL THEN
    UPDATE public.commander_home_groups
       SET last_activity_at = NOW()
     WHERE id = v_group_id
       AND (last_activity_at IS NULL OR last_activity_at < NOW());
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_hg_trg_bump_activity_via_game()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_group_id uuid;
  v_game_id  uuid := COALESCE(
    (CASE WHEN TG_OP = 'DELETE' THEN OLD.game_id ELSE NEW.game_id END)
  );
BEGIN
  IF v_game_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT group_id INTO v_group_id FROM public.commander_home_games WHERE id = v_game_id;
  IF v_group_id IS NOT NULL THEN
    UPDATE public.commander_home_groups
       SET last_activity_at = NOW()
     WHERE id = v_group_id
       AND (last_activity_at IS NULL OR last_activity_at < NOW());
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_hg_trg_bump_activity_via_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_group_id uuid;
  v_post_id  uuid := COALESCE(
    (CASE WHEN TG_OP = 'DELETE' THEN OLD.post_id ELSE NEW.post_id END)
  );
BEGIN
  IF v_post_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT group_id INTO v_group_id FROM public.commander_home_posts WHERE id = v_post_id;
  IF v_group_id IS NOT NULL THEN
    UPDATE public.commander_home_groups
       SET last_activity_at = NOW()
     WHERE id = v_group_id
       AND (last_activity_at IS NULL OR last_activity_at < NOW());
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_hg_validate_game_scheduled_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('scheduled','confirmed') THEN
    IF NEW.scheduled_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'PAST_SCHEDULED_DATE'
        USING HINT = 'cannot create a scheduled or confirmed game in the past; '
                  || 'use the lifecycle RPCs to mark older games completed/cancelled';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_assign_seat(p_caller uuid, p_game_id uuid, p_seat_number integer, p_user_id uuid DEFAULT NULL::uuid, p_player_name text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_exists boolean;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized: caller identity mismatch');
    END IF;
    IF NOT fn_home_caller_is_game_staff(p_caller, p_game_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;
    IF p_seat_number IS NULL OR p_seat_number < 1 OR p_seat_number > 12 THEN
        RETURN jsonb_build_object('success', false, 'error', 'seat_number must be 1..12');
    END IF;
    IF p_user_id IS NULL AND (p_player_name IS NULL OR LENGTH(TRIM(p_player_name)) = 0) THEN
        RETURN jsonb_build_object('success', false, 'error', 'either user_id or player_name required');
    END IF;
    IF p_player_name IS NOT NULL AND LENGTH(p_player_name) > 60 THEN
        RETURN jsonb_build_object('success', false, 'error', 'player_name too long (max 60)');
    END IF;
    IF p_note IS NOT NULL AND LENGTH(p_note) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'note too long (max 500)');
    END IF;

    SELECT EXISTS (SELECT 1 FROM commander_home_seats
                    WHERE game_id = p_game_id AND seat_number = p_seat_number) INTO v_exists;
    IF NOT v_exists THEN
        INSERT INTO commander_home_seats (game_id, seat_number) VALUES (p_game_id, p_seat_number);
    END IF;

    IF p_user_id IS NOT NULL THEN
        UPDATE commander_home_seats
           SET user_id = NULL, player_name = NULL, status = 'empty',
               seated_at = NULL, away_since = NULL, note = NULL, updated_at = NOW()
         WHERE game_id = p_game_id AND user_id = p_user_id AND seat_number <> p_seat_number;
    END IF;

    UPDATE commander_home_seats
       SET user_id = p_user_id, player_name = p_player_name, status = 'seated',
           seated_at = COALESCE(seated_at, NOW()), away_since = NULL,
           note = p_note, updated_at = NOW()
     WHERE game_id = p_game_id AND seat_number = p_seat_number;

    RETURN jsonb_build_object('success', true, 'game_id', p_game_id, 'seat_number', p_seat_number);
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_auto_hide_on_report_threshold()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_threshold int;
  v_open_count int;
  v_author_id uuid;
  v_group_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' OR NEW.status NOT IN ('pending','hidden_pending_review') THEN
    RETURN NEW;
  END IF;

  SELECT value::int INTO v_threshold FROM public.platform_policies
   WHERE key = 'home_games.moderation.auto_hide_threshold';
  IF v_threshold IS NULL THEN v_threshold := 3; END IF;

  SELECT COUNT(*) INTO v_open_count FROM public.commander_home_content_reports
   WHERE reported_type = NEW.reported_type AND reported_id = NEW.reported_id
     AND status IN ('pending','hidden_pending_review');

  IF v_open_count < v_threshold THEN RETURN NEW; END IF;

  -- Resolve group + author
  CASE NEW.reported_type
    WHEN 'post' THEN
      UPDATE public.commander_home_posts
         SET is_hidden = true, hidden_at = COALESCE(hidden_at, now()),
             hidden_reason = COALESCE(hidden_reason, 'auto_hide_threshold_reached')
       WHERE id = NEW.reported_id AND is_hidden = false
      RETURNING author_id, group_id INTO v_author_id, v_group_id;
    WHEN 'comment' THEN
      WITH updated AS (
        UPDATE public.commander_home_post_comments
           SET is_hidden = true, hidden_at = COALESCE(hidden_at, now()),
               hidden_reason = COALESCE(hidden_reason, 'auto_hide_threshold_reached')
         WHERE id = NEW.reported_id AND is_hidden = false
        RETURNING author_id, post_id)
      SELECT u.author_id, p.group_id INTO v_author_id, v_group_id
        FROM updated u JOIN public.commander_home_posts p ON p.id = u.post_id;
    WHEN 'review' THEN
      WITH updated AS (
        UPDATE public.commander_home_game_reviews
           SET is_hidden = true, hidden_at = COALESCE(hidden_at, now()),
               hidden_reason = COALESCE(hidden_reason, 'auto_hide_threshold_reached')
         WHERE id = NEW.reported_id AND is_hidden = false
        RETURNING reviewer_id, game_id)
      SELECT u.reviewer_id, g.group_id INTO v_author_id, v_group_id
        FROM updated u JOIN public.commander_home_games g ON g.id = u.game_id;
    ELSE RETURN NEW;
  END CASE;

  UPDATE public.commander_home_content_reports
     SET status = 'hidden_pending_review',
         content_hidden_at = COALESCE(content_hidden_at, now())
   WHERE reported_type = NEW.reported_type AND reported_id = NEW.reported_id
     AND status = 'pending';

  IF v_author_id IS NOT NULL THEN
    PERFORM public.fn_emit_home_notification(
      p_user_id => v_author_id, p_type => 'moderation_auto_hide',
      p_title => 'Your content was hidden pending review',
      p_message => 'Multiple users reported your ' || NEW.reported_type ||
                   '. It is temporarily hidden while a moderator reviews. ' ||
                   'If the reports are dismissed, it will be restored.',
      p_link => NULL,
      p_data => jsonb_build_object('reported_type', NEW.reported_type,
                                   'reported_id', NEW.reported_id),
      p_pref_column => NULL);
  END IF;

  -- ★ NEW: audit log — actor_id NULL = system action
  IF v_group_id IS NOT NULL THEN
    INSERT INTO public.commander_home_audit_log
      (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (
      v_group_id, NULL, NEW.reported_type, NEW.reported_id,
      'moderation.auto_hide_threshold',
      jsonb_build_object('threshold', v_threshold,
                         'open_reports', v_open_count,
                         'report_id', NEW.id));
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_caller_is_game_staff(p_caller uuid, p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group_id uuid;
BEGIN
    IF p_caller IS NULL OR p_game_id IS NULL THEN RETURN false; END IF;

    SELECT g.group_id INTO v_group_id FROM commander_home_games g WHERE g.id = p_game_id;
    IF v_group_id IS NULL THEN RETURN false; END IF;

    IF EXISTS (SELECT 1 FROM commander_home_groups
               WHERE id = v_group_id AND owner_id = p_caller) THEN
        RETURN true;
    END IF;

    IF EXISTS (SELECT 1 FROM commander_home_members
               WHERE group_id = v_group_id
                 AND user_id = p_caller
                 AND status = 'approved'
                 AND role IN ('owner','admin')) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_force_insert_origin_ts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_user;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Each branch resolves the correct column on the row type at compile time,
  -- bypassing the need for dynamic SQL / hstore. Unreachable branches are
  -- never parsed against the wrong row type because plpgsql defers record
  -- member resolution to first execution per call path.
  IF TG_TABLE_NAME = 'commander_home_rsvps' THEN
    NEW.responded_at := NOW();
  ELSIF TG_TABLE_NAME = 'commander_home_group_promotion_requests' THEN
    NEW.requested_at := NOW();
  ELSE
    NEW.created_at := NOW();
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_game_auto_complete()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_completed int := 0;
    v_game      RECORD;
BEGIN
    -- Flip to completed if: status in scheduled/confirmed AND 
    -- (scheduled_date + COALESCE(end_time, 3am_next_day) + 6h) < NOW()
    FOR v_game IN
        SELECT * FROM commander_home_games
         WHERE status IN ('scheduled','confirmed','in_progress')
           AND (
               scheduled_date + COALESCE(end_time, TIME '03:00') 
                 + INTERVAL '6 hours'
                 + CASE WHEN end_time IS NULL OR end_time < TIME '06:00' 
                        THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END
               ) < NOW()
    LOOP
        -- Use SECURITY DEFINER path through direct UPDATE (skip the complete_home_game RPC 
        -- because it wants auth.uid(); this is cron context)
        UPDATE commander_home_games 
           SET status = 'completed', updated_at = NOW()
         WHERE id = v_game.id;

        -- Bump group's games_hosted
        UPDATE commander_home_groups 
           SET games_hosted = COALESCE(games_hosted, 0) + 1
         WHERE id = v_game.group_id;

        -- Mark flakes
        UPDATE commander_home_rsvps
           SET flaked = true
         WHERE game_id = v_game.id 
           AND response = 'yes' 
           AND checked_in_at IS NULL;

        -- Increment attended for checked-in members
        UPDATE commander_home_members m
           SET games_attended = COALESCE(m.games_attended, 0) + 1,
               last_attended  = NOW()
          FROM commander_home_rsvps r
         WHERE r.game_id = v_game.id AND r.user_id = m.user_id
           AND m.group_id = v_game.group_id AND r.checked_in_at IS NOT NULL;

        INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
        VALUES (v_game.group_id, NULL, 'game', v_game.id, 'auto_completed',
                jsonb_build_object('source', 'cron', 'scheduled_date', v_game.scheduled_date));

        v_completed := v_completed + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'completed_count', v_completed,
        'run_at', NOW()
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_game_recap_prompt()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_sent int := 0;
    v_attendee RECORD;
    v_slug text;
BEGIN
    FOR v_attendee IN
        SELECT r.id AS rsvp_id, r.user_id, r.game_id,
               g.title, g.scheduled_date, g.group_id
          FROM commander_home_rsvps r
          JOIN commander_home_games g ON g.id = r.game_id
         WHERE r.checked_in_at IS NOT NULL
           AND r.review_prompt_sent_at IS NULL
           AND g.status = 'completed'
           AND g.updated_at < NOW() - INTERVAL '12 hours'
           AND g.updated_at > NOW() - INTERVAL '7 days'  -- don't backfill ancient games
           AND NOT EXISTS (
               SELECT 1 FROM commander_home_game_reviews rv
                WHERE rv.game_id = r.game_id AND rv.reviewer_id = r.user_id)
    LOOP
        SELECT sp.slug INTO v_slug FROM social_pages sp
         WHERE sp.linked_entity_type = 'home_group' AND sp.linked_entity_id = v_attendee.group_id::text LIMIT 1;

        PERFORM public.fn_emit_home_notification(
            v_attendee.user_id, 'home_game_review_prompt',
            'How was ' || COALESCE(v_attendee.title, 'the game') || '?',
            'Leave a quick review for the host.',
            '/hub/home-games/' || COALESCE(v_slug, v_attendee.group_id::text) || '/games/' || v_attendee.game_id::text,
            jsonb_build_object('game_id', v_attendee.game_id),
            'home_game_review_prompts'
        );

        UPDATE commander_home_rsvps 
           SET review_prompt_sent_at = NOW()
         WHERE id = v_attendee.rsvp_id;

        v_sent := v_sent + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'prompts_sent', v_sent, 'run_at', NOW());
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_game_reviews_bump_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_group_id uuid;
BEGIN
  SELECT group_id INTO v_group_id FROM commander_home_games WHERE id = NEW.game_id;
  PERFORM fn_bump_home_group_activity(v_group_id);
  RETURN NEW;
END
$function$


CREATE OR REPLACE FUNCTION public.fn_home_game_reviews_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_group_refresh_geog()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location_geog := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    ELSE
        NEW.location_geog := NULL;
    END IF;
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_group_refresh_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.search_vector := 
          setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A')
       || setweight(to_tsvector('english', coalesce(NEW.tagline, '')), 'B')
       || setweight(to_tsvector('english', coalesce(NEW.city, '')), 'B')
       || setweight(to_tsvector('english', coalesce(NEW.state, '')), 'C')
       || setweight(to_tsvector('english', coalesce(NEW.description, '')), 'D')
       || setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'B');
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_group_self_activity_bump()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.last_activity_at := NOW();
  RETURN NEW;
END
$function$


CREATE OR REPLACE FUNCTION public.fn_home_group_stale_sweep(p_warning_days integer DEFAULT 35, p_hide_days integer DEFAULT 45)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_warned int := 0;
    v_hidden int := 0;
    v_group  RECORD;
    v_slug   text;
BEGIN
    -- WARNINGS: groups 35-45 days stale, owner not yet notified this cycle
    FOR v_group IN
        SELECT g.* FROM commander_home_groups g
         WHERE g.is_active = true
           AND g.last_activity_at IS NOT NULL
           AND g.last_activity_at < NOW() - (p_warning_days || ' days')::interval
           AND g.last_activity_at > NOW() - (p_hide_days || ' days')::interval
           AND (g.visibility_override_until IS NULL OR g.visibility_override_until < NOW())
           AND (g.inactivity_warning_sent_at IS NULL 
                OR g.inactivity_warning_sent_at < g.last_activity_at)
    LOOP
        SELECT sp.slug INTO v_slug FROM social_pages sp
         WHERE sp.linked_entity_type = 'home_group' AND sp.linked_entity_id = v_group.id::text LIMIT 1;

        PERFORM public.fn_emit_home_notification(
            v_group.owner_id, 'home_group_stale_warning',
            v_group.name || ' will be hidden soon',
            'No recent activity in ' || p_warning_days || '+ days. Post something to stay visible.',
            '/hub/home-games/' || COALESCE(v_slug, v_group.id::text) || '/host',
            jsonb_build_object(
                'group_id', v_group.id, 
                'days_until_hidden', p_hide_days - EXTRACT(day FROM (NOW() - v_group.last_activity_at))::int
            ),
            NULL
        );

        UPDATE commander_home_groups 
           SET inactivity_warning_sent_at = NOW()
         WHERE id = v_group.id;

        v_warned := v_warned + 1;
    END LOOP;

    -- HIDDEN NOTICES: groups now >= 45d stale, owner not yet notified
    FOR v_group IN
        SELECT g.* FROM commander_home_groups g
         WHERE g.is_active = true
           AND g.last_activity_at IS NOT NULL
           AND g.last_activity_at < NOW() - (p_hide_days || ' days')::interval
           AND (g.visibility_override_until IS NULL OR g.visibility_override_until < NOW())
           AND (g.inactivity_hidden_sent_at IS NULL 
                OR g.inactivity_hidden_sent_at < g.last_activity_at)
    LOOP
        SELECT sp.slug INTO v_slug FROM social_pages sp
         WHERE sp.linked_entity_type = 'home_group' AND sp.linked_entity_id = v_group.id::text LIMIT 1;

        PERFORM public.fn_emit_home_notification(
            v_group.owner_id, 'home_group_hidden',
            v_group.name || ' is now hidden from discovery',
            'Your group was inactive for ' || p_hide_days || '+ days. Revive anytime to reappear.',
            '/hub/home-games/' || COALESCE(v_slug, v_group.id::text) || '/host',
            jsonb_build_object('group_id', v_group.id, 'action', 'revive'),
            NULL
        );

        UPDATE commander_home_groups 
           SET inactivity_hidden_sent_at = NOW()
         WHERE id = v_group.id;

        v_hidden := v_hidden + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'warnings_sent', v_warned,
        'hidden_notices_sent', v_hidden,
        'run_at', NOW()
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_group_sync_venue(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group       commander_home_groups%ROWTYPE;
    v_venue_id    integer;
    v_table_id    uuid;
    v_max_seats   integer;
    v_social_page social_pages%ROWTYPE;
    v_slug        text;
BEGIN
    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF v_group.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'group not found');
    END IF;

    v_max_seats := GREATEST(COALESCE(v_group.max_players, 9), 2);

    -- Grab the linked social_page (if any) for slug + cover photos
    SELECT * INTO v_social_page
      FROM social_pages
     WHERE linked_entity_type = 'home_group'
       AND linked_entity_id  = p_group_id::text
     LIMIT 1;

    v_slug := v_social_page.slug;

    -- 1) Upsert shadow venue — is_suppressed=false (VISIBLE)
    SELECT id INTO v_venue_id FROM poker_venues WHERE home_group_id = p_group_id;

    IF v_venue_id IS NULL THEN
        INSERT INTO poker_venues (
            name, venue_type, city, state, country,
            latitude, longitude, lat, lng,
            is_active, is_suppressed, commander_enabled,
            home_group_id, source, slug,
            cover_photo_url, profile_photo_url, tagline, about
        ) VALUES (
            v_group.name, 'home_group',
            COALESCE(v_group.city, 'Unknown'),
            COALESCE(v_group.state, 'NA'),
            'US',
            v_group.latitude, v_group.longitude,
            v_group.latitude, v_group.longitude,
            true, false, true,
            p_group_id, 'home_group_shadow', v_slug,
            v_group.cover_photo_url, v_group.profile_photo_url,
            v_group.tagline, v_group.description
        ) RETURNING id INTO v_venue_id;
    ELSE
        UPDATE poker_venues
           SET name              = v_group.name,
               city              = COALESCE(v_group.city, city),
               state             = COALESCE(v_group.state, state),
               latitude          = COALESCE(v_group.latitude, latitude),
               longitude         = COALESCE(v_group.longitude, longitude),
               lat               = COALESCE(v_group.latitude, lat),
               lng               = COALESCE(v_group.longitude, lng),
               is_active         = true,
               is_suppressed     = false,        -- KEY: visible
               commander_enabled = true,
               slug              = COALESCE(v_slug, slug),
               cover_photo_url   = COALESCE(v_group.cover_photo_url, cover_photo_url),
               profile_photo_url = COALESCE(v_group.profile_photo_url, profile_photo_url),
               tagline           = COALESCE(v_group.tagline, tagline),
               about             = COALESCE(v_group.description, about)
         WHERE id = v_venue_id;
    END IF;

    -- 2) Upsert default table (one per group; the Table Tablet flow uses it)
    SELECT id INTO v_table_id
      FROM commander_tables
     WHERE venue_id = v_venue_id AND table_number = 1
     LIMIT 1;

    IF v_table_id IS NULL THEN
        INSERT INTO commander_tables (
            venue_id, table_number, table_name, max_seats, status
        ) VALUES (
            v_venue_id, 1, 'Table 1', v_max_seats, 'available'
        ) RETURNING id INTO v_table_id;
    ELSE
        UPDATE commander_tables SET max_seats = v_max_seats WHERE id = v_table_id;
    END IF;

    UPDATE poker_venues SET commander_home_table_id = v_table_id WHERE id = v_venue_id;

    RETURN jsonb_build_object(
        'success', true, 'group_id', p_group_id,
        'venue_id', v_venue_id, 'table_id', v_table_id,
        'max_seats', v_max_seats, 'slug', v_slug
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_host_pending_nudge()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_sent int := 0;
    v_host RECORD;
BEGIN
    FOR v_host IN
        SELECT DISTINCT grp.owner_id, grp.id AS group_id, grp.name AS group_name,
               COUNT(m.id) AS pending_count,
               sp.slug
          FROM commander_home_members m
          JOIN commander_home_groups grp ON grp.id = m.group_id
          LEFT JOIN social_pages sp ON sp.linked_entity_type='home_group' AND sp.linked_entity_id=grp.id::text
         WHERE m.status = 'pending'
           AND m.created_at < NOW() - INTERVAL '48 hours'
           AND (m.pending_nudge_sent_at IS NULL 
                OR m.pending_nudge_sent_at < NOW() - INTERVAL '3 days')
         GROUP BY grp.owner_id, grp.id, grp.name, sp.slug
    LOOP
        PERFORM public.fn_emit_home_notification(
            v_host.owner_id, 'home_group_pending_nudge',
            v_host.pending_count || ' pending request' || 
                CASE WHEN v_host.pending_count = 1 THEN '' ELSE 's' END,
            'Review requests waiting for ' || v_host.group_name,
            '/hub/home-games/' || COALESCE(v_host.slug, v_host.group_id::text) || '/host',
            jsonb_build_object('group_id', v_host.group_id, 'pending_count', v_host.pending_count),
            'home_game_host_requests'
        );

        UPDATE commander_home_members
           SET pending_nudge_sent_at = NOW()
         WHERE group_id = v_host.group_id AND status = 'pending'
           AND created_at < NOW() - INTERVAL '48 hours';

        v_sent := v_sent + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'hosts_nudged', v_sent, 'run_at', NOW());
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_init_seats(p_caller uuid, p_game_id uuid, p_max_players integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max integer;
  v_created integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized: caller identity mismatch');
  END IF;
  IF NOT public.fn_home_caller_is_game_staff(p_caller, p_game_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;
  IF p_max_players IS NULL THEN
    SELECT max_players INTO v_max FROM public.commander_home_games WHERE id = p_game_id;
  ELSE
    v_max := p_max_players;
  END IF;
  IF v_max IS NULL OR v_max < 1 OR v_max > 12 THEN
    RETURN jsonb_build_object('success', false, 'error', 'max_players must be 1..12');
  END IF;

  -- FIX: match the legacy partial unique index
  --   UNIQUE(game_id, seat_number) WHERE table_id IS NULL
  WITH want AS (SELECT generate_series(1, v_max) AS n),
       ins AS (
         INSERT INTO public.commander_home_seats (game_id, seat_number)
         SELECT p_game_id, w.n FROM want w
         ON CONFLICT (game_id, seat_number) WHERE table_id IS NULL
         DO NOTHING
         RETURNING 1
       )
  SELECT COUNT(*) INTO v_created FROM ins;

  RETURN jsonb_build_object(
    'success', true,
    'game_id', p_game_id,
    'max_players', v_max,
    'seats_created', v_created
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_is_approved_member(p_caller uuid, p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
    SELECT CASE
        WHEN p_caller IS NULL OR p_group_id IS NULL THEN false
        ELSE EXISTS (
            SELECT 1 FROM commander_home_members
             WHERE group_id = p_group_id
               AND user_id  = p_caller
               AND status   = 'approved'
        )
    END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_is_group_staff(p_caller uuid, p_group_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET row_security TO 'off'
AS $function$
BEGIN
    IF p_caller IS NULL OR p_group_id IS NULL THEN RETURN false; END IF;

    -- Group owner → always staff
    IF EXISTS (SELECT 1 FROM commander_home_groups
               WHERE id = p_group_id AND owner_id = p_caller) THEN
        RETURN true;
    END IF;

    -- Approved member with elevated role
    IF EXISTS (SELECT 1 FROM commander_home_members
               WHERE group_id = p_group_id
                 AND user_id = p_caller
                 AND status = 'approved'
                 AND role IN ('owner','admin','co_host')) THEN  -- ← was ('owner','admin')
        RETURN true;
    END IF;

    RETURN false;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_list_seats(p_game_id uuid)
 RETURNS TABLE(seat_number integer, status text, user_id uuid, username text, display_name text, avatar_url text, player_name text, seated_at timestamp with time zone, away_since timestamp with time zone, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group_id uuid;
    v_caller uuid := auth.uid();
BEGIN
    -- Service_role path: skip auth (server-side/cron/admin tooling)
    IF auth.role() = 'service_role' THEN
        RETURN QUERY
        SELECT s.seat_number, s.status, s.user_id, p.username,
               COALESCE(p.display_name, p.full_name, p.username) AS display_name,
               p.avatar_url, s.player_name, s.seated_at, s.away_since, s.note
          FROM commander_home_seats s
          LEFT JOIN profiles p ON p.id = s.user_id
         WHERE s.game_id = p_game_id
         ORDER BY s.seat_number;
        RETURN;
    END IF;

    -- Authenticated path: caller must be approved member of the group
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT g.group_id INTO v_group_id
      FROM commander_home_games g WHERE g.id = p_game_id;
    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'GAME_NOT_FOUND';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM commander_home_members m
         WHERE m.group_id = v_group_id
           AND m.user_id  = v_caller
           AND m.status   = 'approved'
    ) THEN
        RAISE EXCEPTION 'NOT_A_GROUP_MEMBER';
    END IF;

    RETURN QUERY
    SELECT s.seat_number, s.status, s.user_id, p.username,
           COALESCE(p.display_name, p.full_name, p.username) AS display_name,
           p.avatar_url, s.player_name, s.seated_at, s.away_since, s.note
      FROM commander_home_seats s
      LEFT JOIN profiles p ON p.id = s.user_id
     WHERE s.game_id = p_game_id
     ORDER BY s.seat_number;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_members_bump_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM fn_bump_home_group_activity(NEW.group_id);
  RETURN NEW;
END
$function$


CREATE OR REPLACE FUNCTION public.fn_home_move_seat(p_caller uuid, p_game_id uuid, p_from_seat integer, p_to_seat integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r_from commander_home_seats%ROWTYPE; r_to commander_home_seats%ROWTYPE;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' 
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized: caller identity mismatch');
    END IF;
    IF NOT fn_home_caller_is_game_staff(p_caller, p_game_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;
    IF p_from_seat = p_to_seat THEN
        RETURN jsonb_build_object('success', true, 'noop', true);
    END IF;
    SELECT * INTO r_from FROM commander_home_seats
     WHERE game_id = p_game_id AND seat_number = p_from_seat FOR UPDATE;
    SELECT * INTO r_to FROM commander_home_seats
     WHERE game_id = p_game_id AND seat_number = p_to_seat FOR UPDATE;
    IF r_from.id IS NULL OR r_to.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'seat(s) not found');
    END IF;
    UPDATE commander_home_seats SET user_id = NULL, updated_at = NOW() WHERE id = r_from.id;
    UPDATE commander_home_seats
       SET user_id = r_from.user_id, player_name = r_from.player_name,
           status = r_from.status, seated_at = r_from.seated_at,
           away_since = r_from.away_since, note = r_from.note, updated_at = NOW()
     WHERE id = r_to.id;
    UPDATE commander_home_seats
       SET user_id = r_to.user_id, player_name = r_to.player_name,
           status = r_to.status, seated_at = r_to.seated_at,
           away_since = r_to.away_since, note = r_to.note, updated_at = NOW()
     WHERE id = r_from.id;
    RETURN jsonb_build_object('success', true, 'game_id', p_game_id,
        'from', p_from_seat, 'to', p_to_seat);
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_posts_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_protect_identity_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_field text;
  v_old_val text;
  v_new_val text;
BEGIN
  -- No JWT → internal operation (cron, migration, trigger cascade from
  -- another trigger that's already validated). Allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- service_role bypass (server-side admin code paths are trusted)
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  FOREACH v_field IN ARRAY TG_ARGV LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_field, v_field)
      INTO v_old_val, v_new_val
      USING OLD, NEW;

    IF v_old_val IS DISTINCT FROM v_new_val THEN
      RAISE EXCEPTION
        'Cannot change %.% after creation (was %, attempted %). '
        'Identity fields are immutable.',
        TG_TABLE_NAME, v_field, COALESCE(v_old_val,'<null>'), COALESCE(v_new_val,'<null>')
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_protect_row_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_user;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'ROW_IDENTITY_IMMUTABLE'
          USING HINT = 'the primary key (id) of a ' || TG_TABLE_NAME
                     || ' row cannot be changed via direct UPDATE; '
                     || 'delete and recreate the row if needed (was '
                     || OLD.id::text || ', attempted ' || NEW.id::text || ')',
                ERRCODE = '42501';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'CREATED_AT_IMMUTABLE'
          USING HINT = 'created_at on ' || TG_TABLE_NAME
                     || ' is the row origin timestamp and cannot be '
                     || 'modified after insert (was '
                     || OLD.created_at::text || ', attempted '
                     || NEW.created_at::text || ')',
                ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_protect_row_identity_with_ts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role     text := current_user;
  v_col      text;
  v_old_val  text;
  v_new_val  text;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Primary key is always immutable.
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'ROW_IDENTITY_IMMUTABLE'
          USING HINT = 'the primary key (id) of a ' || TG_TABLE_NAME
                     || ' row cannot be changed via direct UPDATE '
                     || '(was ' || OLD.id::text || ', attempted ' || NEW.id::text || ')',
                ERRCODE = '42501';
  END IF;

  -- Origin timestamp: parameterized via TG_ARGV[0] (responded_at / requested_at / ...).
  IF TG_NARGS >= 1 AND TG_ARGV[0] IS NOT NULL THEN
    v_col := TG_ARGV[0];
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_col, v_col)
       INTO v_old_val, v_new_val
      USING OLD, NEW;

    IF v_old_val IS DISTINCT FROM v_new_val THEN
      RAISE EXCEPTION 'ORIGIN_TIMESTAMP_IMMUTABLE'
            USING HINT = v_col || ' on ' || TG_TABLE_NAME
                       || ' is the row origin timestamp and cannot be modified '
                       || '(was ' || COALESCE(v_old_val, '<null>')
                       || ', attempted ' || COALESCE(v_new_val, '<null>') || ')',
                  ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_randomize_seats(p_caller uuid, p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_assigned integer := 0;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' 
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized: caller identity mismatch');
    END IF;
    IF NOT fn_home_caller_is_game_staff(p_caller, p_game_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;
    WITH candidates AS (
        SELECT r.user_id FROM commander_home_rsvps r
         WHERE r.game_id = p_game_id AND r.is_confirmed = true AND r.response = 'yes'
           AND NOT EXISTS (SELECT 1 FROM commander_home_seats s
                            WHERE s.game_id = p_game_id AND s.user_id = r.user_id)
         ORDER BY random()
    ),
    empties AS (SELECT seat_number FROM commander_home_seats
                 WHERE game_id = p_game_id AND user_id IS NULL AND status = 'empty'
                 ORDER BY seat_number),
    pairs AS (SELECT c.user_id, e.seat_number FROM
              (SELECT user_id, ROW_NUMBER() OVER () AS rn FROM candidates) c
              JOIN (SELECT seat_number, ROW_NUMBER() OVER () AS rn FROM empties) e
                ON c.rn = e.rn),
    upd AS (UPDATE commander_home_seats s
               SET user_id = p.user_id, status = 'seated',
                   seated_at = NOW(), updated_at = NOW()
              FROM pairs p
             WHERE s.game_id = p_game_id AND s.seat_number = p.seat_number
            RETURNING 1)
    SELECT COUNT(*) INTO v_assigned FROM upd;
    RETURN jsonb_build_object('success', true, 'game_id', p_game_id, 'assigned', v_assigned);
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_rsvps_bump_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_group_id uuid;
BEGIN
  SELECT group_id INTO v_group_id FROM commander_home_games WHERE id = NEW.game_id;
  PERFORM fn_bump_home_group_activity(v_group_id);
  RETURN NEW;
END
$function$


CREATE OR REPLACE FUNCTION public.fn_home_set_seat_status(p_caller uuid, p_game_id uuid, p_seat_number integer, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' 
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized: caller identity mismatch');
    END IF;
    IF NOT fn_home_caller_is_game_staff(p_caller, p_game_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;
    IF p_status NOT IN ('empty','reserved','seated','away') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid status');
    END IF;
    UPDATE commander_home_seats
       SET status = p_status,
           seated_at = CASE WHEN p_status='seated' THEN COALESCE(seated_at, NOW()) ELSE seated_at END,
           away_since = CASE WHEN p_status='away' THEN NOW() ELSE NULL END,
           updated_at = NOW()
     WHERE game_id = p_game_id AND seat_number = p_seat_number;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'seat not found');
    END IF;
    RETURN jsonb_build_object('success', true);
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_home_vacate_seat(p_caller uuid, p_game_id uuid, p_seat_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' 
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized: caller identity mismatch');
    END IF;
    IF NOT fn_home_caller_is_game_staff(p_caller, p_game_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;
    UPDATE commander_home_seats
       SET user_id = NULL, player_name = NULL, status = 'empty',
           seated_at = NULL, away_since = NULL, note = NULL, updated_at = NOW()
     WHERE game_id = p_game_id AND seat_number = p_seat_number;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'seat not found');
    END IF;
    RETURN jsonb_build_object('success', true, 'game_id', p_game_id, 'seat_number', p_seat_number);
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_list_user_public_home_groups(p_target_user_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(group_id uuid, group_name text, group_slug text, relationship text, city text, member_count integer, profile_photo_url text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  p_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));

  RETURN QUERY
  SELECT t.u_group_id, t.u_group_name, t.u_group_slug, t.u_relationship,
         t.u_city, t.u_member_count, t.u_profile_photo_url, t.u_created_at
  FROM (
    SELECT g.id                        AS u_group_id,
           g.name::text                AS u_group_name,
           sp.slug::text               AS u_group_slug,
           'owner'::text               AS u_relationship,
           g.city::text                AS u_city,
           g.member_count              AS u_member_count,
           g.profile_photo_url::text   AS u_profile_photo_url,
           g.created_at                AS u_created_at
      FROM public.commander_home_groups g
      LEFT JOIN public.social_pages sp
        ON sp.linked_entity_type='home_group' AND sp.linked_entity_id = g.id::text
     WHERE g.owner_id = p_target_user_id
       AND g.is_private = false
       AND COALESCE(g.is_active, true) = true
    UNION
    SELECT g.id, g.name::text, sp.slug::text, m.role::text,
           g.city::text, g.member_count, g.profile_photo_url::text, g.created_at
      FROM public.commander_home_members m
      JOIN public.commander_home_groups g ON g.id = m.group_id
      LEFT JOIN public.social_pages sp
        ON sp.linked_entity_type='home_group' AND sp.linked_entity_id = g.id::text
     WHERE m.user_id = p_target_user_id
       AND m.status = 'approved'
       AND m.role IN ('admin','co_host')
       AND g.owner_id <> p_target_user_id
       AND g.is_private = false
       AND COALESCE(g.is_active, true) = true
  ) t
  ORDER BY
    CASE t.u_relationship WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    t.u_created_at DESC
  LIMIT p_limit;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_notify_home_game_cancelled()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group RECORD;
    v_slug  text;
    v_rsvper RECORD;
BEGIN
    -- Only on status change TO cancelled
    IF OLD.status = 'cancelled' OR NEW.status <> 'cancelled' THEN RETURN NEW; END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = NEW.group_id;
    SELECT sp.slug INTO v_slug FROM social_pages sp 
     WHERE sp.linked_entity_type = 'home_group' AND sp.linked_entity_id = v_group.id::text LIMIT 1;

    FOR v_rsvper IN 
        SELECT DISTINCT user_id FROM commander_home_rsvps 
         WHERE game_id = NEW.id 
           AND response IN ('yes','maybe','waitlist')
    LOOP
        PERFORM public.fn_emit_home_notification(
            v_rsvper.user_id, 'home_game_cancelled',
            'Game cancelled: ' || COALESCE(NEW.title, v_group.name),
            COALESCE(NEW.title, 'The game') || ' on ' || NEW.scheduled_date::text || 
                ' has been cancelled' || 
                CASE WHEN NEW.cancellation_reason IS NOT NULL 
                     THEN ' — ' || NEW.cancellation_reason ELSE '' END,
            '/hub/home-games/' || COALESCE(v_slug, v_group.id::text),
            jsonb_build_object(
                'game_id', NEW.id, 'group_id', v_group.id,
                'reason', NEW.cancellation_reason
            ),
            'home_game_cancellations'
        );
    END LOOP;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_notify_home_game_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group RECORD; v_recipient RECORD; v_slug text;
BEGIN
    SELECT * INTO v_group FROM commander_home_groups WHERE id = NEW.group_id;
    SELECT sp.slug INTO v_slug FROM social_pages sp
     WHERE sp.linked_entity_type='home_group' AND sp.linked_entity_id = NEW.group_id::text LIMIT 1;

    -- Notify approved members (respecting preference)
    FOR v_recipient IN
        SELECT m.user_id
          FROM commander_home_members m
         WHERE m.group_id = NEW.group_id
           AND m.status = 'approved'
           AND m.user_id <> NEW.host_id
           AND COALESCE(m.notify_new_games, true) = true
    LOOP
        PERFORM public.fn_emit_home_notification(
            v_recipient.user_id, 'home_game_new',
            'New game scheduled in ' || v_group.name,
            COALESCE(NEW.title, 'Home game') || ' on ' || to_char(NEW.scheduled_date, 'Dy Mon DD'),
            '/hub/home-games/' || COALESCE(v_slug, NEW.group_id::text) || '/games/' || NEW.id::text,
            jsonb_build_object('game_id', NEW.id, 'group_id', NEW.group_id),
            'home_game_new_game_posted'   -- was 'home_game_notify_new_games' (nonexistent)
        );
    END LOOP;

    -- Notify followers (non-members who opted in)
    FOR v_recipient IN
        SELECT f.user_id
          FROM commander_home_group_follows f
         WHERE f.group_id = NEW.group_id
           AND f.notify_new_games = true
           AND f.user_id <> NEW.host_id
           AND NOT EXISTS (SELECT 1 FROM commander_home_members m
                            WHERE m.group_id = NEW.group_id AND m.user_id = f.user_id)
    LOOP
        PERFORM public.fn_emit_home_notification(
            v_recipient.user_id, 'home_game_new_followed',
            v_group.name || ' has a new game',
            COALESCE(NEW.title, 'Home game') || ' on ' || to_char(NEW.scheduled_date, 'Dy Mon DD'),
            '/hub/home-games/' || COALESCE(v_slug, NEW.group_id::text) || '/games/' || NEW.id::text,
            jsonb_build_object('game_id', NEW.id, 'group_id', NEW.group_id, 'via', 'follow'),
            NULL  -- follower opt-in is in commander_home_group_follows.notify_new_games
        );
    END LOOP;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_refresh_all_home_group_quality_scores()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_updated int := 0; v_group RECORD;
BEGIN
    FOR v_group IN SELECT id FROM commander_home_groups WHERE is_active = true LOOP
        UPDATE commander_home_groups 
           SET quality_score = public.compute_home_group_quality_score(v_group.id)
         WHERE id = v_group.id;
        v_updated := v_updated + 1;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'groups_updated', v_updated);
END; $function$


CREATE OR REPLACE FUNCTION public.fn_refresh_trending_home_groups()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_home_groups_trending;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_require_active_home_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
  v_group_id uuid;
  v_active boolean;
BEGIN
  -- Service-role / postgres bypass (cancel flows, admin tools, cron)
  IF v_role IN ('postgres','supabase_admin','service_role',
                'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- Nested-trigger bypass (shouldn't hit on INSERT but keep safe)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Resolve target group_id based on table
  CASE TG_TABLE_NAME
    WHEN 'commander_home_posts',
         'commander_home_games',
         'commander_home_polls' THEN
      v_group_id := NEW.group_id;

    WHEN 'commander_home_post_comments',
         'commander_home_post_likes' THEN
      SELECT p.group_id INTO v_group_id
        FROM public.commander_home_posts p WHERE p.id = NEW.post_id;

    WHEN 'commander_home_rsvps',
         'commander_home_game_photos',
         'commander_home_game_reviews' THEN
      SELECT g.group_id INTO v_group_id
        FROM public.commander_home_games g WHERE g.id = NEW.game_id;

    WHEN 'commander_home_poll_votes' THEN
      SELECT pl.group_id INTO v_group_id
        FROM public.commander_home_polls pl WHERE pl.id = NEW.poll_id;

    WHEN 'commander_home_seat_reservations' THEN
      SELECT g.group_id INTO v_group_id
        FROM public.commander_home_game_tables t
        JOIN public.commander_home_games g ON g.id = t.game_id
       WHERE t.id = NEW.table_id;

    ELSE
      RETURN NEW;
  END CASE;

  IF v_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_active INTO v_active
    FROM public.commander_home_groups
   WHERE id = v_group_id;

  IF v_active IS FALSE THEN
    RAISE EXCEPTION 'GROUP_INACTIVE'
      USING HINT = 'group is deactivated — no new activity is permitted. '
                || 'Owner must reactivate the group first.';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_send_home_game_reminders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_6h_sent int := 0;
    v_1h_sent int := 0;
    v_rsvp    RECORD;
    v_slug    text;
BEGIN
    -- 6-hour reminders: games starting in ~5h45min to ~6h15min from now
    FOR v_rsvp IN
        SELECT 
            r.id AS rsvp_id, r.user_id, r.game_id,
            g.group_id, g.title AS game_title, g.scheduled_date, g.start_time, g.address,
            grp.name AS group_name
          FROM commander_home_rsvps r
          JOIN commander_home_games g ON g.id = r.game_id
          JOIN commander_home_groups grp ON grp.id = g.group_id
         WHERE r.response = 'yes'
           AND r.reminder_6h_sent_at IS NULL
           AND g.status IN ('scheduled','confirmed')
           -- scheduled_datetime between 5h45m and 6h15m from now
           AND (g.scheduled_date + COALESCE(g.start_time, TIME '19:00')) 
               BETWEEN NOW() + INTERVAL '5 hours 45 minutes'
                   AND NOW() + INTERVAL '6 hours 15 minutes'
    LOOP
        SELECT sp.slug INTO v_slug FROM social_pages sp
         WHERE sp.linked_entity_type = 'home_group' AND sp.linked_entity_id = v_rsvp.group_id::text
         LIMIT 1;

        PERFORM public.fn_emit_home_notification(
            v_rsvp.user_id,
            'home_game_reminder_6h',
            COALESCE(v_rsvp.game_title, v_rsvp.group_name) || ' — tonight in 6 hours',
            'See you at ' || COALESCE(v_rsvp.start_time::text, '') || 
                CASE WHEN v_rsvp.address IS NOT NULL 
                     THEN ' — ' || v_rsvp.address ELSE '' END,
            '/hub/home-games/' || COALESCE(v_slug, v_rsvp.group_id::text),
            jsonb_build_object('game_id', v_rsvp.game_id, 'window', '6h'),
            'home_game_reminders'
        );

        UPDATE commander_home_rsvps 
           SET reminder_6h_sent_at = NOW()
         WHERE id = v_rsvp.rsvp_id;

        v_6h_sent := v_6h_sent + 1;
    END LOOP;

    -- 1-hour reminders: games starting in ~45min to ~75min from now
    FOR v_rsvp IN
        SELECT 
            r.id AS rsvp_id, r.user_id, r.game_id,
            g.group_id, g.title AS game_title, g.scheduled_date, g.start_time, g.address,
            grp.name AS group_name
          FROM commander_home_rsvps r
          JOIN commander_home_games g ON g.id = r.game_id
          JOIN commander_home_groups grp ON grp.id = g.group_id
         WHERE r.response = 'yes'
           AND r.reminder_1h_sent_at IS NULL
           AND g.status IN ('scheduled','confirmed')
           AND (g.scheduled_date + COALESCE(g.start_time, TIME '19:00')) 
               BETWEEN NOW() + INTERVAL '45 minutes'
                   AND NOW() + INTERVAL '75 minutes'
    LOOP
        SELECT sp.slug INTO v_slug FROM social_pages sp
         WHERE sp.linked_entity_type = 'home_group' AND sp.linked_entity_id = v_rsvp.group_id::text
         LIMIT 1;

        PERFORM public.fn_emit_home_notification(
            v_rsvp.user_id,
            'home_game_reminder_1h',
            'Starting in 1 hour — ' || COALESCE(v_rsvp.game_title, v_rsvp.group_name),
            'Head out soon. ' || COALESCE(v_rsvp.start_time::text, 'tonight'),
            '/hub/home-games/' || COALESCE(v_slug, v_rsvp.group_id::text),
            jsonb_build_object('game_id', v_rsvp.game_id, 'window', '1h'),
            'home_game_reminders'
        );

        UPDATE commander_home_rsvps 
           SET reminder_1h_sent_at = NOW()
         WHERE id = v_rsvp.rsvp_id;

        v_1h_sent := v_1h_sent + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sent_6h', v_6h_sent,
        'sent_1h', v_1h_sent,
        'run_at', NOW()
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_social_page_posts_bump_home_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linked_type text;
  v_linked_id   text;
  v_group_id    uuid;
BEGIN
  SELECT linked_entity_type, linked_entity_id
    INTO v_linked_type, v_linked_id
    FROM social_pages WHERE id = NEW.page_id;

  IF v_linked_type = 'home_group' AND v_linked_id IS NOT NULL THEN
    BEGIN
      v_group_id := v_linked_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NEW;
    END;
    PERFORM fn_bump_home_group_activity(v_group_id);
  END IF;

  RETURN NEW;
END
$function$


CREATE OR REPLACE FUNCTION public.fn_social_page_reviews_bump_home_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linked_type text;
  v_linked_id   text;
  v_group_id    uuid;
BEGIN
  SELECT linked_entity_type, linked_entity_id
    INTO v_linked_type, v_linked_id
    FROM social_pages WHERE id = NEW.page_id;

  IF v_linked_type = 'home_group' AND v_linked_id IS NOT NULL THEN
    BEGIN
      v_group_id := v_linked_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NEW;
    END;
    PERFORM fn_bump_home_group_activity(v_group_id);
  END IF;

  RETURN NEW;
END
$function$


CREATE OR REPLACE FUNCTION public.fn_sync_home_game_vouch_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.commander_home_groups
           SET vouch_count = vouch_count + 1
         WHERE id = NEW.group_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.commander_home_groups
           SET vouch_count = GREATEST(0, vouch_count - 1)
         WHERE id = OLD.group_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_trg_home_group_sync_venue()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM fn_home_group_sync_venue(NEW.id);
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_validate_home_game_timezone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.timezone IS NOT NULL AND NEW.timezone <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
      RAISE EXCEPTION 'INVALID_TIMEZONE'
        USING HINT = 'timezone "' || NEW.timezone || '" is not a recognized IANA timezone name';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.fn_validate_home_group_timezone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.timezone IS NULL OR NEW.timezone = '' THEN
    NEW.timezone := 'America/New_York';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE'
      USING HINT = 'timezone "' || NEW.timezone || '" is not a recognized IANA timezone name';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.generate_home_group_ical(p_group_id uuid, p_days_ahead integer DEFAULT 90)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ics text := ''; v_game RECORD; v_group RECORD;
    v_dtstamp text := to_char(NOW() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
BEGIN
    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RETURN ''; END IF;
    IF v_group.is_private 
       AND (auth.uid() IS NULL OR (auth.uid() <> v_group.owner_id
            AND NOT EXISTS (SELECT 1 FROM commander_home_members WHERE group_id = p_group_id AND user_id = auth.uid() AND status = 'approved')))
    THEN RETURN ''; END IF;

    v_ics := 'BEGIN:VCALENDAR' || chr(13)||chr(10) ||
             'VERSION:2.0' || chr(13)||chr(10) ||
             'PRODID:-//Smarter.Poker//Home Games//EN' || chr(13)||chr(10) ||
             'CALSCALE:GREGORIAN' || chr(13)||chr(10) ||
             'X-WR-CALNAME:' || replace(v_group.name, ',', '\,') || chr(13)||chr(10);

    FOR v_game IN SELECT * FROM commander_home_games 
         WHERE group_id = p_group_id AND status IN ('scheduled','confirmed','in_progress')
           AND scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (p_days_ahead || ' days')::interval
         ORDER BY scheduled_date
    LOOP
        v_ics := v_ics 
            || 'BEGIN:VEVENT' || chr(13)||chr(10)
            || 'UID:' || v_game.id::text || '@smarter.poker' || chr(13)||chr(10)
            || 'DTSTAMP:' || v_dtstamp || chr(13)||chr(10)
            || 'DTSTART:' || to_char(v_game.scheduled_date + COALESCE(v_game.start_time, TIME '19:00'), 'YYYYMMDD"T"HH24MISS') || chr(13)||chr(10)
            || 'DTEND:' || to_char(v_game.scheduled_date + COALESCE(v_game.end_time, TIME '23:00') + CASE WHEN v_game.end_time < TIME '06:00' THEN INTERVAL '1 day' ELSE INTERVAL '0' END, 'YYYYMMDD"T"HH24MISS') || chr(13)||chr(10)
            || 'SUMMARY:' || replace(COALESCE(v_game.title, v_group.name), ',', '\,') || chr(13)||chr(10)
            || 'DESCRIPTION:' || replace(COALESCE(v_game.description, 'Home poker game'), ',', '\,') || ' Stakes: ' || COALESCE(v_game.stakes, 'TBD') || chr(13)||chr(10)
            || 'LOCATION:' || replace(COALESCE(v_game.address, v_group.city || ', ' || v_group.state), ',', '\,') || chr(13)||chr(10)
            || 'STATUS:' || CASE v_game.status WHEN 'confirmed' THEN 'CONFIRMED' WHEN 'cancelled' THEN 'CANCELLED' ELSE 'TENTATIVE' END || chr(13)||chr(10)
            || 'END:VEVENT' || chr(13)||chr(10);
    END LOOP;
    v_ics := v_ics || 'END:VCALENDAR' || chr(13)||chr(10);
    RETURN v_ics;
END; $function$


CREATE OR REPLACE FUNCTION public.get_home_game_seat_map(p_game_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_game     RECORD;
    v_group    RECORD;
    v_seats    jsonb;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;

    -- Must be host, member, or public group viewer
    IF v_group.is_private 
       AND v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members 
                        WHERE group_id = v_game.group_id AND user_id = p_caller_user_id 
                          AND status = 'approved')
    THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'seat_number', s.seat_number,
        'user_id', s.user_id,
        'player_name', COALESCE(s.player_name, p.display_name, p.full_name, p.username),
        'avatar_url', p.avatar_url,
        'status', s.status,
        'seated_at', s.seated_at,
        'away_since', s.away_since,
        'note', s.note
    ) ORDER BY s.seat_number)
    INTO v_seats
    FROM commander_home_seats s
    LEFT JOIN profiles p ON p.id = s.user_id
    WHERE s.game_id = p_game_id;

    RETURN jsonb_build_object(
        'success', true,
        'game_id', p_game_id,
        'max_players', COALESCE(v_game.max_players, 9),
        'seats', COALESCE(v_seats, '[]'::jsonb)
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_home_game_tournaments_for_date(p_target_date date, p_state text DEFAULT NULL::text, p_inactivity_days integer DEFAULT 45)
 RETURNS TABLE(tournament_id uuid, title text, description text, scheduled_date date, start_time time without time zone, game_type text, stakes text, buyin_min integer, buyin_max integer, status text, rsvp_yes integer, max_players integer, group_id uuid, group_name text, city text, state text, latitude numeric, longitude numeric, profile_photo_url text, last_activity_at timestamp with time zone, visibility_override_until timestamp with time zone, slug text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT
        hg.id                           AS tournament_id,
        hg.title,
        hg.description,
        hg.scheduled_date,
        hg.start_time,
        hg.game_type,
        hg.stakes,
        hg.buyin_min,
        hg.buyin_max,
        hg.status,
        hg.rsvp_yes,
        hg.max_players,
        g.id                            AS group_id,
        g.name                          AS group_name,
        g.city,
        g.state,
        g.latitude,
        g.longitude,
        g.profile_photo_url,
        g.last_activity_at,
        g.visibility_override_until,
        sp.slug
    FROM commander_home_games hg
    INNER JOIN commander_home_groups g
            ON g.id = hg.group_id
    LEFT  JOIN social_pages sp
            ON sp.linked_entity_type = 'home_group'
           AND sp.linked_entity_id   = g.id::text
    WHERE hg.format         = 'tournament'
      AND hg.status         IN ('scheduled', 'in_progress')
      AND hg.scheduled_date = p_target_date
      AND g.is_private      = false
      AND g.is_active       = true
      AND (
            g.last_activity_at          >= NOW() - (p_inactivity_days || ' days')::interval
         OR g.created_at                >= NOW() - (p_inactivity_days || ' days')::interval
         OR (g.visibility_override_until IS NOT NULL AND g.visibility_override_until > NOW())
      )
      AND (p_state IS NULL OR UPPER(g.state) = UPPER(p_state))
    ORDER BY hg.start_time ASC, hg.title ASC;
$function$


CREATE OR REPLACE FUNCTION public.get_home_group_analytics(p_group_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group RECORD;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF v_group.owner_id <> p_caller_user_id 
       AND NOT EXISTS (SELECT 1 FROM commander_home_members 
                        WHERE group_id = p_group_id AND user_id = p_caller_user_id
                          AND role = 'admin' AND status = 'approved')
    THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    RETURN jsonb_build_object(
        'success', true,
        'group_id', p_group_id,
        'member_stats', jsonb_build_object(
            'total_approved', COALESCE(v_group.member_count, 0),
            'regulars', (SELECT COUNT(*) FROM commander_home_members 
                         WHERE group_id = p_group_id AND is_regular = true AND status = 'approved'),
            'pending', (SELECT COUNT(*) FROM commander_home_members 
                         WHERE group_id = p_group_id AND status = 'pending'),
            'banned', (SELECT COUNT(*) FROM commander_home_members 
                        WHERE group_id = p_group_id AND status = 'banned'),
            'joined_last_30d', (SELECT COUNT(*) FROM commander_home_members 
                                  WHERE group_id = p_group_id AND created_at > NOW() - INTERVAL '30 days')
        ),
        'game_stats', jsonb_build_object(
            'total_games', (SELECT COUNT(*) FROM commander_home_games WHERE group_id = p_group_id),
            'completed_games', (SELECT COUNT(*) FROM commander_home_games 
                                 WHERE group_id = p_group_id AND status = 'completed'),
            'cancelled_games', (SELECT COUNT(*) FROM commander_home_games 
                                 WHERE group_id = p_group_id AND status = 'cancelled'),
            'upcoming_games', (SELECT COUNT(*) FROM commander_home_games 
                                WHERE group_id = p_group_id 
                                  AND status IN ('scheduled','confirmed') 
                                  AND scheduled_date >= CURRENT_DATE),
            'avg_attendance_90d', COALESCE((
                SELECT ROUND(AVG(rsvp_yes)::numeric, 1) FROM commander_home_games 
                 WHERE group_id = p_group_id AND status = 'completed'
                   AND updated_at > NOW() - INTERVAL '90 days'
            ), 0)
        ),
        'engagement', jsonb_build_object(
            'post_count', (SELECT COUNT(*) FROM commander_home_posts WHERE group_id = p_group_id),
            'post_count_30d', (SELECT COUNT(*) FROM commander_home_posts 
                                WHERE group_id = p_group_id AND created_at > NOW() - INTERVAL '30 days'),
            'total_likes', (SELECT COUNT(*) FROM commander_home_post_likes pl
                             JOIN commander_home_posts p ON p.id = pl.post_id
                             WHERE p.group_id = p_group_id),
            'total_comments', (SELECT COUNT(*) FROM commander_home_post_comments pc
                                JOIN commander_home_posts p ON p.id = pc.post_id
                                WHERE p.group_id = p_group_id)
        ),
        'discovery', jsonb_build_object(
            'view_count', COALESCE(v_group.view_count, 0),
            'share_click_count', COALESCE(v_group.share_click_count, 0),
            'active_invite_tokens', (SELECT COUNT(*) FROM commander_home_invite_tokens 
                                      WHERE group_id = p_group_id AND is_active = true)
        ),
        'reputation', jsonb_build_object(
            'review_count', (SELECT COUNT(*) FROM commander_home_game_reviews r
                              JOIN commander_home_games g ON g.id = r.game_id
                              WHERE g.group_id = p_group_id),
            'avg_rating', COALESCE((
                SELECT ROUND(AVG(rating)::numeric, 2) FROM commander_home_game_reviews r
                 JOIN commander_home_games g ON g.id = r.game_id
                 WHERE g.group_id = p_group_id
            ), 0),
            'flake_count_90d', (SELECT COUNT(*) FROM commander_home_rsvps r
                                 JOIN commander_home_games g ON g.id = r.game_id
                                 WHERE g.group_id = p_group_id AND r.flaked = true
                                   AND g.updated_at > NOW() - INTERVAL '90 days')
        ),
        'activity', jsonb_build_object(
            'last_activity_at', v_group.last_activity_at,
            'days_since_activity', EXTRACT(day FROM (NOW() - v_group.last_activity_at))::int,
            'stale_warning_sent_at', v_group.inactivity_warning_sent_at,
            'hidden_sent_at', v_group.inactivity_hidden_sent_at
        )
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_home_group_feed(p_group_id uuid, p_caller_user_id uuid, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(entry_type text, entry_id uuid, created_at timestamp with time zone, author_id uuid, author_name text, author_avatar text, title text, content text, image_urls text[], metadata jsonb, link_to text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_group RECORD; v_is_member boolean; v_is_staff boolean;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

    v_is_member := (v_group.owner_id = p_caller_user_id)
                OR EXISTS (SELECT 1 FROM commander_home_members
                            WHERE group_id = p_group_id AND user_id = p_caller_user_id
                              AND status = 'approved');
    IF v_group.is_private AND NOT v_is_member THEN RAISE EXCEPTION 'NOT_A_MEMBER'; END IF;

    -- For hidden-content visibility decisions
    v_is_staff := public.fn_home_is_group_staff(p_caller_user_id, p_group_id);

    RETURN QUERY
    WITH post_entries AS (
        SELECT 'post'::text AS et, p.id, p.created_at, p.author_id,
               COALESCE(pr.display_name, pr.full_name, 'Member')::text AS aname,
               pr.avatar_url,
               NULL::text AS ttl,
               p.content,
               COALESCE(p.image_urls, ARRAY[]::text[]) AS image_urls,
               jsonb_build_object(
                   'post_type', p.post_type, 'is_pinned', p.is_pinned,
                   'likes_count', p.likes_count, 'comments_count', p.comments_count,
                   'is_hidden', COALESCE(p.is_hidden, false)
               ) AS meta,
               ('/hub/home-games/' || p_group_id::text || '#post-' || p.id::text)::text AS lnk
          FROM commander_home_posts p
          LEFT JOIN profiles pr ON pr.id = p.author_id
         WHERE p.group_id = p_group_id
           AND (p.visible_to = 'public' OR v_is_member)
           AND (
             COALESCE(p.is_hidden, false) = false           -- visible to all qualifying viewers
             OR p.author_id = p_caller_user_id              -- author always sees own
             OR v_is_staff                                  -- staff sees hidden for review
           )
    ),
    game_entries AS (
        SELECT 'game'::text AS et, g.id, g.created_at, g.host_id AS author_id,
               COALESCE(pr.display_name, pr.full_name, 'Host')::text AS aname,
               pr.avatar_url,
               COALESCE(g.title, 'Home game')::text AS ttl,
               g.description AS content,
               CASE WHEN g.cover_photo_url IS NOT NULL
                    THEN ARRAY[g.cover_photo_url]
                    ELSE ARRAY[]::text[] END AS image_urls,
               jsonb_build_object(
                   'status', g.status, 'scheduled_date', g.scheduled_date,
                   'start_time', g.start_time, 'stakes', g.stakes,
                   'game_type', g.game_type, 'format', g.format,
                   'rsvp_yes', g.rsvp_yes, 'max_players', g.max_players
               ) AS meta,
               ('/hub/home-games/' || p_group_id::text || '/games/' || g.id::text)::text AS lnk
          FROM commander_home_games g
          LEFT JOIN profiles pr ON pr.id = g.host_id
         WHERE g.group_id = p_group_id
           AND (NOT v_group.is_private OR v_is_member)
    ),
    poll_entries AS (
        SELECT 'poll'::text AS et, pl.id, pl.created_at, pl.created_by AS author_id,
               COALESCE(pr.display_name, pr.full_name, 'Member')::text AS aname,
               pr.avatar_url,
               pl.question::text AS ttl,
               NULL::text AS content,
               ARRAY[]::text[] AS image_urls,
               jsonb_build_object(
                   'poll_type', pl.poll_type, 'options', pl.options,
                   'is_closed', pl.is_closed, 'closes_at', pl.closes_at,
                   'vote_count', (SELECT COUNT(*) FROM commander_home_poll_votes
                                   WHERE poll_id = pl.id)
               ) AS meta,
               ('/hub/home-games/' || p_group_id::text || '#poll-' || pl.id::text)::text AS lnk
          FROM commander_home_polls pl
          LEFT JOIN profiles pr ON pr.id = pl.created_by
         WHERE pl.group_id = p_group_id
           AND v_is_member
    ),
    photo_entries AS (
        SELECT 'photo'::text AS et, ph.id, ph.created_at, ph.uploader_id AS author_id,
               COALESCE(pr.display_name, pr.full_name, 'Member')::text AS aname,
               pr.avatar_url,
               NULL::text AS ttl,
               ph.caption AS content,
               ARRAY[ph.photo_url] AS image_urls,
               jsonb_build_object('game_id', ph.game_id, 'is_featured', ph.is_featured) AS meta,
               ('/hub/home-games/' || p_group_id::text || '/games/' || ph.game_id::text)::text AS lnk
          FROM commander_home_game_photos ph
          LEFT JOIN profiles pr ON pr.id = ph.uploader_id
          JOIN commander_home_games g ON g.id = ph.game_id
         WHERE g.group_id = p_group_id
           AND (NOT v_group.is_private OR v_is_member)
           AND (
             COALESCE(ph.is_hidden, false) = false
             OR ph.uploader_id = p_caller_user_id
             OR v_is_staff
           )
    ),
    unified AS (
        SELECT * FROM post_entries
        UNION ALL SELECT * FROM game_entries
        UNION ALL SELECT * FROM poll_entries
        UNION ALL SELECT * FROM photo_entries
    )
    SELECT u.et, u.id, u.created_at, u.author_id, u.aname, u.avatar_url,
           u.ttl, u.content, u.image_urls, u.meta, u.lnk
      FROM unified u
     WHERE (p_before IS NULL OR u.created_at < p_before)
     ORDER BY u.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$function$


CREATE OR REPLACE FUNCTION public.get_home_group_member_engagement(p_group_id uuid, p_caller_user_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role text, status text, is_regular boolean, games_attended integer, games_attended_90d bigint, rsvps_yes_90d bigint, rsvps_no_90d bigint, flake_strikes integer, last_attended timestamp with time zone, last_rsvp_at timestamp with time zone, rsvp_flake_rate_pct numeric, host_private_note text, joined_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_group RECORD;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' 
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    SELECT * INTO v_group FROM commander_home_groups cg WHERE cg.id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF v_group.owner_id <> p_caller_user_id 
       AND NOT EXISTS (SELECT 1 FROM commander_home_members mm
                        WHERE mm.group_id = p_group_id 
                          AND mm.user_id = p_caller_user_id
                          AND mm.role = 'admin' AND mm.status = 'approved')
    THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    RETURN QUERY
    SELECT 
        m.user_id,
        COALESCE(p.display_name, p.full_name, p.username, 'Member')::text AS display_name,
        p.avatar_url,
        m.role,
        m.status,
        COALESCE(m.is_regular, false) AS is_regular,
        COALESCE(m.games_attended, 0) AS games_attended,
        COALESCE((SELECT COUNT(*) FROM commander_home_rsvps r 
                   JOIN commander_home_games g ON g.id = r.game_id
                   WHERE g.group_id = p_group_id AND r.user_id = m.user_id 
                     AND r.checked_in_at IS NOT NULL
                     AND r.checked_in_at > NOW() - INTERVAL '90 days'), 0) AS games_attended_90d,
        COALESCE((SELECT COUNT(*) FROM commander_home_rsvps r 
                   JOIN commander_home_games g ON g.id = r.game_id
                   WHERE g.group_id = p_group_id AND r.user_id = m.user_id 
                     AND r.response = 'yes'
                     AND r.responded_at > NOW() - INTERVAL '90 days'), 0) AS rsvps_yes_90d,
        COALESCE((SELECT COUNT(*) FROM commander_home_rsvps r 
                   JOIN commander_home_games g ON g.id = r.game_id
                   WHERE g.group_id = p_group_id AND r.user_id = m.user_id 
                     AND r.response = 'no'
                     AND r.responded_at > NOW() - INTERVAL '90 days'), 0) AS rsvps_no_90d,
        COALESCE(m.flake_strikes, 0) AS flake_strikes,
        m.last_attended,
        (SELECT MAX(r.responded_at) FROM commander_home_rsvps r 
           JOIN commander_home_games g ON g.id = r.game_id
          WHERE g.group_id = p_group_id AND r.user_id = m.user_id) AS last_rsvp_at,
        CASE 
            WHEN COALESCE((SELECT COUNT(*) FROM commander_home_rsvps r 
                            JOIN commander_home_games g ON g.id = r.game_id
                            WHERE g.group_id = p_group_id AND r.user_id = m.user_id 
                              AND r.response = 'yes'
                              AND r.responded_at > NOW() - INTERVAL '90 days'), 0) = 0 THEN 0
            ELSE ROUND(100.0 * 
                COALESCE((SELECT COUNT(*) FROM commander_home_rsvps r 
                           JOIN commander_home_games g ON g.id = r.game_id
                           WHERE g.group_id = p_group_id AND r.user_id = m.user_id 
                             AND r.flaked = true
                             AND r.responded_at > NOW() - INTERVAL '90 days'), 0)::numeric
                / NULLIF((SELECT COUNT(*) FROM commander_home_rsvps r 
                           JOIN commander_home_games g ON g.id = r.game_id
                           WHERE g.group_id = p_group_id AND r.user_id = m.user_id 
                             AND r.response = 'yes'
                             AND r.responded_at > NOW() - INTERVAL '90 days'), 0), 1)
        END AS rsvp_flake_rate_pct,
        m.host_private_note,
        m.joined_at
      FROM commander_home_members m
      LEFT JOIN profiles p ON p.id = m.user_id
     WHERE m.group_id = p_group_id
       AND m.status IN ('approved','pending')
     ORDER BY 
        CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        m.is_regular DESC,
        COALESCE(m.games_attended, 0) DESC,
        m.joined_at;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_home_group_public_detail(p_slug_or_id text, p_viewer_id uuid DEFAULT NULL::uuid, p_inactivity_days integer DEFAULT 45)
 RETURNS TABLE(group_id uuid, slug text, name text, tagline text, description text, profile_photo_url text, cover_photo_url text, city text, state text, default_game_type text, default_stakes text, typical_buyin_min integer, typical_buyin_max integer, max_players integer, typical_day text, typical_time time without time zone, frequency text, is_private boolean, is_active boolean, is_visible boolean, visibility_reason text, last_activity_at timestamp with time zone, member_count integer, games_hosted integer, upcoming_games_count integer, viewer_membership_role text, viewer_is_member boolean, upcoming_games jsonb, recent_reviews jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group_id     uuid;
    v_is_member    boolean;
    v_member_role  text;
    v_is_visible   boolean;
    v_reason       text;
BEGIN
    IF p_viewer_id IS NOT NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
      IF auth.uid() IS NULL OR p_viewer_id <> auth.uid() THEN
        RAISE EXCEPTION 'UNAUTHORIZED: p_viewer_id must match authenticated user'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    BEGIN
        v_group_id := p_slug_or_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        SELECT g.id INTO v_group_id
          FROM commander_home_groups g
          JOIN social_pages sp
            ON sp.linked_entity_type = 'home_group'
           AND sp.linked_entity_id = g.id::text
         WHERE sp.slug = p_slug_or_id
         LIMIT 1;
    END;

    IF v_group_id IS NULL THEN RETURN; END IF;

    IF p_viewer_id IS NOT NULL THEN
        SELECT
            CASE WHEN g.owner_id = p_viewer_id THEN 'owner' ELSE m.role END
          INTO v_member_role
          FROM commander_home_groups g
          LEFT JOIN commander_home_members m
            ON m.group_id = g.id AND m.user_id = p_viewer_id AND m.status = 'approved'
         WHERE g.id = v_group_id;
        v_is_member := (v_member_role IS NOT NULL);
    ELSE
        v_member_role := NULL;
        v_is_member := false;
    END IF;

    SELECT
        CASE
          WHEN g.is_private AND NOT v_is_member THEN false
          WHEN NOT g.is_active THEN false
          WHEN g.visibility_override_until IS NOT NULL
               AND g.visibility_override_until > NOW() THEN true
          WHEN g.last_activity_at IS NULL THEN false
          WHEN g.last_activity_at < NOW() - (p_inactivity_days || ' days')::interval THEN false
          ELSE true
        END,
        CASE
          WHEN g.is_private AND NOT v_is_member THEN 'private'
          WHEN NOT g.is_active THEN 'inactive'
          WHEN g.visibility_override_until IS NOT NULL
               AND g.visibility_override_until > NOW() THEN 'public'
          WHEN g.last_activity_at IS NULL THEN 'no_activity'
          WHEN g.last_activity_at < NOW() - (p_inactivity_days || ' days')::interval THEN 'stale'
          ELSE 'public'
        END
      INTO v_is_visible, v_reason
      FROM commander_home_groups g
     WHERE g.id = v_group_id;

    IF NOT v_is_visible AND NOT v_is_member THEN
        RETURN QUERY
        SELECT g.id, sp.slug::text, g.name::text,
               NULL::text, NULL::text, g.profile_photo_url::text, NULL::text,
               NULL::text, NULL::text, NULL::text, NULL::text,
               NULL::int, NULL::int, NULL::int, NULL::text, NULL::time, NULL::text,
               g.is_private, g.is_active, v_is_visible, v_reason,
               NULL::timestamptz, NULL::int, NULL::int, 0::int,
               v_member_role::text, v_is_member,
               '[]'::jsonb, '[]'::jsonb, g.created_at
          FROM commander_home_groups g
          LEFT JOIN social_pages sp ON sp.linked_entity_type = 'home_group'
                                    AND sp.linked_entity_id = g.id::text
         WHERE g.id = v_group_id;
    ELSE
        RETURN QUERY
        SELECT
            g.id, sp.slug::text, g.name::text, g.tagline::text, g.description::text,
            g.profile_photo_url::text, g.cover_photo_url::text,
            g.city::text, g.state::text,
            g.default_game_type::text, g.default_stakes::text,
            g.typical_buyin_min, g.typical_buyin_max, g.max_players,
            g.typical_day::text, g.typical_time, g.frequency::text,
            g.is_private, g.is_active, v_is_visible, v_reason,
            g.last_activity_at, g.member_count, g.games_hosted,
            COALESCE((
                SELECT COUNT(*)::int FROM commander_home_games hg
                 WHERE hg.group_id = g.id AND hg.status IN ('scheduled','confirmed')
                   AND hg.scheduled_date >= CURRENT_DATE
            ), 0),
            v_member_role::text, v_is_member,
            COALESCE((
                SELECT jsonb_agg(row_payload ORDER BY sort_key)
                  FROM (
                    SELECT
                        jsonb_build_object(
                            'id', hg.id, 'title', hg.title,
                            'scheduled_date', hg.scheduled_date,
                            'start_time', hg.start_time, 'end_time', hg.end_time,
                            'game_type', hg.game_type, 'stakes', hg.stakes, 'format', hg.format,
                            'buyin_min', hg.buyin_min, 'buyin_max', hg.buyin_max,
                            'max_players', hg.max_players, 'status', hg.status,
                            'neighborhood', hg.neighborhood,
                            'rsvp_yes', COALESCE(hg.rsvp_yes, 0),
                            'rsvp_maybe', COALESCE(hg.rsvp_maybe, 0),
                            'waitlist_count', COALESCE(hg.waitlist_count, 0)
                        ) AS row_payload,
                        (hg.scheduled_date::text || ' ' || COALESCE(hg.start_time::text, '00:00')) AS sort_key
                      FROM commander_home_games hg
                     WHERE hg.group_id = g.id
                       AND hg.status IN ('scheduled','confirmed')
                       AND hg.scheduled_date >= CURRENT_DATE
                     ORDER BY hg.scheduled_date, hg.start_time LIMIT 5
                  ) AS upcoming
            ), '[]'::jsonb),
            COALESCE((
                SELECT jsonb_agg(row_payload ORDER BY created_at_sort DESC)
                  FROM (
                    SELECT
                        jsonb_build_object(
                            'id', r.id, 'rating', r.rating, 'review_text', r.review_text,
                            'created_at', r.created_at,
                            'reviewer_name', COALESCE(p.display_name, p.full_name, p.username, 'Anonymous'),
                            'game_title', hg.title, 'game_date', hg.scheduled_date
                        ) AS row_payload,
                        r.created_at AS created_at_sort
                      FROM commander_home_game_reviews r
                      JOIN commander_home_games hg ON hg.id = r.game_id
                      LEFT JOIN profiles p ON p.id = r.reviewer_id
                     WHERE hg.group_id = g.id
                       AND COALESCE(r.is_hidden, false) = false   -- ← NEW
                     ORDER BY r.created_at DESC LIMIT 3
                  ) AS reviews
            ), '[]'::jsonb),
            g.created_at
          FROM commander_home_groups g
          LEFT JOIN social_pages sp ON sp.linked_entity_type = 'home_group'
                                    AND sp.linked_entity_id = g.id::text
         WHERE g.id = v_group_id;
    END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_home_group_roster(p_group_id uuid, p_caller_user_id uuid)
 RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, relationship text, member_role text, member_status text, member_joined_at timestamp with time zone, follower_since timestamp with time zone, notify_new_games boolean, notify_announcements boolean, checked_in_games integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
#variable_conflict use_column
DECLARE
    v_caller uuid := auth.uid();
    v_role   text := auth.role();
    v_is_staff boolean;
BEGIN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF v_caller IS NULL OR v_caller <> p_caller_user_id THEN
        RAISE EXCEPTION 'AUTH_MISMATCH';
      END IF;
    END IF;

    SELECT
      EXISTS (SELECT 1 FROM commander_home_groups g
               WHERE g.id = p_group_id AND g.owner_id = p_caller_user_id)
      OR EXISTS (SELECT 1 FROM commander_home_members m
                  WHERE m.group_id = p_group_id AND m.user_id = p_caller_user_id
                    AND m.role = 'admin' AND m.status = 'approved')
    INTO v_is_staff;

    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED'
            USING HINT='only group owner or approved admin may view the roster';
    END IF;

    RETURN QUERY
    WITH unified AS (
        SELECT m.user_id,
               'member'::text AS src,
               m.role AS m_role,
               m.status AS m_status,
               m.joined_at AS m_joined,
               NULL::timestamptz AS f_since,
               COALESCE(m.notify_new_games, true) AS m_notify_games,
               COALESCE(m.notify_announcements, true) AS m_notify_ann
          FROM commander_home_members m
         WHERE m.group_id = p_group_id

        UNION ALL

        SELECT f.user_id,
               'follower'::text AS src,
               NULL::text AS m_role,
               NULL::text AS m_status,
               NULL::timestamptz AS m_joined,
               f.created_at AS f_since,
               f.notify_new_games AS m_notify_games,
               f.notify_announcements AS m_notify_ann
          FROM commander_home_group_follows f
         WHERE f.group_id = p_group_id
    ),
    collapsed AS (
        SELECT u.user_id,
               CASE
                 WHEN bool_or(u.src='member') AND bool_or(u.src='follower') THEN 'both'
                 WHEN bool_or(u.src='member')   THEN 'member'
                 ELSE 'follower'
               END AS relationship,
               MAX(CASE WHEN u.src='member' THEN u.m_role   END) AS member_role,
               MAX(CASE WHEN u.src='member' THEN u.m_status END) AS member_status,
               MAX(CASE WHEN u.src='member' THEN u.m_joined END) AS member_joined_at,
               MAX(CASE WHEN u.src='follower' THEN u.f_since END) AS follower_since,
               bool_or(u.m_notify_games)  AS notify_new_games,
               bool_or(u.m_notify_ann)    AS notify_announcements
          FROM unified u
         GROUP BY u.user_id
    )
    SELECT c.user_id,
           p.username,
           COALESCE(p.display_name, p.full_name, p.username) AS display_name,
           p.avatar_url,
           c.relationship,
           c.member_role,
           c.member_status,
           c.member_joined_at,
           c.follower_since,
           c.notify_new_games,
           c.notify_announcements,
           (
              SELECT COUNT(*)::int
                FROM commander_home_rsvps r
                JOIN commander_home_games g ON g.id = r.game_id
               WHERE g.group_id = p_group_id
                 AND r.user_id = c.user_id
                 AND r.checked_in_at IS NOT NULL
           ) AS checked_in_games
      FROM collapsed c
      JOIN profiles p ON p.id = c.user_id
     ORDER BY
        (c.member_status = 'banned') ASC,
        c.relationship = 'follower',
        COALESCE(c.member_joined_at, c.follower_since) DESC;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_home_group_unread_count(p_group_id uuid, p_caller_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_last_read timestamptz;
  v_count int;
  v_is_staff boolean;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT last_read_posts_at INTO v_last_read
    FROM commander_home_members
   WHERE group_id = p_group_id
     AND user_id = p_caller_user_id
     AND status = 'approved';
  IF NOT FOUND THEN RETURN 0; END IF;

  v_is_staff := public.fn_home_is_group_staff(p_caller_user_id, p_group_id);

  SELECT COUNT(*) INTO v_count
    FROM commander_home_posts
   WHERE group_id = p_group_id
     AND created_at > COALESCE(v_last_read, '1970-01-01'::timestamptz)
     AND author_id <> p_caller_user_id
     AND (
       COALESCE(is_hidden, false) = false  -- visible posts always counted
       OR v_is_staff                       -- staff: include hidden in their badge too
     );

  RETURN COALESCE(v_count, 0);
END;
$function$


CREATE OR REPLACE FUNCTION public.get_home_group_visibility_status(p_group_id uuid, p_inactivity_days integer DEFAULT 45)
 RETURNS TABLE(is_currently_visible boolean, reason_hidden text, days_stale integer, days_until_hidden integer, last_activity_at timestamp with time zone, visibility_override_until timestamp with time zone, threshold_days integer, is_override_active boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_is_private         boolean;
    v_is_active          boolean;
    v_last_activity      timestamptz;
    v_created_at         timestamptz;
    v_override_until     timestamptz;
    v_days_stale         int;
    v_days_left          int;
    v_override_active    boolean;
    v_reason             text;
    v_visible            boolean;
BEGIN
    SELECT g.is_private, g.is_active, g.last_activity_at, g.created_at, g.visibility_override_until
      INTO v_is_private, v_is_active, v_last_activity, v_created_at, v_override_until
      FROM commander_home_groups g
     WHERE g.id = p_group_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            false, 'not_found'::text, NULL::int, NULL::int,
            NULL::timestamptz, NULL::timestamptz, p_inactivity_days, false;
        RETURN;
    END IF;

    v_override_active := (v_override_until IS NOT NULL AND v_override_until > NOW());

    IF v_last_activity IS NOT NULL THEN
        v_days_stale := EXTRACT(EPOCH FROM (NOW() - v_last_activity))::int / 86400;
    END IF;

    IF v_is_private THEN
        v_visible := false; v_reason := 'private'; v_days_left := NULL;
    ELSIF NOT v_is_active THEN
        v_visible := false; v_reason := 'inactive'; v_days_left := NULL;
    ELSIF v_override_active THEN
        v_visible := true;  v_reason := NULL; v_days_left := NULL;
    ELSIF v_last_activity IS NULL
          AND v_created_at < NOW() - (p_inactivity_days || ' days')::interval THEN
        v_visible := false; v_reason := 'no_activity'; v_days_left := 0;
    ELSIF v_last_activity IS NOT NULL AND v_days_stale > p_inactivity_days THEN
        v_visible := false; v_reason := 'stale'; v_days_left := 0;
    ELSE
        v_visible := true;  v_reason := NULL;
        IF v_last_activity IS NOT NULL THEN
            v_days_left := p_inactivity_days - v_days_stale;
        ELSE
            v_days_left := p_inactivity_days
                           - (EXTRACT(EPOCH FROM (NOW() - v_created_at))::int / 86400);
        END IF;
        IF v_days_left < 0 THEN v_days_left := 0; END IF;
    END IF;

    RETURN QUERY SELECT
        v_visible,
        v_reason,
        v_days_stale,
        v_days_left,
        v_last_activity,
        v_override_until,
        p_inactivity_days,
        v_override_active;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_home_group_weekly_trends(p_group_id uuid, p_caller_user_id uuid, p_weeks integer DEFAULT 12)
 RETURNS TABLE(week_start date, member_count integer, new_members integer, games_scheduled integer, games_completed integer, games_cancelled integer, total_rsvp_yes integer, total_checked_in integer, flake_count integer, post_count integer, view_count_delta integer, share_count_delta integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_group RECORD;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF v_group.owner_id <> p_caller_user_id 
       AND NOT EXISTS (SELECT 1 FROM commander_home_members 
                        WHERE group_id = p_group_id AND user_id = p_caller_user_id 
                          AND role IN ('admin','owner') AND status='approved')
    THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    RETURN QUERY
    SELECT s.week_start, s.member_count, s.new_members,
           s.games_scheduled, s.games_completed, s.games_cancelled,
           s.total_rsvp_yes, s.total_checked_in, s.flake_count,
           s.post_count, s.view_count_delta, s.share_count_delta
      FROM commander_home_group_weekly_snapshots s
     WHERE s.group_id = p_group_id
       AND s.week_start >= CURRENT_DATE - (p_weeks * 7 || ' days')::interval
     ORDER BY s.week_start;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_home_groups_facets()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_facets jsonb;
BEGIN
    SELECT jsonb_build_object(
        'cities', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('city', city, 'state', state, 'count', c))
              FROM (SELECT city, state, COUNT(*) AS c FROM commander_home_groups 
                     WHERE NOT is_private AND is_active AND profile_photo_url IS NOT NULL
                       AND last_activity_at > NOW() - INTERVAL '45 days'
                       AND city IS NOT NULL
                     GROUP BY city, state 
                     ORDER BY c DESC 
                     LIMIT 30) t
        ), '[]'::jsonb),
        'states', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('state', state, 'count', c))
              FROM (SELECT state, COUNT(*) AS c FROM commander_home_groups 
                     WHERE NOT is_private AND is_active AND profile_photo_url IS NOT NULL
                       AND last_activity_at > NOW() - INTERVAL '45 days'
                       AND state IS NOT NULL
                     GROUP BY state
                     ORDER BY c DESC) t
        ), '[]'::jsonb),
        'game_types', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('game_type', default_game_type, 'count', c))
              FROM (SELECT default_game_type, COUNT(*) AS c FROM commander_home_groups 
                     WHERE NOT is_private AND is_active AND profile_photo_url IS NOT NULL
                       AND last_activity_at > NOW() - INTERVAL '45 days'
                       AND default_game_type IS NOT NULL
                     GROUP BY default_game_type 
                     ORDER BY c DESC) t
        ), '[]'::jsonb),
        'stakes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('stakes', default_stakes, 'count', c))
              FROM (SELECT default_stakes, COUNT(*) AS c FROM commander_home_groups 
                     WHERE NOT is_private AND is_active AND profile_photo_url IS NOT NULL
                       AND last_activity_at > NOW() - INTERVAL '45 days'
                       AND default_stakes IS NOT NULL
                     GROUP BY default_stakes 
                     ORDER BY c DESC) t
        ), '[]'::jsonb),
        'tags', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('tag', tag, 'count', c))
              FROM (SELECT unnest(tags) AS tag, COUNT(*) AS c 
                      FROM commander_home_groups 
                     WHERE NOT is_private AND is_active AND profile_photo_url IS NOT NULL
                       AND last_activity_at > NOW() - INTERVAL '45 days'
                       AND tags IS NOT NULL AND array_length(tags, 1) > 0
                     GROUP BY unnest(tags)
                     ORDER BY c DESC 
                     LIMIT 30) t
        ), '[]'::jsonb),
        'total_discoverable', (
            SELECT COUNT(*) FROM commander_home_groups 
             WHERE NOT is_private AND is_active AND profile_photo_url IS NOT NULL
               AND last_activity_at > NOW() - INTERVAL '45 days'
        )
    ) INTO v_facets;

    RETURN v_facets;
END; $function$


CREATE OR REPLACE FUNCTION public.get_live_home_game_state(p_game_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_game  RECORD;
    v_group RECORD;
    v_is_host boolean;
    v_seated jsonb;
    v_away   jsonb;
    v_enroute jsonb;
    v_waitlist jsonb;
    v_no_response jsonb;
    v_flakes jsonb;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;

    v_is_host := (v_game.host_id = p_caller_user_id)
              OR (v_group.owner_id = p_caller_user_id)
              OR EXISTS (SELECT 1 FROM commander_home_members
                          WHERE group_id = v_game.group_id AND user_id = p_caller_user_id
                            AND role = 'admin' AND status = 'approved');
    IF NOT v_is_host THEN RAISE EXCEPTION 'NOT_A_HOST'; END IF;

    -- BUG-7 fix: 'seated' is the Home Games enum for an occupied seat.
    -- 'occupied' is the Club Arena enum (commander_seats, different table).
    SELECT jsonb_agg(jsonb_build_object(
        'seat_number', s.seat_number, 'user_id', s.user_id,
        'player_name', COALESCE(s.player_name, p.display_name, p.full_name, 'Player'),
        'avatar_url', p.avatar_url,
        'seated_at', s.seated_at,
        'checked_in_at', r.checked_in_at
    ) ORDER BY s.seat_number)
    INTO v_seated
    FROM commander_home_seats s
    LEFT JOIN profiles p ON p.id = s.user_id
    LEFT JOIN commander_home_rsvps r ON r.game_id = s.game_id AND r.user_id = s.user_id
    WHERE s.game_id = p_game_id AND s.status = 'seated';

    SELECT jsonb_agg(jsonb_build_object(
        'seat_number', s.seat_number, 'user_id', s.user_id,
        'player_name', COALESCE(s.player_name, p.display_name, p.full_name, 'Player'),
        'avatar_url', p.avatar_url,
        'away_since', s.away_since
    ) ORDER BY s.seat_number)
    INTO v_away
    FROM commander_home_seats s
    LEFT JOIN profiles p ON p.id = s.user_id
    WHERE s.game_id = p_game_id AND s.status = 'away';

    -- BUG-7 fix (second site): en_route exclusion must match the seated/away
    -- enum. Previously 'occupied' here never matched, so seated-and-in-person
    -- players were misreported as en_route (haven't arrived yet).
    SELECT jsonb_agg(jsonb_build_object(
        'user_id', r.user_id,
        'player_name', COALESCE(p.display_name, p.full_name, 'Player'),
        'avatar_url', p.avatar_url,
        'bringing_guests', r.bringing_guests
    ))
    INTO v_enroute
    FROM commander_home_rsvps r
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE r.game_id = p_game_id
      AND r.response = 'yes'
      AND r.checked_in_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM commander_home_seats s
                       WHERE s.game_id = p_game_id AND s.user_id = r.user_id
                         AND s.status IN ('seated','away'));

    SELECT jsonb_agg(jsonb_build_object(
        'user_id', r.user_id,
        'player_name', COALESCE(p.display_name, p.full_name, 'Player'),
        'avatar_url', p.avatar_url,
        'joined_waitlist_at', r.responded_at
    ) ORDER BY r.responded_at)
    INTO v_waitlist
    FROM commander_home_rsvps r
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE r.game_id = p_game_id AND r.response = 'waitlist';

    SELECT jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'player_name', COALESCE(p.display_name, p.full_name, 'Member'),
        'avatar_url', p.avatar_url
    ))
    INTO v_no_response
    FROM commander_home_members m
    LEFT JOIN profiles p ON p.id = m.user_id
    WHERE m.group_id = v_game.group_id
      AND m.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM commander_home_rsvps r
                       WHERE r.game_id = p_game_id AND r.user_id = m.user_id);

    SELECT jsonb_agg(jsonb_build_object(
        'user_id', r.user_id,
        'player_name', COALESCE(p.display_name, p.full_name, 'Player'),
        'avatar_url', p.avatar_url
    ))
    INTO v_flakes
    FROM commander_home_rsvps r
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE r.game_id = p_game_id AND r.flaked = true;

    RETURN jsonb_build_object(
        'success', true,
        'game', jsonb_build_object(
            'id', v_game.id, 'title', v_game.title,
            'status', v_game.status,
            'scheduled_date', v_game.scheduled_date,
            'start_time', v_game.start_time,
            'max_players', COALESCE(v_game.max_players, 9),
            'rsvp_yes', v_game.rsvp_yes, 'rsvp_maybe', v_game.rsvp_maybe,
            'rsvp_no', v_game.rsvp_no, 'waitlist_count', v_game.waitlist_count
        ),
        'seated', COALESCE(v_seated, '[]'::jsonb),
        'seated_count', jsonb_array_length(COALESCE(v_seated, '[]'::jsonb)),
        'away', COALESCE(v_away, '[]'::jsonb),
        'en_route', COALESCE(v_enroute, '[]'::jsonb),
        'en_route_count', jsonb_array_length(COALESCE(v_enroute, '[]'::jsonb)),
        'waitlist', COALESCE(v_waitlist, '[]'::jsonb),
        'no_response', COALESCE(v_no_response, '[]'::jsonb),
        'flakes', COALESCE(v_flakes, '[]'::jsonb)
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_my_followed_home_groups(p_caller_user_id uuid)
 RETURNS TABLE(group_id uuid, name text, slug text, profile_photo_url text, city text, state text, member_count integer, games_hosted integer, followed_at timestamp with time zone, notify_new_games boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    RETURN QUERY
    SELECT g.id, g.name, sp.slug, g.profile_photo_url, g.city, g.state, 
           g.member_count, g.games_hosted,
           f.created_at, f.notify_new_games
      FROM commander_home_group_follows f
      JOIN commander_home_groups g ON g.id = f.group_id
      LEFT JOIN social_pages sp ON sp.linked_entity_type='home_group' AND sp.linked_entity_id = g.id::text
     WHERE f.user_id = p_caller_user_id
     ORDER BY f.created_at DESC;
END; $function$


CREATE OR REPLACE FUNCTION public.get_my_home_groups(p_caller_user_id uuid)
 RETURNS TABLE(group_id uuid, slug text, name text, profile_photo_url text, city text, state text, is_private boolean, is_active boolean, my_role text, my_status text, member_count integer, upcoming_games_count integer, next_game jsonb, last_activity_at timestamp with time zone, joined_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    RETURN QUERY
    WITH my_rels AS (
        -- Branch 1: groups I own (authoritative via owner_id column)
        SELECT g.id,
               'owner'::text    AS my_role,
               'approved'::text AS my_status,
               g.created_at     AS joined_at
          FROM commander_home_groups g
         WHERE g.owner_id = p_caller_user_id
        UNION ALL
        -- Branch 2: groups I'm a member of BUT where I'm not the owner
        -- (avoids duplicates when owner also has a self-row with role='owner'
        -- in commander_home_members)
        SELECT m.group_id,
               m.role::text,
               m.status::text,
               COALESCE(m.joined_at, m.created_at)
          FROM commander_home_members m
          JOIN commander_home_groups g ON g.id = m.group_id
         WHERE m.user_id = p_caller_user_id
           AND m.status <> 'banned'
           AND g.owner_id <> p_caller_user_id  -- dedup guard
    )
    SELECT
        g.id,
        sp.slug::text,
        g.name::text,
        g.profile_photo_url::text,
        g.city::text,
        g.state::text,
        g.is_private,
        g.is_active,
        r.my_role,
        r.my_status,
        g.member_count,
        COALESCE((
            SELECT COUNT(*)::int
              FROM commander_home_games hg
             WHERE hg.group_id = g.id
               AND hg.status IN ('scheduled','confirmed')
               AND hg.scheduled_date >= CURRENT_DATE
        ), 0),
        (
            SELECT jsonb_build_object(
                'id', hg.id,
                'title', hg.title,
                'scheduled_date', hg.scheduled_date,
                'start_time', hg.start_time,
                'format', hg.format,
                'stakes', hg.stakes,
                'rsvp_yes', COALESCE(hg.rsvp_yes, 0),
                'max_players', hg.max_players
            )
              FROM commander_home_games hg
             WHERE hg.group_id = g.id
               AND hg.status IN ('scheduled','confirmed')
               AND hg.scheduled_date >= CURRENT_DATE
             ORDER BY hg.scheduled_date, hg.start_time
             LIMIT 1
        ),
        g.last_activity_at,
        r.joined_at
      FROM my_rels r
      JOIN commander_home_groups g ON g.id = r.id
      LEFT JOIN social_pages sp
        ON sp.linked_entity_type = 'home_group'
       AND sp.linked_entity_id = g.id::text
     ORDER BY 
        CASE r.my_status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        CASE r.my_role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        g.last_activity_at DESC NULLS LAST;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_recommended_home_groups(p_caller_user_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(group_id uuid, name text, slug text, city text, state text, profile_photo_url text, member_count integer, friends_in_group bigint, recommendation_score numeric, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_city  text;
    v_user_state text;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' 
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    -- Qualify profiles.city / profiles.state to disambiguate from RETURN TABLE vars
    SELECT p.city, p.state INTO v_user_city, v_user_state
      FROM profiles p WHERE p.id = p_caller_user_id;

    RETURN QUERY
    WITH friend_groups AS (
      SELECT m.group_id, COUNT(DISTINCT m.user_id) AS friend_count
        FROM commander_home_members m
       WHERE m.user_id IN (
           SELECT DISTINCT CASE WHEN f.user_id = p_caller_user_id 
                                 THEN f.friend_id ELSE f.user_id END
             FROM friendships f
            WHERE (f.user_id = p_caller_user_id OR f.friend_id = p_caller_user_id)
              AND f.status = 'accepted'
       )
       AND m.status = 'approved'
       GROUP BY m.group_id
    ),
    scored AS (
      SELECT 
        g.id, g.name, sp.slug, g.city AS g_city, g.state AS g_state, 
        g.profile_photo_url,
        COALESCE(g.member_count, 0) AS member_count,
        COALESCE(fg.friend_count, 0) AS friends_in_group,
        (COALESCE(fg.friend_count, 0) * 30
         + CASE WHEN v_user_city IS NOT NULL AND g.city ILIKE v_user_city THEN 20 ELSE 0 END
         + CASE WHEN v_user_state IS NOT NULL AND g.state = v_user_state THEN 10 ELSE 0 END
         + LEAST(10, COALESCE(g.games_hosted, 0)) * 0.5
         + LEAST(5, COALESCE(g.view_count, 0) / 100.0)
        )::numeric AS score,
        CASE 
          WHEN COALESCE(fg.friend_count, 0) > 0 
            THEN fg.friend_count || ' friend' || 
                 CASE WHEN fg.friend_count > 1 THEN 's' ELSE '' END || ' in this group'
          WHEN v_user_city IS NOT NULL AND g.city ILIKE v_user_city 
            THEN 'In your city: ' || g.city
          WHEN v_user_state IS NOT NULL AND g.state = v_user_state 
            THEN 'In your state'
          ELSE 'Active home game'
        END AS reason
        FROM commander_home_groups g
        LEFT JOIN friend_groups fg ON fg.group_id = g.id
        LEFT JOIN social_pages sp 
               ON sp.linked_entity_type IN ('home_group','home_game') 
              AND sp.linked_entity_id = g.id::text
       WHERE g.is_active = true
         AND NOT g.is_private
         AND g.profile_photo_url IS NOT NULL
         AND g.last_activity_at > NOW() - INTERVAL '45 days'
         AND NOT EXISTS (SELECT 1 FROM commander_home_members m 
                          WHERE m.group_id = g.id AND m.user_id = p_caller_user_id)
         AND g.owner_id <> p_caller_user_id
    )
    SELECT s.id, s.name, s.slug, s.g_city, s.g_state, s.profile_photo_url,
           s.member_count, s.friends_in_group, s.score, s.reason
      FROM scored s
     ORDER BY s.score DESC
     LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$function$


CREATE OR REPLACE FUNCTION public.get_trending_home_groups(p_limit integer DEFAULT 12, p_near_lat numeric DEFAULT NULL::numeric, p_near_lng numeric DEFAULT NULL::numeric, p_radius_miles integer DEFAULT NULL::integer)
 RETURNS TABLE(group_id uuid, name text, city text, state text, profile_photo_url text, is_private boolean, member_count integer, recent_rsvps_30d bigint, trending_score numeric, distance_miles numeric, tags text[])
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_point geography;
BEGIN
    IF p_near_lat IS NOT NULL AND p_near_lng IS NOT NULL THEN
        v_point := ST_SetSRID(ST_MakePoint(p_near_lng, p_near_lat), 4326)::geography;
    END IF;

    RETURN QUERY
    SELECT 
        mv.group_id, mv.name, mv.city, mv.state, mv.profile_photo_url, 
        mv.is_private, mv.member_count, mv.recent_rsvps_30d, mv.trending_score,
        CASE WHEN v_point IS NOT NULL AND mv.location_geog IS NOT NULL
             THEN ROUND((ST_Distance(mv.location_geog, v_point) / 1609.344)::numeric, 1)
             ELSE NULL END AS distance_miles,
        mv.tags
      FROM mv_home_groups_trending mv
     WHERE (v_point IS NULL OR p_radius_miles IS NULL OR mv.location_geog IS NULL
            OR ST_DWithin(mv.location_geog, v_point, p_radius_miles * 1609.344))
     ORDER BY mv.trending_score DESC
     LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$function$


CREATE OR REPLACE FUNCTION public.get_user_home_games_calendar(p_caller_user_id uuid, p_days_ahead integer DEFAULT 60)
 RETURNS TABLE(game_id uuid, group_id uuid, group_name text, group_slug text, title text, scheduled_date date, start_time time without time zone, end_time time without time zone, stakes text, game_type text, format text, address text, address_visible boolean, notes_for_attendees text, my_response text, my_checked_in_at timestamp with time zone, rsvp_yes integer, rsvp_maybe integer, max_players integer, waitlist_count integer, status text, is_host boolean, cover_photo_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

    RETURN QUERY
    SELECT 
        g.id, g.group_id, grp.name, sp.slug,
        g.title, g.scheduled_date, g.start_time, g.end_time,
        g.stakes, g.game_type, g.format,
        -- Address visibility: show address only if yes-RSVP + member
        CASE 
          WHEN g.address_visible_to = 'public' THEN g.address
          WHEN g.address_visible_to = 'members' 
               AND EXISTS (SELECT 1 FROM commander_home_members m 
                            WHERE m.group_id = g.group_id AND m.user_id = p_caller_user_id 
                              AND m.status='approved') THEN g.address
          WHEN g.address_visible_to = 'rsvpd' 
               AND COALESCE(r.response, '') = 'yes' THEN g.address
          ELSE NULL 
        END AS address,
        (CASE WHEN g.address_visible_to = 'public' OR 
                   (g.address_visible_to = 'members' AND EXISTS (SELECT 1 FROM commander_home_members m WHERE m.group_id = g.group_id AND m.user_id = p_caller_user_id AND m.status='approved')) OR
                   (g.address_visible_to = 'rsvpd' AND COALESCE(r.response,'') = 'yes') THEN true ELSE false END) AS address_visible,
        -- notes_for_attendees only if yes-RSVP
        CASE WHEN COALESCE(r.response, '') = 'yes' THEN g.notes_for_attendees ELSE NULL END,
        r.response, r.checked_in_at,
        g.rsvp_yes, g.rsvp_maybe, g.max_players, g.waitlist_count,
        g.status,
        g.host_id = p_caller_user_id OR grp.owner_id = p_caller_user_id AS is_host,
        g.cover_photo_url
      FROM commander_home_games g
      JOIN commander_home_groups grp ON grp.id = g.group_id
      LEFT JOIN social_pages sp ON sp.linked_entity_type='home_group' AND sp.linked_entity_id=grp.id::text
      LEFT JOIN commander_home_rsvps r ON r.game_id = g.id AND r.user_id = p_caller_user_id
     WHERE g.scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (p_days_ahead || ' days')::interval
       AND g.status IN ('scheduled','confirmed','in_progress')
       AND (
         -- Member
         EXISTS (SELECT 1 FROM commander_home_members m 
                  WHERE m.group_id = g.group_id AND m.user_id = p_caller_user_id 
                    AND m.status='approved')
         OR grp.owner_id = p_caller_user_id
         OR g.host_id = p_caller_user_id
         -- Or public group with any RSVP
         OR (NOT grp.is_private AND r.user_id IS NOT NULL)
       )
     ORDER BY g.scheduled_date, g.start_time NULLS LAST;
END;
$function$


CREATE OR REPLACE FUNCTION public.increment_home_game_stats(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_group_id uuid;
  v_host_id uuid;
begin
  select group_id, host_id into v_group_id, v_host_id
    from commander_home_games where id = p_game_id;
  if v_group_id is null then
    return;
  end if;

  -- Attendance for confirmed yes-RSVPs
  update commander_home_members m
     set games_attended = coalesce(m.games_attended,0) + 1,
         last_attended = now()
   where m.group_id = v_group_id
     and m.user_id in (
       select r.user_id from commander_home_rsvps r
        where r.game_id = p_game_id and r.response = 'yes'
     );

  -- Host credit
  update commander_home_members m
     set games_hosted = coalesce(m.games_hosted,0) + 1
   where m.group_id = v_group_id and m.user_id = v_host_id;

  update commander_home_groups g
     set games_hosted = coalesce(g.games_hosted,0) + 1,
         last_activity_at = now()
   where g.id = v_group_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.join_home_group(p_group_id uuid, p_caller_user_id uuid, p_invite_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
    v_group       RECORD;
    v_existing    RECORD;
    v_new_status  text;
    v_new_id      uuid;
    v_failed_attempts int;
    v_code_valid  boolean;
BEGIN
    -- Hard auth failures: still raise (these bypass rate-limit paths)
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF NOT v_group.is_active THEN RAISE EXCEPTION 'GROUP_INACTIVE'; END IF;

    IF v_group.owner_id = p_caller_user_id THEN
        RAISE EXCEPTION 'ALREADY_OWNER';
    END IF;

    -- Rate-limited path for private groups
    IF v_group.is_private THEN
        IF p_invite_code IS NULL THEN
            -- Not a rate-limit-inducing failure (no code attempted)
            RAISE EXCEPTION 'INVITE_CODE_REQUIRED';
        END IF;

        -- Count recent failed attempts for this user
        SELECT COUNT(*) INTO v_failed_attempts
          FROM commander_home_join_attempts
         WHERE user_id = p_caller_user_id
           AND succeeded = false
           AND attempted_at > NOW() - INTERVAL '1 hour';

        IF v_failed_attempts >= 10 THEN
            -- Record the rejection AND return error (not raise) so the
            -- insert persists in the transaction
            INSERT INTO commander_home_join_attempts(user_id, group_id, succeeded)
            VALUES (p_caller_user_id, p_group_id, false);
            RETURN jsonb_build_object(
                'success', false,
                'error', 'RATE_LIMITED',
                'hint', 'Too many failed invite-code attempts. Try again in 1 hour.'
            );
        END IF;

        v_code_valid := (
            p_invite_code = v_group.invite_code OR p_invite_code = v_group.club_code
        );

        IF NOT v_code_valid THEN
            INSERT INTO commander_home_join_attempts(user_id, group_id, succeeded)
            VALUES (p_caller_user_id, p_group_id, false);
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INVALID_INVITE_CODE'
            );
        END IF;
    END IF;

    -- Existing membership check
    SELECT * INTO v_existing
      FROM commander_home_members
     WHERE group_id = p_group_id AND user_id = p_caller_user_id;

    IF FOUND THEN
        CASE v_existing.status
          WHEN 'approved' THEN
            -- Record successful reattempt (idempotent "join")
            INSERT INTO commander_home_join_attempts(user_id, group_id, succeeded)
            VALUES (p_caller_user_id, p_group_id, true);
            RETURN jsonb_build_object(
                'success', true, 'already_member', true,
                'status', 'approved', 'role', v_existing.role,
                'member_id', v_existing.id
            );
          WHEN 'pending' THEN
            INSERT INTO commander_home_join_attempts(user_id, group_id, succeeded)
            VALUES (p_caller_user_id, p_group_id, true);
            RETURN jsonb_build_object(
                'success', true, 'already_pending', true,
                'status', 'pending', 'member_id', v_existing.id
            );
          WHEN 'banned' THEN
            -- Record as failure (the user can't join)
            INSERT INTO commander_home_join_attempts(user_id, group_id, succeeded)
            VALUES (p_caller_user_id, p_group_id, false);
            RETURN jsonb_build_object(
                'success', false,
                'error', 'BANNED',
                'hint', 'user is banned from this group'
            );
          WHEN 'declined' THEN
            v_new_status := CASE
              WHEN v_group.is_private THEN 'pending'
              WHEN COALESCE(v_group.requires_approval, true) THEN 'pending'
              ELSE 'approved'
            END;
            UPDATE commander_home_members
               SET status = v_new_status,
                   joined_at = CASE WHEN v_new_status='approved' THEN NOW() ELSE joined_at END
             WHERE id = v_existing.id;
            INSERT INTO commander_home_join_attempts(user_id, group_id, succeeded)
            VALUES (p_caller_user_id, p_group_id, true);
            RETURN jsonb_build_object(
                'success', true, 're_requested', true,
                'status', v_new_status, 'member_id', v_existing.id
            );
        END CASE;
    END IF;

    v_new_status := CASE
      WHEN v_group.is_private THEN 'approved'
      WHEN COALESCE(v_group.requires_approval, true) THEN 'pending'
      ELSE 'approved'
    END;

    INSERT INTO commander_home_members
        (group_id, user_id, role, status, joined_at, created_at)
    VALUES
        (p_group_id, p_caller_user_id, 'member', v_new_status,
         CASE WHEN v_new_status='approved' THEN NOW() ELSE NULL END,
         NOW())
    RETURNING id INTO v_new_id;

    INSERT INTO commander_home_join_attempts(user_id, group_id, succeeded)
    VALUES (p_caller_user_id, p_group_id, true);

    RETURN jsonb_build_object(
        'success', true,
        'status', v_new_status,
        'role', 'member',
        'member_id', v_new_id,
        'requires_approval', (v_new_status = 'pending')
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.leave_home_group(p_group_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group       RECORD;
    v_member      RECORD;
    v_existed     boolean := false;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

    -- Owner cannot leave — must transfer ownership first
    IF v_group.owner_id = p_caller_user_id THEN
        RAISE EXCEPTION 'OWNER_CANNOT_LEAVE'
              USING HINT = 'transfer ownership first, then leave';
    END IF;

    -- Pass 36: banned users cannot self-leave (ban-evasion prevention)
    SELECT * INTO v_member FROM commander_home_members
      WHERE group_id = p_group_id AND user_id = p_caller_user_id;

    IF FOUND AND v_member.status = 'banned' THEN
        RAISE EXCEPTION 'BANNED_CANNOT_LEAVE'
              USING HINT = 'banned members cannot leave to erase the ban record';
    END IF;

    DELETE FROM commander_home_members
     WHERE group_id = p_group_id
       AND user_id = p_caller_user_id
    RETURNING true INTO v_existed;

    RETURN jsonb_build_object(
        'success', true,
        'group_id', p_group_id,
        'already_gone', COALESCE(NOT v_existed, true)
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.link_home_game_to_social_page()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.social_page_id IS NULL AND NEW.group_id IS NOT NULL THEN
    SELECT id INTO NEW.social_page_id FROM public.social_pages
    WHERE linked_entity_type = 'home_group' AND linked_entity_id = NEW.group_id::text
    LIMIT 1;
  END IF;
  RETURN NEW;
END; $function$


CREATE OR REPLACE FUNCTION public.list_home_group_reports_for_host(p_group_id uuid, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean;
  v_rows jsonb;
  v_total int;
  v_safe_limit int;
  v_safe_offset int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;

  v_is_staff := EXISTS (SELECT 1 FROM public.commander_home_groups
       WHERE id = p_group_id AND owner_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.commander_home_members
       WHERE group_id = p_group_id AND user_id = v_uid
         AND role IN ('admin','co_host') AND status='approved');
  IF NOT v_is_staff THEN RAISE EXCEPTION 'NOT_GROUP_STAFF' USING ERRCODE='42501'; END IF;

  v_safe_limit  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_safe_offset := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT COUNT(*) INTO v_total
    FROM public.commander_home_content_reports r
   WHERE r.reason_category NOT IN ('illegal','self_harm','doxxing')
     AND r.content_author_id <> (SELECT owner_id FROM public.commander_home_groups WHERE id = p_group_id)
     AND (p_status IS NULL OR r.status = p_status)
     AND (
       (r.reported_type IN ('post','comment')
         AND r.reported_id IN (SELECT p.id FROM public.commander_home_posts p WHERE p.group_id = p_group_id))
       OR (r.reported_type = 'game'
         AND r.reported_id IN (SELECT g.id FROM public.commander_home_games g WHERE g.group_id = p_group_id))
       OR (r.reported_type = 'review'
         AND r.reported_id IN (SELECT rv.id FROM public.commander_home_game_reviews rv
           JOIN public.commander_home_games g ON g.id = rv.game_id WHERE g.group_id = p_group_id))
       OR (r.reported_type = 'member'
         AND r.reported_id IN (SELECT m.id FROM public.commander_home_members m WHERE m.group_id = p_group_id))
     );

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                  r.id,
             'reporter_id',         r.reporter_id,
             'reporter_name',       COALESCE(p_rep.display_name, p_rep.username, 'Unknown'),
             'reported_type',       r.reported_type,
             'reported_id',         r.reported_id,
             'content_author_id',   r.content_author_id,
             'content_author_name', COALESCE(p_auth.display_name, p_auth.username, 'Unknown'),
             'author_display',      COALESCE(p_auth.display_name, p_auth.username, 'Unknown'),
             'author_name',         COALESCE(p_auth.display_name, p_auth.username, 'Unknown'),
             'reason_category',     r.reason_category,
             'reason_text',         r.reason_text,
             'content',             COALESCE(content_snippet.snippet, '(content unavailable)'),
             'text',                COALESCE(content_snippet.snippet, '(content unavailable)'),
             'status',              r.status,
             'created_at',          r.created_at,
             'reviewed_at',         r.reviewed_at,
             'action_taken',        r.action_taken
           ) ORDER BY r.created_at DESC
         ), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT * FROM public.commander_home_content_reports r
       WHERE r.reason_category NOT IN ('illegal','self_harm','doxxing')
         AND r.content_author_id <> (SELECT owner_id FROM public.commander_home_groups WHERE id = p_group_id)
         AND (p_status IS NULL OR r.status = p_status)
         AND (
           (r.reported_type IN ('post','comment')
             AND r.reported_id IN (SELECT p.id FROM public.commander_home_posts p WHERE p.group_id = p_group_id))
           OR (r.reported_type = 'game'
             AND r.reported_id IN (SELECT g.id FROM public.commander_home_games g WHERE g.group_id = p_group_id))
           OR (r.reported_type = 'review'
             AND r.reported_id IN (SELECT rv.id FROM public.commander_home_game_reviews rv
               JOIN public.commander_home_games g ON g.id = rv.game_id WHERE g.group_id = p_group_id))
           OR (r.reported_type = 'member'
             AND r.reported_id IN (SELECT m.id FROM public.commander_home_members m WHERE m.group_id = p_group_id))
         )
       ORDER BY r.created_at DESC
       LIMIT v_safe_limit OFFSET v_safe_offset
    ) r
    LEFT JOIN public.profiles p_rep  ON p_rep.id  = r.reporter_id
    LEFT JOIN public.profiles p_auth ON p_auth.id = r.content_author_id
    LEFT JOIN LATERAL (
      SELECT CASE r.reported_type
        WHEN 'post'    THEN (SELECT LEFT(content, 500) FROM public.commander_home_posts WHERE id = r.reported_id)
        WHEN 'comment' THEN (SELECT LEFT(content, 500) FROM public.commander_home_post_comments WHERE id = r.reported_id)
        WHEN 'review'  THEN (SELECT LEFT(COALESCE(review_text, ''), 500) FROM public.commander_home_game_reviews WHERE id = r.reported_id)
        WHEN 'game'    THEN (SELECT LEFT(COALESCE(title, '') || COALESCE(' — ' || description, ''), 500) FROM public.commander_home_games WHERE id = r.reported_id)
        WHEN 'member'  THEN '(member report — see profile)'
        ELSE NULL
      END AS snippet
    ) content_snippet ON TRUE;

  RETURN jsonb_build_object('success', true, 'total', v_total,
    'limit', v_safe_limit, 'offset', v_safe_offset, 'reports', v_rows);
END;
$function$


CREATE OR REPLACE FUNCTION public.manage_home_group_member(p_group_id uuid, p_member_user_id uuid, p_action text, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group          RECORD;
    v_target         RECORD;
    v_caller_role    text;
    v_valid_actions  text[] := ARRAY['approve','decline','ban','unban','promote_admin','demote_member','remove'];
    v_active_games   int;
    v_result         jsonb;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED'
              USING HINT = 'manage_home_group_member requires auth.uid() = p_caller_user_id';
    END IF;

    IF p_action IS NULL OR NOT (p_action = ANY (v_valid_actions)) THEN
        RAISE EXCEPTION 'INVALID_ACTION'
              USING HINT = 'action must be one of: approve, decline, ban, unban, promote_admin, demote_member, remove';
    END IF;

    IF p_group_id IS NULL OR p_member_user_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_PARAMS';
    END IF;

    IF p_caller_user_id = p_member_user_id THEN
        RAISE EXCEPTION 'CANNOT_SELF_MANAGE'
              USING HINT = 'use leave_home_group for self-exit';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

    IF v_group.owner_id = p_caller_user_id THEN
        v_caller_role := 'owner';
    ELSE
        SELECT role INTO v_caller_role
          FROM commander_home_members
         WHERE group_id = p_group_id
           AND user_id = p_caller_user_id
           AND status = 'approved'
           AND role IN ('admin','owner');
        IF NOT FOUND THEN
            RAISE EXCEPTION 'NOT_A_HOST';
        END IF;
    END IF;

    SELECT m.*, (v_group.owner_id = m.user_id) AS is_owner_row
      INTO v_target
      FROM commander_home_members m
     WHERE m.group_id = p_group_id AND m.user_id = p_member_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND';
    END IF;

    IF v_target.is_owner_row AND p_action IN (
        'ban','demote_member','remove','decline','promote_admin'
    ) THEN
        RAISE EXCEPTION 'CANNOT_MODIFY_OWNER'
              USING HINT = 'Use transfer_home_group_ownership to change the owner.';
    END IF;

    IF v_caller_role = 'admin' THEN
        IF v_target.role IN ('admin','owner') AND p_action IN (
            'ban','demote_member','remove','decline'
        ) THEN
            RAISE EXCEPTION 'ADMIN_CANNOT_MODIFY_PEER';
        END IF;
        IF p_action IN ('promote_admin','demote_member') THEN
            RAISE EXCEPTION 'OWNER_ONLY_ACTION'
                  USING HINT = 'promote_admin and demote_member require owner';
        END IF;
    END IF;

    -- Pass 34: for remove, check active-game-host ownership up front
    -- (cleaner error than letting the DELETE trigger raise mid-cascade)
    IF p_action = 'remove' THEN
      SELECT COUNT(*) INTO v_active_games
        FROM commander_home_games
       WHERE group_id = p_group_id
         AND host_id = p_member_user_id
         AND status IN ('scheduled','confirmed','in_progress');
      IF v_active_games > 0 THEN
        RAISE EXCEPTION 'MEMBER_IS_ACTIVE_GAME_HOST'
              USING HINT = 'member hosts ' || v_active_games
                        || ' active game(s); cancel or reassign them before removing';
      END IF;
    END IF;

    CASE p_action
      WHEN 'approve' THEN
        IF v_target.status <> 'pending' THEN
            RAISE EXCEPTION 'TARGET_NOT_PENDING' USING HINT = 'current status is ' || v_target.status;
        END IF;
        UPDATE commander_home_members
           SET status = 'approved', joined_at = COALESCE(joined_at, NOW())
         WHERE id = v_target.id;
      WHEN 'decline' THEN
        IF v_target.status <> 'pending' THEN RAISE EXCEPTION 'TARGET_NOT_PENDING'; END IF;
        UPDATE commander_home_members SET status='declined' WHERE id = v_target.id;
      WHEN 'ban' THEN
        UPDATE commander_home_members SET status='banned', role='member' WHERE id = v_target.id;
      WHEN 'unban' THEN
        IF v_target.status <> 'banned' THEN RAISE EXCEPTION 'TARGET_NOT_BANNED'; END IF;
        UPDATE commander_home_members SET status='approved' WHERE id = v_target.id;
      WHEN 'promote_admin' THEN
        IF v_target.status <> 'approved' THEN RAISE EXCEPTION 'TARGET_NOT_APPROVED'; END IF;
        IF v_target.role = 'admin' THEN RAISE EXCEPTION 'ALREADY_ADMIN'; END IF;
        UPDATE commander_home_members SET role='admin' WHERE id = v_target.id;
      WHEN 'demote_member' THEN
        IF v_target.role <> 'admin' THEN RAISE EXCEPTION 'TARGET_NOT_ADMIN'; END IF;
        UPDATE commander_home_members SET role='member' WHERE id = v_target.id;
      WHEN 'remove' THEN
        -- Pass 34: set GUC so the DELETE trigger permits this RPC path
        PERFORM set_config('app.hg_member_remove_allowed', '1', true);
        DELETE FROM commander_home_members WHERE id = v_target.id;
        PERFORM set_config('app.hg_member_remove_allowed', '', true);
        -- Audit log entry for the kick
        INSERT INTO commander_home_audit_log
            (group_id, actor_id, target_type, target_id, action, metadata)
        VALUES
            (p_group_id, p_caller_user_id, 'member', p_member_user_id,
             'member_removed',
             jsonb_build_object(
               'removed_role', v_target.role,
               'removed_status', v_target.status
             ));
    END CASE;

    SELECT jsonb_build_object(
        'success', true,
        'action', p_action,
        'member_user_id', p_member_user_id,
        'new_state', CASE WHEN p_action = 'remove' THEN
            jsonb_build_object('removed', true)
        ELSE (
            SELECT jsonb_build_object('status', status, 'role', role, 'joined_at', joined_at)
              FROM commander_home_members WHERE id = v_target.id
        ) END
    ) INTO v_result;

    RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.mark_home_game_seat_away(p_game_id uuid, p_seat_number integer, p_is_away boolean, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_game RECORD; v_group RECORD;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;

    IF v_game.host_id <> p_caller_user_id AND v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members
                        WHERE group_id = v_game.group_id AND user_id = p_caller_user_id
                          AND role = 'admin' AND status = 'approved')
    THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

    UPDATE commander_home_seats
       SET status = CASE WHEN p_is_away THEN 'away' ELSE 'seated' END,
           away_since = CASE WHEN p_is_away THEN NOW() ELSE NULL END,
           updated_at = NOW()
     WHERE game_id = p_game_id AND seat_number = p_seat_number;

    RETURN jsonb_build_object('success', true);
END;
$function$


CREATE OR REPLACE FUNCTION public.promote_home_game_waitlist(p_game_id uuid, p_caller_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_game RECORD; v_group RECORD;
    v_seats_open int; v_promoted_ids uuid[] := ARRAY[]::uuid[];
    v_rsvp RECORD; v_is_trigger_call boolean; v_is_service_role boolean;
    v_uid uuid;
BEGIN
    v_is_trigger_call := (current_setting('app.hg_waitlist_auto_promote', true) = '1');
    v_is_service_role := (auth.role() = 'service_role');

    IF v_is_trigger_call OR v_is_service_role THEN NULL;
    ELSE
        IF p_caller_user_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED' USING HINT = 'promote_home_game_waitlist requires p_caller_user_id';
        END IF;
        IF auth.uid() IS NULL OR auth.uid() <> p_caller_user_id THEN
            RAISE EXCEPTION 'UNAUTHORIZED' USING HINT = 'auth.uid() must match p_caller_user_id';
        END IF;
    END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
    IF v_game.status NOT IN ('scheduled','confirmed') THEN RAISE EXCEPTION 'GAME_NOT_OPEN'; END IF;

    IF NOT v_is_trigger_call AND NOT v_is_service_role THEN
        SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;
        IF v_game.host_id <> p_caller_user_id
           AND v_group.owner_id <> p_caller_user_id
           AND NOT EXISTS (SELECT 1 FROM commander_home_members
                            WHERE group_id = v_game.group_id AND user_id = p_caller_user_id
                              AND role = 'admin' AND status = 'approved')
        THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
    END IF;

    v_seats_open := GREATEST(0,
        COALESCE(v_game.max_players, 9) - COALESCE(v_game.rsvp_yes, 0));
    IF v_seats_open = 0 THEN
        RETURN jsonb_build_object('success', true, 'promoted_count', 0, 'seats_full', true);
    END IF;

    FOR v_rsvp IN
        SELECT id, user_id FROM commander_home_rsvps
         WHERE game_id = p_game_id AND response = 'waitlist'
         ORDER BY responded_at LIMIT v_seats_open FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE commander_home_rsvps
           SET response = 'yes', updated_at = NOW()
         WHERE id = v_rsvp.id;
        v_promoted_ids := array_append(v_promoted_ids, v_rsvp.user_id);
    END LOOP;

    IF array_length(v_promoted_ids, 1) > 0 THEN
      FOREACH v_uid IN ARRAY v_promoted_ids LOOP
        BEGIN
          PERFORM public.fn_emit_home_notification(
            p_user_id => v_uid, p_type => 'home_game_waitlist_promoted',
            p_title => 'You''re off the waitlist!',
            p_message => 'A seat opened up and you''re in for the game.',
            p_link => '/hub/home-games/' || p_game_id::text,
            p_data => jsonb_build_object('game_id', p_game_id, 'group_id', v_game.group_id),
            p_pref_column => NULL);
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'promote notify failed for user %: %', v_uid, SQLERRM;
        END;
      END LOOP;

      -- ★ NEW: audit log the promotion batch
      INSERT INTO public.commander_home_audit_log
        (group_id, actor_id, target_type, target_id, action, metadata)
      VALUES (
        v_game.group_id,
        COALESCE(p_caller_user_id,
                 CASE WHEN v_is_trigger_call THEN NULL
                      WHEN v_is_service_role THEN NULL
                      ELSE auth.uid() END),
        'game', p_game_id,
        CASE WHEN v_is_trigger_call THEN 'waitlist.auto_promoted'
             ELSE 'waitlist.promoted' END,
        jsonb_build_object(
          'promoted_count', array_length(v_promoted_ids, 1),
          'promoted_user_ids', v_promoted_ids));
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'promoted_count', COALESCE(array_length(v_promoted_ids, 1), 0),
        'promoted_user_ids', v_promoted_ids);
END;
$function$


CREATE OR REPLACE FUNCTION public.protect_home_group_owner_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_user;
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                  'supabase_auth_admin', 'supabase_storage_admin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'DIRECT_OWNER_TRANSFER_FORBIDDEN'
      USING ERRCODE = '42501',
            HINT = 'use the transfer_home_group_ownership RPC; direct UPDATE of '
                || 'owner_id bypasses member-role promotion/demotion and audit logging';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.protect_home_group_owner_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner_id uuid;
  v_row      commander_home_members%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM commander_home_groups WHERE id = v_row.group_id;

  IF v_owner_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF v_row.user_id IS DISTINCT FROM v_owner_id THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cannot remove the current owner from their home group. '
      'Transfer ownership first (transfer_home_group_ownership RPC).'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.role <> 'owner' THEN
      RAISE EXCEPTION 'Cannot change role of the current group owner. '
        'Transfer ownership first (transfer_home_group_ownership RPC).'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status <> 'approved' THEN
      RAISE EXCEPTION 'Cannot change status of the current group owner to %. '
        'The owner is always an approved member.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.record_home_game_photo(p_game_id uuid, p_caller_user_id uuid, p_photo_url text, p_caption text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_game RECORD; v_group RECORD; v_new_id uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    IF NOT public.fn_try_consume_home_rate_limit(
         p_caller_user_id, 'home_game_photo_upload', 40, 60) THEN
      RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED' USING HINT = 'photo uploads: 40 per 60 min.';
    END IF;
    IF p_photo_url IS NULL OR length(trim(p_photo_url)) = 0 THEN
        RAISE EXCEPTION 'MISSING_URL';
    END IF;
    IF p_caption IS NOT NULL AND length(p_caption) > 500 THEN
        RAISE EXCEPTION 'CAPTION_TOO_LONG' USING HINT = 'max 500 chars';
    END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;

    IF v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members
                        WHERE group_id = v_game.group_id AND user_id = p_caller_user_id
                          AND status = 'approved')
    THEN RAISE EXCEPTION 'NOT_A_MEMBER'; END IF;

    INSERT INTO commander_home_game_photos (game_id, uploader_id, photo_url, caption)
    VALUES (p_game_id, p_caller_user_id, p_photo_url, p_caption)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'photo_id', v_new_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.redeem_home_group_invite_token(p_token text, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
    v_token         RECORD;
    v_group         RECORD;
    v_existing      RECORD;
    v_was_new       boolean := false;
    v_already_state text;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_token FROM commander_home_invite_tokens
     WHERE token = p_token AND is_active = true
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
    IF v_token.expires_at IS NOT NULL AND v_token.expires_at < NOW() THEN
        RAISE EXCEPTION 'TOKEN_EXPIRED';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_token.group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF NOT v_group.is_active THEN RAISE EXCEPTION 'GROUP_INACTIVE'; END IF;

    IF v_group.owner_id = p_caller_user_id THEN
        RETURN jsonb_build_object(
            'success', true, 'via_token', v_token.id,
            'group_id', v_token.group_id, 'already_owner', true
        );
    END IF;

    SELECT * INTO v_existing
      FROM commander_home_members
     WHERE group_id = v_token.group_id AND user_id = p_caller_user_id;

    IF FOUND THEN
        IF v_existing.status = 'banned' THEN
            RAISE EXCEPTION 'BANNED' USING HINT = 'you are banned from this group';
        ELSIF v_existing.status = 'approved' THEN
            RETURN jsonb_build_object(
                'success', true, 'via_token', v_token.id,
                'group_id', v_token.group_id,
                'already_member', true, 'member_status', 'approved'
            );
        ELSIF v_existing.status IN ('pending', 'declined') THEN
            IF v_token.max_uses IS NOT NULL
               AND COALESCE(v_token.use_count, 0) >= v_token.max_uses THEN
                RAISE EXCEPTION 'TOKEN_EXHAUSTED';
            END IF;
            v_already_state := v_existing.status;
            PERFORM set_config('app.hg_token_redeem_allowed', '1', true);
            UPDATE commander_home_members
               SET status = 'approved', joined_at = NOW()
             WHERE id = v_existing.id;
            PERFORM set_config('app.hg_token_redeem_allowed', '', true);
            v_was_new := true;
        ELSE
            v_already_state := v_existing.status;
            v_was_new := false;
        END IF;
    ELSE
        IF v_token.max_uses IS NOT NULL
           AND COALESCE(v_token.use_count, 0) >= v_token.max_uses THEN
            RAISE EXCEPTION 'TOKEN_EXHAUSTED';
        END IF;
        PERFORM set_config('app.hg_token_redeem_allowed', '1', true);
        INSERT INTO commander_home_members
            (group_id, user_id, role, status, joined_at, created_at)
        VALUES
            (v_token.group_id, p_caller_user_id, 'member', 'approved', NOW(), NOW());
        PERFORM set_config('app.hg_token_redeem_allowed', '', true);
        v_was_new := true;
    END IF;

    IF v_was_new THEN
        UPDATE commander_home_invite_tokens
           SET use_count    = COALESCE(use_count, 0) + 1,
               last_used_at = NOW()
         WHERE id = v_token.id;

        -- ★ NEW: notify the token creator (if not themselves redeeming)
        IF v_token.created_by IS NOT NULL
           AND v_token.created_by <> p_caller_user_id THEN
            BEGIN
              PERFORM public.fn_emit_home_notification(
                p_user_id     => v_token.created_by,
                p_type        => 'home_invite_redeemed',
                p_title       => 'Your invite was used',
                p_message     => 'Someone joined ' ||
                                 COALESCE(v_group.name, 'your group') ||
                                 ' with your invite link.',
                p_link        => '/hub/home-games/group/' || v_group.id::text,
                p_data        => jsonb_build_object(
                                   'group_id', v_group.id,
                                   'token_id', v_token.id,
                                   'token_label', v_token.label,
                                   'redeemed_by', p_caller_user_id),
                p_pref_column => NULL
              );
            EXCEPTION WHEN OTHERS THEN
              RAISE WARNING 'redeem notify failed: %', SQLERRM;
            END;
        END IF;
    END IF;

    INSERT INTO commander_home_audit_log
        (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES
        (v_token.group_id, p_caller_user_id, 'member', p_caller_user_id,
         'joined_via_token',
         jsonb_build_object('token_id', v_token.id, 'was_new', v_was_new,
                            'prior_status', v_already_state));

    RETURN jsonb_build_object(
        'success', true, 'via_token', v_token.id,
        'group_id', v_token.group_id, 'member_status', 'approved',
        'was_new', v_was_new, 'prior_status', v_already_state
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.release_own_home_game_seat(p_game_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_existing RECORD;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    SELECT * INTO v_existing FROM commander_home_seats 
     WHERE game_id = p_game_id AND user_id = p_caller_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_SEATED'; END IF;

    UPDATE commander_home_seats 
       SET user_id = NULL, player_name = NULL, status = 'empty', 
           seated_at = NULL, away_since = NULL, note = NULL, updated_at = NOW()
     WHERE id = v_existing.id;

    RETURN jsonb_build_object('success', true, 'seat_number', v_existing.seat_number);
END;
$function$


CREATE OR REPLACE FUNCTION public.request_home_group_promotion(p_group_id uuid, p_caller_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_group RECORD; v_new_id uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
      RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    IF p_reason IS NOT NULL AND length(p_reason) > 2000 THEN
      RAISE EXCEPTION 'REASON_TOO_LONG' USING HINT = 'max 2000 chars'; END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF v_group.owner_id <> p_caller_user_id THEN RAISE EXCEPTION 'OWNER_ONLY_ACTION'; END IF;
    IF v_group.promoted_to_club_id IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_PROMOTED'; END IF;

    IF COALESCE(v_group.games_hosted, 0) < 3 THEN
        RAISE EXCEPTION 'NEED_MIN_GAMES' USING HINT='requires at least 3 completed games';
    END IF;
    IF COALESCE(v_group.member_count, 0) < 5 THEN
        RAISE EXCEPTION 'NEED_MIN_MEMBERS' USING HINT='requires at least 5 members';
    END IF;

    INSERT INTO commander_home_group_promotion_requests (group_id, requested_by, reason)
    VALUES (p_group_id, p_caller_user_id, p_reason)
    ON CONFLICT (group_id) DO UPDATE
        SET status = 'pending', reason = EXCLUDED.reason,
            requested_at = NOW(), reviewer_id = NULL, reviewer_note = NULL
    RETURNING id INTO v_new_id;

    UPDATE commander_home_groups SET promotion_requested_at = NOW() WHERE id = p_group_id;

    INSERT INTO commander_home_audit_log (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (p_group_id, p_caller_user_id, 'group', p_group_id, 'promotion_requested',
            jsonb_build_object('reason', p_reason));

    RETURN jsonb_build_object('success', true, 'request_id', v_new_id, 'status', 'pending');
END;
$function$


CREATE OR REPLACE FUNCTION public.revive_home_group(p_group_id uuid, p_caller_user_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g_owner_id uuid; g_is_active boolean; new_ts timestamptz;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_caller_user_id) THEN
        RAISE EXCEPTION 'revive_home_group: caller identity mismatch' USING ERRCODE = '42501';
    END IF;
    IF p_group_id IS NULL OR p_caller_user_id IS NULL THEN
        RAISE EXCEPTION 'revive_home_group: both p_group_id and p_caller_user_id are required'
          USING ERRCODE = '22004';
    END IF;
    SELECT owner_id, is_active INTO g_owner_id, g_is_active
      FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'revive_home_group: home group % not found', p_group_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT g_is_active THEN
        RAISE EXCEPTION 'revive_home_group: group is deactivated and cannot be revived by host' USING ERRCODE = '22023';
    END IF;
    IF p_caller_user_id <> g_owner_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members m
                        WHERE m.group_id = p_group_id AND m.user_id = p_caller_user_id
                          AND m.status = 'approved' AND m.role = 'admin') THEN
        RAISE EXCEPTION 'revive_home_group: caller is not authorized for this group' USING ERRCODE = '42501';
    END IF;
    UPDATE commander_home_groups
       SET last_activity_at = NOW(), updated_at = NOW()
     WHERE id = p_group_id
     RETURNING last_activity_at INTO new_ts;

    -- ★ NEW: audit log
    INSERT INTO public.commander_home_audit_log
      (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (p_group_id, p_caller_user_id, 'group', p_group_id, 'revived',
            jsonb_build_object('new_last_activity_at', new_ts));

    RETURN new_ts;
END;
$function$


CREATE OR REPLACE FUNCTION public.rpc_hg_change_seat(p_reservation_id uuid, p_new_seat_number integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id  uuid := auth.uid();
  v_preview  RECORD;
  v_updated  RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT r.id, r.seat_number, r.status, r.user_id, r.claimed_by_user_id,
         r.table_id, r.is_guest, r.member_id,
         t.max_seats, t.game_id
    INTO v_preview
    FROM public.commander_home_seat_reservations r
    JOIN public.commander_home_game_tables t ON t.id = r.table_id
   WHERE r.id = p_reservation_id;
  IF v_preview.id IS NULL THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;

  IF v_preview.user_id IS DISTINCT FROM v_user_id
     AND v_preview.claimed_by_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'NOT_YOUR_RESERVATION';
  END IF;

  IF v_preview.status NOT IN ('reserved','seated') THEN
    RAISE EXCEPTION 'RESERVATION_INACTIVE';
  END IF;

  IF p_new_seat_number < 1 OR p_new_seat_number > v_preview.max_seats THEN
    RAISE EXCEPTION 'SEAT_OUT_OF_BOUNDS';
  END IF;

  IF p_new_seat_number = v_preview.seat_number THEN
    RETURN p_reservation_id;
  END IF;

  UPDATE public.commander_home_seat_reservations
     SET seat_number = p_new_seat_number,
         updated_at  = now()
   WHERE id = p_reservation_id
     AND status IN ('reserved','seated')
     AND (user_id = v_user_id OR claimed_by_user_id = v_user_id)
  RETURNING id, table_id, seat_number, user_id, is_guest, status
       INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_INACTIVE'
      USING HINT = 'reservation was just released or reassigned';
  END IF;

  -- BUG-1 fix: if reservation was 'seated' (table running), sync the
  -- live seat map too. commander_home_seats has its own (table_id,
  -- seat_number) unique-index so this will error cleanly if the target
  -- seat is already occupied there — which in practice cannot happen
  -- because the reservations unique-index already blocked it.
  IF v_updated.status = 'seated' THEN
    UPDATE public.commander_home_seats
       SET seat_number = p_new_seat_number
     WHERE reservation_id = p_reservation_id;
  END IF;

  -- Shadow-write to rsvps: only if it was pointing at the OLD seat.
  IF v_updated.is_guest = false AND v_updated.user_id IS NOT NULL THEN
    UPDATE public.commander_home_rsvps
       SET seat_number = v_updated.seat_number,
           updated_at  = now()
     WHERE game_id    = v_preview.game_id
       AND user_id    = v_updated.user_id
       AND seat_number IS NOT DISTINCT FROM v_preview.seat_number;
  END IF;

  RETURN p_reservation_id;
END $function$


CREATE OR REPLACE FUNCTION public.rpc_hg_claim_seat(p_table_id uuid, p_seat_number integer, p_is_guest boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id        uuid := auth.uid();
  v_table          RECORD;
  v_group_id       uuid;
  v_reservation_id uuid;
  v_caller_name    text;
  v_guest_name     text;
  v_existing_rsvp  text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  -- Pull the parent game's status and capacity alongside the table.
  SELECT t.id, t.game_id, t.status, t.max_seats,
         g.group_id, g.status AS game_status
    INTO v_table
    FROM public.commander_home_game_tables t
    JOIN public.commander_home_games g ON g.id = t.game_id
   WHERE t.id = p_table_id;

  IF v_table.id IS NULL THEN RAISE EXCEPTION 'TABLE_NOT_FOUND'; END IF;

  -- FIX 1: the parent game must still be live. Table status alone is not
  -- sufficient - the two are independent enums with no cascade.
  IF v_table.game_status IS NOT NULL
     AND v_table.game_status IN ('cancelled','completed') THEN
    RAISE EXCEPTION 'GAME_NOT_ACTIVE' USING HINT = v_table.game_status;
  END IF;

  IF v_table.status <> 'open_for_rsvp' THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN' USING HINT = v_table.status;
  END IF;
  IF p_seat_number < 1 OR p_seat_number > v_table.max_seats THEN
    RAISE EXCEPTION 'SEAT_OUT_OF_BOUNDS';
  END IF;

  v_group_id := v_table.group_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.commander_home_members
     WHERE group_id = v_group_id AND user_id = v_user_id AND status = 'approved'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.commander_home_groups
     WHERE id = v_group_id AND owner_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  -- FIX 2: never let a seat claim overwrite a host-set waitlist/decline.
  SELECT response INTO v_existing_rsvp
    FROM public.commander_home_rsvps
   WHERE game_id = v_table.game_id AND user_id = v_user_id;

  IF v_existing_rsvp IN ('waitlist','no') THEN
    RAISE EXCEPTION 'WAITLISTED_CANNOT_SELF_SEAT' USING HINT = v_existing_rsvp;
  END IF;

  IF p_is_guest THEN
    -- BUG-2 fix: truncate caller display name so "{name} + Guest" never
    -- exceeds the 120-char guest_name CHECK constraint. 112 = 120 - 8
    -- (length of " + Guest").
    v_caller_name := LEFT(public.fn_hg_caller_display_name(v_user_id), 112);
    v_guest_name := v_caller_name || ' + Guest';
    BEGIN
      INSERT INTO public.commander_home_seat_reservations
        (table_id, seat_number, user_id, guest_name, is_guest, claimed_by_user_id, status)
      VALUES (p_table_id, p_seat_number, NULL, v_guest_name, true, v_user_id, 'reserved')
      RETURNING id INTO v_reservation_id;
    EXCEPTION WHEN unique_violation THEN
      -- FIX 3: map the storage-layer guards to domain errors.
      IF SQLERRM LIKE '%one_guest_per_user_per_table%' THEN
        RAISE EXCEPTION 'GUEST_ALREADY_CLAIMED';
      ELSE
        RAISE EXCEPTION 'SEAT_TAKEN';
      END IF;
    END;
  ELSE
    BEGIN
      INSERT INTO public.commander_home_seat_reservations
        (table_id, seat_number, user_id, is_guest, claimed_by_user_id, status)
      VALUES (p_table_id, p_seat_number, v_user_id, false, v_user_id, 'reserved')
      RETURNING id INTO v_reservation_id;
    EXCEPTION WHEN unique_violation THEN
      IF SQLERRM LIKE '%user_table_active%' THEN
        RAISE EXCEPTION 'ALREADY_AT_TABLE';
      ELSE
        RAISE EXCEPTION 'SEAT_TAKEN';
      END IF;
    END;

    INSERT INTO public.commander_home_rsvps
      (game_id, user_id, response, seat_number, is_confirmed, responded_at)
    VALUES (v_table.game_id, v_user_id, 'yes', p_seat_number, false, now())
    ON CONFLICT (game_id, user_id) DO UPDATE
      SET response = 'yes',
          seat_number = EXCLUDED.seat_number,
          responded_at = now(),
          updated_at = now()
      -- Belt-and-braces on FIX 2: even under a concurrent host update, never
      -- flip a waitlist/decline to 'yes' via this path.
      WHERE public.commander_home_rsvps.response NOT IN ('waitlist','no');
  END IF;

  RETURN v_reservation_id;
END $function$


CREATE OR REPLACE FUNCTION public.rpc_hg_create_table(p_game_id uuid, p_game_type text, p_stakes text, p_format text DEFAULT 'cash'::text, p_buyin_min integer DEFAULT NULL::integer, p_buyin_max integer DEFAULT NULL::integer, p_max_seats integer DEFAULT 9, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_game    RECORD;
  v_next    int;
  v_id      uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT id, group_id, host_id, cancelled_at, scheduled_date, start_time, status
    INTO v_game
    FROM public.commander_home_games
   WHERE id = p_game_id;
  IF v_game.id IS NULL THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
  IF v_game.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'GAME_CANCELLED'; END IF;

  IF NOT public.fn_home_is_group_staff(v_user_id, v_game.group_id)
     AND v_game.host_id <> v_user_id
     AND NOT EXISTS (SELECT 1 FROM public.commander_home_groups
                      WHERE id = v_game.group_id AND owner_id = v_user_id)
  THEN
    RAISE EXCEPTION 'NOT_GROUP_STAFF';
  END IF;

  IF p_max_seats IS NULL OR p_max_seats < 2 OR p_max_seats > 10 THEN
    RAISE EXCEPTION 'MAX_SEATS_OUT_OF_BOUNDS';
  END IF;

  SELECT COALESCE(MAX(table_number), 0) + 1 INTO v_next
    FROM public.commander_home_game_tables WHERE game_id = p_game_id;

  INSERT INTO public.commander_home_game_tables
    (game_id, table_number, name, game_type, stakes, format,
     buyin_min, buyin_max, max_seats, status, is_default, created_by)
  VALUES
    (p_game_id, v_next, NULLIF(trim(p_name),''),
     COALESCE(NULLIF(trim(p_game_type),''),'NLH'),
     NULLIF(trim(p_stakes),''),
     CASE WHEN p_format IN ('cash','tournament','sitngo','mixed') THEN p_format ELSE 'cash' END,
     p_buyin_min, p_buyin_max, p_max_seats,
     'open_for_rsvp', false, v_user_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.rpc_hg_create_tournament(p_group_id uuid, p_name text, p_buy_in integer, p_starting_stack integer, p_structure text, p_scheduled_date date, p_scheduled_time time without time zone, p_entries_cap integer DEFAULT NULL::integer, p_description text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_address_visible_to text DEFAULT 'rsvp'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_clean_name text;
  v_game_id    uuid;
  v_is_active  boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  v_clean_name := NULLIF(trim(p_name), '');
  IF v_clean_name IS NULL                   THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  IF char_length(v_clean_name) > 120        THEN RAISE EXCEPTION 'NAME_TOO_LONG'; END IF;

  IF p_buy_in IS NULL OR p_buy_in < 0       THEN RAISE EXCEPTION 'INVALID_BUY_IN'; END IF;
  IF p_buy_in > 1000000                     THEN RAISE EXCEPTION 'BUY_IN_TOO_LARGE'; END IF;

  IF p_starting_stack IS NOT NULL
     AND (p_starting_stack < 0 OR p_starting_stack > 100000000) THEN
    RAISE EXCEPTION 'INVALID_STARTING_STACK';
  END IF;

  IF p_structure IS NOT NULL
     AND p_structure NOT IN ('turbo','standard','deep','bounty','rebuy') THEN
    RAISE EXCEPTION 'INVALID_STRUCTURE';
  END IF;

  IF p_scheduled_date IS NULL OR p_scheduled_time IS NULL THEN
    RAISE EXCEPTION 'SCHEDULE_REQUIRED';
  END IF;
  IF p_scheduled_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE';
  END IF;

  IF p_entries_cap IS NOT NULL AND (p_entries_cap < 2 OR p_entries_cap > 10000) THEN
    RAISE EXCEPTION 'INVALID_ENTRIES_CAP';
  END IF;

  IF p_address_visible_to NOT IN ('public','rsvp','members') THEN
    RAISE EXCEPTION 'INVALID_ADDRESS_VISIBILITY';
  END IF;

  SELECT is_active INTO v_is_active
    FROM commander_home_groups WHERE id = p_group_id;
  IF NOT FOUND      THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
  IF NOT v_is_active THEN RAISE EXCEPTION 'GROUP_NOT_ACTIVE'; END IF;

  IF NOT public.fn_home_is_group_staff(v_caller, p_group_id) THEN
    RAISE EXCEPTION 'NOT_GROUP_STAFF';
  END IF;

  INSERT INTO commander_home_games (
    group_id, host_id, title, description,
    format, game_type,
    buyin_min, buyin_max, starting_stack, structure,
    scheduled_date, start_time,
    max_players, status,
    address, address_visible_to
  ) VALUES (
    p_group_id, v_caller, v_clean_name, NULLIF(trim(p_description), ''),
    'tournament', 'nlhe',
    p_buy_in, p_buy_in, p_starting_stack, p_structure,
    p_scheduled_date, p_scheduled_time,
    p_entries_cap, 'scheduled',
    NULLIF(trim(p_address), ''), p_address_visible_to
  ) RETURNING id INTO v_game_id;

  INSERT INTO commander_home_audit_log
    (group_id, actor_id, target_type, target_id, action, metadata)
  VALUES (
    p_group_id, v_caller, 'tournament', v_game_id, 'created',
    jsonb_build_object(
      'name', v_clean_name, 'buy_in', p_buy_in,
      'starting_stack', p_starting_stack, 'structure', p_structure,
      'date', p_scheduled_date, 'time', p_scheduled_time,
      'entries_cap', p_entries_cap
    )
  );

  RETURN v_game_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.rpc_hg_host_add_roster_member(p_group_id uuid, p_display_name text, p_phone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_clean_name text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  v_clean_name := NULLIF(trim(p_display_name), '');
  IF v_clean_name IS NULL OR char_length(v_clean_name) > 120 THEN
    RAISE EXCEPTION 'DISPLAY_NAME_INVALID';
  END IF;

  IF NOT public.fn_home_is_group_staff(v_user_id, p_group_id)
     AND NOT EXISTS (SELECT 1 FROM public.commander_home_groups
                      WHERE id = p_group_id AND owner_id = v_user_id)
  THEN
    RAISE EXCEPTION 'NOT_GROUP_STAFF';
  END IF;

  -- De-dupe by name within the group's roster (idempotent add)
  SELECT id INTO v_member_id
    FROM public.commander_home_members
   WHERE group_id = p_group_id
     AND is_roster_only = true
     AND lower(display_name) = lower(v_clean_name)
   LIMIT 1;

  IF v_member_id IS NOT NULL THEN
    -- Update phone if newly provided
    IF p_phone IS NOT NULL THEN
      UPDATE public.commander_home_members SET phone = p_phone WHERE id = v_member_id;
    END IF;
    RETURN v_member_id;
  END IF;

  INSERT INTO public.commander_home_members
    (group_id, user_id, display_name, phone, role, status,
     is_roster_only, added_by_user_id, joined_at)
  VALUES
    (p_group_id, NULL, v_clean_name, p_phone, 'member', 'approved',
     true, v_user_id, now())
  RETURNING id INTO v_member_id;

  RETURN v_member_id;
END $function$


CREATE OR REPLACE FUNCTION public.rpc_hg_host_claim_for_member(p_table_id uuid, p_seat_number integer, p_member_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_table   RECORD;
  v_member  RECORD;
  v_reservation_id uuid;
  v_name_for_guest text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT t.id, t.game_id, t.status, t.max_seats, g.group_id
    INTO v_table
    FROM public.commander_home_game_tables t
    JOIN public.commander_home_games g ON g.id = t.game_id
   WHERE t.id = p_table_id;
  IF v_table.id IS NULL THEN RAISE EXCEPTION 'TABLE_NOT_FOUND'; END IF;
  IF v_table.status NOT IN ('open_for_rsvp','running') THEN
    RAISE EXCEPTION 'TABLE_NOT_CLAIMABLE';
  END IF;
  IF p_seat_number < 1 OR p_seat_number > v_table.max_seats THEN
    RAISE EXCEPTION 'SEAT_OUT_OF_BOUNDS';
  END IF;

  IF NOT public.fn_home_is_group_staff(v_user_id, v_table.group_id)
     AND NOT EXISTS (SELECT 1 FROM public.commander_home_groups
                      WHERE id = v_table.group_id AND owner_id = v_user_id)
  THEN
    RAISE EXCEPTION 'NOT_GROUP_STAFF';
  END IF;

  SELECT id, group_id, user_id, display_name, is_roster_only
    INTO v_member
    FROM public.commander_home_members
   WHERE id = p_member_id;
  IF v_member.id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF v_member.group_id <> v_table.group_id THEN
    RAISE EXCEPTION 'MEMBER_WRONG_GROUP';
  END IF;

  IF v_member.is_roster_only THEN
    -- Roster-only: store display_name as guest_name, no user_id
    v_name_for_guest := v_member.display_name;
    INSERT INTO public.commander_home_seat_reservations
      (table_id, seat_number, user_id, member_id, guest_name,
       is_guest, claimed_by_user_id, status)
    VALUES (p_table_id, p_seat_number, NULL, p_member_id, v_name_for_guest,
            false, v_user_id, 'reserved')
    RETURNING id INTO v_reservation_id;
  ELSE
    INSERT INTO public.commander_home_seat_reservations
      (table_id, seat_number, user_id, member_id,
       is_guest, claimed_by_user_id, status)
    VALUES (p_table_id, p_seat_number, v_member.user_id, p_member_id,
            false, v_user_id, 'reserved')
    RETURNING id INTO v_reservation_id;

    INSERT INTO public.commander_home_rsvps
      (game_id, user_id, response, seat_number, is_confirmed, responded_at)
    VALUES (v_table.game_id, v_member.user_id, 'yes', p_seat_number, true, now())
    ON CONFLICT (game_id, user_id) DO UPDATE
      SET response = 'yes', seat_number = EXCLUDED.seat_number,
          is_confirmed = true, responded_at = now(), updated_at = now();
  END IF;

  RETURN v_reservation_id;
END $function$


CREATE OR REPLACE FUNCTION public.rpc_hg_list_public_tournaments(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- Group must exist and be active
  IF NOT EXISTS (
    SELECT 1 FROM commander_home_groups
    WHERE id = p_group_id AND is_active = true
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(sub.j ORDER BY sub.scheduled_date, sub.start_time), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'id', g.id,
        'name', g.title,
        'description', g.description,
        'buy_in', g.buyin_min,
        'starting_stack', g.starting_stack,
        'structure', g.structure,
        'scheduled_date', g.scheduled_date,
        'start_time', g.start_time,
        'entries_cap', g.max_players,
        'rsvp_yes', g.rsvp_yes,
        'address', CASE WHEN g.address_visible_to = 'public' THEN g.address ELSE NULL END,
        'neighborhood', g.neighborhood,
        'scheduled_at_iso',
          (g.scheduled_date::text || 'T' || to_char(g.start_time, 'HH24:MI:SS') || 'Z')
      ) AS j,
      g.scheduled_date,
      g.start_time
    FROM commander_home_games g
    WHERE g.group_id = p_group_id
      AND g.format = 'tournament'
      AND g.status = 'scheduled'
      AND g.scheduled_date >= CURRENT_DATE
  ) sub;

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.rpc_hg_list_roster(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  IF NOT public.fn_home_is_group_staff(v_user_id, p_group_id)
     AND NOT EXISTS (SELECT 1 FROM public.commander_home_groups
                      WHERE id = p_group_id AND owner_id = v_user_id)
  THEN
    RAISE EXCEPTION 'NOT_GROUP_STAFF';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'user_id', m.user_id,
      'is_roster_only', m.is_roster_only,
      'display_name', COALESCE(
        m.display_name,
        public.fn_hg_caller_display_name(m.user_id),
        'Member'
      ),
      'phone', m.phone,
      'games_attended', m.games_attended,
      'last_attended', m.last_attended
    ) ORDER BY
      -- roster-only first? no — users first (most commonly seated), then roster by name
      CASE WHEN m.is_roster_only THEN 1 ELSE 0 END,
      COALESCE(m.display_name, public.fn_hg_caller_display_name(m.user_id), 'Member')
  ), '[]'::jsonb) INTO v_result
  FROM public.commander_home_members m
  WHERE m.group_id = p_group_id AND m.status = 'approved';

  RETURN v_result;
END $function$


CREATE OR REPLACE FUNCTION public.rpc_hg_list_tables_and_reservations(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id uuid;
  v_is_member boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT group_id INTO v_group_id FROM public.commander_home_games WHERE id = p_game_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.commander_home_members
     WHERE group_id = v_group_id AND user_id = auth.uid() AND status = 'approved'
  ) OR EXISTS (
    SELECT 1 FROM public.commander_home_groups
     WHERE id = v_group_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.commander_home_group_follows
     WHERE group_id = v_group_id AND user_id = auth.uid()
  ) INTO v_is_member;

  IF NOT v_is_member THEN RAISE EXCEPTION 'NOT_A_MEMBER'; END IF;

  SELECT jsonb_build_object(
    'game_id', p_game_id,
    'tables', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'table_number', t.table_number,
        'name', t.name,
        'game_type', t.game_type,
        'stakes', t.stakes,
        'format', t.format,
        'buyin_min', t.buyin_min,
        'buyin_max', t.buyin_max,
        'max_seats', t.max_seats,
        'status', t.status,
        'is_default', t.is_default,
        'started_at', t.started_at,
        'ended_at', t.ended_at,
        'reservations', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id', r.id,
              'seat_number', r.seat_number,
              'user_id', r.user_id,
              'member_id', r.member_id,
              'is_guest', r.is_guest,
              'guest_name', r.guest_name,
              'status', r.status,
              'claimed_by_user_id', r.claimed_by_user_id,
              'claimed_at', r.claimed_at,
              'display_name', COALESCE(
                r.guest_name,
                public.fn_hg_caller_display_name(r.user_id),
                'Player'
              ),
              'is_self', (r.user_id = auth.uid() OR r.claimed_by_user_id = auth.uid())
            ) ORDER BY r.seat_number
          ), '[]'::jsonb)
          FROM public.commander_home_seat_reservations r
          WHERE r.table_id = t.id AND r.status IN ('reserved','seated')
        )
      ) ORDER BY t.table_number
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.commander_home_game_tables t
  WHERE t.game_id = p_game_id;

  RETURN v_result;
END $function$


CREATE OR REPLACE FUNCTION public.rpc_hg_list_tournaments(p_group_id uuid, p_include_past boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.fn_home_is_group_staff(v_caller, p_group_id) THEN
    RAISE EXCEPTION 'NOT_GROUP_STAFF';
  END IF;

  SELECT COALESCE(jsonb_agg(sub.j ORDER BY sub.scheduled_date, sub.start_time), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'id', g.id,
        'group_id', g.group_id,
        'name', g.title,
        'description', g.description,
        'buy_in', g.buyin_min,
        'starting_stack', g.starting_stack,
        'structure', g.structure,
        'scheduled_date', g.scheduled_date,
        'start_time', g.start_time,
        'entries_cap', g.max_players,
        'status', g.status,
        'rsvp_yes', g.rsvp_yes,
        'rsvp_maybe', g.rsvp_maybe,
        'created_at', g.created_at,
        'cancelled_at', g.cancelled_at,
        'cancellation_reason', g.cancellation_reason,
        'scheduled_at_iso',
          (g.scheduled_date::text || 'T' || to_char(g.start_time, 'HH24:MI:SS') || 'Z')
      ) AS j,
      g.scheduled_date,
      g.start_time
    FROM commander_home_games g
    WHERE g.group_id = p_group_id
      AND g.format = 'tournament'
      AND (p_include_past OR g.scheduled_date >= CURRENT_DATE)
  ) sub;

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.rpc_hg_release_seat(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id       uuid := auth.uid();
  v_res           RECORD;
  v_fallback_seat integer;
  v_updated_count int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT r.*, t.game_id, t.status AS table_status
    INTO v_res
    FROM public.commander_home_seat_reservations r
    JOIN public.commander_home_game_tables t ON t.id = r.table_id
   WHERE r.id = p_reservation_id;
  IF v_res.id IS NULL THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;

  IF v_res.user_id IS DISTINCT FROM v_user_id
     AND v_res.claimed_by_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'NOT_YOUR_RESERVATION';
  END IF;

  IF v_res.status NOT IN ('reserved','seated') THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_INACTIVE' USING HINT = v_res.status;
  END IF;

  -- BUG-4 fix: status-guarded UPDATE (TOCTOU-safe).
  UPDATE public.commander_home_seat_reservations
     SET status = 'released', released_at = now()
   WHERE id = p_reservation_id
     AND status IN ('reserved','seated');
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_INACTIVE'
      USING HINT = 'reservation was just released by another path';
  END IF;

  -- BUG-1 fix: if table is running (reservation was 'seated'), the
  -- live seat must also be cleared or the Commander tablet view shows
  -- the released player still at the table.
  IF v_res.status = 'seated' THEN
    DELETE FROM public.commander_home_seats
     WHERE reservation_id = p_reservation_id;
  END IF;

  -- Shadow-write only for real-user (non-guest) seats.
  IF v_res.is_guest = false AND v_res.user_id IS NOT NULL THEN
    SELECT r2.seat_number
      INTO v_fallback_seat
      FROM public.commander_home_seat_reservations r2
      JOIN public.commander_home_game_tables t2 ON t2.id = r2.table_id
     WHERE t2.game_id = v_res.game_id
       AND r2.user_id = v_res.user_id
       AND r2.status IN ('reserved','seated')
       AND r2.id <> p_reservation_id
     ORDER BY r2.created_at ASC
     LIMIT 1;

    IF v_fallback_seat IS NOT NULL THEN
      UPDATE public.commander_home_rsvps
         SET seat_number = v_fallback_seat,
             updated_at  = now()
       WHERE game_id = v_res.game_id
         AND user_id = v_res.user_id;
    ELSE
      UPDATE public.commander_home_rsvps
         SET response     = 'no',
             seat_number  = NULL,
             updated_at   = now()
       WHERE game_id = v_res.game_id
         AND user_id = v_res.user_id;
    END IF;
  END IF;
END $function$


CREATE OR REPLACE FUNCTION public.rpc_hg_start_table(p_table_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_table   RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  -- BUG-3: lock the table row so concurrent starts serialize.
  SELECT t.id, t.status, t.game_id, g.group_id, g.host_id
    INTO v_table
    FROM public.commander_home_game_tables t
    JOIN public.commander_home_games g ON g.id = t.game_id
   WHERE t.id = p_table_id
   FOR UPDATE OF t;
  IF v_table.id IS NULL THEN RAISE EXCEPTION 'TABLE_NOT_FOUND'; END IF;

  IF NOT public.fn_home_is_group_staff(v_user_id, v_table.group_id)
     AND v_table.host_id <> v_user_id
     AND NOT EXISTS (SELECT 1 FROM public.commander_home_groups
                      WHERE id = v_table.group_id AND owner_id = v_user_id)
  THEN
    RAISE EXCEPTION 'NOT_GROUP_STAFF';
  END IF;

  IF v_table.status <> 'open_for_rsvp' THEN
    RAISE EXCEPTION 'TABLE_NOT_IN_OPEN_STATE' USING HINT = v_table.status;
  END IF;

  -- BUG-3: status-guarded UPDATE. Belt-and-suspenders with FOR UPDATE.
  UPDATE public.commander_home_game_tables
     SET status = 'running', started_at = now()
   WHERE id = p_table_id
     AND status = 'open_for_rsvp';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_STATE_CHANGED'
      USING HINT = 'another caller transitioned the table first';
  END IF;

  INSERT INTO public.commander_home_seats
    (game_id, table_id, seat_number, user_id, player_name,
     status, seated_at, reservation_id)
  SELECT
    v_table.game_id,
    r.table_id,
    r.seat_number,
    r.user_id,
    COALESCE(
      LEFT(r.guest_name, 120),
      LEFT(public.fn_hg_caller_display_name(r.user_id), 120),
      'Player'
    ),
    'seated',
    now(),
    r.id
  FROM public.commander_home_seat_reservations r
  WHERE r.table_id = p_table_id AND r.status = 'reserved';

  UPDATE public.commander_home_seat_reservations
     SET status = 'seated', seated_at = now()
   WHERE table_id = p_table_id AND status = 'reserved';
END $function$


CREATE OR REPLACE FUNCTION public.rpc_hg_update_tournament(p_tournament_id uuid, p_name text DEFAULT NULL::text, p_buy_in integer DEFAULT NULL::integer, p_starting_stack integer DEFAULT NULL::integer, p_structure text DEFAULT NULL::text, p_scheduled_date date DEFAULT NULL::date, p_scheduled_time time without time zone DEFAULT NULL::time without time zone, p_entries_cap integer DEFAULT NULL::integer, p_description text DEFAULT NULL::text, p_clear_entries_cap boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller   uuid := auth.uid();
  v_game     RECORD;
  v_changes  jsonb := '{}'::jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_game FROM commander_home_games WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;
  IF v_game.format <> 'tournament' THEN RAISE EXCEPTION 'NOT_A_TOURNAMENT'; END IF;
  IF v_game.status IN ('completed','cancelled','in_progress') THEN
    RAISE EXCEPTION 'TOURNAMENT_FINAL' USING HINT = 'cannot edit a tournament with status ' || v_game.status;
  END IF;

  IF NOT public.fn_home_is_group_staff(v_caller, v_game.group_id) THEN
    RAISE EXCEPTION 'NOT_GROUP_STAFF';
  END IF;

  -- Field-by-field validation + apply
  IF p_name IS NOT NULL THEN
    p_name := trim(p_name);
    IF char_length(p_name) = 0 OR char_length(p_name) > 120 THEN
      RAISE EXCEPTION 'INVALID_NAME';
    END IF;
    v_changes := v_changes || jsonb_build_object('name', p_name);
  END IF;

  IF p_buy_in IS NOT NULL THEN
    IF p_buy_in < 0 OR p_buy_in > 1000000 THEN RAISE EXCEPTION 'INVALID_BUY_IN'; END IF;
    v_changes := v_changes || jsonb_build_object('buy_in', p_buy_in);
  END IF;

  IF p_starting_stack IS NOT NULL THEN
    IF p_starting_stack < 0 OR p_starting_stack > 100000000 THEN
      RAISE EXCEPTION 'INVALID_STARTING_STACK';
    END IF;
    v_changes := v_changes || jsonb_build_object('starting_stack', p_starting_stack);
  END IF;

  IF p_structure IS NOT NULL THEN
    IF p_structure NOT IN ('turbo','standard','deep','bounty','rebuy') THEN
      RAISE EXCEPTION 'INVALID_STRUCTURE';
    END IF;
    v_changes := v_changes || jsonb_build_object('structure', p_structure);
  END IF;

  IF p_scheduled_date IS NOT NULL THEN
    IF p_scheduled_date < CURRENT_DATE THEN RAISE EXCEPTION 'PAST_DATE'; END IF;
    v_changes := v_changes || jsonb_build_object('scheduled_date', p_scheduled_date);
  END IF;

  IF p_scheduled_time IS NOT NULL THEN
    v_changes := v_changes || jsonb_build_object('scheduled_time', p_scheduled_time);
  END IF;

  IF p_entries_cap IS NOT NULL THEN
    IF p_entries_cap < 2 OR p_entries_cap > 10000 THEN RAISE EXCEPTION 'INVALID_ENTRIES_CAP'; END IF;
    v_changes := v_changes || jsonb_build_object('entries_cap', p_entries_cap);
  END IF;

  UPDATE commander_home_games SET
    title              = COALESCE(p_name,                title),
    description        = CASE WHEN p_description IS NOT NULL THEN NULLIF(trim(p_description),'') ELSE description END,
    buyin_min          = COALESCE(p_buy_in,              buyin_min),
    buyin_max          = COALESCE(p_buy_in,              buyin_max),
    starting_stack     = COALESCE(p_starting_stack,      starting_stack),
    structure          = COALESCE(p_structure,           structure),
    scheduled_date     = COALESCE(p_scheduled_date,      scheduled_date),
    start_time         = COALESCE(p_scheduled_time,      start_time),
    max_players        = CASE
      WHEN p_clear_entries_cap THEN NULL
      WHEN p_entries_cap IS NOT NULL THEN p_entries_cap
      ELSE max_players
    END,
    updated_at         = NOW()
   WHERE id = p_tournament_id;

  INSERT INTO commander_home_audit_log
    (group_id, actor_id, target_type, target_id, action, metadata)
  VALUES (
    v_game.group_id, v_caller, 'tournament', p_tournament_id, 'updated', v_changes
  );

  RETURN jsonb_build_object('success', true, 'tournament_id', p_tournament_id, 'changes', v_changes);
END;
$function$


CREATE OR REPLACE FUNCTION public.rsvp_to_home_game(p_game_id uuid, p_response text, p_caller_user_id uuid, p_bringing_guests integer DEFAULT 0, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_game RECORD; v_group RECORD; v_host_profile RECORD;
    v_is_member boolean := false; v_is_banned boolean := false;
    v_rsvp_id uuid; v_updated_game RECORD;
    v_game_start_ts timestamptz; v_effective_tz text;
    v_dm_result jsonb; v_conv_id uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED'
              USING HINT = 'rsvp_to_home_game requires auth.uid() = p_caller_user_id';
    END IF;
    IF p_response NOT IN ('yes','maybe','no','waitlist') THEN
        RAISE EXCEPTION 'INVALID_RESPONSE'
              USING HINT = 'response must be one of: yes, maybe, no, waitlist';
    END IF;
    IF p_message IS NOT NULL AND length(p_message) > 500 THEN
        RAISE EXCEPTION 'MESSAGE_TOO_LONG' USING HINT = 'max 500 chars';
    END IF;
    IF p_bringing_guests IS NULL OR p_bringing_guests < 0 THEN p_bringing_guests := 0; END IF;

    SELECT * INTO v_game FROM commander_home_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
    IF v_game.status = 'cancelled' THEN
      RAISE EXCEPTION 'GAME_NOT_OPEN_FOR_RSVP' USING HINT = 'game status is cancelled';
    END IF;
    IF v_game.status NOT IN ('scheduled','confirmed','in_progress','completed') THEN
        RAISE EXCEPTION 'GAME_NOT_OPEN_FOR_RSVP'
              USING HINT = 'game status is ' || COALESCE(v_game.status,'NULL');
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_game.group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

    SELECT EXISTS (SELECT 1 FROM commander_home_members
       WHERE group_id = v_game.group_id AND user_id = p_caller_user_id AND status = 'banned')
     INTO v_is_banned;
    IF v_is_banned THEN RAISE EXCEPTION 'BANNED'; END IF;

    SELECT EXISTS (SELECT 1 FROM commander_home_groups
         WHERE id = v_game.group_id AND owner_id = p_caller_user_id)
    OR EXISTS (SELECT 1 FROM commander_home_members
         WHERE group_id = v_game.group_id AND user_id = p_caller_user_id AND status = 'approved')
     INTO v_is_member;

    IF v_group.is_private AND NOT v_is_member THEN
        RAISE EXCEPTION 'NOT_A_MEMBER'
              USING HINT = 'private group RSVP requires approved membership';
    END IF;

    v_effective_tz := COALESCE(
                        NULLIF(v_game.timezone, ''),
                        NULLIF(v_group.timezone, ''),
                        'America/New_York');
    v_game_start_ts := (v_game.scheduled_date + v_game.start_time) AT TIME ZONE v_effective_tz;

    IF v_game.status = 'completed' OR v_game.status = 'in_progress'
       OR v_game_start_ts <= NOW()
    THEN
        IF p_caller_user_id = v_game.host_id THEN
            RAISE EXCEPTION 'HOST_CANNOT_RSVP_TO_OWN_GAME';
        END IF;
        v_dm_result := public.fn_get_or_create_conversation(
            p_caller_user_id, v_game.host_id, 'direct');
        IF COALESCE((v_dm_result->>'success')::boolean, false) THEN
            v_conv_id := (v_dm_result->>'conversation_id')::uuid;
        ELSE v_conv_id := NULL; END IF;

        SELECT p.id, p.username, p.display_name, p.full_name, p.avatar_url
          INTO v_host_profile FROM profiles p WHERE p.id = v_game.host_id;

        RETURN jsonb_build_object(
            'success', false, 'error', 'GAME_STARTED',
            'message', 'This game has already started. Message the host directly.',
            'game', jsonb_build_object(
                'id', v_game.id, 'scheduled_date', v_game.scheduled_date,
                'start_time', v_game.start_time, 'timezone', v_effective_tz,
                'status', v_game.status),
            'host', jsonb_build_object(
                'id', v_host_profile.id, 'username', v_host_profile.username,
                'display_name', COALESCE(v_host_profile.display_name,
                                         v_host_profile.full_name, v_host_profile.username),
                'avatar_url', v_host_profile.avatar_url),
            'conversation_id', v_conv_id,
            'dm_url', CASE WHEN v_conv_id IS NOT NULL
                           THEN '/hub/messenger/' || v_conv_id::text
                           ELSE NULL END);
    END IF;

    IF NOT v_game.allow_guests AND p_bringing_guests > 0 THEN
        RAISE EXCEPTION 'GUESTS_NOT_ALLOWED';
    END IF;
    IF v_game.allow_guests AND v_game.guest_limit IS NOT NULL
       AND p_bringing_guests > v_game.guest_limit THEN
        RAISE EXCEPTION 'GUEST_LIMIT_EXCEEDED'
              USING HINT = 'maximum ' || v_game.guest_limit || ' guests per player';
    END IF;

    INSERT INTO commander_home_rsvps AS r
        (game_id, user_id, response, bringing_guests, message, responded_at, updated_at)
    VALUES
        (p_game_id, p_caller_user_id, p_response, p_bringing_guests, p_message, NOW(), NOW())
    ON CONFLICT (game_id, user_id) DO UPDATE
        SET response=EXCLUDED.response, bringing_guests=EXCLUDED.bringing_guests,
            message=EXCLUDED.message, updated_at=NOW()
    RETURNING id INTO v_rsvp_id;

    SELECT id, rsvp_yes, rsvp_maybe, rsvp_no, waitlist_count INTO v_updated_game
      FROM commander_home_games WHERE id = p_game_id;

    RETURN jsonb_build_object(
        'success', true, 'rsvp_id', v_rsvp_id, 'game_id', p_game_id, 'response', p_response,
        'counts', jsonb_build_object('yes', v_updated_game.rsvp_yes,
            'maybe', v_updated_game.rsvp_maybe, 'no', v_updated_game.rsvp_no,
            'waitlist', v_updated_game.waitlist_count));
END;
$function$


CREATE OR REPLACE FUNCTION public.search_home_groups(p_search_text text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_game_type text DEFAULT NULL::text, p_stakes text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_miles numeric DEFAULT NULL::numeric, p_exclude_joined boolean DEFAULT true, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_inactivity_days integer DEFAULT 45)
 RETURNS TABLE(group_id uuid, slug text, name text, tagline text, profile_photo_url text, city text, state text, default_game_type text, default_stakes text, typical_buyin_min integer, typical_buyin_max integer, max_players integer, frequency text, member_count integer, last_activity_at timestamp with time zone, distance_miles numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Phase 40: prevent viewer_id impersonation / membership enumeration
    IF p_viewer_user_id IS NOT NULL THEN
      IF COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR auth.uid() <> p_viewer_user_id THEN
          RAISE EXCEPTION 'VIEWER_ID_MISMATCH'
                USING ERRCODE = '42501',
                      HINT = 'p_viewer_user_id must equal auth.uid() or be null';
        END IF;
      END IF;
    END IF;

    p_limit := LEAST(COALESCE(p_limit, 50), 100);

    RETURN QUERY
    WITH base AS (
        SELECT g.*,
               sp.slug,
               CASE
                 WHEN p_lat IS NULL OR p_lng IS NULL
                      OR g.latitude IS NULL OR g.longitude IS NULL
                 THEN NULL::numeric
                 ELSE ROUND((
                    3959 * acos(
                        LEAST(1,
                            cos(radians(p_lat)) * cos(radians(g.latitude)) *
                            cos(radians(g.longitude) - radians(p_lng)) +
                            sin(radians(p_lat)) * sin(radians(g.latitude))
                        )
                    )
                 )::numeric, 1)
               END AS dist
          FROM commander_home_groups g
          LEFT JOIN social_pages sp
            ON sp.linked_entity_type = 'home_group'
           AND sp.linked_entity_id = g.id::text
         WHERE g.is_private = false
           AND g.is_active  = true
           AND (
               (g.visibility_override_until IS NOT NULL AND g.visibility_override_until > NOW())
            OR (g.last_activity_at IS NOT NULL
                AND g.last_activity_at >= NOW() - (p_inactivity_days || ' days')::interval)
           )
    )
    SELECT
        b.id, b.slug::text, b.name::text, b.tagline::text,
        b.profile_photo_url::text,
        b.city::text, b.state::text,
        b.default_game_type::text, b.default_stakes::text,
        b.typical_buyin_min, b.typical_buyin_max, b.max_players,
        b.frequency::text, b.member_count, b.last_activity_at,
        b.dist
      FROM base b
     WHERE (p_search_text IS NULL
            OR b.name        ILIKE '%' || p_search_text || '%'
            OR b.tagline     ILIKE '%' || p_search_text || '%'
            OR b.description ILIKE '%' || p_search_text || '%'
            OR b.city        ILIKE '%' || p_search_text || '%')
       AND (p_city      IS NULL OR b.city ILIKE p_city)
       AND (p_state     IS NULL OR UPPER(b.state) = UPPER(p_state))
       AND (p_game_type IS NULL OR b.default_game_type ILIKE p_game_type)
       AND (p_stakes    IS NULL OR b.default_stakes ILIKE '%' || p_stakes || '%')
       AND (p_radius_miles IS NULL OR b.dist IS NULL OR b.dist <= p_radius_miles)
       AND (
           p_exclude_joined = false
           OR p_viewer_user_id IS NULL
           OR NOT EXISTS (
               SELECT 1 FROM commander_home_members m
                WHERE m.group_id = b.id
                  AND m.user_id = p_viewer_user_id
                  AND m.status IN ('approved','pending')
           )
           AND b.owner_id <> p_viewer_user_id
       )
     ORDER BY
        CASE WHEN p_lat IS NULL THEN 1 ELSE 0 END,
        b.dist NULLS LAST,
        b.last_activity_at DESC NULLS LAST
     LIMIT p_limit;
END;
$function$


CREATE OR REPLACE FUNCTION public.search_home_groups_v2(p_search_text text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_game_type text DEFAULT NULL::text, p_stakes text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[], p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric, p_radius_miles integer DEFAULT NULL::integer, p_exclude_joined boolean DEFAULT false, p_viewer_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_inactivity_days integer DEFAULT 45)
 RETURNS TABLE(group_id uuid, name text, slug text, tagline text, description text, city text, state text, profile_photo_url text, cover_photo_url text, is_private boolean, member_count integer, games_hosted integer, distance_miles numeric, tags text[], relevance_score real, recent_rsvps_30d bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_point   geography;
    v_tsquery tsquery;
BEGIN
    -- Phase 40: if a viewer_user_id is passed, verify it matches the caller.
    -- Prevents membership-enumeration via (exclude_joined=true vs false) diffing.
    -- Anonymous callers (auth.uid() IS NULL) may not supply p_viewer_user_id.
    IF p_viewer_user_id IS NOT NULL THEN
      IF COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR auth.uid() <> p_viewer_user_id THEN
          RAISE EXCEPTION 'VIEWER_ID_MISMATCH'
                USING ERRCODE = '42501',
                      HINT = 'p_viewer_user_id must equal auth.uid() or be null';
        END IF;
      END IF;
    END IF;

    IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
    END IF;

    IF p_search_text IS NOT NULL AND length(trim(p_search_text)) > 0 THEN
        v_tsquery := plainto_tsquery('english', p_search_text);
    END IF;

    RETURN QUERY
    SELECT
        g.id, g.name,
        sp.slug,
        g.tagline, g.description,
        g.city, g.state, g.profile_photo_url, g.cover_photo_url,
        g.is_private,
        COALESCE(g.member_count, 0),
        COALESCE(g.games_hosted, 0),
        CASE WHEN v_point IS NOT NULL AND g.location_geog IS NOT NULL
             THEN ROUND((ST_Distance(g.location_geog, v_point) / 1609.344)::numeric, 1)
             ELSE NULL END,
        g.tags,
        CASE WHEN v_tsquery IS NOT NULL
             THEN ts_rank(g.search_vector, v_tsquery)
             ELSE 0::real END,
        COALESCE((
            SELECT COUNT(*) FROM commander_home_rsvps r
            JOIN commander_home_games hg ON hg.id = r.game_id
            WHERE hg.group_id = g.id AND r.response='yes'
              AND r.responded_at > NOW() - INTERVAL '30 days'
        ), 0)
      FROM commander_home_groups g
      LEFT JOIN social_pages sp ON sp.linked_entity_type='home_group' AND sp.linked_entity_id = g.id::text
     WHERE g.is_active = true
       AND NOT g.is_private
       AND g.profile_photo_url IS NOT NULL
       AND g.last_activity_at > NOW() - (p_inactivity_days || ' days')::interval
       AND (v_tsquery IS NULL OR g.search_vector @@ v_tsquery)
       AND (p_city  IS NULL OR g.city  ILIKE '%' || p_city  || '%')
       AND (p_state IS NULL OR g.state ILIKE '%' || p_state || '%')
       AND (p_game_type IS NULL OR g.default_game_type = p_game_type)
       AND (p_stakes    IS NULL OR g.default_stakes    = p_stakes)
       AND (p_tags IS NULL OR g.tags && p_tags)
       AND (v_point IS NULL OR p_radius_miles IS NULL OR g.location_geog IS NULL
            OR ST_DWithin(g.location_geog, v_point, p_radius_miles * 1609.344))
       AND (NOT p_exclude_joined OR p_viewer_user_id IS NULL OR NOT EXISTS (
              SELECT 1 FROM commander_home_members m
               WHERE m.group_id = g.id AND m.user_id = p_viewer_user_id
                 AND m.status IN ('approved','pending')))
     ORDER BY
        CASE WHEN v_tsquery IS NOT NULL THEN ts_rank(g.search_vector, v_tsquery) ELSE 0::real END DESC,
        CASE WHEN v_point IS NOT NULL AND g.location_geog IS NOT NULL
             THEN ST_Distance(g.location_geog, v_point)
             ELSE 999999999 END ASC,
        g.last_activity_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$function$


CREATE OR REPLACE FUNCTION public.slugify_home_game(input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE s text;
BEGIN
  s := lower(coalesce(input, ''));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  IF s IS NULL OR length(s) = 0 THEN s := 'home-game'; END IF;
  RETURN s;
END; $function$


CREATE OR REPLACE FUNCTION public.start_home_game_player_dm(p_game_id uuid, p_from_user_id uuid, p_to_user_id uuid, p_initial_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
    v_caller uuid := auth.uid();
    v_role text := auth.role();
    v_group_id uuid;
    v_game_host uuid;
    v_from_member record;
    v_to_member record;
    v_from_in_game boolean;
    v_to_in_game boolean;
    v_conv jsonb;
    v_conv_id uuid;
    v_msg jsonb;
    v_trim text;
BEGIN
    -- 1. Input sanity
    IF p_game_id IS NULL OR p_from_user_id IS NULL OR p_to_user_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'MISSING_PARAMS');
    END IF;

    IF p_from_user_id = p_to_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'SELF_DM');
    END IF;

    -- 2. Auth: caller must match p_from_user_id (service_role bypasses)
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF v_caller IS NULL OR v_caller <> p_from_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'AUTH_MISMATCH');
      END IF;
    END IF;

    -- 3. Look up game + host
    SELECT group_id, host_id
      INTO v_group_id, v_game_host
      FROM commander_home_games
     WHERE id = p_game_id;

    IF v_group_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'GAME_NOT_FOUND');
    END IF;

    -- 4. Verify both users are approved, non-banned members of this group
    SELECT role, status INTO v_from_member
      FROM commander_home_members
     WHERE group_id = v_group_id AND user_id = p_from_user_id;

    SELECT role, status INTO v_to_member
      FROM commander_home_members
     WHERE group_id = v_group_id AND user_id = p_to_user_id;

    IF v_from_member IS NULL OR v_from_member.status <> 'approved' THEN
      RETURN jsonb_build_object('success', false, 'error', 'FROM_NOT_APPROVED_MEMBER');
    END IF;

    IF v_to_member IS NULL OR v_to_member.status <> 'approved' THEN
      RETURN jsonb_build_object('success', false, 'error', 'TO_NOT_APPROVED_MEMBER');
    END IF;

    IF v_from_member.status = 'banned' OR v_to_member.status = 'banned' THEN
      RETURN jsonb_build_object('success', false, 'error', 'BANNED');
    END IF;

    -- 5. Require game-context: at least one party must be tied to this game.
    v_from_in_game := (
      v_game_host = p_from_user_id
      OR EXISTS (SELECT 1 FROM commander_home_rsvps
                  WHERE game_id = p_game_id AND user_id = p_from_user_id
                    AND response = 'yes')
      OR EXISTS (SELECT 1 FROM commander_home_seats
                  WHERE game_id = p_game_id AND user_id = p_from_user_id
                    AND status <> 'empty')
    );

    v_to_in_game := (
      v_game_host = p_to_user_id
      OR EXISTS (SELECT 1 FROM commander_home_rsvps
                  WHERE game_id = p_game_id AND user_id = p_to_user_id
                    AND response = 'yes')
      OR EXISTS (SELECT 1 FROM commander_home_seats
                  WHERE game_id = p_game_id AND user_id = p_to_user_id
                    AND status <> 'empty')
    );

    IF NOT (v_from_in_game OR v_to_in_game) THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_GAME_RELATIONSHIP');
    END IF;

    -- 6. Get or create the 1:1 conversation via existing helper
    v_conv := public.fn_get_or_create_conversation(p_from_user_id, p_to_user_id);
    IF NOT COALESCE((v_conv->>'success')::boolean, false) THEN
      RETURN jsonb_build_object('success', false,
                                'error', 'CONVERSATION_FAILED',
                                'detail', v_conv);
    END IF;
    v_conv_id := (v_conv->>'conversation_id')::uuid;

    -- 7. Seed with initial message if caller provided one
    v_trim := NULLIF(TRIM(COALESCE(p_initial_message, '')), '');
    IF v_trim IS NOT NULL THEN
      IF length(v_trim) > 4000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'MESSAGE_TOO_LONG');
      END IF;
      v_msg := public.fn_send_message(v_conv_id, p_from_user_id, v_trim, 'text');
      IF NOT COALESCE((v_msg->>'success')::boolean, false) THEN
        -- conversation exists but message failed — still useful, tell caller
        RETURN jsonb_build_object(
          'success', true,
          'conversation_id', v_conv_id,
          'created', COALESCE((v_conv->>'created')::boolean, false),
          'message_sent', false,
          'message_error', v_msg
        );
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'conversation_id', v_conv_id,
      'created', COALESCE((v_conv->>'created')::boolean, false),
      'message_sent', v_trim IS NOT NULL,
      'context_game_id', p_game_id
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.start_home_group_roster_dm(p_group_id uuid, p_from_user_id uuid, p_to_user_id uuid, p_initial_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
    v_caller  uuid := auth.uid();
    v_role    text := auth.role();
    v_is_staff boolean;
    v_to_is_member boolean;
    v_to_is_follower boolean;
    v_to_banned boolean;
    v_conv jsonb; v_conv_id uuid;
    v_msg jsonb; v_trim text;
BEGIN
    IF p_group_id IS NULL OR p_from_user_id IS NULL OR p_to_user_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'MISSING_PARAMS');
    END IF;
    IF p_from_user_id = p_to_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'SELF_DM');
    END IF;

    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF v_caller IS NULL OR v_caller <> p_from_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'AUTH_MISMATCH');
      END IF;
    END IF;

    -- Caller must be host/owner/admin of the group
    v_is_staff := EXISTS (
      SELECT 1 FROM commander_home_groups
       WHERE id = p_group_id AND owner_id = p_from_user_id
    ) OR EXISTS (
      SELECT 1 FROM commander_home_members
       WHERE group_id = p_group_id AND user_id = p_from_user_id
         AND role = 'admin' AND status = 'approved'
    );

    IF NOT v_is_staff THEN
      RETURN jsonb_build_object('success', false, 'error', 'NOT_GROUP_STAFF');
    END IF;

    -- Target must be an approved member OR follower; not banned
    v_to_banned := EXISTS (
      SELECT 1 FROM commander_home_members
       WHERE group_id = p_group_id AND user_id = p_to_user_id AND status = 'banned'
    );
    IF v_to_banned THEN
      RETURN jsonb_build_object('success', false, 'error', 'TARGET_BANNED');
    END IF;

    v_to_is_member := EXISTS (
      SELECT 1 FROM commander_home_members
       WHERE group_id = p_group_id AND user_id = p_to_user_id AND status = 'approved'
    );
    v_to_is_follower := EXISTS (
      SELECT 1 FROM commander_home_group_follows
       WHERE group_id = p_group_id AND user_id = p_to_user_id
    );

    IF NOT (v_to_is_member OR v_to_is_follower) THEN
      RETURN jsonb_build_object('success', false, 'error', 'TARGET_NOT_IN_ROSTER');
    END IF;

    -- Validate initial message length up-front
    v_trim := NULLIF(TRIM(COALESCE(p_initial_message, '')), '');
    IF v_trim IS NOT NULL AND length(v_trim) > 4000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'MESSAGE_TOO_LONG');
    END IF;

    -- Get/create conversation
    v_conv := public.fn_get_or_create_conversation(p_from_user_id, p_to_user_id);
    IF NOT COALESCE((v_conv->>'success')::boolean, false) THEN
      RETURN jsonb_build_object('success', false,
                                'error', 'CONVERSATION_FAILED',
                                'detail', v_conv);
    END IF;
    v_conv_id := (v_conv->>'conversation_id')::uuid;

    -- Seed message if provided
    IF v_trim IS NOT NULL THEN
      v_msg := public.fn_send_message(v_conv_id, p_from_user_id, v_trim, 'text');
      IF NOT COALESCE((v_msg->>'success')::boolean, false) THEN
        RETURN jsonb_build_object(
          'success', true,
          'conversation_id', v_conv_id,
          'created', COALESCE((v_conv->>'created')::boolean, false),
          'message_sent', false,
          'target_relationship',
            CASE WHEN v_to_is_member AND v_to_is_follower THEN 'both'
                 WHEN v_to_is_member THEN 'member'
                 ELSE 'follower' END,
          'message_error', v_msg
        );
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'conversation_id', v_conv_id,
      'created', COALESCE((v_conv->>'created')::boolean, false),
      'message_sent', v_trim IS NOT NULL,
      'target_relationship',
        CASE WHEN v_to_is_member AND v_to_is_follower THEN 'both'
             WHEN v_to_is_member THEN 'member'
             ELSE 'follower' END,
      'context_group_id', p_group_id
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_home_group_to_social_page()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.social_pages sp
  SET owner_id      = NEW.owner_id,   -- Phase 40: keep owner in step
      name          = NEW.name,
      description   = coalesce(NEW.description, NEW.tagline, sp.description),
      avatar_url    = coalesce(NEW.profile_photo_url, sp.avatar_url),
      cover_url     = coalesce(NEW.cover_photo_url, sp.cover_url),
      location_city = NEW.city,
      location_state= NEW.state,
      is_public     = (coalesce(NEW.is_active, true) AND NOT coalesce(NEW.is_private, false)),
      metadata      = coalesce(sp.metadata, '{}'::jsonb) || jsonb_build_object(
        'home_group_id', NEW.id,
        'invite_code', NEW.invite_code,
        'club_code', NEW.club_code,
        'default_game_type', NEW.default_game_type,
        'default_stakes', NEW.default_stakes,
        'frequency', NEW.frequency
      ),
      updated_at    = now()
  WHERE sp.linked_entity_type = 'home_group'
    AND sp.linked_entity_id = NEW.id::text;

  IF NOT FOUND THEN
    INSERT INTO public.social_pages (
      owner_id, page_type, name, slug, description,
      avatar_url, cover_url, category,
      location_city, location_state, location_country,
      linked_entity_type, linked_entity_id,
      is_public, allow_member_posts, require_post_approval, metadata
    ) VALUES (
      NEW.owner_id, 'home_game', NEW.name,
      public.unique_home_game_slug(NEW.name),
      coalesce(NEW.description, NEW.tagline, ''),
      NEW.profile_photo_url, NEW.cover_photo_url, 'home game',
      NEW.city, NEW.state, 'US',
      'home_group', NEW.id::text,
      (coalesce(NEW.is_active, true) AND NOT coalesce(NEW.is_private, false)),
      true, false,
      jsonb_build_object(
        'home_group_id', NEW.id,
        'invite_code', NEW.invite_code,
        'club_code', NEW.club_code,
        'default_game_type', NEW.default_game_type,
        'default_stakes', NEW.default_stakes,
        'frequency', NEW.frequency
      )
    );
  END IF;
  RETURN NEW;
END;
$function$


-- (tmp_dump_home_games_schema omitted: temporary helper, dropped in phase56)

CREATE OR REPLACE FUNCTION public.toggle_home_group_follow(p_group_id uuid, p_caller_user_id uuid, p_follow boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_group      RECORD;
    v_existing   RECORD;
    v_new_state  boolean;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    
    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF v_group.is_private THEN RAISE EXCEPTION 'CANNOT_FOLLOW_PRIVATE_GROUP'; END IF;

    -- Members don't need to follow; they already get notifications
    IF EXISTS (SELECT 1 FROM commander_home_members 
                WHERE group_id = p_group_id AND user_id = p_caller_user_id AND status='approved')
    THEN RAISE EXCEPTION 'ALREADY_MEMBER' USING HINT='members already receive notifications'; END IF;

    SELECT * INTO v_existing FROM commander_home_group_follows 
     WHERE group_id = p_group_id AND user_id = p_caller_user_id;

    v_new_state := CASE 
        WHEN p_follow IS NOT NULL THEN p_follow
        WHEN v_existing IS NULL THEN true
        ELSE false END;

    IF v_new_state THEN
        INSERT INTO commander_home_group_follows (group_id, user_id)
        VALUES (p_group_id, p_caller_user_id)
        ON CONFLICT (group_id, user_id) DO NOTHING;
    ELSE
        DELETE FROM commander_home_group_follows 
         WHERE group_id = p_group_id AND user_id = p_caller_user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'following', v_new_state);
END;
$function$


CREATE OR REPLACE FUNCTION public.track_home_group_share_click(p_group_id uuid, p_token_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid uuid := auth.uid();
    v_anon_recent int;
BEGIN
    -- Validate group exists
    IF NOT EXISTS (SELECT 1 FROM commander_home_groups WHERE id = p_group_id) THEN
        RETURN;
    END IF;

    IF v_uid IS NOT NULL THEN
        -- Authenticated: 1 bump per (group, token, user) per hour
        IF EXISTS (
            SELECT 1 FROM commander_home_group_share_log
             WHERE group_id   = p_group_id
               AND caller_uid = v_uid
               AND COALESCE(token_id::text, '') = COALESCE(p_token_id::text, '')
               AND inserted_at > NOW() - INTERVAL '1 hour'
        ) THEN
            RETURN;
        END IF;
    ELSE
        -- Anonymous: global cap of 100 per group per hour
        SELECT COUNT(*) INTO v_anon_recent
          FROM commander_home_group_share_log
         WHERE group_id   = p_group_id
           AND caller_uid IS NULL
           AND inserted_at > NOW() - INTERVAL '1 hour';
        IF v_anon_recent >= 100 THEN
            RETURN;
        END IF;
    END IF;

    INSERT INTO commander_home_group_share_log (group_id, token_id, caller_uid)
         VALUES (p_group_id, p_token_id, v_uid);

    UPDATE commander_home_groups
       SET share_click_count = COALESCE(share_click_count, 0) + 1
     WHERE id = p_group_id;

    IF p_token_id IS NOT NULL THEN
        UPDATE commander_home_invite_tokens
           SET click_count = COALESCE(click_count, 0) + 1
         WHERE id = p_token_id AND group_id = p_group_id;
    END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.track_home_group_view(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid uuid := auth.uid();
    v_anon_recent int;
BEGIN
    -- Validate group exists (no-op silently if not — don't leak existence to anon)
    IF NOT EXISTS (SELECT 1 FROM commander_home_groups WHERE id = p_group_id) THEN
        RETURN;
    END IF;

    IF v_uid IS NOT NULL THEN
        -- Authenticated: 1 bump per (group, user) per hour
        IF EXISTS (
            SELECT 1 FROM commander_home_group_view_log
             WHERE group_id   = p_group_id
               AND caller_uid = v_uid
               AND inserted_at > NOW() - INTERVAL '1 hour'
        ) THEN
            RETURN;
        END IF;
    ELSE
        -- Anonymous: global cap of 60 bumps per group per hour
        SELECT COUNT(*) INTO v_anon_recent
          FROM commander_home_group_view_log
         WHERE group_id   = p_group_id
           AND caller_uid IS NULL
           AND inserted_at > NOW() - INTERVAL '1 hour';
        IF v_anon_recent >= 60 THEN
            RETURN;
        END IF;
    END IF;

    INSERT INTO commander_home_group_view_log (group_id, caller_uid)
         VALUES (p_group_id, v_uid);

    UPDATE commander_home_groups
       SET view_count = COALESCE(view_count, 0) + 1
     WHERE id = p_group_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.transfer_home_group_ownership(p_group_id uuid, p_new_owner_user_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_group          RECORD;
    v_target_member  RECORD;
    v_old_owner      uuid;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

    IF v_group.owner_id <> p_caller_user_id THEN
        RAISE EXCEPTION 'OWNER_ONLY_ACTION';
    END IF;
    IF v_group.owner_id = p_new_owner_user_id THEN
        RAISE EXCEPTION 'ALREADY_OWNER';
    END IF;

    SELECT * INTO v_target_member
      FROM commander_home_members
     WHERE group_id = p_group_id AND user_id = p_new_owner_user_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_MEMBER'; END IF;
    IF v_target_member.status <> 'approved' THEN RAISE EXCEPTION 'TARGET_NOT_APPROVED'; END IF;
    IF v_target_member.role <> 'admin' THEN
        RAISE EXCEPTION 'TARGET_NOT_ADMIN'
              USING HINT = 'promote to admin first, then transfer';
    END IF;

    v_old_owner := v_group.owner_id;

    UPDATE commander_home_groups
       SET owner_id = p_new_owner_user_id, updated_at = NOW()
     WHERE id = p_group_id;

    UPDATE commander_home_members
       SET role = 'admin'
     WHERE group_id = p_group_id AND user_id = v_old_owner;

    UPDATE commander_home_members
       SET role = 'owner'
     WHERE group_id = p_group_id AND user_id = p_new_owner_user_id;

    INSERT INTO commander_home_audit_log
      (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (p_group_id, p_caller_user_id, 'group', p_group_id, 'ownership_transferred',
            jsonb_build_object('from_user', v_old_owner, 'to_user', p_new_owner_user_id));

    -- ★ NEW: notify the new owner
    BEGIN
      PERFORM public.fn_emit_home_notification(
        p_user_id     => p_new_owner_user_id,
        p_type        => 'home_group_ownership_transferred',
        p_title       => 'You''re the new owner',
        p_message     => 'Ownership of ' || COALESCE(v_group.name, 'a group') ||
                         ' was transferred to you.',
        p_link        => '/hub/home-games/group/' || p_group_id::text,
        p_data        => jsonb_build_object(
                           'group_id',        p_group_id,
                           'previous_owner',  v_old_owner),
        p_pref_column => NULL
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ownership-transfer notify failed: %', SQLERRM;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'group_id', p_group_id,
        'previous_owner', v_old_owner,
        'new_owner', p_new_owner_user_id
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.trg_fn_autocreate_home_group_social_page()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.fn_ensure_social_page_for_home_group(NEW.id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'autocreate home_group social_page failed for group=%: %', NEW.id, SQLERRM;
    RETURN NEW;
END; $function$


CREATE OR REPLACE FUNCTION public.unique_home_game_slug(base text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  s text := public.slugify_home_game(base);
  candidate text := s;
  n int := 2;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.social_pages WHERE slug = candidate) LOOP
    candidate := s || '-' || n::text;
    n := n + 1;
    IF n > 500 THEN
      candidate := s || '-' || substr(md5(random()::text), 1, 6);
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END; $function$


CREATE OR REPLACE FUNCTION public.update_home_game_rsvp_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE commander_home_games
     SET rsvp_yes = (SELECT COUNT(*) FROM commander_home_rsvps
                      WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'yes'),
         rsvp_maybe = (SELECT COUNT(*) FROM commander_home_rsvps
                        WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'maybe'),
         rsvp_no = (SELECT COUNT(*) FROM commander_home_rsvps
                     WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'no'),
         waitlist_count = (SELECT COUNT(*) FROM commander_home_rsvps
                            WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'waitlist'),
         updated_at = NOW()
   WHERE id = COALESCE(NEW.game_id, OLD.game_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.update_home_group_member_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE commander_home_groups
     SET member_count = (SELECT COUNT(*) FROM commander_home_members
                          WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
                            AND status = 'approved'),
         updated_at = NOW()
   WHERE id = COALESCE(NEW.group_id, OLD.group_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_home_game_social_page_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  sp_type text;
  sp_linked_group text;
BEGIN
  IF NEW.social_page_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT page_type, linked_entity_id
    INTO sp_type, sp_linked_group
  FROM public.social_pages
  WHERE id = NEW.social_page_id;

  IF sp_type IS NULL THEN
    -- FK will catch this; belt + suspenders.
    RAISE EXCEPTION 'social_page_id % does not exist', NEW.social_page_id;
  END IF;

  IF sp_type <> 'home_game' THEN
    RAISE EXCEPTION 'commander_home_games.social_page_id must reference a social_page of page_type=home_game, got %', sp_type;
  END IF;

  -- The event's group MUST match the social page's linked group.
  IF NEW.group_id IS NOT NULL AND sp_linked_group IS DISTINCT FROM NEW.group_id::text THEN
    RAISE EXCEPTION 'commander_home_games event (group_id=%) cannot point at social_page linked to different group (linked_entity_id=%)',
      NEW.group_id, sp_linked_group;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.verify_home_games_health()
 RETURNS TABLE(category text, check_name text, status text, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY

    SELECT 'regulatory'::text, 'diamond_transactions CHECK no_home_games_source'::text,
           CASE WHEN EXISTS (SELECT 1 FROM pg_constraint c
                  JOIN pg_class cl ON cl.oid=c.conrelid
                  WHERE cl.relname='diamond_transactions' AND c.conname='no_home_games_source')
                THEN '✓' ELSE '✗ MISSING' END,
           'CHECK (source <> ''home_games'')'
    UNION ALL
    SELECT 'regulatory', 'zero diamond_transactions with source=home_games',
           CASE WHEN (SELECT COUNT(*) FROM diamond_transactions dt
                       WHERE dt.source='home_games')=0 THEN '✓' ELSE '✗' END,
           (SELECT COUNT(*)::text FROM diamond_transactions dt
             WHERE dt.source='home_games') || ' rows'
    UNION ALL
    SELECT 'regulatory', 'zero triggers on home tables minting value',
           CASE WHEN (SELECT COUNT(*) FROM pg_trigger t
                       JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
                      WHERE NOT t.tgisinternal AND c.relname LIKE 'commander_home_%'
                        AND pg_get_functiondef(p.oid) ~*
                            '(award_diamonds|add_diamonds|credit_diamonds|diamond_ledger|diamond_transactions)')=0
                THEN '✓' ELSE '✗' END,
           'trigger handlers scanned for value-minting refs'
    UNION ALL
    SELECT 'regulatory', 'zero dropped reward fns still exist',
           CASE WHEN (SELECT COUNT(*) FROM pg_proc p
                       JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname='public' AND p.prokind='f'
                        AND p.proname IN ('fn_grant_host_diamonds_on_complete',
                                          'fn_award_badges_on_game_complete',
                                          'award_home_games_badges',
                                          '_award_home_badge_if_new',
                                          'get_home_games_diamond_history',
                                          'get_home_games_leaderboards',
                                          'get_user_home_games_badges'))=0
                THEN '✓' ELSE '✗' END, 'Phase 36 dropped fns must stay gone'
    UNION ALL
    SELECT 'regulatory', 'XP absolute purge + DDL guard active',
           CASE WHEN EXISTS (SELECT 1 FROM pg_event_trigger
                              WHERE evtname='xp_ban_guard' AND evtenabled='O')
                AND (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema='public'
                        AND column_name ~* '(^xp$|_xp$|^xp_|^reputation_xp$|^total_xp$|^xp_total$|^xp_earned$|^xp_reward$|^bonus_xp_)')=0
                THEN '✓' ELSE '✗' END,
           'zero XP columns + event trigger enforcing permanent ban'

    UNION ALL
    SELECT 'privacy', 'host_private_note not readable by authenticated',
           CASE WHEN NOT has_column_privilege('authenticated',
                  'public.commander_home_members', 'host_private_note', 'SELECT')
                THEN '✓' ELSE '✗' END,
           'column-level grant gates access via SECURITY DEFINER fns only'
    UNION ALL
    SELECT 'privacy', 'host_private_note not readable by anon',
           CASE WHEN NOT has_column_privilege('anon',
                  'public.commander_home_members', 'host_private_note', 'SELECT')
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'privacy', 'fn_home_list_seats has auth guard',
           CASE WHEN EXISTS (SELECT 1 FROM pg_proc p
                  JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='fn_home_list_seats'
                    AND pg_get_functiondef(p.oid) ILIKE '%NOT_A_GROUP_MEMBER%')
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'privacy', 'fn_home_list_seats not anon-callable',
           CASE WHEN NOT has_function_privilege('anon',
                  'public.fn_home_list_seats(uuid)', 'EXECUTE')
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'privacy', 'home_members_host_sees_group policy non-recursive',
           CASE WHEN EXISTS (SELECT 1 FROM pg_policy pol
                  JOIN pg_class cl ON cl.oid=pol.polrelid
                  WHERE cl.relname='commander_home_members'
                    AND pol.polname='home_members_host_sees_group'
                    AND pg_get_expr(pol.polqual, pol.polrelid)
                        ILIKE '%fn_home_is_approved_member%')
                THEN '✓' ELSE '✗' END,
           'policy uses SECURITY DEFINER helper to avoid self-recursion'
    UNION ALL
    SELECT 'privacy', 'GDPR content scrubber available for HG',
           CASE WHEN EXISTS (SELECT 1 FROM pg_proc p
                  JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='fn_anonymize_hg_user_content')
                THEN '✓' ELSE '✗' END,
           'fn_anonymize_hg_user_content(user_id, requested_by) scrubs HG content bodies'

    UNION ALL
    SELECT 'compliance', 'onboarding gate trigger registered on HG write tables',
           (SELECT COUNT(*)::text FROM pg_trigger tg
              JOIN pg_proc p ON p.oid=tg.tgfoid
             WHERE p.proname='fn_hg_require_onboarded_on_write'
               AND NOT tg.tgisinternal)
              || ' tables gated',
           'BEFORE INSERT gates writes to HG tables when caller not onboarded'
    UNION ALL
    SELECT 'compliance', 'resource quota trigger registered on HG write tables',
           (SELECT COUNT(*)::text FROM pg_trigger tg
              JOIN pg_proc p ON p.oid=tg.tgfoid
             WHERE p.proname='fn_hg_enforce_quotas_on_write'
               AND NOT tg.tgisinternal)
              || ' tables gated',
           'groups (20/user), invite tokens (50/group), scheduled games (100/group)'
    UNION ALL
    SELECT 'compliance', 'platform policies seeded',
           CASE WHEN (SELECT COUNT(*) FROM platform_policies pp
                       WHERE pp.key IN ('home_games.tos.version',
                                     'home_games.privacy.version',
                                     'home_games.community_guidelines.version',
                                     'home_games.money_policy.version',
                                     'home_games.minimum_age')) = 5
                THEN '✓' ELSE '✗' END,
           '5 required platform_policies keys'
    UNION ALL
    SELECT 'compliance', 'length caps present on 10 user-facing text RPCs',
           (SELECT COUNT(*)::text || ' / 10' FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public'
               AND p.proname IN ('cancel_home_game','create_home_game_from_template',
                 'fn_home_assign_seat','request_home_group_promotion',
                 'resolve_home_content_report','review_home_ban_appeal',
                 'rsvp_to_home_game','vote_home_group_poll',
                 'create_home_group_invite_token','record_home_game_photo')
               AND p.prosrc ~* '(max \d+|TOO_LONG|TOO_MANY|too long)'),
           'CONTENT_TOO_LONG / MESSAGE_TOO_LONG / TOO_MANY_OPTIONS / etc.'
    UNION ALL
    SELECT 'compliance', 'notification preference columns complete',
           CASE WHEN (SELECT COUNT(*) FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='user_notification_preferences'
                         AND column_name IN ('home_game_post_likes','home_game_post_comments',
                           'home_game_rsvp_confirmations','home_game_reminders',
                           'home_game_announcements','home_game_new_game_posted',
                           'home_game_cancellations','home_game_host_requests',
                           'home_game_review_prompts')) = 9
                THEN '✓' ELSE '✗' END,
           '9 HG-specific notification mute toggles'

    UNION ALL
    SELECT 'auth', '7 fn_home_* seat RPCs have defense-in-depth guard',
           (SELECT COUNT(*)::text || ' / 7' FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public'
               AND p.proname IN ('fn_home_assign_seat','fn_home_init_seats',
                                 'fn_home_move_seat','fn_home_randomize_seats',
                                 'fn_home_set_seat_status','fn_home_vacate_seat',
                                 'revive_home_group')
               AND pg_get_functiondef(p.oid) ILIKE '%auth.role() <> ''service_role''%'
               AND pg_get_functiondef(p.oid) ILIKE '%auth.uid() IS DISTINCT FROM%'),
           CASE WHEN (SELECT COUNT(*) FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public'
               AND p.proname IN ('fn_home_assign_seat','fn_home_init_seats',
                                 'fn_home_move_seat','fn_home_randomize_seats',
                                 'fn_home_set_seat_status','fn_home_vacate_seat',
                                 'revive_home_group')
               AND pg_get_functiondef(p.oid) ILIKE '%auth.role() <> ''service_role''%'
               AND pg_get_functiondef(p.oid) ILIKE '%auth.uid() IS DISTINCT FROM%')=7
               THEN '' ELSE 'expected 7' END
    UNION ALL
    SELECT 'auth', 'atomic_chip_transfer has all 5 guards',
           CASE WHEN EXISTS (SELECT 1 FROM pg_proc p
                  JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='atomic_chip_transfer'
                    AND pg_get_functiondef(p.oid) ILIKE '%SELF_TRANSFER_FORBIDDEN%'
                    AND pg_get_functiondef(p.oid) ILIKE '%UNAUTHORIZED%'
                    AND pg_get_functiondef(p.oid) ILIKE '%INVALID_AMOUNT%'
                    AND pg_get_functiondef(p.oid) ILIKE '%AMOUNT_EXCEEDS_LIMIT%')
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'auth', 'admin-action audit log coverage',
           (SELECT COUNT(*)::text || ' / 18' FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public'
               AND p.proname IN (
                 'resolve_home_content_report','review_home_ban_appeal','manage_home_group_member',
                 'reset_home_member_strikes','set_home_member_regular','transfer_home_group_ownership',
                 'cancel_home_game','edit_home_game','edit_home_group','complete_home_game',
                 'promote_home_game_waitlist','request_home_group_promotion','withdraw_home_group_promotion',
                 'revive_home_group','set_home_member_private_note','redeem_home_group_invite_token',
                 'delete_home_group_post','fn_home_auto_hide_on_report_threshold')
               AND p.prosrc ~* 'INSERT\s+INTO\s+(public\.)?commander_home_audit_log'),
           'every privileged state change leaves an audit trail'

    UNION ALL
    SELECT 'rate_limit', 'track_home_group_view has dedupe logic',
           CASE WHEN EXISTS (SELECT 1 FROM pg_proc p
                  JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='track_home_group_view'
                    AND pg_get_functiondef(p.oid) ILIKE '%commander_home_group_view_log%'
                    AND pg_get_functiondef(p.oid) ILIKE '%INTERVAL ''1 hour''%')
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'rate_limit', 'track_home_group_share_click has dedupe logic',
           CASE WHEN EXISTS (SELECT 1 FROM pg_proc p
                  JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='track_home_group_share_click'
                    AND pg_get_functiondef(p.oid) ILIKE '%commander_home_group_share_log%')
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'rate_limit', 'home-view-log-prune cron scheduled',
           CASE WHEN EXISTS (SELECT 1 FROM cron.job
                              WHERE jobname='home-view-log-prune')
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'rate_limit', '5 spam-vector RPCs use fn_try_consume_home_rate_limit',
           (SELECT COUNT(*)::text || ' / 5' FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public'
               AND p.proname IN ('create_home_group_post','create_home_post_comment',
                                 'create_home_group_invite_token','record_home_game_photo',
                                 'toggle_home_post_like')
               AND p.prosrc ~* 'fn_try_consume_home_rate_limit'),
           'post / comment / invite / photo / like'

    UNION ALL
    SELECT 'infra', 'all home game tables have RLS enabled',
           (SELECT COUNT(*) FILTER (WHERE c.relrowsecurity)::text
                   || ' / ' || COUNT(*)::text
              FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind='r'
               AND c.relname LIKE 'commander_home_%'), ''
    UNION ALL
    SELECT 'infra', 'all home game tables FORCE RLS',
           (SELECT COUNT(*) FILTER (WHERE c.relforcerowsecurity)::text
                   || ' / ' || COUNT(*)::text
              FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind='r'
               AND c.relname LIKE 'commander_home_%'), ''
    UNION ALL
    SELECT 'infra', 'all home game tables have at least one RLS policy',
           CASE WHEN (SELECT COUNT(*) FROM pg_class c
                       JOIN pg_namespace n ON n.oid=c.relnamespace
                      WHERE n.nspname='public' AND c.relkind='r'
                        AND c.relname LIKE 'commander_home_%'
                        AND c.relrowsecurity
                        AND NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = c.oid)
                        AND c.relname NOT IN (
                          'commander_home_group_view_log',
                          'commander_home_group_share_log',
                          'commander_home_join_attempts'))=0
                THEN '✓' ELSE '✗' END, 'exempts 3 deny-all server-log tables'
    UNION ALL
    SELECT 'infra', 'composite index idx_commander_home_games_group_scheduled exists',
           CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                  WHERE tablename='commander_home_games'
                    AND indexname='idx_commander_home_games_group_scheduled')
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'infra', 'all home game triggers enabled',
           (SELECT COUNT(*) FILTER (WHERE t.tgenabled='O')::text
                   || ' / ' || COUNT(*)::text || ' enabled'
              FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             WHERE NOT t.tgisinternal AND c.relname LIKE 'commander_home_%'), ''
    UNION ALL
    SELECT 'infra', 'home cron jobs scheduled',
           (SELECT COUNT(*)::text FROM cron.job cj WHERE cj.jobname LIKE 'home-%'),
           'reminders, auto-complete, trending, stale sweep, recurring gen, quality, vitality, nudge, recap, snapshots, view-log prune, strike-decay'
    UNION ALL
    SELECT 'infra', 'realtime publication for HG tables',
           (SELECT COUNT(*)::text || ' tables' FROM pg_publication_rel pr
              JOIN pg_class c ON c.oid = pr.prrelid
              JOIN pg_publication p ON p.oid = pr.prpubid
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE p.pubname='supabase_realtime' AND n.nspname='public'
               AND c.relname LIKE 'commander_home_%'),
           'games, groups, members, rsvps, seats, seat reservations'

    UNION ALL
    SELECT 'integrity', 'zero orphan RSVPs',
           CASE WHEN (SELECT COUNT(*) FROM commander_home_rsvps r
                       WHERE NOT EXISTS (SELECT 1 FROM commander_home_games g
                                          WHERE g.id = r.game_id))=0
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'integrity', 'zero orphan seats',
           CASE WHEN (SELECT COUNT(*) FROM commander_home_seats s
                       WHERE NOT EXISTS (SELECT 1 FROM commander_home_games g
                                          WHERE g.id = s.game_id))=0
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'integrity', 'zero orphan posts',
           CASE WHEN (SELECT COUNT(*) FROM commander_home_posts p
                       WHERE NOT EXISTS (SELECT 1 FROM commander_home_groups g
                                          WHERE g.id = p.group_id))=0
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'integrity', 'zero expired active invite tokens',
           CASE WHEN (SELECT COUNT(*) FROM commander_home_invite_tokens it
                       WHERE it.expires_at < NOW() AND it.is_active = true)=0
                THEN '✓' ELSE '✗' END, ''
    UNION ALL
    SELECT 'integrity', 'zero banned members w/o banned_at',
           CASE WHEN (SELECT COUNT(*) FROM commander_home_members m
                       WHERE m.status='banned' AND m.banned_at IS NULL)=0
                THEN '✓' ELSE '✗' END, ''
    ;
END;
$function$


CREATE OR REPLACE FUNCTION public.verify_home_games_invariants()
 RETURNS TABLE(invariant text, ok boolean, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- 1/2. The two RLS helpers must stay SECURITY DEFINER with RLS off.
    --      SECURITY INVOKER + row_security=off is illegal without BYPASSRLS
    --      and raises 42501 for every authenticated caller.
    RETURN QUERY
    SELECT
        'helper_' || p.proname,
        (p.prosecdef AND COALESCE(p.proconfig, ARRAY[]::text[]) && ARRAY['row_security=off']),
        format('prosecdef=%s config=%s', p.prosecdef, COALESCE(p.proconfig, ARRAY[]::text[])::text)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_home_is_group_staff', 'fn_home_is_approved_member');

    -- 3. Roster SELECT must be staff-aware, not the dashboard's self-only default.
    RETURN QUERY
    SELECT
        'policy_home_members_host_sees_group',
        EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname='public' AND tablename='commander_home_members'
              AND cmd='SELECT' AND qual LIKE '%fn_home_is_group_staff%'
        ),
        COALESCE((
            SELECT string_agg(policyname, ', ')
            FROM pg_policies
            WHERE schemaname='public' AND tablename='commander_home_members' AND cmd='SELECT'
        ), '(no SELECT policy at all)');

    -- 4. Double-booking guard.
    RETURN QUERY
    SELECT
        'index_one_active_game_per_group_per_date',
        EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='public'
              AND indexname='uq_commander_home_games_one_active_per_group_per_date'
        ),
        'partial unique index on (group_id, scheduled_date) WHERE status <> cancelled';

    -- 5. No blanket USING(true) SELECT policies on the social/home surface.
    RETURN QUERY
    SELECT
        'no_blanket_select_policies',
        NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname='public' AND cmd='SELECT' AND qual='true'
              AND tablename IN ('social_pages','social_page_posts','social_page_reviews',
                                'home_game_vouches','commander_post_comments',
                                'commander_venue_followers','commander_home_posts')
        ),
        COALESCE((
            SELECT string_agg(tablename || '.' || policyname, ', ')
            FROM pg_policies
            WHERE schemaname='public' AND cmd='SELECT' AND qual='true'
              AND tablename IN ('social_pages','social_page_posts','social_page_reviews',
                                'home_game_vouches','commander_post_comments',
                                'commander_venue_followers','commander_home_posts')
        ), 'none');

    -- 6. Client roles must not hold privileges RLS cannot mediate.
    --    TRUNCATE in particular is NOT filtered by row security.
    RETURN QUERY
    SELECT
        'no_rls_bypassing_grants_to_client_roles',
        NOT EXISTS (
            SELECT 1 FROM information_schema.role_table_grants
            WHERE table_schema='public'
              AND grantee IN ('anon','authenticated')
              AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')
              AND (table_name LIKE 'commander_home%' OR table_name LIKE 'home\_%')
        ),
        COALESCE((
            SELECT count(*)::text || ' offending grants'
            FROM information_schema.role_table_grants
            WHERE table_schema='public'
              AND grantee IN ('anon','authenticated')
              AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')
              AND (table_name LIKE 'commander_home%' OR table_name LIKE 'home\_%')
        ), '0');

    -- 7. Seat claiming must refuse cancelled games and waitlist self-promotion.
    RETURN QUERY
    SELECT
        'rpc_hg_claim_seat_guards',
        (SELECT p.prosrc LIKE '%GAME_NOT_ACTIVE%'
                AND p.prosrc LIKE '%WAITLISTED_CANNOT_SELF_SEAT%'
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='rpc_hg_claim_seat' LIMIT 1),
        'claim_seat must check parent game status and refuse to overwrite a host-set waitlist';

    -- 8. Every SECURITY DEFINER home function must pin search_path.
    --    An unpinned SECDEF function is a privilege-escalation vector.
    RETURN QUERY
    SELECT
        'secdef_home_functions_pin_search_path',
        NOT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.prosecdef
              AND (p.proname LIKE 'rpc_hg\_%' OR p.proname LIKE 'fn_home\_%' OR p.proname LIKE 'fn_hg\_%')
              AND NOT EXISTS (
                  SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
                  WHERE c LIKE 'search_path=%'
              )
        ),
        COALESCE((
            SELECT string_agg(p.proname, ', ')
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.prosecdef
              AND (p.proname LIKE 'rpc_hg\_%' OR p.proname LIKE 'fn_home\_%' OR p.proname LIKE 'fn_hg\_%')
              AND NOT EXISTS (
                  SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
                  WHERE c LIKE 'search_path=%'
              )
        ), 'all pinned');
END;
$function$


CREATE OR REPLACE FUNCTION public.verify_home_group_owner_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner_id uuid;
  v_owner_member_user_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM commander_home_groups
  WHERE id = COALESCE(NEW.group_id, OLD.group_id);

  IF v_owner_id IS NULL THEN RETURN NULL; END IF;

  SELECT user_id INTO v_owner_member_user_id
  FROM commander_home_members
  WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
    AND role = 'owner';

  IF v_owner_member_user_id IS NULL THEN
    RAISE EXCEPTION 'Home group % has no owner-member row. The creator '
      'must always be seated as role=owner.',
      COALESCE(NEW.group_id, OLD.group_id)
      USING ERRCODE = '23514';
  END IF;

  IF v_owner_member_user_id <> v_owner_id THEN
    RAISE EXCEPTION 'Home group % has mismatched ownership: owner_id=% but '
      'the role=owner member row belongs to user %.',
      COALESCE(NEW.group_id, OLD.group_id), v_owner_id, v_owner_member_user_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.vote_home_group_poll(p_poll_id uuid, p_caller_user_id uuid, p_option_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_poll RECORD; v_group RECORD;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    IF array_length(p_option_ids, 1) IS NULL OR array_length(p_option_ids, 1) = 0 THEN
        RAISE EXCEPTION 'NO_OPTIONS_SELECTED';
    END IF;
    IF array_length(p_option_ids, 1) > 50 THEN
        RAISE EXCEPTION 'TOO_MANY_OPTIONS' USING HINT = 'max 50 options per vote';
    END IF;

    SELECT * INTO v_poll FROM commander_home_polls WHERE id = p_poll_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'POLL_NOT_FOUND'; END IF;
    IF v_poll.is_closed OR (v_poll.closes_at IS NOT NULL AND v_poll.closes_at < NOW()) THEN
        RAISE EXCEPTION 'POLL_CLOSED';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_poll.group_id;

    IF v_group.owner_id <> p_caller_user_id
       AND NOT EXISTS (SELECT 1 FROM commander_home_members
                        WHERE group_id = v_poll.group_id AND user_id = p_caller_user_id
                          AND status = 'approved')
    THEN RAISE EXCEPTION 'NOT_A_MEMBER'; END IF;

    IF v_poll.poll_type = 'single_choice' AND array_length(p_option_ids, 1) > 1 THEN
        RAISE EXCEPTION 'SINGLE_CHOICE_ONE_ALLOWED';
    END IF;

    INSERT INTO commander_home_poll_votes (poll_id, user_id, option_ids)
    VALUES (p_poll_id, p_caller_user_id, p_option_ids)
    ON CONFLICT (poll_id, user_id) DO UPDATE
        SET option_ids = EXCLUDED.option_ids, updated_at = NOW();

    RETURN jsonb_build_object('success', true, 'poll_id', p_poll_id);
END;
$function$


CREATE OR REPLACE FUNCTION public.withdraw_home_group_promotion(p_group_id uuid, p_caller_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_group RECORD;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF v_group.owner_id <> p_caller_user_id THEN RAISE EXCEPTION 'OWNER_ONLY_ACTION'; END IF;

    UPDATE commander_home_group_promotion_requests
       SET status = 'withdrawn', reviewed_at = NOW()
     WHERE group_id = p_group_id AND status IN ('pending','reviewing');

    UPDATE commander_home_groups SET promotion_requested_at = NULL WHERE id = p_group_id;

    -- ★ NEW: audit log
    INSERT INTO public.commander_home_audit_log
      (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (p_group_id, p_caller_user_id, 'group', p_group_id, 'promotion_withdrawn',
            '{}'::jsonb);

    RETURN jsonb_build_object('success', true);
END;
$function$



-- POLICIES (98)

CREATE POLICY audit_log_deny_all_delete ON public.commander_home_audit_log AS PERMISSIVE FOR DELETE TO public USING (false);
CREATE POLICY audit_log_deny_all_insert ON public.commander_home_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (false);
CREATE POLICY audit_log_deny_all_select ON public.commander_home_audit_log AS PERMISSIVE FOR SELECT TO public USING (false);
CREATE POLICY audit_log_deny_all_update ON public.commander_home_audit_log AS PERMISSIVE FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY appeals_self_read ON public.commander_home_ban_appeals AS PERMISSIVE FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_reports_host_sees_group_content ON public.commander_home_content_reports AS PERMISSIVE FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND fn_home_is_group_staff(( SELECT auth.uid() AS uid),
CASE reported_type
    WHEN 'post'::text THEN ( SELECT commander_home_posts.group_id
       FROM commander_home_posts
      WHERE (commander_home_posts.id = commander_home_content_reports.reported_id))
    WHEN 'comment'::text THEN ( SELECT p.group_id
       FROM (commander_home_post_comments c
         JOIN commander_home_posts p ON ((p.id = c.post_id)))
      WHERE (c.id = commander_home_content_reports.reported_id))
    WHEN 'review'::text THEN ( SELECT g.group_id
       FROM (commander_home_game_reviews r
         JOIN commander_home_games g ON ((g.id = r.game_id)))
      WHERE (r.id = commander_home_content_reports.reported_id))
    WHEN 'game'::text THEN ( SELECT commander_home_games.group_id
       FROM commander_home_games
      WHERE (commander_home_games.id = commander_home_content_reports.reported_id))
    WHEN 'member'::text THEN ( SELECT commander_home_members.group_id
       FROM commander_home_members
      WHERE (commander_home_members.id = commander_home_content_reports.reported_id))
    ELSE NULL::uuid
END)));
CREATE POLICY home_reports_insert ON public.commander_home_content_reports AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((reporter_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_game_photos_delete ON public.commander_home_game_photos AS PERMISSIVE FOR DELETE TO authenticated USING (((uploader_id = ( SELECT auth.uid() AS uid)) OR (game_id IN ( SELECT g.id
   FROM (commander_home_games g
     JOIN commander_home_groups grp ON ((grp.id = g.group_id)))
  WHERE ((grp.owner_id = ( SELECT auth.uid() AS uid)) OR (g.group_id IN ( SELECT commander_home_members.group_id
           FROM commander_home_members
          WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = 'admin'::text) AND (commander_home_members.status = 'approved'::text)))))))));
CREATE POLICY home_game_photos_insert ON public.commander_home_game_photos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((uploader_id = ( SELECT auth.uid() AS uid)) AND (game_id IN ( SELECT g.id
   FROM (commander_home_games g
     JOIN commander_home_groups grp ON ((grp.id = g.group_id)))
  WHERE ((grp.owner_id = ( SELECT auth.uid() AS uid)) OR (g.group_id IN ( SELECT commander_home_members.group_id
           FROM commander_home_members
          WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text)))))))));
CREATE POLICY home_game_photos_select ON public.commander_home_game_photos AS PERMISSIVE FOR SELECT TO authenticated USING ((game_id IN ( SELECT g.id
   FROM (commander_home_games g
     JOIN commander_home_groups grp ON ((grp.id = g.group_id)))
  WHERE ((grp.owner_id = ( SELECT auth.uid() AS uid)) OR (NOT grp.is_private) OR (g.group_id IN ( SELECT commander_home_members.group_id
           FROM commander_home_members
          WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text))))))));
CREATE POLICY home_game_photos_update ON public.commander_home_game_photos AS PERMISSIVE FOR UPDATE TO authenticated USING (((uploader_id = ( SELECT auth.uid() AS uid)) OR (game_id IN ( SELECT g.id
   FROM (commander_home_games g
     JOIN commander_home_groups grp ON ((grp.id = g.group_id)))
  WHERE (grp.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY home_game_reviews_delete ON public.commander_home_game_reviews AS PERMISSIVE FOR DELETE TO authenticated USING ((reviewer_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_game_reviews_insert ON public.commander_home_game_reviews AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((reviewer_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM commander_home_games g
  WHERE ((g.id = commander_home_game_reviews.game_id) AND (g.status = 'completed'::text) AND (g.host_id <> ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM commander_home_rsvps r
  WHERE ((r.game_id = commander_home_game_reviews.game_id) AND (r.user_id = ( SELECT auth.uid() AS uid)) AND (r.response = 'yes'::text) AND (r.checked_in_at IS NOT NULL))))));
CREATE POLICY home_game_reviews_select ON public.commander_home_game_reviews AS PERMISSIVE FOR SELECT TO public USING ((((reviewer_id = ( SELECT auth.uid() AS uid)) OR (game_id IN ( SELECT commander_home_games.id
   FROM commander_home_games
  WHERE (commander_home_games.host_id = ( SELECT auth.uid() AS uid)))) OR (game_id IN ( SELECT hg.id
   FROM (commander_home_games hg
     JOIN commander_home_groups g ON ((g.id = hg.group_id)))
  WHERE (g.owner_id = ( SELECT auth.uid() AS uid)))) OR (game_id IN ( SELECT hg.id
   FROM (commander_home_games hg
     JOIN commander_home_members m ON ((m.group_id = hg.group_id)))
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'approved'::text))))) AND ((COALESCE(is_hidden, false) = false) OR (reviewer_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM commander_home_games hg
  WHERE ((hg.id = commander_home_game_reviews.game_id) AND fn_home_is_group_staff(( SELECT auth.uid() AS uid), hg.group_id)))))));
CREATE POLICY home_game_reviews_update ON public.commander_home_game_reviews AS PERMISSIVE FOR UPDATE TO authenticated USING ((reviewer_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((reviewer_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_game_tables_delete ON public.commander_home_game_tables AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM commander_home_games g
  WHERE ((g.id = commander_home_game_tables.game_id) AND ((g.host_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), g.group_id))))));
CREATE POLICY home_game_tables_insert ON public.commander_home_game_tables AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM commander_home_games g
  WHERE ((g.id = commander_home_game_tables.game_id) AND ((g.host_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), g.group_id))))));
CREATE POLICY home_game_tables_select ON public.commander_home_game_tables AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commander_home_games g
  WHERE ((g.id = commander_home_game_tables.game_id) AND ((g.group_id IN ( SELECT m.group_id
           FROM commander_home_members m
          WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'approved'::text)))) OR (g.group_id IN ( SELECT gr.id
           FROM commander_home_groups gr
          WHERE (gr.owner_id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY home_game_tables_update ON public.commander_home_game_tables AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM commander_home_games g
  WHERE ((g.id = commander_home_game_tables.game_id) AND ((g.host_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), g.group_id))))));
CREATE POLICY home_templates_host_delete ON public.commander_home_game_templates AS PERMISSIVE FOR DELETE TO authenticated USING ((group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY home_templates_host_insert ON public.commander_home_game_templates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY home_templates_host_select ON public.commander_home_game_templates AS PERMISSIVE FOR SELECT TO authenticated USING (((group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY home_templates_host_update ON public.commander_home_game_templates AS PERMISSIVE FOR UPDATE TO authenticated USING ((group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY home_games_delete ON public.commander_home_games AS PERMISSIVE FOR DELETE TO public USING (((host_id = ( SELECT auth.uid() AS uid)) OR (group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY home_games_insert ON public.commander_home_games AS PERMISSIVE FOR INSERT TO public WITH CHECK (((fn_home_is_group_staff(( SELECT auth.uid() AS uid), group_id) OR (EXISTS ( SELECT 1
   FROM commander_home_members m
  WHERE ((m.group_id = commander_home_games.group_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'approved'::text))))) AND (fn_home_is_group_staff(( SELECT auth.uid() AS uid), group_id) OR (host_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY home_games_select ON public.commander_home_games AS PERMISSIVE FOR SELECT TO public USING (((group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text)))) OR (group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY home_games_update ON public.commander_home_games AS PERMISSIVE FOR UPDATE TO public USING (((host_id = ( SELECT auth.uid() AS uid)) OR (group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY home_follows_delete_own ON public.commander_home_group_follows AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_follows_select_own ON public.commander_home_group_follows AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_follows_update_own ON public.commander_home_group_follows AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_group_follows_insert ON public.commander_home_group_follows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND ((EXISTS ( SELECT 1
   FROM commander_home_groups g
  WHERE ((g.id = commander_home_group_follows.group_id) AND (g.is_private = false)))) OR (EXISTS ( SELECT 1
   FROM commander_home_groups g
  WHERE ((g.id = commander_home_group_follows.group_id) AND (g.owner_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM commander_home_members m
  WHERE ((m.group_id = commander_home_group_follows.group_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'approved'::text)))))));
CREATE POLICY home_promo_insert ON public.commander_home_group_promotion_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((requested_by = ( SELECT auth.uid() AS uid)) AND (group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY home_promo_select ON public.commander_home_group_promotion_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((requested_by = ( SELECT auth.uid() AS uid)) OR (group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY share_log_insert_authenticated ON public.commander_home_group_share_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY share_log_read_own ON public.commander_home_group_share_log AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = caller_uid));
CREATE POLICY view_log_insert_authenticated ON public.commander_home_group_view_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY view_log_read_own ON public.commander_home_group_view_log AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = caller_uid));
CREATE POLICY home_snapshots_host_select ON public.commander_home_group_weekly_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (((group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = ANY (ARRAY['admin'::text, 'owner'::text])) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY home_groups_delete ON public.commander_home_groups AS PERMISSIVE FOR DELETE TO public USING ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_groups_insert ON public.commander_home_groups AS PERMISSIVE FOR INSERT TO public WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_groups_select ON public.commander_home_groups AS PERMISSIVE FOR SELECT TO public USING (((NOT is_private) OR (owner_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY home_groups_update ON public.commander_home_groups AS PERMISSIVE FOR UPDATE TO public USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY home_invite_tokens_select ON public.commander_home_invite_tokens AS PERMISSIVE FOR SELECT TO authenticated USING (((group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = 'admin'::text) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY join_attempts_insert_authenticated ON public.commander_home_join_attempts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY join_attempts_read_own ON public.commander_home_join_attempts AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY home_members_delete ON public.commander_home_members AS PERMISSIVE FOR DELETE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), group_id)));
CREATE POLICY home_members_host_sees_group ON public.commander_home_members AS PERMISSIVE FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), group_id)));
CREATE POLICY home_members_insert ON public.commander_home_members AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), group_id)));
CREATE POLICY home_members_update ON public.commander_home_members AS PERMISSIVE FOR UPDATE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), group_id))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), group_id)));
CREATE POLICY home_poll_votes_delete ON public.commander_home_poll_votes AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_poll_votes_insert ON public.commander_home_poll_votes AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (poll_id IN ( SELECT pl.id
   FROM (commander_home_polls pl
     JOIN commander_home_groups gr ON ((gr.id = pl.group_id)))
  WHERE ((gr.owner_id = ( SELECT auth.uid() AS uid)) OR (pl.group_id IN ( SELECT m.group_id
           FROM commander_home_members m
          WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'approved'::text)))))))));
CREATE POLICY home_poll_votes_select ON public.commander_home_poll_votes AS PERMISSIVE FOR SELECT TO authenticated USING ((poll_id IN ( SELECT commander_home_polls.id
   FROM commander_home_polls
  WHERE ((commander_home_polls.group_id IN ( SELECT commander_home_groups.id
           FROM commander_home_groups
          WHERE ((commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)) OR (NOT commander_home_groups.is_private)))) OR (commander_home_polls.group_id IN ( SELECT commander_home_members.group_id
           FROM commander_home_members
          WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text))))))));
CREATE POLICY home_poll_votes_update ON public.commander_home_poll_votes AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_polls_insert ON public.commander_home_polls AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND ((group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = ANY (ARRAY['admin'::text, 'member'::text])) AND (commander_home_members.status = 'approved'::text)))))));
CREATE POLICY home_polls_select ON public.commander_home_polls AS PERMISSIVE FOR SELECT TO authenticated USING (((group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE ((commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)) OR (NOT commander_home_groups.is_private)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY home_polls_update ON public.commander_home_polls AS PERMISSIVE FOR UPDATE TO authenticated USING (((created_by = ( SELECT auth.uid() AS uid)) OR (group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = 'admin'::text) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY home_post_comments_delete ON public.commander_home_post_comments AS PERMISSIVE FOR DELETE TO authenticated USING (((author_id = ( SELECT auth.uid() AS uid)) OR (post_id IN ( SELECT p.id
   FROM (commander_home_posts p
     JOIN commander_home_groups g ON ((g.id = p.group_id)))
  WHERE ((g.owner_id = ( SELECT auth.uid() AS uid)) OR (p.group_id IN ( SELECT commander_home_members.group_id
           FROM commander_home_members
          WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = 'admin'::text) AND (commander_home_members.status = 'approved'::text)))))))));
CREATE POLICY home_post_comments_insert ON public.commander_home_post_comments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (post_id IN ( SELECT p.id
   FROM (commander_home_posts p
     JOIN commander_home_groups g ON ((g.id = p.group_id)))
  WHERE ((g.owner_id = ( SELECT auth.uid() AS uid)) OR (p.group_id IN ( SELECT commander_home_members.group_id
           FROM commander_home_members
          WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text)))))))));
CREATE POLICY home_post_comments_select ON public.commander_home_post_comments AS PERMISSIVE FOR SELECT TO public USING (((post_id IN ( SELECT p.id
   FROM (commander_home_posts p
     JOIN commander_home_groups g ON ((g.id = p.group_id)))
  WHERE ((g.owner_id = ( SELECT auth.uid() AS uid)) OR (NOT g.is_private) OR (p.group_id IN ( SELECT commander_home_members.group_id
           FROM commander_home_members
          WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text))))))) AND ((COALESCE(is_hidden, false) = false) OR (author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM commander_home_posts p
  WHERE ((p.id = commander_home_post_comments.post_id) AND fn_home_is_group_staff(( SELECT auth.uid() AS uid), p.group_id)))))));
CREATE POLICY home_post_comments_update ON public.commander_home_post_comments AS PERMISSIVE FOR UPDATE TO authenticated USING ((author_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_post_likes_delete ON public.commander_home_post_likes AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_post_likes_insert ON public.commander_home_post_likes AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (post_id IN ( SELECT p.id
   FROM (commander_home_posts p
     JOIN commander_home_groups gr ON ((gr.id = p.group_id)))
  WHERE (((NOT gr.is_private) AND (p.visible_to = 'public'::text)) OR (gr.owner_id = ( SELECT auth.uid() AS uid)) OR (p.group_id IN ( SELECT m.group_id
           FROM commander_home_members m
          WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'approved'::text)))))))));
CREATE POLICY home_post_likes_select ON public.commander_home_post_likes AS PERMISSIVE FOR SELECT TO authenticated USING ((post_id IN ( SELECT p.id
   FROM (commander_home_posts p
     JOIN commander_home_groups g ON ((g.id = p.group_id)))
  WHERE ((g.owner_id = ( SELECT auth.uid() AS uid)) OR (NOT g.is_private) OR (p.group_id IN ( SELECT commander_home_members.group_id
           FROM commander_home_members
          WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text))))))));
CREATE POLICY home_posts_delete ON public.commander_home_posts AS PERMISSIVE FOR DELETE TO authenticated USING (((author_id = ( SELECT auth.uid() AS uid)) OR (group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = 'admin'::text) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY home_posts_insert ON public.commander_home_posts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND ((group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text)))))));
CREATE POLICY home_posts_select ON public.commander_home_posts AS PERMISSIVE FOR SELECT TO public USING ((((group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE ((commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)) OR (NOT commander_home_groups.is_private)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text))))) AND ((COALESCE(is_hidden, false) = false) OR (author_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), group_id))));
CREATE POLICY home_posts_update ON public.commander_home_posts AS PERMISSIVE FOR UPDATE TO authenticated USING (((author_id = ( SELECT auth.uid() AS uid)) OR (group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = 'admin'::text) AND (commander_home_members.status = 'approved'::text)))))) WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) OR (group_id IN ( SELECT commander_home_groups.id
   FROM commander_home_groups
  WHERE (commander_home_groups.owner_id = ( SELECT auth.uid() AS uid)))) OR (group_id IN ( SELECT commander_home_members.group_id
   FROM commander_home_members
  WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.role = 'admin'::text) AND (commander_home_members.status = 'approved'::text))))));
CREATE POLICY home_rsvps_delete ON public.commander_home_rsvps AS PERMISSIVE FOR DELETE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY home_rsvps_insert ON public.commander_home_rsvps AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (game_id IN ( SELECT g.id
   FROM (commander_home_games g
     JOIN commander_home_groups gr ON ((gr.id = g.group_id)))
  WHERE ((NOT gr.is_private) OR (gr.owner_id = ( SELECT auth.uid() AS uid)) OR (g.group_id IN ( SELECT m.group_id
           FROM commander_home_members m
          WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'approved'::text)))))))));
CREATE POLICY home_rsvps_select ON public.commander_home_rsvps AS PERMISSIVE FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (game_id IN ( SELECT commander_home_games.id
   FROM commander_home_games
  WHERE (commander_home_games.host_id = ( SELECT auth.uid() AS uid)))) OR (game_id IN ( SELECT commander_home_games.id
   FROM commander_home_games
  WHERE (commander_home_games.group_id IN ( SELECT commander_home_members.group_id
           FROM commander_home_members
          WHERE ((commander_home_members.user_id = ( SELECT auth.uid() AS uid)) AND (commander_home_members.status = 'approved'::text))))))));
CREATE POLICY home_rsvps_update ON public.commander_home_rsvps AS PERMISSIVE FOR UPDATE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (game_id IN ( SELECT commander_home_games.id
   FROM commander_home_games
  WHERE (commander_home_games.host_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY home_seat_reservations_insert ON public.commander_home_seat_reservations AS PERMISSIVE FOR INSERT TO public WITH CHECK (((claimed_by_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (commander_home_game_tables t
     JOIN commander_home_games g ON ((g.id = t.game_id)))
  WHERE ((t.id = commander_home_seat_reservations.table_id) AND (fn_home_is_group_staff(( SELECT auth.uid() AS uid), g.group_id) OR (g.host_id = ( SELECT auth.uid() AS uid)) OR ((EXISTS ( SELECT 1
           FROM commander_home_members m
          WHERE ((m.group_id = g.group_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'approved'::text)))) AND (((commander_home_seat_reservations.is_guest = false) AND (commander_home_seat_reservations.user_id = ( SELECT auth.uid() AS uid))) OR ((commander_home_seat_reservations.is_guest = true) AND (commander_home_seat_reservations.user_id IS NULL) AND (commander_home_seat_reservations.guest_name IS NOT NULL))))))))));
CREATE POLICY home_seat_reservations_select ON public.commander_home_seat_reservations AS PERMISSIVE FOR SELECT TO public USING (((( SELECT auth.uid() AS uid) = claimed_by_user_id) OR (( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM (commander_home_game_tables t
     JOIN commander_home_games g ON ((g.id = t.game_id)))
  WHERE ((t.id = commander_home_seat_reservations.table_id) AND ((g.group_id IN ( SELECT m.group_id
           FROM commander_home_members m
          WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'approved'::text)))) OR (g.group_id IN ( SELECT gr.id
           FROM commander_home_groups gr
          WHERE (gr.owner_id = ( SELECT auth.uid() AS uid))))))))));
CREATE POLICY home_seat_reservations_update ON public.commander_home_seat_reservations AS PERMISSIVE FOR UPDATE TO public USING (((( SELECT auth.uid() AS uid) = claimed_by_user_id) OR (( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM (commander_home_game_tables t
     JOIN commander_home_games g ON ((g.id = t.game_id)))
  WHERE ((t.id = commander_home_seat_reservations.table_id) AND ((g.host_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), g.group_id)))))));
CREATE POLICY home_seats_delete ON public.commander_home_seats AS PERMISSIVE FOR DELETE TO public USING (((game_id IN ( SELECT commander_home_games.id
   FROM commander_home_games
  WHERE (commander_home_games.host_id = ( SELECT auth.uid() AS uid)))) OR (game_id IN ( SELECT hg.id
   FROM (commander_home_games hg
     JOIN commander_home_groups g ON ((g.id = hg.group_id)))
  WHERE (g.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY home_seats_insert ON public.commander_home_seats AS PERMISSIVE FOR INSERT TO public WITH CHECK (((game_id IN ( SELECT commander_home_games.id
   FROM commander_home_games
  WHERE (commander_home_games.host_id = ( SELECT auth.uid() AS uid)))) OR (game_id IN ( SELECT hg.id
   FROM (commander_home_games hg
     JOIN commander_home_groups g ON ((g.id = hg.group_id)))
  WHERE (g.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY home_seats_select ON public.commander_home_seats AS PERMISSIVE FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (game_id IN ( SELECT commander_home_games.id
   FROM commander_home_games
  WHERE (commander_home_games.host_id = ( SELECT auth.uid() AS uid)))) OR (game_id IN ( SELECT hg.id
   FROM (commander_home_games hg
     JOIN commander_home_groups g ON ((g.id = hg.group_id)))
  WHERE (g.owner_id = ( SELECT auth.uid() AS uid)))) OR (game_id IN ( SELECT hg.id
   FROM (commander_home_games hg
     JOIN commander_home_members m ON ((m.group_id = hg.group_id)))
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'approved'::text))))));
CREATE POLICY home_seats_update ON public.commander_home_seats AS PERMISSIVE FOR UPDATE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (game_id IN ( SELECT commander_home_games.id
   FROM commander_home_games
  WHERE (commander_home_games.host_id = ( SELECT auth.uid() AS uid)))) OR (game_id IN ( SELECT hg.id
   FROM (commander_home_games hg
     JOIN commander_home_groups g ON ((g.id = hg.group_id)))
  WHERE (g.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Authenticated users can vouch" ON public.home_game_vouches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can remove own vouch" ON public.home_game_vouches AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY home_game_vouches_read ON public.home_game_vouches AS PERMISSIVE FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR fn_home_is_group_staff(( SELECT auth.uid() AS uid), group_id) OR (EXISTS ( SELECT 1
   FROM commander_home_groups g
  WHERE ((g.id = home_game_vouches.group_id) AND (COALESCE(g.is_private, false) = false))))));
CREATE POLICY comment_likes_delete ON public.social_page_comment_likes AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY comment_likes_insert ON public.social_page_comment_likes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY comment_likes_select ON public.social_page_comment_likes AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY social_page_followers_read ON public.social_page_followers AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY social_page_followers_write ON public.social_page_followers AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY social_page_post_comments_read ON public.social_page_post_comments AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY social_page_post_comments_write ON public.social_page_post_comments AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY social_page_post_likes_read ON public.social_page_post_likes AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY social_page_post_likes_write ON public.social_page_post_likes AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY social_page_posts_read ON public.social_page_posts AS PERMISSIVE FOR SELECT TO public USING (((author_id = ( SELECT auth.uid() AS uid)) OR ((COALESCE(is_approved, false) = true) AND (COALESCE(visibility, 'public'::text) = 'public'::text) AND (EXISTS ( SELECT 1
   FROM social_pages sp
  WHERE (sp.id = social_page_posts.page_id))))));
CREATE POLICY social_page_posts_write ON public.social_page_posts AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT auth.uid() AS uid) = author_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = author_id));
CREATE POLICY "Admins view reports" ON public.social_page_reports AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::text)))));
CREATE POLICY social_page_reports_insert_self ON public.social_page_reports AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = reporter_id));
CREATE POLICY social_page_reviews_read ON public.social_page_reviews AS PERMISSIVE FOR SELECT TO public USING (((reviewer_id = ( SELECT auth.uid() AS uid)) OR ((COALESCE(is_published, false) = true) AND (EXISTS ( SELECT 1
   FROM social_pages sp
  WHERE (sp.id = social_page_reviews.page_id))))));
CREATE POLICY social_page_reviews_write ON public.social_page_reviews AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT auth.uid() AS uid) = reviewer_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = reviewer_id));
CREATE POLICY social_pages_owner_write ON public.social_pages AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY social_pages_read ON public.social_pages AS PERMISSIVE FOR SELECT TO public USING (((COALESCE(is_public, false) = true) OR (owner_id = ( SELECT auth.uid() AS uid))));


-- INDEXES (144)

CREATE UNIQUE INDEX commander_home_audit_log_pkey ON public.commander_home_audit_log USING btree (id);
CREATE INDEX idx_home_audit_actor ON public.commander_home_audit_log USING btree (actor_id, created_at DESC);
CREATE INDEX idx_home_audit_group ON public.commander_home_audit_log USING btree (group_id, created_at DESC);
CREATE INDEX idx_home_audit_target ON public.commander_home_audit_log USING btree (target_type, target_id);
CREATE UNIQUE INDEX commander_home_ban_appeals_pkey ON public.commander_home_ban_appeals USING btree (id);
CREATE INDEX idx_commander_home_ban_appeals_member_id ON public.commander_home_ban_appeals USING btree (member_id);
CREATE INDEX idx_commander_home_ban_appeals_open ON public.commander_home_ban_appeals USING btree (status, created_at DESC) WHERE (status = 'pending'::text);
CREATE INDEX idx_commander_home_ban_appeals_reviewed_by ON public.commander_home_ban_appeals USING btree (reviewed_by);
CREATE INDEX idx_commander_home_ban_appeals_user_id ON public.commander_home_ban_appeals USING btree (user_id);
CREATE UNIQUE INDEX uq_commander_home_ban_appeals_open_per_user ON public.commander_home_ban_appeals USING btree (group_id, user_id) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX commander_home_content_reports_pkey ON public.commander_home_content_reports USING btree (id);
CREATE INDEX idx_commander_home_content_reports_content_author_id ON public.commander_home_content_reports USING btree (content_author_id);
CREATE INDEX idx_commander_home_content_reports_reviewed_by ON public.commander_home_content_reports USING btree (reviewed_by);
CREATE INDEX idx_home_reports_reporter ON public.commander_home_content_reports USING btree (reporter_id);
CREATE INDEX idx_home_reports_status ON public.commander_home_content_reports USING btree (status, created_at DESC);
CREATE INDEX idx_home_reports_target ON public.commander_home_content_reports USING btree (reported_type, reported_id);
CREATE UNIQUE INDEX uq_home_reports_pending_per_target ON public.commander_home_content_reports USING btree (reporter_id, reported_type, reported_id) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX commander_home_game_photos_pkey ON public.commander_home_game_photos USING btree (id);
CREATE INDEX idx_commander_home_game_photos_hidden_by ON public.commander_home_game_photos USING btree (hidden_by);
CREATE INDEX idx_commander_home_game_photos_uploader_id ON public.commander_home_game_photos USING btree (uploader_id);
CREATE INDEX idx_home_game_photos_game ON public.commander_home_game_photos USING btree (game_id, created_at DESC);
CREATE UNIQUE INDEX commander_home_game_reviews_game_id_reviewer_id_key ON public.commander_home_game_reviews USING btree (game_id, reviewer_id);
CREATE UNIQUE INDEX commander_home_game_reviews_pkey ON public.commander_home_game_reviews USING btree (id);
CREATE INDEX idx_commander_home_game_reviews_hidden_by ON public.commander_home_game_reviews USING btree (hidden_by);
CREATE INDEX idx_commander_home_game_reviews_reviewer_id ON public.commander_home_game_reviews USING btree (reviewer_id);
CREATE INDEX idx_commander_home_game_reviews_visible ON public.commander_home_game_reviews USING btree (game_id, created_at DESC) WHERE (is_hidden = false);
CREATE UNIQUE INDEX commander_home_game_tables_number_per_game ON public.commander_home_game_tables USING btree (game_id, table_number);
CREATE UNIQUE INDEX commander_home_game_tables_one_default_per_game ON public.commander_home_game_tables USING btree (game_id) WHERE (is_default = true);
CREATE UNIQUE INDEX commander_home_game_tables_pkey ON public.commander_home_game_tables USING btree (id);
CREATE INDEX commander_home_game_tables_status_idx ON public.commander_home_game_tables USING btree (status) WHERE (status = ANY (ARRAY['open_for_rsvp'::text, 'running'::text]));
CREATE INDEX idx_commander_home_game_tables_created_by ON public.commander_home_game_tables USING btree (created_by);
CREATE UNIQUE INDEX commander_home_game_templates_pkey ON public.commander_home_game_templates USING btree (id);
CREATE INDEX idx_commander_home_game_templates_created_by ON public.commander_home_game_templates USING btree (created_by);
CREATE INDEX idx_home_templates_group ON public.commander_home_game_templates USING btree (group_id, is_default DESC, created_at DESC);
CREATE UNIQUE INDEX uq_home_templates_single_default ON public.commander_home_game_templates USING btree (group_id) WHERE (is_default = true);
CREATE INDEX commander_home_games_group_format_date_idx ON public.commander_home_games USING btree (group_id, format, scheduled_date) WHERE (format = 'tournament'::text);
CREATE UNIQUE INDEX commander_home_games_pkey ON public.commander_home_games USING btree (id);
CREATE INDEX idx_commander_home_games_cancelled_by ON public.commander_home_games USING btree (cancelled_by);
CREATE INDEX idx_commander_home_games_format_date ON public.commander_home_games USING btree (format, scheduled_date) WHERE (format = 'tournament'::text);
CREATE INDEX idx_commander_home_games_group_scheduled ON public.commander_home_games USING btree (group_id, scheduled_date DESC, start_time DESC);
CREATE INDEX idx_home_games_by_group_date ON public.commander_home_games USING btree (group_id, scheduled_date);
CREATE INDEX idx_home_games_date ON public.commander_home_games USING btree (scheduled_date);
CREATE INDEX idx_home_games_geo ON public.commander_home_games USING btree (approximate_lat, approximate_lng) WHERE ((approximate_lat IS NOT NULL) AND (approximate_lng IS NOT NULL));
CREATE INDEX idx_home_games_group ON public.commander_home_games USING btree (group_id, status);
CREATE INDEX idx_home_games_host ON public.commander_home_games USING btree (host_id);
CREATE INDEX idx_home_games_social_page ON public.commander_home_games USING btree (social_page_id) WHERE (social_page_id IS NOT NULL);
CREATE UNIQUE INDEX uq_commander_home_games_one_active_per_group_per_date ON public.commander_home_games USING btree (group_id, scheduled_date) WHERE (status IS DISTINCT FROM 'cancelled'::text);
CREATE UNIQUE INDEX commander_home_group_follows_group_id_user_id_key ON public.commander_home_group_follows USING btree (group_id, user_id);
CREATE UNIQUE INDEX commander_home_group_follows_pkey ON public.commander_home_group_follows USING btree (id);
CREATE INDEX idx_home_follows_group ON public.commander_home_group_follows USING btree (group_id);
CREATE INDEX idx_home_follows_user ON public.commander_home_group_follows USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX commander_home_group_promotion_requests_group_id_key ON public.commander_home_group_promotion_requests USING btree (group_id);
CREATE UNIQUE INDEX commander_home_group_promotion_requests_pkey ON public.commander_home_group_promotion_requests USING btree (id);
CREATE INDEX idx_commander_home_group_promotion_requests_requested_by ON public.commander_home_group_promotion_requests USING btree (requested_by);
CREATE INDEX idx_commander_home_group_promotion_requests_reviewer_id ON public.commander_home_group_promotion_requests USING btree (reviewer_id);
CREATE INDEX idx_home_promo_status ON public.commander_home_group_promotion_requests USING btree (status, requested_at);
CREATE UNIQUE INDEX commander_home_group_share_log_pkey ON public.commander_home_group_share_log USING btree (id);
CREATE INDEX idx_home_share_log_caller ON public.commander_home_group_share_log USING btree (group_id, caller_uid, token_id, inserted_at DESC) WHERE (caller_uid IS NOT NULL);
CREATE INDEX idx_home_share_log_recent ON public.commander_home_group_share_log USING btree (group_id, inserted_at DESC);
CREATE UNIQUE INDEX commander_home_group_view_log_pkey ON public.commander_home_group_view_log USING btree (id);
CREATE INDEX idx_home_view_log_caller ON public.commander_home_group_view_log USING btree (group_id, caller_uid, inserted_at DESC) WHERE (caller_uid IS NOT NULL);
CREATE INDEX idx_home_view_log_recent ON public.commander_home_group_view_log USING btree (group_id, inserted_at DESC);
CREATE UNIQUE INDEX commander_home_group_weekly_snapshots_group_id_week_start_key ON public.commander_home_group_weekly_snapshots USING btree (group_id, week_start);
CREATE UNIQUE INDEX commander_home_group_weekly_snapshots_pkey ON public.commander_home_group_weekly_snapshots USING btree (id);
CREATE UNIQUE INDEX commander_home_groups_club_code_key ON public.commander_home_groups USING btree (club_code);
CREATE UNIQUE INDEX commander_home_groups_invite_code_key ON public.commander_home_groups USING btree (invite_code);
CREATE UNIQUE INDEX commander_home_groups_pkey ON public.commander_home_groups USING btree (id);
CREATE INDEX idx_home_groups_active ON public.commander_home_groups USING btree (is_active);
CREATE INDEX idx_home_groups_conv ON public.commander_home_groups USING btree (messenger_conversation_id);
CREATE INDEX idx_home_groups_discoverable ON public.commander_home_groups USING btree (last_activity_at DESC, created_at DESC) WHERE ((is_private = false) AND (is_active = true));
CREATE INDEX idx_home_groups_location ON public.commander_home_groups USING btree (city, state);
CREATE INDEX idx_home_groups_location_geog ON public.commander_home_groups USING gist (location_geog);
CREATE INDEX idx_home_groups_owner ON public.commander_home_groups USING btree (owner_id);
CREATE INDEX idx_home_groups_public_activity ON public.commander_home_groups USING btree (last_activity_at) WHERE ((is_private = false) AND (is_active = true));
CREATE INDEX idx_home_groups_public_discover ON public.commander_home_groups USING btree (is_active, is_private, state, city, updated_at DESC);
CREATE INDEX idx_home_groups_quality_score ON public.commander_home_groups USING btree (quality_score DESC NULLS LAST) WHERE ((is_active = true) AND (NOT is_private));
CREATE INDEX idx_home_groups_tags ON public.commander_home_groups USING gin (tags);
CREATE INDEX idx_home_groups_vitality ON public.commander_home_groups USING btree (vitality_score DESC NULLS LAST) WHERE (is_active = true);
CREATE UNIQUE INDEX commander_home_invite_tokens_pkey ON public.commander_home_invite_tokens USING btree (id);
CREATE UNIQUE INDEX commander_home_invite_tokens_token_key ON public.commander_home_invite_tokens USING btree (token);
CREATE INDEX idx_commander_home_invite_tokens_created_by ON public.commander_home_invite_tokens USING btree (created_by);
CREATE INDEX idx_home_invite_tokens_group ON public.commander_home_invite_tokens USING btree (group_id);
CREATE UNIQUE INDEX commander_home_join_attempts_pkey ON public.commander_home_join_attempts USING btree (id);
CREATE INDEX idx_commander_home_join_attempts_group_id ON public.commander_home_join_attempts USING btree (group_id);
CREATE INDEX ix_home_join_attempts_ratelimit ON public.commander_home_join_attempts USING btree (user_id, attempted_at DESC);
CREATE UNIQUE INDEX commander_home_members_group_user_unique_active ON public.commander_home_members USING btree (group_id, user_id) WHERE (user_id IS NOT NULL);
CREATE UNIQUE INDEX commander_home_members_pkey ON public.commander_home_members USING btree (id);
CREATE INDEX commander_home_members_roster_by_name ON public.commander_home_members USING btree (group_id, display_name) WHERE (is_roster_only = true);
CREATE INDEX idx_commander_home_members_added_by_user_id ON public.commander_home_members USING btree (added_by_user_id);
CREATE INDEX idx_commander_home_members_banned_by ON public.commander_home_members USING btree (banned_by);
CREATE INDEX idx_commander_home_members_invited_by ON public.commander_home_members USING btree (invited_by);
CREATE INDEX idx_home_members_group ON public.commander_home_members USING btree (group_id, status);
CREATE INDEX idx_home_members_status ON public.commander_home_members USING btree (status);
CREATE INDEX idx_home_members_user ON public.commander_home_members USING btree (user_id, status);
CREATE UNIQUE INDEX uq_commander_home_members_one_owner_per_group ON public.commander_home_members USING btree (group_id) WHERE (role = 'owner'::text);
CREATE UNIQUE INDEX commander_home_poll_votes_pkey ON public.commander_home_poll_votes USING btree (id);
CREATE UNIQUE INDEX commander_home_poll_votes_poll_id_user_id_key ON public.commander_home_poll_votes USING btree (poll_id, user_id);
CREATE INDEX idx_commander_home_poll_votes_user_id ON public.commander_home_poll_votes USING btree (user_id);
CREATE INDEX idx_home_poll_votes_poll ON public.commander_home_poll_votes USING btree (poll_id);
CREATE UNIQUE INDEX commander_home_polls_pkey ON public.commander_home_polls USING btree (id);
CREATE INDEX idx_commander_home_polls_created_by ON public.commander_home_polls USING btree (created_by);
CREATE INDEX idx_home_polls_group ON public.commander_home_polls USING btree (group_id, created_at DESC);
CREATE UNIQUE INDEX commander_home_post_comments_pkey ON public.commander_home_post_comments USING btree (id);
CREATE INDEX idx_commander_home_post_comments_hidden_by ON public.commander_home_post_comments USING btree (hidden_by);
CREATE INDEX idx_home_post_comments_author ON public.commander_home_post_comments USING btree (author_id);
CREATE INDEX idx_home_post_comments_post ON public.commander_home_post_comments USING btree (post_id, created_at);
CREATE UNIQUE INDEX commander_home_post_likes_pkey ON public.commander_home_post_likes USING btree (id);
CREATE UNIQUE INDEX commander_home_post_likes_post_id_user_id_key ON public.commander_home_post_likes USING btree (post_id, user_id);
CREATE INDEX idx_home_post_likes_post ON public.commander_home_post_likes USING btree (post_id);
CREATE INDEX idx_home_post_likes_user ON public.commander_home_post_likes USING btree (user_id);
CREATE UNIQUE INDEX commander_home_posts_pkey ON public.commander_home_posts USING btree (id);
CREATE INDEX idx_commander_home_posts_hidden_by ON public.commander_home_posts USING btree (hidden_by);
CREATE INDEX idx_commander_home_posts_welcome_user_id ON public.commander_home_posts USING btree (((data ->> 'welcome_user_id'::text))) WHERE (post_type = 'announcement'::text);
CREATE INDEX idx_home_posts_author ON public.commander_home_posts USING btree (author_id);
CREATE INDEX idx_home_posts_group ON public.commander_home_posts USING btree (group_id, created_at DESC);
CREATE INDEX idx_home_posts_pinned ON public.commander_home_posts USING btree (group_id, is_pinned DESC, created_at DESC);
CREATE UNIQUE INDEX commander_home_rsvps_game_id_user_id_key ON public.commander_home_rsvps USING btree (game_id, user_id);
CREATE UNIQUE INDEX commander_home_rsvps_pkey ON public.commander_home_rsvps USING btree (id);
CREATE INDEX idx_commander_home_rsvps_checked_in_by ON public.commander_home_rsvps USING btree (checked_in_by);
CREATE INDEX idx_home_rsvps_game ON public.commander_home_rsvps USING btree (game_id, response);
CREATE INDEX idx_home_rsvps_user ON public.commander_home_rsvps USING btree (user_id);
CREATE UNIQUE INDEX commander_home_seat_reservations_one_guest_per_user_per_table ON public.commander_home_seat_reservations USING btree (table_id, claimed_by_user_id) WHERE ((is_guest = true) AND (status = ANY (ARRAY['reserved'::text, 'seated'::text])));
CREATE UNIQUE INDEX commander_home_seat_reservations_pkey ON public.commander_home_seat_reservations USING btree (id);
CREATE UNIQUE INDEX commander_home_seat_reservations_seat_lock ON public.commander_home_seat_reservations USING btree (table_id, seat_number) WHERE (status = ANY (ARRAY['reserved'::text, 'seated'::text]));
CREATE INDEX commander_home_seat_reservations_table_id_idx ON public.commander_home_seat_reservations USING btree (table_id);
CREATE INDEX commander_home_seat_reservations_user_id_idx ON public.commander_home_seat_reservations USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE UNIQUE INDEX commander_home_seat_reservations_user_table_active ON public.commander_home_seat_reservations USING btree (table_id, user_id) WHERE ((status = ANY (ARRAY['reserved'::text, 'seated'::text])) AND (user_id IS NOT NULL) AND (is_guest = false));
CREATE INDEX idx_commander_home_seat_reservations_claimed_by ON public.commander_home_seat_reservations USING btree (claimed_by_user_id) WHERE (claimed_by_user_id IS NOT NULL);
CREATE INDEX idx_commander_home_seat_reservations_member_id ON public.commander_home_seat_reservations USING btree (member_id) WHERE (member_id IS NOT NULL);
CREATE UNIQUE INDEX commander_home_seats_legacy_one_seat_per_game ON public.commander_home_seats USING btree (game_id, seat_number) WHERE (table_id IS NULL);
CREATE UNIQUE INDEX commander_home_seats_legacy_one_user_per_game ON public.commander_home_seats USING btree (game_id, user_id) WHERE ((user_id IS NOT NULL) AND (table_id IS NULL));
CREATE UNIQUE INDEX commander_home_seats_one_seat_per_table ON public.commander_home_seats USING btree (table_id, seat_number) WHERE (table_id IS NOT NULL);
CREATE UNIQUE INDEX commander_home_seats_one_user_per_table ON public.commander_home_seats USING btree (table_id, user_id) WHERE ((user_id IS NOT NULL) AND (table_id IS NOT NULL));
CREATE UNIQUE INDEX commander_home_seats_pkey ON public.commander_home_seats USING btree (id);
CREATE INDEX commander_home_seats_table_id_idx ON public.commander_home_seats USING btree (table_id);
CREATE INDEX idx_commander_home_seats_empty_by_game ON public.commander_home_seats USING btree (game_id) WHERE ((status = 'empty'::text) AND (table_id IS NULL));
CREATE INDEX idx_commander_home_seats_legacy_game_status ON public.commander_home_seats USING btree (game_id, status) WHERE (table_id IS NULL);
CREATE INDEX idx_commander_home_seats_reservation_id ON public.commander_home_seats USING btree (reservation_id) WHERE (reservation_id IS NOT NULL);
CREATE INDEX idx_commander_home_seats_table_status ON public.commander_home_seats USING btree (table_id, status) WHERE (table_id IS NOT NULL);
CREATE INDEX idx_commander_home_seats_user ON public.commander_home_seats USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE UNIQUE INDEX home_game_vouches_group_id_user_id_key ON public.home_game_vouches USING btree (group_id, user_id);
CREATE UNIQUE INDEX home_game_vouches_pkey ON public.home_game_vouches USING btree (id);
CREATE INDEX idx_home_game_vouches_group_id ON public.home_game_vouches USING btree (group_id);
CREATE INDEX idx_home_game_vouches_user_id ON public.home_game_vouches USING btree (user_id);
