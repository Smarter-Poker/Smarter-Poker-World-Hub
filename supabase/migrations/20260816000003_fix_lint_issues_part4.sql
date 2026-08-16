CREATE OR REPLACE FUNCTION public.get_mlb_team_detail(p_team_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    res_team JSONB;
    res_stats JSONB;
    res_games JSONB;
    res_matchup JSONB;
    res_props JSONB;
    latest_slate DATE;
BEGIN
    -- Get Team Base Profile
    SELECT jsonb_build_object(
        'team_id', t.team_id,
        'name', t.name,
        'abbr', t.abbr,
        'league', t.league,
        'division', t.division,
        'run_diff', t.run_diff,
        'streaks', t.streaks,
        'splits', t.splits
    ) INTO res_team
    FROM public.v_team_profile t
    WHERE t.team_id = p_team_id;

    -- Return 404 equivalent if not found
    IF res_team IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get Team Aggregate Stats (latest season snapshot)
    SELECT jsonb_build_object(
        'era', era,
        'fip', fip,
        'wrc_plus', wrc_plus,
        'woba', woba,
        'pitching_war', pitching_war,
        'hitting_war', hitting_war
    ) INTO res_stats
    FROM public.agg_team
    WHERE team_id = p_team_id AND window_kind = 'season'
    ORDER BY as_of DESC
    LIMIT 1;

    -- Get Recent & Upcoming Games
    SELECT jsonb_agg(
        jsonb_build_object(
            'game_id', g.game_id,
            'start_time', g.start_time,
            'home_team', g.home_team,
            'away_team', g.away_team,
            'status', g.status
        )
    ) INTO res_games
    FROM (
        SELECT game_pk AS game_id, start_time, home_team, away_team, status
        FROM public.raw_games
        WHERE home_team = (res_team->>'name') OR away_team = (res_team->>'name')
        ORDER BY start_time DESC
        LIMIT 10
    ) g;

    -- Get Latest Slate
    SELECT MAX(as_of_ts)::DATE INTO latest_slate FROM public.pred_props;

    -- Get Raw Props for the latest slate for this team
    SELECT jsonb_agg(row_to_json(p)) INTO res_props
    FROM public.pred_props p
    WHERE p.team_abbr = (res_team->>'abbr') AND p.as_of_ts::DATE = latest_slate;

    -- Combine into final JSONB payload
    RETURN jsonb_build_object(
        'team', res_team,
        'stats', res_stats,
        'games', COALESCE(res_games, '[]'::jsonb),
        'matchup', NULL, -- Matchup logic can be extended here
        'props_raw', COALESCE(res_props, '[]'::jsonb),
        'slate_date', latest_slate
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_portfolio_stats(p_days integer DEFAULT NULL::integer, p_market text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_total_bets int;
    v_wins int;
    v_losses int;
    v_pushes int;
    v_total_pnl numeric;
    v_peak_bankroll numeric;
    v_max_drawdown numeric;
    v_total_staked numeric;
    v_roi numeric;
    v_win_rate numeric;
    v_final_bankroll numeric;

    v_anchor timestamptz;
    v_cutoff timestamptz;

    v_weekly jsonb;
    v_recent jsonb;

    v_result jsonb;
BEGIN
    -- Initialize variables
    v_total_bets := 0;
    v_wins := 0;
    v_losses := 0;
    v_pushes := 0;
    v_total_pnl := 0;
    v_peak_bankroll := 1000;
    v_max_drawdown := 0;
    v_total_staked := 0;

    -- Anchor the rolling timeframe window to the latest bet in the dataset (the end of
    -- the backtest) rather than NOW(), so "last N days" stays meaningful when the data
    -- is not refreshed daily. NULL p_days => no cutoff (YTD / all-time).
    SELECT MAX(as_of_ts) INTO v_anchor FROM sim_bets;
    v_cutoff := CASE
        WHEN p_days IS NULL OR v_anchor IS NULL THEN NULL
        ELSE v_anchor - (INTERVAL '1 day' * p_days)
    END;

    -- Aggregate overall stats in a single scan
    SELECT
        COUNT(*),
        COALESCE(SUM(CASE WHEN pnl > 0 OR result = 'WIN' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pnl < 0 OR result = 'LOSS' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pnl = 0 AND result NOT IN ('WIN', 'LOSS') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(pnl), 0),
        COALESCE(SUM(stake), 0)
    INTO
        v_total_bets, v_wins, v_losses, v_pushes, v_total_pnl, v_total_staked
    FROM sim_bets
    WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
      AND (p_market IS NULL OR market = p_market);

    -- Calculate Peak Bankroll and Max Drawdown (stable order: as_of_ts then id)
    SELECT
        COALESCE(MAX(running_max), 1000),
        COALESCE(MAX((running_max - bankroll_after) / NULLIF(running_max, 0)), 0)
    INTO v_peak_bankroll, v_max_drawdown
    FROM (
        SELECT
            bankroll_after,
            MAX(bankroll_after) OVER (ORDER BY as_of_ts ASC, id ASC) as running_max
        FROM sim_bets
        WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
          AND (p_market IS NULL OR market = p_market)
    ) sub;

    -- Weekly Curve Calculation (last bankroll of week resolved by as_of_ts then id)
    SELECT jsonb_agg(
        jsonb_build_object(
            'weekOf', week_start,
            'bets', bets,
            'pnl', pnl,
            'bankroll', last_bankroll
        )
    ) INTO v_weekly
    FROM (
        SELECT
            TO_CHAR(DATE_TRUNC('week', as_of_ts::timestamp), 'YYYY-MM-DD') as week_start,
            COUNT(*) as bets,
            SUM(pnl) as pnl,
            (ARRAY_AGG(bankroll_after ORDER BY as_of_ts ASC, id ASC))[
                ARRAY_LENGTH(ARRAY_AGG(bankroll_after), 1)
            ] as last_bankroll
        FROM sim_bets
        WHERE as_of_ts IS NOT NULL
          AND (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
          AND (p_market IS NULL OR market = p_market)
        GROUP BY DATE_TRUNC('week', as_of_ts::timestamp)
        ORDER BY DATE_TRUNC('week', as_of_ts::timestamp) ASC
    ) weekly_data;

    -- Recent Bets Calculation (Last 20, stable order, with Bet Score + tier + game_pk)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', id,
            'as_of_ts', as_of_ts,
            'pnl', pnl,
            'result', result,
            'stake', stake,
            'bankroll_after', bankroll_after,
            'market', market,
            'selection', selection,
            'edge_pts', edge_pts
         )
     ), '[]'::jsonb) INTO v_recent
     FROM (
         SELECT id, as_of_ts, pnl, result, stake, bankroll_after, market, selection,
                edge_pts
        FROM sim_bets
        WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
          AND (p_market IS NULL OR market = p_market)
        ORDER BY as_of_ts DESC, id DESC
        LIMIT 20
    ) recent_data;

    -- Derived calculations
    IF v_total_staked > 0 THEN
        v_roi := (v_total_pnl / v_total_staked) * 100;
    ELSE
        v_roi := 0;
    END IF;

    IF (v_wins + v_losses) > 0 THEN
        v_win_rate := (v_wins::numeric / (v_wins + v_losses)) * 100;
    ELSE
        v_win_rate := 0;
    END IF;

    v_final_bankroll := 1000 + v_total_pnl;

    -- Build and return final JSON response
    v_result := jsonb_build_object(
        'totalBets', v_total_bets,
        'wins', v_wins,
        'losses', v_losses,
        'pushes', v_pushes,
        'totalPnl', v_total_pnl,
        'currentBankroll', v_final_bankroll,
        'roi', v_roi,
        'peakBankroll', v_peak_bankroll,
        'maxDrawdown', v_max_drawdown * 100,
        'winRate', v_win_rate,
        'weeklyCurve', COALESCE(v_weekly, '[]'::jsonb),
        'recentBets', v_recent
    );

    RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sp_refresh_pending_families()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '15min'
AS $function$
declare cnt int;
begin
  
  WITH pf AS (
    select g.game_type, g.stack_depth, count(*) as n
      from solved_spots_gold g
     where g.strategy_matrix_v2 is null
       and g.game_type is not null
       and g.stack_depth is not null
     group by 1,2
  )
  , deleted AS (
      delete from sp_pending_family_cache c
      where not exists (select 1 from pf p
                         where p.game_type = c.game_type
                           and p.stack_depth = c.stack_depth)
  )
  , inserted AS (
      insert into sp_pending_family_cache(game_type, stack_depth, n, refreshed_at)
      select p.game_type, p.stack_depth, p.n, now() from pf p
      on conflict (game_type, stack_depth) do update
      set n = excluded.n, refreshed_at = excluded.refreshed_at
      returning 1
  )
  select (select count(*) from pf) into cnt;

  return cnt;
end $function$
;
