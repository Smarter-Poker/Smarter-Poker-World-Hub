-- =====================================================
-- CLUB COMMANDER - FREEROLL MANAGEMENT
-- =====================================================
-- Tables for freeroll events and player qualification tracking
-- Run this in Supabase SQL Editor
-- =====================================================

-- ===================
-- TABLE 1: commander_freerolls
-- ===================
-- Defines a freeroll event with qualification rules

CREATE TABLE IF NOT EXISTS commander_freerolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Qualification rules
  qualification_type TEXT NOT NULL DEFAULT 'cash_hours'
    CHECK (qualification_type IN ('cash_hours', 'tournament_points', 'custom', 'open')),
  qualification_threshold DECIMAL(10,2) DEFAULT 0,
  qualification_period TEXT DEFAULT 'weekly'
    CHECK (qualification_period IN ('daily', 'weekly', 'monthly', 'season', 'custom')),
  qualification_game_types TEXT[] DEFAULT '{"nlhe"}',
  qualification_min_stakes TEXT,
  qualification_rules_text TEXT,

  -- Event details
  scheduled_date TIMESTAMPTZ,
  prize_pool DECIMAL(12,2) DEFAULT 0,
  prize_description TEXT,
  max_qualifiers INTEGER,

  -- Status
  status TEXT DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'qualifying', 'closed', 'running', 'completed', 'cancelled')),

  -- Audit
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- TABLE 2: commander_freeroll_qualifications
-- ===================
-- Tracks each player's qualification progress for a freeroll

CREATE TABLE IF NOT EXISTS commander_freeroll_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freeroll_id UUID REFERENCES commander_freerolls(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  player_name TEXT,

  -- Progress tracking
  hours_logged DECIMAL(8,2) DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  custom_value TEXT,

  -- Status
  is_qualified BOOLEAN DEFAULT false,
  qualified_at TIMESTAMPTZ,
  manually_added BOOLEAN DEFAULT false,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(freeroll_id, player_id)
);

-- ===================
-- INDEXES
-- ===================

CREATE INDEX IF NOT EXISTS idx_freerolls_venue ON commander_freerolls(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_freerolls_date ON commander_freerolls(scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_freerolls_status ON commander_freerolls(status);
CREATE INDEX IF NOT EXISTS idx_freeroll_quals_freeroll ON commander_freeroll_qualifications(freeroll_id, is_qualified);
CREATE INDEX IF NOT EXISTS idx_freeroll_quals_player ON commander_freeroll_qualifications(player_id);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE commander_freerolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_freeroll_qualifications ENABLE ROW LEVEL SECURITY;

-- Staff can manage freerolls for their venue
CREATE POLICY freerolls_staff_access ON commander_freerolls
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Public can read active/upcoming freerolls
CREATE POLICY freerolls_public_read ON commander_freerolls
  FOR SELECT USING (status IN ('upcoming', 'qualifying', 'running', 'completed'));

-- Staff can manage qualifications
CREATE POLICY quals_staff_access ON commander_freeroll_qualifications
  FOR ALL USING (
    freeroll_id IN (
      SELECT id FROM commander_freerolls
      WHERE venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
    )
  );

-- Players can see their own qualifications
CREATE POLICY quals_player_read ON commander_freeroll_qualifications
  FOR SELECT USING (player_id = auth.uid());

-- ===================
-- COMMENTS
-- ===================

COMMENT ON TABLE commander_freerolls IS 'Club Commander - Freeroll event definitions with qualification rules';
COMMENT ON TABLE commander_freeroll_qualifications IS 'Club Commander - Player qualification progress for freeroll events';
