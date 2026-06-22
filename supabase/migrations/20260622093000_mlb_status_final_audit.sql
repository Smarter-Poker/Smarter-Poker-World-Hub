-- Migration: Final Deep Audit Fixes for MLB Status Engine
-- 1. Use created_at (and add indexes) for tier_dist and slate counts to prevent full table scans.
-- 2. Add null-safe COALESCE in v_model_health for empty tables.
-- 3. Maintain robust pg_namespace schema joining for table counts.

CREATE INDEX IF NOT EXISTS idx_pred_props_created_at_desc ON public.pred_props (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pred_best_bets_created_at_desc ON public.pred_best_bets (created_at DESC);

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
  COALESCE(round((extract(epoch FROM (now()-(SELECT ts FROM latest)))/3600.0)::numeric,1), 0) AS hours_stale,
  COALESCE(
    (CASE 
       WHEN (SELECT has_games FROM has_slate_today) THEN (now()-(SELECT ts FROM latest) > interval '6 hours')
       ELSE false 
     END),
    false
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
  SELECT '[]'::jsonb AS j
),
alerts AS (
  SELECT '[]'::jsonb AS j
),
sources AS (
  SELECT '[]'::jsonb AS j
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

REVOKE EXECUTE ON FUNCTION public.get_status_dashboard() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_status_dashboard() TO service_role;

NOTIFY pgrst, 'reload schema';
