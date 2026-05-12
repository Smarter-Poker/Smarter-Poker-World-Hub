-- Dan-fix/audit-5 (2026-05-11): two production tables had self-referential
-- RLS policies that infinitely recurse when queried as authenticated:
--
-- 1) messenger_participants:
--    - "Users can view conversation participants" (SELECT) subselects
--      FROM messenger_participants WHERE user_id = auth.uid()
--      → that subselect re-applies the same SELECT policy → infinite recursion
--    - "Admins can manage participants" (DELETE) had the same bug
--
-- 2) commander_staff: captain_staff_select / _update / _insert all subselect
--    from commander_staff under role/active filters
--
-- Verified via probe: any authenticated SELECT/UPDATE/DELETE on these
-- tables returns "ERROR: 42P17: infinite recursion detected in policy".
-- This breaks the messenger UI (any conversation listing) and any commander
-- staff management UI that goes through PostgREST.
--
-- The home-games create cascade was UNAFFECTED because INSERTs into
-- messenger_participants only hit the INSERT policy (WITH CHECK user_id =
-- auth.uid()) which doesn't subselect. But once the messenger UI loads
-- after the group is created, the recursion fires.
--
-- Fix: introduce SECDEF helper functions that bypass RLS internally and
-- check membership against a passed-in id + auth.uid(). Helpers are
-- STABLE/PARALLEL SAFE/no-PII surface. Then rewrite each broken policy
-- to call the helper instead of self-subselecting.

CREATE OR REPLACE FUNCTION public.fn_user_in_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  SELECT EXISTS(
    SELECT 1 FROM public.messenger_participants mp
    WHERE mp.conversation_id = p_conversation_id
      AND mp.user_id = (SELECT auth.uid())
  );
$f$;

CREATE OR REPLACE FUNCTION public.fn_user_is_conversation_admin(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  SELECT EXISTS(
    SELECT 1 FROM public.messenger_participants mp
    WHERE mp.conversation_id = p_conversation_id
      AND mp.user_id = (SELECT auth.uid())
      AND mp.role IN ('owner', 'admin')
  );
$f$;

CREATE OR REPLACE FUNCTION public.fn_user_is_active_staff_at_venue(p_venue_id integer)
RETURNS boolean
LANGUAGE sql
STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  SELECT EXISTS(
    SELECT 1 FROM public.commander_staff cs
    WHERE cs.venue_id = p_venue_id
      AND cs.user_id = (SELECT auth.uid())
      AND cs.is_active = true
  );
$f$;

CREATE OR REPLACE FUNCTION public.fn_user_is_venue_manager(p_venue_id integer)
RETURNS boolean
LANGUAGE sql
STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  SELECT EXISTS(
    SELECT 1 FROM public.commander_staff cs
    WHERE cs.venue_id = p_venue_id
      AND cs.user_id = (SELECT auth.uid())
      AND cs.role IN ('owner', 'manager')
      AND cs.is_active = true
  );
$f$;

REVOKE EXECUTE ON FUNCTION public.fn_user_in_conversation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_user_is_conversation_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_user_is_active_staff_at_venue(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_user_is_venue_manager(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_user_in_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_is_conversation_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_is_active_staff_at_venue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_is_venue_manager(integer) TO authenticated;

DROP POLICY IF EXISTS "Users can view conversation participants" ON public.messenger_participants;
DROP POLICY IF EXISTS "Admins can manage participants" ON public.messenger_participants;

CREATE POLICY "Users can view conversation participants"
  ON public.messenger_participants FOR SELECT TO public
  USING ( public.fn_user_in_conversation(conversation_id) );

CREATE POLICY "Admins can manage participants"
  ON public.messenger_participants FOR DELETE TO public
  USING ( public.fn_user_is_conversation_admin(conversation_id) );

DROP POLICY IF EXISTS "captain_staff_select" ON public.commander_staff;
DROP POLICY IF EXISTS "captain_staff_update" ON public.commander_staff;
DROP POLICY IF EXISTS "captain_staff_insert" ON public.commander_staff;

CREATE POLICY "captain_staff_select"
  ON public.commander_staff FOR SELECT TO public
  USING (
    user_id = (SELECT auth.uid())
    OR public.fn_user_is_active_staff_at_venue(venue_id)
  );

CREATE POLICY "captain_staff_update"
  ON public.commander_staff FOR UPDATE TO public
  USING ( public.fn_user_is_venue_manager(venue_id) );

CREATE POLICY "captain_staff_insert"
  ON public.commander_staff FOR INSERT TO public
  WITH CHECK ( public.fn_user_is_venue_manager(venue_id) );
