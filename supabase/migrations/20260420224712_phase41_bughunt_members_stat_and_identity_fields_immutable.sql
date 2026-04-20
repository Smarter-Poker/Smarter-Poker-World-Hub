-- =====================================================================
-- Pass 37: commander_home_members stat + identity field lockdown
--
-- BUG (5 CVE-class findings — AB-new-1 through AB-new-5):
--   User can self-UPDATE the following fields on their own member row:
--     - games_attended, games_hosted (stat inflation → leaderboard / badge abuse)
--     - last_attended (attendance forgery → "regular" heuristic bypass)
--     - is_roster_only (identity-type flip → confuses downstream logic)
--     - added_by_user_id (invitation-chain forgery)
--     - pending_nudge_sent_at (server-maintained flag, prevents future nudges)
--
--   The field-permissions trigger already blocks role, status, can_host,
--   is_regular, flake_strikes, host_private_note, probation_until,
--   invited_by, joined_at, group_id, user_id — but missed these six.
--
-- FIX:
--   Extend fn_enforce_home_member_field_permissions to also block
--   self-edits of: games_attended, games_hosted, last_attended,
--   is_roster_only, added_by_user_id, pending_nudge_sent_at.
--
--   Staff bypass remains (staff can legitimately adjust roster-only
--   members' fields). Service-role bypass remains (triggers / RPCs
--   maintain stats).
--
--   Still editable by user on own row: notifications_enabled,
--   notify_new_games, notify_announcements, notify_game_reminders,
--   notify_rsvp_updates, last_read_posts_at, display_name, phone
--   (these are legitimate user prefs / group-local identity).
-- =======================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_home_member_field_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_staff boolean;
  v_is_self  boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_staff := fn_home_is_group_staff(v_caller, NEW.group_id);
  v_is_self  := (v_caller = NEW.user_id);

  IF v_is_staff THEN
    RETURN NEW;
  END IF;

  IF NOT v_is_self THEN
    RAISE EXCEPTION 'Cannot modify another member''s row'
      USING ERRCODE = '42501';
  END IF;

  -- ─────────────────── privileged field guards ───────────────────
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot change your own role. Only group staff can change member roles.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Cannot change your own status. Only group staff can approve/ban members.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.can_host IS DISTINCT FROM OLD.can_host THEN
    RAISE EXCEPTION 'Cannot change your own can_host flag. Only group staff can grant hosting.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.is_regular IS DISTINCT FROM OLD.is_regular THEN
    RAISE EXCEPTION 'Cannot change your own is_regular flag. Only group staff can mark regulars.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.flake_strikes IS DISTINCT FROM OLD.flake_strikes THEN
    RAISE EXCEPTION 'Cannot change your own flake_strikes. Only group staff can adjust strikes.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.host_private_note IS DISTINCT FROM OLD.host_private_note THEN
    RAISE EXCEPTION 'Cannot edit host_private_note. This is a staff-only field.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.probation_until IS DISTINCT FROM OLD.probation_until THEN
    RAISE EXCEPTION 'Cannot change your own probation_until. Only group staff can set probation.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
    RAISE EXCEPTION 'Cannot change invited_by. This reflects historical join path.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot reassign group_id or user_id on a member row.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'Cannot change your own joined_at. This reflects historical join date.'
      USING ERRCODE = '42501';
  END IF;

  -- ─────── Pass 37: stat + identity-type fields (5 new blocks) ───────
  IF NEW.games_attended IS DISTINCT FROM OLD.games_attended THEN
    RAISE EXCEPTION 'Cannot change your own games_attended. Stat is server-maintained via check-in flow.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.games_hosted IS DISTINCT FROM OLD.games_hosted THEN
    RAISE EXCEPTION 'Cannot change your own games_hosted. Stat is server-maintained via game-creation flow.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.last_attended IS DISTINCT FROM OLD.last_attended THEN
    RAISE EXCEPTION 'Cannot change your own last_attended. Stat is server-maintained via check-in flow.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.is_roster_only IS DISTINCT FROM OLD.is_roster_only THEN
    RAISE EXCEPTION 'Cannot change your own is_roster_only. Identity type is set by staff at add-to-roster time.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.added_by_user_id IS DISTINCT FROM OLD.added_by_user_id THEN
    RAISE EXCEPTION 'Cannot change your own added_by_user_id. Historical provenance is immutable.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.pending_nudge_sent_at IS DISTINCT FROM OLD.pending_nudge_sent_at THEN
    RAISE EXCEPTION 'Cannot change your own pending_nudge_sent_at. This is set by server nudge jobs.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_enforce_home_member_field_permissions() IS
  'Field-permissions trigger on commander_home_members UPDATE. Blocks self-edits of '
  'privileged fields (role/status/can_host/is_regular/flake_strikes/host_private_note/'
  'probation_until/invited_by/joined_at/group_id/user_id). Pass 37: also blocks '
  'games_attended/games_hosted/last_attended/is_roster_only/added_by_user_id/'
  'pending_nudge_sent_at (stat + identity-type lockdown). Staff + service-role bypass.';