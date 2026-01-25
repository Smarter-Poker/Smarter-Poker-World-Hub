-- =====================================================
-- SMARTER CAPTAIN - COMPLETE DATABASE SCHEMA
-- =====================================================
-- Version: 1.0
-- Created: January 2026
-- Purpose: Complete SQL schema for Smarter Captain platform
-- =====================================================

-- ===================
-- VENUE MANAGEMENT
-- ===================

-- Extends existing poker_venues table
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS
  captain_enabled BOOLEAN DEFAULT false,
  captain_tier TEXT DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  captain_activated_at TIMESTAMPTZ,
  commission_type TEXT DEFAULT 'time', -- 'time', 'rake', 'hybrid'
  accepts_home_games BOOLEAN DEFAULT false,
  auto_text_enabled BOOLEAN DEFAULT true,
  waitlist_settings JSONB DEFAULT '{}',
  tournament_settings JSONB DEFAULT '{}',
  staff_pin_required BOOLEAN DEFAULT true,
  primary_contact_id UUID REFERENCES profiles(id);

-- Staff & Roles
CREATE TABLE captain_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'owner', 'manager', 'floor', 'brush', 'dealer'
  permissions JSONB DEFAULT '{}',
  pin_code TEXT, -- 4-6 digit PIN for quick actions
  is_active BOOLEAN DEFAULT true,
  hired_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, user_id)
);

-- ===================
-- TABLE MANAGEMENT
-- ===================

CREATE TABLE captain_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  table_name TEXT, -- "Table 1", "Feature Table", etc.
  max_seats INTEGER DEFAULT 9,
  current_game_id UUID, -- Active game on this table
  status TEXT DEFAULT 'available', -- 'available', 'in_use', 'reserved', 'maintenance'
  features JSONB DEFAULT '{}', -- { "has_usb": true, "has_auto_shuffler": true }
  position_x INTEGER, -- For floor map visualization
  position_y INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Active Games (Cash & Tournament)
CREATE TABLE captain_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  table_id UUID REFERENCES captain_tables(id),
  game_type TEXT NOT NULL, -- 'nlh', 'plo', 'mixed', 'limit', 'tournament'
  stakes TEXT, -- '1/3', '2/5', '5/10', etc.
  min_buyin INTEGER,
  max_buyin INTEGER,
  current_players INTEGER DEFAULT 0,
  max_players INTEGER DEFAULT 9,
  status TEXT DEFAULT 'waiting', -- 'waiting', 'running', 'breaking', 'closed'
  started_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  is_must_move BOOLEAN DEFAULT false,
  parent_game_id UUID REFERENCES captain_games(id), -- For must-move chains
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- WAITLIST SYSTEM
-- ===================

CREATE TABLE captain_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  game_id UUID REFERENCES captain_games(id),
  player_id UUID REFERENCES profiles(id),
  player_name TEXT, -- For walk-in players without accounts
  player_phone TEXT,
  position INTEGER NOT NULL,
  signup_method TEXT DEFAULT 'walk_in', -- 'walk_in', 'app', 'phone', 'kiosk'
  status TEXT DEFAULT 'waiting', -- 'waiting', 'called', 'seated', 'passed', 'removed'
  call_count INTEGER DEFAULT 0,
  last_called_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  seated_at TIMESTAMPTZ,
  estimated_wait_minutes INTEGER -- AI-calculated
);

-- Waitlist History (for analytics)
CREATE TABLE captain_waitlist_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),
  game_type TEXT,
  stakes TEXT,
  wait_time_minutes INTEGER,
  was_seated BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Squad/Group Waitlist
CREATE TABLE captain_waitlist_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID REFERENCES profiles(id),
  venue_id UUID REFERENCES poker_venues(id),
  game_type TEXT,
  stakes TEXT,
  prefer_same_table BOOLEAN DEFAULT true,
  accept_split BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE captain_waitlist_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES captain_waitlist_groups(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- SEAT MANAGEMENT
-- ===================

CREATE TABLE captain_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES captain_games(id) ON DELETE CASCADE,
  seat_number INTEGER NOT NULL,
  player_id UUID REFERENCES profiles(id),
  player_name TEXT, -- For walk-ins
  status TEXT DEFAULT 'empty', -- 'empty', 'occupied', 'reserved', 'away'
  buyin_amount INTEGER,
  seated_at TIMESTAMPTZ,
  away_since TIMESTAMPTZ,
  session_id UUID, -- Links to player session tracking
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(game_id, seat_number)
);

-- Seat Preferences
CREATE TABLE captain_player_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) UNIQUE,
  preferred_seats INTEGER[],   -- [1, 9] for corner seats
  left_handed BOOLEAN DEFAULT false,
  avoid_players UUID[],        -- Discreet exclusion list
  table_vibe TEXT,             -- 'action', 'social', 'grinder'
  notification_preferences JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- TOURNAMENT SYSTEM
-- ===================

CREATE TABLE captain_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tournament_type TEXT DEFAULT 'freezeout', -- 'freezeout', 'rebuy', 'bounty', 'satellite'
  buyin_amount INTEGER NOT NULL,
  buyin_fee INTEGER DEFAULT 0, -- House fee
  starting_chips INTEGER NOT NULL,

  -- Schedule
  scheduled_start TIMESTAMPTZ NOT NULL,
  registration_opens TIMESTAMPTZ,
  late_registration_levels INTEGER DEFAULT 0,
  actual_start TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Structure
  blind_structure JSONB NOT NULL, -- Array of { level, small_blind, big_blind, ante, duration_minutes }
  break_schedule JSONB, -- Array of { after_level, duration_minutes }
  payout_structure JSONB, -- Array of { place, percentage } or { place, amount }

  -- Current State
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'registering', 'running', 'paused', 'final_table', 'completed', 'cancelled'
  current_level INTEGER DEFAULT 0,
  level_started_at TIMESTAMPTZ,
  seconds_remaining INTEGER,
  is_on_break BOOLEAN DEFAULT false,

  -- Counts
  max_entries INTEGER,
  total_entries INTEGER DEFAULT 0,
  total_rebuys INTEGER DEFAULT 0,
  total_addons INTEGER DEFAULT 0,
  players_remaining INTEGER DEFAULT 0,
  prize_pool INTEGER DEFAULT 0,

  -- Settings
  allows_rebuys BOOLEAN DEFAULT false,
  rebuy_amount INTEGER,
  rebuy_chips INTEGER,
  max_rebuys INTEGER,
  rebuy_end_level INTEGER,
  allows_addon BOOLEAN DEFAULT false,
  addon_amount INTEGER,
  addon_chips INTEGER,

  -- Display
  featured BOOLEAN DEFAULT false,
  broadcast_to_smarter BOOLEAN DEFAULT true,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tournament Registrations
CREATE TABLE captain_tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES captain_tournaments(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  player_name TEXT,
  player_phone TEXT,

  entry_number INTEGER, -- For multiple entries
  table_number INTEGER,
  seat_number INTEGER,
  chip_count INTEGER,

  status TEXT DEFAULT 'registered', -- 'registered', 'seated', 'eliminated', 'cashed'
  finish_position INTEGER,
  payout_amount INTEGER,

  rebuys_used INTEGER DEFAULT 0,
  addon_used BOOLEAN DEFAULT false,

  registered_at TIMESTAMPTZ DEFAULT now(),
  seated_at TIMESTAMPTZ,
  eliminated_at TIMESTAMPTZ,
  eliminated_by UUID REFERENCES profiles(id)
);

-- ===================
-- NOTIFICATIONS
-- ===================

CREATE TABLE captain_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),

  notification_type TEXT NOT NULL, -- 'seat_available', 'tournament_starting', 'called_for_seat', 'promotion', 'custom'
  channel TEXT NOT NULL, -- 'sms', 'push', 'email', 'in_app'

  title TEXT,
  message TEXT NOT NULL,

  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- PROMOTIONS & JACKPOTS
-- ===================

CREATE TABLE captain_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  promotion_type TEXT NOT NULL, -- 'high_hand', 'bad_beat', 'splash_pot', 'bonus', 'drawing', 'custom'

  -- Schedule
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  recurring_schedule JSONB, -- { days: [1,2,3], start_time: "18:00", end_time: "23:00" }

  -- Rules
  qualifying_games TEXT[], -- ['nlh', 'plo']
  qualifying_stakes TEXT[], -- ['1/3', '2/5']
  rules JSONB NOT NULL,

  -- Prize
  prize_type TEXT, -- 'cash', 'progressive', 'item', 'freeroll'
  prize_amount INTEGER,
  progressive_pool INTEGER DEFAULT 0,

  status TEXT DEFAULT 'active', -- 'draft', 'active', 'paused', 'completed'

  created_at TIMESTAMPTZ DEFAULT now()
);

-- High Hand Winners
CREATE TABLE captain_high_hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  promotion_id UUID REFERENCES captain_promotions(id),

  player_id UUID REFERENCES profiles(id),
  player_name TEXT,

  hand_description TEXT NOT NULL, -- "Aces full of Kings"
  hand_cards TEXT[], -- ['As', 'Ah', 'Ad', 'Kc', 'Kd']
  board_cards TEXT[],
  hand_rank INTEGER, -- Numeric ranking for comparison

  game_id UUID REFERENCES captain_games(id),
  table_number INTEGER,

  prize_amount INTEGER,
  verified_by UUID REFERENCES captain_staff(id),
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- PLAYER SESSIONS
-- ===================

CREATE TABLE captain_player_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),

  -- Session tracking
  check_in_at TIMESTAMPTZ DEFAULT now(),
  check_out_at TIMESTAMPTZ,
  total_minutes INTEGER,

  -- Games played
  games_played JSONB DEFAULT '[]', -- Array of { game_id, game_type, stakes, buyin, cashout, duration }

  -- Comp tracking
  comp_rate_per_hour DECIMAL(10,2),
  comps_earned DECIMAL(10,2) DEFAULT 0,

  -- XP integration with Smarter.Poker
  xp_earned INTEGER DEFAULT 0,
  diamonds_earned INTEGER DEFAULT 0,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- In-Seat Services
CREATE TABLE captain_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),
  table_id UUID REFERENCES captain_tables(id),
  seat_number INTEGER,
  request_type TEXT,           -- 'food', 'chips', 'table_change', 'cashout', 'floor'
  details JSONB,
  status TEXT DEFAULT 'pending',
  assigned_to UUID REFERENCES captain_staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ===================
-- DEALER MANAGEMENT
-- ===================

CREATE TABLE captain_dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  user_id UUID REFERENCES profiles(id),
  employee_id TEXT,
  skill_level INTEGER,         -- 1-5
  certified_games TEXT[],      -- ['nlh', 'plo', 'mixed', 'stud']
  is_active BOOLEAN DEFAULT true,
  hired_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE captain_dealer_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  dealer_id UUID REFERENCES captain_dealers(id),
  table_id UUID REFERENCES captain_tables(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  tips_reported DECIMAL(10,2)
);

-- ===================
-- INCIDENTS
-- ===================

CREATE TABLE captain_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  reported_by UUID REFERENCES captain_staff(id),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  players_involved UUID[],
  table_id UUID REFERENCES captain_tables(id),
  description TEXT NOT NULL,
  resolution TEXT,
  resolved_by UUID REFERENCES captain_staff(id),
  attachments TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- ===================
-- HOME GAMES MODULE
-- ===================

CREATE TABLE captain_home_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES profiles(id) NOT NULL,

  -- Basic Info
  name TEXT NOT NULL,
  description TEXT,
  game_type TEXT NOT NULL,
  stakes TEXT,
  buyin_min INTEGER,
  buyin_max INTEGER,
  max_players INTEGER DEFAULT 9,

  -- Location (privacy-aware)
  city TEXT,
  state TEXT,
  zip_code TEXT,
  full_address TEXT, -- Only shown to confirmed players
  location_notes TEXT,

  -- Schedule
  scheduled_date DATE NOT NULL,
  start_time TIME NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern JSONB, -- { frequency: 'weekly', day: 'friday' }

  -- Privacy & Access
  visibility TEXT DEFAULT 'private', -- 'private', 'friends', 'public'
  requires_approval BOOLEAN DEFAULT true,
  invite_code TEXT UNIQUE,

  -- Status
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled'

  -- Preferences
  food_provided BOOLEAN DEFAULT false,
  byob BOOLEAN DEFAULT true,
  smoking_allowed BOOLEAN DEFAULT false,
  house_rules TEXT,

  -- Trust & Verification
  host_verified BOOLEAN DEFAULT false,
  games_hosted_count INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2),

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Home Game RSVPs
CREATE TABLE captain_home_game_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_game_id UUID REFERENCES captain_home_games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),

  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'declined', 'waitlist', 'cancelled'
  rsvp_message TEXT,

  -- Host response
  approved_by UUID REFERENCES profiles(id),
  response_message TEXT,

  -- Confirmation
  confirmed_at TIMESTAMPTZ,
  checked_in BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(home_game_id, player_id)
);

-- Home Game Reviews
CREATE TABLE captain_home_game_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_game_id UUID REFERENCES captain_home_games(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id),

  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,

  -- Specific ratings
  game_quality INTEGER,
  host_rating INTEGER,
  location_rating INTEGER,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(home_game_id, reviewer_id)
);

-- Home Game Escrow
CREATE TABLE captain_escrow_transactions (
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
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Dealer Marketplace
CREATE TABLE captain_dealer_marketplace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES profiles(id),
  service_area TEXT[],         -- Cities/regions
  hourly_rate DECIMAL(10,2),
  games_offered TEXT[],
  experience_years INTEGER,
  bio TEXT,
  rating DECIMAL(3,2),
  review_count INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  available_days INTEGER[],    -- 0-6 for days of week
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Equipment Rentals
CREATE TABLE captain_equipment_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,               -- 'chips', 'table', 'shuffler', 'cards'
  daily_rate DECIMAL(10,2),
  weekly_rate DECIMAL(10,2),
  service_area TEXT[],
  images TEXT[],
  available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- ANALYTICS
-- ===================

CREATE TABLE captain_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  date DATE NOT NULL,

  -- Traffic
  total_players INTEGER DEFAULT 0,
  unique_players INTEGER DEFAULT 0,
  new_players INTEGER DEFAULT 0, -- First time at venue
  returning_players INTEGER DEFAULT 0,

  -- Waitlist
  total_signups INTEGER DEFAULT 0,
  app_signups INTEGER DEFAULT 0,
  walk_in_signups INTEGER DEFAULT 0,
  average_wait_minutes DECIMAL(10,2),

  -- Games
  tables_opened INTEGER DEFAULT 0,
  peak_tables_running INTEGER DEFAULT 0,
  total_player_hours DECIMAL(10,2),

  -- Tournaments
  tournaments_run INTEGER DEFAULT 0,
  tournament_entries INTEGER DEFAULT 0,
  tournament_prize_pool INTEGER DEFAULT 0,

  -- Revenue indicators
  total_rake_estimate DECIMAL(10,2), -- If tracked
  comp_dollars_issued DECIMAL(10,2),

  -- Engagement
  smarter_poker_signups INTEGER DEFAULT 0, -- New Smarter.Poker accounts

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, date)
);

-- ===================
-- AI FEATURES
-- ===================

CREATE TABLE captain_wait_time_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  game_type TEXT NOT NULL,
  stakes TEXT NOT NULL,
  hour_of_day INTEGER,
  day_of_week INTEGER,
  predicted_minutes INTEGER,
  actual_minutes INTEGER,      -- For ML feedback
  confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE captain_player_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id),
  venue_id UUID REFERENCES poker_venues(id),
  recommendation_type TEXT,    -- 'game', 'stakes', 'venue', 'training'
  recommendation_data JSONB,
  was_followed BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- STREAMING & HAND HISTORY
-- ===================

CREATE TABLE captain_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  table_id UUID REFERENCES captain_tables(id),
  platforms TEXT[],
  stream_keys JSONB,           -- Encrypted
  delay_minutes INTEGER DEFAULT 15,
  overlay_config JSONB,
  status TEXT DEFAULT 'offline',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  viewer_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE captain_hand_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  table_id UUID REFERENCES captain_tables(id),
  game_id UUID REFERENCES captain_games(id),
  hand_number INTEGER,

  -- Hand data
  player_cards JSONB,          -- { "seat_1": ["As", "Kh"], ... }
  board TEXT[],
  actions JSONB,               -- Array of actions
  pot_size INTEGER,
  winners JSONB,

  -- RFID captured
  rfid_captured BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- FINANCIAL & TAX
-- ===================

CREATE TABLE captain_tax_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),
  event_type TEXT NOT NULL,
  gross_amount DECIMAL(12,2) NOT NULL,
  buy_in DECIMAL(12,2),
  net_amount DECIMAL(12,2),
  withholding_required BOOLEAN DEFAULT false,
  withholding_amount DECIMAL(12,2),
  w2g_generated BOOLEAN DEFAULT false,
  w2g_document_url TEXT,
  player_acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- RESPONSIBLE GAMING
-- ===================

CREATE TABLE captain_self_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id),
  exclusion_type TEXT NOT NULL,
  duration_days INTEGER,
  scope TEXT NOT NULL,         -- 'venue', 'network'
  venue_id UUID REFERENCES poker_venues(id), -- If venue-specific
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  acknowledged BOOLEAN DEFAULT false,
  lifted_at TIMESTAMPTZ,
  lifted_by UUID
);

CREATE TABLE captain_spending_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) UNIQUE,
  daily_limit DECIMAL(10,2),
  weekly_limit DECIMAL(10,2),
  monthly_limit DECIMAL(10,2),
  session_duration_limit INTEGER, -- minutes
  loss_limit DECIMAL(10,2),
  cooling_off_enabled BOOLEAN DEFAULT false,
  alerts_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- NETWORK FEATURES
-- ===================

CREATE TABLE captain_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  organizer_id UUID REFERENCES profiles(id),
  venues UUID[],               -- Participating venues
  season_start DATE,
  season_end DATE,
  scoring_system JSONB,
  prize_pool DECIMAL(12,2),
  status TEXT DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE captain_league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES captain_leagues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  points INTEGER DEFAULT 0,
  events_played INTEGER DEFAULT 0,
  cashes INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  earnings DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- INDEXES FOR PERFORMANCE
-- ===================

-- Venue & Staff
CREATE INDEX idx_captain_staff_venue ON captain_staff(venue_id);
CREATE INDEX idx_captain_staff_user ON captain_staff(user_id);

-- Tables & Games
CREATE INDEX idx_captain_tables_venue ON captain_tables(venue_id);
CREATE INDEX idx_captain_games_venue_status ON captain_games(venue_id, status);
CREATE INDEX idx_captain_games_table ON captain_games(table_id);

-- Waitlist
CREATE INDEX idx_captain_waitlist_venue_status ON captain_waitlist(venue_id, status);
CREATE INDEX idx_captain_waitlist_player ON captain_waitlist(player_id);
CREATE INDEX idx_captain_waitlist_game ON captain_waitlist(game_id);

-- Tournaments
CREATE INDEX idx_captain_tournaments_venue_date ON captain_tournaments(venue_id, scheduled_start);
CREATE INDEX idx_captain_tournaments_status ON captain_tournaments(status);
CREATE INDEX idx_captain_tournament_entries_tournament ON captain_tournament_entries(tournament_id);
CREATE INDEX idx_captain_tournament_entries_player ON captain_tournament_entries(player_id);

-- Sessions
CREATE INDEX idx_captain_sessions_player ON captain_player_sessions(player_id);
CREATE INDEX idx_captain_sessions_venue_date ON captain_player_sessions(venue_id, check_in_at);

-- Home Games
CREATE INDEX idx_captain_home_games_date ON captain_home_games(scheduled_date);
CREATE INDEX idx_captain_home_games_location ON captain_home_games(state, city);
CREATE INDEX idx_captain_home_games_visibility ON captain_home_games(visibility, status);
CREATE INDEX idx_captain_home_games_host ON captain_home_games(host_id);

-- Notifications
CREATE INDEX idx_captain_notifications_player ON captain_notifications(player_id, status);
CREATE INDEX idx_captain_notifications_venue ON captain_notifications(venue_id);

-- Analytics & AI
CREATE INDEX idx_captain_analytics_venue_date ON captain_analytics_daily(venue_id, date);
CREATE INDEX idx_wait_predictions_venue ON captain_wait_time_predictions(venue_id, game_type, stakes);

-- Hand History
CREATE INDEX idx_captain_hand_history_game ON captain_hand_history(game_id);
CREATE INDEX idx_captain_hand_history_player ON captain_hand_history USING GIN (player_cards);

-- Incidents
CREATE INDEX idx_captain_incidents_venue ON captain_incidents(venue_id, created_at);

-- Escrow
CREATE INDEX idx_captain_escrow_status ON captain_escrow_transactions(status);

-- Responsible Gaming
CREATE INDEX idx_captain_exclusions_player ON captain_self_exclusions(player_id, expires_at);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_player_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_notifications ENABLE ROW LEVEL SECURITY;

-- Staff can manage their venue
CREATE POLICY staff_venue_access ON captain_staff
  FOR ALL USING (
    user_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid())
  );

-- Players can see their own waitlist entries
CREATE POLICY waitlist_player_access ON captain_waitlist
  FOR SELECT USING (player_id = auth.uid() OR player_id IS NULL);

-- Public tournament visibility
CREATE POLICY tournament_public_read ON captain_tournaments
  FOR SELECT USING (broadcast_to_smarter = true OR venue_id IN (
    SELECT venue_id FROM captain_staff WHERE user_id = auth.uid()
  ));

-- Home game visibility based on setting
CREATE POLICY home_game_visibility ON captain_home_games
  FOR SELECT USING (
    visibility = 'public' OR
    host_id = auth.uid() OR
    id IN (SELECT home_game_id FROM captain_home_game_rsvps WHERE player_id = auth.uid())
  );

-- Players can see their own sessions
CREATE POLICY session_player_access ON captain_player_sessions
  FOR SELECT USING (player_id = auth.uid());

-- Players can see their own notifications
CREATE POLICY notification_player_access ON captain_notifications
  FOR SELECT USING (player_id = auth.uid());

-- ===================
-- FUNCTIONS & TRIGGERS
-- ===================

-- Function to update waitlist positions
CREATE OR REPLACE FUNCTION update_waitlist_positions()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate positions for the game
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as new_position
    FROM captain_waitlist
    WHERE game_id = COALESCE(NEW.game_id, OLD.game_id)
    AND status = 'waiting'
  )
  UPDATE captain_waitlist w
  SET position = r.new_position
  FROM ranked r
  WHERE w.id = r.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for waitlist position updates
CREATE TRIGGER waitlist_position_trigger
AFTER INSERT OR UPDATE OR DELETE ON captain_waitlist
FOR EACH ROW EXECUTE FUNCTION update_waitlist_positions();

-- Function to update tournament player counts
CREATE OR REPLACE FUNCTION update_tournament_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE captain_tournaments
  SET
    total_entries = (SELECT COUNT(*) FROM captain_tournament_entries WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)),
    players_remaining = (SELECT COUNT(*) FROM captain_tournament_entries WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id) AND status IN ('registered', 'seated'))
  WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for tournament count updates
CREATE TRIGGER tournament_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON captain_tournament_entries
FOR EACH ROW EXECUTE FUNCTION update_tournament_counts();

-- Function to update game player counts
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for game player count updates
CREATE TRIGGER game_player_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON captain_seats
FOR EACH ROW EXECUTE FUNCTION update_game_player_count();

-- ===================
-- SCHEMA VERSION
-- ===================

COMMENT ON SCHEMA public IS 'Smarter Captain Schema v1.0 - January 2026';
