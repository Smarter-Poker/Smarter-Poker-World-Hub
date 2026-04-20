-- =====================================================================
-- Phase 41 bug-hunt pass 7: lock down direct-UPDATE writes to
-- commander_home_seat_reservations.
--
-- BUGS (verified by direct authenticated-role attack):
--
--   ATTACK 1 — table relocation (HIGH, cross-tenant escalation):
--     Any approved member with an active reservation could direct-UPDATE
--     their row to set table_id to ANY table in ANY game — including
--     private groups they don't belong to. The RLS UPDATE policy only
--     checks ownership of the OLD row; WITH CHECK is absent so the NEW
--     row's group membership is never validated.
--
--   ATTACK 4 — framing (MEDIUM, data-integrity):
--     A user could set their own reservation's claimed_by_user_id to
--     another user's uuid, corrupting audit trails and host-UI filters.
--
--   Also latent: direct UPDATE could change user_id, is_guest, member_id,
--   or move status backward (released → reserved). The RPCs are the
--   intended mutation surface; this trigger enforces it at the DB level.
--
-- FIX:
--   BEFORE UPDATE trigger enforces:
--     - table_id, user_id, claimed_by_user_id, is_guest, member_id
--       are IMMUTABLE once set (any change raises RESERVATION_IMMUTABLE)
--     - status transitions: reserved → seated → released; released is
--       terminal (no resurrection)
--     - guest_name may only change while status = 'reserved' and
--       is_guest = true (supports host-initiated renames pre-start)
--
--   Service role and the phase41 SECURITY DEFINER RPCs bypass this
--   check. The RPCs manage mutations legitimately: start_table flips
--   status reserved→seated, release_seat flips to released,
--   change_seat updates seat_number (allowed), and rpc_hg_host_claim_for_member
--   INSERTs fresh rows (never UPDATEs immutable fields).
--
--   Specifically we detect service-role-like elevated writes via
--   auth.role(), same as the field-permissions trigger. Phase41 RPCs
--   are SECURITY DEFINER so inside their body they run as the function
--   owner (postgres, not authenticated) → trigger sees postgres role,
--   not 'authenticated', and allows through.
--
--   Actually wait: SECURITY DEFINER does NOT change auth.role() — it
--   changes the execution user but Supabase's auth.role() returns the
--   JWT-declared role regardless. We must use pg_trigger_depth() or
--   another mechanism. Correct detection: check current_user (which
--   DOES change under SECURITY DEFINER) against 'authenticated' /
--   'anon'. If current_user IS postgres/supabase_admin/service_role,
--   allow through.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_seat_reservation_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_user;
BEGIN
  -- Service-role / postgres writes bypass (covers SECURITY DEFINER RPCs,
  -- admin scripts, and Supabase's internal service-role calls).
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN NEW;
  END IF;

  -- ---- Immutable identity fields ----
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

  -- ---- Status transitions: reserved → seated → released; released is terminal ----
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

  -- ---- guest_name: only editable while status=reserved AND is_guest=true ----
  IF NEW.guest_name IS DISTINCT FROM OLD.guest_name THEN
    IF OLD.is_guest = false OR OLD.status <> 'reserved' THEN
      RAISE EXCEPTION 'GUEST_NAME_LOCKED'
            USING HINT = 'guest_name is only editable on reserved guest seats';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_seat_reservation_immutability
  ON public.commander_home_seat_reservations;

CREATE TRIGGER trg_enforce_seat_reservation_immutability
BEFORE UPDATE ON public.commander_home_seat_reservations
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_seat_reservation_immutability();
