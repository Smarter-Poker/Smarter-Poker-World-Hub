-- REMAINING UNION FEATURES (2026-08-20)
--
-- Closing out the last gaps identified by researching how real unions
-- operate. Dan's constraints observed throughout: the rake schedule is
-- untouched, and there are NO LATE FEES anywhere.
--
-- 1. SHARED COST ALLOCATION. Real unions bill their running costs -- table
--    managers, accounting, MTT overlays, promo/diamond spend -- to member
--    clubs pro-rata by each club's share of total union rake. Primetime's
--    charter states it exactly: "If your club rakes $1,000 and the union
--    rakes $100,000, then you only pay 1 percent of those fees." We had no
--    mechanism at all. Read-only: it computes the split, it does not move
--    chips or write an invoice line, so it can be reviewed before use.
--    Verified: a 10,000 cost splits 96.901% / 3.099% -> 9,690.06 + 309.94,
--    summing to exactly 10,000.00.
--
-- 2. CRUSHING CLUB / WIN RATIO. ECO taxes a winning club, but the separate
--    signal every union watches is a club that wins *persistently*. The 2+2
--    AMA: "Most of the time, consistently winning clubs are just kicked."
--    Primetime: "If your club consistently finishes with a positive win
--    ratio, we will ask you to balance out... Max acceptable ratio is 1:1."
--
--    IMPORTANT -- this function was rewritten before shipping. The first
--    version called fn_union_reconciliation_report once per week; each of
--    those calls fn_union_pnl_all_clubs (~7s/week), measured at 17.4s for two
--    weeks, i.e. ~105s at the 12-week maximum, for something a dashboard
--    would call. It now reads what was actually SETTLED from
--    union_pnl_settlements.club_results and computes live for the current
--    open week ONLY. 4 weeks: 5.42s. It also reports the figures clubs were
--    genuinely invoiced on rather than re-deriving them from data that has
--    since moved.
--
-- 3. STAKES CAP. union_club_terms.stakes_cap_bb existed but nothing looked at
--    it. Added as a MONITORING invariant, not a hard block: enforcing at table
--    creation would mean editing a live gameplay path, and every other control
--    added today reports first and enforces only on Dan's word. Costs nothing
--    until a cap is actually set.
--
-- Applied to production via Supabase MCP as
-- 'union_shared_costs_performance_stakes' then
-- 'club_performance_from_settled_history' and
-- 'club_performance_fix_ambiguous_column'; this file is the final state.

CREATE OR REPLACE FUNCTION public.fn_union_shared_cost_allocation(
  p_union_id uuid, p_total_cost numeric,
  p_start timestamptz DEFAULT NULL, p_end timestamptz DEFAULT NULL)
RETURNS TABLE(
  club_id uuid, club_name text,
  club_rake numeric, union_rake numeric, rake_share numeric,
  allocated_cost numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := COALESCE(p_start, fn_union_week_start());
  v_end   timestamptz := COALESCE(p_end, now());
  v_total numeric;
BEGIN
  IF p_total_cost IS NULL OR p_total_cost < 0 THEN
    RAISE EXCEPTION 'p_total_cost must be >= 0' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH r AS (
    -- inherits the reconciliation report's authorization check
    SELECT rep.club_id, rep.club_name, rep.rake_paid
      FROM fn_union_reconciliation_report(p_union_id, v_start, v_end) rep
  ),
  tot AS (SELECT NULLIF(SUM(r.rake_paid), 0) AS all_rake FROM r)
  SELECT r.club_id, r.club_name, r.rake_paid,
         COALESCE(tot.all_rake, 0),
         CASE WHEN tot.all_rake IS NULL THEN 0
              ELSE round(r.rake_paid / tot.all_rake, 6) END,
         CASE WHEN tot.all_rake IS NULL THEN 0
              ELSE round(p_total_cost * (r.rake_paid / tot.all_rake), 2) END
    FROM r CROSS JOIN tot
   ORDER BY r.rake_paid DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_union_club_performance(
  p_union_id uuid, p_weeks integer DEFAULT 4)
RETURNS TABLE(
  club_id uuid, club_name text,
  weeks_measured integer, winning_weeks integer, losing_weeks integer,
  total_net numeric, avg_weekly_net numeric, crushing boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_weeks integer := GREATEST(1, LEAST(COALESCE(p_weeks, 4), 12));
  v_from  timestamptz := fn_union_week_start() - (v_weeks - 1) * interval '7 days';
  v_cur   timestamptz := date_trunc('week', (fn_union_week_start() AT TIME ZONE 'UTC'));
BEGIN
  RETURN QUERY
  WITH settled AS (
    -- one row per club per settled period, straight from what was invoiced
    SELECT date_trunc('week', (s.period_start AT TIME ZONE 'UTC')) AS wk,
           (e->>'club_id')::uuid AS cid,
           (e->>'net')::numeric  AS net_amt
      FROM union_pnl_settlements s
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.club_results, '[]'::jsonb)) e
     WHERE s.union_id = p_union_id
       AND s.status = 'settled'
       AND s.period_start >= v_from
       AND (e->>'club_id') IS NOT NULL
  ),
  settled_wk AS (
    -- collapse multiple settlements inside one week into that week's total
    SELECT settled.wk, settled.cid, SUM(settled.net_amt) AS net_amt
      FROM settled GROUP BY settled.wk, settled.cid
  ),
  open_wk AS (
    -- the current week only, computed live (inherits the report's authz)
    SELECT v_cur AS wk, rep.club_id AS cid, rep.settle_net AS net_amt
      FROM fn_union_reconciliation_report(p_union_id, fn_union_week_start(), now()) rep
     WHERE NOT EXISTS (
       SELECT 1 FROM settled_wk sw
        WHERE sw.cid = rep.club_id AND sw.wk = v_cur)
  ),
  allwk AS (
    SELECT settled_wk.wk, settled_wk.cid, settled_wk.net_amt FROM settled_wk
    UNION ALL
    SELECT open_wk.wk, open_wk.cid, open_wk.net_amt FROM open_wk
  ),
  agg AS (
    SELECT a.cid,
           count(*)::int AS wks,
           count(*) FILTER (WHERE a.net_amt > 0)::int AS wins,
           count(*) FILTER (WHERE a.net_amt < 0)::int AS losses,
           round(SUM(a.net_amt), 2) AS net_total
      FROM allwk a GROUP BY a.cid
  )
  SELECT agg.cid, c.name::text, agg.wks, agg.wins, agg.losses, agg.net_total,
         round(agg.net_total / NULLIF(agg.wks, 0), 2),
         -- "consistently finishes with a positive win ratio": up overall AND
         -- winning in more weeks than it loses
         (agg.net_total > 0 AND agg.wins > agg.losses)
    FROM agg LEFT JOIN clubs c ON c.id = agg.cid
   ORDER BY agg.net_total DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_shared_cost_allocation(uuid, numeric, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_union_shared_cost_allocation(uuid, numeric, timestamptz, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_union_club_performance(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_union_club_performance(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_union_credit_risk_check()
RETURNS TABLE(invariant text, severity text, offenders bigint, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT 'union_club_no_terms', 'warning', count(*),
         'Member clubs with no union_club_terms row: no security deposit and '
         || 'no stop loss on file, so their losses are carried unsecured'
    FROM union_clubs uc
   WHERE NOT EXISTS (SELECT 1 FROM union_club_terms t
                      WHERE t.union_id = uc.union_id AND t.club_id = uc.club_id)
  HAVING count(*) > 0

  UNION ALL
  SELECT 'union_club_stop_loss_breached', 'critical', count(*),
         'Clubs past their weekly stop loss and still active: '
         || COALESCE(string_agg(x.club_name || ' (exposure ' || x.exposure || ' vs limit '
                                || x.stop_loss_limit || ')', '; '), '')
    FROM (
      SELECT e.club_name, e.exposure, e.stop_loss_limit
        FROM (SELECT DISTINCT t.union_id
                FROM union_club_terms t
               WHERE t.stop_loss_limit IS NOT NULL
                 AND t.status <> 'suspended') u
        CROSS JOIN LATERAL fn_union_club_exposure(u.union_id) e
       WHERE e.breached AND e.status <> 'suspended'
    ) x
  HAVING count(*) > 0

  UNION ALL
  SELECT 'union_eco_not_recorded', 'warning', count(*),
         'Unions with ECO enabled and no union_eco_ledger row for the current '
         || 'settlement week: this week''s win tax / loss rebate is not reproducible'
    FROM unions un
   WHERE COALESCE((un.settings->>'eco_enabled')::boolean, false)
     AND EXISTS (SELECT 1 FROM union_clubs uc WHERE uc.union_id = un.id)
     AND NOT EXISTS (SELECT 1 FROM union_eco_ledger l
                      WHERE l.union_id = un.id
                        AND l.period_start >= fn_union_week_start())
  HAVING count(*) > 0

  UNION ALL
  -- A club spreading bigger blinds than its deposit tier permits.
  SELECT 'union_club_stakes_above_cap', 'warning', count(*),
         'Live tables above the club''s agreed stakes cap: '
         || COALESCE(string_agg(y.club_name || ' bb=' || y.big_blind
                                || ' cap=' || y.stakes_cap_bb, '; '), '')
    FROM (
      SELECT c.name AS club_name, tb.big_blind, t.stakes_cap_bb
        FROM union_club_terms t
        JOIN clubs c ON c.id = t.club_id
        JOIN tables tb ON tb.club_id = t.club_id
       WHERE t.stakes_cap_bb IS NOT NULL
         AND tb.big_blind > t.stakes_cap_bb
         AND COALESCE(tb.is_deleted, false) = false
         AND tb.status NOT IN ('closed','deleted')
    ) y
  HAVING count(*) > 0;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_credit_risk_check() FROM PUBLIC, anon, authenticated;
