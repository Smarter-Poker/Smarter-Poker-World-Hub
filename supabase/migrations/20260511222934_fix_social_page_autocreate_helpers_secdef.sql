-- Dan-fix/audit-3 (2026-05-11): three social_page autocreate helpers were
-- silently failing in their respective trigger cascades. Outer triggers had
-- EXCEPTION WHEN OTHERS RAISE WARNING which swallowed the 42501. Currently
-- each entity-type's social_page is only created via fallback paths.

ALTER FUNCTION public.fn_ensure_social_page_for_home_group(uuid) SECURITY DEFINER;
ALTER FUNCTION public.fn_ensure_social_page_for_club(uuid) SECURITY DEFINER;
ALTER FUNCTION public.fn_ensure_social_page_for_venue(integer) SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fn_ensure_social_page_for_home_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ensure_social_page_for_club(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ensure_social_page_for_venue(integer) TO authenticated;
