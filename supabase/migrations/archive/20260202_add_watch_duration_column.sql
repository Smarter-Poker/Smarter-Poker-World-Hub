-- Add watch_duration_seconds column to track how long users watch videos
-- This enables the 60-second threshold for marking videos as "watched"

ALTER TABLE video_watch_history 
ADD COLUMN IF NOT EXISTS watch_duration_seconds INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN video_watch_history.watch_duration_seconds IS 'Total seconds user has watched this video';
