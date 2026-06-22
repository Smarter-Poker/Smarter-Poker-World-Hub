-- Migration: Final Swarm Audit Fixes for MLB Status Engine
-- Addresses critical logic stubs, index performance, and unique constraints.

-- 1. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_raw_games_official_date ON public.raw_games (official_date);
CREATE INDEX IF NOT EXISTS idx_alert_log_resolved_created_at ON public.alert_log (resolved, created_at DESC);

-- 2. Prevent Race Conditions in pipeline_runs
-- We want to prevent duplicate pending runs for the same stage.
-- We can add a unique partial index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_runs_unique_pending_stage 
ON public.pipeline_runs (stage) WHERE status IN ('pending', 'running');

-- 3. Fix v_model_health defaults
CREATE OR REPLACE VIEW public.v_model_health
WITH (security_invoker = true) AS
WITH latest AS (SELECT max(as_of_ts) ts FROM pred_market_output),
base AS (SELECT * FROM pred_market_output WHERE as_of_ts = (SELECT ts FROM latest)),
ml AS (SELECT game_pk, selection AS side, market_novig_prob AS win
       FROM base WHERE market='h2h' AND market_novig_prob IS NOT NULL),
rl AS (SELECT b.game_pk, b.selection, b.market_novig_prob AS cover, b.rec,
              split_part(b.selection,'_',1) AS side
       FROM base b
       WHERE b.market='run_line' AND right(b.selection,5)='_-1.5' AND b.market_novig_prob IS NOT NULL),
incoh AS (SELECT rl.game_pk, rl.rec
          FROM rl JOIN ml ON ml.game_pk=rl.game_pk AND ml.side=rl.side
          WHERE rl.cover > 0.80*ml.win),
has_slate_today AS (
  SELECT EXISTS(SELECT 1 FROM public.raw_games WHERE official_date = (now() AT TIME ZONE 'America/Chicago')::date) AS has_games
)
SELECT
  (SELECT ts FROM latest)                                                          AS latest_as_of,
  -- If there is no latest ts, default to 99 hours stale
  COALESCE(round((extract(epoch FROM (now()-(SELECT ts FROM latest)))/3600.0)::numeric,1), 99) AS hours_stale,
  COALESCE(
    (CASE 
       WHEN (SELECT ts FROM latest) IS NULL THEN true
       WHEN (SELECT has_games FROM has_slate_today) THEN (now()-(SELECT ts FROM latest) > interval '6 hours')
       ELSE false 
     END),
    true
  ) AS is_stale,
  (SELECT count(DISTINCT game_pk) FROM base)                                        AS games_in_run,
  (SELECT count(DISTINCT game_pk) FROM base b
     WHERE b.market='h2h'
       AND NOT EXISTS (SELECT 1 FROM base b2
                        WHERE b2.game_pk=b.game_pk AND b2.market='h2h'
                          AND b2.market_novig_prob IS NOT NULL))                         AS unmodeled_games,
  (SELECT count(*) FROM incoh)                                                     AS incoherent_runlines,
  (SELECT count(*) FROM incoh WHERE rec NOT IN ('NO BET','MODEL ONLY'))            AS incoherent_runlines_with_bet,
  (SELECT count(*) FROM base
     WHERE rec IS NOT NULL AND rec NOT IN ('NO BET','MODEL ONLY'))                 AS total_live_recs;

-- 4. Fix get_status_dashboard RPC stubs
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
props_latest AS (SELECT max(created_at) AS ts FROM pred_props),
bb_latest    AS (SELECT max(created_at) AS ts FROM pred_best_bets),
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
      WHEN edge_pts IS NULL    THEN NULL
      WHEN edge_pts >= 82      THEN 'ELITE'
      WHEN edge_pts >= 68      THEN 'STRONG'
      WHEN edge_pts >= 52      THEN 'LEAN'
      WHEN edge_pts >= 38      THEN 'THIN'
      ELSE 'PASS'
    END AS g
    FROM pred_best_bets
    WHERE created_at = (SELECT ts FROM bb_latest)
  ) x
),
runs AS (
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) AS j
  FROM (
    SELECT id, stage, step, status, run_ts, duration_sec, rows_written, notes
    FROM public.pipeline_runs
    ORDER BY run_ts DESC
    LIMIT 100
  ) r
),
alerts AS (
  SELECT COALESCE(jsonb_agg(a), '[]'::jsonb) AS j
  FROM (
    SELECT id, alert_type, message, created_at, resolved
    FROM public.alert_log
    WHERE resolved = false
    ORDER BY created_at DESC
    LIMIT 50
  ) a
),
sources AS (
  SELECT COALESCE(jsonb_agg(s), '[]'::jsonb) AS j
  FROM (
    SELECT source_id AS id, last_check, last_success, status, error_message
    FROM public.source_status
  ) s
)
SELECT jsonb_build_object(
  'server_now', now(),
  'today',      (SELECT d FROM today),
  'health',     (SELECT to_jsonb(h) FROM v_model_health h LIMIT 1),
  'accuracy',   '{}'::jsonb,
  'agg_as_of',  (SELECT max(as_of_ts) FROM pred_market_output),
  'slate', jsonb_build_object(
    'mkt',   (SELECT count(*) FROM pred_market_output WHERE as_of_ts = (SELECT ts FROM mkt_latest)),
    'props', (SELECT count(*) FROM pred_props        WHERE created_at = (SELECT ts FROM props_latest)),
    'best',  (SELECT count(*) FROM pred_best_bets    WHERE created_at = (SELECT ts FROM bb_latest))
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

NOTIFY pgrst, 'reload schema';
