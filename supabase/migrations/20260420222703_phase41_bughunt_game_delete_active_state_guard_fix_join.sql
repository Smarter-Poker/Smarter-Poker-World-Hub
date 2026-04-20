-- =====================================================================
-- Pass 35b fix: seat_reservations joins via table_id (not game_id).
-- Also re-check commander_home_game_seats existence.
-- ========================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_games_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_active_count integer;
  v_skip text;
  v_rsvps integer := 0;
  v_reservations integer := 0;
  v_seats integer := 0;
BEGIN
  -- Service-role / postgres bypass
  IF current_user IN ('postgres','supabase_admin','service_role',
                       'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN OLD;
  END IF;

  -- Admin-cleanup GUC carveout
  BEGIN
    v_skip := current_setting('app.hg_skip_active_game_delete_check', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = '1' THEN
    RETURN OLD;
  END IF;

  -- Terminal / draft statuses free to delete
  IF OLD.status IN ('draft','cancelled','completed','ended') THEN
    RETURN OLD;
  END IF;

  -- Count RSVPs tied to this game
  SELECT count(*) INTO v_rsvps
  FROM public.commander_home_rsvps WHERE game_id = OLD.id;

  -- Count seat reservations (join through game_tables)
  SELECT count(*) INTO v_reservations
  FROM public.commander_home_seat_reservations r
  JOIN public.commander_home_game_tables t ON t.id = r.table_id
  WHERE t.game_id = OLD.id;

  -- Count legacy seats table if it exists
  IF to_regclass('public.commander_home_game_seats') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.commander_home_game_seats WHERE game_id = $1'
      INTO v_seats USING OLD.id;
  END IF;

  v_active_count := v_rsvps + v_reservations + v_seats;

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'GAME_HAS_ACTIVE_STATE'
      USING HINT =
        'Cancel the game first (rpc_hg_cancel_game or UPDATE status=''cancelled'') to notify '
        'RSVPd members. Once cancelled or completed, deletion is permitted. '
        'Active counts: rsvps=' || v_rsvps || ' reservations=' || v_reservations || ' seats=' || v_seats;
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.fn_enforce_home_games_delete() IS
  'Pass 35b (fix): Blocks DELETE of commander_home_games when status is non-terminal '
  '(scheduled/confirmed/in_progress) AND there are live RSVPs, reservations (via table_id '
  'join to game_tables), or legacy seats. Host must cancel first (sends notifications).';