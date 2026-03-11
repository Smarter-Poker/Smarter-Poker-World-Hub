-- ═══════════════════════════════════════════════════════════════
-- HORSE AI PHASE 5: PERSISTENCE TABLES
-- Creates tables for horse session analytics, opponent reads,
-- and hand history persistence.
-- Column names MUST match the JS code in HorsePokerBrain.js
-- ═══════════════════════════════════════════════════════════════

-- 1. Horse Session Stats (#37)
-- JS columns: profile_id, table_id, hands_played, vpip, pfr,
--   aggression_factor, win_rate_bb100, wins, losses, session_minutes, recorded_at
CREATE TABLE IF NOT EXISTS horse_session_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    hands_played INTEGER DEFAULT 0,
    vpip NUMERIC(5,2) DEFAULT 0,
    pfr NUMERIC(5,2) DEFAULT 0,
    aggression_factor NUMERIC(5,2) DEFAULT 0,
    win_rate_bb100 NUMERIC(8,4) DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    session_minutes NUMERIC(8,2) DEFAULT 0,
    recorded_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(profile_id, table_id)
);

CREATE INDEX IF NOT EXISTS idx_horse_session_stats_profile 
    ON horse_session_stats(profile_id);
CREATE INDEX IF NOT EXISTS idx_horse_session_stats_recorded 
    ON horse_session_stats(recorded_at DESC);

-- 2. Horse Opponent Reads (#40)
-- JS columns: horse_id, opponent_id, bluff_frequency, value_frequency,
--   fold_frequency, call_frequency, hands_observed, tendency, updated_at
CREATE TABLE IF NOT EXISTS horse_opponent_reads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    horse_id TEXT NOT NULL,
    opponent_id TEXT NOT NULL,
    bluff_frequency NUMERIC(5,4) DEFAULT 0,
    value_frequency NUMERIC(5,4) DEFAULT 0,
    fold_frequency NUMERIC(5,4) DEFAULT 0,
    call_frequency NUMERIC(5,4) DEFAULT 0,
    hands_observed INTEGER DEFAULT 0,
    tendency TEXT DEFAULT 'unknown',
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(horse_id, opponent_id)
);

CREATE INDEX IF NOT EXISTS idx_horse_opponent_reads_horse 
    ON horse_opponent_reads(horse_id);

-- 3. Horse Hand History (#41)
-- JS columns: hand_id, table_id, pot_size_bb, players (JSON string),
--   board (JSON string), recorded_at
CREATE TABLE IF NOT EXISTS horse_hand_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    hand_id TEXT,
    table_id TEXT,
    pot_size_bb INTEGER DEFAULT 0,
    players JSONB DEFAULT '[]',
    board JSONB DEFAULT '[]',
    recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_horse_hand_history_recorded 
    ON horse_hand_history(recorded_at DESC);

-- RLS: Allow service role full access
ALTER TABLE horse_session_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_opponent_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_hand_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on horse_session_stats" 
    ON horse_session_stats FOR ALL 
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on horse_opponent_reads" 
    ON horse_opponent_reads FOR ALL 
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on horse_hand_history" 
    ON horse_hand_history FOR ALL 
    USING (true) WITH CHECK (true);
