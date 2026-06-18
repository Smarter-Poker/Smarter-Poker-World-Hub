CREATE OR REPLACE VIEW v_daily_slate AS
WITH ml_preds AS (
  SELECT game_pk, selection, market_novig_prob, edge_pts
  FROM pred_market_output
  WHERE market = 'h2h' OR market = 'ML'
)
SELECT 
  g.game_pk AS game_id,
  g.official_date,
  g.first_pitch_utc AS event_time,
  COALESCE(g.status_detailed_state, 'Scheduled') AS status,
  COALESCE(t_away.abbr, 'AWAY') AS away_abbr,
  COALESCE(t_away.name, 'Away Team') AS away_team,
  g.away_probable_pitcher_name AS away_pitcher,
  (SELECT market_novig_prob FROM ml_preds WHERE game_pk = g.game_pk AND (selection = t_away.name OR selection = t_away.abbr OR selection = 'AWAY') LIMIT 1) AS away_win_prob,
  (SELECT edge_pts FROM ml_preds WHERE game_pk = g.game_pk AND (selection = t_away.name OR selection = t_away.abbr OR selection = 'AWAY') LIMIT 1) AS away_edge,
  COALESCE(t_home.abbr, 'HOME') AS home_abbr,
  COALESCE(t_home.name, 'Home Team') AS home_team,
  g.home_probable_pitcher_name AS home_pitcher,
  (SELECT market_novig_prob FROM ml_preds WHERE game_pk = g.game_pk AND (selection = t_home.name OR selection = t_home.abbr OR selection = 'HOME') LIMIT 1) AS home_win_prob,
  (SELECT edge_pts FROM ml_preds WHERE game_pk = g.game_pk AND (selection = t_home.name OR selection = t_home.abbr OR selection = 'HOME') LIMIT 1) AS home_edge
FROM fact_games g
LEFT JOIN dim_teams t_away ON g.away_team_id = t_away.team_id
LEFT JOIN dim_teams t_home ON g.home_team_id = t_home.team_id;
