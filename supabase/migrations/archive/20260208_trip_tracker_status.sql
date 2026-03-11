-- Trip Tracker: Add status column to bankroll_trips
-- Existing rows default to 'completed', new trips start as 'active'
ALTER TABLE bankroll_trips
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
CHECK (status IN ('active', 'completed', 'deleted'));

-- Index for fast lookup of active trips per user
CREATE INDEX IF NOT EXISTS idx_bankroll_trips_user_status
ON bankroll_trips(user_id, status);
