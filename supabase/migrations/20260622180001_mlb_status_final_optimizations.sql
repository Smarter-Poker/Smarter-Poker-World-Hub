-- Migration: Final Database Optimizations for MLB Status Engine
-- 1. Fix v_model_health defaults for empty state handling.
-- 2. Add performance index on raw_games.

-- 1. Add performance index on raw_games
CREATE INDEX IF NOT EXISTS idx_raw_games_official_date ON public.raw_games (official_date);

-- 2. Fix v_model_health defaults for empty states
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
  (SELECT ts FROM latest) AS latest_as_of,
  COALESCE(round((extract(epoch FROM (now()-(SELECT ts FROM latest)))/3600.0)::numeric,1), 999.0) AS hours_stale,
  COALESCE(
    (CASE 
       WHEN (SELECT has_games FROM has_slate_today) THEN (now()-(SELECT ts FROM latest) > interval '6 hours')
       ELSE false 
     END),
    true -- If latest.ts is null, consider it stale
  ) AS is_stale,
  (SELECT count(DISTINCT game_pk) FROM base) AS games_in_run,
  (SELECT count(DISTINCT game_pk) FROM base b
     WHERE b.market='h2h'
       AND NOT EXISTS (SELECT 1 FROM base b2
                        WHERE b2.game_pk=b.game_pk AND b2.market='h2h'
                          AND b2.market_novig_prob IS NOT NULL)) AS unmodeled_games,
  (SELECT count(*) FROM incoh) AS incoherent_runlines,
  (SELECT count(*) FROM incoh WHERE rec NOT IN ('NO BET','MODEL ONLY')) AS incoherent_runlines_with_bet,
  (SELECT count(*) FROM base
     WHERE rec IS NOT NULL AND rec NOT IN ('NO BET','MODEL ONLY')) AS total_live_recs;

