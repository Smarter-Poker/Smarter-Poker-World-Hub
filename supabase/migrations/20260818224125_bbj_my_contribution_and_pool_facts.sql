-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18 via mcp apply_migration
-- (version 20260818224125, name bbj_my_contribution_and_pool_facts)
-- Mirror of the applied migration (decoded from schema_migrations). Do not re-run.
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- BBJ PLAYER-FACING FACTS (2026-08-18)
-- ══════════════════════════════════════════════════════════════════════════
-- Two defects on the live jackpot page this replaces:
--
-- 1. "Your Contribution" read bbj_contributions.player_id — a column that is
--    NULL on all 550,782 rows (bbj_record_contribution never writes it). The
--    card therefore ALWAYS computed 0 and never rendered, after pulling up to
--    10,000 rows to the client to discover that.
--
-- 2. "Hands Dealt" displayed bbj_pools.total_contributed, which is a CHIP
--    AMOUNT, not a hand count. And the pool's hands_contributed counter has
--    drifted from the ledger (161,442 vs 261,316 actual rows), so counting
--    from the ledger is the only honest source — the same lesson §41 paid for.
--
-- The BBJ fee is taken from the POT, which every player in the hand funded.
-- rake_records.player_contributions maps user_id -> chips that player put in,
-- so a player's honest share of a hand's jackpot fee is
--   fee * (their pot contribution / pot size).
-- That is what this returns. Uses the existing GIN index on
-- player_contributions (measured 134ms warm over 90 days).
--
-- PRIVACY: computes for auth.uid() ONLY. A caller cannot pass someone else's
-- id, so this cannot be used to profile other players' spend.

CREATE OR REPLACE FUNCTION public.fn_bbj_my_contribution(
  p_pool_id uuid,
  p_days integer DEFAULT 90
)
RETURNS TABLE (
  attributed_chips numeric,
  hands_contributed bigint,
  days_covered integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_club_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 0::numeric, 0::bigint, p_days;
    RETURN;
  END IF;

  -- Clubs whose hands fund THIS pool (union pool => every club in the union).
  SELECT ARRAY(
    SELECT c.id FROM public.clubs c
    WHERE c.union_id = (SELECT bp.union_id FROM public.bbj_pools bp WHERE bp.id = p_pool_id)
       OR c.id = (SELECT bp.club_id FROM public.bbj_pools bp WHERE bp.id = p_pool_id)
  ) INTO v_club_ids;

  IF v_club_ids IS NULL OR array_length(v_club_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0::numeric, 0::bigint, p_days;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ROUND(COALESCE(SUM(
      rr.bbj_contribution
      * ((rr.player_contributions->>v_uid::text)::numeric)
      / NULLIF(rr.pot_size, 0)
    ), 0), 2),
    COUNT(*)::bigint,
    p_days
  FROM public.rake_records rr
  WHERE rr.player_contributions ? v_uid::text
    AND rr.club_id = ANY(v_club_ids)
    AND COALESCE(rr.bbj_contribution, 0) > 0
    AND rr.created_at > now() - make_interval(days => p_days)
    AND COALESCE((rr.player_contributions->>v_uid::text)::numeric, 0) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_bbj_my_contribution(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bbj_my_contribution(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_bbj_my_contribution(uuid, integer) IS
  'A player''s honest attributed share of jackpot fees (fee * their pot share), for auth.uid() only. Replaces the dead player_id-based card that always read 0.';

-- ── Pool facts anyone may see: real hand count from the LEDGER, not counters ──
CREATE OR REPLACE FUNCTION public.fn_bbj_pool_facts(p_pool_id uuid)
RETURNS TABLE (
  hands_contributed bigint,
  total_contributed numeric,
  first_contribution_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint,
         ROUND(COALESCE(SUM(amount), 0), 2),
         MIN(created_at)
  FROM public.bbj_contributions
  WHERE pool_id = p_pool_id;
$$;

REVOKE ALL ON FUNCTION public.fn_bbj_pool_facts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bbj_pool_facts(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_bbj_pool_facts(uuid) IS
  'Hand count + chips contributed for a BBJ pool, counted from bbj_contributions (the ledger) because the bbj_pools counters have drifted.';