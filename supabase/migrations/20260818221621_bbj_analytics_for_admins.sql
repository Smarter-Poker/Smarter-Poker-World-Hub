-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18 via mcp apply_migration
-- (version 20260818221621, name bbj_analytics_for_admins)
-- Mirror of the applied migration (decoded from schema_migrations). Do not re-run.
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- BBJ ANALYTICS (2026-08-18)
-- ═══════════════════════════════════════════════════════════════════════════
-- Club admins had no view of the jackpot's health: how fast it funds, how
-- often it pays, whether it is growing or stalling. This returns the whole
-- picture in one round trip, computed from the AUTHORITATIVE tables
-- (bbj_contributions + bbj_winners), never the legacy counters that §41
-- had to reconcile away.
--
-- SECURITY: SECURITY DEFINER + an explicit club-admin check on the pool's
-- owning club (or any club in the owning union). Callable by authenticated
-- users only; a non-admin gets an exception, not data.

CREATE OR REPLACE FUNCTION public.fn_bbj_analytics(p_pool_id uuid)
RETURNS TABLE (
  main_balance numeric,
  backup_balance numeric,
  promo_balance numeric,
  contributions_24h numeric,
  contributions_7d numeric,
  contributions_30d numeric,
  hands_24h bigint,
  hands_7d bigint,
  total_contributed_all_time numeric,
  hit_count bigint,
  total_paid_all_time numeric,
  biggest_hit numeric,
  last_hit_at timestamptz,
  avg_days_between_hits numeric,
  days_since_last_hit numeric,
  net_pool_position numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_union_id uuid;
  v_allowed boolean := false;
BEGIN
  SELECT bp.club_id, bp.union_id INTO v_club_id, v_union_id
  FROM public.bbj_pools bp WHERE bp.id = p_pool_id;

  IF v_club_id IS NULL AND v_union_id IS NULL THEN
    RAISE EXCEPTION 'BBJ pool not found';
  END IF;

  -- Admin of the owning club, or of ANY club in the owning union.
  IF v_club_id IS NOT NULL THEN
    v_allowed := public.fn_is_club_admin_uid(v_club_id);
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.union_id = v_union_id
        AND public.fn_is_club_admin_uid(c.id)
    ) INTO v_allowed;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized: club admin role required for this jackpot pool';
  END IF;

  RETURN QUERY
  WITH pool AS (
    SELECT bp.main_balance, bp.backup_balance, bp.promo_balance
    FROM public.bbj_pools bp WHERE bp.id = p_pool_id
  ),
  contrib AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE created_at > now() - interval '24 hours'), 0) AS c24,
      COALESCE(SUM(amount) FILTER (WHERE created_at > now() - interval '7 days'), 0) AS c7,
      COALESCE(SUM(amount) FILTER (WHERE created_at > now() - interval '30 days'), 0) AS c30,
      COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS h24,
      COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS h7,
      COALESCE(SUM(amount), 0) AS call_time
    FROM public.bbj_contributions WHERE pool_id = p_pool_id
  ),
  hits AS (
    SELECT
      COUNT(*) AS n,
      COALESCE(SUM(total_payout), 0) AS paid,
      COALESCE(MAX(total_payout), 0) AS biggest,
      MAX(awarded_at) AS last_at,
      MIN(awarded_at) AS first_at
    FROM public.bbj_winners WHERE pool_id = p_pool_id
  )
  SELECT
    p.main_balance,
    p.backup_balance,
    p.promo_balance,
    c.c24,
    c.c7,
    c.c30,
    c.h24,
    c.h7,
    c.call_time,
    h.n,
    h.paid,
    h.biggest,
    h.last_at,
    -- Average interval between hits (needs 2+ hits to mean anything).
    CASE WHEN h.n > 1
      THEN ROUND(EXTRACT(EPOCH FROM (h.last_at - h.first_at)) / 86400.0 / (h.n - 1), 2)
      ELSE NULL END,
    CASE WHEN h.last_at IS NOT NULL
      THEN ROUND(EXTRACT(EPOCH FROM (now() - h.last_at)) / 86400.0, 2)
      ELSE NULL END,
    -- Net position: everything ever collected minus everything ever paid.
    ROUND(c.call_time - h.paid, 2)
  FROM pool p, contrib c, hits h;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_bbj_analytics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bbj_analytics(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_bbj_analytics(uuid) IS
  'BBJ health for club admins: funding rate, hit cadence, net pool position. Computed from bbj_contributions + bbj_winners (authoritative), never the legacy counters. Club-admin gated.';