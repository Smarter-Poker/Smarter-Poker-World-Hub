ALTER TABLE public.pred_market_output 
ADD COLUMN IF NOT EXISTS brier_score NUMERIC,
ADD COLUMN IF NOT EXISTS unit_profit NUMERIC,
ADD COLUMN IF NOT EXISTS actual_result TEXT;
