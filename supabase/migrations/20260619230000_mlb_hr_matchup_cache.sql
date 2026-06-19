-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: mlb_hr_matchup_cache
-- Purpose:   Adds matchup awareness to the HR Tracker (opposing pitcher, park factor).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.mlb_hr_cache
    ADD COLUMN IF NOT EXISTS opp_pitcher_id integer,
    ADD COLUMN IF NOT EXISTS opp_pitcher_name text,
    ADD COLUMN IF NOT EXISTS opp_pitcher_hr9 numeric(6,3),
    ADD COLUMN IF NOT EXISTS park_factor numeric(6,3) DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS matchup_due_score numeric(6,3);

COMMENT ON COLUMN public.mlb_hr_cache.matchup_due_score IS 'due_score * (opp_pitcher_hr9 / league_avg) * park_factor';
