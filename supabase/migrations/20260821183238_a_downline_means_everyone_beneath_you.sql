-- WHAT AN AGENT'S DOWNLINE ACTUALLY IS, IN ONE PLACE.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'a_downline_means_everyone_beneath_you' (version 20260821183238).
--
-- The two cashier screens disagreed with each other AND with the role
-- hierarchy, in opposite directions:
--
--   CashierPage scoped only 'agent' and 'sub_agent'. A SUPER AGENT fell
--   through to the staff branch and saw the WHOLE CLUB - every player of every
--   other agent - as a chip recipient.
--
--   CashierTradePage did scope super agents, but with
--   `.eq('agent_id', user.id)`: their DIRECT assignees only. A super agent
--   carries agents and those agents carry players, so direct assignment hides
--   most of the people they are responsible for. Measured on SHARK CLUB: 26
--   direct assignees against a real downline of 429.
--
-- The role system already answers this. fn_club_is_in_downline walks
-- club_members.agent_id downwards for the promotion matrix; this exposes the
-- same walk as a list so both screens can ask instead of guessing.
--
-- Staff get NULL rather than a list - "no restriction" is a different answer
-- from "an empty downline", and a caller that cannot tell them apart shows an
-- owner an empty cashier.

CREATE OR REPLACE FUNCTION public.ca_club_my_downline(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
  v_ids  uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('scoped', true, 'user_ids', '[]'::jsonb);
  END IF;

  SELECT role INTO v_role FROM club_members
   WHERE club_id = p_club_id AND user_id = v_uid
     AND status IN ('active','approved');

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('scoped', true, 'user_ids', '[]'::jsonb);
  END IF;

  -- Owner, co-owner and admin see the whole club. NULL, not a list: an empty
  -- list would read as "nobody" and empty their cashier.
  IF v_role IN ('owner','co_owner','admin') THEN
    RETURN jsonb_build_object('scoped', false, 'role', v_role, 'user_ids', NULL);
  END IF;

  -- Everyone beneath this member, however many levels down.
  WITH RECURSIVE dl AS (
    SELECT cm.user_id, 1 AS depth
      FROM club_members cm
     WHERE cm.club_id = p_club_id AND cm.agent_id = v_uid
    UNION
    SELECT cm.user_id, dl.depth + 1
      FROM club_members cm
      JOIN dl ON cm.agent_id = dl.user_id
     WHERE cm.club_id = p_club_id
       AND dl.depth < 20   -- a malformed cycle must not spin forever
  )
  SELECT array_agg(DISTINCT user_id) INTO v_ids FROM dl;

  RETURN jsonb_build_object(
    'scoped', true, 'role', v_role,
    'user_ids', COALESCE(to_jsonb(v_ids), '[]'::jsonb));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ca_club_my_downline(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ca_club_my_downline(uuid) TO authenticated;
