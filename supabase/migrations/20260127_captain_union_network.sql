-- =====================================================
-- SMARTER CAPTAIN - UNION/NETWORK MANAGEMENT
-- =====================================================
-- Hierarchical structure: Union > Club > Super Agent > Agent > Player
-- Multi-venue management, revenue sharing, cross-venue analytics
-- =====================================================

-- ===================
-- TABLE 1: captain_unions
-- ===================
-- Top-level organization managing multiple venues

CREATE TABLE IF NOT EXISTS captain_unions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  logo_url TEXT,
  website TEXT,

  -- Contact
  contact_email TEXT,
  contact_phone TEXT,

  -- Owner (main account holder)
  owner_id UUID REFERENCES profiles(id),

  -- Settings
  settings JSONB DEFAULT '{}',

  -- Revenue sharing defaults
  default_revenue_share DECIMAL(5, 2) DEFAULT 0, -- % shared with venues

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),

  -- Metadata
  venue_count INTEGER DEFAULT 0,
  agent_count INTEGER DEFAULT 0,
  total_revenue DECIMAL(12, 2) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unions_owner ON captain_unions(owner_id);
CREATE INDEX IF NOT EXISTS idx_unions_status ON captain_unions(status);

-- ===================
-- TABLE 2: captain_union_venues
-- ===================
-- Junction table linking venues to unions

CREATE TABLE IF NOT EXISTS captain_union_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  union_id UUID REFERENCES captain_unions(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Venue role within union
  tier TEXT DEFAULT 'standard' CHECK (tier IN ('flagship', 'premium', 'standard')),

  -- Revenue sharing (overrides union default)
  revenue_share DECIMAL(5, 2),

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended', 'removed')),

  -- Joined date
  joined_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(union_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_union_venues_union ON captain_union_venues(union_id);
CREATE INDEX IF NOT EXISTS idx_union_venues_venue ON captain_union_venues(venue_id);

-- ===================
-- TABLE 3: captain_agents
-- ===================
-- Agent hierarchy: Super Agent > Agent

CREATE TABLE IF NOT EXISTS captain_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User account
  user_id UUID REFERENCES profiles(id),

  -- Hierarchy
  union_id UUID REFERENCES captain_unions(id) ON DELETE SET NULL,
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE SET NULL,
  parent_agent_id UUID REFERENCES captain_agents(id) ON DELETE SET NULL,

  -- Agent info
  display_name TEXT NOT NULL,
  agent_code TEXT UNIQUE, -- Referral code
  email TEXT,
  phone TEXT,
  avatar_url TEXT,

  -- Role
  role TEXT NOT NULL CHECK (role IN ('super_agent', 'agent', 'sub_agent')),

  -- Commission structure
  commission_rate DECIMAL(5, 2) DEFAULT 0, -- Base commission %
  commission_type TEXT DEFAULT 'rake' CHECK (commission_type IN ('rake', 'player_loss', 'flat', 'hybrid')),

  -- Performance
  total_players_referred INTEGER DEFAULT 0,
  active_players INTEGER DEFAULT 0,
  total_commission_earned DECIMAL(12, 2) DEFAULT 0,
  current_month_commission DECIMAL(12, 2) DEFAULT 0,

  -- Permissions
  can_create_sub_agents BOOLEAN DEFAULT false,
  can_view_player_details BOOLEAN DEFAULT true,
  can_manage_promotions BOOLEAN DEFAULT false,
  max_sub_agents INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended', 'terminated')),

  -- Verification
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_user ON captain_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_union ON captain_agents(union_id);
CREATE INDEX IF NOT EXISTS idx_agents_venue ON captain_agents(venue_id);
CREATE INDEX IF NOT EXISTS idx_agents_parent ON captain_agents(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_code ON captain_agents(agent_code);
CREATE INDEX IF NOT EXISTS idx_agents_role ON captain_agents(role);

-- ===================
-- TABLE 4: captain_agent_players
-- ===================
-- Players referred by agents

CREATE TABLE IF NOT EXISTS captain_agent_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES captain_agents(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),

  -- Player info (for non-registered players)
  player_name TEXT,
  player_phone TEXT,
  player_email TEXT,

  -- Tracking
  referred_at TIMESTAMPTZ DEFAULT now(),
  first_deposit_at TIMESTAMPTZ,
  first_play_at TIMESTAMPTZ,

  -- Stats
  total_sessions INTEGER DEFAULT 0,
  total_hours_played DECIMAL(10, 2) DEFAULT 0,
  total_rake_generated DECIMAL(12, 2) DEFAULT 0,
  total_commission_generated DECIMAL(12, 2) DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'churned')),
  last_activity_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(agent_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_players_agent ON captain_agent_players(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_players_player ON captain_agent_players(player_id);

-- ===================
-- TABLE 5: captain_agent_commissions
-- ===================
-- Commission transactions for agents

CREATE TABLE IF NOT EXISTS captain_agent_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES captain_agents(id) ON DELETE CASCADE,

  -- Source
  player_id UUID REFERENCES profiles(id),
  session_id UUID,
  venue_id INTEGER REFERENCES poker_venues(id),

  -- Commission details
  commission_type TEXT NOT NULL,
  gross_amount DECIMAL(12, 2) NOT NULL, -- Before any splits
  commission_rate DECIMAL(5, 2) NOT NULL,
  commission_amount DECIMAL(12, 2) NOT NULL,

  -- Hierarchy split (if agent has parent)
  parent_agent_id UUID REFERENCES captain_agents(id),
  parent_share DECIMAL(12, 2) DEFAULT 0,

  -- Period
  commission_period TEXT, -- e.g., '2026-01'

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'disputed', 'cancelled')),
  paid_at TIMESTAMPTZ,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent ON captain_agent_commissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_period ON captain_agent_commissions(commission_period);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_status ON captain_agent_commissions(status);

-- ===================
-- TABLE 6: captain_union_analytics
-- ===================
-- Aggregated analytics at union level

CREATE TABLE IF NOT EXISTS captain_union_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  union_id UUID REFERENCES captain_unions(id) ON DELETE CASCADE,

  -- Period
  date DATE NOT NULL,
  period_type TEXT DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly', 'monthly')),

  -- Metrics
  total_venues INTEGER DEFAULT 0,
  total_active_tables INTEGER DEFAULT 0,
  total_players INTEGER DEFAULT 0,
  unique_players INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  total_hours_played DECIMAL(10, 2) DEFAULT 0,

  -- Revenue
  total_rake DECIMAL(12, 2) DEFAULT 0,
  total_tournament_fees DECIMAL(12, 2) DEFAULT 0,
  total_revenue DECIMAL(12, 2) DEFAULT 0,

  -- Agent metrics
  total_agents INTEGER DEFAULT 0,
  total_agent_commissions DECIMAL(12, 2) DEFAULT 0,

  -- Breakdown by venue (JSONB for flexibility)
  venue_breakdown JSONB DEFAULT '[]',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(union_id, date, period_type)
);

CREATE INDEX IF NOT EXISTS idx_union_analytics_union ON captain_union_analytics(union_id, date);

-- ===================
-- ENABLE RLS
-- ===================

ALTER TABLE captain_unions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_union_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_agent_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_agent_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_union_analytics ENABLE ROW LEVEL SECURITY;

-- Union owners can manage their unions
CREATE POLICY "Union owners can manage" ON captain_unions
  FOR ALL USING (owner_id = auth.uid());

-- Union members can view their union's venues
CREATE POLICY "Union members can view venues" ON captain_union_venues
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM captain_unions
      WHERE id = union_id AND owner_id = auth.uid()
    )
  );

-- Agents can view their own data
CREATE POLICY "Agents can view own data" ON captain_agents
  FOR SELECT USING (user_id = auth.uid());

-- Agents can view their players
CREATE POLICY "Agents can view own players" ON captain_agent_players
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM captain_agents
      WHERE id = agent_id AND user_id = auth.uid()
    )
  );

-- Agents can view their commissions
CREATE POLICY "Agents can view own commissions" ON captain_agent_commissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM captain_agents
      WHERE id = agent_id AND user_id = auth.uid()
    )
  );

-- ===================
-- FUNCTIONS
-- ===================

-- Update union venue count
CREATE OR REPLACE FUNCTION update_union_venue_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE captain_unions
    SET venue_count = venue_count + 1, updated_at = now()
    WHERE id = NEW.union_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE captain_unions
    SET venue_count = venue_count - 1, updated_at = now()
    WHERE id = OLD.union_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_union_venue_count
  AFTER INSERT OR DELETE ON captain_union_venues
  FOR EACH ROW EXECUTE FUNCTION update_union_venue_count();

-- Update agent player count
CREATE OR REPLACE FUNCTION update_agent_player_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE captain_agents
    SET total_players_referred = total_players_referred + 1,
        active_players = active_players + 1,
        updated_at = now()
    WHERE id = NEW.agent_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE captain_agents
    SET total_players_referred = total_players_referred - 1,
        updated_at = now()
    WHERE id = OLD.agent_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agent_player_count
  AFTER INSERT OR DELETE ON captain_agent_players
  FOR EACH ROW EXECUTE FUNCTION update_agent_player_count();

-- Generate unique agent code
CREATE OR REPLACE FUNCTION generate_agent_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agent_code IS NULL THEN
    NEW.agent_code := upper(substring(md5(random()::text) from 1 for 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_agent_code
  BEFORE INSERT ON captain_agents
  FOR EACH ROW EXECUTE FUNCTION generate_agent_code();
