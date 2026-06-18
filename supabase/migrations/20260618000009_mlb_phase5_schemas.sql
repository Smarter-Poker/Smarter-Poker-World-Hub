-- Phase 5: Live Tracker, Props, and Model Intel Schemas

-- 1. Live Games (Tracker)
CREATE TABLE IF NOT EXISTS public.fct_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_pk BIGINT UNIQUE NOT NULL,
    official_date DATE NOT NULL,
    start_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'Scheduled',
    away_team TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_score INT DEFAULT 0,
    home_score INT DEFAULT 0,
    inning TEXT,
    inning_state TEXT,
    live_win_prob_away NUMERIC,
    live_win_prob_home NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Prop Projections
CREATE TABLE IF NOT EXISTS public.pred_props (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id BIGINT,
    player_name TEXT NOT NULL,
    team_abbr TEXT,
    prop_type TEXT NOT NULL,
    line NUMERIC NOT NULL,
    over_odds INT,
    under_odds INT,
    model_proj NUMERIC NOT NULL,
    edge_pts NUMERIC NOT NULL,
    implied_prob NUMERIC,
    game_pk BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Aggregated Model Intel
CREATE TABLE IF NOT EXISTS public.agg_model (
    id SERIAL PRIMARY KEY,
    model_version TEXT NOT NULL,
    last_training_date TIMESTAMPTZ NOT NULL,
    total_bets_tracked BIGINT DEFAULT 0,
    recent_roi NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.fct_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pred_props ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agg_model ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read on fct_games" ON public.fct_games FOR SELECT USING (true);
CREATE POLICY "Allow public read on pred_props" ON public.pred_props FOR SELECT USING (true);
CREATE POLICY "Allow public read on agg_model" ON public.agg_model FOR SELECT USING (true);

-- Enable Supabase Realtime for Tracker
ALTER PUBLICATION supabase_realtime ADD TABLE public.fct_games;

-- Dummy Data for UI Verification
INSERT INTO public.fct_games (game_pk, official_date, start_time, status, away_team, home_team, away_score, home_score, inning, inning_state)
VALUES 
(999001, CURRENT_DATE, NOW() - INTERVAL '1 hour', 'In Progress', 'Yankees', 'Red Sox', 4, 2, 'Bottom 5', 'Top'),
(999002, CURRENT_DATE, NOW() + INTERVAL '2 hours', 'Scheduled', 'Dodgers', 'Giants', 0, 0, NULL, NULL)
ON CONFLICT (game_pk) DO NOTHING;

INSERT INTO public.pred_props (player_name, team_abbr, prop_type, line, over_odds, under_odds, model_proj, edge_pts, implied_prob, game_pk)
VALUES 
('Aaron Judge', 'NYY', 'Home Runs', 0.5, 250, -300, 0.6, 12.5, 60.0, 999001),
('Shohei Ohtani', 'LAD', 'Strikeouts', 7.5, -110, -110, 8.2, 5.4, 55.0, 999002);

INSERT INTO public.agg_model (model_version, last_training_date, total_bets_tracked, recent_roi)
VALUES ('v4.2.1-Edge', NOW(), 1254, 8.4);
