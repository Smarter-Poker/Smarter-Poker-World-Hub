-- ═══════════════════════════════════════════════════════════════
-- Migration: poker_tables additions for GameController (Phase 6)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- State snapshot storage (crash recovery)
ALTER TABLE poker_tables ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Live player count (for lobby display)
ALTER TABLE poker_tables ADD COLUMN IF NOT EXISTS current_players INTEGER DEFAULT 0;

-- Rake configuration
ALTER TABLE poker_tables ADD COLUMN IF NOT EXISTS rake_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE poker_tables ADD COLUMN IF NOT EXISTS rake_cap_bb NUMERIC(8,2) DEFAULT 0;

-- Index for lobby queries
CREATE INDEX IF NOT EXISTS idx_poker_tables_status ON poker_tables(status);
CREATE INDEX IF NOT EXISTS idx_poker_tables_status_players ON poker_tables(status, current_players DESC);

-- RLS: Allow service role full access (already default)
-- RLS: Allow authenticated users to read active tables
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'poker_tables' AND policyname = 'read_active_tables'
  ) THEN
    CREATE POLICY read_active_tables ON poker_tables
      FOR SELECT TO authenticated
      USING (status IN ('waiting', 'active', 'playing', 'between_hands'));
  END IF;
END $$;
