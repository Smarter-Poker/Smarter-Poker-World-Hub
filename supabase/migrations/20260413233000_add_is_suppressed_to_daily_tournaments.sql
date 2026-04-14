-- Add is_suppressed column to venue_daily_tournaments to allow soft-deleting bad events
ALTER TABLE venue_daily_tournaments ADD COLUMN IF NOT EXISTS is_suppressed boolean DEFAULT false;
