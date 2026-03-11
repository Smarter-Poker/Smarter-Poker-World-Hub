-- ============================================================
-- Commander Missing Tables Migration
-- Creates 7 tables needed by existing Commander API routes
-- Run via Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. commander_leagues
CREATE TABLE IF NOT EXISTS commander_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  organizer_id UUID REFERENCES auth.users(id),
  venues JSONB DEFAULT '[]',
  season_start DATE,
  season_end DATE,
  scoring_system TEXT DEFAULT 'points',
  prize_pool NUMERIC,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. commander_league_standings
CREATE TABLE IF NOT EXISTS commander_league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES commander_leagues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES auth.users(id),
  points INTEGER DEFAULT 0,
  events_played INTEGER DEFAULT 0,
  cashes INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  earnings NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, player_id)
);

-- 3. commander_time_sessions
CREATE TABLE IF NOT EXISTS commander_time_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  table_number INTEGER,
  seat_number INTEGER,
  rate_per_hour NUMERIC DEFAULT 12,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  total_charge NUMERIC DEFAULT 0,
  duration_minutes INTEGER,
  amount_paid NUMERIC DEFAULT 0,
  started_by UUID REFERENCES auth.users(id),
  ended_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. commander_streams
CREATE TABLE IF NOT EXISTS commander_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES commander_tables(id) ON DELETE CASCADE,
  venue_id INTEGER NOT NULL,
  platforms JSONB DEFAULT '[]',
  delay_minutes INTEGER DEFAULT 15,
  overlay_config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'offline',
  started_at TIMESTAMPTZ,
  viewer_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(table_id)
);

-- 5. commander_venue_settings
CREATE TABLE IF NOT EXISTS commander_venue_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER NOT NULL UNIQUE,
  room_open BOOLEAN DEFAULT false,
  default_game_type TEXT DEFAULT 'nlh',
  default_stakes TEXT DEFAULT '1/2',
  max_tables INTEGER DEFAULT 20,
  default_seats_per_table INTEGER DEFAULT 9,
  time_billing_rate NUMERIC DEFAULT 12,
  auto_comp_rate NUMERIC DEFAULT 1,
  late_reg_levels INTEGER DEFAULT 8,
  default_starting_chips INTEGER DEFAULT 15000,
  house_rules TEXT,
  hard_stop_enabled BOOLEAN DEFAULT false,
  hard_stop_time TIME,
  last_hard_stop_date DATE,
  auto_refresh_interval INTEGER DEFAULT 30,
  show_player_names_on_display BOOLEAN DEFAULT true,
  sms_notifications_enabled BOOLEAN DEFAULT true,
  push_notifications_enabled BOOLEAN DEFAULT true,
  max_waitlist_size INTEGER DEFAULT 50,
  call_timeout_minutes INTEGER DEFAULT 5,
  default_wait_time_per_player INTEGER DEFAULT 15,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- 6. commander_table_ratings
CREATE TABLE IF NOT EXISTS commander_table_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER NOT NULL,
  table_number INTEGER NOT NULL,
  player_id UUID REFERENCES auth.users(id),
  session_id UUID,
  action_level INTEGER NOT NULL CHECK (action_level BETWEEN 1 AND 5),
  friendliness INTEGER NOT NULL CHECK (friendliness BETWEEN 1 AND 5),
  pace INTEGER NOT NULL CHECK (pace BETWEEN 1 AND 5),
  game_type TEXT,
  stakes TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. commander_cash_transactions
CREATE TABLE IF NOT EXISTS commander_cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER NOT NULL,
  session_id UUID,
  player_name TEXT NOT NULL,
  table_number INTEGER,
  seat_number INTEGER,
  type TEXT NOT NULL CHECK (type IN ('buy_in', 'cash_out', 'add_on')),
  amount NUMERIC NOT NULL,
  chip_count NUMERIC,
  payment_method TEXT DEFAULT 'cash',
  processed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leagues_status ON commander_leagues(status);
CREATE INDEX IF NOT EXISTS idx_league_standings_league ON commander_league_standings(league_id);
CREATE INDEX IF NOT EXISTS idx_league_standings_player ON commander_league_standings(player_id);
CREATE INDEX IF NOT EXISTS idx_time_sessions_venue ON commander_time_sessions(venue_id);
CREATE INDEX IF NOT EXISTS idx_time_sessions_status ON commander_time_sessions(status);
CREATE INDEX IF NOT EXISTS idx_streams_table ON commander_streams(table_id);
CREATE INDEX IF NOT EXISTS idx_streams_venue ON commander_streams(venue_id);
CREATE INDEX IF NOT EXISTS idx_table_ratings_venue ON commander_table_ratings(venue_id);
CREATE INDEX IF NOT EXISTS idx_table_ratings_table ON commander_table_ratings(table_number);
CREATE INDEX IF NOT EXISTS idx_cash_tx_venue ON commander_cash_transactions(venue_id);
CREATE INDEX IF NOT EXISTS idx_cash_tx_date ON commander_cash_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_tx_session ON commander_cash_transactions(session_id);

-- Grant service_role full access (for API routes)
GRANT ALL ON commander_leagues TO service_role;
GRANT ALL ON commander_league_standings TO service_role;
GRANT ALL ON commander_time_sessions TO service_role;
GRANT ALL ON commander_streams TO service_role;
GRANT ALL ON commander_venue_settings TO service_role;
GRANT ALL ON commander_table_ratings TO service_role;
GRANT ALL ON commander_cash_transactions TO service_role;
