-- =====================================================
-- CLUB COMMANDER - PHASE 6 COMPLETION MIGRATION
-- =====================================================
-- Tables: Onboarding Leads, Pilot Venues, Documentation Access
-- Phase: Scale & Polish - Final steps
-- Reference: IMPLEMENTATION_PHASES.md Steps 6.5, 6.6
-- =====================================================

-- ===================
-- TABLE 1: commander_onboarding_leads
-- ===================
-- Track venue onboarding pipeline

CREATE TABLE IF NOT EXISTS commander_onboarding_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Venue Info
  venue_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  table_count TEXT,
  current_system TEXT,
  notes TEXT,

  -- Pipeline Status
  status TEXT DEFAULT 'new' CHECK (status IN (
    'new', 'contacted', 'demo_scheduled', 'demo_completed',
    'negotiating', 'signed', 'setup', 'live', 'declined', 'lost'
  )),

  -- Assignment
  assigned_to UUID REFERENCES profiles(id),

  -- Dates
  demo_scheduled_at TIMESTAMPTZ,
  demo_completed_at TIMESTAMPTZ,
  contract_signed_at TIMESTAMPTZ,
  go_live_at TIMESTAMPTZ,
  next_follow_up TIMESTAMPTZ,

  -- Source Tracking
  source TEXT DEFAULT 'website',
  referral_code TEXT,
  utm_source TEXT,
  utm_campaign TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_leads_status ON commander_onboarding_leads(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_leads_assigned ON commander_onboarding_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_onboarding_leads_created ON commander_onboarding_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_leads_follow_up ON commander_onboarding_leads(next_follow_up);

-- ===================
-- TABLE 2: commander_pilot_venues
-- ===================
-- Track pilot venue performance and validation

CREATE TABLE IF NOT EXISTS commander_pilot_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Pilot Status
  pilot_start_date DATE NOT NULL,
  pilot_end_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'extended', 'cancelled')),

  -- Success Criteria Tracking
  uptime_percentage DECIMAL(5,2) DEFAULT 100.00,
  support_tickets_count INTEGER DEFAULT 0,
  staff_satisfaction_score DECIMAL(3,2),
  player_adoption_percentage DECIMAL(5,2),

  -- Weekly Check-ins
  weekly_reports JSONB DEFAULT '[]', -- Array of { week, notes, issues, resolved }

  -- Final Assessment
  final_assessment TEXT,
  converted_to_paid BOOLEAN DEFAULT false,
  conversion_date DATE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pilot_venues_status ON commander_pilot_venues(status);
CREATE INDEX IF NOT EXISTS idx_pilot_venues_venue ON commander_pilot_venues(venue_id);

-- ===================
-- TABLE 3: commander_documentation_access
-- ===================
-- Track who has accessed documentation (for training compliance)

CREATE TABLE IF NOT EXISTS commander_documentation_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  document_type TEXT NOT NULL CHECK (document_type IN (
    'staff_guide', 'manager_guide', 'faq', 'troubleshooting'
  )),

  -- Tracking
  first_accessed_at TIMESTAMPTZ DEFAULT now(),
  last_accessed_at TIMESTAMPTZ DEFAULT now(),
  access_count INTEGER DEFAULT 1,
  completed_reading BOOLEAN DEFAULT false,
  quiz_passed BOOLEAN DEFAULT false,

  UNIQUE(user_id, venue_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_doc_access_user ON commander_documentation_access(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_access_venue ON commander_documentation_access(venue_id);

-- ===================
-- TABLE 4: commander_system_alerts
-- ===================
-- Platform-wide system alerts and announcements

CREATE TABLE IF NOT EXISTS commander_system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert Content
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'maintenance', 'outage', 'degraded', 'feature', 'announcement'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),

  -- Targeting
  target_venues INTEGER[], -- NULL = all venues
  target_roles TEXT[], -- NULL = all roles

  -- Display
  show_banner BOOLEAN DEFAULT true,
  show_popup BOOLEAN DEFAULT false,
  dismissible BOOLEAN DEFAULT true,

  -- Schedule
  starts_at TIMESTAMPTZ DEFAULT now(),
  ends_at TIMESTAMPTZ,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_active ON commander_system_alerts(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON commander_system_alerts(alert_type);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE commander_onboarding_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_pilot_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_documentation_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_system_alerts ENABLE ROW LEVEL SECURITY;

-- Onboarding leads: Admin only
CREATE POLICY onboarding_leads_admin ON commander_onboarding_leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Pilot venues: Admin and venue owners
CREATE POLICY pilot_venues_access ON commander_pilot_venues
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)
  );

-- Documentation access: Users can see their own
CREATE POLICY doc_access_user ON commander_documentation_access
  FOR ALL USING (user_id = auth.uid());

-- System alerts: Everyone can read, admin can write
CREATE POLICY system_alerts_read ON commander_system_alerts
  FOR SELECT USING (
    (starts_at IS NULL OR starts_at <= now()) AND
    (ends_at IS NULL OR ends_at >= now())
  );

CREATE POLICY system_alerts_write ON commander_system_alerts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ===================
-- FUNCTIONS
-- ===================

-- Function to track documentation access
CREATE OR REPLACE FUNCTION track_doc_access(
  p_user_id UUID,
  p_venue_id INTEGER,
  p_document_type TEXT
) RETURNS void AS $$
BEGIN
  INSERT INTO commander_documentation_access (user_id, venue_id, document_type)
  VALUES (p_user_id, p_venue_id, p_document_type)
  ON CONFLICT (user_id, venue_id, document_type)
  DO UPDATE SET
    last_accessed_at = now(),
    access_count = commander_documentation_access.access_count + 1;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate pilot venue metrics
CREATE OR REPLACE FUNCTION calculate_pilot_metrics(p_venue_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_uptime DECIMAL;
  v_tickets INTEGER;
  v_adoption DECIMAL;
BEGIN
  -- Calculate uptime from system health
  SELECT
    100 - COALESCE(AVG(CASE WHEN metric_type = 'error_rate' THEN metric_value ELSE 0 END), 0)
  INTO v_uptime
  FROM commander_system_health
  WHERE venue_id = p_venue_id
  AND recorded_at > now() - INTERVAL '7 days';

  -- Count support tickets (from audit logs with issue category)
  SELECT COUNT(*)
  INTO v_tickets
  FROM commander_audit_logs
  WHERE venue_id = p_venue_id
  AND action_category = 'admin'
  AND action LIKE '%issue%'
  AND created_at > now() - INTERVAL '7 days';

  -- Calculate player adoption
  SELECT
    CASE WHEN COUNT(DISTINCT CASE WHEN player_id IS NOT NULL THEN id END) = 0 THEN 0
    ELSE (COUNT(DISTINCT CASE WHEN signup_method = 'app' THEN id END)::DECIMAL /
          COUNT(DISTINCT id)::DECIMAL) * 100
    END
  INTO v_adoption
  FROM commander_waitlist
  WHERE venue_id = p_venue_id
  AND created_at > now() - INTERVAL '7 days';

  v_result := jsonb_build_object(
    'uptime_percentage', COALESCE(v_uptime, 100),
    'support_tickets', COALESCE(v_tickets, 0),
    'player_adoption', COALESCE(v_adoption, 0),
    'calculated_at', now()
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ===================
-- UPDATE ONBOARDING REQUEST API
-- ===================
-- Modify the existing onboarding request to insert into leads table

-- Create trigger to convert onboarding requests to leads
CREATE OR REPLACE FUNCTION onboarding_request_to_lead()
RETURNS TRIGGER AS $$
BEGIN
  -- The onboarding request API should insert directly into leads table
  -- This is just a placeholder for any additional processing
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===================
-- VALIDATION QUERIES
-- ===================

-- Verify Phase 6 tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN (
--   'commander_onboarding_leads',
--   'commander_pilot_venues',
--   'commander_documentation_access',
--   'commander_system_alerts'
-- );

COMMENT ON TABLE commander_onboarding_leads IS 'Phase 6 - Venue onboarding pipeline tracking';
COMMENT ON TABLE commander_pilot_venues IS 'Phase 6 - Pilot venue performance tracking';
COMMENT ON TABLE commander_documentation_access IS 'Phase 6 - Documentation training compliance';
COMMENT ON TABLE commander_system_alerts IS 'Phase 6 - Platform-wide alerts and announcements';
