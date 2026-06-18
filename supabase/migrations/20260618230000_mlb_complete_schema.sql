-- Comprehensive MLB Analytics Schema Completion
-- Fills all missing gaps discovered during the deep-dive bug hunt.

-- 1. Predictions: Best Bets
CREATE TABLE IF NOT EXISTS public.pred_best_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    official_date DATE NOT NULL,
    rank INT,
    team TEXT,
    market TEXT,
    edge NUMERIC,
    game_pk BIGINT,
    selection TEXT,
    market_novig_prob NUMERIC,
    implied_prob_novig NUMERIC,
    edge_pts NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Predictions: Market Output
CREATE TABLE IF NOT EXISTS public.pred_market_output (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_pk BIGINT NOT NULL,
    market TEXT NOT NULL,
    selection TEXT,
    as_of_ts TIMESTAMPTZ,
    market_novig_prob NUMERIC,
    rec TEXT,
    edge NUMERIC,
    team TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Raw Odds
CREATE TABLE IF NOT EXISTS public.raw_odds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_pk BIGINT NOT NULL,
    market TEXT NOT NULL,
    outcome_name TEXT,
    implied_prob_novig NUMERIC,
    as_of_ts TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Teams: Dimensions
CREATE TABLE IF NOT EXISTS public.dim_teams (
    team_id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    abbr TEXT,
    league TEXT,
    division TEXT
);

-- 5. Teams: Aggregated Stats
CREATE TABLE IF NOT EXISTS public.agg_team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id BIGINT REFERENCES public.dim_teams(team_id),
    window_kind TEXT,
    era NUMERIC,
    fip NUMERIC,
    xfip NUMERIC,
    siera NUMERIC,
    pitching_war NUMERIC,
    avg NUMERIC,
    obp NUMERIC,
    slg NUMERIC,
    ops NUMERIC,
    hr INT,
    sb INT,
    hitting_war NUMERIC,
    def NUMERIC,
    uzr NUMERIC,
    drs NUMERIC,
    oaa NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Teams: Profile View
-- Created as a table for direct pipeline insertion
CREATE TABLE IF NOT EXISTS public.v_team_profile (
    team_id BIGINT PRIMARY KEY,
    name TEXT,
    league TEXT,
    division TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Players: Hitter Profile (View/Table)
CREATE TABLE IF NOT EXISTS public.v_hitter_profile (
    player_id BIGINT PRIMARY KEY,
    full_name TEXT NOT NULL,
    team_id BIGINT,
    wrc_plus NUMERIC,
    woba NUMERIC,
    pa INT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Players: Pitcher Profile (View/Table)
CREATE TABLE IF NOT EXISTS public.v_pitcher_profile (
    player_id BIGINT PRIMARY KEY,
    full_name TEXT NOT NULL,
    team_id BIGINT,
    fip NUMERIC,
    siera NUMERIC,
    bf INT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Portfolio: Simulated Bets
CREATE TABLE IF NOT EXISTS public.sim_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    as_of_ts TIMESTAMPTZ,
    pnl NUMERIC,
    result TEXT,
    stake NUMERIC,
    bankroll_after NUMERIC,
    market TEXT,
    selection TEXT,
    edge_pts NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Portfolio: Fact Portfolio
CREATE TABLE IF NOT EXISTS public.fct_portfolio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    official_date DATE NOT NULL,
    total_value NUMERIC,
    total_pnl NUMERIC,
    active_bets INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Backtest: Summary (View/Table)
CREATE TABLE IF NOT EXISTS public.v_backtest_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    accuracy NUMERIC,
    roi NUMERIC,
    bets_won INT,
    bets_lost INT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Enablement
ALTER TABLE public.pred_best_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pred_market_output ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dim_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agg_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_team_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_hitter_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_pitcher_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fct_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_backtest_summary ENABLE ROW LEVEL SECURITY;

-- Allow Public Read
CREATE POLICY "Allow public read on pred_best_bets" ON public.pred_best_bets FOR SELECT USING (true);
CREATE POLICY "Allow public read on pred_market_output" ON public.pred_market_output FOR SELECT USING (true);
CREATE POLICY "Allow public read on raw_odds" ON public.raw_odds FOR SELECT USING (true);
CREATE POLICY "Allow public read on dim_teams" ON public.dim_teams FOR SELECT USING (true);
CREATE POLICY "Allow public read on agg_team" ON public.agg_team FOR SELECT USING (true);
CREATE POLICY "Allow public read on v_team_profile" ON public.v_team_profile FOR SELECT USING (true);
CREATE POLICY "Allow public read on v_hitter_profile" ON public.v_hitter_profile FOR SELECT USING (true);
CREATE POLICY "Allow public read on v_pitcher_profile" ON public.v_pitcher_profile FOR SELECT USING (true);
CREATE POLICY "Allow public read on sim_bets" ON public.sim_bets FOR SELECT USING (true);
CREATE POLICY "Allow public read on fct_portfolio" ON public.fct_portfolio FOR SELECT USING (true);
CREATE POLICY "Allow public read on v_backtest_summary" ON public.v_backtest_summary FOR SELECT USING (true);
