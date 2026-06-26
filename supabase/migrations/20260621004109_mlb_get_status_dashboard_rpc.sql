-- Migration: get_status_dashboard() RPC for MLB Analytics /status page.
--
-- SOURCE: Canonical definition lives in mlb-analytics-engine/supabase/migrations/
--         20260621004109_get_status_dashboard_rpc.sql (applied to the MLB Supabase project).
--         This file mirrors it in the World-Hub repo so the function definition is tracked
--         in version control on both sides. The World-Hub /api/mlb/status route calls this
--         via getMlbSupabase().rpc('get_status_dashboard').
--
-- DB TARGET: MLB Supabase project (nscdmxldtyszyvcxxwgr.supabase.co) — NOT the main
--            Smarter-Poker Supabase project. Apply with:
--              supabase db push --db-url <MLB_SUPABASE_URL>
--            or via the engine repo's migration pipeline.
--
-- Optimization: one round trip replaces ~18 sequential PostgREST calls. The function
-- is STABLE (read-only, safe to cache) with SECURITY INVOKER + pinned search_path.
--
-- Tier buckets mirror web/src/lib/betScore.ts tier() thresholds exactly:
--   ELITE ≥ 82 | STRONG ≥ 68 | LEAN ≥ 52 | THIN ≥ 38 | else PASS
--
-- Security: EXECUTE revoked from PUBLIC/anon/authenticated, granted to service_role only.

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
    WHERE created_at = (SELECT ts FROM bb_latest)   -- latest slate only
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
  'health',     '{}'::jsonb,
  'accuracy',   '{}'::jsonb,
  'agg_as_of',  (SELECT max(as_of_ts) FROM pred_market_output),
  'slate', jsonb_build_object(
    'mkt',   (SELECT count(*) FROM pred_market_output WHERE as_of_ts = (SELECT ts FROM mkt_latest)),
    'props', (SELECT count(*) FROM pred_props        WHERE created_at = (SELECT ts FROM props_latest)),
    'best',  (SELECT count(*) FROM pred_best_bets    WHERE created_at = (SELECT ts FROM bb_latest))
  ),
  'table_counts', jsonb_build_object(
    'pred_market_output', (SELECT COALESCE(reltuples::bigint, 0) FROM pg_class WHERE relname = 'pred_market_output'),
    'pred_props',         (SELECT COALESCE(reltuples::bigint, 0) FROM pg_class WHERE relname = 'pred_props'),
    'pred_best_bets',     (SELECT COALESCE(reltuples::bigint, 0) FROM pg_class WHERE relname = 'pred_best_bets'),
    'agg_market',         (SELECT COALESCE(reltuples::bigint, 0) FROM pg_class WHERE relname = 'agg_market'),
    'snapshots',          (SELECT COALESCE(reltuples::bigint, 0) FROM pg_class WHERE relname = 'snapshots')
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
