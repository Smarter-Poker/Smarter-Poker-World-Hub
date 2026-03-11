-- ============================================
-- RECONCILIATION MIGRATION: Standardize venue_id to INTEGER
-- ============================================
-- poker_venues.id is SERIAL (INTEGER) per 20260118_master_poker_database.sql
-- 8 commander tables incorrectly define venue_id as UUID.
-- This migration alters them to INTEGER and re-establishes FK constraints.
--
-- Tables affected (Phase 1 - UUID → INTEGER):
--   commander_staff, commander_tables, commander_games,
--   commander_waitlist, commander_waitlist_history, commander_notifications
-- Tables affected (missing_tables_v2 - UUID → INTEGER):
--   commander_high_hands, commander_xp_transactions
-- Functions affected:
--   get_next_waitlist_position (parameter UUID → INTEGER)
-- ============================================

-- Wrap in transaction for atomicity
BEGIN;

-- =====================
-- 1. commander_staff
-- =====================
ALTER TABLE commander_staff DROP CONSTRAINT IF EXISTS commander_staff_venue_id_fkey;
ALTER TABLE commander_staff DROP CONSTRAINT IF EXISTS commander_staff_venue_id_user_id_key;
DROP INDEX IF EXISTS idx_commander_staff_venue;
DROP INDEX IF EXISTS idx_commander_staff_active;

ALTER TABLE commander_staff ALTER COLUMN venue_id TYPE INTEGER USING venue_id::text::integer;

ALTER TABLE commander_staff
  ADD CONSTRAINT commander_staff_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES poker_venues(id) ON DELETE CASCADE;
ALTER TABLE commander_staff
  ADD CONSTRAINT commander_staff_venue_id_user_id_key UNIQUE (venue_id, user_id);
CREATE INDEX IF NOT EXISTS idx_commander_staff_venue ON commander_staff(venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_staff_active ON commander_staff(venue_id, is_active);

-- =====================
-- 2. commander_tables
-- =====================
ALTER TABLE commander_tables DROP CONSTRAINT IF EXISTS commander_tables_venue_id_fkey;
ALTER TABLE commander_tables DROP CONSTRAINT IF EXISTS commander_tables_venue_id_table_number_key;
DROP INDEX IF EXISTS idx_commander_tables_venue;
DROP INDEX IF EXISTS idx_commander_tables_status;

ALTER TABLE commander_tables ALTER COLUMN venue_id TYPE INTEGER USING venue_id::text::integer;

ALTER TABLE commander_tables
  ADD CONSTRAINT commander_tables_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES poker_venues(id) ON DELETE CASCADE;
ALTER TABLE commander_tables
  ADD CONSTRAINT commander_tables_venue_id_table_number_key UNIQUE (venue_id, table_number);
CREATE INDEX IF NOT EXISTS idx_commander_tables_venue ON commander_tables(venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_tables_status ON commander_tables(venue_id, status);

-- =====================
-- 3. commander_games
-- =====================
ALTER TABLE commander_games DROP CONSTRAINT IF EXISTS commander_games_venue_id_fkey;
DROP INDEX IF EXISTS idx_commander_games_venue_status;
DROP INDEX IF EXISTS idx_commander_games_type_stakes;

ALTER TABLE commander_games ALTER COLUMN venue_id TYPE INTEGER USING venue_id::text::integer;

ALTER TABLE commander_games
  ADD CONSTRAINT commander_games_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES poker_venues(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_commander_games_venue_status ON commander_games(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_commander_games_type_stakes ON commander_games(venue_id, game_type, stakes);

-- =====================
-- 4. commander_waitlist
-- =====================
ALTER TABLE commander_waitlist DROP CONSTRAINT IF EXISTS commander_waitlist_venue_id_fkey;
DROP INDEX IF EXISTS idx_commander_waitlist_venue_status;
DROP INDEX IF EXISTS idx_commander_waitlist_venue_game_type;

ALTER TABLE commander_waitlist ALTER COLUMN venue_id TYPE INTEGER USING venue_id::text::integer;

ALTER TABLE commander_waitlist
  ADD CONSTRAINT commander_waitlist_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES poker_venues(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_commander_waitlist_venue_status ON commander_waitlist(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_commander_waitlist_venue_game_type ON commander_waitlist(venue_id, game_type, stakes, status);

-- =====================
-- 5. commander_waitlist_history
-- =====================
ALTER TABLE commander_waitlist_history DROP CONSTRAINT IF EXISTS commander_waitlist_history_venue_id_fkey;
DROP INDEX IF EXISTS idx_commander_waitlist_history_venue;

ALTER TABLE commander_waitlist_history ALTER COLUMN venue_id TYPE INTEGER USING venue_id::text::integer;

ALTER TABLE commander_waitlist_history
  ADD CONSTRAINT commander_waitlist_history_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES poker_venues(id);
CREATE INDEX IF NOT EXISTS idx_commander_waitlist_history_venue ON commander_waitlist_history(venue_id, created_at);

-- =====================
-- 6. commander_notifications
-- =====================
ALTER TABLE commander_notifications DROP CONSTRAINT IF EXISTS commander_notifications_venue_id_fkey;
DROP INDEX IF EXISTS idx_commander_notifications_venue;

ALTER TABLE commander_notifications ALTER COLUMN venue_id TYPE INTEGER USING venue_id::text::integer;

ALTER TABLE commander_notifications
  ADD CONSTRAINT commander_notifications_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES poker_venues(id);
CREATE INDEX IF NOT EXISTS idx_commander_notifications_venue ON commander_notifications(venue_id);

-- =====================
-- 7. commander_high_hands
-- =====================
ALTER TABLE commander_high_hands DROP CONSTRAINT IF EXISTS commander_high_hands_venue_id_fkey;
DROP INDEX IF EXISTS idx_commander_high_hands_venue;

ALTER TABLE commander_high_hands ALTER COLUMN venue_id TYPE INTEGER USING venue_id::text::integer;

ALTER TABLE commander_high_hands
  ADD CONSTRAINT commander_high_hands_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES poker_venues(id);
CREATE INDEX IF NOT EXISTS idx_commander_high_hands_venue ON commander_high_hands(venue_id);

-- =====================
-- 8. commander_xp_transactions
-- =====================
ALTER TABLE commander_xp_transactions DROP CONSTRAINT IF EXISTS commander_xp_transactions_venue_id_fkey;
DROP INDEX IF EXISTS idx_commander_xp_venue;

ALTER TABLE commander_xp_transactions ALTER COLUMN venue_id TYPE INTEGER USING venue_id::text::integer;

ALTER TABLE commander_xp_transactions
  ADD CONSTRAINT commander_xp_transactions_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES poker_venues(id);
CREATE INDEX IF NOT EXISTS idx_commander_xp_venue ON commander_xp_transactions(venue_id);

-- =====================
-- 9. Fix function signatures
-- =====================

-- Recreate get_next_waitlist_position with INTEGER parameter
CREATE OR REPLACE FUNCTION get_next_waitlist_position(p_venue_id INTEGER, p_game_type TEXT, p_stakes TEXT)
RETURNS INTEGER AS $$
DECLARE
  next_pos INTEGER;
BEGIN
  SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos
  FROM commander_waitlist
  WHERE venue_id = p_venue_id
    AND game_type = p_game_type
    AND stakes = p_stakes
    AND status = 'waiting';
  RETURN next_pos;
END;
$$ LANGUAGE plpgsql;

-- Drop the old UUID-parameter version if it exists separately
DROP FUNCTION IF EXISTS get_next_waitlist_position(UUID, TEXT, TEXT);

-- =====================
-- 10. Verify consistency
-- =====================
DO $$
DECLARE
  col_type TEXT;
  tables_checked INTEGER := 0;
  tables_ok INTEGER := 0;
BEGIN
  -- Check all 8 tables have INTEGER venue_id
  FOR col_type IN
    SELECT data_type FROM information_schema.columns
    WHERE table_name IN (
      'commander_staff', 'commander_tables', 'commander_games',
      'commander_waitlist', 'commander_waitlist_history', 'commander_notifications',
      'commander_high_hands', 'commander_xp_transactions'
    )
    AND column_name = 'venue_id'
  LOOP
    tables_checked := tables_checked + 1;
    IF col_type = 'integer' THEN
      tables_ok := tables_ok + 1;
    END IF;
  END LOOP;

  IF tables_checked != tables_ok THEN
    RAISE EXCEPTION 'RECONCILIATION FAILED: % of % tables have correct venue_id type', tables_ok, tables_checked;
  END IF;

  RAISE NOTICE 'RECONCILIATION OK: All % tables have INTEGER venue_id', tables_ok;
END;
$$;

COMMIT;
