-- =====================================================
-- SMARTER CAPTAIN - PHASE 1 DATABASE MIGRATION
-- =====================================================
-- Tables: 7 (as specified in SCOPE_LOCK.md)
-- Source: DATABASE_SCHEMA.sql
-- =====================================================

-- ===================
-- VENUE EXTENSION
-- ===================

-- Extends existing poker_venues table for Captain
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS captain_enabled BOOLEAN DEFAULT false;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS captain_tier TEXT DEFAULT 'free';
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS captain_activated_at TIMESTAMPTZ;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'time';
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS accepts_home_games BOOLEAN DEFAULT false;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS auto_text_enabled BOOLEAN DEFAULT true;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS waitlist_settings JSONB DEFAULT '{}';
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS tournament_settings JSONB DEFAULT '{}';
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS staff_pin_required BOOLEAN DEFAULT true;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS primary_contact_id UUID REFERENCES profiles(id);

-- ===================
-- TABLE 1: captain_staff
-- ===================

CREATE TABLE IF NOT EXISTS captain_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'floor', 'brush', 'dealer')),
  permissions JSONB DEFAULT '{}',
  pin_code TEXT,
  is_active BOOLEAN DEFAULT true,
  hired_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, user_id)
);

-- Indexes for captain_staff
CREATE INDEX IF NOT EXISTS idx_captain_staff_venue ON captain_staff(venue_id);
CREATE INDEX IF NOT EXISTS idx_captain_staff_user ON captain_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_captain_staff_active ON captain_staff(venue_id, is_active);

-- ===================
-- TABLE 2: captain_tables
-- ===================

CREATE TABLE IF NOT EXISTS captain_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  table_name TEXT,
  max_seats INTEGER DEFAULT 9,
  current_game_id UUID,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'reserved', 'maintenance')),
  features JSONB DEFAULT '{}',
  position_x INTEGER,
  position_y INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, table_number)
);

-- Indexes for captain_tables
CREATE INDEX IF NOT EXISTS idx_captain_tables_venue ON captain_tables(venue_id);
CREATE INDEX IF NOT EXISTS idx_captain_tables_status ON captain_tables(venue_id, status);

-- ===================
-- TABLE 3: captain_games
-- ===================

CREATE TABLE IF NOT EXISTS captain_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  table_id UUID REFERENCES captain_tables(id),
  game_type TEXT NOT NULL CHECK (game_type IN ('nlh', 'plo', 'plo5', 'mixed', 'limit', 'stud', 'razz', 'other')),
  stakes TEXT,
  min_buyin INTEGER,
  max_buyin INTEGER,
  current_players INTEGER DEFAULT 0,
  max_players INTEGER DEFAULT 9,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'breaking', 'closed')),
  started_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  is_must_move BOOLEAN DEFAULT false,
  parent_game_id UUID REFERENCES captain_games(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for captain_games
CREATE INDEX IF NOT EXISTS idx_captain_games_venue_status ON captain_games(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_captain_games_table ON captain_games(table_id);
CREATE INDEX IF NOT EXISTS idx_captain_games_type_stakes ON captain_games(venue_id, game_type, stakes);

-- Update captain_tables foreign key
ALTER TABLE captain_tables
  ADD CONSTRAINT fk_captain_tables_current_game
  FOREIGN KEY (current_game_id) REFERENCES captain_games(id) ON DELETE SET NULL;

-- ===================
-- TABLE 4: captain_waitlist
-- ===================

CREATE TABLE IF NOT EXISTS captain_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  game_id UUID REFERENCES captain_games(id),
  game_type TEXT NOT NULL,
  stakes TEXT,
  player_id UUID REFERENCES profiles(id),
  player_name TEXT,
  player_phone TEXT,
  position INTEGER NOT NULL,
  signup_method TEXT DEFAULT 'walk_in' CHECK (signup_method IN ('walk_in', 'app', 'phone', 'kiosk')),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'called', 'seated', 'passed', 'removed')),
  call_count INTEGER DEFAULT 0,
  last_called_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  seated_at TIMESTAMPTZ,
  estimated_wait_minutes INTEGER
);

-- Indexes for captain_waitlist
CREATE INDEX IF NOT EXISTS idx_captain_waitlist_venue_status ON captain_waitlist(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_captain_waitlist_player ON captain_waitlist(player_id);
CREATE INDEX IF NOT EXISTS idx_captain_waitlist_game ON captain_waitlist(game_id);
CREATE INDEX IF NOT EXISTS idx_captain_waitlist_venue_game_type ON captain_waitlist(venue_id, game_type, stakes, status);

-- ===================
-- TABLE 5: captain_waitlist_history
-- ===================

CREATE TABLE IF NOT EXISTS captain_waitlist_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),
  game_type TEXT,
  stakes TEXT,
  wait_time_minutes INTEGER,
  was_seated BOOLEAN,
  signup_method TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for captain_waitlist_history
CREATE INDEX IF NOT EXISTS idx_captain_waitlist_history_venue ON captain_waitlist_history(venue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_captain_waitlist_history_player ON captain_waitlist_history(player_id);

-- ===================
-- TABLE 6: captain_seats
-- ===================

CREATE TABLE IF NOT EXISTS captain_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES captain_games(id) ON DELETE CASCADE,
  seat_number INTEGER NOT NULL CHECK (seat_number >= 1 AND seat_number <= 10),
  player_id UUID REFERENCES profiles(id),
  player_name TEXT,
  status TEXT DEFAULT 'empty' CHECK (status IN ('empty', 'occupied', 'reserved', 'away')),
  buyin_amount INTEGER,
  seated_at TIMESTAMPTZ,
  away_since TIMESTAMPTZ,
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(game_id, seat_number)
);

-- Indexes for captain_seats
CREATE INDEX IF NOT EXISTS idx_captain_seats_game ON captain_seats(game_id);
CREATE INDEX IF NOT EXISTS idx_captain_seats_player ON captain_seats(player_id);
CREATE INDEX IF NOT EXISTS idx_captain_seats_status ON captain_seats(game_id, status);

-- ===================
-- TABLE 7: captain_notifications
-- ===================

CREATE TABLE IF NOT EXISTS captain_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),
  notification_type TEXT NOT NULL CHECK (notification_type IN ('seat_available', 'tournament_starting', 'called_for_seat', 'promotion', 'custom')),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'push', 'email', 'in_app')),
  title TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for captain_notifications
CREATE INDEX IF NOT EXISTS idx_captain_notifications_player ON captain_notifications(player_id, status);
CREATE INDEX IF NOT EXISTS idx_captain_notifications_venue ON captain_notifications(venue_id);
CREATE INDEX IF NOT EXISTS idx_captain_notifications_created ON captain_notifications(created_at);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_waitlist_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_notifications ENABLE ROW LEVEL SECURITY;

-- Staff: Can access if they are staff at the venue
CREATE POLICY captain_staff_select ON captain_staff
  FOR SELECT USING (
    user_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_staff_insert ON captain_staff
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

CREATE POLICY captain_staff_update ON captain_staff
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Tables: Staff can manage, public can view
CREATE POLICY captain_tables_select ON captain_tables
  FOR SELECT USING (true);

CREATE POLICY captain_tables_modify ON captain_tables
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Games: Public can view running games, staff can manage
CREATE POLICY captain_games_select ON captain_games
  FOR SELECT USING (true);

CREATE POLICY captain_games_modify ON captain_games
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Waitlist: Players can see their own, staff can see all at venue
CREATE POLICY captain_waitlist_select ON captain_waitlist
  FOR SELECT USING (
    player_id = auth.uid() OR
    player_id IS NULL OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_waitlist_insert ON captain_waitlist
  FOR INSERT WITH CHECK (
    player_id = auth.uid() OR
    player_id IS NULL OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_waitlist_update ON captain_waitlist
  FOR UPDATE USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_waitlist_delete ON captain_waitlist
  FOR DELETE USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Waitlist History: Players see own, staff see venue
CREATE POLICY captain_waitlist_history_select ON captain_waitlist_history
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_waitlist_history_insert ON captain_waitlist_history
  FOR INSERT WITH CHECK (true);

-- Seats: Public can view, staff can modify
CREATE POLICY captain_seats_select ON captain_seats
  FOR SELECT USING (true);

CREATE POLICY captain_seats_modify ON captain_seats
  FOR ALL USING (
    game_id IN (
      SELECT id FROM captain_games WHERE venue_id IN (
        SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

-- Notifications: Players see own
CREATE POLICY captain_notifications_select ON captain_notifications
  FOR SELECT USING (player_id = auth.uid());

CREATE POLICY captain_notifications_insert ON captain_notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY captain_notifications_update ON captain_notifications
  FOR UPDATE USING (player_id = auth.uid());

-- ===================
-- FUNCTIONS
-- ===================

-- Function to get next waitlist position
CREATE OR REPLACE FUNCTION get_next_waitlist_position(p_venue_id UUID, p_game_type TEXT, p_stakes TEXT)
RETURNS INTEGER AS $$
DECLARE
  next_pos INTEGER;
BEGIN
  SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos
  FROM captain_waitlist
  WHERE venue_id = p_venue_id
    AND game_type = p_game_type
    AND stakes = p_stakes
    AND status = 'waiting';
  RETURN next_pos;
END;
$$ LANGUAGE plpgsql;

-- Function to recalculate waitlist positions after removal
CREATE OR REPLACE FUNCTION recalculate_waitlist_positions()
RETURNS TRIGGER AS $$
BEGIN
  -- When a waitlist entry is removed or seated, recalculate positions
  IF (TG_OP = 'UPDATE' AND NEW.status IN ('seated', 'removed', 'passed') AND OLD.status = 'waiting') OR
     (TG_OP = 'DELETE' AND OLD.status = 'waiting') THEN

    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as new_position
      FROM captain_waitlist
      WHERE venue_id = COALESCE(NEW.venue_id, OLD.venue_id)
        AND game_type = COALESCE(NEW.game_type, OLD.game_type)
        AND stakes = COALESCE(NEW.stakes, OLD.stakes)
        AND status = 'waiting'
    )
    UPDATE captain_waitlist w
    SET position = r.new_position
    FROM ranked r
    WHERE w.id = r.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for waitlist position recalculation
DROP TRIGGER IF EXISTS waitlist_position_trigger ON captain_waitlist;
CREATE TRIGGER waitlist_position_trigger
AFTER UPDATE OR DELETE ON captain_waitlist
FOR EACH ROW EXECUTE FUNCTION recalculate_waitlist_positions();

-- Function to update game player count
CREATE OR REPLACE FUNCTION update_game_player_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE captain_games
  SET current_players = (
    SELECT COUNT(*) FROM captain_seats
    WHERE game_id = COALESCE(NEW.game_id, OLD.game_id)
    AND status = 'occupied'
  )
  WHERE id = COALESCE(NEW.game_id, OLD.game_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for game player count
DROP TRIGGER IF EXISTS game_player_count_trigger ON captain_seats;
CREATE TRIGGER game_player_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON captain_seats
FOR EACH ROW EXECUTE FUNCTION update_game_player_count();

-- ===================
-- VALIDATION
-- ===================

-- After running this migration, verify with:
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'captain_%' ORDER BY table_name;
-- Should return exactly 7 tables:
-- captain_games
-- captain_notifications
-- captain_seats
-- captain_staff
-- captain_tables
-- captain_waitlist
-- captain_waitlist_history
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
-- =====================================================
-- SMARTER CAPTAIN - PHASE 3 DATABASE MIGRATION
-- =====================================================
-- Tables: 2 (as specified in SCOPE_LOCK.md)
-- Phase: Tournaments
-- =====================================================

-- ===================
-- TABLE 1: captain_tournaments
-- ===================

CREATE TABLE IF NOT EXISTS captain_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tournament_type TEXT NOT NULL CHECK (tournament_type IN ('freezeout', 'rebuy', 'bounty', 'satellite', 'shootout', 'turbo', 'hyper')),

  -- Buy-in structure
  buyin_amount INTEGER NOT NULL,
  buyin_fee INTEGER DEFAULT 0,
  starting_chips INTEGER NOT NULL,

  -- Schedule
  scheduled_start TIMESTAMPTZ NOT NULL,
  registration_opens TIMESTAMPTZ,
  late_registration_levels INTEGER DEFAULT 6,
  actual_start TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Capacity
  min_entries INTEGER DEFAULT 2,
  max_entries INTEGER,
  guaranteed_pool INTEGER,

  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'registration', 'running', 'paused', 'final_table', 'completed', 'cancelled')),

  -- Current state
  current_level INTEGER DEFAULT 0,
  current_entries INTEGER DEFAULT 0,
  players_remaining INTEGER DEFAULT 0,
  total_chips_in_play INTEGER DEFAULT 0,
  average_stack INTEGER DEFAULT 0,

  -- Structure (stored as JSONB)
  blind_structure JSONB DEFAULT '[]',
  break_schedule JSONB DEFAULT '[]',
  payout_structure JSONB DEFAULT '[]',

  -- Rebuy/Addon settings
  allows_rebuys BOOLEAN DEFAULT false,
  rebuy_amount INTEGER,
  rebuy_chips INTEGER,
  max_rebuys INTEGER,
  rebuy_end_level INTEGER,
  allows_addon BOOLEAN DEFAULT false,
  addon_amount INTEGER,
  addon_chips INTEGER,
  addon_at_break INTEGER,

  -- Bounty settings
  bounty_amount INTEGER,

  -- Integration
  broadcast_to_smarter BOOLEAN DEFAULT true,
  series_id UUID,

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_by UUID REFERENCES captain_staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_captain_tournaments_venue ON captain_tournaments(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_captain_tournaments_schedule ON captain_tournaments(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_captain_tournaments_status ON captain_tournaments(status);
CREATE INDEX IF NOT EXISTS idx_captain_tournaments_series ON captain_tournaments(series_id);

-- ===================
-- TABLE 2: captain_tournament_entries
-- ===================

CREATE TABLE IF NOT EXISTS captain_tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES captain_tournaments(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  player_name TEXT,
  player_phone TEXT,

  -- Registration
  registered_at TIMESTAMPTZ DEFAULT now(),
  registration_method TEXT DEFAULT 'app' CHECK (registration_method IN ('app', 'walk_in', 'online', 'transfer')),
  table_number INTEGER,
  seat_number INTEGER,

  -- Status
  status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'seated', 'active', 'eliminated', 'winner')),

  -- Chip count
  current_chips INTEGER,
  last_chip_count_at TIMESTAMPTZ,

  -- Rebuys/Addons
  rebuy_count INTEGER DEFAULT 0,
  addon_taken BOOLEAN DEFAULT false,
  total_invested INTEGER,

  -- Elimination
  eliminated_at TIMESTAMPTZ,
  eliminated_by UUID REFERENCES captain_tournament_entries(id),
  finish_position INTEGER,

  -- Payout
  payout_amount INTEGER,
  payout_position INTEGER,
  bounties_collected INTEGER DEFAULT 0,

  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_captain_entries_tournament ON captain_tournament_entries(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_captain_entries_player ON captain_tournament_entries(player_id);
CREATE INDEX IF NOT EXISTS idx_captain_entries_position ON captain_tournament_entries(tournament_id, finish_position);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_tournament_entries ENABLE ROW LEVEL SECURITY;

-- Tournaments: Public can view, staff can manage
CREATE POLICY captain_tournaments_select ON captain_tournaments
  FOR SELECT USING (true);

CREATE POLICY captain_tournaments_insert ON captain_tournaments
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_tournaments_update ON captain_tournaments
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_tournaments_delete ON captain_tournaments
  FOR DELETE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Entries: Public can view, players can register self, staff can manage all
CREATE POLICY captain_entries_select ON captain_tournament_entries
  FOR SELECT USING (true);

CREATE POLICY captain_entries_insert ON captain_tournament_entries
  FOR INSERT WITH CHECK (
    player_id = auth.uid() OR
    player_id IS NULL OR
    tournament_id IN (
      SELECT id FROM captain_tournaments WHERE venue_id IN (
        SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY captain_entries_update ON captain_tournament_entries
  FOR UPDATE USING (
    player_id = auth.uid() OR
    tournament_id IN (
      SELECT id FROM captain_tournaments WHERE venue_id IN (
        SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY captain_entries_delete ON captain_tournament_entries
  FOR DELETE USING (
    (player_id = auth.uid() AND status = 'registered') OR
    tournament_id IN (
      SELECT id FROM captain_tournaments WHERE venue_id IN (
        SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

-- ===================
-- FUNCTIONS
-- ===================

-- Update tournament stats when entries change
CREATE OR REPLACE FUNCTION update_tournament_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE captain_tournaments
  SET
    current_entries = (
      SELECT COUNT(*) FROM captain_tournament_entries
      WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
      AND status != 'eliminated'
    ),
    players_remaining = (
      SELECT COUNT(*) FROM captain_tournament_entries
      WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
      AND status IN ('seated', 'active')
    ),
    total_chips_in_play = (
      SELECT COALESCE(SUM(current_chips), 0) FROM captain_tournament_entries
      WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
      AND status IN ('seated', 'active')
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);

  -- Calculate average stack
  UPDATE captain_tournaments
  SET average_stack = CASE
    WHEN players_remaining > 0 THEN total_chips_in_play / players_remaining
    ELSE 0
  END
  WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tournament_stats_trigger ON captain_tournament_entries;
CREATE TRIGGER tournament_stats_trigger
AFTER INSERT OR UPDATE OR DELETE ON captain_tournament_entries
FOR EACH ROW EXECUTE FUNCTION update_tournament_stats();

-- Auto-set total_invested on entry
CREATE OR REPLACE FUNCTION calculate_entry_investment()
RETURNS TRIGGER AS $$
DECLARE
  tournament_record RECORD;
BEGIN
  SELECT buyin_amount, buyin_fee, rebuy_amount, addon_amount
  INTO tournament_record
  FROM captain_tournaments WHERE id = NEW.tournament_id;

  NEW.total_invested := tournament_record.buyin_amount + COALESCE(tournament_record.buyin_fee, 0)
    + (NEW.rebuy_count * COALESCE(tournament_record.rebuy_amount, 0))
    + (CASE WHEN NEW.addon_taken THEN COALESCE(tournament_record.addon_amount, 0) ELSE 0 END);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entry_investment_trigger ON captain_tournament_entries;
CREATE TRIGGER entry_investment_trigger
BEFORE INSERT OR UPDATE ON captain_tournament_entries
FOR EACH ROW EXECUTE FUNCTION calculate_entry_investment();
-- =====================================================
-- SMARTER CAPTAIN - PHASE 4 DATABASE MIGRATION
-- =====================================================
-- Tables: 7 (Home Games + Messaging + Notifications)
-- Phase: Home Games & Club Communication
-- =====================================================

-- ===================
-- TABLE 1: captain_home_groups
-- ===================
-- Private poker groups/clubs that can host home games

CREATE TABLE IF NOT EXISTS captain_home_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Owner/Host
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Club Identity (for QR codes and sharing)
  club_code TEXT UNIQUE, -- Short 6-char code for easy sharing
  invite_code TEXT UNIQUE, -- 8-char invite code
  qr_code_url TEXT, -- Stored QR code image URL (optional, can generate dynamically)

  -- Privacy settings
  is_private BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT true,

  -- Location (approximate for discovery)
  city TEXT,
  state TEXT,
  zip_code TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),

  -- Game preferences
  default_game_type TEXT DEFAULT 'nlhe',
  default_stakes TEXT,
  typical_buyin_min INTEGER,
  typical_buyin_max INTEGER,
  max_players INTEGER DEFAULT 9,

  -- Schedule
  typical_day TEXT,
  typical_time TIME,
  frequency TEXT CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'irregular')),

  -- Stats
  member_count INTEGER DEFAULT 1,
  games_hosted INTEGER DEFAULT 0,

  -- Settings
  settings JSONB DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_groups_owner ON captain_home_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_home_groups_location ON captain_home_groups(city, state);
CREATE INDEX IF NOT EXISTS idx_home_groups_invite ON captain_home_groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_home_groups_club_code ON captain_home_groups(club_code);

-- ===================
-- TABLE 2: captain_home_members
-- ===================
-- Membership in home game groups

CREATE TABLE IF NOT EXISTS captain_home_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Role
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'banned')),

  -- Stats
  games_attended INTEGER DEFAULT 0,
  games_hosted INTEGER DEFAULT 0,
  last_attended TIMESTAMPTZ,

  -- Preferences
  can_host BOOLEAN DEFAULT false,
  notifications_enabled BOOLEAN DEFAULT true,

  -- Notification preferences (granular)
  notify_announcements BOOLEAN DEFAULT true,
  notify_new_games BOOLEAN DEFAULT true,
  notify_game_reminders BOOLEAN DEFAULT true,
  notify_rsvp_updates BOOLEAN DEFAULT true,

  -- Metadata
  invited_by UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_home_members_group ON captain_home_members(group_id, status);
CREATE INDEX IF NOT EXISTS idx_home_members_user ON captain_home_members(user_id, status);

-- ===================
-- TABLE 3: captain_home_games
-- ===================
-- Scheduled home game events

CREATE TABLE IF NOT EXISTS captain_home_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE CASCADE,

  -- Host (may differ from group owner)
  host_id UUID REFERENCES profiles(id),

  -- Game details
  title TEXT,
  description TEXT,
  game_type TEXT NOT NULL DEFAULT 'nlhe',
  stakes TEXT,

  -- Buy-in
  buyin_min INTEGER,
  buyin_max INTEGER,

  -- Schedule
  scheduled_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,

  -- Location
  address TEXT,
  address_visible_to TEXT DEFAULT 'rsvp' CHECK (address_visible_to IN ('all', 'rsvp', 'approved')),
  location_notes TEXT,

  -- Capacity
  max_players INTEGER DEFAULT 9,
  min_players INTEGER DEFAULT 4,

  -- RSVP tracking
  rsvp_yes INTEGER DEFAULT 0,
  rsvp_maybe INTEGER DEFAULT 0,
  rsvp_no INTEGER DEFAULT 0,
  waitlist_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')),

  -- Settings
  allow_guests BOOLEAN DEFAULT false,
  guest_limit INTEGER DEFAULT 1,
  food_drinks TEXT,
  special_rules TEXT,

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_games_group ON captain_home_games(group_id, status);
CREATE INDEX IF NOT EXISTS idx_home_games_date ON captain_home_games(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_home_games_host ON captain_home_games(host_id);

-- ===================
-- TABLE 4: captain_home_rsvps
-- ===================
-- RSVPs for home games

CREATE TABLE IF NOT EXISTS captain_home_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES captain_home_games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Response
  response TEXT NOT NULL CHECK (response IN ('yes', 'maybe', 'no', 'waitlist')),

  -- Guest info
  bringing_guests INTEGER DEFAULT 0,
  guest_names TEXT[],

  -- Notes
  message TEXT,

  -- Status
  is_confirmed BOOLEAN DEFAULT false,
  seat_number INTEGER,

  -- Timing
  responded_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(game_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_home_rsvps_game ON captain_home_rsvps(game_id, response);
CREATE INDEX IF NOT EXISTS idx_home_rsvps_user ON captain_home_rsvps(user_id);

-- ===================
-- TABLE 5: captain_club_announcements
-- ===================
-- Club announcements and messages to members

CREATE TABLE IF NOT EXISTS captain_club_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE CASCADE,

  -- Author
  author_id UUID REFERENCES profiles(id),

  -- Content
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'announcement' CHECK (message_type IN ('announcement', 'game_reminder', 'event', 'update', 'urgent')),

  -- Targeting
  target_all BOOLEAN DEFAULT true,
  target_member_ids UUID[], -- If not target_all, specific members

  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,

  -- Related content
  related_game_id UUID REFERENCES captain_home_games(id) ON DELETE SET NULL,

  -- Push notification
  send_push BOOLEAN DEFAULT true,
  push_sent BOOLEAN DEFAULT false,
  push_sent_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_announcements_group ON captain_club_announcements(group_id, status);
CREATE INDEX IF NOT EXISTS idx_club_announcements_scheduled ON captain_club_announcements(scheduled_for) WHERE status = 'scheduled';

-- ===================
-- TABLE 6: captain_push_subscriptions
-- ===================
-- Push notification device tokens per user per club

CREATE TABLE IF NOT EXISTS captain_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE CASCADE,

  -- Device info
  device_token TEXT NOT NULL,
  device_type TEXT CHECK (device_type IN ('ios', 'android', 'web')),
  device_name TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, group_id, device_token)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON captain_push_subscriptions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_push_subs_group ON captain_push_subscriptions(group_id, is_active);

-- ===================
-- TABLE 7: captain_notification_log
-- ===================
-- Log of sent notifications for tracking/debugging

CREATE TABLE IF NOT EXISTS captain_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE SET NULL,
  announcement_id UUID REFERENCES captain_club_announcements(id) ON DELETE SET NULL,

  -- Notification details
  notification_type TEXT NOT NULL,
  title TEXT,
  body TEXT,

  -- Delivery
  channel TEXT CHECK (channel IN ('push', 'sms', 'email', 'in_app')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'read')),

  -- Response
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user ON captain_notification_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_group ON captain_notification_log(group_id, created_at);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_home_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_club_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_notification_log ENABLE ROW LEVEL SECURITY;

-- Groups: Public groups visible to all, private to members only
CREATE POLICY home_groups_select ON captain_home_groups
  FOR SELECT USING (
    NOT is_private OR
    owner_id = auth.uid() OR
    id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND status = 'approved')
  );

CREATE POLICY home_groups_insert ON captain_home_groups
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY home_groups_update ON captain_home_groups
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY home_groups_delete ON captain_home_groups
  FOR DELETE USING (owner_id = auth.uid());

-- Members: Visible to group members
CREATE POLICY home_members_select ON captain_home_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND status = 'approved')
  );

CREATE POLICY home_members_insert ON captain_home_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid()) OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY home_members_update ON captain_home_members
  FOR UPDATE USING (
    user_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid()) OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY home_members_delete ON captain_home_members
  FOR DELETE USING (
    user_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid())
  );

-- Games: Visible to group members
CREATE POLICY home_games_select ON captain_home_games
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND status = 'approved') OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid())
  );

CREATE POLICY home_games_insert ON captain_home_games
  FOR INSERT WITH CHECK (
    host_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid()) OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY home_games_update ON captain_home_games
  FOR UPDATE USING (
    host_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid()) OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY home_games_delete ON captain_home_games
  FOR DELETE USING (
    host_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid())
  );

-- RSVPs: Users can manage their own, hosts can view all
CREATE POLICY home_rsvps_select ON captain_home_rsvps
  FOR SELECT USING (
    user_id = auth.uid() OR
    game_id IN (SELECT id FROM captain_home_games WHERE host_id = auth.uid()) OR
    game_id IN (SELECT id FROM captain_home_games WHERE group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND status = 'approved'))
  );

CREATE POLICY home_rsvps_insert ON captain_home_rsvps
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY home_rsvps_update ON captain_home_rsvps
  FOR UPDATE USING (
    user_id = auth.uid() OR
    game_id IN (SELECT id FROM captain_home_games WHERE host_id = auth.uid())
  );

CREATE POLICY home_rsvps_delete ON captain_home_rsvps
  FOR DELETE USING (user_id = auth.uid());

-- Announcements: Members can view, admins can create/edit
CREATE POLICY club_announcements_select ON captain_club_announcements
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND status = 'approved')
  );

CREATE POLICY club_announcements_insert ON captain_club_announcements
  FOR INSERT WITH CHECK (
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid()) OR
    group_id IN (SELECT group_id FROM captain_home_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'approved')
  );

CREATE POLICY club_announcements_update ON captain_club_announcements
  FOR UPDATE USING (
    author_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid())
  );

CREATE POLICY club_announcements_delete ON captain_club_announcements
  FOR DELETE USING (
    author_id = auth.uid() OR
    group_id IN (SELECT id FROM captain_home_groups WHERE owner_id = auth.uid())
  );

-- Push subscriptions: Users manage their own
CREATE POLICY push_subs_select ON captain_push_subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY push_subs_insert ON captain_push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subs_update ON captain_push_subscriptions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY push_subs_delete ON captain_push_subscriptions
  FOR DELETE USING (user_id = auth.uid());

-- Notification log: Users can see their own notifications
CREATE POLICY notification_log_select ON captain_notification_log
  FOR SELECT USING (user_id = auth.uid());

-- ===================
-- FUNCTIONS
-- ===================

-- Update member count when members change
CREATE OR REPLACE FUNCTION update_home_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE captain_home_groups
  SET
    member_count = (
      SELECT COUNT(*) FROM captain_home_members
      WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
      AND status = 'approved'
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.group_id, OLD.group_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_member_count_trigger ON captain_home_members;
CREATE TRIGGER home_member_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON captain_home_members
FOR EACH ROW EXECUTE FUNCTION update_home_group_member_count();

-- Update RSVP counts when RSVPs change
CREATE OR REPLACE FUNCTION update_home_game_rsvp_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE captain_home_games
  SET
    rsvp_yes = (SELECT COUNT(*) FROM captain_home_rsvps WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'yes'),
    rsvp_maybe = (SELECT COUNT(*) FROM captain_home_rsvps WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'maybe'),
    rsvp_no = (SELECT COUNT(*) FROM captain_home_rsvps WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'no'),
    waitlist_count = (SELECT COUNT(*) FROM captain_home_rsvps WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND response = 'waitlist'),
    updated_at = now()
  WHERE id = COALESCE(NEW.game_id, OLD.game_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_rsvp_count_trigger ON captain_home_rsvps;
CREATE TRIGGER home_rsvp_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON captain_home_rsvps
FOR EACH ROW EXECUTE FUNCTION update_home_game_rsvp_counts();

-- Generate unique invite code and club code
CREATE OR REPLACE FUNCTION generate_club_codes()
RETURNS TRIGGER AS $$
DECLARE
  new_club_code TEXT;
  code_exists BOOLEAN;
BEGIN
  -- Generate invite code (8 chars)
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := upper(substr(md5(random()::text), 1, 8));
  END IF;

  -- Generate club code (6 chars, alphanumeric, easy to type)
  IF NEW.club_code IS NULL THEN
    LOOP
      -- Generate a 6-character alphanumeric code (no confusing chars like 0/O, 1/I/L)
      new_club_code := upper(substr(
        translate(encode(gen_random_bytes(4), 'base64'), '+/=0O1IL', ''),
        1, 6
      ));
      -- Check if it exists
      SELECT EXISTS(SELECT 1 FROM captain_home_groups WHERE club_code = new_club_code) INTO code_exists;
      EXIT WHEN NOT code_exists;
    END LOOP;
    NEW.club_code := new_club_code;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_group_invite_code_trigger ON captain_home_groups;
DROP TRIGGER IF EXISTS home_group_codes_trigger ON captain_home_groups;
CREATE TRIGGER home_group_codes_trigger
BEFORE INSERT ON captain_home_groups
FOR EACH ROW EXECUTE FUNCTION generate_club_codes();

-- Auto-add owner as member
CREATE OR REPLACE FUNCTION auto_add_group_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO captain_home_members (group_id, user_id, role, status, joined_at)
  VALUES (NEW.id, NEW.owner_id, 'owner', 'approved', now())
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_group_owner_trigger ON captain_home_groups;
CREATE TRIGGER home_group_owner_trigger
AFTER INSERT ON captain_home_groups
FOR EACH ROW EXECUTE FUNCTION auto_add_group_owner();
-- =====================================================
-- SMARTER CAPTAIN - PHASE 5 DATABASE MIGRATION
-- =====================================================
-- Tables: 5 (Promotions & Analytics)
-- Phase: Promotions, Rewards, Analytics
-- =====================================================

-- ===================
-- TABLE 1: captain_promotions
-- ===================
-- Venue promotions (high hand bonuses, happy hours, etc.)

CREATE TABLE IF NOT EXISTS captain_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  description TEXT,
  promotion_type TEXT NOT NULL CHECK (promotion_type IN (
    'high_hand', 'bad_beat', 'splash_pot', 'happy_hour',
    'new_player', 'referral', 'loyalty', 'tournament_bonus',
    'cash_back', 'drawing', 'other'
  )),

  -- Value
  prize_type TEXT DEFAULT 'cash' CHECK (prize_type IN ('cash', 'chips', 'freeroll', 'merchandise', 'points', 'other')),
  prize_value INTEGER,
  prize_description TEXT,

  -- Schedule
  start_date DATE,
  end_date DATE,
  days_of_week INTEGER[], -- 0=Sunday, 6=Saturday
  start_time TIME,
  end_time TIME,
  is_recurring BOOLEAN DEFAULT false,

  -- Conditions
  min_stakes TEXT,
  min_hours_played DECIMAL(4,2),
  min_buyin INTEGER,
  game_types TEXT[], -- ['nlhe', 'plo', etc.]
  qualifying_hands TEXT, -- e.g., 'Aces full or better'

  -- Tracking
  total_awarded INTEGER DEFAULT 0,
  total_value_awarded INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  is_featured BOOLEAN DEFAULT false,

  -- Display
  image_url TEXT,
  terms_conditions TEXT,

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_by UUID REFERENCES captain_staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotions_venue ON captain_promotions(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_promotions_type ON captain_promotions(promotion_type, status);
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON captain_promotions(start_date, end_date);

-- ===================
-- TABLE 2: captain_promotion_awards
-- ===================
-- Track promotion awards to players

CREATE TABLE IF NOT EXISTS captain_promotion_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID REFERENCES captain_promotions(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Recipient
  player_id UUID REFERENCES profiles(id),
  player_name TEXT,

  -- Award details
  award_type TEXT NOT NULL,
  prize_value INTEGER NOT NULL,
  prize_description TEXT,

  -- Context
  session_id UUID REFERENCES captain_player_sessions(id),
  table_id UUID REFERENCES captain_tables(id),
  game_details JSONB, -- Hand info, etc.

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'void')),
  approved_by UUID REFERENCES captain_staff(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_awards_promotion ON captain_promotion_awards(promotion_id, status);
CREATE INDEX IF NOT EXISTS idx_awards_player ON captain_promotion_awards(player_id);
CREATE INDEX IF NOT EXISTS idx_awards_venue ON captain_promotion_awards(venue_id, created_at);

-- ===================
-- TABLE 3: captain_analytics_daily
-- ===================
-- Daily aggregated analytics per venue

CREATE TABLE IF NOT EXISTS captain_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Session metrics
  total_sessions INTEGER DEFAULT 0,
  unique_players INTEGER DEFAULT 0,
  new_players INTEGER DEFAULT 0,
  returning_players INTEGER DEFAULT 0,

  -- Time metrics
  total_play_hours DECIMAL(10,2) DEFAULT 0,
  avg_session_hours DECIMAL(4,2) DEFAULT 0,
  peak_concurrent_players INTEGER DEFAULT 0,
  peak_hour INTEGER, -- 0-23

  -- Financial metrics
  total_buyin INTEGER DEFAULT 0,
  total_cashout INTEGER DEFAULT 0,
  avg_buyin INTEGER DEFAULT 0,

  -- Table metrics
  tables_opened INTEGER DEFAULT 0,
  max_tables_running INTEGER DEFAULT 0,
  table_hours DECIMAL(10,2) DEFAULT 0,

  -- Game breakdown
  nlhe_hours DECIMAL(10,2) DEFAULT 0,
  plo_hours DECIMAL(10,2) DEFAULT 0,
  other_hours DECIMAL(10,2) DEFAULT 0,

  -- Tournament metrics
  tournaments_run INTEGER DEFAULT 0,
  tournament_entries INTEGER DEFAULT 0,
  tournament_prizepool INTEGER DEFAULT 0,

  -- Waitlist metrics
  waitlist_joins INTEGER DEFAULT 0,
  waitlist_seats INTEGER DEFAULT 0,
  avg_wait_time_minutes INTEGER DEFAULT 0,

  -- Promotion metrics
  promotions_awarded INTEGER DEFAULT 0,
  promotion_value_awarded INTEGER DEFAULT 0,

  -- Service metrics
  service_requests INTEGER DEFAULT 0,
  avg_service_time_minutes INTEGER DEFAULT 0,

  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_venue ON captain_analytics_daily(venue_id, date);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON captain_analytics_daily(date);

-- ===================
-- TABLE 4: captain_player_stats
-- ===================
-- Aggregated player stats per venue

CREATE TABLE IF NOT EXISTS captain_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Visit metrics
  first_visit DATE,
  last_visit DATE,
  total_visits INTEGER DEFAULT 0,
  visits_this_month INTEGER DEFAULT 0,
  visits_this_year INTEGER DEFAULT 0,

  -- Time metrics
  total_hours DECIMAL(10,2) DEFAULT 0,
  hours_this_month DECIMAL(6,2) DEFAULT 0,
  hours_this_year DECIMAL(8,2) DEFAULT 0,
  avg_session_hours DECIMAL(4,2) DEFAULT 0,
  longest_session_hours DECIMAL(4,2) DEFAULT 0,

  -- Financial metrics
  total_buyin INTEGER DEFAULT 0,
  total_cashout INTEGER DEFAULT 0,
  avg_buyin INTEGER DEFAULT 0,

  -- Game preferences
  preferred_game TEXT,
  preferred_stakes TEXT,
  games_played JSONB DEFAULT '{}', -- {"nlhe": 50, "plo": 10}

  -- Tournament stats
  tournaments_played INTEGER DEFAULT 0,
  tournament_cashes INTEGER DEFAULT 0,
  tournament_wins INTEGER DEFAULT 0,
  total_tournament_earnings INTEGER DEFAULT 0,

  -- Promotion stats
  promotions_won INTEGER DEFAULT 0,
  promotion_earnings INTEGER DEFAULT 0,

  -- Loyalty
  loyalty_points INTEGER DEFAULT 0,
  loyalty_tier TEXT DEFAULT 'bronze' CHECK (loyalty_tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')),

  -- Referrals
  players_referred INTEGER DEFAULT 0,
  referral_bonus_earned INTEGER DEFAULT 0,

  -- Status
  is_vip BOOLEAN DEFAULT false,
  notes TEXT,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_stats_venue ON captain_player_stats(venue_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON captain_player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_loyalty ON captain_player_stats(venue_id, loyalty_tier);

-- ===================
-- TABLE 5: captain_leaderboards
-- ===================
-- Leaderboard entries for competitions

CREATE TABLE IF NOT EXISTS captain_leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Leaderboard info
  name TEXT NOT NULL,
  description TEXT,
  leaderboard_type TEXT NOT NULL CHECK (leaderboard_type IN (
    'hours_played', 'sessions', 'high_hand', 'tournament_points',
    'referrals', 'custom'
  )),

  -- Period
  period_type TEXT DEFAULT 'monthly' CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Prizes
  prizes JSONB DEFAULT '[]', -- [{"position": 1, "prize": "$500"}, ...]

  -- Rules
  min_hours DECIMAL(4,2),
  min_sessions INTEGER,
  eligible_games TEXT[],
  rules_description TEXT,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaderboards_venue ON captain_leaderboards(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_leaderboards_dates ON captain_leaderboards(start_date, end_date);

-- ===================
-- TABLE 6: captain_leaderboard_entries
-- ===================
-- Player entries in leaderboards

CREATE TABLE IF NOT EXISTS captain_leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_id UUID REFERENCES captain_leaderboards(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Score
  score DECIMAL(12,2) DEFAULT 0,
  rank INTEGER,

  -- Breakdown
  hours_played DECIMAL(8,2) DEFAULT 0,
  sessions_count INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  qualifying_events INTEGER DEFAULT 0,

  -- Prize
  prize_position INTEGER,
  prize_won TEXT,
  prize_paid BOOLEAN DEFAULT false,

  -- Metadata
  last_updated TIMESTAMPTZ DEFAULT now(),

  UNIQUE(leaderboard_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_lb_entries_leaderboard ON captain_leaderboard_entries(leaderboard_id, rank);
CREATE INDEX IF NOT EXISTS idx_lb_entries_player ON captain_leaderboard_entries(player_id);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_promotion_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Promotions: Public can view active, staff can manage
CREATE POLICY promotions_select ON captain_promotions
  FOR SELECT USING (
    status = 'active' OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY promotions_insert ON captain_promotions
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY promotions_update ON captain_promotions
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY promotions_delete ON captain_promotions
  FOR DELETE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Awards: Players see their own, staff see venue awards
CREATE POLICY awards_select ON captain_promotion_awards
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY awards_insert ON captain_promotion_awards
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY awards_update ON captain_promotion_awards
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Analytics: Staff only
CREATE POLICY analytics_select ON captain_analytics_daily
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Player stats: Players see their own, staff see venue stats
CREATE POLICY player_stats_select ON captain_player_stats
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY player_stats_update ON captain_player_stats
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Leaderboards: Public can view
CREATE POLICY leaderboards_select ON captain_leaderboards
  FOR SELECT USING (true);

CREATE POLICY leaderboards_insert ON captain_leaderboards
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY leaderboards_update ON captain_leaderboards
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Leaderboard entries: Public can view
CREATE POLICY lb_entries_select ON captain_leaderboard_entries
  FOR SELECT USING (true);

-- ===================
-- FUNCTIONS
-- ===================

-- Update promotion totals when awards are given
CREATE OR REPLACE FUNCTION update_promotion_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'paid' AND OLD.status != 'paid') THEN
    UPDATE captain_promotions
    SET
      total_awarded = total_awarded + 1,
      total_value_awarded = total_value_awarded + NEW.prize_value,
      updated_at = now()
    WHERE id = NEW.promotion_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS promotion_totals_trigger ON captain_promotion_awards;
CREATE TRIGGER promotion_totals_trigger
AFTER INSERT OR UPDATE ON captain_promotion_awards
FOR EACH ROW EXECUTE FUNCTION update_promotion_totals();

-- Update player stats after session
CREATE OR REPLACE FUNCTION update_player_stats_from_session()
RETURNS TRIGGER AS $$
DECLARE
  session_hours DECIMAL(6,2);
BEGIN
  -- Only process completed sessions
  IF NEW.status != 'completed' OR NEW.total_time_minutes IS NULL THEN
    RETURN NEW;
  END IF;

  session_hours := NEW.total_time_minutes / 60.0;

  INSERT INTO captain_player_stats (
    venue_id,
    player_id,
    first_visit,
    last_visit,
    total_visits,
    total_hours,
    total_buyin,
    total_cashout
  )
  VALUES (
    NEW.venue_id,
    NEW.player_id,
    CURRENT_DATE,
    CURRENT_DATE,
    1,
    session_hours,
    COALESCE(NEW.total_buyin, 0),
    COALESCE(NEW.total_cashout, 0)
  )
  ON CONFLICT (venue_id, player_id) DO UPDATE SET
    last_visit = CURRENT_DATE,
    total_visits = captain_player_stats.total_visits + 1,
    total_hours = captain_player_stats.total_hours + session_hours,
    total_buyin = captain_player_stats.total_buyin + COALESCE(NEW.total_buyin, 0),
    total_cashout = captain_player_stats.total_cashout + COALESCE(NEW.total_cashout, 0),
    avg_session_hours = (captain_player_stats.total_hours + session_hours) / (captain_player_stats.total_visits + 1),
    longest_session_hours = GREATEST(captain_player_stats.longest_session_hours, session_hours),
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS player_stats_session_trigger ON captain_player_sessions;
CREATE TRIGGER player_stats_session_trigger
AFTER UPDATE ON captain_player_sessions
FOR EACH ROW
WHEN (NEW.status = 'completed' AND NEW.player_id IS NOT NULL)
EXECUTE FUNCTION update_player_stats_from_session();

-- Calculate loyalty tier based on hours
CREATE OR REPLACE FUNCTION calculate_loyalty_tier(hours DECIMAL)
RETURNS TEXT AS $$
BEGIN
  IF hours >= 500 THEN RETURN 'diamond';
  ELSIF hours >= 250 THEN RETURN 'platinum';
  ELSIF hours >= 100 THEN RETURN 'gold';
  ELSIF hours >= 50 THEN RETURN 'silver';
  ELSE RETURN 'bronze';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Update leaderboard rankings
CREATE OR REPLACE FUNCTION update_leaderboard_rankings(lb_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE captain_leaderboard_entries
  SET rank = subquery.new_rank
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) as new_rank
    FROM captain_leaderboard_entries
    WHERE leaderboard_id = lb_id
  ) AS subquery
  WHERE captain_leaderboard_entries.id = subquery.id;
END;
$$ LANGUAGE plpgsql;
-- =====================================================
-- SMARTER CAPTAIN - PHASE 5 COMPS SYSTEM
-- =====================================================
-- Tables: 4 (Comp Rates, Balances, Transactions, Redemptions)
-- Feature: Player comps tracking and management
-- =====================================================

-- ===================
-- TABLE 1: captain_comp_rates
-- ===================
-- Defines comp earning rates per venue (e.g., $1/hour played)

CREATE TABLE IF NOT EXISTS captain_comp_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Rate info
  name TEXT NOT NULL,
  description TEXT,

  -- Earning method
  rate_type TEXT NOT NULL CHECK (rate_type IN (
    'hourly',      -- $X per hour played
    'buyin',       -- $X per $Y bought in
    'session',     -- $X per session
    'tournament',  -- $X per tournament entry
    'manual'       -- Only issued manually
  )),

  -- Rate values
  comp_value DECIMAL(6,2) NOT NULL,  -- Amount earned
  per_unit DECIMAL(10,2) DEFAULT 1,  -- Per this many units (e.g., 1 hour, $100 buyin)
  unit_label TEXT,                    -- e.g., "hour", "$100"

  -- Conditions
  min_stakes TEXT,                   -- Minimum stakes to qualify
  game_types TEXT[],                 -- Qualifying game types
  min_session_hours DECIMAL(4,2),    -- Minimum session length

  -- Multipliers
  weekday_multiplier DECIMAL(3,2) DEFAULT 1.0,
  weekend_multiplier DECIMAL(3,2) DEFAULT 1.0,
  happy_hour_multiplier DECIMAL(3,2) DEFAULT 1.0,
  vip_multiplier DECIMAL(3,2) DEFAULT 1.0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_rates_venue ON captain_comp_rates(venue_id, is_active);

-- ===================
-- TABLE 2: captain_comp_balances
-- ===================
-- Current comp balance per player per venue

CREATE TABLE IF NOT EXISTS captain_comp_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Balance
  current_balance DECIMAL(10,2) DEFAULT 0,
  lifetime_earned DECIMAL(12,2) DEFAULT 0,
  lifetime_redeemed DECIMAL(12,2) DEFAULT 0,
  lifetime_expired DECIMAL(10,2) DEFAULT 0,
  lifetime_adjusted DECIMAL(10,2) DEFAULT 0,

  -- Last activity
  last_earned_at TIMESTAMPTZ,
  last_redeemed_at TIMESTAMPTZ,

  -- Status
  is_frozen BOOLEAN DEFAULT false,
  frozen_reason TEXT,
  frozen_at TIMESTAMPTZ,
  frozen_by UUID REFERENCES captain_staff(id),

  -- Metadata
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_balances_venue ON captain_comp_balances(venue_id);
CREATE INDEX IF NOT EXISTS idx_comp_balances_player ON captain_comp_balances(player_id);
CREATE INDEX IF NOT EXISTS idx_comp_balances_balance ON captain_comp_balances(venue_id, current_balance DESC);

-- ===================
-- TABLE 3: captain_comp_transactions
-- ===================
-- All comp transactions (earn, redeem, adjust, expire)

CREATE TABLE IF NOT EXISTS captain_comp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  balance_id UUID REFERENCES captain_comp_balances(id) ON DELETE CASCADE,

  -- Transaction type
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'earn',       -- Earned from play
    'redeem',     -- Used for something
    'adjust',     -- Manual adjustment (+/-)
    'expire',     -- Expired comps
    'transfer',   -- Transfer between players
    'bonus'       -- Bonus comp award
  )),

  -- Amount
  amount DECIMAL(10,2) NOT NULL,     -- Positive for earn/bonus, negative for redeem/expire
  balance_before DECIMAL(10,2),
  balance_after DECIMAL(10,2),

  -- Source details
  source_type TEXT,                  -- 'session', 'tournament', 'manual', etc.
  source_id UUID,                    -- Reference to session/tournament/etc.
  rate_id UUID REFERENCES captain_comp_rates(id),

  -- Calculation details (for earned comps)
  hours_played DECIMAL(6,2),
  buyin_amount INTEGER,
  multiplier DECIMAL(3,2) DEFAULT 1.0,
  base_amount DECIMAL(10,2),

  -- Approval
  approved_by UUID REFERENCES captain_staff(id),
  approval_notes TEXT,

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_transactions_balance ON captain_comp_transactions(balance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_transactions_player ON captain_comp_transactions(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_transactions_venue ON captain_comp_transactions(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_transactions_type ON captain_comp_transactions(transaction_type, created_at DESC);

-- ===================
-- TABLE 4: captain_comp_redemptions
-- ===================
-- Track comp redemptions (what they used comps for)

CREATE TABLE IF NOT EXISTS captain_comp_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES captain_comp_transactions(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Redemption details
  redemption_type TEXT NOT NULL CHECK (redemption_type IN (
    'food',          -- Food/beverage
    'merchandise',   -- Gift shop items
    'tournament',    -- Tournament entry
    'cash',          -- Cash out comps
    'hotel',         -- Hotel room
    'other'          -- Other
  )),

  -- Amount
  comp_amount DECIMAL(10,2) NOT NULL,
  cash_value DECIMAL(10,2),

  -- Details
  description TEXT,
  item_details JSONB,  -- What was purchased/redeemed

  -- Processing
  processed_by UUID REFERENCES captain_staff(id),
  processed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'denied', 'voided')),

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_redemptions_venue ON captain_comp_redemptions(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_comp_redemptions_player ON captain_comp_redemptions(player_id);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_comp_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_comp_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_comp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_comp_redemptions ENABLE ROW LEVEL SECURITY;

-- Comp rates: Staff can manage, public can view active
CREATE POLICY comp_rates_select ON captain_comp_rates
  FOR SELECT USING (
    is_active = true OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY comp_rates_insert ON captain_comp_rates
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

CREATE POLICY comp_rates_update ON captain_comp_rates
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Comp balances: Players see their own, staff see venue balances
CREATE POLICY comp_balances_select ON captain_comp_balances
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Comp transactions: Players see their own, staff see venue transactions
CREATE POLICY comp_transactions_select ON captain_comp_transactions
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY comp_transactions_insert ON captain_comp_transactions
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Redemptions: Players see their own, staff see venue redemptions
CREATE POLICY comp_redemptions_select ON captain_comp_redemptions
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY comp_redemptions_insert ON captain_comp_redemptions
  FOR INSERT WITH CHECK (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- ===================
-- FUNCTIONS
-- ===================

-- Function to calculate comps from a completed session
CREATE OR REPLACE FUNCTION calculate_session_comps(
  p_session_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_session RECORD;
  v_rate RECORD;
  v_comp_amount DECIMAL(10,2) := 0;
  v_hours_played DECIMAL(6,2);
  v_multiplier DECIMAL(3,2) := 1.0;
  v_is_weekend BOOLEAN;
  v_balance_id UUID;
BEGIN
  -- Get session details
  SELECT * INTO v_session
  FROM captain_player_sessions
  WHERE id = p_session_id AND status = 'completed' AND player_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Get active hourly rate for venue
  SELECT * INTO v_rate
  FROM captain_comp_rates
  WHERE venue_id = v_session.venue_id
    AND is_active = true
    AND rate_type = 'hourly'
  ORDER BY is_default DESC, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Calculate hours
  v_hours_played := COALESCE(v_session.total_time_minutes, 0) / 60.0;

  -- Check minimum session hours
  IF v_rate.min_session_hours IS NOT NULL AND v_hours_played < v_rate.min_session_hours THEN
    RETURN 0;
  END IF;

  -- Calculate weekend multiplier
  v_is_weekend := EXTRACT(DOW FROM v_session.check_in_time) IN (0, 6);
  IF v_is_weekend THEN
    v_multiplier := v_rate.weekend_multiplier;
  ELSE
    v_multiplier := v_rate.weekday_multiplier;
  END IF;

  -- Calculate comp amount
  v_comp_amount := (v_hours_played / v_rate.per_unit) * v_rate.comp_value * v_multiplier;

  -- Round to 2 decimal places
  v_comp_amount := ROUND(v_comp_amount, 2);

  IF v_comp_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- Get or create balance record
  INSERT INTO captain_comp_balances (venue_id, player_id)
  VALUES (v_session.venue_id, v_session.player_id)
  ON CONFLICT (venue_id, player_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_balance_id;

  -- Update balance
  UPDATE captain_comp_balances
  SET
    current_balance = current_balance + v_comp_amount,
    lifetime_earned = lifetime_earned + v_comp_amount,
    last_earned_at = now(),
    updated_at = now()
  WHERE id = v_balance_id;

  -- Create transaction record
  INSERT INTO captain_comp_transactions (
    venue_id,
    player_id,
    balance_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    source_type,
    source_id,
    rate_id,
    hours_played,
    multiplier,
    base_amount,
    description
  )
  SELECT
    v_session.venue_id,
    v_session.player_id,
    v_balance_id,
    'earn',
    v_comp_amount,
    current_balance - v_comp_amount,
    current_balance,
    'session',
    p_session_id,
    v_rate.id,
    v_hours_played,
    v_multiplier,
    v_rate.comp_value,
    format('Earned from %s hours of play', round(v_hours_played, 1))
  FROM captain_comp_balances WHERE id = v_balance_id;

  RETURN v_comp_amount;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate comps when session completes
CREATE OR REPLACE FUNCTION auto_calculate_session_comps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.player_id IS NOT NULL AND
     (OLD.status IS NULL OR OLD.status != 'completed') THEN
    PERFORM calculate_session_comps(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_comps_trigger ON captain_player_sessions;
CREATE TRIGGER session_comps_trigger
AFTER UPDATE ON captain_player_sessions
FOR EACH ROW
WHEN (NEW.status = 'completed' AND NEW.player_id IS NOT NULL)
EXECUTE FUNCTION auto_calculate_session_comps();

-- Function to issue manual comps
CREATE OR REPLACE FUNCTION issue_manual_comp(
  p_venue_id INTEGER,
  p_player_id UUID,
  p_amount DECIMAL,
  p_description TEXT,
  p_staff_id UUID
) RETURNS UUID AS $$
DECLARE
  v_balance_id UUID;
  v_transaction_id UUID;
BEGIN
  -- Get or create balance
  INSERT INTO captain_comp_balances (venue_id, player_id)
  VALUES (p_venue_id, p_player_id)
  ON CONFLICT (venue_id, player_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_balance_id;

  -- Update balance
  UPDATE captain_comp_balances
  SET
    current_balance = current_balance + p_amount,
    lifetime_earned = CASE WHEN p_amount > 0 THEN lifetime_earned + p_amount ELSE lifetime_earned END,
    lifetime_adjusted = lifetime_adjusted + p_amount,
    last_earned_at = CASE WHEN p_amount > 0 THEN now() ELSE last_earned_at END,
    updated_at = now()
  WHERE id = v_balance_id;

  -- Create transaction
  INSERT INTO captain_comp_transactions (
    venue_id,
    player_id,
    balance_id,
    transaction_type,
    amount,
    source_type,
    approved_by,
    description
  )
  VALUES (
    p_venue_id,
    p_player_id,
    v_balance_id,
    CASE WHEN p_amount >= 0 THEN 'bonus' ELSE 'adjust' END,
    p_amount,
    'manual',
    p_staff_id,
    p_description
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Function to redeem comps
CREATE OR REPLACE FUNCTION redeem_comps(
  p_venue_id INTEGER,
  p_player_id UUID,
  p_amount DECIMAL,
  p_redemption_type TEXT,
  p_description TEXT,
  p_staff_id UUID
) RETURNS UUID AS $$
DECLARE
  v_balance RECORD;
  v_transaction_id UUID;
  v_redemption_id UUID;
BEGIN
  -- Get balance
  SELECT * INTO v_balance
  FROM captain_comp_balances
  WHERE venue_id = p_venue_id AND player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No comp balance found for this player';
  END IF;

  IF v_balance.is_frozen THEN
    RAISE EXCEPTION 'Comp balance is frozen';
  END IF;

  IF v_balance.current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient comp balance. Available: %', v_balance.current_balance;
  END IF;

  -- Update balance
  UPDATE captain_comp_balances
  SET
    current_balance = current_balance - p_amount,
    lifetime_redeemed = lifetime_redeemed + p_amount,
    last_redeemed_at = now(),
    updated_at = now()
  WHERE id = v_balance.id;

  -- Create transaction
  INSERT INTO captain_comp_transactions (
    venue_id,
    player_id,
    balance_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    source_type,
    approved_by,
    description
  )
  VALUES (
    p_venue_id,
    p_player_id,
    v_balance.id,
    'redeem',
    -p_amount,
    v_balance.current_balance,
    v_balance.current_balance - p_amount,
    'redemption',
    p_staff_id,
    p_description
  )
  RETURNING id INTO v_transaction_id;

  -- Create redemption record
  INSERT INTO captain_comp_redemptions (
    transaction_id,
    venue_id,
    player_id,
    redemption_type,
    comp_amount,
    description,
    processed_by,
    processed_at,
    status
  )
  VALUES (
    v_transaction_id,
    p_venue_id,
    p_player_id,
    p_redemption_type,
    p_amount,
    p_description,
    p_staff_id,
    now(),
    'completed'
  )
  RETURNING id INTO v_redemption_id;

  RETURN v_redemption_id;
END;
$$ LANGUAGE plpgsql;
-- =====================================================
-- SMARTER CAPTAIN - PHASE 6 DATABASE MIGRATION
-- =====================================================
-- Tables: 4 (Audit Logs, Rate Limits, System Health, Admin)
-- Phase: Scale & Polish
-- =====================================================

-- ===================
-- TABLE 1: captain_audit_logs
-- ===================
-- Complete audit trail for all actions

CREATE TABLE IF NOT EXISTS captain_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE SET NULL,

  -- Actor
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES captain_staff(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'staff', 'system', 'api')),
  actor_name TEXT,

  -- Action
  action TEXT NOT NULL,
  action_category TEXT NOT NULL CHECK (action_category IN (
    'auth', 'waitlist', 'game', 'table', 'tournament', 'player',
    'promotion', 'comp', 'settings', 'staff', 'export', 'admin'
  )),

  -- Target
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,

  -- Details
  changes JSONB,  -- {field: {old: x, new: y}}
  metadata JSONB DEFAULT '{}',

  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,

  -- Result
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failure', 'warning')),
  error_message TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_venue ON captain_audit_logs(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON captain_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON captain_audit_logs(action_category, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON captain_audit_logs(created_at DESC);

-- Partition by month for performance (optional - implement if needed)
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_month ON captain_audit_logs(date_trunc('month', created_at));

-- ===================
-- TABLE 2: captain_rate_limits
-- ===================
-- Track API rate limiting per user/IP

CREATE TABLE IF NOT EXISTS captain_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifier
  identifier TEXT NOT NULL,  -- user_id, ip_address, or api_key
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('user', 'ip', 'api_key', 'venue')),

  -- Endpoint
  endpoint TEXT NOT NULL,  -- e.g., '/api/captain/waitlist'

  -- Counts
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT now(),
  window_minutes INTEGER DEFAULT 1,

  -- Limits
  max_requests INTEGER DEFAULT 60,
  is_blocked BOOLEAN DEFAULT false,
  blocked_until TIMESTAMPTZ,
  block_reason TEXT,

  -- Metadata
  last_request_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(identifier, identifier_type, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON captain_rate_limits(identifier, identifier_type);
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked ON captain_rate_limits(is_blocked, blocked_until);

-- ===================
-- TABLE 3: captain_system_health
-- ===================
-- System health metrics for monitoring

CREATE TABLE IF NOT EXISTS captain_system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Metrics
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'api_latency', 'db_latency', 'realtime_lag', 'error_rate',
    'active_connections', 'queue_depth', 'memory_usage'
  )),
  metric_value DECIMAL(12,4) NOT NULL,
  metric_unit TEXT,

  -- Context
  endpoint TEXT,
  details JSONB,

  -- Timestamp
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_health_venue ON captain_system_health(venue_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_type ON captain_system_health(metric_type, recorded_at DESC);

-- Auto-cleanup old health metrics (keep 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_health_metrics()
RETURNS void AS $$
BEGIN
  DELETE FROM captain_system_health
  WHERE recorded_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ===================
-- TABLE 4: captain_admin_settings
-- ===================
-- Platform-wide admin settings

CREATE TABLE IF NOT EXISTS captain_admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  scope TEXT NOT NULL CHECK (scope IN ('global', 'venue', 'user')),
  scope_id TEXT,  -- venue_id or user_id if scoped

  -- Setting
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  setting_type TEXT DEFAULT 'json' CHECK (setting_type IN ('string', 'number', 'boolean', 'json', 'array')),

  -- Description
  description TEXT,
  is_sensitive BOOLEAN DEFAULT false,

  -- Metadata
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(scope, scope_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_settings_scope ON captain_admin_settings(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON captain_admin_settings(setting_key);

-- ===================
-- TABLE 5: captain_export_jobs
-- ===================
-- Track data export requests

CREATE TABLE IF NOT EXISTS captain_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Requester
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Export config
  export_type TEXT NOT NULL CHECK (export_type IN (
    'players', 'sessions', 'waitlist', 'tournaments', 'analytics',
    'promotions', 'comps', 'audit_logs', 'full_backup'
  )),
  date_from DATE,
  date_to DATE,
  filters JSONB DEFAULT '{}',
  format TEXT DEFAULT 'csv' CHECK (format IN ('csv', 'json', 'xlsx')),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
  progress INTEGER DEFAULT 0,  -- 0-100

  -- Result
  file_url TEXT,
  file_size INTEGER,
  row_count INTEGER,
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_venue ON captain_export_jobs(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_user ON captain_export_jobs(requested_by, created_at DESC);

-- ===================
-- TABLE 6: captain_api_keys
-- ===================
-- API keys for external integrations

CREATE TABLE IF NOT EXISTS captain_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Key details
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,  -- SHA-256 hash of the key
  key_prefix TEXT NOT NULL,  -- First 8 chars for identification

  -- Permissions
  permissions TEXT[] DEFAULT '{}',  -- ['read:waitlist', 'write:games', etc.]

  -- Limits
  rate_limit INTEGER DEFAULT 1000,  -- requests per hour
  allowed_ips TEXT[],  -- IP whitelist (empty = any)

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_venue ON captain_api_keys(venue_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON captain_api_keys(key_prefix);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_system_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_api_keys ENABLE ROW LEVEL SECURITY;

-- Audit logs: Staff managers+ can view their venue's logs
CREATE POLICY audit_logs_select ON captain_audit_logs
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Rate limits: System only (via service role)
-- No user policies needed

-- System health: Managers can view their venue
CREATE POLICY system_health_select ON captain_system_health
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Admin settings: Based on scope
CREATE POLICY admin_settings_select ON captain_admin_settings
  FOR SELECT USING (
    scope = 'global' OR
    (scope = 'venue' AND scope_id IN (SELECT venue_id::text FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)) OR
    (scope = 'user' AND scope_id = auth.uid()::text)
  );

CREATE POLICY admin_settings_update ON captain_admin_settings
  FOR UPDATE USING (
    (scope = 'venue' AND scope_id IN (SELECT venue_id::text FROM captain_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)) OR
    (scope = 'user' AND scope_id = auth.uid()::text)
  );

-- Export jobs: Users can view their own, staff can view venue exports
CREATE POLICY export_jobs_select ON captain_export_jobs
  FOR SELECT USING (
    requested_by = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

CREATE POLICY export_jobs_insert ON captain_export_jobs
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- API keys: Owners only
CREATE POLICY api_keys_select ON captain_api_keys
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)
  );

CREATE POLICY api_keys_insert ON captain_api_keys
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)
  );

CREATE POLICY api_keys_update ON captain_api_keys
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)
  );

CREATE POLICY api_keys_delete ON captain_api_keys
  FOR DELETE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)
  );

-- ===================
-- FUNCTIONS
-- ===================

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
  p_venue_id INTEGER,
  p_user_id UUID,
  p_staff_id UUID,
  p_actor_type TEXT,
  p_action TEXT,
  p_action_category TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_changes JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO captain_audit_logs (
    venue_id, user_id, staff_id, actor_type,
    action, action_category,
    target_type, target_id, changes, metadata
  ) VALUES (
    p_venue_id, p_user_id, p_staff_id, p_actor_type,
    p_action, p_action_category,
    p_target_type, p_target_id, p_changes, p_metadata
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_identifier_type TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 60,
  p_window_minutes INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_record RECORD;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := now() - (p_window_minutes || ' minutes')::INTERVAL;

  -- Get or create rate limit record
  SELECT * INTO v_record
  FROM captain_rate_limits
  WHERE identifier = p_identifier
    AND identifier_type = p_identifier_type
    AND endpoint = p_endpoint
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Create new record
    INSERT INTO captain_rate_limits (
      identifier, identifier_type, endpoint,
      request_count, window_start, window_minutes, max_requests
    ) VALUES (
      p_identifier, p_identifier_type, p_endpoint,
      1, now(), p_window_minutes, p_max_requests
    );
    RETURN true;
  END IF;

  -- Check if blocked
  IF v_record.is_blocked AND v_record.blocked_until > now() THEN
    RETURN false;
  END IF;

  -- Check if window expired
  IF v_record.window_start < v_window_start THEN
    -- Reset window
    UPDATE captain_rate_limits
    SET request_count = 1, window_start = now(), is_blocked = false, blocked_until = NULL
    WHERE id = v_record.id;
    RETURN true;
  END IF;

  -- Check if over limit
  IF v_record.request_count >= p_max_requests THEN
    -- Block for window duration
    UPDATE captain_rate_limits
    SET is_blocked = true, blocked_until = now() + (p_window_minutes || ' minutes')::INTERVAL
    WHERE id = v_record.id;
    RETURN false;
  END IF;

  -- Increment counter
  UPDATE captain_rate_limits
  SET request_count = request_count + 1, last_request_at = now()
  WHERE id = v_record.id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to record system health metric
CREATE OR REPLACE FUNCTION record_health_metric(
  p_venue_id INTEGER,
  p_metric_type TEXT,
  p_metric_value DECIMAL,
  p_metric_unit TEXT DEFAULT NULL,
  p_endpoint TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO captain_system_health (
    venue_id, metric_type, metric_value, metric_unit, endpoint, details
  ) VALUES (
    p_venue_id, p_metric_type, p_metric_value, p_metric_unit, p_endpoint, p_details
  );
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- Clean old rate limit records (older than 1 day)
  DELETE FROM captain_rate_limits
  WHERE last_request_at < now() - INTERVAL '1 day';

  -- Clean old health metrics (older than 7 days)
  DELETE FROM captain_system_health
  WHERE recorded_at < now() - INTERVAL '7 days';

  -- Mark expired exports
  UPDATE captain_export_jobs
  SET status = 'expired'
  WHERE status = 'completed'
    AND expires_at < now();

  -- Clean old audit logs (keep 90 days by default)
  -- Uncomment if needed:
  -- DELETE FROM captain_audit_logs
  -- WHERE created_at < now() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Insert default global settings
INSERT INTO captain_admin_settings (scope, setting_key, setting_value, description)
VALUES
  ('global', 'rate_limit_default', '{"requests": 60, "window_minutes": 1}', 'Default API rate limit'),
  ('global', 'export_retention_days', '7', 'Days to keep export files'),
  ('global', 'audit_retention_days', '90', 'Days to keep audit logs'),
  ('global', 'session_timeout_minutes', '480', 'Max session duration before auto-checkout'),
  ('global', 'waitlist_max_entries', '50', 'Max waitlist entries per player per venue'),
  ('global', 'notification_cooldown_minutes', '5', 'Min time between notifications to same player')
ON CONFLICT (scope, scope_id, setting_key) DO NOTHING;
-- =====================================================
-- SMARTER CAPTAIN - REMAINING TABLES
-- =====================================================
-- Tables needed for full feature completion
-- Run this in Supabase SQL Editor
-- =====================================================

-- ===================
-- WAITLIST GROUPS (Squads)
-- ===================

CREATE TABLE IF NOT EXISTS captain_waitlist_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID REFERENCES profiles(id),
  venue_id INTEGER REFERENCES poker_venues(id),
  game_type TEXT,
  stakes TEXT,
  prefer_same_table BOOLEAN DEFAULT true,
  accept_split BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS captain_waitlist_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES captain_waitlist_groups(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_groups_venue ON captain_waitlist_groups(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_groups_leader ON captain_waitlist_groups(leader_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_group_members_group ON captain_waitlist_group_members(group_id);

-- ===================
-- DEALER MANAGEMENT
-- ===================

CREATE TABLE IF NOT EXISTS captain_dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  user_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  employee_id TEXT,
  phone TEXT,
  email TEXT,
  skill_level INTEGER DEFAULT 3 CHECK (skill_level >= 1 AND skill_level <= 5),
  certified_games TEXT[] DEFAULT '{"nlhe"}',
  hourly_rate DECIMAL(10,2),
  notes TEXT,
  status TEXT DEFAULT 'active',
  hired_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS captain_dealer_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  dealer_id UUID REFERENCES captain_dealers(id) ON DELETE CASCADE,
  table_id UUID REFERENCES captain_tables(id),
  game_id UUID REFERENCES captain_games(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  tips_reported DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dealers_venue ON captain_dealers(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_dealers_user ON captain_dealers(user_id);
CREATE INDEX IF NOT EXISTS idx_dealer_rotations_venue ON captain_dealer_rotations(venue_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dealer_rotations_dealer ON captain_dealer_rotations(dealer_id, started_at DESC);

-- ===================
-- INCIDENTS
-- ===================

CREATE TABLE IF NOT EXISTS captain_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  reported_by UUID REFERENCES captain_staff(id),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  players_involved UUID[],
  player_id UUID REFERENCES profiles(id),
  table_id UUID REFERENCES captain_tables(id),
  description TEXT NOT NULL,
  action_taken TEXT,
  resolution TEXT,
  resolved_by UUID REFERENCES captain_staff(id),
  attachments TEXT[],
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_venue ON captain_incidents(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON captain_incidents(venue_id, status);

-- ===================
-- HOME GAME REVIEWS
-- ===================

CREATE TABLE IF NOT EXISTS captain_home_game_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES captain_home_games(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  game_quality INTEGER CHECK (game_quality >= 1 AND game_quality <= 5),
  host_rating INTEGER CHECK (host_rating >= 1 AND host_rating <= 5),
  location_rating INTEGER CHECK (location_rating >= 1 AND location_rating <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(game_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_home_game_reviews_game ON captain_home_game_reviews(game_id);
CREATE INDEX IF NOT EXISTS idx_home_game_reviews_reviewer ON captain_home_game_reviews(reviewer_id);

-- ===================
-- ESCROW TRANSACTIONS
-- ===================

CREATE TABLE IF NOT EXISTS captain_escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_game_id UUID REFERENCES captain_home_games(id),
  player_id UUID REFERENCES profiles(id),
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_method TEXT,
  payment_reference TEXT,
  held_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_to UUID REFERENCES profiles(id),
  refunded_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escrow_status ON captain_escrow_transactions(status);
CREATE INDEX IF NOT EXISTS idx_escrow_game ON captain_escrow_transactions(home_game_id);
CREATE INDEX IF NOT EXISTS idx_escrow_player ON captain_escrow_transactions(player_id);

-- ===================
-- DEALER MARKETPLACE
-- ===================

CREATE TABLE IF NOT EXISTS captain_dealer_marketplace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  service_area TEXT[],
  hourly_rate DECIMAL(10,2),
  games_offered TEXT[],
  experience_years INTEGER,
  bio TEXT,
  rating DECIMAL(3,2),
  review_count INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  available_days INTEGER[],
  availability_notes TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_area ON captain_dealer_marketplace USING GIN (service_area);
CREATE INDEX IF NOT EXISTS idx_marketplace_games ON captain_dealer_marketplace USING GIN (games_offered);
CREATE INDEX IF NOT EXISTS idx_marketplace_status ON captain_dealer_marketplace(status, verified);

-- ===================
-- EQUIPMENT RENTALS
-- ===================

CREATE TABLE IF NOT EXISTS captain_equipment_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  daily_rate DECIMAL(10,2),
  weekly_rate DECIMAL(10,2),
  service_area TEXT[],
  images TEXT[],
  available BOOLEAN DEFAULT true,
  deposit_required DECIMAL(10,2),
  contact_info JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_category ON captain_equipment_rentals(category, available);
CREATE INDEX IF NOT EXISTS idx_equipment_area ON captain_equipment_rentals USING GIN (service_area);

-- ===================
-- AI FEATURES
-- ===================

CREATE TABLE IF NOT EXISTS captain_wait_time_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  game_type TEXT NOT NULL,
  stakes TEXT NOT NULL,
  hour_of_day INTEGER,
  day_of_week INTEGER,
  predicted_minutes INTEGER,
  actual_minutes INTEGER,
  confidence DECIMAL(3,2),
  model_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS captain_player_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id),
  venue_id INTEGER REFERENCES poker_venues(id),
  recommendation_type TEXT,
  recommendation_data JSONB,
  was_followed BOOLEAN,
  feedback_rating INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wait_predictions_venue ON captain_wait_time_predictions(venue_id, game_type, stakes);
CREATE INDEX IF NOT EXISTS idx_recommendations_player ON captain_player_recommendations(player_id, created_at DESC);

-- ===================
-- STREAMING & HAND HISTORY
-- ===================

CREATE TABLE IF NOT EXISTS captain_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  table_id UUID REFERENCES captain_tables(id),
  stream_name TEXT,
  platforms TEXT[],
  stream_keys JSONB,
  delay_minutes INTEGER DEFAULT 15,
  overlay_config JSONB,
  status TEXT DEFAULT 'offline',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  viewer_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS captain_hand_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  table_id UUID REFERENCES captain_tables(id),
  game_id UUID REFERENCES captain_games(id),
  hand_number INTEGER,
  player_cards JSONB,
  board TEXT[],
  actions JSONB,
  pot_size INTEGER,
  winners JSONB,
  rfid_captured BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_streams_venue ON captain_streams(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_streams_table ON captain_streams(table_id);
CREATE INDEX IF NOT EXISTS idx_hand_history_game ON captain_hand_history(game_id, hand_number);
CREATE INDEX IF NOT EXISTS idx_hand_history_venue ON captain_hand_history(venue_id, created_at DESC);

-- ===================
-- FINANCIAL & TAX
-- ===================

CREATE TABLE IF NOT EXISTS captain_tax_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),
  event_type TEXT NOT NULL,
  event_date DATE DEFAULT CURRENT_DATE,
  gross_amount DECIMAL(12,2) NOT NULL,
  buy_in DECIMAL(12,2),
  net_amount DECIMAL(12,2),
  withholding_required BOOLEAN DEFAULT false,
  withholding_amount DECIMAL(12,2),
  withholding_rate DECIMAL(5,4),
  w2g_generated BOOLEAN DEFAULT false,
  w2g_document_url TEXT,
  player_ssn_last4 TEXT,
  player_acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_events_venue ON captain_tax_events(venue_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_tax_events_player ON captain_tax_events(player_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_tax_events_w2g ON captain_tax_events(w2g_generated, event_date);

-- ===================
-- RESPONSIBLE GAMING
-- ===================

CREATE TABLE IF NOT EXISTS captain_self_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id),
  exclusion_type TEXT NOT NULL,
  duration_days INTEGER,
  scope TEXT NOT NULL DEFAULT 'venue',
  venue_id INTEGER REFERENCES poker_venues(id),
  reason TEXT,
  allow_early_removal BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  lifted_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS captain_spending_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) UNIQUE,
  daily_limit DECIMAL(10,2),
  weekly_limit DECIMAL(10,2),
  monthly_limit DECIMAL(10,2),
  session_duration_limit INTEGER,
  loss_limit DECIMAL(10,2),
  cooling_off_enabled BOOLEAN DEFAULT false,
  cooling_off_minutes INTEGER DEFAULT 30,
  alerts_enabled BOOLEAN DEFAULT true,
  alert_at_percentage INTEGER DEFAULT 80,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exclusions_player ON captain_self_exclusions(player_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_exclusions_venue ON captain_self_exclusions(venue_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_spending_limits_player ON captain_spending_limits(player_id);

-- ===================
-- NETWORK FEATURES (LEAGUES)
-- ===================

CREATE TABLE IF NOT EXISTS captain_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  organizer_id UUID REFERENCES profiles(id),
  venues INTEGER[],
  season_start DATE,
  season_end DATE,
  scoring_system JSONB,
  prize_pool DECIMAL(12,2),
  entry_fee DECIMAL(10,2),
  max_players INTEGER,
  rules TEXT,
  status TEXT DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS captain_league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES captain_leagues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  rank INTEGER,
  points INTEGER DEFAULT 0,
  events_played INTEGER DEFAULT 0,
  cashes INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  final_tables INTEGER DEFAULT 0,
  earnings DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_leagues_status ON captain_leagues(status, season_start);
CREATE INDEX IF NOT EXISTS idx_leagues_organizer ON captain_leagues(organizer_id);
CREATE INDEX IF NOT EXISTS idx_league_standings_league ON captain_league_standings(league_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_league_standings_player ON captain_league_standings(player_id);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_waitlist_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_waitlist_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_dealer_rotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_game_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_escrow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_dealer_marketplace ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_equipment_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_wait_time_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_player_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_hand_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_tax_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_self_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_spending_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_league_standings ENABLE ROW LEVEL SECURITY;

-- Dealers: Staff can manage
CREATE POLICY dealers_staff_access ON captain_dealers
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Dealer rotations: Staff can manage
CREATE POLICY rotations_staff_access ON captain_dealer_rotations
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Incidents: Staff can manage
CREATE POLICY incidents_staff_access ON captain_incidents
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Home game reviews: Reviewers and hosts can see
CREATE POLICY reviews_access ON captain_home_game_reviews
  FOR SELECT USING (
    reviewer_id = auth.uid() OR
    game_id IN (SELECT id FROM captain_home_games WHERE host_id = auth.uid())
  );

CREATE POLICY reviews_insert ON captain_home_game_reviews
  FOR INSERT WITH CHECK (reviewer_id = auth.uid());

-- Self exclusions: Players manage their own
CREATE POLICY exclusions_player_access ON captain_self_exclusions
  FOR ALL USING (player_id = auth.uid());

-- Spending limits: Players manage their own
CREATE POLICY limits_player_access ON captain_spending_limits
  FOR ALL USING (player_id = auth.uid());

-- Leagues: Public read for active leagues
CREATE POLICY leagues_public_read ON captain_leagues
  FOR SELECT USING (status IN ('upcoming', 'active', 'completed'));

CREATE POLICY leagues_organizer_manage ON captain_leagues
  FOR ALL USING (organizer_id = auth.uid());

-- League standings: Public read
CREATE POLICY standings_public_read ON captain_league_standings
  FOR SELECT USING (true);

-- Marketplace: Public read for active listings
CREATE POLICY marketplace_public_read ON captain_dealer_marketplace
  FOR SELECT USING (status = 'active');

CREATE POLICY marketplace_dealer_manage ON captain_dealer_marketplace
  FOR ALL USING (dealer_id = auth.uid());

-- Equipment: Public read for available
CREATE POLICY equipment_public_read ON captain_equipment_rentals
  FOR SELECT USING (available = true);

-- Streams: Staff can manage
CREATE POLICY streams_staff_access ON captain_streams
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Hand history: Staff can view
CREATE POLICY hand_history_staff_access ON captain_hand_history
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Tax events: Staff and player can view
CREATE POLICY tax_events_access ON captain_tax_events
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Waitlist groups: Players and staff can view
CREATE POLICY waitlist_groups_access ON captain_waitlist_groups
  FOR SELECT USING (
    leader_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY waitlist_groups_create ON captain_waitlist_groups
  FOR INSERT WITH CHECK (leader_id = auth.uid());

-- AI predictions: Staff can view
CREATE POLICY predictions_staff_access ON captain_wait_time_predictions
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Recommendations: Players see their own
CREATE POLICY recommendations_player_access ON captain_player_recommendations
  FOR SELECT USING (player_id = auth.uid());

-- Escrow: Players and hosts can view
CREATE POLICY escrow_access ON captain_escrow_transactions
  FOR SELECT USING (
    player_id = auth.uid() OR
    home_game_id IN (SELECT id FROM captain_home_games WHERE host_id = auth.uid())
  );

-- =====================================================
-- SCHEMA VERSION
-- =====================================================

COMMENT ON TABLE captain_dealers IS 'Smarter Captain - Dealer roster and management';
COMMENT ON TABLE captain_incidents IS 'Smarter Captain - Incident reports and tracking';
COMMENT ON TABLE captain_leagues IS 'Smarter Captain - League/circuit management';
COMMENT ON TABLE captain_self_exclusions IS 'Smarter Captain - Responsible gaming self-exclusions';
-- =====================================================
-- SMARTER CAPTAIN - SOCIAL PAGES MIGRATION
-- =====================================================
-- Tables for Club/Home Game public pages (Facebook Page-like features)
-- Posts, Photos, Reviews, Followers
-- =====================================================

-- ===================
-- TABLE 1: captain_venue_posts
-- ===================
-- Announcements/posts for venue pages

CREATE TABLE IF NOT EXISTS captain_venue_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Author (staff member)
  author_id UUID REFERENCES profiles(id),
  author_name TEXT,

  -- Content
  content TEXT NOT NULL,
  post_type TEXT DEFAULT 'announcement' CHECK (post_type IN ('announcement', 'promotion', 'event', 'update', 'photo')),

  -- Media
  image_urls TEXT[],
  video_url TEXT,

  -- Engagement
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,

  -- Visibility
  is_pinned BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_posts_venue ON captain_venue_posts(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_posts_pinned ON captain_venue_posts(venue_id, is_pinned);

-- ===================
-- TABLE 2: captain_home_posts
-- ===================
-- Announcements/posts for home game group pages

CREATE TABLE IF NOT EXISTS captain_home_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE CASCADE,

  -- Author
  author_id UUID REFERENCES profiles(id),

  -- Content
  content TEXT NOT NULL,
  post_type TEXT DEFAULT 'announcement' CHECK (post_type IN ('announcement', 'game_recap', 'photo', 'update')),

  -- Media
  image_urls TEXT[],
  video_url TEXT,

  -- Engagement
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,

  -- Visibility (private groups: members only)
  is_pinned BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  visible_to TEXT DEFAULT 'members' CHECK (visible_to IN ('public', 'members')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_posts_group ON captain_home_posts(group_id, created_at DESC);

-- ===================
-- TABLE 3: captain_venue_photos
-- ===================
-- Photo gallery for venues

CREATE TABLE IF NOT EXISTS captain_venue_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Uploader
  uploaded_by UUID REFERENCES profiles(id),

  -- Photo details
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'poker_room', 'tournament', 'winner', 'event', 'high_hand')),

  -- Display
  is_cover_photo BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,

  -- Engagement
  likes_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_photos_venue ON captain_venue_photos(venue_id, display_order);

-- ===================
-- TABLE 4: captain_venue_reviews
-- ===================
-- Player reviews for venues

CREATE TABLE IF NOT EXISTS captain_venue_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id),

  -- Rating
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  game_selection_rating INTEGER CHECK (game_selection_rating BETWEEN 1 AND 5),
  staff_rating INTEGER CHECK (staff_rating BETWEEN 1 AND 5),
  atmosphere_rating INTEGER CHECK (atmosphere_rating BETWEEN 1 AND 5),
  food_rating INTEGER CHECK (food_rating BETWEEN 1 AND 5),

  -- Review content
  title TEXT,
  content TEXT,

  -- Metadata
  visit_date DATE,
  games_played TEXT[], -- ['NLH 1/3', 'PLO 2/5']

  -- Response
  venue_response TEXT,
  venue_responded_at TIMESTAMPTZ,

  -- Moderation
  is_verified BOOLEAN DEFAULT false, -- Verified visit through check-in
  is_published BOOLEAN DEFAULT true,

  -- Engagement
  helpful_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue ON captain_venue_reviews(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_rating ON captain_venue_reviews(venue_id, overall_rating);

-- ===================
-- TABLE 5: captain_venue_followers
-- ===================
-- Users following venues for updates

CREATE TABLE IF NOT EXISTS captain_venue_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Notification preferences
  notify_posts BOOLEAN DEFAULT true,
  notify_events BOOLEAN DEFAULT true,
  notify_promotions BOOLEAN DEFAULT true,
  notify_tournaments BOOLEAN DEFAULT true,

  -- Timestamps
  followed_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_followers_venue ON captain_venue_followers(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_followers_user ON captain_venue_followers(user_id);

-- ===================
-- TABLE 6: captain_post_likes
-- ===================
-- Likes on venue/home posts

CREATE TABLE IF NOT EXISTS captain_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  post_type TEXT NOT NULL CHECK (post_type IN ('venue', 'home')),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post ON captain_post_likes(post_id);

-- ===================
-- TABLE 7: captain_post_comments
-- ===================
-- Comments on posts

CREATE TABLE IF NOT EXISTS captain_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  post_type TEXT NOT NULL CHECK (post_type IN ('venue', 'home')),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Content
  content TEXT NOT NULL,

  -- Reply threading
  parent_comment_id UUID REFERENCES captain_post_comments(id) ON DELETE CASCADE,

  -- Engagement
  likes_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON captain_post_comments(post_id, created_at);

-- ===================
-- ENABLE RLS
-- ===================

ALTER TABLE captain_venue_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_venue_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_venue_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_venue_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_post_comments ENABLE ROW LEVEL SECURITY;

-- Public read policies for venue content
CREATE POLICY "Public read venue posts" ON captain_venue_posts
  FOR SELECT USING (is_published = true);

CREATE POLICY "Public read venue photos" ON captain_venue_photos
  FOR SELECT USING (true);

CREATE POLICY "Public read venue reviews" ON captain_venue_reviews
  FOR SELECT USING (is_published = true);

CREATE POLICY "Public read venue followers count" ON captain_venue_followers
  FOR SELECT USING (true);

CREATE POLICY "Public read comments" ON captain_post_comments
  FOR SELECT USING (true);

-- Home posts visible based on group privacy
CREATE POLICY "Read home posts based on visibility" ON captain_home_posts
  FOR SELECT USING (
    is_published = true AND (
      visible_to = 'public' OR
      EXISTS (
        SELECT 1 FROM captain_home_members
        WHERE group_id = captain_home_posts.group_id
        AND user_id = auth.uid()
        AND status = 'approved'
      )
    )
  );

-- Write policies for authenticated users
CREATE POLICY "Users can like posts" ON captain_post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can comment" ON captain_post_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can review venues" ON captain_venue_reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can follow venues" ON captain_venue_followers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own likes" ON captain_post_likes
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own follows" ON captain_venue_followers
  FOR DELETE USING (auth.uid() = user_id);

-- ===================
-- UPDATE poker_venues with social fields
-- ===================

ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS about TEXT;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';

-- ===================
-- UPDATE captain_home_groups with social fields
-- ===================

ALTER TABLE captain_home_groups ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;
ALTER TABLE captain_home_groups ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE captain_home_groups ADD COLUMN IF NOT EXISTS tagline TEXT;

-- ===================
-- FUNCTIONS
-- ===================

-- Update follower count on follow/unfollow
CREATE OR REPLACE FUNCTION update_venue_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE poker_venues SET follower_count = follower_count + 1 WHERE id = NEW.venue_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE poker_venues SET follower_count = follower_count - 1 WHERE id = OLD.venue_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_venue_follower_count
  AFTER INSERT OR DELETE ON captain_venue_followers
  FOR EACH ROW EXECUTE FUNCTION update_venue_follower_count();

-- Update post like counts
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_type = 'venue' THEN
      UPDATE captain_venue_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE captain_home_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_type = 'venue' THEN
      UPDATE captain_venue_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
    ELSE
      UPDATE captain_home_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_post_likes_count
  AFTER INSERT OR DELETE ON captain_post_likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

-- Update post comment counts
CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_comment_id IS NULL THEN
    IF NEW.post_type = 'venue' THEN
      UPDATE captain_venue_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE captain_home_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_comment_id IS NULL THEN
    IF OLD.post_type = 'venue' THEN
      UPDATE captain_venue_posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
    ELSE
      UPDATE captain_home_posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_post_comments_count
  AFTER INSERT OR DELETE ON captain_post_comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comments_count();
