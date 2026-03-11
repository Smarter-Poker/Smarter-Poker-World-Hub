-- =============================================
-- Commander Phase 8: Table Assignment System
-- Adds mode (inactive/cash/tournament) and tournament_id to tables
-- =============================================

-- Add mode column for table assignment
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'inactive'
    CHECK (mode IN ('inactive', 'cash', 'tournament'));

-- Add tournament reference
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES commander_tournaments(id) ON DELETE SET NULL;

-- Add game description fields stored on table for quick reference
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS game_type TEXT;

ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS stakes TEXT;

-- Add assigned_at timestamp
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- Add assigned_by for audit
ALTER TABLE commander_tables
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id);

-- Index for tournament table lookups
CREATE INDEX IF NOT EXISTS idx_commander_tables_tournament
  ON commander_tables(tournament_id) WHERE tournament_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commander_tables_mode
  ON commander_tables(venue_id, mode);
