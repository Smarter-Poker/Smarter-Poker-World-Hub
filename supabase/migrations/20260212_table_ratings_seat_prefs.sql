-- Table Atmosphere Ratings
-- Players rate tables after sessions on action, friendliness, pace
-- Aggregated to show "Table Vibe" in player-facing views

CREATE TABLE IF NOT EXISTS commander_table_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  table_number INTEGER NOT NULL,
  player_id UUID,
  session_id UUID,
  action_level INTEGER NOT NULL CHECK (action_level BETWEEN 1 AND 5),   -- 1=tight, 5=wild
  friendliness INTEGER NOT NULL CHECK (friendliness BETWEEN 1 AND 5),   -- 1=serious, 5=social
  pace INTEGER NOT NULL CHECK (pace BETWEEN 1 AND 5),                    -- 1=slow, 5=fast
  game_type TEXT,
  stakes TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_ratings_venue ON commander_table_ratings(venue_id, table_number);
CREATE INDEX IF NOT EXISTS idx_table_ratings_recent ON commander_table_ratings(venue_id, created_at DESC);

-- Seat preferences for players
CREATE TABLE IF NOT EXISTS commander_seat_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL,
  venue_id UUID,
  preferred_seats INTEGER[] DEFAULT '{}',   -- e.g. {1, 9} for corners
  left_handed BOOLEAN DEFAULT false,
  near_tv BOOLEAN,
  away_from_tv BOOLEAN,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_seat_prefs_player ON commander_seat_preferences(player_id);
