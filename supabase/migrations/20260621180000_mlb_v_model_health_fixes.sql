-- Migration: Fix v_model_health mapping columns for Next.js API
-- 
-- 1. Adds slate_as_of alias for latest_as_of
-- 2. Adds games_in_slate alias for games_in_run
-- 3. Adds minutes_since_refresh to eliminate API-layer math

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
-- We only consider the model "stale" if there's actually a slate of games today that needs updating.
has_slate_today AS (
  SELECT EXISTS(SELECT 1 FROM base WHERE (as_of_ts AT TIME ZONE 'America/Chicago')::date = (now() AT TIME ZONE 'America/Chicago')::date) AS has_games
)
SELECT
  (SELECT ts FROM latest)                                                          AS latest_as_of,
  (SELECT ts FROM latest)                                                          AS slate_as_of,
  round((extract(epoch FROM (now()-(SELECT ts FROM latest)))/3600.0)::numeric,1)   AS hours_stale,
  round((extract(epoch FROM (now()-(SELECT ts FROM latest)))/60.0)::numeric,1)     AS minutes_since_refresh,
  (CASE 
     WHEN (SELECT has_games FROM has_slate_today) THEN (now()-(SELECT ts FROM latest) > interval '6 hours')
     ELSE false 
   END)                                                                            AS is_stale,
  (SELECT count(DISTINCT game_pk) FROM base)                                        AS games_in_run,
  (SELECT count(DISTINCT game_pk) FROM base)                                        AS games_in_slate,
  (SELECT count(DISTINCT game_pk) FROM base b
     WHERE b.market='h2h'
       AND NOT EXISTS (SELECT 1 FROM base b2
                        WHERE b2.game_pk=b.game_pk AND b2.market='h2h'
                          AND b2.blended_prob IS NOT NULL))                         AS unmodeled_games,
  (SELECT count(*) FROM incoh)                                                     AS incoherent_runlines,
  (SELECT count(*) FROM incoh WHERE rec NOT IN ('NO BET','MODEL ONLY'))            AS incoherent_runlines_with_bet,
  (SELECT count(*) FROM base
     WHERE rec IS NOT NULL AND rec NOT IN ('NO BET','MODEL ONLY'))                 AS total_live_recs;

NOTIFY pgrst, 'reload schema';
