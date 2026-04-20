-- =====================================================================
-- Phase 41 bug-hunt pass 8: fix fn_enforce_seat_reservation_deadline
-- to allow the legitimate reserved→seated materialization path.
--
-- BUG:
--   My pass-1 extension gated UPDATEs that transitioned status INTO
--   'reserved' or 'seated'. But rpc_hg_start_table flips the table
--   status to 'running' first, THEN updates its reservations from
--   'reserved' to 'seated'. That second UPDATE now re-enters the
--   trigger; the trigger sees v_table.status = 'running' and raises
--   TABLE_RUNNING — blocking its own materialization.
--
-- FIX:
--   Carve out the specific materialization shape as a pass-through:
--     OLD.status = 'reserved' AND NEW.status = 'seated'
--     AND table_id / seat_number / user_id / is_guest unchanged
--   That shape is only produced by rpc_hg_start_table doing a bulk
--   UPDATE. It's already guarded by the immutability trigger against
--   tampering (table_id etc. can't change), so we can confidently
--   exempt it.
--
--   Gate everything else the same way as before:
--     - INSERT: always gate
--     - UPDATE into 'reserved' from any other state: gate
--     - UPDATE with seat_number change while active: gate
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_seat_reservation_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_table  RECORD;
  v_game   RECORD;
  v_cutoff timestamptz;
  v_must_gate boolean := false;
  v_is_materialization boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_must_gate := true;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detect legitimate start_table materialization shape: reserved→seated
    -- with no other field changes. This is ONLY produced by rpc_hg_start_table.
    v_is_materialization := (
      OLD.status = 'reserved'
      AND NEW.status = 'seated'
      AND OLD.table_id = NEW.table_id
      AND OLD.seat_number = NEW.seat_number
      AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
      AND OLD.is_guest = NEW.is_guest
      AND OLD.claimed_by_user_id = NEW.claimed_by_user_id
    );

    IF NOT v_is_materialization THEN
      -- Transition into an active state (other than the exempt one) → gate
      IF NEW.status IN ('reserved','seated')
         AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        v_must_gate := true;
      END IF;
      -- Seat-number change while active → gate (Dan's #6)
      IF NEW.status IN ('reserved','seated')
         AND NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
        v_must_gate := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_must_gate THEN
    RETURN NEW;
  END IF;

  SELECT id, game_id, status, max_seats
    INTO v_table
    FROM public.commander_home_game_tables
   WHERE id = NEW.table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND' USING HINT = 'table_id does not exist';
  END IF;

  IF v_table.status = 'cancelled' THEN RAISE EXCEPTION 'TABLE_CANCELLED'; END IF;
  IF v_table.status = 'ended'     THEN RAISE EXCEPTION 'TABLE_ENDED';     END IF;
  IF v_table.status = 'running' THEN
    RAISE EXCEPTION 'TABLE_RUNNING'
      USING HINT = 'once a table is running, seating is managed via Club Commander';
  END IF;
  IF v_table.status = 'draft' THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN_FOR_RSVP'
      USING HINT = 'host has not opened this table for RSVPs yet';
  END IF;

  IF NEW.seat_number > v_table.max_seats THEN
    RAISE EXCEPTION 'SEAT_OUT_OF_BOUNDS'
      USING HINT = format('seat %s exceeds table max_seats %s',
                           NEW.seat_number, v_table.max_seats);
  END IF;

  SELECT id, status, rsvps_closed, rsvp_closes_at,
         scheduled_date, start_time, cancelled_at
    INTO v_game
    FROM public.commander_home_games
   WHERE id = v_table.game_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_game.cancelled_at IS NOT NULL OR v_game.status = 'cancelled' THEN
    RAISE EXCEPTION 'GAME_CANCELLED';
  END IF;
  IF v_game.rsvps_closed = true THEN
    RAISE EXCEPTION 'RSVPS_CLOSED'
      USING HINT = 'host has closed RSVPs for this game';
  END IF;
  IF v_game.rsvp_closes_at IS NOT NULL AND v_game.rsvp_closes_at < now() THEN
    RAISE EXCEPTION 'RSVP_DEADLINE_PASSED'
      USING HINT = 'RSVP deadline was ' || v_game.rsvp_closes_at::text;
  END IF;

  IF v_game.scheduled_date IS NOT NULL AND v_game.start_time IS NOT NULL THEN
    v_cutoff := (v_game.scheduled_date + v_game.start_time)::timestamptz;
    IF v_cutoff < now() THEN
      RAISE EXCEPTION 'GAME_START_TIME_PASSED'
        USING HINT = 'game started at ' || v_cutoff::text
                  || '; live seating is owned by Club Commander after start';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;
