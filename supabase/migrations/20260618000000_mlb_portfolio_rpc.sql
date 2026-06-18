-- Migration to add get_portfolio_stats RPC for MLB Analytics
-- This offloads the heavy aggregation from Javascript to Postgres.

CREATE OR REPLACE FUNCTION get_portfolio_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    FROM sim_bets;

    -- Calculate Peak Bankroll and Max Drawdown 
    -- (Requires scanning the bankroll_after over time)
    SELECT 
        COALESCE(MAX(running_max), 1000),
        COALESCE(MAX((running_max - bankroll_after) / NULLIF(running_max, 0)), 0)
    INTO v_peak_bankroll, v_max_drawdown
    FROM (
        SELECT 
            bankroll_after,
            MAX(bankroll_after) OVER (ORDER BY as_of_ts ASC) as running_max
        FROM sim_bets
    ) sub;

    -- Weekly Curve Calculation
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
            -- Get the last bankroll_after of the week
            (ARRAY_AGG(bankroll_after ORDER BY as_of_ts ASC))[ARRAY_LENGTH(ARRAY_AGG(bankroll_after), 1)] as last_bankroll
        FROM sim_bets
        WHERE as_of_ts IS NOT NULL
        GROUP BY DATE_TRUNC('week', as_of_ts::timestamp)
        ORDER BY DATE_TRUNC('week', as_of_ts::timestamp) ASC
    ) weekly_data;

    -- Recent Bets Calculation (Last 20)
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
        SELECT *
        FROM sim_bets
        ORDER BY as_of_ts DESC
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
$$;
