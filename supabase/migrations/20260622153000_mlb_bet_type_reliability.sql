-- Migration: MLB bet_type_reliability table
-- Used by the model-intel Trust Ledger UI.

CREATE TABLE IF NOT EXISTS public.bet_type_reliability (
  bet_type    TEXT PRIMARY KEY,
  category    TEXT,
  sample_n    INT,
  win_pct     NUMERIC,
  roi         NUMERIC,
  avg_clv     NUMERIC,
  status      TEXT,
  score_mult  NUMERIC
);

-- Note: No RLS needed for analytics tables accessed exclusively via server-side APIs
