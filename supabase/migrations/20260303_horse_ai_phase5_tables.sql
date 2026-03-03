-- ═══════════════════════════════════════════════════════════════
-- HORSE AI PHASE 5: PERSISTENCE TABLES
-- Creates tables for horse session analytics, opponent reads,
-- and hand history persistence.
-- ═══════════════════════════════════════════════════════════════

-- 1. Horse Session Stats (#37)
CREATE TABLE IF NOT EXISTS horse_session_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    hands_played INTEGER DEFAULT 0,
    vpip NUMERIC(5,2) DEFAULT 0,
    pfr NUMERIC(5,2) DEFAULT 0,
    af NUMERIC(5,2) DEFAULT 0,
    win_rate NUMERIC(8,4) DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    session_minutes NUMERIC(8,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_horse_session_stats_profile 
    ON horse_session_stats(profile_id);
CREATE INDEX IF NOT EXISTS idx_horse_session_stats_created 
    ON horse_session_stats(created_at DESC);

-- 2. Horse Opponent Reads (#40)
CREATE TABLE IF NOT EXISTS horse_opponent_reads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    horse_id TEXT NOT NULL,
    opponent_id TEXT NOT NULL,
    hands_observed INTEGER DEFAULT 0,
    vpip NUMERIC(5,2) DEFAULT 0,
    pfr NUMERIC(5,2) DEFAULT 0,
    af NUMERIC(5,2) DEFAULT 0,
    bluff_frequency NUMERIC(5,4) DEFAULT 0,
    fold_to_cbet NUMERIC(5,4) DEFAULT 0,
    three_bet_frequency NUMERIC(5,4) DEFAULT 0,
    tendency TEXT DEFAULT 'unknown',
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(horse_id, opponent_id)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_horse_opponent_reads_horse 
    ON horse_opponent_reads(horse_id);

-- 3. Horse Hand History (#41)
CREATE TABLE IF NOT EXISTS horse_hand_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    hand_id TEXT,
    table_id TEXT,
    board TEXT[] DEFAULT '{}',
    pot_size NUMERIC(12,2) DEFAULT 0,
    pot_bb NUMERIC(8,2) DEFAULT 0,
    players JSONB DEFAULT '[]',
    winners JSONB DEFAULT '[]',
    significance TEXT DEFAULT 'large_pot',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_horse_hand_history_created 
    ON horse_hand_history(created_at DESC);

-- Disable RLS on these tables (horse AI data, not user-facing)
ALTER TABLE horse_session_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_opponent_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_hand_history ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on horse_session_stats" 
    ON horse_session_stats FOR ALL 
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on horse_opponent_reads" 
    ON horse_opponent_reads FOR ALL 
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on horse_hand_history" 
    ON horse_hand_history FOR ALL 
    USING (true) WITH CHECK (true);
