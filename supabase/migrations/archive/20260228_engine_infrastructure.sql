-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Engine Infrastructure (live state, tournaments, anti-cheat)
-- ═══════════════════════════════════════════════════════════════

-- 1. CRASH RECOVERY: Add live_state column to poker_tables
ALTER TABLE poker_tables ADD COLUMN IF NOT EXISTS live_state JSONB DEFAULT NULL;
COMMENT ON COLUMN poker_tables.live_state IS 'Serialized mid-hand game state for crash recovery. Cleared on hand_complete.';

-- 2. TOURNAMENT TRACKING: Add columns to club_tournaments
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS current_level INTEGER DEFAULT 0;
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS current_small_blind NUMERIC DEFAULT 0;
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS current_big_blind NUMERIC DEFAULT 0;
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS current_ante NUMERIC DEFAULT 0;
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS players_remaining INTEGER DEFAULT 0;
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS tables_active INTEGER DEFAULT 0;
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS hands_played INTEGER DEFAULT 0;
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS prize_pool NUMERIC DEFAULT 0;
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS spin_multiplier NUMERIC DEFAULT NULL;
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE club_tournaments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ DEFAULT NULL;

-- 3. TOURNAMENT ENTRIES TABLE
CREATE TABLE IF NOT EXISTS tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES club_tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id),
  player_name TEXT,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'active', 'busted_rebuy', 'eliminated', 'winner')),
  buy_in NUMERIC DEFAULT 0,
  chips INTEGER DEFAULT 0,
  table_id TEXT,
  seat_index INTEGER,
  finish_position INTEGER,
  payout NUMERIC DEFAULT 0,
  rebuy_count INTEGER DEFAULT 0,
  addon_used BOOLEAN DEFAULT FALSE,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  eliminated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tournament_id, player_id)
);

-- Indexes for tournament_entries
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament ON tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_player ON tournament_entries(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_status ON tournament_entries(tournament_id, status);

-- RLS for tournament_entries
ALTER TABLE tournament_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tournament entries" ON tournament_entries
  FOR SELECT USING (true);

CREATE POLICY "Users can manage own entries" ON tournament_entries
  FOR ALL USING (auth.uid() = player_id);

CREATE POLICY "Service role full access to tournament_entries" ON tournament_entries
  FOR ALL USING (auth.role() = 'service_role');

-- 4. ANTI-CHEAT FLAGS TABLE
CREATE TABLE IF NOT EXISTS anti_cheat_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES auth.users(id),
  flag_type TEXT NOT NULL CHECK (flag_type IN ('ip_conflict', 'multi_account', 'rate_limit', 'bot_timing', 'bot_pattern', 'bot_speed', 'collusion')),
  reason TEXT,
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  flagged_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for anti_cheat_flags
CREATE INDEX IF NOT EXISTS idx_anti_cheat_player ON anti_cheat_flags(player_id);
CREATE INDEX IF NOT EXISTS idx_anti_cheat_type ON anti_cheat_flags(flag_type);
CREATE INDEX IF NOT EXISTS idx_anti_cheat_unresolved ON anti_cheat_flags(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_anti_cheat_severity ON anti_cheat_flags(severity) WHERE resolved = FALSE;

-- RLS for anti_cheat_flags (admin only)
ALTER TABLE anti_cheat_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to anti_cheat_flags" ON anti_cheat_flags
  FOR ALL USING (auth.role() = 'service_role');

-- 5. AUTO-SETTLEMENT CRON HELPER
-- Function to find and settle completed tournaments
CREATE OR REPLACE FUNCTION auto_settle_completed_tournaments()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  settled_count INTEGER := 0;
  v_tournament RECORD;
BEGIN
  -- Find tournaments that completed but haven't been settled
  FOR v_tournament IN
    SELECT ct.id, ct.club_id, ct.prize_pool
    FROM club_tournaments ct
    WHERE ct.status = 'complete'
      AND ct.completed_at IS NOT NULL
      AND ct.completed_at > NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM tournament_entries te
        WHERE te.tournament_id = ct.id
        AND te.status = 'winner'
        AND te.payout > 0
      )
  LOOP
    -- Mark as needing manual settlement (payouts handled by engine)
    UPDATE club_tournaments SET updated_at = NOW() WHERE id = v_tournament.id;
    settled_count := settled_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'checked', settled_count);
END;
$$;
