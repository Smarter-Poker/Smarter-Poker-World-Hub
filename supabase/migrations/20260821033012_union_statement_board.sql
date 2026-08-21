-- THE UNION SIDE OF THE WEEKLY SQUARE-UP: the overseer check.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'union_statement_board' (version 20260821033012). The board function itself
-- was corrected minutes later in 20260821033115 (clubs.club_code does not
-- exist; the columns are clubs.code and clubs.slug) - see that file for the
-- definition that is live. This file carries the authz helper, which is
-- unchanged.
--
-- Until this, statements were only readable from the club that received one:
-- ca_club_union_invoices takes a club_id and gates on club finance rights. The
-- union lead - the person who has to chase the money - had no screen at all,
-- and no way to see that a club was MISSED, which is the failure that matters
-- most and the one a per-club view structurally cannot show.
CREATE OR REPLACE FUNCTION public.ca_can_oversee_union(p_union_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_union_id IS NULL THEN RETURN false; END IF;
  IF fn_is_union_overseer(p_union_id, v_uid) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM profiles p
                  WHERE p.id = v_uid AND COALESCE(p.is_admin, false));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ca_can_oversee_union(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ca_can_oversee_union(uuid) TO authenticated;
