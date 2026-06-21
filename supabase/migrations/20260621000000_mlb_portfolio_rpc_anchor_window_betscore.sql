-- Migration: harden get_portfolio_stats for the MLB Portfolio page.
-- Target Supabase project: nscdmxldtyszyvcxxwgr (mlb-analytics-engine).
--
-- THREE fixes, all observed bugs (not theory):
--   1. TIMEFRAME ANCHOR. sim_bets.as_of_ts is date-granular (every row is 00:00:00).
--      The previous "last N days" window subtracted from NOW(), so once the backtest
--      data is older than N days the 7/14/30-day filters returned ZERO rows (today the
--      latest bet is 2026-06-09, so "Last 7 days" rendered an empty page). We now anchor
--      the rolling window to MAX(as_of_ts) — the end of the backtest — so the timeframe
--      filters stay meaningful regardless of refresh cadence.
--   2. STABLE ORDERING. Ordering bets within a single day by as_of_ts alone is
--      non-deterministic (all ties at 00:00:00), which made the weekly equity "last
--      bankroll" and the "recent 20" list unstable. We tie-break by id (the monotonic
--      bet sequence) everywhere ordering matters.
--   3. BET SCORE SURFACE. recentBets now includes bet_score / bet_tier / game_pk
--      (already stored on sim_bets) so the Recent Bets table shows the canonical 0-100
--      Bet Score + tier used across the rest of the MLB suite, not legacy edge points.
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
