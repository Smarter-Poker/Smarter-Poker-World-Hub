-- =====================================================================
-- Phase 41 bug-hunt pass 13: close the self-checkin forgery hole in
-- commander_home_rsvps.
--
-- BUG:
--   fn_enforce_home_rsvp_field_permissions had an explicit carve-out
--   (v_checkin_self_stamp) that allowed ANY user to self-stamp their
--   own checked_in_at from NULL → non-null via direct PostgREST UPDATE.
--   No geofence, no time check, no QR code — just a raw stamp.
--   Users could fake attendance from anywhere to avoid flake strikes.
--
-- FIX:
--   Remove the blanket self-stamp allowance. Instead require host OR
--   a legitimate RPC context to write checked_in_at. Legitimate RPCs
--   (today: only claim_home_game_seat, which self-stamps when a user
--   claims a physical seat in a live game) set a session GUC before
--   the UPDATE; the trigger honors that GUC as bypass evidence.
--
--   Direct PostgREST self-stamp: blocked.
--   Host/owner/admin calling checkin_to_home_game: works.
--   Self calling claim_home_game_seat in a running game: works (RPC
--   sets the GUC; when Dan retires this legacy flow this can come out).
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
    v_rpc_selfcheckin boolean := false;
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

    -- Pass 13: self-check-in is only allowed if a legitimate RPC set
    -- the session GUC app.hg_self_checkin_allowed = '1' before issuing
    -- the UPDATE. Direct PostgREST UPDATEs cannot set session GUCs, so
    -- attackers cannot fake this context.
    v_rpc_selfcheckin := (
      v_is_self
      AND OLD.checked_in_at IS NULL
      AND NEW.checked_in_at IS NOT NULL
      AND COALESCE(current_setting('app.hg_self_checkin_allowed', true), '') = '1'
    );

    IF NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at
       OR NEW.checked_in_by IS DISTINCT FROM OLD.checked_in_by
       OR NEW.flaked        IS DISTINCT FROM OLD.flaked
       OR NEW.final_result_note IS DISTINCT FROM OLD.final_result_note
    THEN
      IF NOT v_is_host AND NOT v_rpc_selfcheckin THEN
        RAISE EXCEPTION 'HOST_ONLY_FIELD'
              USING HINT = 'checked_in_at, checked_in_by, flaked, '
                         || 'final_result_note can only be set by game '
                         || 'host / group owner / admin (or claim_home_game_seat)';
      END IF;
    END IF;

    IF NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
      IF NOT v_is_host AND NOT v_is_self THEN
        RAISE EXCEPTION 'HOST_OR_SELF_ONLY_FIELD'
              USING HINT = 'seat_number can only be set by the RSVPing '
                         || 'user themselves or by host/owner/admin';
      END IF;
    END IF;

    IF NEW.is_confirmed IS DISTINCT FROM OLD.is_confirmed THEN
      IF NOT v_is_host THEN
        IF NOT (v_is_self AND NEW.is_confirmed = false) THEN
          RAISE EXCEPTION 'HOST_ONLY_CONFIRMATION'
                USING HINT = 'only host/owner/admin can set is_confirmed=true';
        END IF;
      END IF;
    END IF;

    IF NEW.reminder_6h_sent_at IS DISTINCT FROM OLD.reminder_6h_sent_at
       OR NEW.reminder_1h_sent_at IS DISTINCT FROM OLD.reminder_1h_sent_at
       OR NEW.review_prompt_sent_at IS DISTINCT FROM OLD.review_prompt_sent_at
    THEN
      RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
            USING HINT = 'reminder/review timestamps are managed by the system';
    END IF;

    IF NEW.responded_at IS DISTINCT FROM OLD.responded_at THEN
      IF NOT v_is_host AND NOT v_is_self THEN
        RAISE EXCEPTION 'HOST_OR_SELF_ONLY_FIELD'
              USING HINT = 'responded_at can only be set by the RSVPing '
                         || 'user themselves or by host/owner/admin';
      END IF;
    END IF;

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
