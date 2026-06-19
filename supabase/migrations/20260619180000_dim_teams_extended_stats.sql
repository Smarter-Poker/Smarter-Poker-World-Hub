-- ============================================================
-- MLB Players Page: Extended Team Stats
-- Adds win_streak, runs_scored, runs_allowed, games_played
-- to dim_teams for the team selector on /hub/MLB-ANALYTICS/players
-- ============================================================

-- Add extended columns to dim_teams
ALTER TABLE public.dim_teams ADD COLUMN IF NOT EXISTS win_streak INT DEFAULT 0;
ALTER TABLE public.dim_teams ADD COLUMN IF NOT EXISTS runs_scored INT DEFAULT 0;
ALTER TABLE public.dim_teams ADD COLUMN IF NOT EXISTS runs_allowed INT DEFAULT 0;
ALTER TABLE public.dim_teams ADD COLUMN IF NOT EXISTS games_played INT DEFAULT 0;

-- Rebuild v_mlb_standings to include agg_team ERA/AVG and computed per-game averages
DROP VIEW IF EXISTS public.v_mlb_standings;
CREATE VIEW public.v_mlb_standings AS
SELECT
    dt.team_id,
    dt.name,
    dt.abbr,
    dt.league,
    dt.division,
    dt.w,
    dt.l,
    dt.pct,
    dt.gb,
    dt.win_streak,
    dt.runs_scored,
    dt.runs_allowed,
    dt.games_played,
    ROUND(
        CAST(dt.runs_scored AS NUMERIC) / NULLIF(dt.games_played, 0),
        2
    ) AS runs_per_game,
    ROUND(
        CAST(dt.runs_allowed AS NUMERIC) / NULLIF(dt.games_played, 0),
        2
    ) AS runs_allowed_per_game,
    at.era,
    at.avg AS team_avg
FROM public.dim_teams dt
LEFT JOIN LATERAL (
    SELECT era, avg
    FROM public.agg_team
    WHERE team_id = dt.team_id
      AND window_kind = 'season'
    ORDER BY created_at DESC
    LIMIT 1
) at ON true
ORDER BY dt.pct DESC, dt.w DESC, dt.name ASC;

-- Grant access
GRANT SELECT ON public.v_mlb_standings TO anon, authenticated;
