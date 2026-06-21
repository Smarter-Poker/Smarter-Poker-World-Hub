-- 1. Create missing indexes for max(as_of_ts) queries to prevent Full Table Scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pred_market_output_as_of_ts ON public.pred_market_output (as_of_ts DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pred_best_bets_as_of_ts ON public.pred_best_bets (as_of_ts DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pred_props_as_of_ts ON public.pred_props (as_of_ts DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agg_market_as_of ON public.agg_market (as_of DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pipeline_runs_run_ts ON public.pipeline_runs (run_ts DESC NULLS LAST);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alert_log_fired_at ON public.alert_log (fired_at DESC NULLS LAST);

-- 2. Update the RPC to fix the pg_class crash risk and inefficient aggregations
CREATE OR REPLACE FUNCTION public.get_status_dashboard()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH
mkt_latest   AS (SELECT max(as_of_ts) AS ts FROM pred_market_output),
props_latest AS (SELECT max(as_of_ts) AS ts FROM pred_props),
bb_latest    AS (SELECT max(as_of_ts) AS ts FROM pred_best_bets),
tier_dist AS (
  SELECT
    count(*) FILTER (WHERE g = 'ELITE')  AS "ELITE",
    count(*) FILTER (WHERE g = 'STRONG') AS "STRONG",
    count(*) FILTER (WHERE g = 'LEAN')   AS "LEAN",
    count(*) FILTER (WHERE g = 'THIN')   AS "THIN",
    count(*) FILTER (WHERE g = 'PASS')   AS "PASS",
    count(*) FILTER (WHERE g IS NULL)    AS unscored
  FROM (
    SELECT CASE
      WHEN bet_tier IS NOT NULL THEN bet_tier
      WHEN bet_score IS NULL    THEN NULL
      WHEN bet_score >= 82      THEN 'ELITE'
      WHEN bet_score >= 68      THEN 'STRONG'
      WHEN bet_score >= 52      THEN 'LEAN'
      WHEN bet_score >= 38      THEN 'THIN'
      ELSE 'PASS'
    END AS g
    FROM pred_best_bets
    WHERE as_of_ts = (SELECT ts FROM bb_latest)   -- latest slate only
  ) x
),
runs AS (
  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) AS j
  FROM (
    SELECT id, run_ts, stage, step, status, duration_sec, rows_written, notes
    FROM pipeline_runs ORDER BY run_ts DESC NULLS LAST LIMIT 12
  ) r
),
alerts AS (
  SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) AS j
  FROM (
    SELECT id, fired_at, created_at, level, alert_type, message, source
    FROM alert_log ORDER BY fired_at DESC NULLS LAST LIMIT 6
  ) a
),
sources AS (
  SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) AS j
  FROM (
    SELECT source, pulled_at, status, row_count
    FROM v_data_source_health
    WHERE source IN ('daily_predict','odds_api','mlb_api','fangraphs','fangraphs_splits','statcast','injuries','weather','umpire_scorecards')
  ) s
)
SELECT jsonb_build_object(
  'server_now', now(),
  'today',      (now() AT TIME ZONE 'America/Chicago')::date,
  'health',     (SELECT to_jsonb(h) FROM v_model_health h LIMIT 1),
  'accuracy',   (SELECT to_jsonb(a) FROM (SELECT total_games_evaluated, daily_samples, wtd_avg_brier_ml, wtd_avg_brier_props FROM v_model_accuracy_summary LIMIT 1) a),
  'agg_as_of',  (SELECT max(as_of) FROM agg_market),
  'slate', jsonb_build_object(
    'mkt',   (SELECT count(*) FROM pred_market_output WHERE as_of_ts = (SELECT ts FROM mkt_latest)),
    'props', (SELECT count(*) FROM pred_props        WHERE as_of_ts = (SELECT ts FROM props_latest)),
    'best',  (SELECT count(*) FROM pred_best_bets    WHERE as_of_ts = (SELECT ts FROM bb_latest))
  ),
  'table_counts', jsonb_build_object(
    'pred_market_output', COALESCE((SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'pred_market_output'), 0),
    'pred_props',         COALESCE((SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'pred_props'), 0),
    'pred_best_bets',     COALESCE((SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'pred_best_bets'), 0),
    'agg_market',         COALESCE((SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'agg_market'), 0),
    'snapshots',          COALESCE((SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'snapshots'), 0)
  ),
  'tier_dist',     (SELECT to_jsonb(tier_dist) FROM tier_dist),
  'pipeline_runs', (SELECT j FROM runs),
  'alerts',        (SELECT j FROM alerts),
  'sources',       (SELECT j FROM sources)
);
$$;
