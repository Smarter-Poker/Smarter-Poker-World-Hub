-- ─── Fix MLB Team Detail Schema & Edge Cases ─────────────────────────────

-- 1. Ensure pred_props has all required columns (mostly best_book)
ALTER TABLE public.pred_props ADD COLUMN IF NOT EXISTS best_book TEXT;

-- 2. Ensure pred_market_output has all required columns
ALTER TABLE public.pred_market_output ADD COLUMN IF NOT EXISTS model_prob NUMERIC;
ALTER TABLE public.pred_market_output ADD COLUMN IF NOT EXISTS best_price NUMERIC;
ALTER TABLE public.pred_market_output ADD COLUMN IF NOT EXISTS best_book TEXT;
ALTER TABLE public.pred_market_output ADD COLUMN IF NOT EXISTS edge_pts NUMERIC;
ALTER TABLE public.pred_market_output ADD COLUMN IF NOT EXISTS blended_prob NUMERIC;

-- 3. Fix get_mlb_team_detail to prevent arbitrary prop capping
CREATE OR REPLACE FUNCTION public.get_mlb_team_detail(p_team_id integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH
t AS (SELECT (now() AT TIME ZONE 'America/Chicago')::date AS today),
prof AS (SELECT * FROM v_team_profile WHERE team_id = p_team_id),
dm   AS (SELECT * FROM dim_teams     WHERE team_id = p_team_id),
stnd AS (SELECT * FROM v_mlb_standings WHERE team_id = p_team_id),
tdb  AS (SELECT * FROM v_mlb_team_defense_bullpen WHERE team_id = p_team_id),
agg AS (
  SELECT DISTINCT ON (window_kind)
    window_kind, era, fip, xfip, siera, ops, avg, obp, slg, hr, sb, wrc_plus, woba, metrics
  FROM agg_team
  WHERE team_id = p_team_id AND window_kind IN ('season','fg_hitting','fg_pitching')
  ORDER BY window_kind, as_of DESC
),
sea AS (SELECT * FROM agg WHERE window_kind = 'season'),
hit AS (SELECT * FROM agg WHERE window_kind = 'fg_hitting'),
pit AS (SELECT * FROM agg WHERE window_kind = 'fg_pitching'),
gm AS (
  SELECT
    g.game_pk, g.official_date, g.first_pitch_utc,
    COALESCE(g.status, CASE WHEN g.final THEN 'Final' ELSE 'Scheduled' END) AS status,
    (COALESCE(g.final, false) OR COALESCE(g.status, '') IN ('Final','Game Over','Completed Early')) AS is_final,
    (g.home_team_id = p_team_id) AS is_home,
    hd.name AS home_team, ad.name AS away_team, hd.abbr AS home_abbr, ad.abbr AS away_abbr,
    g.home_score, g.away_score,
    CASE WHEN g.home_team_id = p_team_id THEN ad.name ELSE hd.name END AS opponent,
    CASE WHEN g.home_team_id = p_team_id THEN ad.abbr ELSE hd.abbr END AS opponent_abbr,
    CASE WHEN g.home_team_id = p_team_id THEN g.home_score ELSE g.away_score END AS team_score,
    CASE WHEN g.home_team_id = p_team_id THEN g.away_score ELSE g.home_score END AS opp_score
  FROM fact_games g
  LEFT JOIN dim_teams hd ON hd.team_id = g.home_team_id
  LEFT JOIN dim_teams ad ON ad.team_id = g.away_team_id
  WHERE (g.home_team_id = p_team_id OR g.away_team_id = p_team_id)
    AND g.official_date BETWEEN (SELECT today FROM t) - 8 AND (SELECT today FROM t) + 8
),
nextg AS (SELECT * FROM gm WHERE NOT is_final ORDER BY official_date LIMIT 1),
slate AS (SELECT * FROM v_daily_slate WHERE game_pk = (SELECT game_pk FROM nextg)),
mkt AS (
  SELECT DISTINCT ON (market, selection)
    market, selection, model_prob, market_novig_prob, best_price, best_book, edge_pts, rec
  FROM pred_market_output
  WHERE game_pk = (SELECT game_pk FROM nextg) AND market IN ('h2h','total','run_line')
  ORDER BY market, selection, as_of_ts DESC
),
players AS (
  SELECT player_id, full_name FROM v_hitter_profile  WHERE team_id = p_team_id
  UNION
  SELECT player_id, full_name FROM v_pitcher_profile WHERE team_id = p_team_id
),
sd AS (
  SELECT COALESCE(
    (SELECT max(as_of_ts) FROM pred_props WHERE as_of_ts >= (SELECT today FROM t)::timestamp),
    (SELECT max(as_of_ts) FROM pred_props WHERE as_of_ts <= ((SELECT today FROM t) + 1)::timestamp)
  )::date AS d
),
pr AS (
  SELECT pp.player_id, pl.full_name, pp.prop, pp.line, pp.proj_mean, pp.prob_over,
         pp.market_novig_over, pp.edge_pts, pp.best_price, pp.best_book
  FROM pred_props pp
  JOIN players pl ON pl.player_id = pp.player_id
  WHERE pp.as_of_ts::date = (SELECT d FROM sd) AND pp.edge_pts > 0
  ORDER BY pp.edge_pts DESC
  -- Removed LIMIT 40 to avoid artificially capping results for the team
)
SELECT jsonb_build_object(
  'team',
    CASE WHEN (SELECT 1 FROM prof) IS NULL AND (SELECT 1 FROM dm) IS NULL THEN NULL
    ELSE COALESCE((SELECT to_jsonb(prof.*) FROM prof), '{}'::jsonb) || jsonb_build_object(
      'team_id', p_team_id,
      'name', COALESCE((SELECT name FROM prof), (SELECT name FROM dm)),
      'abbr', COALESCE((SELECT abbr FROM prof), (SELECT abbr FROM dm)),
      'league', (SELECT league FROM dm),
      'division', (SELECT division FROM dm),
      'run_diff', (SELECT run_diff FROM stnd),
      'runs_scored', (SELECT rs FROM stnd),
      'runs_allowed', (SELECT ra FROM stnd),
      'splits', (SELECT CASE WHEN splits IS NOT NULL
                   THEN splits || jsonb_build_object('vs_500_plus', splits->>'vs_winning_team')
                   ELSE splits END FROM prof)
    ) END,
  'stats',
    CASE WHEN (SELECT 1 FROM agg LIMIT 1) IS NULL THEN NULL
    ELSE jsonb_build_object(
      'era', (SELECT era FROM pit), 'fip', (SELECT fip FROM pit),
      'xfip', (SELECT xfip FROM pit), 'siera', (SELECT siera FROM pit),
      'whip', (SELECT (metrics->>'WHIP')::numeric FROM pit),
      'k_pct', (SELECT (metrics->>'K%')::numeric * 100 FROM pit),
      'bb_pct', (SELECT (metrics->>'BB%')::numeric * 100 FROM pit),
      'lob_pct', (SELECT (metrics->>'LOB%')::numeric * 100 FROM pit),
      'bullpen_era',  (SELECT bullpen_era  FROM tdb),
      'bullpen_whip', (SELECT bullpen_whip FROM tdb),
      'bullpen_k9',   (SELECT bullpen_k9   FROM tdb),
      'bullpen_xfip', (SELECT bullpen_xfip FROM tdb),
      'ops', (SELECT ops FROM sea), 'avg', COALESCE((SELECT avg FROM sea), (SELECT avg FROM hit)),
      'obp', (SELECT obp FROM sea), 'slg', (SELECT slg FROM sea),
      'hr', (SELECT hr FROM hit), 'sb', (SELECT sb FROM hit),
      'babip', COALESCE((SELECT (metrics->>'BABIP')::numeric FROM hit), (SELECT (metrics->>'babip')::numeric FROM sea)),
      'wrc_plus', COALESCE((SELECT wrc_plus FROM sea), (SELECT wrc_plus FROM hit)),
      'woba', COALESCE((SELECT woba FROM sea), (SELECT woba FROM hit)),
      'pyth_wpct', (SELECT pyth FROM stnd),
      'hitting_war', (SELECT (metrics->>'WAR')::numeric FROM hit),
      'pitching_war', (SELECT (metrics->>'WAR')::numeric FROM pit),
      'drs', (SELECT drs FROM tdb), 'uzr', NULL,
      'oaa', (SELECT oaa FROM tdb), 'def', (SELECT def FROM tdb), 'fld', (SELECT fld FROM tdb)
    ) END,
  'games', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'game_pk', game_pk, 'official_date', official_date, 'first_pitch_utc', first_pitch_utc,
      'status', status, 'final', is_final, 'is_home', is_home,
      'home_team', home_team, 'away_team', away_team, 'home_abbr', home_abbr, 'away_abbr', away_abbr,
      'home_score', home_score, 'away_score', away_score,
      'opponent', opponent, 'opponent_abbr', opponent_abbr,
      'team_score', team_score, 'opp_score', opp_score,
      'result', CASE WHEN is_final AND team_score IS NOT NULL AND opp_score IS NOT NULL
                     THEN CASE WHEN team_score > opp_score THEN 'W' ELSE 'L' END ELSE NULL END
    ) ORDER BY official_date) FROM gm), '[]'::jsonb),
  'matchup', (SELECT jsonb_build_object(
      'game_pk', n.game_pk, 'is_home', n.is_home, 'official_date', n.official_date,
      'first_pitch_utc', n.first_pitch_utc,
      'event_time', (SELECT event_time FROM slate),
      'status', COALESCE((SELECT status FROM slate), n.status, 'Scheduled'),
      'opponent', n.opponent, 'opponent_abbr', n.opponent_abbr,
      'team_pitcher', (SELECT CASE WHEN n.is_home THEN home_pitcher ELSE away_pitcher END FROM slate),
      'opp_pitcher',  (SELECT CASE WHEN n.is_home THEN away_pitcher ELSE home_pitcher END FROM slate),
      'team_win_prob',(SELECT CASE WHEN n.is_home THEN home_win_prob ELSE away_win_prob END FROM slate),
      'opp_win_prob', (SELECT CASE WHEN n.is_home THEN away_win_prob ELSE home_win_prob END FROM slate),
      'markets', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'market', market, 'selection', selection, 'model_prob', model_prob,
          'market_novig_prob', market_novig_prob, 'best_price', best_price,
          'best_book', best_book, 'edge_pts', edge_pts, 'rec', rec)) FROM mkt), '[]'::jsonb)
    ) FROM nextg n),
  'props_raw', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'player_id', player_id, 'full_name', full_name, 'prop', prop, 'line', line,
      'proj_mean', proj_mean, 'prob_over', prob_over, 'market_novig_over', market_novig_over,
      'edge_pts', edge_pts, 'best_price', best_price, 'best_book', best_book)) FROM pr), '[]'::jsonb),
  'slate_date', (SELECT d FROM sd)
);
$function$;
