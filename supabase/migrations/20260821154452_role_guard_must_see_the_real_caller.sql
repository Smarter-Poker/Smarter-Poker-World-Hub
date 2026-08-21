-- The bypass guard could not see who was calling it.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'role_guard_must_see_the_real_caller' (version 20260821154452).
-- Supersedes the function body first applied in 20260821154024.
--
-- fn_club_members_role_guard was SECURITY DEFINER, and inside a SECURITY
-- DEFINER function current_user is the function's OWNER, not the caller. The
-- check `current_user NOT IN ('postgres', ...)` therefore compared postgres
-- against postgres on every call and trusted everyone.
--
-- Caught by probing as a real signed-in club owner rather than from a
-- superuser session: the direct UPDATE that ClubMembersPage fell back to went
-- straight through and set role='co_owner', a grant only the club owner should
-- be able to make and only through the matrix.
--
-- A trigger that inspects the caller must run AS the caller. It reads nothing
-- and writes nothing - it only compares OLD.role to NEW.role - so it needs no
-- elevated rights at all.
CREATE OR REPLACE FUNCTION public.fn_club_members_role_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER            -- deliberately: the point is to see the caller
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- fn_club_set_member_role sets this for the duration of its own UPDATE.
    IF COALESCE(current_setting('app.club_role_change', true), '') <> 'on'
       -- migrations, seeds and server-side jobs run as these and are trusted
       AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
      RAISE EXCEPTION
        'club_members.role must be changed through fn_club_set_member_role (attempted % -> %, as %)',
        OLD.role, NEW.role, current_user
        USING ERRCODE = '42501',
              HINT = 'The grant matrix lives in fn_club_grantable_roles. A direct '
                     'update would bypass it, which is what this trigger exists to stop.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
