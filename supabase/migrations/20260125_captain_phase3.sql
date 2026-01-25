-- =====================================================
-- SMARTER CAPTAIN - PHASE 3 DATABASE MIGRATION
-- =====================================================
-- Tables: 2 (as specified in SCOPE_LOCK.md)
-- Phase: Tournaments
-- =====================================================

-- ===================
-- TABLE 1: captain_tournaments
-- ===================

CREATE TABLE IF NOT EXISTS captain_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tournament_type TEXT NOT NULL CHECK (tournament_type IN ('freezeout', 'rebuy', 'bounty', 'satellite', 'shootout', 'turbo', 'hyper')),

  -- Buy-in structure
  buyin_amount INTEGER NOT NULL,
  buyin_fee INTEGER DEFAULT 0,
  starting_chips INTEGER NOT NULL,

  -- Schedule
  scheduled_start TIMESTAMPTZ NOT NULL,
  registration_opens TIMESTAMPTZ,
  late_registration_levels INTEGER DEFAULT 6,
  actual_start TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Capacity
  min_entries INTEGER DEFAULT 2,
  max_entries INTEGER,
  guaranteed_pool INTEGER,

  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'registration', 'running', 'paused', 'final_table', 'completed', 'cancelled')),

  -- Current state
  current_level INTEGER DEFAULT 0,
  current_entries INTEGER DEFAULT 0,
  players_remaining INTEGER DEFAULT 0,
  total_chips_in_play INTEGER DEFAULT 0,
  average_stack INTEGER DEFAULT 0,

  -- Structure (stored as JSONB)
  blind_structure JSONB DEFAULT '[]',
  break_schedule JSONB DEFAULT '[]',
  payout_structure JSONB DEFAULT '[]',

  -- Rebuy/Addon settings
  allows_rebuys BOOLEAN DEFAULT false,
  rebuy_amount INTEGER,
  rebuy_chips INTEGER,
  max_rebuys INTEGER,
  rebuy_end_level INTEGER,
  allows_addon BOOLEAN DEFAULT false,
  addon_amount INTEGER,
  addon_chips INTEGER,
  addon_at_break INTEGER,

  -- Bounty settings
  bounty_amount INTEGER,

  -- Integration
  broadcast_to_smarter BOOLEAN DEFAULT true,
  series_id UUID,

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_by UUID REFERENCES captain_staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_captain_tournaments_venue ON captain_tournaments(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_captain_tournaments_schedule ON captain_tournaments(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_captain_tournaments_status ON captain_tournaments(status);
CREATE INDEX IF NOT EXISTS idx_captain_tournaments_series ON captain_tournaments(series_id);

-- ===================
-- TABLE 2: captain_tournament_entries
-- ===================

CREATE TABLE IF NOT EXISTS captain_tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES captain_tournaments(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  player_name TEXT,
  player_phone TEXT,

  -- Registration
  registered_at TIMESTAMPTZ DEFAULT now(),
  registration_method TEXT DEFAULT 'app' CHECK (registration_method IN ('app', 'walk_in', 'online', 'transfer')),
  table_number INTEGER,
  seat_number INTEGER,

  -- Status
  status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'seated', 'active', 'eliminated', 'winner')),

  -- Chip count
  current_chips INTEGER,
  last_chip_count_at TIMESTAMPTZ,

  -- Rebuys/Addons
  rebuy_count INTEGER DEFAULT 0,
  addon_taken BOOLEAN DEFAULT false,
  total_invested INTEGER,

  -- Elimination
  eliminated_at TIMESTAMPTZ,
  eliminated_by UUID REFERENCES captain_tournament_entries(id),
  finish_position INTEGER,

  -- Payout
  payout_amount INTEGER,
  payout_position INTEGER,
  bounties_collected INTEGER DEFAULT 0,

  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_captain_entries_tournament ON captain_tournament_entries(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_captain_entries_player ON captain_tournament_entries(player_id);
CREATE INDEX IF NOT EXISTS idx_captain_entries_position ON captain_tournament_entries(tournament_id, finish_position);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_tournament_entries ENABLE ROW LEVEL SECURITY;

-- Tournaments: Public can view, staff can manage
CREATE POLICY captain_tournaments_select ON captain_tournaments
  FOR SELECT USING (true);

CREATE POLICY captain_tournaments_insert ON captain_tournaments
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_tournaments_update ON captain_tournaments
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY captain_tournaments_delete ON captain_tournaments
  FOR DELETE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Entries: Public can view, players can register self, staff can manage all
CREATE POLICY captain_entries_select ON captain_tournament_entries
  FOR SELECT USING (true);

CREATE POLICY captain_entries_insert ON captain_tournament_entries
  FOR INSERT WITH CHECK (
    player_id = auth.uid() OR
    player_id IS NULL OR
    tournament_id IN (
      SELECT id FROM captain_tournaments WHERE venue_id IN (
        SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY captain_entries_update ON captain_tournament_entries
  FOR UPDATE USING (
    player_id = auth.uid() OR
    tournament_id IN (
      SELECT id FROM captain_tournaments WHERE venue_id IN (
        SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

CREATE POLICY captain_entries_delete ON captain_tournament_entries
  FOR DELETE USING (
    (player_id = auth.uid() AND status = 'registered') OR
    tournament_id IN (
      SELECT id FROM captain_tournaments WHERE venue_id IN (
        SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true
      )
    )
  );

-- ===================
-- FUNCTIONS
-- ===================

-- Update tournament stats when entries change
CREATE OR REPLACE FUNCTION update_tournament_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE captain_tournaments
  SET
    current_entries = (
      SELECT COUNT(*) FROM captain_tournament_entries
      WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
      AND status != 'eliminated'
    ),
    players_remaining = (
      SELECT COUNT(*) FROM captain_tournament_entries
      WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
      AND status IN ('seated', 'active')
    ),
    total_chips_in_play = (
      SELECT COALESCE(SUM(current_chips), 0) FROM captain_tournament_entries
      WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
      AND status IN ('seated', 'active')
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);

  -- Calculate average stack
  UPDATE captain_tournaments
  SET average_stack = CASE
    WHEN players_remaining > 0 THEN total_chips_in_play / players_remaining
    ELSE 0
  END
  WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tournament_stats_trigger ON captain_tournament_entries;
CREATE TRIGGER tournament_stats_trigger
AFTER INSERT OR UPDATE OR DELETE ON captain_tournament_entries
FOR EACH ROW EXECUTE FUNCTION update_tournament_stats();

-- Auto-set total_invested on entry
CREATE OR REPLACE FUNCTION calculate_entry_investment()
RETURNS TRIGGER AS $$
DECLARE
  tournament_record RECORD;
BEGIN
  SELECT buyin_amount, buyin_fee, rebuy_amount, addon_amount
  INTO tournament_record
  FROM captain_tournaments WHERE id = NEW.tournament_id;

  NEW.total_invested := tournament_record.buyin_amount + COALESCE(tournament_record.buyin_fee, 0)
    + (NEW.rebuy_count * COALESCE(tournament_record.rebuy_amount, 0))
    + (CASE WHEN NEW.addon_taken THEN COALESCE(tournament_record.addon_amount, 0) ELSE 0 END);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entry_investment_trigger ON captain_tournament_entries;
CREATE TRIGGER entry_investment_trigger
BEFORE INSERT OR UPDATE ON captain_tournament_entries
FOR EACH ROW EXECUTE FUNCTION calculate_entry_investment();
