-- Add explicit columns to agg_batter
ALTER TABLE agg_batter
  ADD COLUMN IF NOT EXISTS avg numeric,
  ADD COLUMN IF NOT EXISTS obp numeric,
  ADD COLUMN IF NOT EXISTS slg numeric,
  ADD COLUMN IF NOT EXISTS ops numeric,
  ADD COLUMN IF NOT EXISTS hr numeric,
  ADD COLUMN IF NOT EXISTS rbi numeric,
  ADD COLUMN IF NOT EXISTS sb numeric,
  ADD COLUMN IF NOT EXISTS pa numeric,
  ADD COLUMN IF NOT EXISTS ab numeric,
  ADD COLUMN IF NOT EXISTS babip numeric,
  ADD COLUMN IF NOT EXISTS bsr numeric,
  ADD COLUMN IF NOT EXISTS war numeric,
  ADD COLUMN IF NOT EXISTS wraa numeric,
  ADD COLUMN IF NOT EXISTS gb_pct numeric,
  ADD COLUMN IF NOT EXISTS fb_pct numeric,
  ADD COLUMN IF NOT EXISTS ld_pct numeric,
  ADD COLUMN IF NOT EXISTS hr_fb_pct numeric,
  ADD COLUMN IF NOT EXISTS hard_hit_pct numeric,
  ADD COLUMN IF NOT EXISTS o_swing_pct numeric,
  ADD COLUMN IF NOT EXISTS z_swing_pct numeric,
  ADD COLUMN IF NOT EXISTS contact_pct numeric,
  ADD COLUMN IF NOT EXISTS swstr_pct numeric,
  ADD COLUMN IF NOT EXISTS def numeric;

-- Add explicit columns to agg_pitcher
ALTER TABLE agg_pitcher
  ADD COLUMN IF NOT EXISTS w numeric,
  ADD COLUMN IF NOT EXISTS l numeric,
  ADD COLUMN IF NOT EXISTS sv numeric,
  ADD COLUMN IF NOT EXISTS g numeric,
  ADD COLUMN IF NOT EXISTS gs numeric,
  ADD COLUMN IF NOT EXISTS er numeric,
  ADD COLUMN IF NOT EXISTS h numeric,
  ADD COLUMN IF NOT EXISTS bb numeric,
  ADD COLUMN IF NOT EXISTS so numeric,
  ADD COLUMN IF NOT EXISTS war numeric,
  ADD COLUMN IF NOT EXISTS bot_era numeric,
  ADD COLUMN IF NOT EXISTS xera numeric,
  ADD COLUMN IF NOT EXISTS location_plus numeric,
  ADD COLUMN IF NOT EXISTS pitching_plus numeric,
  ADD COLUMN IF NOT EXISTS lob_pct numeric,
  ADD COLUMN IF NOT EXISTS babip numeric,
  ADD COLUMN IF NOT EXISTS gb_pct numeric,
  ADD COLUMN IF NOT EXISTS fb_pct numeric,
  ADD COLUMN IF NOT EXISTS ld_pct numeric,
  ADD COLUMN IF NOT EXISTS hr_fb_pct numeric,
  ADD COLUMN IF NOT EXISTS hard_hit_pct numeric,
  ADD COLUMN IF NOT EXISTS o_swing_pct numeric,
  ADD COLUMN IF NOT EXISTS z_swing_pct numeric,
  ADD COLUMN IF NOT EXISTS contact_pct numeric,
  ADD COLUMN IF NOT EXISTS swstr_pct numeric;

-- Add explicit columns to agg_team
ALTER TABLE agg_team
  ADD COLUMN IF NOT EXISTS era numeric,
  ADD COLUMN IF NOT EXISTS fip numeric,
  ADD COLUMN IF NOT EXISTS xfip numeric,
  ADD COLUMN IF NOT EXISTS siera numeric,
  ADD COLUMN IF NOT EXISTS pitching_war numeric,
  ADD COLUMN IF NOT EXISTS avg numeric,
  ADD COLUMN IF NOT EXISTS obp numeric,
  ADD COLUMN IF NOT EXISTS slg numeric,
  ADD COLUMN IF NOT EXISTS hr numeric,
  ADD COLUMN IF NOT EXISTS sb numeric,
  ADD COLUMN IF NOT EXISTS hitting_war numeric,
  ADD COLUMN IF NOT EXISTS def numeric,
  ADD COLUMN IF NOT EXISTS uzr numeric,
  ADD COLUMN IF NOT EXISTS drs numeric,
  ADD COLUMN IF NOT EXISTS oaa numeric;

-- Add indexes for lookup performance (to fix statement timeouts)
CREATE INDEX IF NOT EXISTS idx_agg_batter_as_of_wk ON agg_batter (as_of, window_kind);
CREATE INDEX IF NOT EXISTS idx_agg_pitcher_as_of_wk ON agg_pitcher (as_of, window_kind);
CREATE INDEX IF NOT EXISTS idx_agg_team_as_of_wk ON agg_team (as_of, window_kind);

