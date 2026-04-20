-- =====================================================================
-- Pass 33: commander_home_seat_reservations — lock status transitions
-- and seat_number changes to the RPC-only path for non-service callers.
--
-- BUGS (verified):
--   SR-X1 — user can direct-UPDATE seat_number, bypassing the atomicity
--           and shadow-rsvp sync provided by rpc_hg_change_seat.
--   SR-X3 — user can direct-UPDATE status from 'reserved' → 'seated',
--           bypassing the rpc_hg_start_table materialization path.
--           Only the host should be able to trigger reserved→seated.
--
-- FIX: extend fn_enforce_seat_reservation_immutability.
--   - seat_number changes: allowed only when current_user is in the
--     service bypass set (i.e., change came from a SECURITY DEFINER RPC).
--   - reserved → seated: allowed only for service callers. Users can
--     still release (reserved → released, seated → released).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_seat_reservation_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
  v_is_service boolean;
BEGIN
  v_is_service := v_role IN ('postgres', 'supabase_admin', 'service_role',
                             'supabase_auth_admin', 'supabase_storage_admin');

  IF v_is_service THEN
    RETURN NEW;
  END IF;

  -- Pure identity columns: immutable (unchanged from prior pass 7)
  IF NEW.table_id IS DISTINCT FROM OLD.table_id THEN
    RAISE EXCEPTION 'RESERVATION_IMMUTABLE'
          USING HINT = 'table_id cannot be changed on an existing reservation';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'RESERVATION_IMMUTABLE'
          USING HINT = 'user_id cannot be changed on an existing reservation';
  END IF;
  IF NEW.claimed_by_user_id IS DISTINCT FROM OLD.claimed_by_user_id THEN
    RAISE EXCEPTION 'RESERVATION_IMMUTABLE'
          USING HINT = 'claimed_by_user_id cannot be changed on an existing reservation';
  END IF;
  IF NEW.is_guest IS DISTINCT FROM OLD.is_guest THEN
    RAISE EXCEPTION 'RESERVATION_IMMUTABLE'
          USING HINT = 'is_guest cannot be flipped on an existing reservation';
  END IF;
  IF NEW.member_id IS DISTINCT FROM OLD.member_id THEN
    RAISE EXCEPTION 'RESERVATION_IMMUTABLE'
          USING HINT = 'member_id cannot be changed on an existing reservation';
  END IF;

  -- NEW in pass 33: seat_number cannot be changed via direct UPDATE.
  -- Must go through rpc_hg_change_seat (SECURITY DEFINER → bypass above).
  IF NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
    RAISE EXCEPTION 'SEAT_CHANGE_REQUIRES_RPC'
          USING HINT = 'seat_number changes must go through rpc_hg_change_seat '
                    || 'to maintain atomicity and shadow-rsvp sync';
  END IF;

  -- Status transitions (layered rule)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'released' THEN
      RAISE EXCEPTION 'RESERVATION_STATUS_TERMINAL'
            USING HINT = 'released reservations cannot be resurrected';
    END IF;
    -- NEW in pass 33: users cannot self-promote reserved → seated.
    -- That transition is ONLY legitimate via rpc_hg_start_table
    -- (SECURITY DEFINER → bypass above).
    IF OLD.status = 'reserved' AND NEW.status = 'seated' THEN
      RAISE EXCEPTION 'SEAT_MATERIALIZATION_REQUIRES_RPC'
            USING HINT = 'reserved → seated transition is owned by '
                      || 'rpc_hg_start_table (host materialization). '
                      || 'Users can release a reservation but not seat '
                      || 'themselves directly.';
    END IF;
    IF OLD.status = 'reserved' AND NEW.status NOT IN ('seated','released') THEN
      RAISE EXCEPTION 'INVALID_RESERVATION_TRANSITION'
            USING HINT = 'from reserved, only seated or released are allowed (got '||NEW.status||')';
    END IF;
    IF OLD.status = 'seated' AND NEW.status <> 'released' THEN
      RAISE EXCEPTION 'INVALID_RESERVATION_TRANSITION'
            USING HINT = 'from seated, only released is allowed (got '||NEW.status||')';
    END IF;
  END IF;

  IF NEW.guest_name IS DISTINCT FROM OLD.guest_name THEN
    IF OLD.is_guest = false OR OLD.status <> 'reserved' THEN
      RAISE EXCEPTION 'GUEST_NAME_LOCKED'
            USING HINT = 'guest_name is only editable on reserved guest seats';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
