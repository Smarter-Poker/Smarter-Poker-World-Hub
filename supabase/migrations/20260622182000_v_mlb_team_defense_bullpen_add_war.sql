-- Add team oWAR/pWAR (from agg_team fg_hitting/fg_pitching metrics->>'WAR') to the view so the
-- teams LIST can show them too. New columns appended at the end (CREATE OR REPLACE requires it).
CREATE OR REPLACE VIEW public.v_mlb_team_defense_bullpen AS
WITH def AS (
  SELECT DISTINCT ON (team_id) team_id, oaa, drs, framing_runs
  FROM agg_defense
  ORDER BY team_id, as_of DESC
),
pen AS (
  SELECT DISTINCT ON (team_id) team_id,
    NULLIF(metrics->>'Bullpen ERA','')::numeric  AS bullpen_era,
    NULLIF(metrics->>'Bullpen WHIP','')::numeric AS bullpen_whip,
    NULLIF(metrics->>'Bullpen K/9','')::numeric  AS bullpen_k9,
    NULLIF(metrics->>'Bullpen xFIP','')::numeric AS bullpen_xfip,
    pen_fip AS bullpen_fip
  FROM agg_bullpen
  ORDER BY team_id, as_of DESC
),
fghit AS (
  SELECT DISTINCT ON (team_id) team_id,
    NULLIF(metrics->>'Defense','')::numeric  AS fg_def,
    NULLIF(metrics->>'Fielding','')::numeric AS fg_fld,
    NULLIF(metrics->>'WAR','')::numeric      AS hitting_war
  FROM agg_team
  WHERE window_kind = 'fg_hitting'
  ORDER BY team_id, as_of DESC
),
fgpit AS (
  SELECT DISTINCT ON (team_id) team_id,
    NULLIF(metrics->>'WAR','')::numeric AS pitching_war
  FROM agg_team
  WHERE window_kind = 'fg_pitching'
  ORDER BY team_id, as_of DESC
)
SELECT
  t.team_id,
  d.oaa,
  d.drs,
  d.framing_runs,
  fh.fg_def AS def,
  fh.fg_fld AS fld,
  p.bullpen_era,
  p.bullpen_whip,
  p.bullpen_k9,
  p.bullpen_xfip,
  p.bullpen_fip,
  fh.hitting_war,
  fp.pitching_war
FROM dim_teams t
LEFT JOIN def   d  ON d.team_id  = t.team_id
LEFT JOIN pen   p  ON p.team_id  = t.team_id
LEFT JOIN fghit fh ON fh.team_id = t.team_id
LEFT JOIN fgpit fp ON fp.team_id = t.team_id;

GRANT SELECT ON public.v_mlb_team_defense_bullpen TO anon, authenticated, service_role;
