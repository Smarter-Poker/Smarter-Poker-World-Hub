-- STREAM-POLISH-R8 SECURITY HARDENING: enable RLS on the two
-- internal tables created in R6 (migration 20260511230000):
--
--   - rate_limit_buckets — internal counter table for check_rate_limit
--   - cron_locks         — internal mutex table for fn_try_cron_lock
--
-- Both tables are accessed ONLY through SECURITY DEFINER functions
-- (check_rate_limit / fn_try_cron_lock / fn_release_cron_lock), which
-- run with elevated privileges and bypass RLS. No direct REST or
-- client access is intended. We're enabling RLS with explicit
-- DENY-ALL policies so the Supabase security advisor doesn't flag
-- them, and to provide defense in depth if a future EXECUTE grant
-- on the wrappers ever leaks.
--
-- service_role bypasses RLS by default in Postgres -- the functions
-- run as their definer (a privileged role), so this lockdown is
-- transparent to existing callers.

-- ---- rate_limit_buckets ---------------------------------------
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_limit_buckets_no_anon ON public.rate_limit_buckets;
CREATE POLICY rate_limit_buckets_no_anon
  ON public.rate_limit_buckets
  AS PERMISSIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ---- cron_locks ----------------------------------------------
ALTER TABLE public.cron_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_locks_no_anon ON public.cron_locks;
CREATE POLICY cron_locks_no_anon
  ON public.cron_locks
  AS PERMISSIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
