-- ═══════════════════════════════════════════════════════════════
-- Home Games: Schedule, Location Precision, & Social Page Link
-- Adds multi-day scheduling, approximate coordinates, and
-- social page linking to commander_home_games
-- ═══════════════════════════════════════════════════════════════

-- Multi-day schedule support (replaces single day_of_week)
ALTER TABLE commander_home_games ADD COLUMN IF NOT EXISTS schedule_days TEXT[] DEFAULT '{}';
ALTER TABLE commander_home_games ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE commander_home_games ADD COLUMN IF NOT EXISTS end_time TEXT;

-- Social page link for host's game page
ALTER TABLE commander_home_games ADD COLUMN IF NOT EXISTS social_page_id UUID REFERENCES social_pages(id) ON DELETE SET NULL;

-- Approximate location (pin-drop, never exact address)
ALTER TABLE commander_home_games ADD COLUMN IF NOT EXISTS approximate_lat DOUBLE PRECISION;
ALTER TABLE commander_home_games ADD COLUMN IF NOT EXISTS approximate_lng DOUBLE PRECISION;
ALTER TABLE commander_home_games ADD COLUMN IF NOT EXISTS neighborhood TEXT;

-- Index for geo-proximity queries
CREATE INDEX IF NOT EXISTS idx_home_games_geo ON commander_home_games(approximate_lat, approximate_lng)
  WHERE approximate_lat IS NOT NULL AND approximate_lng IS NOT NULL;

-- Index for social page lookup
CREATE INDEX IF NOT EXISTS idx_home_games_social_page ON commander_home_games(social_page_id)
  WHERE social_page_id IS NOT NULL;
