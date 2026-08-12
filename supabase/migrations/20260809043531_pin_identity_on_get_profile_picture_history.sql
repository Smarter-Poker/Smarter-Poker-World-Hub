-- Mirrored from the live database on 2026-08-09. Applied via MCP as migration 20260809043531_pin_identity_on_get_profile_picture_history.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- get_profile_picture_history(p_user_id) is SECURITY DEFINER, executable by
-- every authenticated user, and took the target user id as a parameter with
-- no auth.uid() check. Because it is definer-owned it bypasses RLS on
-- profile_picture_history, so any logged-in account could pass another
-- person's uuid and receive up to 20 of their previous profile photos —
-- including images that user had already replaced and reasonably believed
-- were no longer on display.
--
-- A revoke is the wrong fix here: unlike the functions revoked in
-- 20260809022000, this one HAS a real browser caller. But that caller is
-- narrow and was verified: ProfilePictureHistory.js is rendered only from
-- pages/hub/profile-edit.js (via BasicInfoSection.js), i.e. a user editing
-- their OWN profile. It never legitimately requests another user's history.
--
-- So the correct fix is an internal identity pin, the same pattern already
-- used by has_commander_access in this database: resolve the caller's own
-- identity from auth.uid() and ignore the supplied parameter, UNLESS the
-- caller is the service role, which server routes use and which must retain
-- full capability.
--
-- Behaviour for the shipping client is unchanged — it passes its own id, and
-- auth.uid() resolves to that same id. What changes is that passing someone
-- else's uuid now returns that caller's own history instead of the victim's.
-- Only the WHERE predicate is altered; the returned columns, ordering and
-- LIMIT are untouched.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_profile_picture_history(p_user_id uuid)
 RETURNS TABLE(url text, media_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_target uuid;
BEGIN
    -- service_role (server routes) keeps full capability; everyone else is
    -- pinned to their own identity regardless of what they passed in.
    IF current_setting('role', true) = 'service_role' OR auth.uid() IS NULL AND current_user = 'postgres' THEN
        v_target := p_user_id;
    ELSE
        v_target := (SELECT auth.uid());
    END IF;

    IF v_target IS NULL THEN
        RETURN;  -- no session and not privileged: return nothing rather than leak
    END IF;

    RETURN QUERY
        SELECT pph.url, pph.media_id, pph.created_at
        FROM profile_picture_history pph
        WHERE pph.user_id = v_target
        ORDER BY pph.created_at DESC
        LIMIT 20;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_profile_picture_history(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_profile_picture_history(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_profile_picture_history'
      AND p.prosrc LIKE '%auth.uid()%') THEN
    RAISE EXCEPTION 'identity pin was not applied';
  END IF;
  IF NOT has_function_privilege('authenticated','public.get_profile_picture_history(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated lost access — the profile-edit page would break';
  END IF;
END $$;
