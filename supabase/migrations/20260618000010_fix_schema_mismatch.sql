-- Phase 5.1: Fix Mismatch between Next.js UI and Python Engine

-- Next.js was built to query fct_games, but Python uses fact_games.
-- Next.js was built to query pred_props with specific columns, but Python uses different columns.

-- First, drop the dummy tables created in Phase 5 to avoid collisions
DROP TABLE IF EXISTS public.fct_games CASCADE;

-- 1. Create a View for fct_games over fact_games and raw_games
CREATE OR REPLACE VIEW public.fct_games AS
SELECT 
    gen_random_uuid() as id,
    rg.game_pk,
    rg.official_date,
    rg.event_time as start_time,
    rg.status,
    t_away.abbr as away_team,
    t_home.abbr as home_team,
    rg.away_wins as away_score, 
    rg.home_wins as home_score,
    'Top 1' as inning, -- default stub since raw_games lacks inning state
    'Top' as inning_state,
    0.50 as live_win_prob_away,
    0.50 as live_win_prob_home,
    rg.knowledge_time as created_at,
    rg.knowledge_time as updated_at
FROM public.raw_games rg
JOIN public.dim_teams t_away ON rg.away_team_id = t_away.team_id
JOIN public.dim_teams t_home ON rg.home_team_id = t_home.team_id;

-- 2. Create a View for v_pred_props over the real pred_props table
CREATE OR REPLACE VIEW public.v_pred_props AS
SELECT 
    gen_random_uuid() as id,
    pp.player_id,
    dp.full_name as player_name,
    dt.abbr as team_abbr,
    pp.prop as prop_type,
    pp.line,
    NULL::int as over_odds,  -- The real table doesn't track this exact value in this column format
    NULL::int as under_odds,
    pp.proj_mean as model_proj,
    pp.edge_pts,
    pp.prob_over as implied_prob,
    pp.game_pk,
    pp.as_of_ts as created_at,
    pp.as_of_ts as updated_at
FROM public.pred_props pp
JOIN public.dim_players dp ON pp.player_id = dp.player_id
JOIN public.dim_teams dt ON dp.team_id = dt.team_id;

-- 3. Grant Access to the views
GRANT SELECT ON public.fct_games TO authenticated;
GRANT SELECT ON public.fct_games TO anon;
GRANT SELECT ON public.v_pred_props TO authenticated;
GRANT SELECT ON public.v_pred_props TO anon;
