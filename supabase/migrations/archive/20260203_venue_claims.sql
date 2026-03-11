-- =====================================================
-- VENUE CLAIMS & VERIFICATION SYSTEM
-- =====================================================
-- Allow venue owners to claim and manage their venues
-- Includes verification workflow and scraper tracking
-- =====================================================

-- ===================
-- TABLE 1: venue_claims
-- ===================
-- Track venue ownership claims

CREATE TABLE IF NOT EXISTS venue_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Claim Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'under_review', 'approved', 'rejected', 'revoked'
  )),

  -- Verification Method
  verification_method TEXT CHECK (verification_method IN (
    'phone', 'email', 'document', 'onsite', 'admin'
  )),

  -- Claimant Info
  claimant_name TEXT NOT NULL,
  claimant_title TEXT, -- e.g., "Poker Room Manager"
  claimant_email TEXT NOT NULL,
  claimant_phone TEXT,

  -- Verification Details
  verification_code TEXT,
  verification_attempts INTEGER DEFAULT 0,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id),

  -- Documents (stored in Supabase Storage)
  documents JSONB DEFAULT '[]', -- Array of { type, url, uploaded_at }

  -- Notes
  claimant_notes TEXT,
  admin_notes TEXT,
  rejection_reason TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate pending claims
  UNIQUE(venue_id, user_id, status)
);

CREATE INDEX IF NOT EXISTS idx_venue_claims_venue ON venue_claims(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_claims_user ON venue_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_venue_claims_status ON venue_claims(status);

-- ===================
-- TABLE 2: venue_managers
-- ===================
-- Link approved managers to venues

CREATE TABLE IF NOT EXISTS venue_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Role at Venue
  role TEXT DEFAULT 'manager' CHECK (role IN (
    'owner', 'manager', 'staff', 'marketing'
  )),

  -- Permissions
  can_edit_info BOOLEAN DEFAULT true,
  can_edit_hours BOOLEAN DEFAULT true,
  can_edit_games BOOLEAN DEFAULT true,
  can_post_updates BOOLEAN DEFAULT true,
  can_respond_reviews BOOLEAN DEFAULT true,
  can_manage_promotions BOOLEAN DEFAULT true,
  can_view_analytics BOOLEAN DEFAULT true,
  can_invite_staff BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  invited_by UUID REFERENCES profiles(id),
  approved_via UUID REFERENCES venue_claims(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_managers_venue ON venue_managers(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_managers_user ON venue_managers(user_id);

-- ===================
-- TABLE 3: venue_verification_log
-- ===================
-- Audit log of verification attempts and changes

CREATE TABLE IF NOT EXISTS venue_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES venue_claims(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Action
  action TEXT NOT NULL CHECK (action IN (
    'claim_submitted', 'code_sent', 'code_verified', 'code_failed',
    'document_uploaded', 'document_reviewed',
    'approved', 'rejected', 'revoked',
    'info_updated', 'manager_added', 'manager_removed'
  )),

  -- Details
  details JSONB,
  performed_by UUID REFERENCES profiles(id),
  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_log_claim ON venue_verification_log(claim_id);
CREATE INDEX IF NOT EXISTS idx_verification_log_venue ON venue_verification_log(venue_id);

-- ===================
-- TABLE 4: scraper_runs
-- ===================
-- Track scraper execution history

CREATE TABLE IF NOT EXISTS scraper_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error', 'partial')),

  -- Stats
  stats JSONB, -- { requestCount, successCount, errorCount, venuesFound, venuesUpdated, venuesCreated }

  -- Metadata
  metadata JSONB,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scraper_runs_source ON scraper_runs(source);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_started ON scraper_runs(started_at DESC);

-- ===================
-- TABLE 5: venue_tournament_schedules
-- ===================
-- Parsed tournament schedules from scrapers

CREATE TABLE IF NOT EXISTS venue_tournament_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Tournament Info
  name TEXT NOT NULL,
  game_type TEXT DEFAULT 'nlhe',
  days_of_week INTEGER[], -- 0=Sunday, 6=Saturday
  start_time TIME,

  -- Buy-in
  buyin_amount INTEGER,
  buyin_fee INTEGER,
  total_buyin INTEGER,
  rebuy_amount INTEGER,
  addon_amount INTEGER,

  -- Structure
  starting_chips INTEGER,
  blind_levels INTEGER, -- minutes per level
  guarantee INTEGER,
  late_reg_levels INTEGER,

  -- Metadata
  is_recurring BOOLEAN DEFAULT true,
  specific_date DATE, -- For non-recurring events
  series_name TEXT, -- e.g., "WSOP Circuit"
  notes TEXT,
  source TEXT, -- Scraper source
  raw_data JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_schedules_venue ON venue_tournament_schedules(venue_id);
CREATE INDEX IF NOT EXISTS idx_tournament_schedules_day ON venue_tournament_schedules USING GIN(days_of_week);

-- ===================
-- ADD COLUMNS TO poker_venues
-- ===================

-- Add scraper tracking columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'poker_venues' AND column_name = 'source') THEN
    ALTER TABLE poker_venues ADD COLUMN source TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'poker_venues' AND column_name = 'source_priority') THEN
    ALTER TABLE poker_venues ADD COLUMN source_priority INTEGER DEFAULT 5;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'poker_venues' AND column_name = 'last_scraped_at') THEN
    ALTER TABLE poker_venues ADD COLUMN last_scraped_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'poker_venues' AND column_name = 'is_claimed') THEN
    ALTER TABLE poker_venues ADD COLUMN is_claimed BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'poker_venues' AND column_name = 'claimed_by') THEN
    ALTER TABLE poker_venues ADD COLUMN claimed_by UUID REFERENCES profiles(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'poker_venues' AND column_name = 'claimed_at') THEN
    ALTER TABLE poker_venues ADD COLUMN claimed_at TIMESTAMPTZ;
  END IF;
END $$;

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE venue_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_verification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_tournament_schedules ENABLE ROW LEVEL SECURITY;

-- Claims: Users can see their own, admins see all
CREATE POLICY venue_claims_user ON venue_claims
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY venue_claims_insert ON venue_claims
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Managers: Users can see venues they manage
CREATE POLICY venue_managers_read ON venue_managers
  FOR SELECT USING (
    user_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM venue_managers WHERE user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Verification log: Admins only
CREATE POLICY verification_log_admin ON venue_verification_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Scraper runs: Admin only
CREATE POLICY scraper_runs_admin ON scraper_runs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Tournament schedules: Everyone can read
CREATE POLICY tournament_schedules_read ON venue_tournament_schedules
  FOR SELECT USING (true);

CREATE POLICY tournament_schedules_write ON venue_tournament_schedules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM venue_managers WHERE user_id = auth.uid() AND venue_id = venue_tournament_schedules.venue_id) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ===================
-- FUNCTIONS
-- ===================

-- Function to approve a venue claim
CREATE OR REPLACE FUNCTION approve_venue_claim(
  p_claim_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_claim RECORD;
BEGIN
  -- Get claim
  SELECT * INTO v_claim FROM venue_claims WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF v_claim.status != 'pending' AND v_claim.status != 'under_review' THEN
    RAISE EXCEPTION 'Claim is not pending';
  END IF;

  -- Update claim
  UPDATE venue_claims SET
    status = 'approved',
    verified_at = now(),
    verified_by = p_admin_id,
    admin_notes = COALESCE(p_notes, admin_notes),
    updated_at = now()
  WHERE id = p_claim_id;

  -- Add as venue manager
  INSERT INTO venue_managers (venue_id, user_id, role, approved_via)
  VALUES (v_claim.venue_id, v_claim.user_id, 'owner', p_claim_id)
  ON CONFLICT (venue_id, user_id) DO UPDATE SET
    role = 'owner',
    is_active = true,
    approved_via = p_claim_id,
    updated_at = now();

  -- Update venue
  UPDATE poker_venues SET
    is_claimed = true,
    claimed_by = v_claim.user_id,
    claimed_at = now()
  WHERE id = v_claim.venue_id;

  -- Log action
  INSERT INTO venue_verification_log (claim_id, venue_id, action, performed_by, details)
  VALUES (p_claim_id, v_claim.venue_id, 'approved', p_admin_id, jsonb_build_object('notes', p_notes));

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user is venue manager
CREATE OR REPLACE FUNCTION is_venue_manager(
  p_user_id UUID,
  p_venue_id INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM venue_managers
    WHERE user_id = p_user_id
    AND venue_id = p_venue_id
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql;

-- ===================
-- COMMENTS
-- ===================

COMMENT ON TABLE venue_claims IS 'Venue ownership claims submitted by users';
COMMENT ON TABLE venue_managers IS 'Users authorized to manage venues';
COMMENT ON TABLE venue_verification_log IS 'Audit log of venue verification activities';
COMMENT ON TABLE scraper_runs IS 'History of venue data scraper executions';
COMMENT ON TABLE venue_tournament_schedules IS 'Parsed tournament schedules for venues';
