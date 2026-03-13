-- Migration: ORB-8 Phase 5 — Cold Storage Archival Strategy
-- Moves Arena Ledger logs older than 30 days into _archive tables to maintain live engine I/O speed.

-- 1. Create Archive Tables matching the live schema exactly
CREATE TABLE IF NOT EXISTS public.club_arena_messages_archive (
    LIKE public.club_arena_messages INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS public.club_arena_audit_logs_archive (
    LIKE public.club_arena_audit_logs INCLUDING ALL
);

-- Note: The LIKE ... INCLUDING ALL command copies indexes as well, so queries on archives remain fast.

-- 2. Create the Archival Stored Procedure
CREATE OR REPLACE FUNCTION public.archive_old_arena_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Archive Messages older than 30 days
    WITH moved_msgs AS (
        DELETE FROM public.club_arena_messages
        WHERE created_at < NOW() - INTERVAL '30 days'
        RETURNING *
    )
    INSERT INTO public.club_arena_messages_archive
    SELECT * FROM moved_msgs;

    -- Archive Audit Logs older than 30 days
    WITH moved_audits AS (
        DELETE FROM public.club_arena_audit_logs
        WHERE created_at < NOW() - INTERVAL '30 days'
        RETURNING *
    )
    INSERT INTO public.club_arena_audit_logs_archive
    SELECT * FROM moved_audits;
    
END;
$$;

-- 3. Enable pg_cron (Requires Postgres restart or Superuser permissions usually, 
-- but in Supabase, pg_cron is available through SQL interface)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 4. Schedule the Archival Job
-- Runs every day at 03:00 AM server time
SELECT cron.schedule(
    'arena-log-archival-nightly',
    '0 3 * * *',
    $$SELECT public.archive_old_arena_logs();$$
);

COMMENT ON FUNCTION public.archive_old_arena_logs IS 'Safely migrates 30-day old absolute ledger records to cold storage to keep the engine index incredibly small and fast.';
