-- ============================================================
-- CRITICAL SECURITY FIX: Enable RLS on venue_live_tables
-- ============================================================
-- Without RLS, anonymous users could INSERT/DELETE/UPDATE live
-- table data via the public PostgREST endpoint, enabling:
--   1. Data poisoning (fake table counts)
--   2. Complete data wipe (DELETE without restriction)
--   3. Watchdog alert circumvention
--
-- Policy: Public read, service_role-only writes.
-- ============================================================

-- Enable RLS
ALTER TABLE public.venue_live_tables ENABLE ROW LEVEL SECURITY;

-- Public read access (anon + authenticated can SELECT)
CREATE POLICY "venue_live_tables_read_all"
  ON public.venue_live_tables
  FOR SELECT
  USING (true);

-- Only service_role can INSERT (daemon uses service_role key)
CREATE POLICY "venue_live_tables_insert_service"
  ON public.venue_live_tables
  FOR INSERT
  WITH CHECK (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- Only service_role can UPDATE
CREATE POLICY "venue_live_tables_update_service"
  ON public.venue_live_tables
  FOR UPDATE
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- Only service_role can DELETE
CREATE POLICY "venue_live_tables_delete_service"
  ON public.venue_live_tables
  FOR DELETE
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );
