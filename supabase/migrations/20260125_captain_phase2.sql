-- =====================================================
-- SMARTER CAPTAIN - PHASE 2 DATABASE MIGRATION
-- =====================================================
-- Tables: 3 (as specified in SCOPE_LOCK.md)
-- Phase: Cash Games
-- =====================================================

-- ===================
-- TABLE 1: captain_player_sessions
-- ===================
-- Tracks player sessions at venues (check-in to check-out)

CREATE TABLE IF NOT EXISTS captain_player_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  player_name TEXT,
  check_in_at TIMESTAMPTZ DEFAULT now(),
  check_out_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  total_time_minutes INTEGER,
  games_played INTEGER DEFAULT 0,
  total_buyin INTEGER DEFAULT 0,
  comps_earned INTEGER DEFAULT 0,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_captain_sessions_venue ON captain_player_sessions(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_captain_sessions_player ON captain_player_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_captain_sessions_active ON captain_player_sessions(venue_id, check_in_at) WHERE status = 'active';

-- ===================
-- TABLE 2: captain_service_requests
-- ===================
-- In-seat service requests (food, chips, table change, etc.)

CREATE TABLE IF NOT EXISTS captain_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  game_id UUID REFERENCES captain_games(id),
  seat_id UUID REFERENCES captain_seats(id),
  player_id UUID REFERENCES profiles(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('food', 'drink', 'chips', 'table_change', 'cashout', 'floor', 'other')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'in_progress', 'completed', 'cancelled')),
  priority INTEGER DEFAULT 0,
  details JSONB DEFAULT '{}',
  notes TEXT,
  assigned_to UUID REFERENCES captain_staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_captain_service_venue ON captain_service_requests(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_captain_service_game ON captain_service_requests(game_id);
CREATE INDEX IF NOT EXISTS idx_captain_service_pending ON captain_service_requests(venue_id, created_at) WHERE status = 'pending';

-- ===================
-- TABLE 3: captain_player_preferences
-- ===================
-- Player preferences for games and notifications

CREATE TABLE IF NOT EXISTS captain_player_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES poker_venues(id),
  preferred_games TEXT[] DEFAULT '{}',
  preferred_stakes TEXT[] DEFAULT '{}',
  preferred_seats INTEGER[] DEFAULT '{}',
  notification_preferences JSONB DEFAULT '{"sms": true, "push": true, "email": false}',
  auto_join_waitlist BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_captain_prefs_player ON captain_player_preferences(player_id);
CREATE INDEX IF NOT EXISTS idx_captain_prefs_venue ON captain_player_preferences(venue_id);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_player_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_player_preferences ENABLE ROW LEVEL SECURITY;

-- Sessions: Players see own, staff see venue
CREATE POLICY captain_sessions_select ON captain_player_sessions
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_sessions_insert ON captain_player_sessions
  FOR INSERT WITH CHECK (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_sessions_update ON captain_player_sessions
  FOR UPDATE USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Service Requests: Players see own, staff see venue
CREATE POLICY captain_service_select ON captain_service_requests
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_service_insert ON captain_service_requests
  FOR INSERT WITH CHECK (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_service_update ON captain_service_requests
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Preferences: Players manage own
CREATE POLICY captain_prefs_select ON captain_player_preferences
  FOR SELECT USING (player_id = auth.uid());

CREATE POLICY captain_prefs_insert ON captain_player_preferences
  FOR INSERT WITH CHECK (player_id = auth.uid());

CREATE POLICY captain_prefs_update ON captain_player_preferences
  FOR UPDATE USING (player_id = auth.uid());

CREATE POLICY captain_prefs_delete ON captain_player_preferences
  FOR DELETE USING (player_id = auth.uid());

-- ===================
-- FUNCTIONS
-- ===================

-- Function to auto-calculate session duration on checkout
CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.check_out_at IS NOT NULL AND OLD.check_out_at IS NULL THEN
    NEW.total_time_minutes := EXTRACT(EPOCH FROM (NEW.check_out_at - NEW.check_in_at)) / 60;
    NEW.status := 'completed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_duration_trigger ON captain_player_sessions;
CREATE TRIGGER session_duration_trigger
BEFORE UPDATE ON captain_player_sessions
FOR EACH ROW EXECUTE FUNCTION calculate_session_duration();

-- Function to update preferences timestamp
CREATE OR REPLACE FUNCTION update_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS preferences_timestamp_trigger ON captain_player_preferences;
CREATE TRIGGER preferences_timestamp_trigger
BEFORE UPDATE ON captain_player_preferences
FOR EACH ROW EXECUTE FUNCTION update_preferences_timestamp();
