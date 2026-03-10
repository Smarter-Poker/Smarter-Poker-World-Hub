-- ============================================================
-- Club Commander - Feature Expansion Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- Time Billing Sessions (Texas cardroom model)
CREATE TABLE IF NOT EXISTS commander_time_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  player_name TEXT NOT NULL,
  table_number INT,
  seat_number INT,
  rate_per_hour DECIMAL(8,2) NOT NULL DEFAULT 12.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_minutes INT,
  total_charge DECIMAL(10,2) DEFAULT 0,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  started_by UUID,
  ended_by UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_sessions_venue ON commander_time_sessions(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_time_sessions_active ON commander_time_sessions(venue_id) WHERE status = 'active';

-- Table Seats (for cash game seat tracking)
CREATE TABLE IF NOT EXISTS commander_table_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  table_number INT NOT NULL,
  seat_number INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'empty' CHECK (status IN ('empty', 'occupied', 'away', 'open', 'reserved')),
  player_name TEXT,
  member_id UUID,
  seated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venue_id, table_number, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_table_seats_venue ON commander_table_seats(venue_id, table_number);

-- Venue Settings
CREATE TABLE IF NOT EXISTS commander_venue_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL UNIQUE,
  room_open BOOLEAN DEFAULT false,
  default_game_type TEXT DEFAULT 'No Limit Hold''em',
  default_stakes TEXT DEFAULT '$1/$2',
  max_tables INT DEFAULT 20,
  default_seats_per_table INT DEFAULT 9,
  time_billing_rate DECIMAL(8,2) DEFAULT 12.00,
  late_reg_levels INT DEFAULT 8,
  default_starting_chips INT DEFAULT 15000,
  house_rules TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

-- Incidents / Floor Calls
CREATE TABLE IF NOT EXISTS commander_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'floor_call' CHECK (type IN ('floor_call', 'dispute', 'incident', 'maintenance', 'general')),
  table_number INT,
  description TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  reported_by UUID,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_venue ON commander_incidents(venue_id, status);

-- Member Check-ins
CREATE TABLE IF NOT EXISTS commander_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL,
  venue_id UUID,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkins_member ON commander_checkins(member_id);
CREATE INDEX IF NOT EXISTS idx_checkins_venue ON commander_checkins(venue_id, checked_in_at);

-- Add visit tracking columns to members if not exists
DO $$ BEGIN
  ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS visit_count INT DEFAULT 0;
  ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS last_checkin TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Add game_type and stakes to tables if not exists
DO $$ BEGIN
  ALTER TABLE commander_tables ADD COLUMN IF NOT EXISTS game_type TEXT;
  ALTER TABLE commander_tables ADD COLUMN IF NOT EXISTS stakes TEXT;
  ALTER TABLE commander_tables ADD COLUMN IF NOT EXISTS max_seats INT DEFAULT 9;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Add fields to waitlist for call/seat tracking
DO $$ BEGIN
  ALTER TABLE commander_waitlist ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ;
  ALTER TABLE commander_waitlist ADD COLUMN IF NOT EXISTS called_by UUID;
  ALTER TABLE commander_waitlist ADD COLUMN IF NOT EXISTS seated_at TIMESTAMPTZ;
  ALTER TABLE commander_waitlist ADD COLUMN IF NOT EXISTS seated_table INT;
  ALTER TABLE commander_waitlist ADD COLUMN IF NOT EXISTS seated_seat INT;
  ALTER TABLE commander_waitlist ADD COLUMN IF NOT EXISTS seated_by UUID;
  ALTER TABLE commander_waitlist ADD COLUMN IF NOT EXISTS member_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Enable RLS on new tables
ALTER TABLE commander_time_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_table_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_venue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_checkins ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (API uses service role key)
CREATE POLICY IF NOT EXISTS "Service role full access" ON commander_time_sessions FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Service role full access" ON commander_table_seats FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Service role full access" ON commander_venue_settings FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Service role full access" ON commander_incidents FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Service role full access" ON commander_checkins FOR ALL USING (true);
