-- =====================================================================
-- Pass 13: close two holes in fn_enforce_home_rsvp_field_permissions.
--
-- BUGS (confirmed via authenticated-role attack):
--   R3 — updated_at has no protection. A user can backdate their RSVP's
--        updated_at arbitrarily, breaking any "most-recent-first" sort
--        or time-window filter (e.g., the host dashboard's late-rsvp
--        alerting, digest/reminder cron windows that key off updated_at).
--
--   R6 — self-stamp carveout for check-in allows ANY checked_in_by.
--        A user could self-check-in AND set checked_in_by = host_id,
--        fabricating an attendance record signed by the host. The
--        trigger's v_checkin_self_stamp flag exempts the whole block
--        as long as the user is self-stamping checked_in_at from NULL —
--        it never validates that checked_in_by = v_caller.
--
-- FIX:
--   Extend the existing trigger with:
--     - updated_at is system-managed. If NEW.updated_at IS DISTINCT FROM
--       OLD.updated_at, only allow it when set to now() or to a fresh
--       value by the trg_touch_updated_at trigger (pg_trigger_depth>1).
--       The cleanest rule for user-land writes: force updated_at to
--       track actual mutation time, not user input. We RAISE on any
--       user-initiated updated_at write.
--     - self-stamp must have checked_in_by = v_caller. A self-stamp
--       with checked_in_by pointing at anyone else is rejected.
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

    -- Self-stamp check-in carveout: only valid when user is stamping their
    -- OWN attendance AND attributing the attestation to themselves. This
    -- closes R6 where a user could self-stamp and claim the host as the
    -- attester, forging a host-signed attendance record.
    v_checkin_self_stamp := (
      v_is_self
      AND OLD.checked_in_at IS NULL
      AND NEW.checked_in_at IS NOT NULL
      AND NEW.checked_in_by = v_caller
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
                         || 'host / group owner / admin (or self-check-in '
                         || 'with checked_in_by = yourself)';
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

    -- updated_at is system-managed by trg_touch_updated_at. User-land UPDATEs
    -- must not set it — they'd be backdating ordering/time-window queries.
    -- trg_touch_updated_at fires its own UPDATE path (pg_trigger_depth>1)
    -- which hits the early-return above, so this rule only catches the
    -- direct-PostgREST path where a user includes updated_at in their
    -- payload.
    IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
      RAISE EXCEPTION 'SYSTEM_ONLY_FIELD'
            USING HINT = 'updated_at is managed by trg_touch_updated_at; '
                      || 'do not include it in RSVP UPDATE payloads';
    END IF;

    -- Response-level fields
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
                         || 'guest names, or rsvp reason';
      END IF;
    END IF;

    RETURN NEW;
END;
$function$;
