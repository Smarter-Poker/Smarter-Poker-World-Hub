-- =====================================================================
-- Phase 41 bug-hunt pass 4: reconcile fn_enforce_home_rsvp_field_permissions
-- with the phase41 seat-claim model.
--
-- THE BUG (CRITICAL, production-breaking since 2026-04-20 ~10:04 UTC):
--   Every member-initiated seat claim on a home game has been raising
--   HOST_ONLY_FIELD because rpc_hg_claim_seat shadow-writes
--   commander_home_rsvps with (seat_number, is_confirmed, responded_at),
--   and this trigger treated:
--     • seat_number  as HOST_ONLY
--     • responded_at as SYSTEM_ONLY
--   That matched the pre-phase41 model where seat assignment was a
--   host action. Phase41 flipped the model: users claim their own
--   seats, first-come-first-serve.
--
-- THE FIX:
--   Let the RSVPing user (v_is_self) write their own:
--     • seat_number   — they are claiming/changing their own seat
--     • responded_at  — they are recording their own response
--     • is_confirmed=false on INSERT — default-equivalent, harmless
--   Keep host-only:
--     • is_confirmed=true  (only host confirms)
--     • checked_in_at / checked_in_by (host / self-stamp-from-NULL)
--     • flaked / final_result_note (host)
--   Keep system-only:
--     • reminder_* / review_prompt_sent_at
--
-- The phase41 RPCs are SECURITY DEFINER with their own auth checks
-- (group membership, table/game state, seat bounds). This trigger
-- remains the authoritative defense against PostgREST-direct writes
-- from untrusted client sessions; it just stops blocking the
-- legitimate phase41 RPC shadow-writes.
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
    v_only_user_response_fields_changed boolean := false;
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

    -- Legit "RSVP-owner first-stamp": row's checked_in_at was NULL, now
    -- being set by the RSVP owner themselves (as in claim_home_game_seat).
    v_checkin_self_stamp := (
      v_is_self
      AND OLD.checked_in_at IS NULL
      AND NEW.checked_in_at IS NOT NULL
    );

    -- ----------------------------------------------------------------
    -- Attendance-field check. Under phase41 the RSVPing user MAY set
    -- their own seat_number (claiming/changing their own seat), so
    -- seat_number is split out of the host-only enforcement and
    -- allowed when v_is_self. Likewise is_confirmed=false on INSERT
    -- is harmless (default-equivalent); flipping is_confirmed to TRUE
    -- remains host-only.
    -- ----------------------------------------------------------------
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

    -- seat_number: user MAY set it on their OWN row (phase41 model).
    -- Host can still set it for anyone.
    IF NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
      IF NOT v_is_host AND NOT v_is_self THEN
        RAISE EXCEPTION 'HOST_OR_SELF_ONLY_FIELD'
              USING HINT = 'seat_number can only be set by the RSVPing '
                         || 'user themselves or by host/owner/admin';
      END IF;
    END IF;

    -- is_confirmed: user can set FALSE on their own row (default /
    -- default-equivalent during INSERT). Only host can set TRUE.
    IF NEW.is_confirmed IS DISTINCT FROM OLD.is_confirmed THEN
      IF NOT v_is_host THEN
        IF NOT (v_is_self AND NEW.is_confirmed = false) THEN
          RAISE EXCEPTION 'HOST_ONLY_CONFIRMATION'
                USING HINT = 'only host/owner/admin can set is_confirmed=true';
        END IF;
      END IF;
    END IF;

    -- ----------------------------------------------------------------
    -- System fields: timestamps for reminders / review prompts remain
    -- system-only. responded_at is carved out to allow the RSVPing user
    -- to timestamp their own response (matches phase41 RPC semantic).
    -- ----------------------------------------------------------------
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

    -- Non-self cannot change response fields
    IF NOT v_is_self THEN
      IF NEW.response IS DISTINCT FROM OLD.response
         OR NEW.bringing_guests IS DISTINCT FROM OLD.bringing_guests
         OR NEW.message IS DISTINCT FROM OLD.message
         OR NEW.guest_names IS DISTINCT FROM OLD.guest_names
         OR NEW.rsvp_reason IS DISTINCT FROM OLD.rsvp_reason
      THEN
        RAISE EXCEPTION 'RSVP_OWNER_ONLY_FIELD'
              USING HINT = 'only the RSVPing user can change their response, '
                         || 'guest info, or message';
      END IF;
    END IF;

    RETURN NEW;
END;
$function$;
