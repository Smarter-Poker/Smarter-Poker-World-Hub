-- ===================================================================
-- MLB Analytics Engine — Database changes, 2026-06-19
-- Project: Supabase nscdmxldtyszyvcxxwgr
-- Section A was APPLIED LIVE this session via the Supabase MCP.
-- All statements are idempotent / re-runnable.
-- ===================================================================

-- A1) Drop 4 redundant DUPLICATE indexes (linter rule 0009_duplicate_index).
--     Each is an exact copy of a sibling index that IS kept, so query plans are
--     unchanged; this only removes wasted storage (~9 MB) and redundant index
--     maintenance on every write to the two largest tables (agg_batter 900 MB,
--     agg_pitcher 653 MB) plus fact_games and raw_player_gamelog.
DROP INDEX IF EXISTS public.idx_agg_batter_profile_date;   -- dup of idx_agg_batter_as_of_wk  (KEPT, 272 scans)
DROP INDEX IF EXISTS public.idx_agg_pitcher_profile_date;  -- dup of idx_agg_pitcher_as_of_wk (KEPT, 264 scans)
DROP INDEX IF EXISTS public.idx_fact_games_date;           -- dup of ix_fact_games_date        (KEPT, 312 scans)
DROP INDEX IF EXISTS public.idx_gamelog_game_date;         -- dup of idx_gamelog_date           (KEPT)

-- A2) Neutralize INCOHERENT favorite run-line "BET" recommendations.
--     Rule (mirrors the engine best_bets() guard committed as 0308d18):
--     a favorite -1.5 whose model COVER prob exceeds 0.80 * its own MONEYLINE win
--     prob is incoherent (you cannot win by 2+ nearly as often as you win) -> false edge.
--     This affected 4 live recs today (games 822966, 822886, 824097, 825069;
--     cover/win ratios 0.81-0.87). Set them to NO BET. Re-runnable; latest run only.
WITH latest AS (SELECT max(as_of_ts) ts FROM pred_market_output),
ml AS (
  SELECT game_pk, selection AS side, blended_prob AS win
  FROM pred_market_output
  WHERE as_of_ts=(SELECT ts FROM latest) AND market='h2h' AND blended_prob IS NOT NULL
),
bad AS (
  SELECT m.game_pk, m.as_of_ts, m.market, m.selection
  FROM pred_market_output m
  JOIN ml ON ml.game_pk=m.game_pk AND ml.side=split_part(m.selection,'_',1)
  WHERE m.as_of_ts=(SELECT ts FROM latest) AND m.market='run_line'
    AND right(m.selection,5)='_-1.5' AND m.blended_prob IS NOT NULL
    AND m.blended_prob > 0.80*ml.win
    AND m.rec IS NOT NULL AND m.rec NOT IN ('NO BET','MODEL ONLY')
)
UPDATE pred_market_output p
SET rec='NO BET', stake_units=0, kelly_pct=0
FROM bad
WHERE p.game_pk=bad.game_pk AND p.as_of_ts=bad.as_of_ts
  AND p.market=bad.market AND p.selection=bad.selection;

-- A3) Standing data-integrity health view. One row, latest run. security_invoker so it
--     respects caller RLS and does NOT add to the SECURITY DEFINER view warnings.
--     Usage:  SELECT * FROM public.v_model_health;
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
          WHERE rl.cover > 0.80*ml.win)
SELECT
  (SELECT ts FROM latest)                                                          AS latest_as_of,
  round((extract(epoch FROM (now()-(SELECT ts FROM latest)))/3600.0)::numeric,1)   AS hours_stale,
  (now()-(SELECT ts FROM latest) > interval '6 hours')                             AS is_stale,
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
