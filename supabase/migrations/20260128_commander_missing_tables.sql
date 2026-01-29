-- =====================================================
-- CLUB COMMANDER - MISSING TABLES FIX
-- =====================================================
-- Critical bug fixes only
-- =====================================================

-- ===================
-- TABLE: commander_onboarding_leads
-- ===================
-- Captures leads from venue onboarding requests

CREATE TABLE IF NOT EXISTS commander_onboarding_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  table_count INTEGER,
  current_system TEXT,
  notes TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'demo_scheduled', 'onboarding', 'converted', 'declined', 'inactive')),
  source TEXT DEFAULT 'website',
  assigned_to UUID REFERENCES profiles(id),
  contacted_at TIMESTAMPTZ,
  demo_scheduled_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  venue_id INTEGER REFERENCES poker_venues(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_leads_status ON commander_onboarding_leads(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_leads_email ON commander_onboarding_leads(email);
CREATE INDEX IF NOT EXISTS idx_onboarding_leads_created ON commander_onboarding_leads(created_at);

-- ===================
-- TABLE: commander_table_displays
-- ===================
-- Hardware display configuration for tables

CREATE TABLE IF NOT EXISTS commander_table_displays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  table_id UUID REFERENCES commander_tables(id),
  device_id TEXT UNIQUE,
  device_name TEXT,
  device_type TEXT DEFAULT 'tablet' CHECK (device_type IN ('tablet', 'tv', 'monitor', 'kiosk')),
  display_mode TEXT DEFAULT 'rotation' CHECK (display_mode IN ('waitlist', 'clock', 'promotions', 'high_hand', 'leaderboard', 'rotation')),
  rotation_interval INTEGER DEFAULT 30,
  rotation_screens TEXT[] DEFAULT ARRAY['waitlist', 'promotions', 'high_hand'],
  is_online BOOLEAN DEFAULT false,
  last_heartbeat TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_displays_venue ON commander_table_displays(venue_id);
CREATE INDEX IF NOT EXISTS idx_displays_table ON commander_table_displays(table_id);
CREATE INDEX IF NOT EXISTS idx_displays_device ON commander_table_displays(device_id);

-- ===================
-- TABLE: commander_progressive_jackpots
-- ===================
-- Progressive jackpot state tracking

CREATE TABLE IF NOT EXISTS commander_progressive_jackpots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID REFERENCES commander_promotions(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  current_amount DECIMAL(12,2) DEFAULT 0,
  seed_amount DECIMAL(12,2) DEFAULT 0,
  contribution_rate DECIMAL(5,4) DEFAULT 0.01,
  max_amount DECIMAL(12,2),
  min_qualifying_hand TEXT,
  last_hit_at TIMESTAMPTZ,
  last_hit_amount DECIMAL(12,2),
  last_winner_id UUID REFERENCES profiles(id),
  hit_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'hit', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jackpots_venue ON commander_progressive_jackpots(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_jackpots_promotion ON commander_progressive_jackpots(promotion_id);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE commander_onboarding_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_table_displays ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_progressive_jackpots ENABLE ROW LEVEL SECURITY;

-- Onboarding leads: Admin only
CREATE POLICY onboarding_leads_admin ON commander_onboarding_leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager'))
  );

-- Table displays: Venue staff can manage
CREATE POLICY displays_venue ON commander_table_displays
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Progressive jackpots: Public view, staff manage
CREATE POLICY jackpots_select ON commander_progressive_jackpots
  FOR SELECT USING (true);

CREATE POLICY jackpots_modify ON commander_progressive_jackpots
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- ===================
-- Add phone column to profiles if missing
-- ===================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
