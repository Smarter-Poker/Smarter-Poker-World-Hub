-- ================================================================
-- AUTO-SETTLEMENT & INVOICING SYSTEM
-- Migration: 20260228_auto_settlement_invoicing.sql
-- 
-- Adds: settlement_invoices, settlement_locks, auto-rakeback distribution
-- Flow: Union → Club → Agent → Sub-Agent → Player (all automated)
-- ================================================================

-- ================================================================
-- 1. SETTLEMENT INVOICES TABLE
-- Tracks the full invoice chain: Union→Club, Club→Agent, Agent→SubAgent
-- ================================================================
CREATE TABLE IF NOT EXISTS settlement_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES settlement_periods(id) ON DELETE CASCADE,
  
  -- Invoice direction
  invoice_type TEXT NOT NULL CHECK (invoice_type IN (
    'union_to_club',      -- Union charges club for rake hold
    'club_to_agent',      -- Club pays agent commission
    'agent_to_subagent',  -- Agent pays sub-agent commission
    'agent_to_player'     -- Agent distributes rakeback to player
  )),
  
  -- Parties
  from_entity_type TEXT NOT NULL CHECK (from_entity_type IN ('union', 'club', 'agent')),
  from_entity_id TEXT NOT NULL,        -- union ID, club ID, or agent user_id
  to_entity_type TEXT NOT NULL CHECK (to_entity_type IN ('club', 'agent', 'player')),
  to_entity_id TEXT NOT NULL,          -- club ID, agent user_id, or player user_id
  
  -- Amounts
  gross_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  -- Breakdown
  breakdown JSONB DEFAULT '{}',
  -- For union_to_club: { total_rake, rake_hold_pct, union_hold_amount }
  -- For club_to_agent: { gross_rake, commission_rate, commission_amount, sub_agent_deductions }
  -- For agent_to_subagent: { parent_rate, sub_rate, rate_diff, gross_rake, commission }
  -- For agent_to_player: { player_rake_contributed, rakeback_pct, rakeback_amount }
  
  -- Status
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'delivered', 'acknowledged', 'disputed', 'paid')),
  
  -- Chip transfer tracking
  chip_transfer_id UUID,               -- References chip_transactions.id when chips are moved
  chips_transferred BOOLEAN DEFAULT false,
  transferred_at TIMESTAMPTZ,
  
  -- Messaging
  message_sent BOOLEAN DEFAULT false,
  message_sent_at TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_club_period ON settlement_invoices(club_id, period_id);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON settlement_invoices(invoice_type, status);
CREATE INDEX IF NOT EXISTS idx_invoices_to_entity ON settlement_invoices(to_entity_type, to_entity_id);
CREATE INDEX IF NOT EXISTS idx_invoices_from_entity ON settlement_invoices(from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON settlement_invoices(created_at DESC);

-- ================================================================
-- 2. SETTLEMENT LOCKS TABLE
-- Freezes all chip operations during Monday 4:00-4:10 AM CST
-- ================================================================
CREATE TABLE IF NOT EXISTS settlement_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  lock_type TEXT NOT NULL DEFAULT 'weekly_settlement',
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlock_at TIMESTAMPTZ NOT NULL,
  unlocked_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  lock_reason TEXT DEFAULT 'Weekly auto-settlement in progress',
  settlement_period_id UUID REFERENCES settlement_periods(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_locks_active ON settlement_locks(club_id, is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_lock_per_club ON settlement_locks(club_id) WHERE is_active = true;

-- ================================================================
-- 3. RAKEBACK DISTRIBUTIONS TABLE
-- Tracks automatic rakeback from agents to their players
-- ================================================================
CREATE TABLE IF NOT EXISTS rakeback_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES settlement_periods(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,              -- agents table ID
  agent_user_id UUID NOT NULL,         -- auth user ID
  player_user_id UUID NOT NULL,        -- auth user ID
  
  -- Amounts
  player_rake_contributed DECIMAL(12,2) NOT NULL DEFAULT 0,
  rakeback_percentage DECIMAL(5,4) NOT NULL DEFAULT 0,
  rakeback_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'transferred', 'failed')),
  transferred_at TIMESTAMPTZ,
  chip_transfer_id UUID,
  error_message TEXT,
  
  -- Invoice reference
  invoice_id UUID REFERENCES settlement_invoices(id),
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rakeback_dist_period ON rakeback_distributions(club_id, period_id);
CREATE INDEX IF NOT EXISTS idx_rakeback_dist_agent ON rakeback_distributions(agent_user_id, period_id);
CREATE INDEX IF NOT EXISTS idx_rakeback_dist_player ON rakeback_distributions(player_user_id, period_id);
CREATE INDEX IF NOT EXISTS idx_rakeback_dist_status ON rakeback_distributions(status) WHERE status = 'pending';

-- ================================================================
-- 4. ADD settlement_lock CHECK to clubs table
-- ================================================================
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS settlement_locked BOOLEAN DEFAULT false;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS settlement_locked_until TIMESTAMPTZ;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS auto_settlement_enabled BOOLEAN DEFAULT true;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS auto_settlement_day TEXT DEFAULT 'monday';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS auto_settlement_hour INTEGER DEFAULT 10; -- 10 UTC = 4 AM CST

-- ================================================================
-- 5. ADD rakeback settings to agents table
-- ================================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS auto_rakeback_enabled BOOLEAN DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rakeback_percentage DECIMAL(5,4) DEFAULT 0.0000;
-- rakeback_percentage: agent-level default for new players
-- 0.0000 = no rakeback to players (agent keeps full commission)

-- ================================================================
-- 5b. ADD per-player rakeback to club_members
-- Agents set this individually per player via set_player_rakeback
-- Default 0 = no rakeback. Max = agent_commission - 10%
-- ================================================================
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS player_rakeback_pct DECIMAL(5,4) DEFAULT 0.0000;

-- ================================================================
-- 5c. ADD club commission rate (defaults to 90% when joining a union)
-- ================================================================
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS club_commission_rate DECIMAL(5,4) DEFAULT 0.9000;
ALTER TABLE union_clubs ADD COLUMN IF NOT EXISTS club_commission_rate DECIMAL(5,4) DEFAULT 0.9000;

-- ================================================================
-- 6. FUNCTION: Check if club is settlement-locked
-- ================================================================
CREATE OR REPLACE FUNCTION is_club_settlement_locked(p_club_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM settlement_locks
    WHERE club_id = p_club_id
    AND is_active = true
    AND locked_at <= now()
    AND unlock_at > now()
  );
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 7. FUNCTION: Auto-expire settlement locks
-- ================================================================
CREATE OR REPLACE FUNCTION expire_settlement_locks()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE settlement_locks
  SET is_active = false, unlocked_at = now()
  WHERE is_active = true AND unlock_at <= now();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  -- Also update clubs table
  UPDATE clubs
  SET settlement_locked = false, settlement_locked_until = NULL
  WHERE settlement_locked = true
  AND settlement_locked_until <= now();
  
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- VERIFY
-- ================================================================
SELECT 'settlement_invoices' as tbl, count(*) >= 0 as exists FROM settlement_invoices
UNION ALL SELECT 'settlement_locks', count(*) >= 0 FROM settlement_locks
UNION ALL SELECT 'rakeback_distributions', count(*) >= 0 FROM rakeback_distributions;
