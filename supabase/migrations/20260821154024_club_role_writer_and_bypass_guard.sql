-- ONE WRITER FOR club_members.role, AND A GUARD THAT MAKES IT THE ONLY ONE.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'club_role_writer_and_bypass_guard' (version 20260821154024). The guard
-- function was corrected minutes later in 20260821154452 - see that file.
--
-- WHY A GUARD AND NOT JUST A FUNCTION. The RLS policy on club_members lets any
-- club admin update any member row to any value, and ClubMembersPage fell back
-- to exactly that `.from('club_members').update({ role })` whenever the RPC
-- errored. Every rule below was one failed request away from being bypassed,
-- including "only the owner may appoint a co-owner".

CREATE OR REPLACE FUNCTION public.fn_club_set_member_role(
  p_club_id uuid, p_user_id uuid, p_role text, p_actor_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid; v_old_role text; v_actor_role text; v_allowed text[];
  v_downline int; v_agent_id uuid; v_parent uuid; v_set_upline boolean := false;
BEGIN
  -- Non-spoofable: a signed-in caller is always themselves. Only a service
  -- role caller (auth.uid() IS NULL) may name the actor.
  v_actor := COALESCE(auth.uid(), p_actor_user_id);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'actor identity required');
  END IF;

  -- 'owner' is absent deliberately: a club has one owner, and handing it over
  -- is its own act, not a dropdown on the members list.
  IF p_role IS NULL OR p_role NOT IN
     ('co_owner','admin','super_agent','agent','sub_agent','player') THEN
    RETURN jsonb_build_object('success', false,
      'error', 'invalid role: ' || COALESCE(p_role,'null'));
  END IF;

  SELECT role INTO v_old_role FROM club_members
   WHERE club_id = p_club_id AND user_id = p_user_id
     AND status IN ('active','approved') FOR UPDATE;
  IF v_old_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'target is not a member of this club');
  END IF;
  IF v_old_role = p_role THEN
    RETURN jsonb_build_object('success', true, 'unchanged', true, 'role', p_role);
  END IF;

  v_allowed := fn_club_grantable_roles(p_club_id, v_actor, p_user_id);
  IF NOT (p_role = ANY (v_allowed)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not permitted to set this role',
      'allowed', COALESCE(to_jsonb(v_allowed), '[]'::jsonb));
  END IF;

  SELECT role INTO v_actor_role FROM club_members
   WHERE club_id = p_club_id AND user_id = v_actor AND status IN ('active','approved');

  -- Stepping someone out of an agent role while people still report to them
  -- leaves those people pointing at an upline who is no longer one. Refuse and
  -- say how many, rather than silently orphaning a downline.
  IF fn_club_role_rank(v_old_role) > fn_club_role_rank(p_role)
     AND v_old_role IN ('super_agent','agent','sub_agent') THEN
    SELECT count(*) INTO v_downline FROM club_members
     WHERE club_id = p_club_id AND agent_id = p_user_id;
    IF v_downline > 0 THEN
      RETURN jsonb_build_object('success', false,
        'error', 'this member still has ' || v_downline || ' player'
                 || CASE WHEN v_downline = 1 THEN '' ELSE 's' END
                 || ' reporting to them. Move them to another agent first.',
        'downline_count', v_downline);
    END IF;
  END IF;

  -- "to work under them": when a super agent makes an agent, or an agent makes
  -- a sub agent, the appointee reports to whoever appointed them. An owner or
  -- admin doing the same leaves any existing upline alone - they are not in
  -- that chain themselves.
  v_set_upline := v_actor_role IN ('super_agent','agent') AND p_role IN ('agent','sub_agent');

  PERFORM set_config('app.club_role_change', 'on', true);
  UPDATE club_members
     SET role = p_role,
         agent_id = CASE WHEN v_set_upline THEN v_actor ELSE agent_id END,
         updated_at = now()
   WHERE club_id = p_club_id AND user_id = p_user_id;
  PERFORM set_config('app.club_role_change', '', true);

  -- Keep the agents table in step: it carries commission, credit and the tree.
  IF p_role IN ('super_agent','agent','sub_agent') THEN
    SELECT id INTO v_agent_id FROM agents WHERE club_id = p_club_id AND user_id = p_user_id;
    IF v_set_upline THEN
      SELECT id INTO v_parent FROM agents WHERE club_id = p_club_id AND user_id = v_actor;
    END IF;
    IF v_agent_id IS NOT NULL THEN
      UPDATE agents SET role = p_role, status = 'active',
             parent_agent_id = COALESCE(v_parent, parent_agent_id), updated_at = now()
       WHERE id = v_agent_id;
    ELSE
      INSERT INTO agents (club_id, user_id, role, status, parent_agent_id,
                          commission_rate, player_rakeback_rate, credit_limit)
      VALUES (p_club_id, p_user_id, p_role, 'active', v_parent,
              CASE WHEN p_role = 'super_agent' THEN 0.50 ELSE 0.30 END,
              CASE WHEN p_role = 'super_agent' THEN 0.30 ELSE 0.20 END, 0)
      RETURNING id INTO v_agent_id;
    END IF;
  ELSIF v_old_role IN ('super_agent','agent','sub_agent') THEN
    -- Suspended, not deleted: commission history references this row.
    UPDATE agents SET status = 'suspended', updated_at = now()
     WHERE club_id = p_club_id AND user_id = p_user_id;
  END IF;

  INSERT INTO audit_trail (actor_id, actor_role, action, target_type, target_id,
                           club_id, before_state, after_state, reason)
  VALUES (v_actor, COALESCE(v_actor_role, 'platform_admin'), 'set_member_role',
          'club_member', p_user_id, p_club_id,
          jsonb_build_object('role', v_old_role),
          jsonb_build_object('role', p_role, 'upline_set', v_set_upline),
          'Role changed via fn_club_set_member_role');

  RETURN jsonb_build_object('success', true, 'old_role', v_old_role, 'new_role', p_role,
                            'reports_to', CASE WHEN v_set_upline THEN v_actor ELSE NULL END);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_club_set_member_role(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_set_member_role(uuid, uuid, text, uuid) TO authenticated;

DROP TRIGGER IF EXISTS trg_club_members_role_guard ON public.club_members;
CREATE TRIGGER trg_club_members_role_guard
  BEFORE UPDATE ON public.club_members
  FOR EACH ROW EXECUTE FUNCTION public.fn_club_members_role_guard();

-- The old entry point delegates, so existing callers get the new rules.
CREATE OR REPLACE FUNCTION public.promote_member(
  p_club_id uuid, p_target_user_id uuid, p_new_role text, p_promoted_by uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_role text := p_new_role;
BEGIN
  -- 'member', 'manager' and 'guest' were all ways of saying "not staff".
  IF v_role IN ('member','manager','guest') THEN v_role := 'player'; END IF;
  RETURN fn_club_set_member_role(p_club_id, p_target_user_id, v_role, p_promoted_by);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.promote_member(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.promote_member(uuid, uuid, text, uuid) TO authenticated;
