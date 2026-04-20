-- =====================================================================
-- Pass 36: Ban-evasion fix — banned members cannot self-leave
--
-- BUG (discovered in pass 35 audit):
--   A banned member can call leave_home_group (or direct PostgREST
--   DELETE) to self-DELETE their member row, erasing the ban record.
--   They can then redeem any invite token or self-insert (for public
--   groups) to rejoin as a fresh approved member. The existing
--   'banned' check in redeem_home_group_invite_token only triggers
--   when a banned row exists — delete the row and the check is bypassed.
--
-- FIX:
--   Two layers of defense:
--
--   1. Trigger `fn_enforce_home_members_delete`: refuse self-DELETE
--      when OLD.status = 'banned'. This catches both RPC calls and
--      direct PostgREST DELETE attempts.
--
--   2. RPC `leave_home_group`: explicit status check BEFORE DELETE
--      so the user gets a clean 'BANNED_CANNOT_LEAVE' error instead
--      of the generic trigger error.
--
--   Admin 'remove' (kick) still works (GUC carveout). Admin 'unban'
--   path still works (UPDATE, not DELETE). Service-role bypass still
--   works for migrations and support tooling.
-- ========================================================================

-- Layer 1: trigger
CREATE OR REPLACE FUNCTION public.fn_enforce_home_members_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text := current_user;
  v_active_games int;
BEGIN
  -- Active-host guard fires for EVERYONE unless explicitly skipped
  IF COALESCE(current_setting('app.hg_skip_active_host_check', true), '') <> '1' THEN
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
  END IF;

  -- Service-role / postgres / RPC bypass
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN OLD;
  END IF;

  -- Self-delete: allowed UNLESS status='banned' (ban-evasion prevention)
  IF OLD.user_id = v_caller THEN
    IF OLD.status = 'banned' THEN
      RAISE EXCEPTION 'BANNED_CANNOT_LEAVE'
            USING HINT = 'banned members cannot leave the group to erase the ban record; '
                      || 'contact a group admin if you believe the ban is a mistake';
    END IF;
    RETURN OLD;
  END IF;

  -- Staff kick via RPC (manage_home_group_member sets this GUC)
  IF COALESCE(current_setting('app.hg_member_remove_allowed', true), '') = '1' THEN
    RETURN OLD;
  END IF;

  -- Otherwise: block. Staff must use manage_home_group_member RPC.
  RAISE EXCEPTION 'DIRECT_MEMBER_DELETE_FORBIDDEN'
        USING HINT = 'use manage_home_group_member RPC with action=remove '
                  || 'so the kick is audit-logged and notifications are sent';
END;
$$;

-- Layer 2: RPC explicit check
CREATE OR REPLACE FUNCTION public.leave_home_group(p_group_id uuid, p_caller_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_group       RECORD;
    v_member      RECORD;
    v_existed     boolean := false;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;

    -- Owner cannot leave — must transfer ownership first
    IF v_group.owner_id = p_caller_user_id THEN
        RAISE EXCEPTION 'OWNER_CANNOT_LEAVE'
              USING HINT = 'transfer ownership first, then leave';
    END IF;

    -- Pass 36: banned users cannot self-leave (ban-evasion prevention)
    SELECT * INTO v_member FROM commander_home_members
      WHERE group_id = p_group_id AND user_id = p_caller_user_id;

    IF FOUND AND v_member.status = 'banned' THEN
        RAISE EXCEPTION 'BANNED_CANNOT_LEAVE'
              USING HINT = 'banned members cannot leave to erase the ban record';
    END IF;

    DELETE FROM commander_home_members
     WHERE group_id = p_group_id
       AND user_id = p_caller_user_id
    RETURNING true INTO v_existed;

    RETURN jsonb_build_object(
        'success', true,
        'group_id', p_group_id,
        'already_gone', COALESCE(NOT v_existed, true)
    );
END;
$$;

COMMENT ON FUNCTION public.fn_enforce_home_members_delete() IS
  'Pass 34 + 36: Enforces audit trail on commander_home_members DELETE. '
  'Blocks direct DELETE unless: self-leave (not banned), staff RPC kick '
  '(GUC app.hg_member_remove_allowed=1), or service-role. Active-game-host '
  'guard fires for everyone unless GUC app.hg_skip_active_host_check=1. '
  'Pass 36: self-leave while status=banned is now blocked to prevent ban evasion.';

COMMENT ON FUNCTION public.leave_home_group(uuid, uuid) IS
  'Self-leave a home group. Pass 36: explicitly refuses if caller is banned '
  '(defense in depth — trigger also blocks).';