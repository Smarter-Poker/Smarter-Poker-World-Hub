-- Add perfect_rounds tracking to leaderboard
-- Required for Flawless achievements (flawless_10, flawless_50)

-- Add perfect_rounds column if it doesn't exist
ALTER TABLE training_leaderboard 
ADD COLUMN IF NOT EXISTS perfect_rounds INTEGER DEFAULT 0;

-- Create index for queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_perfect_rounds 
    ON training_leaderboard(period_type, period_key, perfect_rounds DESC);
