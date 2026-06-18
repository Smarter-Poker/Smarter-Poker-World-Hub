-- Add standings columns to dim_teams
ALTER TABLE public.dim_teams ADD COLUMN IF NOT EXISTS w INT DEFAULT 0;
ALTER TABLE public.dim_teams ADD COLUMN IF NOT EXISTS l INT DEFAULT 0;
ALTER TABLE public.dim_teams ADD COLUMN IF NOT EXISTS pct NUMERIC DEFAULT 0;
ALTER TABLE public.dim_teams ADD COLUMN IF NOT EXISTS gb NUMERIC DEFAULT 0;

-- Create view for standings
CREATE OR REPLACE VIEW public.v_mlb_standings AS
SELECT 
    team_id,
    name,
    abbr,
    league,
    division,
    w,
    l,
    pct,
    gb
FROM public.dim_teams
ORDER BY pct DESC, w DESC, name ASC;

-- Ensure RLS allows reading dim_teams
ALTER TABLE public.dim_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on dim_teams" ON public.dim_teams;
CREATE POLICY "Allow public read on dim_teams" ON public.dim_teams FOR SELECT USING (true);
