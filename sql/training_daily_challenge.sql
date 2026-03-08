-- ═══════════════════════════════════════════════════════════════════════════
-- TRAINING DAILY CHALLENGE TABLE
-- Track daily challenge completions and leaderboard
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS training_daily_challenge (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    daily_id TEXT NOT NULL,
    score NUMERIC DEFAULT 0,
    ev_loss NUMERIC DEFAULT 0,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, daily_id)
);

-- Index for leaderboard queries (today's top scores)
CREATE INDEX IF NOT EXISTS idx_daily_challenge_daily_id 
    ON training_daily_challenge(daily_id, score DESC);

-- Index for user history
CREATE INDEX IF NOT EXISTS idx_daily_challenge_user 
    ON training_daily_challenge(user_id, completed_at DESC);

-- RLS Policies
ALTER TABLE training_daily_challenge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all daily challenge results"
    ON training_daily_challenge FOR SELECT
    USING (true);

CREATE POLICY "Users can insert own daily challenge results"
    ON training_daily_challenge FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily challenge results"
    ON training_daily_challenge FOR UPDATE
    USING (auth.uid() = user_id);
