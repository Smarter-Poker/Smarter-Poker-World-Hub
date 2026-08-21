-- CLUB ROLES: SEVEN OF THEM, AND ONE PLACE THAT CAN GRANT THEM.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'club_roles_seven_roles_and_grant_matrix' (version 20260821153932).
--
-- Dan: "ALL USERS IN CLUBS AND UNIONS NEED ROLES ASSIGNED TO THEM: OWNER,
-- ADMIN, SUPER AGENT, AGENT, SUB AGENT AND PLAYER... ONLY OWNERS START WITH A
-- ROLE WHEN THEY CREATE A CLUB, AS PLAYERS JOIN THEIR CLUB, OWNERS CAN UPGRADE
-- A PLAYER TO ANY ROLE STATUS, INCLUDING CO OWNER. CO OWNERS AND ADMINS CAN
-- PROMOTE ANY USER AS HIGH AS ADMIN STATUS. SUPER AGENTS CAN PROMOTE ANY
-- PLAYER IN THEIR DOWNLINES TO BE AN AGENT TO WORK UNDER THEM, AGENTS CAN
-- PROMOTE ANY PLAYER IN THEIR DOWNLINE TO BE A SUB AGENT UNDER THEM."
--
-- A ROLE IS A JOB, NOT A GATE ON PLAYING. Nothing in seating, buy-in or
-- tournament registration reads club_members.role. An owner is a player who
-- also owns the club.

UPDATE club_members SET role = 'player'
 WHERE role IS NULL OR role IN ('member', 'manager', 'guest');

CREATE OR REPLACE FUNCTION public.fn_club_role_rank(p_role text)
RETURNS integer LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE p_role
    WHEN 'owner' THEN 100 WHEN 'co_owner' THEN 90 WHEN 'admin' THEN 80
    WHEN 'super_agent' THEN 60 WHEN 'agent' THEN 40 WHEN 'sub_agent' THEN 20
    WHEN 'player' THEN 0 ELSE -1 END;
$function$;

-- club_members.agent_id holds the USER id of whoever this member reports to.
-- A super agent's downline is everyone reachable downwards, not only their
-- direct assignees: an agent's players are in their super agent's downline.
CREATE OR REPLACE FUNCTION public.fn_club_is_in_downline(
  p_club_id uuid, p_upline_user_id uuid, p_member_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_found boolean;
BEGIN
  IF p_upline_user_id IS NULL OR p_member_user_id IS NULL
     OR p_upline_user_id = p_member_user_id THEN RETURN false; END IF;

  WITH RECURSIVE dl AS (
    SELECT cm.user_id, 1 AS depth FROM club_members cm
     WHERE cm.club_id = p_club_id AND cm.agent_id = p_upline_user_id
    UNION
    SELECT cm.user_id, dl.depth + 1 FROM club_members cm
      JOIN dl ON cm.agent_id = dl.user_id
     WHERE cm.club_id = p_club_id AND dl.depth < 20  -- a cycle must not spin
  )
  SELECT EXISTS (SELECT 1 FROM dl WHERE dl.user_id = p_member_user_id) INTO v_found;
  RETURN COALESCE(v_found, false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_club_is_in_downline(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_is_in_downline(uuid, uuid, uuid) TO authenticated;

-- The grant matrix, in one place. Both the writer and the screen read it, so
-- the UI cannot advertise something the write will refuse.
CREATE OR REPLACE FUNCTION public.fn_club_grantable_roles(
  p_club_id uuid, p_actor_user_id uuid, p_target_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_role text; v_target_role text; v_platform_admin boolean := false;
BEGIN
  IF p_actor_user_id IS NULL OR p_target_user_id IS NULL THEN RETURN '{}'; END IF;
  -- Nobody edits their own title.
  IF p_actor_user_id = p_target_user_id THEN RETURN '{}'; END IF;

  SELECT role INTO v_actor_role FROM club_members
   WHERE club_id = p_club_id AND user_id = p_actor_user_id AND status IN ('active','approved');
  SELECT role INTO v_target_role FROM club_members
   WHERE club_id = p_club_id AND user_id = p_target_user_id AND status IN ('active','approved');
  IF v_target_role IS NULL THEN RETURN '{}'; END IF;

  SELECT COALESCE(is_admin, false) INTO v_platform_admin FROM profiles WHERE id = p_actor_user_id;
  IF v_actor_role IS NULL AND NOT v_platform_admin THEN RETURN '{}'; END IF;

  -- Handing over a club is its own act, not a dropdown on the members list.
  IF v_target_role = 'owner' THEN RETURN '{}'; END IF;

  IF v_platform_admin OR v_actor_role = 'owner' THEN
    RETURN ARRAY['co_owner','admin','super_agent','agent','sub_agent','player'];
  END IF;

  IF v_actor_role IN ('co_owner','admin') THEN
    -- "as high as admin", and never at or above your own rank
    IF fn_club_role_rank(v_target_role) >= fn_club_role_rank(v_actor_role) THEN RETURN '{}'; END IF;
    RETURN ARRAY['admin','super_agent','agent','sub_agent','player'];
  END IF;

  IF v_actor_role = 'super_agent' THEN
    IF v_target_role IN ('player','agent')
       AND fn_club_is_in_downline(p_club_id, p_actor_user_id, p_target_user_id)
      THEN RETURN ARRAY['agent','player']; END IF;
    RETURN '{}';
  END IF;

  IF v_actor_role = 'agent' THEN
    IF v_target_role IN ('player','sub_agent')
       AND fn_club_is_in_downline(p_club_id, p_actor_user_id, p_target_user_id)
      THEN RETURN ARRAY['sub_agent','player']; END IF;
    RETURN '{}';
  END IF;

  RETURN '{}';   -- sub agents and players promote nobody
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_club_grantable_roles(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_grantable_roles(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ca_club_grantable_roles(
  p_club_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_roles text[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('roles', '[]'::jsonb); END IF;
  v_roles := fn_club_grantable_roles(p_club_id, auth.uid(), p_target_user_id);
  RETURN jsonb_build_object(
    'roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb),
    'target_role', (SELECT role FROM club_members WHERE club_id = p_club_id
                     AND user_id = p_target_user_id AND status IN ('active','approved')),
    'actor_role', (SELECT role FROM club_members WHERE club_id = p_club_id
                    AND user_id = auth.uid() AND status IN ('active','approved')));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ca_club_grantable_roles(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ca_club_grantable_roles(uuid, uuid) TO authenticated;
