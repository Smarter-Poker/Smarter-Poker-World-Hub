-- Add missing UI-expected columns to v_team_profile to ensure no silent data drops
ALTER TABLE public.v_team_profile ADD COLUMN IF NOT EXISTS run_diff NUMERIC;
ALTER TABLE public.v_team_profile ADD COLUMN IF NOT EXISTS runs_scored INT;
ALTER TABLE public.v_team_profile ADD COLUMN IF NOT EXISTS runs_allowed INT;
ALTER TABLE public.v_team_profile ADD COLUMN IF NOT EXISTS pyth_wpct NUMERIC;
ALTER TABLE public.v_team_profile ADD COLUMN IF NOT EXISTS streaks JSONB;
ALTER TABLE public.v_team_profile ADD COLUMN IF NOT EXISTS splits JSONB;

-- Refresh permissions
GRANT SELECT ON public.v_team_profile TO anon, authenticated;
