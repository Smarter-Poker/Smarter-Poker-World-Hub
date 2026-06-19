-- Fix get_best_bets_stats RPC: operator does not exist: date = text
-- The WHERE clause comparing official_date (DATE) to actual_date (DATE) was fine
-- but the SELECT ordering was using text comparison. This rewrite is fully explicit.

CREATE OR REPLACE FUNCTION get_best_bets_stats(target_date text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    bets_data json;
    stats_data json;
    result json;
    actual_date date;
BEGIN
    IF target_date IS NULL THEN
        SELECT official_date INTO actual_date
        FROM pred_best_bets
        ORDER BY official_date DESC
        LIMIT 1;
    ELSE
        actual_date := target_date::date;
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

    -- Get all bets for this date, ordered by rank
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.rank ASC), '[]'::json)
    INTO bets_data
    FROM (
        SELECT *
        FROM pred_best_bets
        WHERE official_date = actual_date
    ) t;

    -- Compute aggregated stats
    SELECT json_build_object(
        'totalBets',  COUNT(*)::int,
        'eliteBets',  COUNT(*) FILTER (WHERE edge >= 5)::int,
        'topScore',   COALESCE(MAX(bet_score), 0)::numeric,
        'topLock',    COALESCE(MAX(win_confidence), 0)::numeric
    )
    INTO stats_data
    FROM pred_best_bets
    WHERE official_date = actual_date;

    RETURN json_build_object(
        'bets',        bets_data,
        'stats',       stats_data,
        'officialDate', actual_date::text
    );
END;
$$;

-- Grant execute to anon and authenticated so the API can call it
GRANT EXECUTE ON FUNCTION get_best_bets_stats(text) TO anon, authenticated, service_role;
