-- Migration: 20260310231600_cron_advisory_lock.sql
-- Description: Adds RPC to safely acquire and release Postgres advisory locks for the Vercel cron job.

-- 1) Try to acquire a session-level advisory lock
-- Returns TRUE if lock acquired, FALSE if already locked
CREATE OR REPLACE FUNCTION fn_try_cron_lock(p_lock_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    -- Convert text to a unique big int hash for pg_try_advisory_lock
    SELECT pg_try_advisory_lock(hashtext(p_lock_name));
$$;

-- 2) Release the session-level advisory lock
CREATE OR REPLACE FUNCTION fn_release_cron_lock(p_lock_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT pg_advisory_unlock(hashtext(p_lock_name));
$$;
