-- ============================================================
-- Enable realtime replication for venue_checkins table
-- Required for live check-in feed updates on venue detail pages
-- Safe to re-run (checks IF NOT EXISTS)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'venue_checkins'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_checkins;
        RAISE NOTICE 'Added venue_checkins to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'venue_checkins already in supabase_realtime publication';
    END IF;
END $$;
