-- ═══════════════════════════════════════════════════════════════
-- WAVE H: Persistence Tables for Poker Table Features
-- ═══════════════════════════════════════════════════════════════

-- H11: Session Stats — persist session P&L, hands played, etc.
CREATE TABLE IF NOT EXISTS poker_session_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_id TEXT NOT NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  hands_played INT DEFAULT 0,
  hands_won INT DEFAULT 0,
  starting_stack NUMERIC DEFAULT 0,
  ending_stack NUMERIC DEFAULT 0,
  biggest_win NUMERIC DEFAULT 0,
  biggest_loss NUMERIC DEFAULT 0,
  pl_history JSONB DEFAULT '[]'::jsonb,
  position_wins JSONB DEFAULT '{}'::jsonb,
  position_total JSONB DEFAULT '{}'::jsonb,
  session_start TIMESTAMPTZ DEFAULT now(),
  session_end TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Users can only read/write their own session stats
ALTER TABLE poker_session_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own session stats"
  ON poker_session_stats
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_poker_session_stats_user
  ON poker_session_stats(user_id, session_start DESC);

-- H12: Seat Preferences — sync preferred seat positions across devices
CREATE TABLE IF NOT EXISTS poker_seat_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_seats INT NOT NULL,
  preferred_seat INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, max_seats)
);

-- RLS
ALTER TABLE poker_seat_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own seat preferences"
  ON poker_seat_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- H13: Table Layouts — sync multi-table layout arrangements
CREATE TABLE IF NOT EXISTS poker_table_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  arrangement JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE poker_table_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own table layouts"
  ON poker_table_layouts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_poker_table_layouts_user
  ON poker_table_layouts(user_id);
