-- ═══════════════════════════════════════════════════════════════════════
-- BASELINE MIGRATION: Core tables used by Club Arena
-- ═══════════════════════════════════════════════════════════════════════
-- These tables are referenced throughout the codebase but were created
-- via Supabase dashboard, not migrations. This ensures fresh deploys work.
-- Uses IF NOT EXISTS — safe to run on existing databases.
--
-- Tables: clubs, club_members, tables (poker tables)
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- 1. CLUBS — Core club entity
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id INTEGER,                                  -- 5-digit join code
  description TEXT DEFAULT '',
  avatar_url TEXT,
  member_count INTEGER DEFAULT 0,
  table_count INTEGER DEFAULT 0,
  hands_played INTEGER DEFAULT 0,
  total_rake NUMERIC DEFAULT 0,
  chip_treasury NUMERIC DEFAULT 0,                  -- Owner's chip mint supply
  promo_balance NUMERIC DEFAULT 0,                  -- Promo chip pool (from BBJ 30%)
  union_id UUID,                                    -- If part of a union
  settings JSONB DEFAULT '{}'::jsonb,               -- Club-level settings
  auto_settlement_enabled BOOLEAN DEFAULT false,
  club_commission_rate NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clubs_owner_id ON clubs(owner_id);
CREATE INDEX IF NOT EXISTS idx_clubs_club_id ON clubs(club_id);
CREATE INDEX IF NOT EXISTS idx_clubs_union_id ON clubs(union_id);

-- RLS
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clubs_select_members" ON clubs;
CREATE POLICY "clubs_select_members" ON clubs FOR SELECT USING (
  id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid())
  OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "clubs_insert_auth" ON clubs;
CREATE POLICY "clubs_insert_auth" ON clubs FOR INSERT WITH CHECK (
  auth.uid() = owner_id
);

DROP POLICY IF EXISTS "clubs_update_owner" ON clubs;
CREATE POLICY "clubs_update_owner" ON clubs FOR UPDATE USING (
  owner_id = auth.uid()
  OR id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);


-- ═══════════════════════════════════════════════════════════════════════
-- 2. CLUB_MEMBERS — Player membership in clubs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'player' CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'sub_agent', 'player')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned', 'pending')),
  chip_balance NUMERIC DEFAULT 0,                   -- Playable chips
  held_chips NUMERIC DEFAULT 0,                     -- Chips in pending cashout
  agent_id UUID,                                    -- Which agent recruited this player
  credit_limit NUMERIC DEFAULT 0,                   -- Agent credit limit
  credit_used NUMERIC DEFAULT 0,                    -- Agent credit used
  display_name TEXT,
  nickname TEXT,
  tier TEXT DEFAULT 'bronze',
  xp INTEGER DEFAULT 0,
  is_prepaid BOOLEAN DEFAULT true,                  -- Prepaid vs credit model
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(club_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cm_club_id ON club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_cm_user_id ON club_members(user_id);
CREATE INDEX IF NOT EXISTS idx_cm_agent_id ON club_members(agent_id);
CREATE INDEX IF NOT EXISTS idx_cm_club_user ON club_members(club_id, user_id);

-- RLS
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cm_select_own" ON club_members;
CREATE POLICY "cm_select_own" ON club_members FOR SELECT USING (
  user_id = auth.uid()
  OR club_id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'agent'))
);

DROP POLICY IF EXISTS "cm_insert_self" ON club_members;
CREATE POLICY "cm_insert_self" ON club_members FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "cm_update_admin" ON club_members;
CREATE POLICY "cm_update_admin" ON club_members FOR UPDATE USING (
  user_id = auth.uid()
  OR club_id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);


-- ═══════════════════════════════════════════════════════════════════════
-- 3. TABLES — Poker tables within clubs
-- ═══════════════════════════════════════════════════════════════════════
-- This is the table that create-table.js, lobby.js, and the engine reference.
-- Distinct from 'club_tables' (an earlier schema that should be deprecated).
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  name TEXT NOT NULL DEFAULT 'New Table',
  game_type TEXT DEFAULT 'cash' CHECK (game_type IN ('cash', 'tournament', 'sng')),
  game_variant TEXT DEFAULT 'nlh',                  -- nlh, flh, plo4, plo5, plo6, plo8, short_deck, etc.
  stakes TEXT DEFAULT '1/2',                        -- Display string e.g. "1/2", "5/10"
  small_blind NUMERIC DEFAULT 1,
  big_blind NUMERIC DEFAULT 2,
  ante NUMERIC DEFAULT 0,
  min_buy_in NUMERIC DEFAULT 40,                    -- In chips (not BB)
  max_buy_in NUMERIC DEFAULT 400,
  max_players INTEGER DEFAULT 9 CHECK (max_players BETWEEN 2 AND 10),
  current_players INTEGER DEFAULT 0,
  action_time_seconds INTEGER DEFAULT 30,
  -- Rake configuration
  rake_percent NUMERIC DEFAULT 5,
  rake_cap_bb NUMERIC DEFAULT 3,
  bbj_percent NUMERIC DEFAULT 0,
  -- Status
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'paused', 'closed', 'deleted')),
  -- Settings (JSONB blob for all game options, security, BBJ tier info, etc.)
  settings JSONB DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tables_club_id ON tables(club_id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(status);
CREATE INDEX IF NOT EXISTS idx_tables_club_status ON tables(club_id, status);

-- RLS
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tables_select_club_members" ON tables;
CREATE POLICY "tables_select_club_members" ON tables FOR SELECT USING (
  club_id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "tables_insert_admin" ON tables;
CREATE POLICY "tables_insert_admin" ON tables FOR INSERT WITH CHECK (
  club_id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);

DROP POLICY IF EXISTS "tables_update_admin" ON tables;
CREATE POLICY "tables_update_admin" ON tables FOR UPDATE USING (
  club_id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);

DROP POLICY IF EXISTS "tables_delete_admin" ON tables;
CREATE POLICY "tables_delete_admin" ON tables FOR DELETE USING (
  club_id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);


-- ═══════════════════════════════════════════════════════════════════════
-- 4. ADD MISSING COLUMNS (if tables already exist but are missing cols)
-- ═══════════════════════════════════════════════════════════════════════
-- These are safe: ALTER TABLE ... ADD COLUMN IF NOT EXISTS

-- clubs extras
DO $$ BEGIN
  ALTER TABLE clubs ADD COLUMN IF NOT EXISTS total_rake NUMERIC DEFAULT 0;
  ALTER TABLE clubs ADD COLUMN IF NOT EXISTS hands_played INTEGER DEFAULT 0;
  ALTER TABLE clubs ADD COLUMN IF NOT EXISTS table_count INTEGER DEFAULT 0;
  ALTER TABLE clubs ADD COLUMN IF NOT EXISTS chip_treasury NUMERIC DEFAULT 0;
  ALTER TABLE clubs ADD COLUMN IF NOT EXISTS promo_balance NUMERIC DEFAULT 0;
  ALTER TABLE clubs ADD COLUMN IF NOT EXISTS union_id UUID;
  ALTER TABLE clubs ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE clubs ADD COLUMN IF NOT EXISTS auto_settlement_enabled BOOLEAN DEFAULT false;
  ALTER TABLE clubs ADD COLUMN IF NOT EXISTS club_commission_rate NUMERIC DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- club_members extras
DO $$ BEGIN
  ALTER TABLE club_members ADD COLUMN IF NOT EXISTS chip_balance NUMERIC DEFAULT 0;
  ALTER TABLE club_members ADD COLUMN IF NOT EXISTS held_chips NUMERIC DEFAULT 0;
  ALTER TABLE club_members ADD COLUMN IF NOT EXISTS agent_id UUID;
  ALTER TABLE club_members ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT 0;
  ALTER TABLE club_members ADD COLUMN IF NOT EXISTS credit_used NUMERIC DEFAULT 0;
  ALTER TABLE club_members ADD COLUMN IF NOT EXISTS display_name TEXT;
  ALTER TABLE club_members ADD COLUMN IF NOT EXISTS nickname TEXT;
  ALTER TABLE club_members ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'bronze';
  ALTER TABLE club_members ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
  ALTER TABLE club_members ADD COLUMN IF NOT EXISTS is_prepaid BOOLEAN DEFAULT true;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- tables extras
DO $$ BEGIN
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS game_variant TEXT DEFAULT 'nlh';
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS small_blind NUMERIC DEFAULT 1;
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS big_blind NUMERIC DEFAULT 2;
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS ante NUMERIC DEFAULT 0;
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS min_buy_in NUMERIC DEFAULT 40;
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS max_buy_in NUMERIC DEFAULT 400;
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS action_time_seconds INTEGER DEFAULT 30;
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS rake_percent NUMERIC DEFAULT 5;
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS rake_cap_bb NUMERIC DEFAULT 3;
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS bbj_percent NUMERIC DEFAULT 0;
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
EXCEPTION WHEN OTHERS THEN NULL; END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- 5. UPDATED_AT TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER clubs_updated_at BEFORE UPDATE ON clubs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER club_members_updated_at BEFORE UPDATE ON club_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER tables_updated_at BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
