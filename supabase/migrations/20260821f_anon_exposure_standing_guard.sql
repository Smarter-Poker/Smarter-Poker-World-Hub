-- A STANDING GUARD FOR THE DEFAULT-PUBLIC-EXECUTE TRAP (2026-08-20)
--
-- Minutes after I finished sweeping 23 union RPCs off `anon`, a NEW
-- anon-callable function appeared: fn_union_distribution_check, added by
-- another agent -- SECURITY DEFINER, reading rake/commission/rakeback totals,
-- with no auth check. Nobody did anything wrong: Postgres grants EXECUTE to
-- PUBLIC by default and Supabase exposes every `public` function over
-- PostgREST, so ANY new function is born exposed unless its author remembers
-- to revoke.
--
-- A one-time sweep therefore cannot hold. This converts it into a standing
-- invariant: the governance sweep (engine, every 30 minutes) now reports any
-- union/settlement/treasury/rake/agent-commission function callable by `anon`,
-- minus an explicit allowlist. The next one gets caught within half an hour
-- instead of at the next manual audit.
--
-- IT EARNED ITS PLACE ON THE FIRST RUN: besides the function that triggered
-- it, the check immediately surfaced three more my manual sweep had missed
-- because they are not named fn_union_* --
-- fn_enforce_agent_commission_bounds (SECURITY DEFINER, no auth check),
-- fn_get_agent_commission_summary and get_agent_commission_history (both
-- SECURITY INVOKER, so RLS still applied, but no reason to be reachable
-- logged-out). All four are closed in this migration and 20260821g.
--
-- Allowlisted, deliberately:
--   fn_union_oversees_club -- referenced by SIXTEEN RLS policies including the
--     `tables` SELECT policy; revoking it would break row-level security for
--     every logged-in user and could hide every table from every player.
--   fn_tournament_entry_split -- pure IMMUTABLE arithmetic, SECURITY INVOKER,
--     touches no tables; exposure conveys no data.
--   fn_union_week_start -- pure date arithmetic, same reasoning.
--
-- Verified: deliberately re-granting one function to anon makes the governance
-- sweep raise money_fn_exposed_to_anon (critical); after closing everything it
-- returns CLEAN. Governance sweep measured 0.27s.
--
-- Applied to production via Supabase MCP as 'anon_exposure_standing_guard'.

REVOKE EXECUTE ON FUNCTION public.fn_union_distribution_check(p_union_id uuid, p_since timestamp with time zone)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_anon_exposure_check()
RETURNS TABLE(invariant text, severity text, offenders bigint, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT 'money_fn_exposed_to_anon', 'critical', count(*),
         'Financial functions callable by anon (no login). Postgres grants '
         || 'EXECUTE to PUBLIC by default and Supabase publishes every public '
         || 'function, so each of these is one REVOKE away from safe: '
         || COALESCE(string_agg(x.proname, ', ' ORDER BY x.proname), '')
    FROM (
      SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
       WHERE has_function_privilege('anon', p.oid, 'EXECUTE')
         AND (p.proname LIKE 'fn_union_%'
              OR p.proname LIKE '%settle%'
              OR p.proname LIKE '%treasury%'
              OR p.proname LIKE '%rakeback%'
              OR p.proname LIKE '%agent_commission%'
              OR p.proname LIKE 'fn_union_rake%')
         AND p.proname NOT IN (
           -- see header for why each of these is intentionally reachable
           'fn_union_oversees_club',
           'fn_tournament_entry_split',
           'fn_union_week_start')
    ) x
  HAVING count(*) > 0;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_anon_exposure_check() FROM PUBLIC, anon, authenticated;

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
  HAVING count(*) > 0

  UNION ALL
  SELECT * FROM fn_anon_exposure_check();
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_credit_risk_check() FROM PUBLIC, anon, authenticated;
