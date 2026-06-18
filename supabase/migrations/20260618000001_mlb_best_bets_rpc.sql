CREATE OR REPLACE FUNCTION get_best_bets_stats(target_date text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    bets_data json;
    stats_data json;
    result json;
    actual_date text;
BEGIN
    IF target_date IS NULL THEN
        SELECT official_date INTO actual_date
        FROM pred_best_bets
        ORDER BY official_date DESC
        LIMIT 1;
    ELSE
        actual_date := target_date;
    END IF;

    IF actual_date IS NULL THEN
        RETURN json_build_object(
            'bets', '[]'::json,
            'stats', json_build_object(
                'totalBets', 0,
                'eliteBets', 0,
                'topScore', 0,
                'topLock', 0
            ),
            'officialDate', NULL
        );
    END IF;

    -- Get the bets
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    INTO bets_data
    FROM (
        SELECT *
        FROM pred_best_bets
        WHERE official_date = actual_date
        ORDER BY rank ASC
    ) t;

    -- Get the stats
    SELECT json_build_object(
        'totalBets', count(*),
        'eliteBets', count(*) FILTER (WHERE edge_pts >= 5),
        'topScore', COALESCE(max(bet_score), 0),
        'topLock', COALESCE(max(implied_prob), 0)
    ) INTO stats_data
    FROM pred_best_bets
    WHERE official_date = actual_date;

    -- Return combined result
    SELECT json_build_object(
        'bets', bets_data,
        'stats', stats_data,
        'officialDate', actual_date
    ) INTO result;

    RETURN result;
END;
$$;
