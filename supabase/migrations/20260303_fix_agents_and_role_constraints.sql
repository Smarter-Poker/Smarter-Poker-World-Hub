-- ════════════════════════════════════════════════════════════════
-- Fix agents table missing columns + club_members role constraint
-- ════════════════════════════════════════════════════════════════

-- 1. agents table: Add missing columns used by manage-agent.js
--    These columns are inserted/updated in promote, demote, reassign actions
--    but never existed in the original CREATE TABLE.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS active_player_count INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_players INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_tier TEXT DEFAULT 'agent';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. club_members: Add 'super_agent' to role CHECK constraint
--    manage-agent.js promote action allows agentTier='super_agent'
--    but the original CHECK didn't include it.
ALTER TABLE club_members DROP CONSTRAINT IF EXISTS club_members_role_check;
ALTER TABLE club_members ADD CONSTRAINT club_members_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'super_agent', 'sub_agent', 'player'));
