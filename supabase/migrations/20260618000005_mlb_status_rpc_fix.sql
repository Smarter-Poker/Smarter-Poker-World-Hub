CREATE OR REPLACE FUNCTION get_mlb_status_metrics(last_24h_iso timestamp with time zone, today_str text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    latest_pipeline_runs json;
    latest_pred_as_of timestamp with time zone;
    market_bets_count bigint;
    props_count bigint;
    best_bets_count bigint;
    size_market bigint;
    size_props bigint;
    size_fact_games bigint;
    size_odds bigint;
BEGIN
    -- 1. latest pipeline runs
    SELECT json_agg(t) INTO latest_pipeline_runs
    FROM (
        SELECT *
        FROM pipeline_runs
        ORDER BY run_at DESC
        LIMIT 100
    ) t;

    -- 2. latest pred as of
    SELECT as_of_ts INTO latest_pred_as_of
    FROM pred_market_output
    ORDER BY as_of_ts DESC
    LIMIT 1;

    -- 3. count market bets >= last_24h_iso
    SELECT count(*) INTO market_bets_count
    FROM pred_market_output
    WHERE as_of_ts >= last_24h_iso;

    -- 4. count props >= last_24h_iso
    SELECT count(*) INTO props_count
    FROM pred_props
    WHERE as_of_ts >= last_24h_iso;

    -- 5. count best bets = today_str
    SELECT count(*) INTO best_bets_count
    FROM pred_best_bets
    WHERE official_date = today_str;

    -- 6. estimated count size market
    SELECT reltuples::bigint INTO size_market FROM pg_class WHERE relname = 'pred_market_output';

    -- 7. estimated count size props
    SELECT reltuples::bigint INTO size_props FROM pg_class WHERE relname = 'pred_props';
    SELECT reltuples::bigint INTO size_fact_games FROM pg_class WHERE relname = 'fact_games';
    SELECT reltuples::bigint INTO size_odds FROM pg_class WHERE relname = 'raw_odds';

    RETURN json_build_object(
        'pipeline_runs', COALESCE(latest_pipeline_runs, '[]'::json),
        'latest_pred_as_of', latest_pred_as_of,
        'market_bets_count', COALESCE(market_bets_count, 0),
        'props_count', COALESCE(props_count, 0),
        'best_bets_count', COALESCE(best_bets_count, 0),
        'size_market', COALESCE(size_market, 0),
        'size_props', COALESCE(size_props, 0),
        'size_fact_games', COALESCE(size_fact_games, 0),
        'size_odds', COALESCE(size_odds, 0)
    );
END;
$$;
