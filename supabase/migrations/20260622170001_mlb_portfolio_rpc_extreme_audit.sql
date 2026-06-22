-- Migration: harden get_portfolio_stats (Extreme Audit Phase 2)
--
-- FIXES INCLUDED:
--   1. Math: Divide by zero handled on drawdown, negative peak ignored, ROI uses NULL fallback.
--   2. Types: BigInt downcast fixed, integer bounds safe. timestamptz for week TRUNC to stop tz drift.
--   3. Performance: IF/ELSE blocks remove `(p_market IS NULL OR ...)` param sniffing causing seq scans.
--   4. Max Drawdown: Pre-calculates v_prior_peak to prevent bounded massive history sorts.
--   5. DISTINCT ON: Used for weekly curve instead of ROW_NUMBER() sorting.
--   6. Null values: `COALESCE(pnl, 0)` fixes pushes tally gap.

CREATE OR REPLACE FUNCTION get_portfolio_stats(p_days INT DEFAULT NULL, p_market TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
    v_total_bets bigint;
    v_wins bigint;
    v_losses bigint;
    v_pushes bigint;
    v_total_pnl numeric;
    v_peak_bankroll numeric;
    v_max_drawdown numeric;
    v_total_staked numeric;
    v_roi numeric;
    v_win_rate numeric;
    v_final_bankroll numeric;
    v_prior_peak numeric;

    v_anchor timestamptz;
    v_cutoff timestamptz;

    v_weekly jsonb;
    v_recent jsonb;
    v_result jsonb;
BEGIN
    -- Anchor the rolling timeframe window to the latest bet in the dataset
    IF p_market IS NULL THEN
        SELECT MAX(as_of_ts) INTO v_anchor FROM sim_bets;
    ELSE
        SELECT MAX(as_of_ts) INTO v_anchor FROM sim_bets WHERE market = p_market;
    END IF;

    v_cutoff := CASE
        WHEN p_days IS NULL OR v_anchor IS NULL THEN NULL
        ELSE v_anchor - (INTERVAL '1 day' * p_days)
    END;

    -- Aggregate overall stats
    IF p_market IS NULL THEN
        SELECT
            COUNT(*),
            COALESCE(SUM(CASE WHEN pnl > 0 OR result = 'WIN' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN pnl < 0 OR result = 'LOSS' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN COALESCE(pnl, 0) = 0 AND COALESCE(result, '') NOT IN ('WIN', 'LOSS') THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(pnl), 0),
            COALESCE(SUM(stake), 0)
        INTO
            v_total_bets, v_wins, v_losses, v_pushes, v_total_pnl, v_total_staked
        FROM sim_bets
        WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff);
    ELSE
        SELECT
            COUNT(*),
            COALESCE(SUM(CASE WHEN pnl > 0 OR result = 'WIN' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN pnl < 0 OR result = 'LOSS' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN COALESCE(pnl, 0) = 0 AND COALESCE(result, '') NOT IN ('WIN', 'LOSS') THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(pnl), 0),
            COALESCE(SUM(stake), 0)
        INTO
            v_total_bets, v_wins, v_losses, v_pushes, v_total_pnl, v_total_staked
        FROM sim_bets
        WHERE market = p_market AND (v_cutoff IS NULL OR as_of_ts >= v_cutoff);
    END IF;

    -- Calculate Prior Peak for Drawdown optimization
    IF p_market IS NULL THEN
        SELECT MAX(bankroll_after) INTO v_prior_peak 
        FROM sim_bets 
        WHERE (v_cutoff IS NULL OR as_of_ts < v_cutoff);
    ELSE
        SELECT MAX(bankroll_after) INTO v_prior_peak 
        FROM sim_bets 
        WHERE market = p_market AND (v_cutoff IS NULL OR as_of_ts < v_cutoff);
    END IF;
    v_prior_peak := COALESCE(v_prior_peak, 1000);

    -- Calculate Peak Bankroll and Max Drawdown
    IF p_market IS NULL THEN
        SELECT
            COALESCE(MAX(running_max), 1000),
            COALESCE(MAX(CASE WHEN running_max > 0 THEN (running_max - bankroll_after) / running_max ELSE 0 END), 0)
        INTO v_peak_bankroll, v_max_drawdown
        FROM (
            SELECT
                bankroll_after,
                GREATEST(v_prior_peak, MAX(bankroll_after) OVER (ORDER BY as_of_ts ASC, id ASC)) as running_max
            FROM sim_bets
            WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
        ) sub;
    ELSE
        SELECT
            COALESCE(MAX(running_max), 1000),
            COALESCE(MAX(CASE WHEN running_max > 0 THEN (running_max - bankroll_after) / running_max ELSE 0 END), 0)
        INTO v_peak_bankroll, v_max_drawdown
        FROM (
            SELECT
                bankroll_after,
                GREATEST(v_prior_peak, MAX(bankroll_after) OVER (ORDER BY as_of_ts ASC, id ASC)) as running_max
            FROM sim_bets
            WHERE market = p_market AND (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
        ) sub;
    END IF;

    -- Weekly Curve Calculation (using DISTINCT ON for O(1) traversal)
    IF p_market IS NULL THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'weekOf', week_start,
                'bets', bets,
                'pnl', pnl,
                'bankroll', bankroll_after
            )
        ) INTO v_weekly
        FROM (
            SELECT DISTINCT ON (TO_CHAR(DATE_TRUNC('week', as_of_ts), 'YYYY-MM-DD'))
                TO_CHAR(DATE_TRUNC('week', as_of_ts), 'YYYY-MM-DD') as week_start,
                COUNT(*) OVER (PARTITION BY DATE_TRUNC('week', as_of_ts)) as bets,
                COALESCE(SUM(pnl) OVER (PARTITION BY DATE_TRUNC('week', as_of_ts)), 0) as pnl,
                bankroll_after
            FROM sim_bets
            WHERE as_of_ts IS NOT NULL
              AND (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
            ORDER BY TO_CHAR(DATE_TRUNC('week', as_of_ts), 'YYYY-MM-DD') ASC, as_of_ts DESC, id DESC
        ) sub;
    ELSE
        SELECT jsonb_agg(
            jsonb_build_object(
                'weekOf', week_start,
                'bets', bets,
                'pnl', pnl,
                'bankroll', bankroll_after
            )
        ) INTO v_weekly
        FROM (
            SELECT DISTINCT ON (TO_CHAR(DATE_TRUNC('week', as_of_ts), 'YYYY-MM-DD'))
                TO_CHAR(DATE_TRUNC('week', as_of_ts), 'YYYY-MM-DD') as week_start,
                COUNT(*) OVER (PARTITION BY DATE_TRUNC('week', as_of_ts)) as bets,
                COALESCE(SUM(pnl) OVER (PARTITION BY DATE_TRUNC('week', as_of_ts)), 0) as pnl,
                bankroll_after
            FROM sim_bets
            WHERE as_of_ts IS NOT NULL
              AND market = p_market
              AND (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
            ORDER BY TO_CHAR(DATE_TRUNC('week', as_of_ts), 'YYYY-MM-DD') ASC, as_of_ts DESC, id DESC
        ) sub;
    END IF;

    -- Recent Bets Calculation
    IF p_market IS NULL THEN
        SELECT COALESCE(jsonb_agg(row_to_json), '[]'::jsonb) INTO v_recent
        FROM (
            SELECT jsonb_build_object(
                'id', id, 'as_of_ts', as_of_ts, 'pnl', pnl, 'result', result,
                'stake', stake, 'bankroll_after', bankroll_after, 'market', market,
                'selection', selection, 'edge_pts', edge_pts, 'bet_score', bet_score,
                'bet_tier', bet_tier, 'game_pk', game_pk
            ) as row_to_json
            FROM sim_bets
            WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
            ORDER BY as_of_ts DESC, id DESC
            LIMIT 20
        ) sub;
    ELSE
        SELECT COALESCE(jsonb_agg(row_to_json), '[]'::jsonb) INTO v_recent
        FROM (
            SELECT jsonb_build_object(
                'id', id, 'as_of_ts', as_of_ts, 'pnl', pnl, 'result', result,
                'stake', stake, 'bankroll_after', bankroll_after, 'market', market,
                'selection', selection, 'edge_pts', edge_pts, 'bet_score', bet_score,
                'bet_tier', bet_tier, 'game_pk', game_pk
            ) as row_to_json
            FROM sim_bets
            WHERE market = p_market AND (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
            ORDER BY as_of_ts DESC, id DESC
            LIMIT 20
        ) sub;
    END IF;

    -- Derived calculations
    IF v_total_staked > 0 THEN
        v_roi := (v_total_pnl / v_total_staked) * 100;
    ELSE
        v_roi := NULL;
    END IF;

    IF (v_wins + v_losses) > 0 THEN
        v_win_rate := (v_wins::numeric / (v_wins + v_losses)) * 100;
    ELSE
        v_win_rate := 0;
    END IF;

    -- Absolute Final Bankroll (independent of window)
    IF p_market IS NULL THEN
        SELECT bankroll_after INTO v_final_bankroll
        FROM sim_bets
        ORDER BY as_of_ts DESC, id DESC
        LIMIT 1;
    ELSE
        SELECT bankroll_after INTO v_final_bankroll
        FROM sim_bets
        WHERE market = p_market
        ORDER BY as_of_ts DESC, id DESC
        LIMIT 1;
    END IF;
    v_final_bankroll := COALESCE(v_final_bankroll, 1000);

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
