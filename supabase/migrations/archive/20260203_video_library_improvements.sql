-- ═══════════════════════════════════════════════════════════════════════════
-- VIDEO LIBRARY IMPROVEMENTS
-- Migration: 20260203_video_library_improvements
-- Purpose: Add missing columns for watch tracking and Jarvis analysis
-- ═══════════════════════════════════════════════════════════════════════════

-- Add missing columns to video_watch_history
ALTER TABLE video_watch_history 
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS watch_duration_seconds INTEGER DEFAULT 0;

-- Add comments
COMMENT ON COLUMN video_watch_history.video_url IS 'Full YouTube URL for the video';
COMMENT ON COLUMN video_watch_history.thumbnail_url IS 'Thumbnail URL for display';
COMMENT ON COLUMN video_watch_history.watch_duration_seconds IS 'Total seconds user has watched this video';

-- Refresh schema cache
SELECT 1;
