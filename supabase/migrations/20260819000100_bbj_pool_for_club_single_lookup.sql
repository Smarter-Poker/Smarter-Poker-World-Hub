-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18 via mcp apply_migration
-- (name bbj_pool_for_club_single_lookup). Mirror only. Do not re-run.
-- ═══════════════════════════════════════════════════════════════════════════
-- "Union clubs bank the jackpot in the UNION pool" was re-implemented by hand
-- in four different client surfaces, and got it WRONG in three of them:
--   * the table banner showed $0 for union clubs
--   * the lobby ticker showed $0
--   * DynamicWallet showed $0 (and subscribed to a row it never read)
--   * BBJService.getPool resolved club-only
-- The rule itself was never the problem — having four copies of it was.
-- This is now the single definition, and it collapses the 2-3 sequential
-- round trips each surface made (tables -> clubs -> bbj_pools) into ONE call.

CREATE OR REPLACE FUNCTION public.fn_bbj_pool_for_club(p_club_id uuid)
RETURNS TABLE (
  pool_id uuid,
  main_balance numeric,
  backup_balance numeric,
  promo_balance numeric,
  is_union_pool boolean,
  union_id uuid
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH club AS (
    SELECT c.id, c.union_id FROM public.clubs c WHERE c.id = p_club_id
  )
  SELECT bp.id,
         bp.main_balance,
         bp.backup_balance,
         bp.promo_balance,
         bp.union_id IS NOT NULL,
         bp.union_id
  FROM public.bbj_pools bp, club
  WHERE bp.status = 'active'
    AND (
      (club.union_id IS NOT NULL AND bp.union_id = club.union_id)
      OR (club.union_id IS NULL AND bp.club_id = club.id)
    )
  ORDER BY (bp.union_id IS NOT NULL) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fn_bbj_pool_for_club(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bbj_pool_for_club(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_bbj_pool_for_club(uuid) IS
  'The BBJ pool a club plays for: union pool when the club is in a union, else its own. Single source of the union rule that four client surfaces each re-implemented (three incorrectly), and one round trip instead of two or three.';
