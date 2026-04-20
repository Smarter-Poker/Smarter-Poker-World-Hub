-- =====================================================================
-- Phase 41 bug-hunt pass 5: fix legacy commander_home_seats writers to
-- match the partial unique index predicate.
--
-- Background:
--   Phase41 pass 1 replaced commander_home_seats.UNIQUE(game_id, seat_number)
--   with:
--     UNIQUE(table_id, seat_number) WHERE table_id IS NOT NULL  [multitable]
--     UNIQUE(game_id, seat_number)  WHERE table_id IS NULL      [legacy]
--
--   assign_home_game_seat and fn_home_init_seats use:
--     ON CONFLICT (game_id, seat_number) DO ...
--   which fails 42P10 against a partial index unless the ON CONFLICT
--   clause also carries the matching predicate.
--
--   These functions only operate on legacy-flow seats (they never set
--   table_id), so adding WHERE table_id IS NULL to the ON CONFLICT
--   correctly targets the legacy partial index.
--
-- Scope of failure:
--   fn_home_init_seats — called when a legacy (non-phase41) game is
--     initialized. Raises 42P10, breaks legacy game creation.
--   assign_home_game_seat — called when host assigns a seat on a
--     legacy game. Raises 42P10, breaks host seat-assignment flow
--     for legacy games still in-progress.
--
--   Phase41-native games use rpc_hg_start_table which inserts with
--   table_id populated, hitting the OTHER partial index — not affected.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) fn_home_init_seats
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_home_init_seats(
  p_caller uuid,
  p_game_id uuid,
  p_max_players integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_max integer;
  v_created integer := 0;
BEGIN
  IF auth.role() <> 'service_role'
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
$function$;

-- ---------------------------------------------------------------------
-- 2) assign_home_game_seat
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_home_game_seat(
  p_game_id uuid,
  p_seat_number integer,
  p_user_id uuid,
  p_player_name text DEFAULT NULL,
  p_caller_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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
$function$;
