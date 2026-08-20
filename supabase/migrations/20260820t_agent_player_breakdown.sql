-- AGENT PER-PLAYER BREAKDOWN (2026-08-20)
--
-- Correction to my own gap list: an agent weekly statement ALREADY EXISTS
-- (fn_agent_weekly_statement(p_agent_user_id, ...) -> jsonb) and is good — it
-- returns players, rake_generated, commission_earned, player_net_result,
-- credit_outstanding, chips issued/returned and net_settlement_position. I had
-- wrongly called it missing because I checked player_agent_assignments, which
-- is EMPTY and is not the live linkage.
--
-- SCHEMA TRAP worth recording: `club_members.agent_id` holds the agent's
-- **user_id**, NOT `agents.id`. Verified on production: all 184 rows match
-- agents.user_id and profiles.id; ZERO match agents.id. Any query joining
-- club_members.agent_id = agents.id returns nothing, silently — the same shape
-- of bug as the union-scoped club queries fixed earlier today.
--
-- What was genuinely missing is the level below the aggregate: an agent
-- settles with EACH PLAYER individually every week, and the existing function
-- only returns totals.
--
-- COMMISSION: reports CREDITED vs ACCRUED. Found while testing — for one
-- super_agent (commission_rate 0.48, player_rakeback_rate 0.12) the aggregate
-- statement reported commission_earned 6,330.32 for the week while
-- agent_commissions held ZERO rows for any of that agent's 16 players in the
-- same window. Union-wide: 187,181 commission rows written this week but only
-- 26 distinct users credited, against 184 players who have an agent.
-- Commission is COMPUTED in one place and RECORDED in another. Deliberately
-- NOT "fixed" here by guessing a formula I do not own — both numbers are shown
-- side by side so the divergence is visible instead of a statement quietly
-- disagreeing with the ledger. See the agent_commission_unrecorded invariant.
--
-- Applied to production via Supabase MCP as
-- 'agent_breakdown_commission_variance_v2'.
CREATE OR REPLACE FUNCTION public.fn_agent_player_breakdown(
  p_agent_user_id uuid DEFAULT NULL,
  p_period_start timestamptz DEFAULT NULL,
  p_period_end timestamptz DEFAULT NULL)
RETURNS TABLE(
  player_id uuid, username text, club_id uuid,
  rake_generated numeric, player_net numeric,
  rakeback_rate numeric, rakeback_due numeric,
  commission_credited numeric, commission_accrued numeric, commission_variance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_agent uuid := COALESCE(p_agent_user_id, auth.uid());
  v_from  timestamptz := COALESCE(p_period_start, fn_union_week_start());
  v_to    timestamptz := COALESCE(p_period_end, now());
BEGIN
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'no_agent_context' USING ERRCODE = '42704';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_agent
     AND NOT public.fn_is_any_union_overseer(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH roster AS (
    -- club_members.agent_id stores the agent's USER id, not agents.id
    SELECT DISTINCT cm.user_id AS player_id, cm.club_id
      FROM club_members cm
     WHERE cm.agent_id = v_agent
  ),
  deal AS (
    SELECT r.club_id,
           MAX(COALESCE(a.player_rakeback_rate, 0)) AS rb,
           MAX(COALESCE(a.commission_rate, 0))      AS comm
      FROM roster r
      LEFT JOIN agents a ON a.user_id = v_agent AND a.club_id = r.club_id
     GROUP BY r.club_id
  ),
  ut AS (
    SELECT t.id FROM tables t
     WHERE t.union_id IS NOT NULL AND t.tournament_id IS NULL
  ),
  rake AS (
    SELECT u.user_id, round(SUM(u.rake_amount), 2) AS amt
      FROM union_rake_paid_daily_user u
      JOIN roster r ON r.player_id = u.user_id
     WHERE u.day >= (v_from AT TIME ZONE 'UTC')::date
       AND u.day <= (v_to   AT TIME ZONE 'UTC')::date
     GROUP BY u.user_id
  ),
  flows AS (
    SELECT wt.user_id,
           round(SUM(CASE WHEN wt.type = 'credit' THEN wt.amount ELSE -wt.amount END), 2) AS pnl
      FROM wallet_transactions wt
      JOIN roster r ON r.player_id = wt.user_id
     WHERE wt.created_at >= v_from AND wt.created_at < v_to
       AND wt.category IN ('buyin','cashout')
       AND wt.table_id IN (SELECT id FROM ut)
     GROUP BY wt.user_id
  ),
  comm AS (
    SELECT ac.user_id, ac.club_id, round(SUM(ac.amount), 2) AS amt
      FROM agent_commissions ac
      JOIN roster r ON r.player_id = ac.user_id AND r.club_id = ac.club_id
     WHERE ac.created_at >= v_from AND ac.created_at < v_to
     GROUP BY ac.user_id, ac.club_id
  )
  SELECT r.player_id,
         COALESCE(p.username, p.display_name, left(r.player_id::text, 8))::text,
         r.club_id,
         COALESCE(rake.amt, 0),
         COALESCE(flows.pnl, 0),
         COALESCE(d.rb, 0),
         round(COALESCE(rake.amt, 0) * COALESCE(d.rb, 0), 2),
         COALESCE(comm.amt, 0),
         round(COALESCE(rake.amt, 0) * COALESCE(d.comm, 0), 2),
         round(COALESCE(rake.amt, 0) * COALESCE(d.comm, 0) - COALESCE(comm.amt, 0), 2)
    FROM roster r
    LEFT JOIN profiles p ON p.id = r.player_id
    LEFT JOIN deal d     ON d.club_id = r.club_id
    LEFT JOIN rake       ON rake.user_id = r.player_id
    LEFT JOIN flows      ON flows.user_id = r.player_id
    LEFT JOIN comm       ON comm.user_id = r.player_id AND comm.club_id = r.club_id
   ORDER BY COALESCE(rake.amt, 0) DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_agent_player_breakdown(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_agent_player_breakdown(uuid, timestamptz, timestamptz) TO authenticated;
