-- 20260622170000_mlb_teams_deep_fixes.sql
-- Fixes missing columns, performance bottlenecks, and missing RPCs for the MLB Teams Module.

-- 1. v_team_profile Missing Column & Optimization
ALTER TABLE public.v_team_profile ADD COLUMN IF NOT EXISTS abbr TEXT;
CREATE INDEX IF NOT EXISTS idx_v_team_profile_name ON public.v_team_profile(name);

-- 2. agg_team Missing Columns
ALTER TABLE public.agg_team ADD COLUMN IF NOT EXISTS as_of DATE;
ALTER TABLE public.agg_team ADD COLUMN IF NOT EXISTS wrc_plus NUMERIC;
ALTER TABLE public.agg_team ADD COLUMN IF NOT EXISTS woba NUMERIC;

-- 3. pred_props Missing Columns & Optimization
ALTER TABLE public.pred_props ADD COLUMN IF NOT EXISTS prop TEXT;
ALTER TABLE public.pred_props ADD COLUMN IF NOT EXISTS proj_mean NUMERIC;
ALTER TABLE public.pred_props ADD COLUMN IF NOT EXISTS prob_over NUMERIC;
ALTER TABLE public.pred_props ADD COLUMN IF NOT EXISTS market_novig_over NUMERIC;
ALTER TABLE public.pred_props ADD COLUMN IF NOT EXISTS best_price NUMERIC;
ALTER TABLE public.pred_props ADD COLUMN IF NOT EXISTS as_of_ts TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_pred_props_slate ON public.pred_props (as_of_ts DESC, edge_pts DESC);

-- 4. Critical Missing RPC: get_mlb_team_detail
CREATE OR REPLACE FUNCTION public.get_mlb_team_detail(p_team_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    res_team JSONB;
    res_stats JSONB;
    res_games JSONB;
    res_matchup JSONB;
    res_props JSONB;
    latest_slate DATE;
BEGIN
    -- Get Team Base Profile
    SELECT jsonb_build_object(
        'team_id', t.team_id,
        'name', t.name,
        'abbr', t.abbr,
        'league', t.league,
        'division', t.division,
        'run_diff', t.run_diff,
        'streaks', t.streaks,
        'splits', t.splits
    ) INTO res_team
    FROM public.v_team_profile t
    WHERE t.team_id = p_team_id;

    -- Return 404 equivalent if not found
    IF res_team IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get Team Aggregate Stats (latest season snapshot)
    SELECT jsonb_build_object(
        'era', era,
        'fip', fip,
        'wrc_plus', wrc_plus,
        'woba', woba,
        'pitching_war', pitching_war,
        'hitting_war', hitting_war
    ) INTO res_stats
    FROM public.agg_team
    WHERE team_id = p_team_id AND window_kind = 'season'
    ORDER BY as_of DESC
    LIMIT 1;

    -- Get Recent & Upcoming Games
    SELECT jsonb_agg(
        jsonb_build_object(
            'game_id', g.game_id,
            'start_time', g.start_time,
            'home_team', g.home_team,
            'away_team', g.away_team,
            'status', g.status
        )
    ) INTO res_games
    FROM (
        SELECT game_id, start_time, home_team, away_team, status
        FROM public.fact_games
        WHERE home_team = (res_team->>'name') OR away_team = (res_team->>'name')
        ORDER BY start_time DESC
        LIMIT 10
    ) g;

    -- Get Latest Slate
    SELECT MAX(as_of_ts)::DATE INTO latest_slate FROM public.pred_props;

    -- Get Raw Props for the latest slate for this team
    SELECT jsonb_agg(row_to_json(p)) INTO res_props
    FROM public.pred_props p
    WHERE p.team_id = p_team_id AND p.as_of_ts::DATE = latest_slate;

    -- Combine into final JSONB payload
    RETURN jsonb_build_object(
        'team', res_team,
        'stats', res_stats,
        'games', COALESCE(res_games, '[]'::jsonb),
        'matchup', NULL, -- Matchup logic can be extended here
        'props_raw', COALESCE(res_props, '[]'::jsonb),
        'slate_date', latest_slate
    );
END;
$$;

-- Refresh permissions
GRANT EXECUTE ON FUNCTION public.get_mlb_team_detail(BIGINT) TO anon, authenticated;
