-- =====================================================================
-- Pass 47 (BL-2): Seal commander_rate_limits open-INSERT poisoning vector
--
-- BUG (verified live):
--   Policy `commander_rate_limits_insert` has `with_check: true` and is
--   scoped to PUBLIC roles. Any authenticated or anonymous caller can
--   INSERT arbitrary rate-limit rows for any identifier, any endpoint,
--   with any blocked flag, with any counter value.
--
--   Attack classes:
--     (a) Victim DoS — attacker INSERTs row for victim_uuid with
--         is_blocked=true, blocked_until=<days-far>, locking the victim
--         out of whatever endpoint the attacker picks (e.g. broadcast,
--         RSVP, post).
--     (b) Self-bypass — attacker INSERTs self-row with huge max_requests
--         or request_count=0, nullifying their own rate limits on the
--         next consume call that finds the injected row.
--     (c) Storage DoS — attacker INSERTs millions of bogus rows to bloat
--         the table.
--
--   UPDATE/DELETE already blocked by RLS (no matching policy).
--
-- ROOT CAUSE:
--   Table exists to back Pass 46.1's fn_try_consume_home_rate_limit.
--   That RPC is SECURITY DEFINER (runs as postgres), so it bypasses RLS
--   entirely. No client-side code reads or writes this table directly.
--   The open INSERT policy is an orphan from scaffolding.
--
-- FIX:
--   DROP the permissive INSERT policy. After this migration, only
--   postgres/service_role can write — exactly what the RPC requires.
-- ========================================================================

DROP POLICY IF EXISTS "commander_rate_limits_insert" ON public.commander_rate_limits;

-- Assert
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    WHERE c.relname = 'commander_rate_limits' AND pol.polcmd = 'a'
  ) THEN
    RAISE EXCEPTION 'BL-2 fix failed: commander_rate_limits still has an INSERT policy';
  END IF;
END $$;

COMMENT ON TABLE public.commander_rate_limits IS
  'Rate-limit counters. Access is restricted to postgres/service_role: '
  'reads go through fn_try_consume_home_rate_limit (SECURITY DEFINER), '
  'no client-side CRUD. BL-2 Pass 47: permissive INSERT policy dropped.';