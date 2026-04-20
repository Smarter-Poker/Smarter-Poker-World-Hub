-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 41 bug-hunt fixes (DB layer)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fix #1  rpc_hg_start_table shadow-inserts into commander_home_seats, which
--         carries two legacy single-table unique indexes that fail on the 2nd
--         multi-table start:
--           UNIQUE(game_id, seat_number)             ← seats repeat across tables
--           UNIQUE(game_id, user_id) WHERE user_id   ← user at 2 tables of same game
--         Migrate both to table-scoped partial indexes. Keep legacy partials
--         (WHERE table_id IS NULL) as a fallback for any pre-phase41 rows.
--
-- Fix #2  fn_enforce_seat_reservation_deadline short-circuits on UPDATE when
--         status is unchanged. rpc_hg_change_seat keeps status='reserved' and
--         only changes seat_number, so it bypasses Dan's #6 hard cutoff. Gate
--         seat-number changes too.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Fix #1: migrate commander_home_seats unique constraints ────────────────

-- Drop the table-level UNIQUE constraint (replaces the auto-generated index).
ALTER TABLE public.commander_home_seats
  DROP CONSTRAINT IF EXISTS commander_home_seats_game_id_seat_number_key;

-- Defensive: if for any reason the index survived, nuke it.
DROP INDEX IF EXISTS public.commander_home_seats_game_id_seat_number_key;

-- Drop the per-user-per-game legacy partial index.
DROP INDEX IF EXISTS public.commander_home_seats_one_per_user;

-- New table-scoped partials (the modern phase41 design).
CREATE UNIQUE INDEX commander_home_seats_one_seat_per_table
  ON public.commander_home_seats (table_id, seat_number)
  WHERE table_id IS NOT NULL;

CREATE UNIQUE INDEX commander_home_seats_one_user_per_table
  ON public.commander_home_seats (table_id, user_id)
  WHERE user_id IS NOT NULL AND table_id IS NOT NULL;

-- Legacy fallbacks so any pre-phase41 single-table rows (table_id IS NULL)
-- keep their original constraints.
CREATE UNIQUE INDEX commander_home_seats_legacy_one_seat_per_game
  ON public.commander_home_seats (game_id, seat_number)
  WHERE table_id IS NULL;

CREATE UNIQUE INDEX commander_home_seats_legacy_one_user_per_game
  ON public.commander_home_seats (game_id, user_id)
  WHERE user_id IS NOT NULL AND table_id IS NULL;

-- ─── Fix #2: tighten the deadline trigger ───────────────────────────────────

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
BEGIN
  -- Service-role bypass (API layer enforces when auth.uid() is NULL, and
  -- matches the fn_enforce_rsvp_deadline precedent).
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- Decide whether this operation needs the deadline gate.
  IF TG_OP = 'INSERT' THEN
    v_must_gate := true;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Transition into (or between) active states → gate.
    IF NEW.status IN ('reserved','seated')
       AND (OLD.status IS DISTINCT FROM NEW.status) THEN
      v_must_gate := true;
    END IF;
    -- Seat-number change while staying active → gate (Dan's #6 HARD cutoff
    -- also applies to moves, not just new claims). This is the new line.
    IF NEW.status IN ('reserved','seated')
       AND NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
      v_must_gate := true;
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
    -- Per Dan's spec #5: once a table is running, live seating is owned by
    -- Commander (commander_home_seats), not by reservations. Applies to
    -- inserts AND seat-number changes.
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

  -- Dan's product answer #6: scheduled_date + start_time is the HARD cutoff.
  -- Applies to new claims AND to seat-number moves.
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
