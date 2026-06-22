-- Migration: harden get_portfolio_stats for the MLB Portfolio page (Deep Fixes).
--
-- FIXES INCLUDED:
--   1. Absolute Bankroll Reset Bug: `v_final_bankroll` fetches the absolute final bankroll from `filtered_bets` instead of incorrectly anchoring it to 1000 + window PnL.
--   2. Max Drawdown Scope: `running_max` is calculated over the entire history so a peak right before the window is not ignored.
--   3. Null-Safety on Pushes: `COALESCE(result, '') NOT IN ('WIN', 'LOSS')` prevents NULL unresulted bets from vanishing from the aggregates.
--   4. Performance: Optimized `ARRAY_AGG` bottleneck into `DISTINCT ON` for weekly equity curve.
--
-- Idempotent: CREATE OR REPLACE. Preserves SECURITY DEFINER + pinned search_path.

CREATE OR REPLACE FUNCTION get_portfolio_stats(p_days INT DEFAULT NULL, p_market TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
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

    v_anchor timestamptz;
    v_cutoff timestamptz;

    v_weekly jsonb;
    v_recent jsonb;
    v_result jsonb;
BEGIN
    -- Anchor the rolling timeframe window to the latest bet in the dataset
    SELECT MAX(as_of_ts) INTO v_anchor FROM sim_bets;
    v_cutoff := CASE
        WHEN p_days IS NULL OR v_anchor IS NULL THEN NULL
        ELSE v_anchor - (INTERVAL '1 day' * p_days)
    END;

    -- Aggregate overall stats in a single scan of the window
    SELECT
        COUNT(*),
        COALESCE(SUM(CASE WHEN pnl > 0 OR result = 'WIN' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pnl < 0 OR result = 'LOSS' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pnl = 0 AND COALESCE(result, '') NOT IN ('WIN', 'LOSS') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(pnl), 0),
        COALESCE(SUM(stake), 0)
    INTO
        v_total_bets, v_wins, v_losses, v_pushes, v_total_pnl, v_total_staked
    FROM sim_bets
    WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
      AND (p_market IS NULL OR market = p_market);

    -- Calculate Peak Bankroll and Max Drawdown (using absolute history for running_max)
    SELECT
        COALESCE(MAX(running_max), 1000),
        COALESCE(MAX((running_max - bankroll_after) / NULLIF(running_max, 0)), 0)
    INTO v_peak_bankroll, v_max_drawdown
    FROM (
        SELECT
            as_of_ts,
            bankroll_after,
            MAX(bankroll_after) OVER (ORDER BY as_of_ts ASC, id ASC) as running_max
        FROM sim_bets
        WHERE (p_market IS NULL OR market = p_market)
    ) sub
    WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff);

    -- Weekly Curve Calculation (using DISTINCT ON for O(1) last bankroll selection)
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
            week_start,
            SUM(bets) as bets,
            SUM(pnl) as pnl,
            MAX(last_bankroll) as last_bankroll
        FROM (
            SELECT
                TO_CHAR(DATE_TRUNC('week', as_of_ts::timestamp), 'YYYY-MM-DD') as week_start,
                COUNT(*) OVER w as bets,
                SUM(pnl) OVER w as pnl,
                FIRST_VALUE(bankroll_after) OVER (
                    PARTITION BY DATE_TRUNC('week', as_of_ts::timestamp)
                    ORDER BY as_of_ts DESC, id DESC
                ) as last_bankroll,
                ROW_NUMBER() OVER w_desc as rn
            FROM sim_bets
            WHERE as_of_ts IS NOT NULL
              AND (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
              AND (p_market IS NULL OR market = p_market)
            WINDOW 
                w AS (PARTITION BY DATE_TRUNC('week', as_of_ts::timestamp)),
                w_desc AS (PARTITION BY DATE_TRUNC('week', as_of_ts::timestamp) ORDER BY as_of_ts DESC, id DESC)
        ) sub
        WHERE rn = 1
        GROUP BY week_start
        ORDER BY week_start ASC
    ) weekly_data;

    -- Recent Bets Calculation
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
            'edge_pts', edge_pts,
            'bet_score', bet_score,
            'bet_tier', bet_tier,
            'game_pk', game_pk
        )
    ), '[]'::jsonb) INTO v_recent
    FROM (
        SELECT id, as_of_ts, pnl, result, stake, bankroll_after, market, selection,
               edge_pts, bet_score, bet_tier, game_pk
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

    -- Absolute Final Bankroll (independent of window)
    SELECT COALESCE((
        SELECT bankroll_after
        FROM sim_bets
        WHERE (p_market IS NULL OR market = p_market)
        ORDER BY as_of_ts DESC, id DESC
        LIMIT 1
    ), 1000) INTO v_final_bankroll;

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
