-- Club Commander Members Table
-- Stores registered club members for each venue
-- Each member gets a unique QR code printed on their player card

CREATE TABLE IF NOT EXISTS commander_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER NOT NULL REFERENCES poker_venues(id) ON DELETE CASCADE,
  member_number TEXT NOT NULL,
  qr_code TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  
  -- Personal info (from ID scan or manual entry)
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  
  -- ID document info
  id_type TEXT DEFAULT 'drivers_license',
  id_number TEXT,
  id_state TEXT,
  id_expiry DATE,
  
  -- Photo & address
  photo_url TEXT,
  address JSONB DEFAULT '{}',
  
  -- Membership
  membership_tier TEXT NOT NULL DEFAULT 'standard',
  membership_status TEXT NOT NULL DEFAULT 'active',
  membership_expires TIMESTAMPTZ,
  
  -- Tracking
  notes TEXT,
  total_visits INTEGER DEFAULT 0,
  total_hours_played NUMERIC(10,2) DEFAULT 0,
  last_visit TIMESTAMPTZ,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT uq_venue_member_number UNIQUE(venue_id, member_number),
  CONSTRAINT uq_venue_qr_code UNIQUE(venue_id, qr_code),
  CONSTRAINT chk_membership_tier CHECK (membership_tier IN ('standard', 'gold', 'platinum', 'vip')),
  CONSTRAINT chk_membership_status CHECK (membership_status IN ('active', 'suspended', 'expired', 'banned'))
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_commander_members_venue ON commander_members(venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_members_name ON commander_members(venue_id, last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_commander_members_qr ON commander_members(qr_code);
CREATE INDEX IF NOT EXISTS idx_commander_members_status ON commander_members(venue_id, membership_status);
CREATE INDEX IF NOT EXISTS idx_commander_members_phone ON commander_members(venue_id, phone) WHERE phone IS NOT NULL;

-- Enable RLS
ALTER TABLE commander_members ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (API routes use service role)
CREATE POLICY "Service role full access on commander_members"
  ON commander_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
