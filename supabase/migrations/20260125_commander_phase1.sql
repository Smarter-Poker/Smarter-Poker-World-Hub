-- =====================================================
-- CLUB COMMANDER - PHASE 1 DATABASE MIGRATION
-- =====================================================
-- Tables: 7 (as specified in SCOPE_LOCK.md)
-- Source: DATABASE_SCHEMA.sql
-- =====================================================

-- ===================
-- VENUE EXTENSION
-- ===================

-- Extends existing poker_venues table for Commander
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS commander_enabled BOOLEAN DEFAULT false;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS commander_tier TEXT DEFAULT 'free';
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS commander_activated_at TIMESTAMPTZ;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'time';
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS accepts_home_games BOOLEAN DEFAULT false;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS auto_text_enabled BOOLEAN DEFAULT true;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS waitlist_settings JSONB DEFAULT '{}';
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS tournament_settings JSONB DEFAULT '{}';
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS staff_pin_required BOOLEAN DEFAULT true;
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS primary_contact_id UUID REFERENCES profiles(id);

-- ===================
-- TABLE 1: commander_staff
-- ===================

CREATE TABLE IF NOT EXISTS commander_staff (
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

-- Indexes for commander_staff
CREATE INDEX IF NOT EXISTS idx_commander_staff_venue ON commander_staff(venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_staff_user ON commander_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_commander_staff_active ON commander_staff(venue_id, is_active);

-- ===================
-- TABLE 2: commander_tables
-- ===================

CREATE TABLE IF NOT EXISTS commander_tables (
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

-- Indexes for commander_tables
CREATE INDEX IF NOT EXISTS idx_commander_tables_venue ON commander_tables(venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_tables_status ON commander_tables(venue_id, status);

-- ===================
-- TABLE 3: commander_games
-- ===================

CREATE TABLE IF NOT EXISTS commander_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  table_id UUID REFERENCES commander_tables(id),
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
  parent_game_id UUID REFERENCES commander_games(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for commander_games
CREATE INDEX IF NOT EXISTS idx_commander_games_venue_status ON commander_games(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_commander_games_table ON commander_games(table_id);
CREATE INDEX IF NOT EXISTS idx_commander_games_type_stakes ON commander_games(venue_id, game_type, stakes);

-- Update commander_tables foreign key
ALTER TABLE commander_tables
  ADD CONSTRAINT fk_commander_tables_current_game
  FOREIGN KEY (current_game_id) REFERENCES commander_games(id) ON DELETE SET NULL;

-- ===================
-- TABLE 4: commander_waitlist
-- ===================

CREATE TABLE IF NOT EXISTS commander_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  game_id UUID REFERENCES commander_games(id),
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

-- Indexes for commander_waitlist
CREATE INDEX IF NOT EXISTS idx_commander_waitlist_venue_status ON commander_waitlist(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_commander_waitlist_player ON commander_waitlist(player_id);
CREATE INDEX IF NOT EXISTS idx_commander_waitlist_game ON commander_waitlist(game_id);
CREATE INDEX IF NOT EXISTS idx_commander_waitlist_venue_game_type ON commander_waitlist(venue_id, game_type, stakes, status);

-- ===================
-- TABLE 5: commander_waitlist_history
-- ===================

CREATE TABLE IF NOT EXISTS commander_waitlist_history (
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

-- Indexes for commander_waitlist_history
CREATE INDEX IF NOT EXISTS idx_commander_waitlist_history_venue ON commander_waitlist_history(venue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_commander_waitlist_history_player ON commander_waitlist_history(player_id);

-- ===================
-- TABLE 6: commander_seats
-- ===================

CREATE TABLE IF NOT EXISTS commander_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES commander_games(id) ON DELETE CASCADE,
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

-- Indexes for commander_seats
CREATE INDEX IF NOT EXISTS idx_commander_seats_game ON commander_seats(game_id);
CREATE INDEX IF NOT EXISTS idx_commander_seats_player ON commander_seats(player_id);
CREATE INDEX IF NOT EXISTS idx_commander_seats_status ON commander_seats(game_id, status);

-- ===================
-- TABLE 7: commander_notifications
-- ===================

CREATE TABLE IF NOT EXISTS commander_notifications (
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

-- Indexes for commander_notifications
CREATE INDEX IF NOT EXISTS idx_commander_notifications_player ON commander_notifications(player_id, status);
CREATE INDEX IF NOT EXISTS idx_commander_notifications_venue ON commander_notifications(venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_notifications_created ON commander_notifications(created_at);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE commander_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_waitlist_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_notifications ENABLE ROW LEVEL SECURITY;

-- Staff: Can access if they are staff at the venue
CREATE POLICY commander_staff_select ON commander_staff
  FOR SELECT USING (
    user_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY commander_staff_insert ON commander_staff
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

CREATE POLICY commander_staff_update ON commander_staff
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Tables: Staff can manage, public can view
CREATE POLICY commander_tables_select ON commander_tables
  FOR SELECT USING (true);

CREATE POLICY commander_tables_modify ON commander_tables
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Games: Public can view running games, staff can manage
CREATE POLICY commander_games_select ON commander_games
  FOR SELECT USING (true);

CREATE POLICY commander_games_modify ON commander_games
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Waitlist: Players can see their own, staff can see all at venue
CREATE POLICY commander_waitlist_select ON commander_waitlist
  FOR SELECT USING (
    player_id = auth.uid() OR
    player_id IS NULL OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY commander_waitlist_insert ON commander_waitlist
  FOR INSERT WITH CHECK (
    player_id = auth.uid() OR
    player_id IS NULL OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY commander_waitlist_update ON commander_waitlist
  FOR UPDATE USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY commander_waitlist_delete ON commander_waitlist
  FOR DELETE USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Waitlist History: Players see own, staff see venue
CREATE POLICY commander_waitlist_history_select ON commander_waitlist_history
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY commander_waitlist_history_insert ON commander_waitlist_history
  FOR INSERT WITH CHECK (true);

-- Seats: Public can view, staff can modify
CREATE POLICY commander_seats_select ON commander_seats
  FOR SELECT USING (true);

CREATE POLICY commander_seats_modify ON commander_seats
  FOR ALL USING (
    game_id IN (
      SELECT id FROM commander_games WHERE venue_id IN (
        SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

-- Notifications: Players see own
CREATE POLICY commander_notifications_select ON commander_notifications
  FOR SELECT USING (player_id = auth.uid());

CREATE POLICY commander_notifications_insert ON commander_notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY commander_notifications_update ON commander_notifications
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
  FROM commander_waitlist
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
      FROM commander_waitlist
      WHERE venue_id = COALESCE(NEW.venue_id, OLD.venue_id)
        AND game_type = COALESCE(NEW.game_type, OLD.game_type)
        AND stakes = COALESCE(NEW.stakes, OLD.stakes)
        AND status = 'waiting'
    )
    UPDATE commander_waitlist w
    SET position = r.new_position
    FROM ranked r
    WHERE w.id = r.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for waitlist position recalculation
DROP TRIGGER IF EXISTS waitlist_position_trigger ON commander_waitlist;
CREATE TRIGGER waitlist_position_trigger
AFTER UPDATE OR DELETE ON commander_waitlist
FOR EACH ROW EXECUTE FUNCTION recalculate_waitlist_positions();

-- Function to update game player count
CREATE OR REPLACE FUNCTION update_game_player_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE commander_games
  SET current_players = (
    SELECT COUNT(*) FROM commander_seats
    WHERE game_id = COALESCE(NEW.game_id, OLD.game_id)
    AND status = 'occupied'
  )
  WHERE id = COALESCE(NEW.game_id, OLD.game_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for game player count
DROP TRIGGER IF EXISTS game_player_count_trigger ON commander_seats;
CREATE TRIGGER game_player_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON commander_seats
FOR EACH ROW EXECUTE FUNCTION update_game_player_count();

-- ===================
-- VALIDATION
-- ===================

-- After running this migration, verify with:
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'commander_%' ORDER BY table_name;
-- Should return exactly 7 tables:
-- commander_games
-- commander_notifications
-- commander_seats
-- commander_staff
-- commander_tables
-- commander_waitlist
-- commander_waitlist_history
