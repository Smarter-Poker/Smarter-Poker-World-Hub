-- BUG-17 FIX: Add video_favorites to supabase_realtime publication
-- Without this, the RT subscription in video-library.js for the 'video_favorites'
-- table (established at L354-L361) will NEVER receive any events, making
-- cross-device / cross-tab favorite sync completely broken silently.
--
-- Companion: video_watch_history was added in 20260426_video_watch_history_realtime.sql
-- This follows the same pattern.

DO $$
BEGIN
    -- Add video_favorites to the realtime publication (idempotent)
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND tablename = 'video_favorites'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.video_favorites;
        RAISE NOTICE 'Added video_favorites to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'video_favorites already in supabase_realtime — no action needed';
    END IF;
END $$;
