-- =====================================================
-- MULTI-DAY TOURNAMENT FLIGHTS SCHEMA
-- =====================================================
-- Adds multi-day flight support to commander_tournaments
-- Enables: Day 1A/1B/1C flights, bag-and-tag chip counts,
-- parent-child tournament linking, and resume scheduling
-- =====================================================

-- Multi-day flag and day tracking
ALTER TABLE commander_tournaments
  ADD COLUMN IF NOT EXISTS is_multi_day BOOLEAN DEFAULT false;

ALTER TABLE commander_tournaments
  ADD COLUMN IF NOT EXISTS total_days INTEGER DEFAULT 1;

ALTER TABLE commander_tournaments
  ADD COLUMN IF NOT EXISTS current_day INTEGER DEFAULT 1;

-- Flight label (e.g., 'Day 1A', 'Day 1B', 'Day 2 Final')
ALTER TABLE commander_tournaments
  ADD COLUMN IF NOT EXISTS flight_label TEXT;

-- Parent tournament link: child flights reference the parent event
ALTER TABLE commander_tournaments
  ADD COLUMN IF NOT EXISTS parent_tournament_id UUID REFERENCES commander_tournaments(id) ON DELETE SET NULL;

-- Bag-and-tag: end-of-day chip counts stored as JSONB array
-- Format: [{ entry_id, player_name, chip_count, table_number, seat_number, bagged_at }]
ALTER TABLE commander_tournaments
  ADD COLUMN IF NOT EXISTS day_end_chip_counts JSONB DEFAULT '[]';

-- Resume time: when the next day/flight is scheduled to start
ALTER TABLE commander_tournaments
  ADD COLUMN IF NOT EXISTS resume_time TIMESTAMPTZ;

-- Index for parent tournament lookups (flights under a parent)
CREATE INDEX IF NOT EXISTS idx_commander_tournaments_parent
  ON commander_tournaments(parent_tournament_id) WHERE parent_tournament_id IS NOT NULL;

-- Add 'bagged' to tournament entry status for end-of-day
-- (players who bagged chips for the next day)
ALTER TABLE commander_tournament_entries
  DROP CONSTRAINT IF EXISTS commander_tournament_entries_status_check;

ALTER TABLE commander_tournament_entries
  ADD CONSTRAINT commander_tournament_entries_status_check
  CHECK (status IN ('registered', 'seated', 'active', 'eliminated', 'winner', 'bagged'));

-- Tournament reminder tracking table
CREATE TABLE IF NOT EXISTS tournament_reminders_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL,
  user_id UUID NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('24h', '1h', 'flight_resume', 'starting_now')),
  sent_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, user_id, reminder_type)
);

ALTER TABLE tournament_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminders_select ON tournament_reminders_sent
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY reminders_insert ON tournament_reminders_sent
  FOR INSERT WITH CHECK (true);

-- Add to realtime publication for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_reminders_sent;
