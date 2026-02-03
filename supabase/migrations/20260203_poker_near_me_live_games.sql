-- =====================================================
-- POKER NEAR ME - LIVE GAMES SYSTEM
-- =====================================================
-- Tables: live_games, live_game_reports
-- Features: PostGIS nearby search, real-time game tracking
-- =====================================================

-- Enable PostGIS extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ===================
-- TABLE 1: live_games
-- ===================
-- Real-time game reports from players at venues

CREATE TABLE IF NOT EXISTS live_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Game Info
  game_type TEXT NOT NULL CHECK (game_type IN (
    'nlh', 'plo', 'plo8', 'mixed', 'stud', 'razz', 'omaha', 'other'
  )),
  stakes TEXT NOT NULL, -- e.g., '1/2', '2/5', '5/10'

  -- Table Status
  seats_open INTEGER DEFAULT 0 CHECK (seats_open >= 0 AND seats_open <= 10),
  waitlist_size INTEGER DEFAULT 0 CHECK (waitlist_size >= 0),
  table_count INTEGER DEFAULT 1 CHECK (table_count >= 1),

  -- Report Info
  reported_by UUID REFERENCES profiles(id),
  reported_at TIMESTAMPTZ DEFAULT now(),

  -- Validity (games expire after 2 hours without update)
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '2 hours'),
  is_active BOOLEAN DEFAULT true,

  -- Optional Details
  notes TEXT,
  average_stack INTEGER, -- In big blinds
  game_quality TEXT CHECK (game_quality IN ('soft', 'average', 'tough', NULL)),

  -- Verification
  confirmation_count INTEGER DEFAULT 1,
  last_confirmed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_games_venue ON live_games(venue_id);
CREATE INDEX IF NOT EXISTS idx_live_games_active ON live_games(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_live_games_type ON live_games(game_type);
CREATE INDEX IF NOT EXISTS idx_live_games_reported ON live_games(reported_at DESC);

-- ===================
-- TABLE 2: live_game_confirmations
-- ===================
-- Track player confirmations/updates to live game reports

CREATE TABLE IF NOT EXISTS live_game_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_game_id UUID REFERENCES live_games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),

  -- Confirmation Type
  action TEXT NOT NULL CHECK (action IN ('confirm', 'update', 'expired', 'incorrect')),

  -- Updated Info (for 'update' action)
  seats_open INTEGER,
  waitlist_size INTEGER,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_game_confirmations_game ON live_game_confirmations(live_game_id);
CREATE INDEX IF NOT EXISTS idx_live_game_confirmations_user ON live_game_confirmations(user_id);

-- ===================
-- FUNCTION: find_nearby_venues
-- ===================
-- PostGIS function to find venues within a radius

CREATE OR REPLACE FUNCTION find_nearby_venues(
  p_lat FLOAT,
  p_lng FLOAT,
  p_radius_miles FLOAT DEFAULT 50
) RETURNS TABLE (
  id INTEGER,
  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  venue_type TEXT,
  games_offered TEXT[],
  stakes_cash TEXT[],
  has_tournaments BOOLEAN,
  trust_score DECIMAL(3,2),
  distance_miles FLOAT,
  live_game_count INTEGER
) AS $$
DECLARE
  v_radius_meters FLOAT;
BEGIN
  v_radius_meters := p_radius_miles * 1609.34;

  RETURN QUERY
  SELECT
    pv.id,
    pv.name,
    pv.address,
    pv.city,
    pv.state,
    pv.latitude,
    pv.longitude,
    pv.venue_type,
    pv.games_offered,
    pv.stakes_cash,
    pv.has_tournaments,
    pv.trust_score,
    (ST_Distance(
      ST_MakePoint(pv.longitude::float, pv.latitude::float)::geography,
      ST_MakePoint(p_lng, p_lat)::geography
    ) / 1609.34)::FLOAT as distance_miles,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM live_games lg
      WHERE lg.venue_id = pv.id
      AND lg.is_active = true
      AND lg.expires_at > now()
    ), 0) as live_game_count
  FROM poker_venues pv
  WHERE pv.latitude IS NOT NULL
    AND pv.longitude IS NOT NULL
    AND ST_DWithin(
      ST_MakePoint(pv.longitude::float, pv.latitude::float)::geography,
      ST_MakePoint(p_lng, p_lat)::geography,
      v_radius_meters
    )
  ORDER BY distance_miles;
END;
$$ LANGUAGE plpgsql;

-- ===================
-- FUNCTION: find_live_games_nearby
-- ===================
-- Find active live games within radius

CREATE OR REPLACE FUNCTION find_live_games_nearby(
  p_lat FLOAT,
  p_lng FLOAT,
  p_radius_miles FLOAT DEFAULT 50,
  p_game_type TEXT DEFAULT NULL,
  p_stakes TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  venue_id INTEGER,
  venue_name TEXT,
  venue_city TEXT,
  venue_state TEXT,
  game_type TEXT,
  stakes TEXT,
  seats_open INTEGER,
  waitlist_size INTEGER,
  table_count INTEGER,
  reported_at TIMESTAMPTZ,
  distance_miles FLOAT,
  confirmation_count INTEGER,
  game_quality TEXT
) AS $$
DECLARE
  v_radius_meters FLOAT;
BEGIN
  v_radius_meters := p_radius_miles * 1609.34;

  RETURN QUERY
  SELECT
    lg.id,
    lg.venue_id,
    pv.name as venue_name,
    pv.city as venue_city,
    pv.state as venue_state,
    lg.game_type,
    lg.stakes,
    lg.seats_open,
    lg.waitlist_size,
    lg.table_count,
    lg.reported_at,
    (ST_Distance(
      ST_MakePoint(pv.longitude::float, pv.latitude::float)::geography,
      ST_MakePoint(p_lng, p_lat)::geography
    ) / 1609.34)::FLOAT as distance_miles,
    lg.confirmation_count,
    lg.game_quality
  FROM live_games lg
  JOIN poker_venues pv ON pv.id = lg.venue_id
  WHERE lg.is_active = true
    AND lg.expires_at > now()
    AND pv.latitude IS NOT NULL
    AND pv.longitude IS NOT NULL
    AND ST_DWithin(
      ST_MakePoint(pv.longitude::float, pv.latitude::float)::geography,
      ST_MakePoint(p_lng, p_lat)::geography,
      v_radius_meters
    )
    AND (p_game_type IS NULL OR lg.game_type = p_game_type)
    AND (p_stakes IS NULL OR lg.stakes = p_stakes)
  ORDER BY distance_miles, lg.reported_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ===================
-- FUNCTION: report_live_game
-- ===================
-- Report or update a live game

CREATE OR REPLACE FUNCTION report_live_game(
  p_venue_id INTEGER,
  p_user_id UUID,
  p_game_type TEXT,
  p_stakes TEXT,
  p_seats_open INTEGER DEFAULT 0,
  p_waitlist_size INTEGER DEFAULT 0,
  p_table_count INTEGER DEFAULT 1,
  p_notes TEXT DEFAULT NULL,
  p_game_quality TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_existing_id UUID;
  v_result_id UUID;
BEGIN
  -- Check for existing active report for same game
  SELECT id INTO v_existing_id
  FROM live_games
  WHERE venue_id = p_venue_id
    AND game_type = p_game_type
    AND stakes = p_stakes
    AND is_active = true
    AND expires_at > now()
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing report
    UPDATE live_games SET
      seats_open = p_seats_open,
      waitlist_size = p_waitlist_size,
      table_count = p_table_count,
      notes = COALESCE(p_notes, notes),
      game_quality = COALESCE(p_game_quality, game_quality),
      confirmation_count = confirmation_count + 1,
      last_confirmed_at = now(),
      expires_at = now() + INTERVAL '2 hours'
    WHERE id = v_existing_id;

    -- Log confirmation
    INSERT INTO live_game_confirmations (live_game_id, user_id, action, seats_open, waitlist_size, notes)
    VALUES (v_existing_id, p_user_id, 'update', p_seats_open, p_waitlist_size, p_notes);

    RETURN v_existing_id;
  ELSE
    -- Create new report
    INSERT INTO live_games (
      venue_id, game_type, stakes, seats_open, waitlist_size,
      table_count, reported_by, notes, game_quality
    ) VALUES (
      p_venue_id, p_game_type, p_stakes, p_seats_open, p_waitlist_size,
      p_table_count, p_user_id, p_notes, p_game_quality
    ) RETURNING id INTO v_result_id;

    RETURN v_result_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ===================
-- FUNCTION: expire_old_games
-- ===================
-- Cleanup function to mark expired games

CREATE OR REPLACE FUNCTION expire_old_live_games()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE live_games
  SET is_active = false
  WHERE is_active = true
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE live_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_game_confirmations ENABLE ROW LEVEL SECURITY;

-- Live games: Anyone can read, authenticated users can insert/update
CREATE POLICY live_games_read ON live_games
  FOR SELECT USING (true);

CREATE POLICY live_games_insert ON live_games
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY live_games_update ON live_games
  FOR UPDATE USING (reported_by = auth.uid());

-- Confirmations: Users can see all, insert their own
CREATE POLICY live_game_confirmations_read ON live_game_confirmations
  FOR SELECT USING (true);

CREATE POLICY live_game_confirmations_insert ON live_game_confirmations
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ===================
-- INDEXES FOR PERFORMANCE
-- ===================

-- Ensure poker_venues has location-based index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_poker_venues_location'
  ) THEN
    CREATE INDEX idx_poker_venues_location ON poker_venues
    USING GIST (
      ST_MakePoint(longitude::float, latitude::float)::geography
    )
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
  END IF;
END $$;

COMMENT ON TABLE live_games IS 'Real-time game reports from players at poker venues';
COMMENT ON TABLE live_game_confirmations IS 'Player confirmations and updates to live game reports';
COMMENT ON FUNCTION find_nearby_venues IS 'Find poker venues within radius using PostGIS';
COMMENT ON FUNCTION find_live_games_nearby IS 'Find active live games within radius';
COMMENT ON FUNCTION report_live_game IS 'Report or update a live game at a venue';
