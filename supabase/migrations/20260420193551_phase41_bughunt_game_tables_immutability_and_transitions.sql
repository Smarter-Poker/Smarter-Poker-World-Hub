-- =====================================================================
-- Phase 41 bug-hunt pass 9: lock down direct UPDATEs to
-- commander_home_game_tables.
--
-- Context:
--   RLS on this table lets host/group-owner/group-admin UPDATE any
--   column. The phase41 RPCs (rpc_hg_create_table, rpc_hg_start_table)
--   are the intended mutation path. Direct PostgREST UPDATEs by a
--   host can today:
--     • Change game_id — relocate a table to a different game/group
--     • Flip is_default — break the "one default per game" invariant
--       by first clearing the current default then setting a new one
--       (the partial unique index only catches concurrent duplicates,
--        not sequential swaps)
--     • Jump status: open_for_rsvp → ended / draft / arbitrary
--       (skipping rpc_hg_start_table's materialization)
--     • Reduce max_seats below existing seat numbers — orphaning
--       reservations that can never be materialized
--
--   Blast radius is limited to the host's own game (RLS scopes it),
--   but the invariant-breaks corrupt phase41's state machine.
--
-- Fix:
--   SECURITY INVOKER BEFORE UPDATE trigger. postgres / service_role
--   / SECURITY DEFINER RPCs bypass. All other callers are gated.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_game_table_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
  v_highest_seat integer;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- Identity fields: immutable
  IF NEW.game_id IS DISTINCT FROM OLD.game_id THEN
    RAISE EXCEPTION 'GAME_TABLE_IMMUTABLE'
          USING HINT = 'game_id cannot be changed; delete and recreate '
                     || 'the table if it belongs to a different game';
  END IF;
  IF NEW.table_number IS DISTINCT FROM OLD.table_number THEN
    RAISE EXCEPTION 'GAME_TABLE_IMMUTABLE'
          USING HINT = 'table_number is an identity column and cannot be changed';
  END IF;
  IF NEW.is_default IS DISTINCT FROM OLD.is_default THEN
    RAISE EXCEPTION 'GAME_TABLE_IMMUTABLE'
          USING HINT = 'is_default is set at table creation and cannot be toggled; '
                     || 'the default table is guaranteed by the partial unique index';
  END IF;

  -- Status transitions. Allowed edges:
  --   draft            → open_for_rsvp, cancelled
  --   open_for_rsvp    → running, cancelled, draft
  --   running          → ended, cancelled
  --   ended            → (terminal)
  --   cancelled        → (terminal)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'ended' OR OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'GAME_TABLE_STATUS_TERMINAL'
            USING HINT = 'status ' || OLD.status || ' is terminal and cannot be changed';
    END IF;
    IF OLD.status = 'draft' AND NEW.status NOT IN ('open_for_rsvp','cancelled') THEN
      RAISE EXCEPTION 'INVALID_GAME_TABLE_TRANSITION'
            USING HINT = 'from draft, allowed next statuses are open_for_rsvp or cancelled';
    END IF;
    IF OLD.status = 'open_for_rsvp' AND NEW.status NOT IN ('running','cancelled','draft') THEN
      RAISE EXCEPTION 'INVALID_GAME_TABLE_TRANSITION'
            USING HINT = 'from open_for_rsvp, allowed next statuses are running, cancelled, or draft';
    END IF;
    IF OLD.status = 'running' AND NEW.status NOT IN ('ended','cancelled') THEN
      RAISE EXCEPTION 'INVALID_GAME_TABLE_TRANSITION'
            USING HINT = 'from running, allowed next statuses are ended or cancelled';
    END IF;
  END IF;

  -- max_seats: when reducing, must not orphan active reservations
  IF NEW.max_seats IS DISTINCT FROM OLD.max_seats AND NEW.max_seats < OLD.max_seats THEN
    SELECT COALESCE(MAX(seat_number), 0) INTO v_highest_seat
    FROM public.commander_home_seat_reservations
    WHERE table_id = OLD.id AND status IN ('reserved','seated');
    IF v_highest_seat > NEW.max_seats THEN
      RAISE EXCEPTION 'MAX_SEATS_ORPHANS_RESERVATIONS'
            USING HINT = 'reducing max_seats to ' || NEW.max_seats
                      || ' would orphan existing reservation at seat ' || v_highest_seat;
    END IF;
  END IF;

  -- max_seats: once running, locked (live seating is commander_home_seats)
  IF NEW.max_seats IS DISTINCT FROM OLD.max_seats AND OLD.status = 'running' THEN
    RAISE EXCEPTION 'MAX_SEATS_LOCKED_WHILE_RUNNING'
          USING HINT = 'live seating is managed via Club Commander once the table is running';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_game_table_immutability
  ON public.commander_home_game_tables;

CREATE TRIGGER trg_enforce_game_table_immutability
BEFORE UPDATE ON public.commander_home_game_tables
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_game_table_immutability();
