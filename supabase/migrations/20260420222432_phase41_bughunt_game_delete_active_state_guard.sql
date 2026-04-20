-- =====================================================================
-- Pass 35b: commander_home_games DELETE active-state guard (finding AI)
--
-- BUG:
--   A host can PostgREST-DELETE an active game that has live RSVPs,
--   seat reservations, or seated players. This:
--     * orphans RSVP rows (FK cascades depend on config)
--     * leaves no cancellation notifications for RSVPd members
--     * silently hides the game from member views with zero audit trail
--
-- FIX:
--   BEFORE DELETE trigger. Blocks DELETE when:
--     status IN ('scheduled','confirmed','in_progress')
--     AND (RSVPs OR seat_reservations OR seats exist)
--   Hosts MUST call cancel flow first (sets status='cancelled' and
--   sends notifications), then DELETE is permitted if desired.
--
-- BYPASS:
--   - service_role / postgres (RLS-bypass paths)
--   - GUC carveout `app.hg_skip_active_game_delete_check` = '1'
--     (reserved for future admin cleanup / retention jobs)
--
-- DELETE IS ALLOWED FOR:
--   - draft games (never user-visible)
--   - cancelled / completed games (terminal, members notified)
--   - ended games (legacy terminal state not in current CHECK enum)
-- =======================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_games_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_active_count integer;
  v_skip text;
BEGIN
  -- Service-role / postgres bypass (RLS-bypass callers)
  IF current_user IN ('postgres','supabase_admin','service_role',
                       'supabase_auth_admin','supabase_storage_admin') THEN
    RETURN OLD;
  END IF;

  -- Admin-cleanup GUC carveout (future retention jobs)
  BEGIN
    v_skip := current_setting('app.hg_skip_active_game_delete_check', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = '1' THEN
    RETURN OLD;
  END IF;

  -- Terminal / draft statuses are free to delete
  IF OLD.status IN ('draft','cancelled','completed','ended') THEN
    RETURN OLD;
  END IF;

  -- Non-terminal (scheduled / confirmed / in_progress): check live user state
  SELECT
    (SELECT count(*) FROM public.commander_home_rsvps WHERE game_id = OLD.id)
    + (SELECT count(*) FROM public.commander_home_seat_reservations WHERE game_id = OLD.id)
    + COALESCE(
        (SELECT count(*) FROM public.commander_home_game_seats WHERE game_id = OLD.id),
        0)
  INTO v_active_count;

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'GAME_HAS_ACTIVE_STATE'
      USING HINT =
        'Cancel the game first (rpc_hg_cancel_game or UPDATE status=''cancelled'') to notify RSVPd members. '
        'Once cancelled or completed, deletion is permitted.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_home_games_delete ON public.commander_home_games;
CREATE TRIGGER trg_enforce_home_games_delete
BEFORE DELETE ON public.commander_home_games
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_games_delete();

COMMENT ON FUNCTION public.fn_enforce_home_games_delete() IS
  'Pass 35b: Blocks DELETE of commander_home_games when status is non-terminal '
  '(scheduled/confirmed/in_progress) AND there are live RSVPs, reservations, or seats. '
  'Host must cancel first (sends notifications) before deleting.';