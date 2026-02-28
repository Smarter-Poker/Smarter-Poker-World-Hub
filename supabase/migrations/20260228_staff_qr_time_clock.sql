-- Staff QR Code, Time Clock & Dealer Scan-In
-- Run in Supabase Dashboard > SQL Editor

-- 1. Time clock table for staff shift tracking
CREATE TABLE IF NOT EXISTS commander_time_clock (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id int NOT NULL,
  staff_id uuid NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  hours_worked numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS with service_role access
ALTER TABLE commander_time_clock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_time_clock" ON commander_time_clock;
CREATE POLICY "service_role_all_time_clock" ON commander_time_clock FOR ALL USING (true) WITH CHECK (true);

-- 2. Add member_id to commander_staff (links staff to their player/member record)
DO $$ BEGIN
  ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS member_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Add dealer_staff_id to commander_games (which dealer is at this table)
DO $$ BEGIN
  ALTER TABLE commander_games ADD COLUMN IF NOT EXISTS dealer_staff_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. Add ID fields to commander_staff for government ID storage
DO $$ BEGIN
  ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS id_type text;
  ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS id_number text;
  ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS id_state text;
  ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS id_expiry date;
  ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS photo_url text;
  ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS qr_code text;
  ALTER TABLE commander_staff ADD COLUMN IF NOT EXISTS date_of_birth date;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Index for fast clock-in lookups
CREATE INDEX IF NOT EXISTS idx_time_clock_venue_staff ON commander_time_clock(venue_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_time_clock_date ON commander_time_clock(clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_staff_qr_code ON commander_staff(qr_code) WHERE qr_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_member_id ON commander_staff(member_id) WHERE member_id IS NOT NULL;
