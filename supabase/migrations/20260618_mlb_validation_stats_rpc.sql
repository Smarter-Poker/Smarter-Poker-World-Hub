-- Create RPC function to calculate MLB Validation Stats
CREATE OR REPLACE FUNCTION get_mlb_validation_stats()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    all_count integer;
    all_model_brier numeric;
    all_mkt_brier numeric;

    flagged_count integer;
    flagged_win_rate numeric;
    flagged_roi numeric;
    flagged_model_brier numeric;
    flagged_mkt_brier numeric;

    edge_10_plus_n integer; edge_10_plus_wins integer; edge_10_plus_profit numeric;
    edge_3_5_n integer; edge_3_5_wins integer; edge_3_5_profit numeric;
    edge_5_7_n integer; edge_5_7_wins integer; edge_5_7_profit numeric;
    edge_7_10_n integer; edge_7_10_wins integer; edge_7_10_profit numeric;
BEGIN
    -- 1. ALL GRADED OUTCOMES
    SELECT 
        COUNT(*),
        AVG(CASE WHEN model_prob IS NOT NULL THEN POWER(model_prob - CASE WHEN actual_result::text IN ('true', 't', '1') THEN 1 ELSE 0 END, 2) ELSE NULL END),
        AVG(CASE WHEN market_novig_prob IS NOT NULL THEN POWER(market_novig_prob - CASE WHEN actual_result::text IN ('true', 't', '1') THEN 1 ELSE 0 END, 2) ELSE NULL END)
    INTO 
        all_count, all_model_brier, all_mkt_brier
    FROM backtest_market_output
    WHERE actual_result IS NOT NULL;

    -- 2. ENGINE'S FLAGGED BETS (rec contains 'BET')
    SELECT 
        COUNT(*),
        COALESCE(SUM(CASE WHEN actual_result::text IN ('true', 't', '1') THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0),
        COALESCE(SUM(unit_profit) * 100.0 / NULLIF(COUNT(*), 0), 0),
        AVG(CASE WHEN model_prob IS NOT NULL THEN POWER(model_prob - CASE WHEN actual_result::text IN ('true', 't', '1') THEN 1 ELSE 0 END, 2) ELSE NULL END),
        AVG(CASE WHEN market_novig_prob IS NOT NULL THEN POWER(market_novig_prob - CASE WHEN actual_result::text IN ('true', 't', '1') THEN 1 ELSE 0 END, 2) ELSE NULL END)
    INTO 
        flagged_count, flagged_win_rate, flagged_roi, flagged_model_brier, flagged_mkt_brier
    FROM backtest_market_output
    WHERE actual_result IS NOT NULL AND (rec ILIKE '%BET%');

    -- 3. ROI BY EDGE SIZE (from flagged)
    SELECT 
        COUNT(*) FILTER (WHERE edge_pts >= 10),
        COALESCE(SUM(CASE WHEN actual_result::text IN ('true', 't', '1') THEN 1 ELSE 0 END) FILTER (WHERE edge_pts >= 10), 0),
        COALESCE(SUM(unit_profit) FILTER (WHERE edge_pts >= 10), 0),

        COUNT(*) FILTER (WHERE edge_pts >= 3 AND edge_pts < 5),
        COALESCE(SUM(CASE WHEN actual_result::text IN ('true', 't', '1') THEN 1 ELSE 0 END) FILTER (WHERE edge_pts >= 3 AND edge_pts < 5), 0),
        COALESCE(SUM(unit_profit) FILTER (WHERE edge_pts >= 3 AND edge_pts < 5), 0),

        COUNT(*) FILTER (WHERE edge_pts >= 5 AND edge_pts < 7),
        COALESCE(SUM(CASE WHEN actual_result::text IN ('true', 't', '1') THEN 1 ELSE 0 END) FILTER (WHERE edge_pts >= 5 AND edge_pts < 7), 0),
        COALESCE(SUM(unit_profit) FILTER (WHERE edge_pts >= 5 AND edge_pts < 7), 0),

        COUNT(*) FILTER (WHERE edge_pts >= 7 AND edge_pts < 10),
        COALESCE(SUM(CASE WHEN actual_result::text IN ('true', 't', '1') THEN 1 ELSE 0 END) FILTER (WHERE edge_pts >= 7 AND edge_pts < 10), 0),
        COALESCE(SUM(unit_profit) FILTER (WHERE edge_pts >= 7 AND edge_pts < 10), 0)
    INTO 
        edge_10_plus_n, edge_10_plus_wins, edge_10_plus_profit,
        edge_3_5_n, edge_3_5_wins, edge_3_5_profit,
        edge_5_7_n, edge_5_7_wins, edge_5_7_profit,
        edge_7_10_n, edge_7_10_wins, edge_7_10_profit
    FROM backtest_market_output
    WHERE actual_result IS NOT NULL AND (rec ILIKE '%BET%');

    -- Build and return JSON object matching the frontend expectations exactly
    RETURN json_build_object(
        'all', json_build_object(
            'count', all_count,
            'modelBrier', COALESCE(all_model_brier, 0),
            'mktBrier', all_mkt_brier
        ),
        'flagged', json_build_object(
            'count', flagged_count,
            'winRate', flagged_win_rate,
            'roi', flagged_roi,
            'modelBrier', COALESCE(flagged_model_brier, 0),
            'mktBrier', flagged_mkt_brier
        ),
        'edgeData', json_build_array(
            json_build_object(
                'edge', '10+ pts',
                'n', COALESCE(edge_10_plus_n, 0),
                'winPct', CASE WHEN edge_10_plus_n > 0 THEN ROUND((edge_10_plus_wins::numeric / edge_10_plus_n) * 100) ELSE 0 END,
                'roi', CASE WHEN edge_10_plus_n > 0 THEN (edge_10_plus_profit / edge_10_plus_n) * 100 ELSE 0 END
            ),
            json_build_object(
                'edge', '3-5 pts',
                'n', COALESCE(edge_3_5_n, 0),
                'winPct', CASE WHEN edge_3_5_n > 0 THEN ROUND((edge_3_5_wins::numeric / edge_3_5_n) * 100) ELSE 0 END,
                'roi', CASE WHEN edge_3_5_n > 0 THEN (edge_3_5_profit / edge_3_5_n) * 100 ELSE 0 END
            ),
            json_build_object(
                'edge', '5-7 pts',
                'n', COALESCE(edge_5_7_n, 0),
                'winPct', CASE WHEN edge_5_7_n > 0 THEN ROUND((edge_5_7_wins::numeric / edge_5_7_n) * 100) ELSE 0 END,
                'roi', CASE WHEN edge_5_7_n > 0 THEN (edge_5_7_profit / edge_5_7_n) * 100 ELSE 0 END
            ),
            json_build_object(
                'edge', '7-10 pts',
                'n', COALESCE(edge_7_10_n, 0),
                'winPct', CASE WHEN edge_7_10_n > 0 THEN ROUND((edge_7_10_wins::numeric / edge_7_10_n) * 100) ELSE 0 END,
                'roi', CASE WHEN edge_7_10_n > 0 THEN (edge_7_10_profit / edge_7_10_n) * 100 ELSE 0 END
            )
        )
    );
END;
$$;
