-- ═══════════════════════════════════════════════════════════════
-- PHASE 10: Tournament Engine — Supabase Migration
-- ═══════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- 1. Adds missing columns to commander_tournaments
-- 2. Creates commander_tournament_tables for multi-table tracking
-- 3. Adds indexes for engine query patterns
-- 4. Updates RLS policies
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. ALTER commander_tournaments — add engine columns
-- ─────────────────────────────────────────────────────────────

-- Game variant (holdem, omaha4, omaha5, omaha6, omaha_hilo, short_deck)
ALTER TABLE commander_tournaments 
  ADD COLUMN IF NOT EXISTS variant text DEFAULT 'holdem';

-- Engine runtime stats
ALTER TABLE commander_tournaments 
  ADD COLUMN IF NOT EXISTS hands_played integer DEFAULT 0;

ALTER TABLE commander_tournaments 
  ADD COLUMN IF NOT EXISTS tables_remaining integer DEFAULT 0;

-- Engine connection ID (links to in-memory TournamentController)
ALTER TABLE commander_tournaments 
  ADD COLUMN IF NOT EXISTS engine_id text;

-- Level timing (seconds remaining when last synced)
ALTER TABLE commander_tournaments 
  ADD COLUMN IF NOT EXISTS level_time_remaining integer DEFAULT 0;

-- Late registration status (computed from current_level vs late_registration_levels)
ALTER TABLE commander_tournaments 
  ADD COLUMN IF NOT EXISTS late_reg_open boolean DEFAULT false;

COMMENT ON COLUMN commander_tournaments.variant IS 'Poker variant: holdem, omaha4, omaha5, omaha6, omaha_hilo, short_deck';
COMMENT ON COLUMN commander_tournaments.hands_played IS 'Total hands dealt across all tables';
COMMENT ON COLUMN commander_tournaments.tables_remaining IS 'Number of active tournament tables';
COMMENT ON COLUMN commander_tournaments.engine_id IS 'Links to in-memory TournamentController instance';
COMMENT ON COLUMN commander_tournaments.level_time_remaining IS 'Seconds remaining in current blind level (synced periodically)';
COMMENT ON COLUMN commander_tournaments.late_reg_open IS 'Whether late registration is currently open';

-- ─────────────────────────────────────────────────────────────
-- 2. CREATE commander_tournament_tables — multi-table tracking
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commander_tournament_tables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES commander_tournaments(id) ON DELETE CASCADE,
  table_number integer NOT NULL,
  engine_table_id text NOT NULL,          -- matches TournamentController's internal table ID
  status text DEFAULT 'active'            -- active, closed, final_table
    CHECK (status IN ('active', 'closed', 'final_table')),
  player_count integer DEFAULT 0,
  max_seats integer DEFAULT 9,
  average_stack integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  closed_at timestamptz,

  UNIQUE(tournament_id, table_number)
);

COMMENT ON TABLE commander_tournament_tables IS 'Tracks individual tables within a multi-table tournament';
COMMENT ON COLUMN commander_tournament_tables.engine_table_id IS 'Internal ID from TournamentController (e.g. tourn_123_table_1)';

-- ─────────────────────────────────────────────────────────────
-- 3. INDEXES for engine query patterns
-- ─────────────────────────────────────────────────────────────

-- Tournament tables: find active tables for a tournament
CREATE INDEX IF NOT EXISTS idx_tournament_tables_tournament_status 
  ON commander_tournament_tables(tournament_id, status);

-- Tournament entries: find active entries for chip sync
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament_status 
  ON commander_tournament_entries(tournament_id, status);

-- Tournament entries: leaderboard query (active players sorted by chips)
CREATE INDEX IF NOT EXISTS idx_tournament_entries_chips 
  ON commander_tournament_entries(tournament_id, current_chips DESC) 
  WHERE status = 'active';

-- Tournaments: find running tournaments for a venue
CREATE INDEX IF NOT EXISTS idx_tournaments_venue_status 
  ON commander_tournaments(venue_id, status);

-- Tournaments: engine connection lookup
CREATE INDEX IF NOT EXISTS idx_tournaments_engine_id 
  ON commander_tournaments(engine_id) 
  WHERE engine_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS Policies for commander_tournament_tables
-- ─────────────────────────────────────────────────────────────

ALTER TABLE commander_tournament_tables ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (engine runs server-side)
CREATE POLICY "Service role full access on tournament_tables"
  ON commander_tournament_tables
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read (for tournament clock display)
CREATE POLICY "Authenticated users can view tournament_tables"
  ON commander_tournament_tables
  FOR SELECT
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────
-- 5. Realtime — enable for tournament tables (live clock updates)
-- ─────────────────────────────────────────────────────────────

-- Enable realtime on tournament tables for live multi-table display
ALTER PUBLICATION supabase_realtime ADD TABLE commander_tournament_tables;

-- ─────────────────────────────────────────════════════════════
-- 6. DB function: sync tournament state from engine
--    Called periodically by the engine to persist state
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_tournament_state(
  p_tournament_id uuid,
  p_status text,
  p_current_level integer,
  p_players_remaining integer,
  p_current_entries integer,
  p_average_stack integer,
  p_total_chips_in_play integer,
  p_actual_prizepool integer,
  p_hands_played integer,
  p_tables_remaining integer,
  p_level_time_remaining integer,
  p_late_reg_open boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE commander_tournaments SET
    status = p_status,
    current_level = p_current_level,
    players_remaining = p_players_remaining,
    current_entries = p_current_entries,
    average_stack = p_average_stack,
    total_chips_in_play = p_total_chips_in_play,
    actual_prizepool = p_actual_prizepool,
    hands_played = p_hands_played,
    tables_remaining = p_tables_remaining,
    level_time_remaining = p_level_time_remaining,
    late_reg_open = p_late_reg_open,
    updated_at = now()
  WHERE id = p_tournament_id;
END;
$$;

COMMENT ON FUNCTION sync_tournament_state IS 'Bulk update tournament state from engine — called every few seconds during play';

-- ═══════════════════════════════════════════════════════════════
-- 7. DB function: record elimination
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION record_tournament_elimination(
  p_tournament_id uuid,
  p_entry_id uuid,
  p_finish_position integer,
  p_payout_amount integer DEFAULT 0,
  p_eliminated_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE commander_tournament_entries SET
    status = 'eliminated',
    finish_position = p_finish_position,
    payout_amount = p_payout_amount,
    eliminated_at = now(),
    eliminated_by = p_eliminated_by,
    current_chips = 0
  WHERE id = p_entry_id
    AND tournament_id = p_tournament_id;
    
  -- Update tournament remaining count
  UPDATE commander_tournaments SET
    players_remaining = (
      SELECT count(*) FROM commander_tournament_entries 
      WHERE tournament_id = p_tournament_id AND status = 'active'
    ),
    updated_at = now()
  WHERE id = p_tournament_id;
END;
$$;

COMMENT ON FUNCTION record_tournament_elimination IS 'Mark player eliminated and update tournament remaining count atomically';

-- ═══════════════════════════════════════════════════════════════
-- 8. DB function: process rebuy
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION process_tournament_rebuy(
  p_tournament_id uuid,
  p_entry_id uuid,
  p_new_chips integer,
  p_rebuy_cost integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE commander_tournament_entries SET
    status = 'active',
    current_chips = p_new_chips,
    rebuy_count = rebuy_count + 1,
    total_invested = total_invested + p_rebuy_cost
  WHERE id = p_entry_id
    AND tournament_id = p_tournament_id;
    
  -- Update tournament prizepool
  UPDATE commander_tournaments SET
    actual_prizepool = COALESCE(actual_prizepool, 0) + p_rebuy_cost,
    total_chips_in_play = total_chips_in_play + p_new_chips,
    updated_at = now()
  WHERE id = p_tournament_id;
END;
$$;

COMMENT ON FUNCTION process_tournament_rebuy IS 'Process rebuy: restore player, update chips and prizepool atomically';

-- ═══════════════════════════════════════════════════════════════
-- 9. DB function: bulk sync chip counts
--    Engine calls this periodically to persist all player stacks
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_tournament_chips(
  p_tournament_id uuid,
  p_chip_data jsonb  -- [{entry_id, chips, table_number, seat_number}]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec jsonb;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(p_chip_data)
  LOOP
    UPDATE commander_tournament_entries SET
      current_chips = (rec->>'chips')::integer,
      table_number = (rec->>'table_number')::integer,
      seat_number = (rec->>'seat_number')::integer,
      last_chip_count_at = now()
    WHERE id = (rec->>'entry_id')::uuid
      AND tournament_id = p_tournament_id
      AND status = 'active';
  END LOOP;
END;
$$;

COMMENT ON FUNCTION sync_tournament_chips IS 'Bulk update all active player chip counts from engine state';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  col_count integer;
  tbl_exists boolean;
  fn_count integer;
BEGIN
  -- Check new columns exist
  SELECT count(*) INTO col_count
  FROM information_schema.columns 
  WHERE table_name = 'commander_tournaments' 
    AND column_name IN ('variant', 'hands_played', 'tables_remaining', 'engine_id', 'level_time_remaining', 'late_reg_open');
  
  RAISE NOTICE '✅ commander_tournaments new columns: % / 6', col_count;
  
  -- Check tournament_tables exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'commander_tournament_tables'
  ) INTO tbl_exists;
  
  RAISE NOTICE '✅ commander_tournament_tables exists: %', tbl_exists;
  
  -- Check functions exist
  SELECT count(*) INTO fn_count
  FROM information_schema.routines
  WHERE routine_name IN ('sync_tournament_state', 'record_tournament_elimination', 'process_tournament_rebuy', 'sync_tournament_chips');
  
  RAISE NOTICE '✅ Tournament DB functions: % / 4', fn_count;
END $$;
