-- =====================================================
-- Add missing columns to commander_dealer_rotations
-- The old schema (20260127) created this table without
-- dealer_name, table_number, rotation_date, duration_minutes, break_after
-- which are needed by the dealer scan-in system
-- =====================================================

-- Add table_number (for scan-in by table number instead of table UUID)
ALTER TABLE commander_dealer_rotations
  ADD COLUMN IF NOT EXISTS table_number INTEGER;

-- Add dealer_name (denormalized for quick display without joins)
ALTER TABLE commander_dealer_rotations
  ADD COLUMN IF NOT EXISTS dealer_name TEXT;

-- Add rotation_date (for daily rotation tracking)
ALTER TABLE commander_dealer_rotations
  ADD COLUMN IF NOT EXISTS rotation_date DATE DEFAULT CURRENT_DATE;

-- Add duration_minutes (for rotation duration tracking)
ALTER TABLE commander_dealer_rotations
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- Add break_after (dealer takes break after this rotation)
ALTER TABLE commander_dealer_rotations
  ADD COLUMN IF NOT EXISTS break_after BOOLEAN DEFAULT false;

-- Make dealer_id not require FK to commander_dealers
-- (scan-in uses commander_members.id instead)
-- Drop FK if it exists (safe, won't error if not present)
DO $$ BEGIN
  ALTER TABLE commander_dealer_rotations
    DROP CONSTRAINT IF EXISTS commander_dealer_rotations_dealer_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Add index for tablet lookups by table_number
CREATE INDEX IF NOT EXISTS idx_dealer_rotations_table_number
  ON commander_dealer_rotations(table_number, ended_at NULLS FIRST);

-- Also add commander_table_sessions if it doesn't exist
-- (needed for player time tracking on tablets)
CREATE TABLE IF NOT EXISTS commander_table_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL,
  member_id uuid REFERENCES commander_members(id),
  player_name text NOT NULL,
  table_number integer NOT NULL,
  seat_number integer NOT NULL,
  time_allocated_minutes integer NOT NULL DEFAULT 0,
  time_added_minutes integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  membership_tier text,
  member_number text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'expired', 'removed')),
  ended_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_active_seat UNIQUE (venue_id, table_number, seat_number, status)
);

CREATE INDEX IF NOT EXISTS idx_table_sessions_table
  ON commander_table_sessions (venue_id, table_number, status);
CREATE INDEX IF NOT EXISTS idx_table_sessions_member
  ON commander_table_sessions (member_id, status);

ALTER TABLE commander_table_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access on commander_table_sessions"
    ON commander_table_sessions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add member_type to commander_members if not exists
ALTER TABLE commander_members
  ADD COLUMN IF NOT EXISTS member_type TEXT DEFAULT 'player';

DO $$ BEGIN
  ALTER TABLE commander_members
    ADD CONSTRAINT chk_member_type
    CHECK (member_type IN ('player', 'employee', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_members_type
  ON commander_members(venue_id, member_type);
