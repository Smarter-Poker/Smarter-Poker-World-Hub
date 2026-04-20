-- Pass 34b: SECURITY INVOKER fix. Under SECURITY DEFINER, current_user always
-- resolves to the function owner (postgres), making the bypass hit every call.
-- Same lesson as pass 11 (fn_enforce_seat_reservation_immutability) and
-- pass 20b (fn_enforce_home_poll_vote_integrity).
--
-- Under SECURITY INVOKER:
--   - Direct PostgREST DELETE by authenticated: current_user='authenticated' → enforcement runs
--   - SECURITY DEFINER RPC (manage_home_group_member): body runs as postgres → bypass works
--   - Active-host guard still fires because it's above the bypass branches
--
-- auth.uid() still reads from JWT GUCs under SECURITY INVOKER.
-- Reading commander_home_games works because authenticated has RLS-scoped SELECT.

CREATE OR REPLACE FUNCTION public.fn_enforce_home_members_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_role text := current_user;
  v_active_games int;
BEGIN
  -- Active-host guard fires for EVERYONE (including service-role unless explicitly skipped)
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

  -- Service-role / postgres / RPC bypass (these legitimately skip the audit requirement
  -- because they either ARE the RPC writing the audit log, or they're a service script).
  IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                'supabase_auth_admin', 'supabase_storage_admin') THEN
    RETURN OLD;
  END IF;

  -- Self-delete: always allowed (legit self-leave)
  IF OLD.user_id = v_caller THEN
    RETURN OLD;
  END IF;

  -- Staff kick via RPC: GUC carveout (RPC sets this before DELETE, after audit-logging)
  IF COALESCE(current_setting('app.hg_member_remove_allowed', true), '') = '1' THEN
    RETURN OLD;
  END IF;

  -- Otherwise: block. Staff must use manage_home_group_member RPC.
  RAISE EXCEPTION 'DIRECT_MEMBER_DELETE_FORBIDDEN'
        USING HINT = 'use manage_home_group_member RPC with action=remove '
                  || 'so the kick is audit-logged and notifications are sent';
END;
$function$;