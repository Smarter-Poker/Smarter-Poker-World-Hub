-- Dan-fix/audit-3-followup (2026-05-11): the previous migration granted EXECUTE
-- on the fn_ensure_social_page_for_* helpers to authenticated. With SECURITY
-- DEFINER on those functions, that creates an abuse vector — a malicious
-- authenticated user could call them with arbitrary entity IDs and create
-- social_pages for entities they don't own.
--
-- Revoke the grants, and instead make the OUTER autocreate trigger fns SECDEF
-- so the PERFORM of the inner (now-SECDEF) helpers happens as postgres (which
-- has EXECUTE as owner). Restores the documented "create social_page on
-- entity creation" behavior without exposing the inner helpers directly.

REVOKE EXECUTE ON FUNCTION public.fn_ensure_social_page_for_home_group(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ensure_social_page_for_club(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ensure_social_page_for_venue(integer) FROM authenticated;

CREATE OR REPLACE FUNCTION public.trg_fn_autocreate_home_group_social_page()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.fn_ensure_social_page_for_home_group(NEW.id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'autocreate home_group social_page failed for group=%: %', NEW.id, SQLERRM;
    RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.trg_fn_autocreate_club_social_page()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.fn_ensure_social_page_for_club(NEW.id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'autocreate club social_page failed for club=%: %', NEW.id, SQLERRM;
    RETURN NEW;
END; $function$;
