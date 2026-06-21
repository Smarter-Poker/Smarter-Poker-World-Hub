-- Migration: Deep fixes for MLB Status Engine
-- 1. v_model_health: Check raw_games for today's slate to prevent false fresh/stale reports
-- 2. get_status_dashboard: Restore pg_namespace to prevent crash on identical table names in other schemas
-- 3. get_status_dashboard: Add raw_games to table counts

CREATE OR REPLACE VIEW public.v_model_health
WITH (security_invoker = true) AS
WITH latest AS (SELECT max(as_of_ts) ts FROM pred_market_output),
base AS (SELECT * FROM pred_market_output WHERE as_of_ts = (SELECT ts FROM latest)),
ml AS (SELECT game_pk, selection AS side, blended_prob AS win
       FROM base WHERE market='h2h' AND blended_prob IS NOT NULL),
rl AS (SELECT b.game_pk, b.selection, b.blended_prob AS cover, b.rec,
              split_part(b.selection,'_',1) AS side
       FROM base b
       WHERE b.market='run_line' AND right(b.selection,5)='_-1.5' AND b.blended_prob IS NOT NULL),
incoh AS (SELECT rl.game_pk, rl.rec
          FROM rl JOIN ml ON ml.game_pk=rl.game_pk AND ml.side=rl.side
          WHERE rl.cover > 0.80*ml.win),
has_slate_today AS (
  SELECT EXISTS(SELECT 1 FROM public.raw_games WHERE official_date = (now() AT TIME ZONE 'America/Chicago')::date) AS has_games
)
SELECT
  (SELECT ts FROM latest)                                                          AS latest_as_of,
  round((extract(epoch FROM (now()-(SELECT ts FROM latest)))/3600.0)::numeric,1)   AS hours_stale,
  (CASE 
     WHEN (SELECT has_games FROM has_slate_today) THEN (now()-(SELECT ts FROM latest) > interval '6 hours')
     ELSE false 
   END) AS is_stale,
  (SELECT count(DISTINCT game_pk) FROM base)                                        AS games_in_run,
  (SELECT count(DISTINCT game_pk) FROM base b
     WHERE b.market='h2h'
       AND NOT EXISTS (SELECT 1 FROM base b2
                        WHERE b2.game_pk=b.game_pk AND b2.market='h2h'
                          AND b2.blended_prob IS NOT NULL))                         AS unmodeled_games,
  (SELECT count(*) FROM incoh)                                                     AS incoherent_runlines,
  (SELECT count(*) FROM incoh WHERE rec NOT IN ('NO BET','MODEL ONLY'))            AS incoherent_runlines_with_bet,
  (SELECT count(*) FROM base
     WHERE rec IS NOT NULL AND rec NOT IN ('NO BET','MODEL ONLY'))                 AS total_live_recs;


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
    'pred_market_output', (SELECT COALESCE((SELECT GREATEST(c.reltuples::bigint, 0) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'pred_market_output'), 0)),
    'pred_props',         (SELECT COALESCE((SELECT GREATEST(c.reltuples::bigint, 0) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'pred_props'), 0)),
    'pred_best_bets',     (SELECT COALESCE((SELECT GREATEST(c.reltuples::bigint, 0) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'pred_best_bets'), 0)),
    'agg_market',         (SELECT COALESCE((SELECT GREATEST(c.reltuples::bigint, 0) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'agg_market'), 0)),
    'snapshots',          (SELECT COALESCE((SELECT GREATEST(c.reltuples::bigint, 0) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'snapshots'), 0)),
    'raw_games',          (SELECT COALESCE((SELECT GREATEST(c.reltuples::bigint, 0) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'raw_games'), 0))
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
