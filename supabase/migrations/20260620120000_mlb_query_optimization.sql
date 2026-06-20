-- Migration: MLB Query Optimization
-- Purpose: Add B-Tree indexes to heavily filtered columns used by the MLB Analytics UI.

-- 1. fact_games
CREATE INDEX IF NOT EXISTS idx_fact_games_official_date ON fact_games(official_date);
CREATE INDEX IF NOT EXISTS idx_fact_games_final ON fact_games(final);

-- 2. pred_best_bets
CREATE INDEX IF NOT EXISTS idx_pred_best_bets_official_date ON pred_best_bets(official_date);

-- 3. agg_pitcher & agg_batter
CREATE INDEX IF NOT EXISTS idx_agg_pitcher_window ON agg_pitcher(window_kind);
CREATE INDEX IF NOT EXISTS idx_agg_batter_window_vshand ON agg_batter(window_kind, vs_hand);

-- 4. agg_team
CREATE INDEX IF NOT EXISTS idx_agg_team_window ON agg_team(window_kind);

-- 5. sim_bets (Backtest Portfolio)
CREATE INDEX IF NOT EXISTS idx_sim_bets_market ON sim_bets(market);
