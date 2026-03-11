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
