-- THE CLUB MESSENGER HAS NEVER WORKED.
--
-- messages carries a live trigger, tr_check_club_message_permission, whose
-- body calls fn_can_message_in_club(sender, receiver, club). That function
-- does not exist in the database. Every attempt to insert a message into a
-- club conversation therefore raised
--   42883: function fn_can_message_in_club(uuid, uuid, uuid) does not exist
-- and rolled back. public.messages held 0 rows, which is the symptom, not a
-- coincidence: nothing had ever been sent through it.
--
-- Found while wiring the weekly union statement into the messenger, which is
-- the channel Dan wants invoices delivered on. The statement could not be
-- delivered until this was restored.
--
-- The policy below is reconstructed from what the trigger clearly intended --
-- it only guards conversations with category 'club' and a club_id, and it
-- takes sender, receiver and club. Rules, deliberately conservative:
--
--   ALLOWED
--     * union owner or union admin of the union that owns the club, to anyone
--       (this is what lets the weekly statement through)
--     * the club owner, either direction
--     * club staff either way -- owner, admin, super_agent, agent
--     * an agent and their own downline player, either direction
--     * a self-thread, which is how a statement reaches a club owner who is
--       also the union owner
--     * platform admins
--
--   BLOCKED
--     * plain player to plain player with no staff or agent relationship.
--       Two unrelated players cannot open a private channel inside a club.
--       This is the anti-collusion default and matches how club apps behave.
--     * anyone banned or suspended in that club, in either direction.
--
-- If the intended policy was broader, widen this function -- but it must
-- exist, because the trigger will keep calling it.
--
-- Applied to production via Supabase MCP as
-- 'restore_missing_fn_can_message_in_club'.
CREATE OR REPLACE FUNCTION public.fn_can_message_in_club(
  p_sender uuid, p_receiver uuid, p_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT cm.role, cm.agent_id, COALESCE(cm.status, 'active') AS status
      FROM club_members cm
     WHERE cm.club_id = p_club_id AND cm.user_id = p_sender
     LIMIT 1
  ),
  r AS (
    SELECT cm.role, cm.agent_id, COALESCE(cm.status, 'active') AS status
      FROM club_members cm
     WHERE cm.club_id = p_club_id AND cm.user_id = p_receiver
     LIMIT 1
  ),
  own AS (
    SELECT c.owner_id, c.union_id FROM clubs c WHERE c.id = p_club_id
  )
  SELECT
    COALESCE((SELECT s.status FROM s), 'active') NOT IN ('banned', 'suspended')
    AND COALESCE((SELECT r.status FROM r), 'active') NOT IN ('banned', 'suspended')
    AND (
         EXISTS (SELECT 1 FROM own o JOIN unions u ON u.id = o.union_id
                  WHERE u.owner_id = p_sender)
      OR EXISTS (SELECT 1 FROM own o JOIN union_admins ua ON ua.union_id = o.union_id
                  WHERE ua.user_id = p_sender)
      OR EXISTS (SELECT 1 FROM own o WHERE o.owner_id = p_sender)
      OR EXISTS (SELECT 1 FROM own o WHERE o.owner_id = p_receiver)
      OR COALESCE((SELECT s.role FROM s), '') IN ('owner','admin','super_agent','agent')
      OR COALESCE((SELECT r.role FROM r), '') IN ('owner','admin','super_agent','agent')
      OR (SELECT r.agent_id FROM r) = p_sender
      OR (SELECT s.agent_id FROM s) = p_receiver
      OR p_sender = p_receiver
      OR EXISTS (SELECT 1 FROM profiles pr
                  WHERE pr.id = p_sender AND COALESCE(pr.is_admin, false))
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_can_message_in_club(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_can_message_in_club(uuid, uuid, uuid) TO authenticated;

DO $$
DECLARE v_union uuid := 'fade0000-0000-0000-0000-000000000001';
        v_club  uuid := 'a0000000-0000-0000-0000-000000000001';
        v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM unions WHERE id = v_union;

  IF NOT fn_can_message_in_club(v_owner, v_owner, v_club) THEN
    RAISE EXCEPTION 'union owner cannot deliver a statement to their own club';
  END IF;

  IF fn_can_message_in_club('00000000-0000-0000-0000-0000000000aa',
                            '00000000-0000-0000-0000-0000000000bb', v_club) THEN
    RAISE EXCEPTION 'player to player messaging is not supposed to be open';
  END IF;

  RAISE NOTICE 'fn_can_message_in_club restored';
END $$;
