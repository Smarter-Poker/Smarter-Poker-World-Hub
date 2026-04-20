-- =====================================================================
-- Pass 17: restore updated_at tamper protection on commander_home_rsvps.
--
-- History: pass 13 added updated_at protection. Two later migrations
-- (claim_home_game_seat_set_checkin_guc, rsvp_responded_at_no_backdate)
-- replaced the trigger body and inadvertently dropped the updated_at
-- guard. The current trigger uses a GUC-based self-checkin carveout
-- (stronger than my original pass-13 approach) but no longer blocks
-- user-supplied updated_at.
--
-- Re-apply: users cannot include updated_at in UPDATE payloads.
-- trg_touch_updated_at handles it internally at pg_trigger_depth > 1.
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

    -- GUC-gated self-checkin: only valid when the claim_home_game_seat
    -- (or successor) RPC explicitly sets app.hg_self_checkin_allowed='1'.
    -- Direct PostgREST self-check-in is blocked.
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
              USING HINT = 'checked_in_at, checked_in_by, flaked, final_result_note '
                         || 'can only be set by game host / group owner / admin';
      END IF;
    END IF;

    IF NEW.seat_number IS DISTINCT FROM OLD.seat_number THEN
      IF NOT v_is_host AND NOT v_is_self THEN
        RAISE EXCEPTION 'HOST_OR_SELF_ONLY_FIELD'
              USING HINT = 'seat_number can only be set by the RSVPing user or host/owner/admin';
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
              USING HINT = 'responded_at can only be set by the RSVPing user or host/owner/admin';
      END IF;
    END IF;

    -- Pass 13 / pass 17 restore: updated_at is system-managed by
    -- trg_touch_updated_at which fires at pg_trigger_depth > 1 (handled
    -- by the early bypass above). User-initiated UPDATE payloads cannot
    -- include updated_at — blocks ordering-based log/digest tampering.
    IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
      RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
            USING HINT = 'updated_at is managed by trg_touch_updated_at; '
                      || 'do not include it in RSVP UPDATE payloads';
    END IF;

    IF NEW.response IS DISTINCT FROM OLD.response
       OR NEW.bringing_guests IS DISTINCT FROM OLD.bringing_guests
    THEN
      IF NOT v_is_self AND NOT v_is_host THEN
        RAISE EXCEPTION 'RSVP_OWNER_OR_HOST_ONLY_FIELD'
              USING HINT = 'response/bringing_guests can only be changed by the RSVPing user or host/owner/admin';
      END IF;
    END IF;

    IF NEW.message IS DISTINCT FROM OLD.message
       OR NEW.guest_names IS DISTINCT FROM OLD.guest_names
       OR NEW.rsvp_reason IS DISTINCT FROM OLD.rsvp_reason
    THEN
      IF NOT v_is_self THEN
        RAISE EXCEPTION 'RSVP_OWNER_ONLY_FIELD'
              USING HINT = 'only the RSVPing user can change their message, guest names, or rsvp reason';
      END IF;
    END IF;

    RETURN NEW;
END;
$function$;
