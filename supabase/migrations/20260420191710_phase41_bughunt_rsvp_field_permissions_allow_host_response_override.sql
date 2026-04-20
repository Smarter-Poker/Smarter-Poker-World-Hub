-- =====================================================================
-- Phase 41 bug-hunt pass 6: allow host/owner/admin to override response
-- on behalf of a member.
--
-- THE BUG (latent pre-phase41, reachable via phase41 rpc_hg_host_claim_for_member):
--   The non-self guard block used to strictly forbid any caller other
--   than the RSVPing user from changing response / bringing_guests /
--   message / guest_names / rsvp_reason on commander_home_rsvps.
--
--   rpc_hg_host_claim_for_member performs an UPSERT that sets
--   response='yes' (and is_confirmed=true) when a host seats a member.
--   If that member previously responded 'no' or 'maybe', the ON CONFLICT
--   DO UPDATE path fires NEW.response='yes' vs OLD.response<>'yes', and
--   the trigger raised RSVP_OWNER_ONLY_FIELD.
--
--   Product intent (per Dan's phase41 spec Q2+Q4): host can seat
--   members at will; that IS the authoritative "yes/confirmed" RSVP.
--
-- THE FIX:
--   Extend the non-self response-field guard to also permit v_is_host
--   for the response-level fields that a host would legitimately
--   override (response, bringing_guests when hosting extras). Free-form
--   user fields (message, rsvp_reason) stay owner-only even for host,
--   to keep host from impersonating a member's written note.
--   guest_names is owner-only too (host should use roster tooling).
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

    -- responded_at: self or host
    IF NEW.responded_at IS DISTINCT FROM OLD.responded_at THEN
      IF NOT v_is_host AND NOT v_is_self THEN
        RAISE EXCEPTION 'HOST_OR_SELF_ONLY_FIELD'
              USING HINT = 'responded_at can only be set by the RSVPing '
                         || 'user themselves or by host/owner/admin';
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
