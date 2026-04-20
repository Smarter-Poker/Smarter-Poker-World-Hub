-- Pass 7 had a subtle self-inflicted bug: I marked the trigger function
-- SECURITY DEFINER, which makes current_user always resolve to the function
-- owner (postgres) regardless of who triggered the update. That made the
-- service-role bypass match every call, effectively disabling the trigger.
--
-- Fix: SECURITY INVOKER.  Under this mode:
--   - Direct PostgREST writes by a signed-in user run as current_user =
--     'authenticated' (or 'anon') → bypass check fails → enforcement runs.
--   - SECURITY DEFINER RPCs like rpc_hg_claim_seat / rpc_hg_start_table
--     run their bodies as their OWNER (postgres), so when those RPCs
--     INSERT/UPDATE reservations the trigger sees current_user = 'postgres'
--     → bypass succeeds → RPC mutation goes through.
--
-- The trigger function doesn't need elevated privileges — it only inspects
-- OLD/NEW and raises on disallowed changes. No privileged table reads.

CREATE OR REPLACE FUNCTION public.fn_enforce_seat_reservation_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
BEGIN
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.table_id IS DISTINCT FROM OLD.table_id THEN
    RAISE EXCEPTION 'RESERVATION_IMMUTABLE'
          USING HINT = 'table_id cannot be changed on an existing reservation; '
                     || 'release this seat and claim a new one on the target table';
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

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'released' THEN
      RAISE EXCEPTION 'RESERVATION_STATUS_TERMINAL'
            USING HINT = 'released reservations cannot be resurrected';
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
