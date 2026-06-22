-- Migration: MLB sim pipeline tables
-- These tables are typically maintained by the external Python data pipeline
-- but this migration officially defines their schema for reference and safe querying.

CREATE TABLE IF NOT EXISTS public.sim_risk_metrics (
  id                  SERIAL PRIMARY KEY,
  profit_factor       NUMERIC,
  expectancy          NUMERIC,
  avg_stake           NUMERIC,
  longest_win_streak  INT,
  longest_loss_streak INT,
  best_day            NUMERIC,
  worst_day           NUMERIC
);

CREATE TABLE IF NOT EXISTS public.sim_market_summary (
  market              TEXT PRIMARY KEY,
  bets                INT,
  wins                INT,
  losses              INT,
  pushes              INT,
  win_rate            NUMERIC,
  staked              NUMERIC,
  pnl                 NUMERIC,
  roi                 NUMERIC
);

CREATE TABLE IF NOT EXISTS public.sim_baseline_compare (
  id                  SERIAL PRIMARY KEY,
  starting_bankroll   NUMERIC,
  unit_size           NUMERIC,
  flat_final_bankroll NUMERIC
);

CREATE TABLE IF NOT EXISTS public.sim_bet_grade_summary (
  bet_tier            TEXT PRIMARY KEY,
  bets                INT,
  wins                INT,
  losses              INT,
  pushes              INT,
  win_rate            NUMERIC,
  staked              NUMERIC,
  pnl                 NUMERIC,
  roi                 NUMERIC
);

CREATE TABLE IF NOT EXISTS public.sim_equity_daily (
  day                 DATE PRIMARY KEY,
  bets                INT,
  day_pnl             NUMERIC,
  end_bankroll        NUMERIC,
  drawdown            NUMERIC
);

-- Note: No RLS needed for analytics tables accessed exclusively via server-side APIs
