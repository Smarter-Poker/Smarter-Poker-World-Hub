-- =====================================================================
-- Phase 41 bug-hunt pass 34: force staff member-DELETEs through the
-- manage_home_group_member RPC, and block deletion of members who are
-- the host_id of an active game.
--
-- BUGS (verified):
--   D1 — admin can direct-DELETE a member's row via PostgREST,
--        bypassing manage_home_group_member RPC. No audit log entry,
--        no validation (e.g., not-a-peer-admin check, active-host check),
--        no notifications to the kicked user, no ban-vs-kick distinction.
--   D4 — admin can DELETE a member who is the host_id of an active
--        (scheduled/confirmed/in_progress) game, orphaning the game's
--        host reference. The former-member stays as host_id in the
--        games table with no group membership to manage the game.
--
-- ALREADY SAFE (verified):
--   - owner's member row protected by protect_home_group_owner_membership
--   - non-staff cross-user DELETE blocked by RLS (0 rows affected)
--   - self-leave DELETE works (expected path)
--
-- FIX:
--   (a) BEFORE DELETE trigger on commander_home_members:
--       - Self-delete (user_id = auth.uid()): allowed, unconditional
--         (legitimate leave_home_group path goes through the RPC which
--         also lands here; direct self-delete is also allowed)
--       - Service-role / postgres / RPC bypass via current_user check
--       - GUC carveout: if app.hg_member_remove_allowed='1' is set
--         (by the kick RPC after audit logging), staff DELETE proceeds
--       - Otherwise: staff must use manage_home_group_member RPC
--   (b) Within the trigger: for ANY removal (including self-leave and
--       RPC kick), if the member being removed is the host_id of an
--       active game in this group, raise MEMBER_IS_ACTIVE_GAME_HOST
--       with a clean error. Cleanup/cancellation of affected games
--       must happen first.
--   (c) Update manage_home_group_member RPC: before DELETE, check for
--       active-host ownership (clean early-return) and set the GUC.
-- =====================================================================

-- ---- (a) + (b): layered BEFORE DELETE trigger ------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_home_members_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_role text := current_user;
  v_active_games int;
BEGIN
  -- Service-role / postgres bypass (covers SECURITY DEFINER RPCs and admin scripts)
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    -- Even for service-role, preserve the active-host guard: orphaning a
    -- game via bulk cleanup is a bug, not a feature. Caller can override
    -- by setting app.hg_skip_active_host_check='1' (e.g., group deletion
    -- cascade, where the games themselves are being deleted too).
    IF COALESCE(current_setting('app.hg_skip_active_host_check', true), '') <> '1' THEN
      SELECT COUNT(*) INTO v_active_games
        FROM commander_home_games
       WHERE group_id = OLD.group_id
         AND host_id  = OLD.user_id
         AND status IN ('scheduled','confirmed','in_progress');
      IF v_active_games > 0 THEN
        RAISE EXCEPTION 'MEMBER_IS_ACTIVE_GAME_HOST'
              USING HINT = 'member hosts ' || v_active_games
                        || ' active game(s) in this group; cancel/transfer them first';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  -- Active-host guard applies to user-driven deletes too
  SELECT COUNT(*) INTO v_active_games
    FROM commander_home_games
   WHERE group_id = OLD.group_id
     AND host_id  = OLD.user_id
     AND status IN ('scheduled','confirmed','in_progress');
  IF v_active_games > 0 THEN
    RAISE EXCEPTION 'MEMBER_IS_ACTIVE_GAME_HOST'
          USING HINT = 'member hosts ' || v_active_games
                    || ' active game(s) in this group; cancel or reassign them first';
  END IF;

  -- Self-delete: always allowed (legit self-leave)
  IF OLD.user_id = v_caller THEN
    RETURN OLD;
  END IF;

  -- Staff kick via RPC: GUC carveout
  IF COALESCE(current_setting('app.hg_member_remove_allowed', true), '') = '1' THEN
    RETURN OLD;
  END IF;

  -- Otherwise: block. Staff must use manage_home_group_member RPC.
  RAISE EXCEPTION 'DIRECT_MEMBER_DELETE_FORBIDDEN'
        USING HINT = 'use manage_home_group_member RPC with action=remove '
                  || 'so the kick is audit-logged and notifications are sent';
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_members_delete
  ON public.commander_home_members;

CREATE TRIGGER trg_enforce_home_members_delete
BEFORE DELETE ON public.commander_home_members
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_members_delete();

-- ---- (c) Update manage_home_group_member to set the GUC + active-host check
CREATE OR REPLACE FUNCTION public.manage_home_group_member(
  p_group_id uuid,
  p_member_user_id uuid,
  p_action text,
  p_caller_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_group          RECORD;
    v_target         RECORD;
    v_caller_role    text;
    v_valid_actions  text[] := ARRAY['approve','decline','ban','unban','promote_admin','demote_member','remove'];
    v_active_games   int;
    v_result         jsonb;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED'
              USING HINT = 'manage_home_group_member requires auth.uid() = p_caller_user_id';
    END IF;

    IF p_action IS NULL OR NOT (p_action = ANY (v_valid_actions)) THEN
        RAISE EXCEPTION 'INVALID_ACTION'
              USING HINT = 'action must be one of: approve, decline, ban, unban, promote_admin, demote_member, remove';
    END IF;

    IF p_group_id IS NULL OR p_member_user_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_PARAMS';
    END IF;

    IF p_caller_user_id = p_member_user_id THEN
        RAISE EXCEPTION 'CANNOT_SELF_MANAGE'
              USING HINT = 'use leave_home_group for self-exit';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

    IF v_group.owner_id = p_caller_user_id THEN
        v_caller_role := 'owner';
    ELSE
        SELECT role INTO v_caller_role
          FROM commander_home_members
         WHERE group_id = p_group_id
           AND user_id = p_caller_user_id
           AND status = 'approved'
           AND role IN ('admin','owner');
        IF NOT FOUND THEN
            RAISE EXCEPTION 'NOT_A_HOST';
        END IF;
    END IF;

    SELECT m.*, (v_group.owner_id = m.user_id) AS is_owner_row
      INTO v_target
      FROM commander_home_members m
     WHERE m.group_id = p_group_id AND m.user_id = p_member_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND';
    END IF;

    IF v_target.is_owner_row AND p_action IN (
        'ban','demote_member','remove','decline','promote_admin'
    ) THEN
        RAISE EXCEPTION 'CANNOT_MODIFY_OWNER'
              USING HINT = 'Use transfer_home_group_ownership to change the owner.';
    END IF;

    IF v_caller_role = 'admin' THEN
        IF v_target.role IN ('admin','owner') AND p_action IN (
            'ban','demote_member','remove','decline'
        ) THEN
            RAISE EXCEPTION 'ADMIN_CANNOT_MODIFY_PEER';
        END IF;
        IF p_action IN ('promote_admin','demote_member') THEN
            RAISE EXCEPTION 'OWNER_ONLY_ACTION'
                  USING HINT = 'promote_admin and demote_member require owner';
        END IF;
    END IF;

    -- Pass 34: for remove, check active-game-host ownership up front
    -- (cleaner error than letting the DELETE trigger raise mid-cascade)
    IF p_action = 'remove' THEN
      SELECT COUNT(*) INTO v_active_games
        FROM commander_home_games
       WHERE group_id = p_group_id
         AND host_id = p_member_user_id
         AND status IN ('scheduled','confirmed','in_progress');
      IF v_active_games > 0 THEN
        RAISE EXCEPTION 'MEMBER_IS_ACTIVE_GAME_HOST'
              USING HINT = 'member hosts ' || v_active_games
                        || ' active game(s); cancel or reassign them before removing';
      END IF;
    END IF;

    CASE p_action
      WHEN 'approve' THEN
        IF v_target.status <> 'pending' THEN
            RAISE EXCEPTION 'TARGET_NOT_PENDING' USING HINT = 'current status is ' || v_target.status;
        END IF;
        UPDATE commander_home_members
           SET status = 'approved', joined_at = COALESCE(joined_at, NOW())
         WHERE id = v_target.id;
      WHEN 'decline' THEN
        IF v_target.status <> 'pending' THEN RAISE EXCEPTION 'TARGET_NOT_PENDING'; END IF;
        UPDATE commander_home_members SET status='declined' WHERE id = v_target.id;
      WHEN 'ban' THEN
        UPDATE commander_home_members SET status='banned', role='member' WHERE id = v_target.id;
      WHEN 'unban' THEN
        IF v_target.status <> 'banned' THEN RAISE EXCEPTION 'TARGET_NOT_BANNED'; END IF;
        UPDATE commander_home_members SET status='approved' WHERE id = v_target.id;
      WHEN 'promote_admin' THEN
        IF v_target.status <> 'approved' THEN RAISE EXCEPTION 'TARGET_NOT_APPROVED'; END IF;
        IF v_target.role = 'admin' THEN RAISE EXCEPTION 'ALREADY_ADMIN'; END IF;
        UPDATE commander_home_members SET role='admin' WHERE id = v_target.id;
      WHEN 'demote_member' THEN
        IF v_target.role <> 'admin' THEN RAISE EXCEPTION 'TARGET_NOT_ADMIN'; END IF;
        UPDATE commander_home_members SET role='member' WHERE id = v_target.id;
      WHEN 'remove' THEN
        -- Pass 34: set GUC so the DELETE trigger permits this RPC path
        PERFORM set_config('app.hg_member_remove_allowed', '1', true);
        DELETE FROM commander_home_members WHERE id = v_target.id;
        PERFORM set_config('app.hg_member_remove_allowed', '', true);
        -- Audit log entry for the kick
        INSERT INTO commander_home_audit_log
            (group_id, actor_id, target_type, target_id, action, metadata)
        VALUES
            (p_group_id, p_caller_user_id, 'member', p_member_user_id,
             'member_removed',
             jsonb_build_object(
               'removed_role', v_target.role,
               'removed_status', v_target.status
             ));
    END CASE;

    SELECT jsonb_build_object(
        'success', true,
        'action', p_action,
        'member_user_id', p_member_user_id,
        'new_state', CASE WHEN p_action = 'remove' THEN
            jsonb_build_object('removed', true)
        ELSE (
            SELECT jsonb_build_object('status', status, 'role', role, 'joined_at', joined_at)
              FROM commander_home_members WHERE id = v_target.id
        ) END
    ) INTO v_result;

    RETURN v_result;
END;
$function$;