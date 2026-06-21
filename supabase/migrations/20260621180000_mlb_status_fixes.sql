-- Migration: Fix get_status_dashboard() edge cases (e.g. pg_class.reltuples = -1)

CREATE OR REPLACE FUNCTION public.get_status_dashboard()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH
today AS (SELECT (now() AT TIME ZONE 'America/Chicago')::date AS d),
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
    WHERE as_of_ts = (SELECT ts FROM bb_latest)
  ) x
),
runs AS (
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.run_ts DESC NULLS LAST), '[]'::jsonb) AS j
  FROM (
    SELECT id, run_ts, stage, step, status, duration_sec, rows_written, notes
    FROM pipeline_runs ORDER BY run_ts DESC NULLS LAST LIMIT 12
  ) r
),
alerts AS (
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.fired_at DESC NULLS LAST), '[]'::jsonb) AS j
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
  'today',      (SELECT d FROM today),
  'health',     (SELECT to_jsonb(h) FROM v_model_health h LIMIT 1),
  'accuracy',   (SELECT to_jsonb(a) FROM (SELECT total_games_evaluated, daily_samples, wtd_avg_brier_ml, wtd_avg_brier_props FROM v_model_accuracy_summary LIMIT 1) a),
  'agg_as_of',  (SELECT max(as_of) FROM agg_market),
  'slate', jsonb_build_object(
    'mkt',   (SELECT count(*) FROM pred_market_output WHERE as_of_ts = (SELECT ts FROM mkt_latest)),
    'props', (SELECT count(*) FROM pred_props        WHERE as_of_ts = (SELECT ts FROM props_latest)),
    'best',  (SELECT count(*) FROM pred_best_bets    WHERE as_of_ts = (SELECT ts FROM bb_latest))
  ),
  'table_counts', jsonb_build_object(
    'pred_market_output', (SELECT GREATEST(COALESCE(reltuples::bigint, 0), 0) FROM pg_class WHERE relname = 'pred_market_output'),
    'pred_props',         (SELECT GREATEST(COALESCE(reltuples::bigint, 0), 0) FROM pg_class WHERE relname = 'pred_props'),
    'pred_best_bets',     (SELECT GREATEST(COALESCE(reltuples::bigint, 0), 0) FROM pg_class WHERE relname = 'pred_best_bets'),
    'agg_market',         (SELECT GREATEST(COALESCE(reltuples::bigint, 0), 0) FROM pg_class WHERE relname = 'agg_market'),
    'snapshots',          (SELECT GREATEST(COALESCE(reltuples::bigint, 0), 0) FROM pg_class WHERE relname = 'snapshots')
  ),
  'tier_dist',     (SELECT to_jsonb(tier_dist) FROM tier_dist),
  'pipeline_runs', (SELECT j FROM runs),
  'alerts',        (SELECT j FROM alerts),
  'sources',       (SELECT j FROM sources)
);
$$;

REVOKE EXECUTE ON FUNCTION public.get_status_dashboard() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_status_dashboard() TO service_role;

NOTIFY pgrst, 'reload schema';
