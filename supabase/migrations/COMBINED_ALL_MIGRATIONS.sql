-- ================================================================
-- COMBINED MIGRATION: All pending Commander migrations
-- Run this in Supabase SQL Editor: Dashboard > SQL Editor > New Query
-- Or set DATABASE_URL in Vercel and hit the migration endpoint
-- ================================================================


-- ================================================================
-- FILE: 20260211_commander_phase7.sql
-- ================================================================
-- =====================================================
-- CLUB COMMANDER - PHASE 7 MIGRATION
-- =====================================================
-- New tables for: Comp system, Activity feed, End-of-Day close,
-- Display device management, Member import history,
-- Dealer rotations, Floor calls
-- =====================================================

-- ===================
-- TABLE 1: commander_comp_balances
-- ===================
-- Tracks comp dollar balances per member
CREATE TABLE IF NOT EXISTS commander_comp_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES commander_members(id) ON DELETE CASCADE,
  balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  lifetime_earned NUMERIC(10,2) NOT NULL DEFAULT 0,
  lifetime_redeemed NUMERIC(10,2) NOT NULL DEFAULT 0,
  last_earned_at TIMESTAMPTZ,
  last_redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_comp_balance_member UNIQUE(venue_id, member_id)
);

CREATE INDEX idx_comp_balances_venue ON commander_comp_balances(venue_id);
CREATE INDEX idx_comp_balances_member ON commander_comp_balances(member_id);

ALTER TABLE commander_comp_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_comp_balances"
  ON commander_comp_balances FOR ALL USING (true) WITH CHECK (true);

-- ===================
-- TABLE 2: commander_comp_transactions
-- ===================
-- Audit trail for all comp awards and redemptions
CREATE TABLE IF NOT EXISTS commander_comp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES commander_members(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('award', 'redemption', 'adjustment', 'auto_earn', 'expiry')),
  amount NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2),
  reason TEXT,
  game_type TEXT,
  table_number INTEGER,
  awarded_by UUID, -- staff who issued
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comp_transactions_venue ON commander_comp_transactions(venue_id);
CREATE INDEX idx_comp_transactions_member ON commander_comp_transactions(member_id);
CREATE INDEX idx_comp_transactions_created ON commander_comp_transactions(created_at DESC);

ALTER TABLE commander_comp_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_comp_transactions"
  ON commander_comp_transactions FOR ALL USING (true) WITH CHECK (true);

-- ===================
-- TABLE 3: commander_comp_rates
-- ===================
-- Auto-comp earning rates per game type per hour
CREATE TABLE IF NOT EXISTS commander_comp_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  game_type TEXT NOT NULL,
  stakes TEXT,
  rate_per_hour NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  membership_tier TEXT DEFAULT 'standard',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comp_rates_venue ON commander_comp_rates(venue_id);

ALTER TABLE commander_comp_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_comp_rates"
  ON commander_comp_rates FOR ALL USING (true) WITH CHECK (true);

-- ===================
-- TABLE 4: commander_activity_log
-- ===================
-- Global activity log for the poker room
CREATE TABLE IF NOT EXISTS commander_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- check_in, check_out, seated, removed, time_purchased, table_opened, etc
  message TEXT NOT NULL,
  detail TEXT,
  actor_id UUID,
  actor_name TEXT,
  member_id UUID,
  table_number INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_log_venue ON commander_activity_log(venue_id, created_at DESC);
CREATE INDEX idx_activity_log_type ON commander_activity_log(event_type);

ALTER TABLE commander_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_activity_log"
  ON commander_activity_log FOR ALL USING (true) WITH CHECK (true);

-- ===================
-- TABLE 5: commander_day_closes
-- ===================
-- End-of-day close records
CREATE TABLE IF NOT EXISTS commander_day_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  close_date DATE NOT NULL,
  closed_by UUID NOT NULL, -- manager who signed off
  closed_by_name TEXT,
  
  -- Summary stats
  total_checkins INTEGER DEFAULT 0,
  unique_players INTEGER DEFAULT 0,
  table_hours NUMERIC(10,2) DEFAULT 0,
  peak_tables INTEGER DEFAULT 0,
  time_revenue NUMERIC(10,2) DEFAULT 0,
  tournament_revenue NUMERIC(10,2) DEFAULT 0,
  comps_awarded NUMERIC(10,2) DEFAULT 0,
  incident_count INTEGER DEFAULT 0,
  
  -- Notes
  shift_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_day_close UNIQUE(venue_id, close_date)
);

ALTER TABLE commander_day_closes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_day_closes"
  ON commander_day_closes FOR ALL USING (true) WITH CHECK (true);

-- ===================
-- TABLE 6: commander_dealer_rotations
-- ===================
-- Tracks dealer assignments to tables
CREATE TABLE IF NOT EXISTS commander_dealer_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  dealer_id UUID NOT NULL,
  dealer_name TEXT,
  table_number INTEGER NOT NULL,
  rotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  break_after BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dealer_rotations_venue ON commander_dealer_rotations(venue_id, rotation_date);
CREATE INDEX idx_dealer_rotations_dealer ON commander_dealer_rotations(dealer_id, ended_at NULLS FIRST);

ALTER TABLE commander_dealer_rotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_dealer_rotations"
  ON commander_dealer_rotations FOR ALL USING (true) WITH CHECK (true);

-- ===================
-- TABLE 7: commander_display_devices
-- ===================
-- Registered TV/display devices
CREATE TABLE IF NOT EXISTS commander_display_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  device_id TEXT NOT NULL, -- unique device identifier
  name TEXT NOT NULL, -- "Lobby TV 1", "Floor Monitor 3"
  display_type TEXT NOT NULL DEFAULT 'combined', -- waitlist, tables, combined, tournament_clock, lobby, etc
  location TEXT, -- "main entrance", "floor podium"
  config JSONB DEFAULT '{}', -- display-specific settings
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_heartbeat TIMESTAMPTZ,
  ip_address TEXT,
  resolution TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_display_device UNIQUE(venue_id, device_id)
);

CREATE INDEX idx_display_devices_venue ON commander_display_devices(venue_id, is_active);

ALTER TABLE commander_display_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_display_devices"
  ON commander_display_devices FOR ALL USING (true) WITH CHECK (true);

-- ===================
-- TABLE 8: commander_member_imports
-- ===================
-- Tracks bulk member import history
CREATE TABLE IF NOT EXISTS commander_member_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  imported_by UUID NOT NULL,
  filename TEXT,
  total_rows INTEGER DEFAULT 0,
  successful INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE commander_member_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_member_imports"
  ON commander_member_imports FOR ALL USING (true) WITH CHECK (true);

-- ===================
-- TABLE 9: commander_floor_calls
-- ===================
-- Floor manager call requests from dealers/players
CREATE TABLE IF NOT EXISTS commander_floor_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  table_number INTEGER NOT NULL,
  reason TEXT NOT NULL, -- 'ruling', 'dispute', 'player_issue', 'emergency'
  description TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'en_route', 'resolved')),
  called_by TEXT,
  responded_by UUID,
  responded_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_floor_calls_venue ON commander_floor_calls(venue_id, status);
CREATE INDEX idx_floor_calls_pending ON commander_floor_calls(venue_id) WHERE status = 'pending';

ALTER TABLE commander_floor_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_floor_calls"
  ON commander_floor_calls FOR ALL USING (true) WITH CHECK (true);

-- ===================
-- Add comp_balance column to members
-- ===================
ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS comp_balance NUMERIC(10,2) DEFAULT 0;

-- ===================
-- Add game_type and stakes to tables
-- ===================
ALTER TABLE commander_tables ADD COLUMN IF NOT EXISTS game_type TEXT;
ALTER TABLE commander_tables ADD COLUMN IF NOT EXISTS stakes TEXT;
ALTER TABLE commander_tables ADD COLUMN IF NOT EXISTS occupied_seats INTEGER DEFAULT 0;
ALTER TABLE commander_tables ADD COLUMN IF NOT EXISTS player_count INTEGER DEFAULT 0;


-- ================================================================
-- FILE: 20260211_commander_table_assignments.sql
-- ================================================================
-- =============================================
-- Commander Phase 8: Table Assignment System
-- Adds mode (inactive/cash/tournament) and tournament_id to tables
-- =============================================

-- Add mode column for table assignment
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'inactive'
    CHECK (mode IN ('inactive', 'cash', 'tournament'));

-- Add tournament reference
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES commander_tournaments(id) ON DELETE SET NULL;

-- Add game description fields stored on table for quick reference
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS game_type TEXT;

ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS stakes TEXT;

-- Add assigned_at timestamp
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- Add assigned_by for audit
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id);

-- Index for tournament table lookups
CREATE INDEX IF NOT EXISTS idx_commander_tables_tournament
  ON commander_tables(tournament_id) WHERE tournament_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commander_tables_mode
  ON commander_tables(venue_id, mode);


-- ================================================================
-- FILE: 20260212_cash_transactions.sql
-- ================================================================
-- Cash Game Buy-In/Cash-Out Tracking
-- Tracks chip purchases and redemptions per player session

CREATE TABLE IF NOT EXISTS commander_cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  session_id UUID REFERENCES commander_time_sessions(id),
  player_name TEXT NOT NULL,
  table_number INT,
  seat_number INT,
  type TEXT NOT NULL CHECK (type IN ('buy_in', 'cash_out', 'add_on')),
  amount DECIMAL(10,2) NOT NULL,
  chip_count DECIMAL(10,2),
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'comp', 'marker')),
  processed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_tx_venue ON commander_cash_transactions(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_tx_session ON commander_cash_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_tx_table ON commander_cash_transactions(venue_id, table_number);

ALTER TABLE commander_cash_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON commander_cash_transactions FOR ALL USING (true);

-- Add game_id to time_sessions if not exists
DO $$ BEGIN
  ALTER TABLE commander_time_sessions ADD COLUMN IF NOT EXISTS game_id UUID;
  ALTER TABLE commander_time_sessions ADD COLUMN IF NOT EXISTS player_id UUID;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ================================================================
-- FILE: 20260212_shift_handoffs.sql
-- ================================================================
-- Shift Handoff system for floor staff transitions
-- Outgoing floor passes context (open tables, issues, notes) to incoming

CREATE TABLE IF NOT EXISTS commander_shift_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  outgoing_staff_id UUID NOT NULL,
  outgoing_staff_name TEXT NOT NULL,
  incoming_staff_id UUID,
  incoming_staff_name TEXT,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  handoff_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'expired')),

  -- Snapshot of floor state at handoff
  open_tables_count INTEGER DEFAULT 0,
  active_players_count INTEGER DEFAULT 0,
  waitlist_count INTEGER DEFAULT 0,
  open_incidents_count INTEGER DEFAULT 0,

  -- Staff notes
  notes TEXT,
  issues TEXT,
  vip_alerts TEXT,
  pending_actions TEXT,

  -- Table-level detail (JSON array of table snapshots)
  table_snapshot JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_handoffs_venue ON commander_shift_handoffs(venue_id, shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_shift_handoffs_status ON commander_shift_handoffs(venue_id, status);


-- ================================================================
-- FILE: 20260212_table_ratings_seat_prefs.sql
-- ================================================================
-- Table Atmosphere Ratings
-- Players rate tables after sessions on action, friendliness, pace
-- Aggregated to show "Table Vibe" in player-facing views

CREATE TABLE IF NOT EXISTS commander_table_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  table_number INTEGER NOT NULL,
  player_id UUID,
  session_id UUID,
  action_level INTEGER NOT NULL CHECK (action_level BETWEEN 1 AND 5),   -- 1=tight, 5=wild
  friendliness INTEGER NOT NULL CHECK (friendliness BETWEEN 1 AND 5),   -- 1=serious, 5=social
  pace INTEGER NOT NULL CHECK (pace BETWEEN 1 AND 5),                    -- 1=slow, 5=fast
  game_type TEXT,
  stakes TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_ratings_venue ON commander_table_ratings(venue_id, table_number);
CREATE INDEX IF NOT EXISTS idx_table_ratings_recent ON commander_table_ratings(venue_id, created_at DESC);

-- Seat preferences for players
CREATE TABLE IF NOT EXISTS commander_seat_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL,
  venue_id UUID,
  preferred_seats INTEGER[] DEFAULT '{}',   -- e.g. {1, 9} for corners
  left_handed BOOLEAN DEFAULT false,
  near_tv BOOLEAN,
  away_from_tv BOOLEAN,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_seat_prefs_player ON commander_seat_preferences(player_id);


-- ================================================================
-- FILE: 20260212_player_reputation.sql
-- ================================================================
-- Player Reputation System
-- Tracks reliability, sportsmanship, etiquette, communication
-- Used across venues for trust scoring

CREATE TABLE IF NOT EXISTS commander_player_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL,
  reviewer_id UUID NOT NULL,           -- Staff or player who left the review
  reviewer_type TEXT NOT NULL DEFAULT 'staff',  -- 'staff', 'player', 'host'
  venue_id UUID,
  reliability INTEGER CHECK (reliability BETWEEN 1 AND 5),
  sportsmanship INTEGER CHECK (sportsmanship BETWEEN 1 AND 5),
  etiquette INTEGER CHECK (etiquette BETWEEN 1 AND 5),
  communication INTEGER CHECK (communication BETWEEN 1 AND 5),
  comment TEXT,
  context TEXT,                         -- 'cash_game', 'tournament', 'home_game'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reputation_player ON commander_player_reputation(player_id);
CREATE INDEX IF NOT EXISTS idx_reputation_venue ON commander_player_reputation(venue_id);

-- Aggregated reputation scores (materialized for fast lookup)
CREATE TABLE IF NOT EXISTS commander_player_reputation_scores (
  player_id UUID PRIMARY KEY,
  overall_score NUMERIC(3,2) DEFAULT 0,
  reliability_avg NUMERIC(3,2) DEFAULT 0,
  sportsmanship_avg NUMERIC(3,2) DEFAULT 0,
  etiquette_avg NUMERIC(3,2) DEFAULT 0,
  communication_avg NUMERIC(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  id_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  payment_verified BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ================================================================
-- FILE: 20260212_pvp_stats_table.sql
-- ================================================================
-- PvP Stats Table: Persistent win/loss tracking
-- Stores lifetime PvP stats per user

CREATE TABLE IF NOT EXISTS trivia_pvp_stats (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    ties INTEGER NOT NULL DEFAULT 0,
    win_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    total_diamonds_won INTEGER NOT NULL DEFAULT 0,
    total_diamonds_lost INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE trivia_pvp_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stats" ON trivia_pvp_stats
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own stats" ON trivia_pvp_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats" ON trivia_pvp_stats
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role bypass for cron/cleanup operations
CREATE POLICY "Service role full access on pvp_stats" ON trivia_pvp_stats
    FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE trivia_pvp_stats IS 'Persistent PvP win/loss/tie stats per user';


-- ================================================================
-- FILE: 20260212_membership_plans.sql
-- ================================================================
-- Club Commander: Membership Plans & Pricing
-- Allows clubs to set daily/weekly/monthly/yearly membership prices per tier

CREATE TABLE IF NOT EXISTS commander_membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER NOT NULL REFERENCES poker_venues(id) ON DELETE CASCADE,
  
  -- Plan identity
  tier TEXT NOT NULL,                    -- 'standard', 'gold', 'platinum', 'vip', or custom
  name TEXT NOT NULL,                    -- Display name: 'Gold Membership', 'VIP Access', etc.
  description TEXT,                      -- What's included
  color TEXT DEFAULT '#1877F2',          -- Badge color
  sort_order INTEGER DEFAULT 0,
  
  -- Pricing (null = not offered at this interval)
  price_daily DECIMAL(10,2),             -- e.g. $20/day
  price_weekly DECIMAL(10,2),            -- e.g. $100/week
  price_monthly DECIMAL(10,2),           -- e.g. $300/month
  price_yearly DECIMAL(10,2),            -- e.g. $2500/year
  
  -- Seat fee override (if this tier gets a different hourly rate)
  seat_fee_override DECIMAL(10,2),       -- null = use default game rate
  seat_fee_discount_pct DECIMAL(5,2) DEFAULT 0,  -- e.g. 10 = 10% off seat fees
  
  -- Perks
  comp_multiplier DECIMAL(5,2) DEFAULT 1.0,  -- 1.5 = earn 50% more comp points
  priority_waitlist BOOLEAN DEFAULT false,    -- Bumps to front of waitlist
  free_food_drinks BOOLEAN DEFAULT false,
  free_parking BOOLEAN DEFAULT false,
  guest_passes_per_month INTEGER DEFAULT 0,
  reserved_seating BOOLEAN DEFAULT false,
  tournament_discount_pct DECIMAL(5,2) DEFAULT 0,
  
  -- Custom perks (flexible JSON for venue-specific benefits)
  custom_perks JSONB DEFAULT '[]',       -- [{name: "Free massage/hr", value: "1"}]
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  max_members INTEGER,                   -- null = unlimited
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(venue_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_membership_plans_venue ON commander_membership_plans(venue_id, is_active);

-- Seed default plans for existing venues (they can customize later)
-- This runs idempotently - won't duplicate if already exists
INSERT INTO commander_membership_plans (venue_id, tier, name, description, color, sort_order, price_daily, price_monthly, price_yearly, comp_multiplier, priority_waitlist)
SELECT 
  v.id,
  tier.tier,
  tier.name,
  tier.description,
  tier.color,
  tier.sort_order,
  tier.price_daily,
  tier.price_monthly,
  tier.price_yearly,
  tier.comp_multiplier,
  tier.priority_waitlist
FROM poker_venues v
CROSS JOIN (VALUES
  ('standard', 'Standard', 'Basic access to the poker room', '#B0B3B8', 0, NULL, NULL, NULL, 1.0, false),
  ('gold', 'Gold Member', 'Priority seating and comp bonuses', '#F59E0B', 1, 25.00, 199.00, 1999.00, 1.25, false),
  ('platinum', 'Platinum Member', 'Premium benefits and reserved seating', '#94A3B8', 2, 40.00, 349.00, 3499.00, 1.5, true),
  ('vip', 'VIP', 'All-access with maximum perks', '#8B5CF6', 3, 75.00, 599.00, 5999.00, 2.0, true)
) AS tier(tier, name, description, color, sort_order, price_daily, price_monthly, price_yearly, comp_multiplier, priority_waitlist)
WHERE EXISTS (SELECT 1 FROM commander_subscriptions cs WHERE cs.venue_id = v.id)
ON CONFLICT (venue_id, tier) DO NOTHING;


-- ================================================================
-- FILE: 20260212_game_types_presets.sql
-- ================================================================
-- Club Commander: Game Type Configuration + Room Presets
-- Closes TC parity gaps for Configuration and Setups modules

-- ===================
-- GAME TYPE TEMPLATES
-- ===================
-- Defines the game types available at a venue (NLH, PLO, Limit, etc.)
-- with default stakes, buy-in ranges, rake configs

CREATE TABLE IF NOT EXISTS commander_game_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- 'No Limit Hold''em', 'Pot Limit Omaha', etc.
  short_code TEXT NOT NULL,        -- 'NLH', 'PLO', 'PLO5', 'LHE', 'MIXED', 'STUD'
  stakes TEXT NOT NULL,            -- '1/3', '2/5', '5/10', etc.
  min_buyin INTEGER NOT NULL DEFAULT 100,
  max_buyin INTEGER DEFAULT 0,     -- 0 = no cap
  max_players INTEGER DEFAULT 9,   -- 9 for holdem, 8 for stud, etc.
  rake_type TEXT DEFAULT 'pot',    -- 'pot' (% of pot), 'time' (per-hour), 'none'
  rake_percent DECIMAL(5,2) DEFAULT 5.00,
  rake_cap DECIMAL(10,2) DEFAULT 15.00,
  time_rate DECIMAL(10,2) DEFAULT 0,  -- $/hour for time games
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  color TEXT DEFAULT '#1877F2',    -- Display color on waitlist/displays
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_types_venue ON commander_game_types(venue_id, is_active);

-- ===================
-- ROOM PRESETS
-- ===================
-- Saved room configurations that can be applied with one click
-- e.g. "Friday Night" = 8 NLH 1/3 tables + 2 PLO 1/2 tables + 1 NLH 2/5

CREATE TABLE IF NOT EXISTS commander_room_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- 'Friday Night', 'Tournament Day', 'Slow Monday'
  description TEXT,
  tables JSONB NOT NULL DEFAULT '[]', 
  -- Array of: { game_type_id, game_type_name, stakes, count, min_buyin, max_buyin }
  is_default BOOLEAN DEFAULT false,
  auto_apply_schedule JSONB,      -- Optional: { days: [5,6], start_time: "18:00" }
  created_by UUID,
  last_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_presets_venue ON commander_room_presets(venue_id);

-- ===================
-- SYSTEM AUDIT LOG
-- ===================
-- For the System Information / Activity page

CREATE TABLE IF NOT EXISTS commander_system_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  action TEXT NOT NULL,            -- 'settings_changed', 'preset_applied', 'room_opened', 'room_closed', etc.
  details JSONB DEFAULT '{}',
  performed_by UUID,
  performed_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_log_venue ON commander_system_log(venue_id, created_at DESC);


-- ================================================================
-- FILE: 20260212_members_comp_balance.sql
-- ================================================================
-- Add comp_balance to commander_members for staff-facing comp tracking
-- This is the simpler model: each venue member has a direct comp balance
-- that staff can award/deduct via PIN authorization

ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS comp_balance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS comp_lifetime_earned DECIMAL(10,2) DEFAULT 0;
ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS comp_lifetime_redeemed DECIMAL(10,2) DEFAULT 0;

-- Comp transaction log tied to members (not auth profiles)
CREATE TABLE IF NOT EXISTS commander_member_comp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER NOT NULL REFERENCES poker_venues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES commander_members(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL DEFAULT 'award', -- 'award', 'redeem', 'adjustment'
  reason TEXT,
  authorized_by TEXT,
  authorized_pin BOOLEAN DEFAULT false,
  processed_by UUID,
  balance_after DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_comp_log_venue ON commander_member_comp_log(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_comp_log_member ON commander_member_comp_log(member_id, created_at DESC);


-- ================================================================
-- FILE: 20260212_tournament_brackets_and_rls.sql
-- ================================================================
-- Tournament bracket system tables and PvP queue RLS fix

-- Add bracket columns to trivia_tournaments
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS tournament_type TEXT DEFAULT 'bracket';
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS current_round INTEGER DEFAULT 0;
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS total_rounds INTEGER;
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS round_deadline TIMESTAMPTZ;
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS winners JSONB DEFAULT NULL;
ALTER TABLE trivia_tournaments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- Tournament rounds table for bracket tracking
CREATE TABLE IF NOT EXISTS trivia_tournament_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES trivia_tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    deadline TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'complete')),
    matchups JSONB DEFAULT '[]'::jsonb
);

ALTER TABLE trivia_tournament_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rounds" ON trivia_tournament_rounds
    FOR SELECT USING (true);

CREATE POLICY "Service role manages rounds" ON trivia_tournament_rounds
    FOR ALL USING (auth.role() = 'service_role');

-- Add bracket info columns to tournament entries
ALTER TABLE trivia_tournament_entries ADD COLUMN IF NOT EXISTS eliminated_round INTEGER;
ALTER TABLE trivia_tournament_entries ADD COLUMN IF NOT EXISTS seed_number INTEGER;

-- Fix PvP queue RLS
DROP POLICY IF EXISTS "Users can insert own queue entry" ON trivia_pvp_queue;
DROP POLICY IF EXISTS "Authenticated users can insert" ON trivia_pvp_queue;
DROP POLICY IF EXISTS "Service role queue access" ON trivia_pvp_queue;

CREATE POLICY "Authenticated users can insert queue" ON trivia_pvp_queue
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can view own queue entries" ON trivia_pvp_queue
    FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can update own queue entries" ON trivia_pvp_queue
    FOR UPDATE USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can delete own queue entries" ON trivia_pvp_queue
    FOR DELETE USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- Tournament notification flags table
CREATE TABLE IF NOT EXISTS trivia_tournament_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES trivia_tournaments(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('round_start', 'forfeit_warning', 'eliminated', 'winner')),
    message TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trivia_tournament_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON trivia_tournament_notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON trivia_tournament_notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role manages notifications" ON trivia_tournament_notifications
    FOR ALL USING (auth.role() = 'service_role');


-- ================================================================
-- FILE: 20260212_staff_name_fields.sql
-- ================================================================
-- Migration: Staff can be added by name without requiring a user account
-- TC parity: managers type employee name + role + PIN, no account needed

-- Make user_id nullable (staff don't always have accounts)
ALTER TABLE commander_staff ALTER COLUMN user_id DROP NOT NULL;

-- Drop the foreign key constraint so user_id can be null
ALTER TABLE commander_staff DROP CONSTRAINT IF EXISTS commander_staff_user_id_fkey;
ALTER TABLE commander_staff ADD CONSTRAINT commander_staff_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Add display_name, email, phone for name-only employees
ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS phone TEXT;

-- Drop the unique constraint on (venue_id, user_id) since user_id can be null
ALTER TABLE commander_staff DROP CONSTRAINT IF EXISTS commander_staff_venue_id_user_id_key;

-- Add a partial unique constraint: only one record per user per venue (when user_id is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_commander_staff_venue_user_unique
  ON commander_staff(venue_id, user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN commander_staff.display_name IS 'Employee name — used when staff member has no user account';
COMMENT ON COLUMN commander_staff.email IS 'Employee email — optional contact info';
COMMENT ON COLUMN commander_staff.phone IS 'Employee phone — optional contact info';


-- ================================================================
-- FILE: 20260212_vip_system_rpcs.sql
-- ================================================================
/**
 * VIP System RPCs & Supporting Tables
 * Creates missing RPC functions and tables needed for VIP membership system
 * Migration: 20260212_vip_system_rpcs
 */

-- ============================================================================
-- 1. diamond_transactions table (audit log for all diamond movements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS diamond_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, -- positive = credit, negative = debit
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'game_cost', 'game_reward', 'feature_unlock', 'purchase', 
        'bonus', 'refund', 'admin', 'daily_reward', 'achievement'
    )),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    balance_after INTEGER, -- snapshot of balance after transaction
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diamond_transactions_user_id ON diamond_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_type ON diamond_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_created_at ON diamond_transactions(created_at DESC);

ALTER TABLE diamond_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own transactions"
    ON diamond_transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Service role can manage all transactions"
    ON diamond_transactions FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- 2. vip_feature_dismissals table (tracks one-time popup dismissals)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vip_feature_dismissals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    dismissed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_vip_feature_dismissals_user ON vip_feature_dismissals(user_id);

ALTER TABLE vip_feature_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own dismissals"
    ON vip_feature_dismissals FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own dismissals"
    ON vip_feature_dismissals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 3. get_user_vip_status RPC
-- Returns true if user is VIP (checks profiles.is_vip)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_vip_status(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_vip BOOLEAN;
BEGIN
    SELECT is_vip INTO v_is_vip
    FROM profiles
    WHERE id = p_user_id;
    
    RETURN COALESCE(v_is_vip, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. deduct_diamonds RPC
-- Atomic diamond deduction with balance check and transaction logging
-- ============================================================================
CREATE OR REPLACE FUNCTION deduct_diamonds(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT DEFAULT 'game_cost',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
    v_current_balance INTEGER;
    v_new_balance INTEGER;
BEGIN
    -- Lock the row to prevent race conditions
    SELECT COALESCE(diamonds, 0) INTO v_current_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;
    
    -- Check sufficient balance
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient diamonds',
            'balance', v_current_balance,
            'required', p_amount
        );
    END IF;
    
    -- Deduct
    v_new_balance := v_current_balance - p_amount;
    
    UPDATE profiles
    SET diamonds = v_new_balance
    WHERE id = p_user_id;
    
    -- Log transaction
    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, description, metadata, balance_after
    ) VALUES (
        p_user_id,
        -p_amount,
        p_source,
        'Diamond deduction: ' || p_source,
        p_metadata,
        v_new_balance
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'balance', v_new_balance,
        'deducted', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. Fix update_profile_vip_status trigger to also sync is_vip field
-- ============================================================================
CREATE OR REPLACE FUNCTION update_profile_vip_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' OR NEW.status = 'trialing' THEN
        UPDATE profiles
        SET 
            is_vip = true,
            vip_tier = NEW.tier,
            vip_expires_at = NEW.current_period_end,
            vip_canceled_at = NULL
        WHERE id = NEW.user_id;
    ELSIF NEW.status = 'canceled' THEN
        UPDATE profiles
        SET 
            is_vip = false,
            vip_tier = NULL,
            vip_canceled_at = NEW.canceled_at
        WHERE id = NEW.user_id;
    ELSIF NEW.status IN ('past_due', 'unpaid') THEN
        -- Keep VIP active during grace period but flag it
        UPDATE profiles
        SET vip_tier = NEW.tier
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

