CREATE OR REPLACE FUNCTION get_mlb_status_metrics(last_24h_iso timestamp with time zone, today_str text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    latest_pipeline_runs json;
    latest_pred_as_of timestamp with time zone;
    market_bets_count bigint := 0;
    props_count bigint := 0;
    best_bets_count bigint := 0;
    size_market bigint := 0;
    size_props bigint := 0;
    size_fact_games bigint := 0;
    size_odds bigint := 0;
BEGIN
    -- 1. latest pipeline runs
    IF to_regclass('public.pipeline_runs') IS NOT NULL THEN
        SELECT json_agg(t) INTO latest_pipeline_runs
        FROM (
            SELECT *
            FROM pipeline_runs
            ORDER BY run_at DESC
            LIMIT 100
        ) t;
    END IF;

    -- 2. latest pred as of & 3. count market bets & 6. size market
    IF to_regclass('public.pred_market_output') IS NOT NULL THEN
        SELECT as_of_ts INTO latest_pred_as_of
        FROM pred_market_output
        ORDER BY as_of_ts DESC
        LIMIT 1;

        SELECT count(*) INTO market_bets_count
        FROM pred_market_output
        WHERE as_of_ts >= last_24h_iso;

        SELECT reltuples::bigint INTO size_market FROM pg_class WHERE relname = 'pred_market_output';
    END IF;

    -- 4. count props & 7. size props
    IF to_regclass('public.pred_props') IS NOT NULL THEN
        SELECT count(*) INTO props_count
        FROM pred_props
        WHERE created_at >= last_24h_iso;

        SELECT reltuples::bigint INTO size_props FROM pg_class WHERE relname = 'pred_props';
    END IF;

    -- 5. count best bets
    IF to_regclass('public.pred_best_bets') IS NOT NULL THEN
        SELECT count(*) INTO best_bets_count
        FROM pred_best_bets
        WHERE official_date = today_str;
    END IF;

    -- 7. other sizes
    IF to_regclass('public.fact_games') IS NOT NULL THEN
        SELECT reltuples::bigint INTO size_fact_games FROM pg_class WHERE relname = 'fact_games';
    END IF;
    IF to_regclass('public.raw_odds') IS NOT NULL THEN
        SELECT reltuples::bigint INTO size_odds FROM pg_class WHERE relname = 'raw_odds';
    END IF;

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
