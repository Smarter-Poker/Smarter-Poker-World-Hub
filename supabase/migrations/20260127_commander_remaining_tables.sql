-- =====================================================
-- CLUB COMMANDER - REMAINING TABLES
-- =====================================================
-- Tables needed for full feature completion
-- Run this in Supabase SQL Editor
-- =====================================================

-- ===================
-- WAITLIST GROUPS (Squads)
-- ===================

CREATE TABLE IF NOT EXISTS commander_waitlist_groups (
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

CREATE TABLE IF NOT EXISTS commander_waitlist_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES commander_waitlist_groups(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_groups_venue ON commander_waitlist_groups(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_groups_leader ON commander_waitlist_groups(leader_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_group_members_group ON commander_waitlist_group_members(group_id);

-- ===================
-- DEALER MANAGEMENT
-- ===================

CREATE TABLE IF NOT EXISTS commander_dealers (
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

CREATE TABLE IF NOT EXISTS commander_dealer_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  dealer_id UUID REFERENCES commander_dealers(id) ON DELETE CASCADE,
  table_id UUID REFERENCES commander_tables(id),
  game_id UUID REFERENCES commander_games(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  tips_reported DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dealers_venue ON commander_dealers(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_dealers_user ON commander_dealers(user_id);
CREATE INDEX IF NOT EXISTS idx_dealer_rotations_venue ON commander_dealer_rotations(venue_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dealer_rotations_dealer ON commander_dealer_rotations(dealer_id, started_at DESC);

-- ===================
-- INCIDENTS
-- ===================

CREATE TABLE IF NOT EXISTS commander_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  reported_by UUID REFERENCES commander_staff(id),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  players_involved UUID[],
  player_id UUID REFERENCES profiles(id),
  table_id UUID REFERENCES commander_tables(id),
  description TEXT NOT NULL,
  action_taken TEXT,
  resolution TEXT,
  resolved_by UUID REFERENCES commander_staff(id),
  attachments TEXT[],
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_venue ON commander_incidents(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON commander_incidents(venue_id, status);

-- ===================
-- HOME GAME REVIEWS
-- ===================

CREATE TABLE IF NOT EXISTS commander_home_game_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES commander_home_games(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  game_quality INTEGER CHECK (game_quality >= 1 AND game_quality <= 5),
  host_rating INTEGER CHECK (host_rating >= 1 AND host_rating <= 5),
  location_rating INTEGER CHECK (location_rating >= 1 AND location_rating <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(game_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_home_game_reviews_game ON commander_home_game_reviews(game_id);
CREATE INDEX IF NOT EXISTS idx_home_game_reviews_reviewer ON commander_home_game_reviews(reviewer_id);

-- ===================
-- ESCROW TRANSACTIONS
-- ===================

CREATE TABLE IF NOT EXISTS commander_escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_game_id UUID REFERENCES commander_home_games(id),
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

CREATE INDEX IF NOT EXISTS idx_escrow_status ON commander_escrow_transactions(status);
CREATE INDEX IF NOT EXISTS idx_escrow_game ON commander_escrow_transactions(home_game_id);
CREATE INDEX IF NOT EXISTS idx_escrow_player ON commander_escrow_transactions(player_id);

-- ===================
-- DEALER MARKETPLACE
-- ===================

CREATE TABLE IF NOT EXISTS commander_dealer_marketplace (
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

CREATE INDEX IF NOT EXISTS idx_marketplace_area ON commander_dealer_marketplace USING GIN (service_area);
CREATE INDEX IF NOT EXISTS idx_marketplace_games ON commander_dealer_marketplace USING GIN (games_offered);
CREATE INDEX IF NOT EXISTS idx_marketplace_status ON commander_dealer_marketplace(status, verified);

-- ===================
-- EQUIPMENT RENTALS
-- ===================

CREATE TABLE IF NOT EXISTS commander_equipment_rentals (
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

CREATE INDEX IF NOT EXISTS idx_equipment_category ON commander_equipment_rentals(category, available);
CREATE INDEX IF NOT EXISTS idx_equipment_area ON commander_equipment_rentals USING GIN (service_area);

-- ===================
-- AI FEATURES
-- ===================

CREATE TABLE IF NOT EXISTS commander_wait_time_predictions (
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

CREATE TABLE IF NOT EXISTS commander_player_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id),
  venue_id INTEGER REFERENCES poker_venues(id),
  recommendation_type TEXT,
  recommendation_data JSONB,
  was_followed BOOLEAN,
  feedback_rating INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wait_predictions_venue ON commander_wait_time_predictions(venue_id, game_type, stakes);
CREATE INDEX IF NOT EXISTS idx_recommendations_player ON commander_player_recommendations(player_id, created_at DESC);

-- ===================
-- STREAMING & HAND HISTORY
-- ===================

CREATE TABLE IF NOT EXISTS commander_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  table_id UUID REFERENCES commander_tables(id),
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

CREATE TABLE IF NOT EXISTS commander_hand_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id),
  table_id UUID REFERENCES commander_tables(id),
  game_id UUID REFERENCES commander_games(id),
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

CREATE INDEX IF NOT EXISTS idx_streams_venue ON commander_streams(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_streams_table ON commander_streams(table_id);
CREATE INDEX IF NOT EXISTS idx_hand_history_game ON commander_hand_history(game_id, hand_number);
CREATE INDEX IF NOT EXISTS idx_hand_history_venue ON commander_hand_history(venue_id, created_at DESC);

-- ===================
-- FINANCIAL & TAX
-- ===================

CREATE TABLE IF NOT EXISTS commander_tax_events (
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

CREATE INDEX IF NOT EXISTS idx_tax_events_venue ON commander_tax_events(venue_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_tax_events_player ON commander_tax_events(player_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_tax_events_w2g ON commander_tax_events(w2g_generated, event_date);

-- ===================
-- RESPONSIBLE GAMING
-- ===================

CREATE TABLE IF NOT EXISTS commander_self_exclusions (
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

CREATE TABLE IF NOT EXISTS commander_spending_limits (
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

CREATE INDEX IF NOT EXISTS idx_exclusions_player ON commander_self_exclusions(player_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_exclusions_venue ON commander_self_exclusions(venue_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_spending_limits_player ON commander_spending_limits(player_id);

-- ===================
-- NETWORK FEATURES (LEAGUES)
-- ===================

CREATE TABLE IF NOT EXISTS commander_leagues (
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

CREATE TABLE IF NOT EXISTS commander_league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES commander_leagues(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_leagues_status ON commander_leagues(status, season_start);
CREATE INDEX IF NOT EXISTS idx_leagues_organizer ON commander_leagues(organizer_id);
CREATE INDEX IF NOT EXISTS idx_league_standings_league ON commander_league_standings(league_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_league_standings_player ON commander_league_standings(player_id);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE commander_waitlist_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_waitlist_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_dealer_rotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_home_game_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_escrow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_dealer_marketplace ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_equipment_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_wait_time_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_player_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_hand_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_tax_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_self_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_spending_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_league_standings ENABLE ROW LEVEL SECURITY;

-- Dealers: Staff can manage
CREATE POLICY dealers_staff_access ON commander_dealers
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Dealer rotations: Staff can manage
CREATE POLICY rotations_staff_access ON commander_dealer_rotations
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Incidents: Staff can manage
CREATE POLICY incidents_staff_access ON commander_incidents
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Home game reviews: Reviewers and hosts can see
CREATE POLICY reviews_access ON commander_home_game_reviews
  FOR SELECT USING (
    reviewer_id = auth.uid() OR
    game_id IN (SELECT id FROM commander_home_games WHERE host_id = auth.uid())
  );

CREATE POLICY reviews_insert ON commander_home_game_reviews
  FOR INSERT WITH CHECK (reviewer_id = auth.uid());

-- Self exclusions: Players manage their own
CREATE POLICY exclusions_player_access ON commander_self_exclusions
  FOR ALL USING (player_id = auth.uid());

-- Spending limits: Players manage their own
CREATE POLICY limits_player_access ON commander_spending_limits
  FOR ALL USING (player_id = auth.uid());

-- Leagues: Public read for active leagues
CREATE POLICY leagues_public_read ON commander_leagues
  FOR SELECT USING (status IN ('upcoming', 'active', 'completed'));

CREATE POLICY leagues_organizer_manage ON commander_leagues
  FOR ALL USING (organizer_id = auth.uid());

-- League standings: Public read
CREATE POLICY standings_public_read ON commander_league_standings
  FOR SELECT USING (true);

-- Marketplace: Public read for active listings
CREATE POLICY marketplace_public_read ON commander_dealer_marketplace
  FOR SELECT USING (status = 'active');

CREATE POLICY marketplace_dealer_manage ON commander_dealer_marketplace
  FOR ALL USING (dealer_id = auth.uid());

-- Equipment: Public read for available
CREATE POLICY equipment_public_read ON commander_equipment_rentals
  FOR SELECT USING (available = true);

-- Streams: Staff can manage
CREATE POLICY streams_staff_access ON commander_streams
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Hand history: Staff can view
CREATE POLICY hand_history_staff_access ON commander_hand_history
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Tax events: Staff and player can view
CREATE POLICY tax_events_access ON commander_tax_events
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Waitlist groups: Players and staff can view
CREATE POLICY waitlist_groups_access ON commander_waitlist_groups
  FOR SELECT USING (
    leader_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY waitlist_groups_create ON commander_waitlist_groups
  FOR INSERT WITH CHECK (leader_id = auth.uid());

-- AI predictions: Staff can view
CREATE POLICY predictions_staff_access ON commander_wait_time_predictions
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Recommendations: Players see their own
CREATE POLICY recommendations_player_access ON commander_player_recommendations
  FOR SELECT USING (player_id = auth.uid());

-- Escrow: Players and hosts can view
CREATE POLICY escrow_access ON commander_escrow_transactions
  FOR SELECT USING (
    player_id = auth.uid() OR
    home_game_id IN (SELECT id FROM commander_home_games WHERE host_id = auth.uid())
  );

-- =====================================================
-- SCHEMA VERSION
-- =====================================================

COMMENT ON TABLE commander_dealers IS 'Club Commander - Dealer roster and management';
COMMENT ON TABLE commander_incidents IS 'Club Commander - Incident reports and tracking';
COMMENT ON TABLE commander_leagues IS 'Club Commander - League/circuit management';
COMMENT ON TABLE commander_self_exclusions IS 'Club Commander - Responsible gaming self-exclusions';
