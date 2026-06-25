CREATE OR REPLACE FUNCTION get_mlb_player_detail(p_id bigint)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  prof_b record;
  prof_p record;
  situ record;
  tend record;
  typ record;
  res json;
BEGIN
  -- 1. Identify player type (batter vs pitcher) by which table has the more recent profile window
  SELECT
    case
      when p.metrics is not null and b.metrics is null then 'pitcher'
      when b.metrics is not null and p.metrics is null then 'batter'
      when p.metrics is not null and b.metrics is not null then
         case when p.as_of >= b.as_of then 'pitcher' else 'batter' end
      else 'batter'
    end as t
  INTO typ
  FROM (select 1) dummy
  LEFT JOIN agg_pitcher p ON p.pitcher_id = p_id AND p.window_kind = 'profile'
  LEFT JOIN agg_batter b ON b.batter_id = p_id AND b.window_kind = 'profile';

  -- 2. Fetch the corresponding profile rows
  SELECT * INTO prof_p FROM agg_pitcher WHERE pitcher_id = p_id AND window_kind = 'profile' ORDER BY as_of DESC LIMIT 1;
  SELECT * INTO prof_b FROM agg_batter WHERE batter_id = p_id AND window_kind = 'profile' ORDER BY as_of DESC LIMIT 1;

  -- 3. Fetch situational & tendencies (same table structure for both, just different IDs)
  IF typ.t = 'pitcher' THEN
    SELECT * INTO situ FROM agg_situational WHERE pitcher_id = p_id ORDER BY as_of DESC LIMIT 1;
    SELECT * INTO tend FROM agg_pitcher_vs_team WHERE pitcher_id = p_id ORDER BY as_of DESC LIMIT 1;
  ELSE
    SELECT * INTO situ FROM agg_situational WHERE batter_id = p_id ORDER BY as_of DESC LIMIT 1;
    SELECT * INTO tend FROM agg_bvp WHERE batter_id = p_id ORDER BY as_of DESC LIMIT 1;
  END IF;

  -- 4. Build JSON structure, embedding last10 into pitcher streaks
  SELECT json_build_object(
    'profile', jsonb_build_object(
      'sim_rates', case when typ.t = 'pitcher' then prof_p.metrics->'sim_rates' else prof_b.metrics->'sim_rates' end,
      'streaks',   case when typ.t = 'pitcher' then 
        COALESCE(prof_p.metrics->'streaks', '{}'::jsonb) || jsonb_build_object('last10', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'date', game_date,
              'IP', stat->>'inningsPitched',
              'H', stat->>'hits',
              'ER', stat->>'earnedRuns',
              'BB', stat->>'baseOnBalls',
              'K', stat->>'strikeOuts',
              'HR', stat->>'homeRuns',
              'Pitches', stat->>'numberOfPitches'
            ) order by game_date desc
          ), '[]'::jsonb)
          from (
             select game_date, stat 
             from raw_player_gamelog 
             where player_id = p_id and "group" = 'pitching' 
             order by game_date desc limit 10
          ) lg
        ))
      else prof_b.metrics->'streaks' end
    ),
    'situational', situ.metrics,
    'tendencies', tend.metrics,
    'matchup', (
      -- Extract the matchup segment from the daily slate
      SELECT jsonb_build_object(
        'game_pk', s.game_pk,
        'date', s.game_date,
        'first_pitch_utc', fg.first_pitch_utc,
        'is_home', case when s.home_pitcher_id = p_id or sh.home_batter_id = p_id then true else false end,
        'opp_team_id', case when s.home_pitcher_id = p_id or sh.home_batter_id = p_id then s.away_team_id else s.home_team_id end,
        'opp_team_name', case when s.home_pitcher_id = p_id or sh.home_batter_id = p_id then t_away.name else t_home.name end,
        'opp_pitcher_id', case when typ.t = 'batter' then 
             case when sh.home_batter_id = p_id then s.away_pitcher_id else s.home_pitcher_id end
           else null end,
        'opp_pitcher_name', case when typ.t = 'batter' then 
             case when sh.home_batter_id = p_id then s.away_pitcher else s.home_pitcher end
           else null end,
        'opp_pitcher_throws', case when typ.t = 'batter' then
             (select "Throws" from dim_players dp where dp.playerid = 
                 (case when sh.home_batter_id = p_id then s.away_pitcher_id else s.home_pitcher_id end) limit 1)
           else null end,
        'opp_team_hitting', (
             select jsonb_build_object('wrc', wrc_plus, 'ops', ops, 'avg', team_avg) 
             from v_mlb_standings 
             where team_id = (case when s.home_pitcher_id = p_id then s.away_team_id else s.home_team_id end)
        ),
        'opp_team_pitching', (
             select jsonb_build_object('era', era, 'whip', whip) 
             from v_mlb_standings 
             where team_id = (case when sh.home_batter_id = p_id then s.away_team_id else s.home_team_id end)
        ),
        'opp_pitcher_season', case when typ.t = 'batter' then
             (select jsonb_build_object('era', p_agg.era, 'whip', p_agg.whip, 'fip', p_agg.fip, 'ip', p_agg.ip, 'k9', p_agg.k9, 'w', p_agg.w, 'l', p_agg.l, 'gs', p_agg.gs)
              from agg_pitcher p_agg 
              where p_agg.pitcher_id = (case when sh.home_batter_id = p_id then s.away_pitcher_id else s.home_pitcher_id end) 
                and p_agg.window_kind = 'fg_season' order by as_of desc limit 1)
           else null end,
        'pvt', case when typ.t = 'pitcher' then
             (select jsonb_build_object('era', pvt_agg.era, 'k9', pvt_agg.k9, 'pa', pvt_agg.tbf, 'lineup_woba', pvt_agg.woba)
              from agg_pitcher_vs_team pvt_agg 
              where pvt_agg.pitcher_id = p_id 
                and pvt_agg.opp_team_id = (case when s.home_pitcher_id = p_id then s.away_team_id else s.home_team_id end)
              order by as_of desc limit 1)
           else null end,
        'bvp', case when typ.t = 'batter' then
             (select jsonb_build_object('pa', bvp_agg.pa, 'avg', bvp_agg.avg, 'ops', bvp_agg.ops, 'hr', bvp_agg.hr, 'so', bvp_agg.so)
              from agg_bvp bvp_agg 
              where bvp_agg.batter_id = p_id 
                and bvp_agg.pitcher_id = (case when sh.home_batter_id = p_id then s.away_pitcher_id else s.home_pitcher_id end)
              order by as_of desc limit 1)
           else null end
      )
      FROM v_daily_slate s
      LEFT JOIN fact_games fg ON fg.game_pk = s.game_pk
      LEFT JOIN dim_teams t_home ON t_home.team_id = s.home_team_id
      LEFT JOIN dim_teams t_away ON t_away.team_id = s.away_team_id
      -- A dirty lateral join to check if p_id is in the lineup (since v_daily_slate only has starters)
      LEFT JOIN LATERAL (
         SELECT p_id as home_batter_id WHERE EXISTS (
            SELECT 1 FROM raw_lineups rl WHERE rl.game_pk = s.game_pk AND rl.team_id = s.home_team_id AND rl.player_id = p_id
         )
      ) sh ON true
      WHERE (s.home_pitcher_id = p_id OR s.away_pitcher_id = p_id)
         OR (EXISTS (SELECT 1 FROM raw_lineups rl WHERE rl.game_pk = s.game_pk AND rl.player_id = p_id))
      ORDER BY s.game_date DESC
      LIMIT 1
    )
  ) INTO res;

  RETURN res;
END;
$$;
