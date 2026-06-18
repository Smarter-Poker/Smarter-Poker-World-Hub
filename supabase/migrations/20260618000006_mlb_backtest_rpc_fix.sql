-- migration 20260618000006_mlb_backtest_rpc_fix.sql
-- Fixes the get_mlb_backtest_stats RPC by removing AVG(clv_pts) which doesn't exist on backtest_market_output

CREATE OR REPLACE FUNCTION get_mlb_backtest_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_predictions int;
  v_won_bets int;
  v_lost_bets int;
  v_avg_brier numeric;
  v_units_won numeric;
  v_avg_clv numeric;
  v_market_breakdown json;
  v_daily_trend json;
BEGIN
  -- Overall stats
  SELECT
    COUNT(*) FILTER (WHERE rec LIKE '%BET%' AND rec NOT LIKE '%NO BET%'),
    COUNT(*) FILTER (WHERE rec LIKE '%BET%' AND rec NOT LIKE '%NO BET%' AND unit_profit > 0),
    COUNT(*) FILTER (WHERE rec LIKE '%BET%' AND rec NOT LIKE '%NO BET%' AND unit_profit <= 0 AND actual_result IS NOT NULL),
    AVG(brier_score),
    SUM(unit_profit) FILTER (WHERE rec LIKE '%BET%' AND rec NOT LIKE '%NO BET%'),
    0 -- AVG(clv_pts) removed
  INTO
    v_total_predictions,
    v_won_bets,
    v_lost_bets,
    v_avg_brier,
    v_units_won,
    v_avg_clv
  FROM backtest_market_output;

  -- Market breakdown
  SELECT json_agg(
    json_build_object(
      'market', COALESCE(
        CASE 
          WHEN m.market = 'h2h' THEN 'Moneyline (h2h)'
          WHEN m.market = 'total' THEN 'Totals'
          WHEN m.market = 'run_line' THEN 'Run Line'
          ELSE initcap(replace(m.market, '_', ' '))
        END, 'Unknown'
      ),
      'n', m.n,
      'wins', m.wins,
      'winRate', CASE WHEN m.n > 0 THEN (m.wins::numeric / m.n) * 100 ELSE 0 END,
      'avgBrier', m.avg_brier,
      'roi', CASE WHEN m.n > 0 THEN (m.profit_sum / m.n) * 100 ELSE NULL END
    )
  )
  INTO v_market_breakdown
  FROM (
    SELECT
      market,
      COUNT(*) FILTER (WHERE rec LIKE '%BET%' AND rec NOT LIKE '%NO BET%') AS n,
      COUNT(*) FILTER (WHERE rec LIKE '%BET%' AND rec NOT LIKE '%NO BET%' AND unit_profit > 0) AS wins,
      AVG(brier_score) AS avg_brier,
      SUM(unit_profit) FILTER (WHERE rec LIKE '%BET%' AND rec NOT LIKE '%NO BET%') AS profit_sum
    FROM backtest_market_output
    GROUP BY market
  ) m;

  -- Daily Trend (last 14 days)
  SELECT json_agg(dt.*)
  INTO v_daily_trend
  FROM (
    SELECT *
    FROM backtest_accuracy
    ORDER BY backtest_date DESC
    LIMIT 14
  ) dt;

  RETURN json_build_object(
    'stats', json_build_object(
      'totalPredictions', COALESCE(v_total_predictions, 0),
      'wonBets', COALESCE(v_won_bets, 0),
      'lostBets', COALESCE(v_lost_bets, 0),
      'winRate', CASE WHEN v_total_predictions > 0 THEN (v_won_bets::numeric / v_total_predictions) * 100 ELSE 0 END,
      'avgBrier', COALESCE(v_avg_brier, 0),
      'brierVsBaseline', COALESCE(v_avg_brier, 0) - 0.2500,
      'cumulativeRoi', CASE WHEN v_total_predictions > 0 THEN (COALESCE(v_units_won, 0) / v_total_predictions) * 100 ELSE 0 END,
      'unitsWon', COALESCE(v_units_won, 0),
      'avgClv', COALESCE(v_avg_clv, 0)
    ),
    'marketBreakdown', COALESCE(v_market_breakdown, '[]'::json),
    'dailyTrend', COALESCE(v_daily_trend, '[]'::json)
  );
END;
$$;
