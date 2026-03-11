-- PvP Queue Table for Realtime Matchmaking
-- Run this migration to enable PvP matchmaking

CREATE TABLE IF NOT EXISTS trivia_pvp_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    stake_amount INTEGER NOT NULL DEFAULT 10,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'cancelled', 'expired')),
    match_id UUID REFERENCES trivia_pvp_matches(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 minutes'),
    UNIQUE(user_id, status) WHERE status = 'waiting'
);

-- Fast matchmaking index
CREATE INDEX IF NOT EXISTS idx_pvp_queue_matching 
ON trivia_pvp_queue(stake_amount, status, created_at) 
WHERE status = 'waiting';

-- Enable Realtime
ALTER TABLE trivia_pvp_queue REPLICA IDENTITY FULL;

-- RLS Policies
ALTER TABLE trivia_pvp_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see queue entries" ON trivia_pvp_queue
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own queue entry" ON trivia_pvp_queue
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own queue entry" ON trivia_pvp_queue
    FOR UPDATE USING (auth.uid() = user_id);

-- Update trivia_pvp_matches if needed
ALTER TABLE trivia_pvp_matches 
ADD COLUMN IF NOT EXISTS player1_score INTEGER,
ADD COLUMN IF NOT EXISTS player2_score INTEGER;

-- Auto-expire old queue entries
CREATE OR REPLACE FUNCTION expire_old_queue_entries()
RETURNS void AS $$
BEGIN
    UPDATE trivia_pvp_queue
    SET status = 'expired'
    WHERE status = 'waiting' 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE trivia_pvp_queue IS 'Real-time matchmaking queue for PvP trivia battles';
