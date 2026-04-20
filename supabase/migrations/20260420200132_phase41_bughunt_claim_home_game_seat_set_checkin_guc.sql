-- Thread the app.hg_self_checkin_allowed GUC through claim_home_game_seat
-- so its legitimate self-checkin UPDATE is honored by the pass-13 trigger.
-- Everything else in the function body is preserved verbatim.

CREATE OR REPLACE FUNCTION public.claim_home_game_seat(p_game_id uuid, p_seat_number integer, p_caller_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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
$function$;
