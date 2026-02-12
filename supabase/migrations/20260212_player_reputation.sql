-- Player Reputation System
-- Tracks reliability, sportsmanship, etiquette, communication
-- Used across venues for trust scoring

CREATE TABLE IF NOT EXISTS commander_player_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL,
  reviewer_id UUID NOT NULL,           -- Staff or player who left the review
  reviewer_type TEXT NOT NULL DEFAULT 'staff',  -- 'staff', 'player', 'host'
  venue_id UUID,
  reliability INTEGER CHECK (reliability BETWEEN 1 AND 5),
  sportsmanship INTEGER CHECK (sportsmanship BETWEEN 1 AND 5),
  etiquette INTEGER CHECK (etiquette BETWEEN 1 AND 5),
  communication INTEGER CHECK (communication BETWEEN 1 AND 5),
  comment TEXT,
  context TEXT,                         -- 'cash_game', 'tournament', 'home_game'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reputation_player ON commander_player_reputation(player_id);
CREATE INDEX IF NOT EXISTS idx_reputation_venue ON commander_player_reputation(venue_id);

-- Aggregated reputation scores (materialized for fast lookup)
CREATE TABLE IF NOT EXISTS commander_player_reputation_scores (
  player_id UUID PRIMARY KEY,
  overall_score NUMERIC(3,2) DEFAULT 0,
  reliability_avg NUMERIC(3,2) DEFAULT 0,
  sportsmanship_avg NUMERIC(3,2) DEFAULT 0,
  etiquette_avg NUMERIC(3,2) DEFAULT 0,
  communication_avg NUMERIC(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  id_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  payment_verified BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
