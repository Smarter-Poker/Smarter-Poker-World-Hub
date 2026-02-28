-- ================================================================
-- CLUB ARENA — Complete Schema Verification & Gap Fill
-- Run this in Supabase SQL Editor to ensure all tables exist
-- Safe to run multiple times (IF NOT EXISTS everywhere)
-- ================================================================

-- 1. Add player_contributions JSONB column to rake_records (for rakeback)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rake_records' AND column_name = 'player_contributions'
  ) THEN
    ALTER TABLE rake_records ADD COLUMN player_contributions JSONB DEFAULT NULL;
    COMMENT ON COLUMN rake_records.player_contributions IS 'Per-player rake contribution map {userId: amount} for rakeback calculation';
  END IF;
END $$;

-- 2. Create rakeback_periods table if not exists
CREATE TABLE IF NOT EXISTS rakeback_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'claimed')),
  rake_contributed NUMERIC(12,2) DEFAULT 0,
  rakeback_amount NUMERIC(12,2) DEFAULT 0,
  period_start TIMESTAMPTZ DEFAULT NOW(),
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rakeback_periods_club ON rakeback_periods(club_id);
CREATE INDEX IF NOT EXISTS idx_rakeback_periods_player ON rakeback_periods(player_id);
CREATE INDEX IF NOT EXISTS idx_rakeback_periods_status ON rakeback_periods(status);

-- 3. Create club_announcements table if not exists
CREATE TABLE IF NOT EXISTS club_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT,
  pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_announcements_club ON club_announcements(club_id);

-- 4. Create club_shop_items table if not exists
CREATE TABLE IF NOT EXISTS club_shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  category TEXT DEFAULT 'general',
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_shop_items_club ON club_shop_items(club_id);

-- 5. Create club_shop_purchases table if not exists
CREATE TABLE IF NOT EXISTS club_shop_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES club_shop_items(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_paid INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Ensure unions table exists
CREATE TABLE IF NOT EXISTS unions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  code TEXT UNIQUE,
  owner_id UUID REFERENCES auth.users(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Ensure union_clubs junction table exists
CREATE TABLE IF NOT EXISTS union_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  union_id UUID NOT NULL REFERENCES unions(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(union_id, club_id)
);

-- 8. Ensure union_admins table exists
CREATE TABLE IF NOT EXISTS union_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  union_id UUID NOT NULL REFERENCES unions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'admin',
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(union_id, user_id)
);

-- 9. Ensure agents table exists (tracks agent-specific data)
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  parent_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  commission_rate NUMERIC(5,4) DEFAULT 0.10,
  credit_limit INTEGER DEFAULT 0,
  credit_used INTEGER DEFAULT 0,
  weekly_rake_generated NUMERIC(12,2) DEFAULT 0,
  lifetime_earnings NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_agents_club ON agents(club_id);
CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_agent_id);

-- 10. Ensure cashout_requests table exists
CREATE TABLE IF NOT EXISTS cashout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'cancelled', 'completed')),
  agent_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashout_requests_club ON cashout_requests(club_id);
CREATE INDEX IF NOT EXISTS idx_cashout_requests_player ON cashout_requests(player_id);
CREATE INDEX IF NOT EXISTS idx_cashout_requests_status ON cashout_requests(status);

-- 11. Ensure settlement_periods table exists
CREATE TABLE IF NOT EXISTS settlement_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid')),
  period_start TIMESTAMPTZ DEFAULT NOW(),
  period_end TIMESTAMPTZ,
  total_rake_collected NUMERIC(12,2) DEFAULT 0,
  total_hands_dealt INTEGER DEFAULT 0,
  total_commissions_paid NUMERIC(12,2) DEFAULT 0,
  total_bbj_contributions NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_periods_club ON settlement_periods(club_id);

-- 12. Ensure rake_records table exists
CREATE TABLE IF NOT EXISTS rake_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  table_id UUID,
  hand_id TEXT,
  pot_size NUMERIC(12,2) DEFAULT 0,
  rake_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  num_players INTEGER DEFAULT 0,
  bbj_contribution NUMERIC(12,2) DEFAULT 0,
  player_contributions JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rake_records_club ON rake_records(club_id);
CREATE INDEX IF NOT EXISTS idx_rake_records_created ON rake_records(created_at);

-- 13. Ensure chip_escrow table exists
CREATE TABLE IF NOT EXISTS chip_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_id UUID,
  amount INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'locked' CHECK (status IN ('locked', 'unlocked', 'forfeited')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  unlocked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chip_escrow_player ON chip_escrow(player_id, club_id);

-- 14. Ensure clubs has all needed columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'union_id') THEN
    ALTER TABLE clubs ADD COLUMN union_id UUID REFERENCES unions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'chip_treasury') THEN
    ALTER TABLE clubs ADD COLUMN chip_treasury INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'total_rake') THEN
    ALTER TABLE clubs ADD COLUMN total_rake NUMERIC(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'settings') THEN
    ALTER TABLE clubs ADD COLUMN settings JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'hands_played') THEN
    ALTER TABLE clubs ADD COLUMN hands_played INTEGER DEFAULT 0;
  END IF;
END $$;

-- 15. Ensure club_members has all needed columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'agent_id') THEN
    ALTER TABLE club_members ADD COLUMN agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'chip_balance') THEN
    ALTER TABLE club_members ADD COLUMN chip_balance INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'locked_chips') THEN
    ALTER TABLE club_members ADD COLUMN locked_chips INTEGER DEFAULT 0;
  END IF;
END $$;

-- Done! All Club Arena tables verified.
SELECT 'Club Arena schema verification complete' AS result;
