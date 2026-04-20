-- =====================================================================
-- Phase 41 bug-hunt pass 35b: block DELETE of commander_home_games
-- that still has active-state dependencies.
--
-- BUG (verified):
--   AI — host can DELETE an active game (status='scheduled' /
--        'confirmed' / 'in_progress') that has live RSVPs, seat
--        reservations, and/or seats. This orphans those rows (or
--        cascades them away), and silently skips the cancellation
--        notifications that every RSVPd/reserved player should
--        receive. Users would show up to a game that no longer exists.
--
-- FIX:
--   BEFORE DELETE trigger on commander_home_games.
--   - If game is in active state (scheduled/confirmed/in_progress)
--     AND it has any RSVPs/reservations/seats/game_tables → block.
--   - Direct user path: cancel the game first (cancellation RPC
--     sends notifications to all affected users), then delete.
--   - status IN ('cancelled','completed','ended') → allow delete
--     (notifications were already sent during state transition).
--   - Service-role bypass via app.hg_skip_active_game_delete_check
--     GUC for admin cleanup scripts and cascade deletions.
-- =======================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_game_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
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
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_game_delete
  ON public.commander_home_games;

CREATE TRIGGER trg_enforce_home_game_delete
BEFORE DELETE ON public.commander_home_games
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_game_delete();