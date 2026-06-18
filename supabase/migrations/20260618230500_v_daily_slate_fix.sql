CREATE OR REPLACE VIEW v_daily_slate AS
WITH ml_preds AS (
  SELECT game_pk, selection, market_novig_prob, edge
  FROM pred_market_output
  WHERE market = 'h2h' OR market = 'ML'
)
SELECT 
  g.game_pk AS game_id,
  g.official_date,
  g.start_time AS event_time,
  g.status AS status,
  COALESCE(t_away.abbr, g.away_team) AS away_abbr,
  COALESCE(t_away.name, g.away_team) AS away_team,
  NULL AS away_pitcher, -- Not currently tracked in fct_games
  (SELECT market_novig_prob FROM ml_preds WHERE game_pk = g.game_pk AND (selection = t_away.name OR selection = t_away.abbr OR selection = 'AWAY') LIMIT 1) AS away_win_prob,
  (SELECT edge FROM ml_preds WHERE game_pk = g.game_pk AND (selection = t_away.name OR selection = t_away.abbr OR selection = 'AWAY') LIMIT 1) AS away_edge,
  COALESCE(t_home.abbr, g.home_team) AS home_abbr,
  COALESCE(t_home.name, g.home_team) AS home_team,
  NULL AS home_pitcher, -- Not currently tracked in fct_games
  (SELECT market_novig_prob FROM ml_preds WHERE game_pk = g.game_pk AND (selection = t_home.name OR selection = t_home.abbr OR selection = 'HOME') LIMIT 1) AS home_win_prob,
  (SELECT edge FROM ml_preds WHERE game_pk = g.game_pk AND (selection = t_home.name OR selection = t_home.abbr OR selection = 'HOME') LIMIT 1) AS home_edge
FROM fact_games g
LEFT JOIN dim_teams t_away ON g.away_team = t_away.abbr OR g.away_team = t_away.name
LEFT JOIN dim_teams t_home ON g.home_team = t_home.abbr OR g.home_team = t_home.name;
