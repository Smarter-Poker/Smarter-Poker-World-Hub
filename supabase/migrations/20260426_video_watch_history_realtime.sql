-- ─────────────────────────────────────────────────────────────────────────────
-- Enable Supabase Realtime for video_watch_history
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: The video-library page subscribes to postgres_changes on
--   'video_watch_history' for cross-device watch-progress synchronisation.
--   Without this table in the supabase_realtime publication, the event is
--   silently dropped and the RT listener never fires.
--
-- SAFE: idempotent — skips if table is already in the publication.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND tablename = 'video_watch_history'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.video_watch_history;
        RAISE NOTICE 'Added video_watch_history to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'video_watch_history already in supabase_realtime — no action needed';
    END IF;
END
$$;
