-- Migration supabase/migrations/20260618000002_mlb_validation_rpc.sql

CREATE OR REPLACE FUNCTION mlb_validation_stats(days_filter INT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
    cutoff TIMESTAMPTZ;
    all_count INT := 0;
    all_model_brier_sum FLOAT8 := 0;
    all_mkt_brier_sum FLOAT8 := 0;
    all_model_count INT := 0;
    all_mkt_count INT := 0;

    flag_count INT := 0;
    flag_wins INT := 0;
    flag_profit FLOAT8 := 0;
    flag_model_brier_sum FLOAT8 := 0;
    flag_model_count INT := 0;
    flag_mkt_brier_sum FLOAT8 := 0;
    flag_mkt_count INT := 0;

    bucket_10_n INT := 0;
    bucket_10_wins INT := 0;
    bucket_10_profit FLOAT8 := 0;
    
    bucket_7_10_n INT := 0;
    bucket_7_10_wins INT := 0;
    bucket_7_10_profit FLOAT8 := 0;
    
    bucket_5_7_n INT := 0;
    bucket_5_7_wins INT := 0;
    bucket_5_7_profit FLOAT8 := 0;
    
    bucket_3_5_n INT := 0;
    bucket_3_5_wins INT := 0;
    bucket_3_5_profit FLOAT8 := 0;
    
    r RECORD;
    is_win BOOLEAN;
    r_brier_model FLOAT8;
    r_brier_mkt FLOAT8;
    e FLOAT8;
BEGIN
    IF days_filter IS NOT NULL THEN
        cutoff := NOW() - (days_filter || ' days')::INTERVAL;
    END IF;

    FOR r IN 
        SELECT model_prob, market_novig_prob, actual_result, edge_pts, unit_profit, rec
        FROM backtest_market_output
        WHERE actual_result IS NOT NULL
          AND (cutoff IS NULL OR created_at >= cutoff)
    LOOP
        is_win := (r.actual_result::text = 'true' OR r.actual_result::text = '1');
        
        IF r.model_prob IS NOT NULL THEN
            r_brier_model := POWER(r.model_prob - (CASE WHEN is_win THEN 1 ELSE 0 END), 2);
            all_model_brier_sum := all_model_brier_sum + r_brier_model;
            all_model_count := all_model_count + 1;
        END IF;

        IF r.market_novig_prob IS NOT NULL THEN
            r_brier_mkt := POWER(r.market_novig_prob - (CASE WHEN is_win THEN 1 ELSE 0 END), 2);
            all_mkt_brier_sum := all_mkt_brier_sum + r_brier_mkt;
            all_mkt_count := all_mkt_count + 1;
        END IF;
        
        all_count := all_count + 1;

        IF r.rec ILIKE '%BET%' THEN
            flag_count := flag_count + 1;
            IF is_win THEN
                flag_wins := flag_wins + 1;
            END IF;
            flag_profit := flag_profit + COALESCE(r.unit_profit, 0);

            IF r.model_prob IS NOT NULL THEN
                flag_model_brier_sum := flag_model_brier_sum + r_brier_model;
                flag_model_count := flag_model_count + 1;
            END IF;

            IF r.market_novig_prob IS NOT NULL THEN
                flag_mkt_brier_sum := flag_mkt_brier_sum + r_brier_mkt;
                flag_mkt_count := flag_mkt_count + 1;
            END IF;

            e := COALESCE(r.edge_pts, 0);
            IF e >= 10 THEN
                bucket_10_n := bucket_10_n + 1;
                IF is_win THEN bucket_10_wins := bucket_10_wins + 1; END IF;
                bucket_10_profit := bucket_10_profit + COALESCE(r.unit_profit, 0);
            ELSIF e >= 7 AND e < 10 THEN
                bucket_7_10_n := bucket_7_10_n + 1;
                IF is_win THEN bucket_7_10_wins := bucket_7_10_wins + 1; END IF;
                bucket_7_10_profit := bucket_7_10_profit + COALESCE(r.unit_profit, 0);
            ELSIF e >= 5 AND e < 7 THEN
                bucket_5_7_n := bucket_5_7_n + 1;
                IF is_win THEN bucket_5_7_wins := bucket_5_7_wins + 1; END IF;
                bucket_5_7_profit := bucket_5_7_profit + COALESCE(r.unit_profit, 0);
            ELSIF e >= 3 AND e < 5 THEN
                bucket_3_5_n := bucket_3_5_n + 1;
                IF is_win THEN bucket_3_5_wins := bucket_3_5_wins + 1; END IF;
                bucket_3_5_profit := bucket_3_5_profit + COALESCE(r.unit_profit, 0);
            END IF;
        END IF;
    END LOOP;

    RETURN json_build_object(
        'activeDays', days_filter,
        'all', json_build_object(
            'count', all_count,
            'modelBrier', CASE WHEN all_model_count > 0 THEN all_model_brier_sum / all_model_count ELSE 0 END,
            'mktBrier', CASE WHEN all_mkt_count > 0 THEN all_mkt_brier_sum / all_mkt_count ELSE NULL END
        ),
        'flagged', json_build_object(
            'count', flag_count,
            'winRate', CASE WHEN flag_count > 0 THEN (flag_wins::FLOAT8 / flag_count) * 100 ELSE 0 END,
            'roi', CASE WHEN flag_count > 0 THEN (flag_profit / flag_count) * 100 ELSE 0 END,
            'modelBrier', CASE WHEN flag_model_count > 0 THEN flag_model_brier_sum / flag_model_count ELSE 0 END,
            'mktBrier', CASE WHEN flag_mkt_count > 0 THEN flag_mkt_brier_sum / flag_mkt_count ELSE NULL END
        ),
        'edgeData', json_build_array(
            json_build_object(
                'edge', '10+ pts',
                'n', bucket_10_n,
                'winPct', CASE WHEN bucket_10_n > 0 THEN ROUND((bucket_10_wins::NUMERIC / bucket_10_n) * 100) ELSE 0 END,
                'roi', CASE WHEN bucket_10_n > 0 THEN (bucket_10_profit / bucket_10_n) * 100 ELSE 0 END
            ),
            json_build_object(
                'edge', '7-10 pts',
                'n', bucket_7_10_n,
                'winPct', CASE WHEN bucket_7_10_n > 0 THEN ROUND((bucket_7_10_wins::NUMERIC / bucket_7_10_n) * 100) ELSE 0 END,
                'roi', CASE WHEN bucket_7_10_n > 0 THEN (bucket_7_10_profit / bucket_7_10_n) * 100 ELSE 0 END
            ),
            json_build_object(
                'edge', '5-7 pts',
                'n', bucket_5_7_n,
                'winPct', CASE WHEN bucket_5_7_n > 0 THEN ROUND((bucket_5_7_wins::NUMERIC / bucket_5_7_n) * 100) ELSE 0 END,
                'roi', CASE WHEN bucket_5_7_n > 0 THEN (bucket_5_7_profit / bucket_5_7_n) * 100 ELSE 0 END
            ),
            json_build_object(
                'edge', '3-5 pts',
                'n', bucket_3_5_n,
                'winPct', CASE WHEN bucket_3_5_n > 0 THEN ROUND((bucket_3_5_wins::NUMERIC / bucket_3_5_n) * 100) ELSE 0 END,
                'roi', CASE WHEN bucket_3_5_n > 0 THEN (bucket_3_5_profit / bucket_3_5_n) * 100 ELSE 0 END
            )
        )
    );
END;
$$ LANGUAGE plpgsql;
