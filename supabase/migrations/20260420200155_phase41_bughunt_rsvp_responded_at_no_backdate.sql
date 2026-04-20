-- =====================================================================
-- Phase 41 bug-hunt pass 13: prevent self-backdating of responded_at
-- on commander_home_rsvps.
--
-- BUG (confirmed via direct UPDATE):
--   A member could direct-UPDATE their own rsvp.responded_at to any
--   arbitrary value — including into the past. responded_at is the
--   natural tiebreaker for first-come-first-serve waitlist ordering
--   and for any "who responded first" dispute resolution. Backdating
--   effectively lets a user jump the queue.
--
-- FIX:
--   Extend fn_enforce_home_rsvp_field_permissions so that a self-caller
--   may only move responded_at FORWARD (NEW >= OLD). Host/owner/admin
--   retains full override for data corrections.
--
--   Phase41 RPCs (SECURITY DEFINER, auth.role() derived from JWT) still
--   pass because they shadow-write responded_at := now() — always >= OLD
--   by definition. Service-role also bypasses via the early-return at
--   the top of the function.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_rsvp_field_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
    v_caller uuid := auth.uid();
    v_is_self boolean;
    v_is_host boolean;
    v_checkin_self_stamp boolean := false;
BEGIN
    IF auth.role() = 'service_role' OR v_caller IS NULL THEN RETURN NEW; END IF;
    IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

    v_is_self := (NEW.user_id = v_caller);

    SELECT
      EXISTS (SELECT 1 FROM commander_home_games g
               WHERE g.id = NEW.game_id AND g.host_id = v_caller)
      OR EXISTS (SELECT 1 FROM commander_home_games g
                 JOIN commander_home_groups gr ON gr.id = g.group_id
                 WHERE g.id = NEW.game_id AND gr.owner_id = v_caller)
      OR EXISTS (SELECT 1 FROM commander_home_games g
                 JOIN commander_home_members m ON m.group_id = g.group_id
                 WHERE g.id = NEW.game_id
                   AND m.user_id = v_caller
                   AND m.role = 'admin'
                   AND m.status = 'approved')
    INTO v_is_host;

    v_checkin_self_stamp := (
      v_is_self
      AND OLD.checked_in_at IS NULL
      AND NEW.checked_in_at IS NOT NULL
    );

    -- Host-only attendance fields (except self-stamp-from-NULL case for check-in)
    IF NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at
       OR NEW.checked_in_by IS DISTINCT FROM OLD.checked_in_by
       OR NEW.flaked        IS DISTINCT FROM OLD.flaked
       OR NEW.final_result_note IS DISTINCT FROM OLD.final_result_note
    THEN
      IF NOT v_is_host AND NOT v_checkin_self_stamp THEN
        RAISE EXCEPTION 'HOST_ONLY_FIELD'
              USING HINT = 'checked_in_at, checked_in_by, flaked, '
                         || 'final_result_note can only be set by game '
                         || 'host / group owner / admin';
      END IF;
    END IF;

    -- seat_number: self or host
    IF NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
      IF NOT v_is_host AND NOT v_is_self THEN
        RAISE EXCEPTION 'HOST_OR_SELF_ONLY_FIELD'
              USING HINT = 'seat_number can only be set by the RSVPing '
                         || 'user themselves or by host/owner/admin';
      END IF;
    END IF;

    -- is_confirmed: host any; self only to FALSE (default-equivalent)
    IF NEW.is_confirmed IS DISTINCT FROM OLD.is_confirmed THEN
      IF NOT v_is_host THEN
        IF NOT (v_is_self AND NEW.is_confirmed = false) THEN
          RAISE EXCEPTION 'HOST_ONLY_CONFIRMATION'
                USING HINT = 'only host/owner/admin can set is_confirmed=true';
        END IF;
      END IF;
    END IF;

    -- System-only reminder/review timestamps
    IF NEW.reminder_6h_sent_at IS DISTINCT FROM OLD.reminder_6h_sent_at
       OR NEW.reminder_1h_sent_at IS DISTINCT FROM OLD.reminder_1h_sent_at
       OR NEW.review_prompt_sent_at IS DISTINCT FROM OLD.review_prompt_sent_at
    THEN
      RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
            USING HINT = 'reminder/review timestamps are managed by the system';
    END IF;

    -- responded_at: self OR host; self may not backdate (queue-jump prevention)
    IF NEW.responded_at IS DISTINCT FROM OLD.responded_at THEN
      IF NOT v_is_host AND NOT v_is_self THEN
        RAISE EXCEPTION 'HOST_OR_SELF_ONLY_FIELD'
              USING HINT = 'responded_at can only be set by the RSVPing '
                         || 'user themselves or by host/owner/admin';
      END IF;
      -- NEW: self may only move responded_at forward. Host can override (for
      -- legitimate data corrections).
      IF v_is_self AND NOT v_is_host
         AND OLD.responded_at IS NOT NULL
         AND NEW.responded_at < OLD.responded_at THEN
        RAISE EXCEPTION 'RSVP_RESPONDED_AT_BACKDATE'
              USING HINT = 'responded_at cannot be moved backward; this '
                         || 'field is the tiebreaker for queue ordering';
      END IF;
    END IF;

    -- Response-level fields:
    --   response, bringing_guests    → self OR host (host can override when seating)
    --   message, guest_names, rsvp_reason → self ONLY (free-form user text;
    --                                       host seating does not own these)
    IF NEW.response IS DISTINCT FROM OLD.response
       OR NEW.bringing_guests IS DISTINCT FROM OLD.bringing_guests
    THEN
      IF NOT v_is_self AND NOT v_is_host THEN
        RAISE EXCEPTION 'RSVP_OWNER_OR_HOST_ONLY_FIELD'
              USING HINT = 'response/bringing_guests can only be changed by '
                         || 'the RSVPing user or by host/owner/admin';
      END IF;
    END IF;

    IF NEW.message IS DISTINCT FROM OLD.message
       OR NEW.guest_names IS DISTINCT FROM OLD.guest_names
       OR NEW.rsvp_reason IS DISTINCT FROM OLD.rsvp_reason
    THEN
      IF NOT v_is_self THEN
        RAISE EXCEPTION 'RSVP_OWNER_ONLY_FIELD'
              USING HINT = 'only the RSVPing user can change their message, '
                         || 'guest names, or rsvp reason — not even the host '
                         || 'may impersonate these free-form user fields';
      END IF;
    END IF;

    RETURN NEW;
END;
$function$;
