-- ============================================================================
-- Revoke client write grants on club_hand_daily (+ its shard table)
--
-- TIER 2 (grants only, no schema or data change). ROLLBACK below.
--
-- WHY NOW: this is what has been failing `Pre-Deploy Safety Checks` on main,
-- and therefore blocking every pull request in the repo. The economy invariant
-- `no_client_writable_views` reports:
--
--     FAIL  no_client_writable_views
--           a definer view with write grants is an RLS bypass
--
-- The offender is public.club_hand_daily, which carries INSERT / UPDATE /
-- DELETE for both `anon` and `authenticated`. The invariant already excludes
-- geography_columns and geometry_columns (PostGIS system views), so this one
-- view is the entire failure.
--
-- HOW BAD IS IT, HONESTLY: less bad than the invariant's wording implies, and
-- worth writing down so nobody panics or, worse, dismisses the whole check.
--
--   1. The view is `security_invoker=true`, so it does NOT run with its
--      owner's rights. It is not the definer-view RLS bypass the message
--      describes.
--   2. It is an AGGREGATING view (GROUP BY club_id, stat_date), so it is not
--      auto-updatable. A write through it errors regardless of grants.
--   3. The underlying table public.club_hand_daily_shard has RLS ENABLED with
--      ZERO POLICIES, which is deny-all for anon and authenticated.
--
-- So three independent things already stop the write. The grants are noise
-- left by a blanket default-privileges sweep -- they were never usable.
--
-- That is exactly why they should go. An invariant that stays red teaches
-- everyone to ignore it, and this one guards real defects: the same function
-- checks that balance RPCs are not client-executable and that anon-callable
-- definer functions verify auth.uid(). A permanently failing check is a
-- disabled check, and it is currently holding the whole merge queue shut.
--
-- The shard table's client write grants are revoked in the same migration.
-- They are inert for the same RLS reason, and leaving them would mean the
-- next person to add a policy to that table silently opens a write path
-- nobody intended.
--
-- SELECT is deliberately left alone on both. This is club hand statistics that
-- the app reads; removing read access is a product decision, not a security
-- fix, and is not what the invariant is asking for.
--
-- NOTE FOR WHOEVER RECREATES THIS VIEW: Supabase's ALTER DEFAULT PRIVILEGES
-- re-grants to anon and authenticated on CREATE. If you ever DROP and recreate
-- club_hand_daily, these revokes must be repeated in the same migration or
-- this check goes red again.
-- ============================================================================

-- ── PRE-FLIGHT ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'club_hand_daily' AND c.relkind = 'v'
  ) THEN
    RAISE EXCEPTION 'public.club_hand_daily is not a view here -- schema drifted, do not apply blindly';
  END IF;

  -- If the shard table ever gains policies, revoking its grants stops being a
  -- provably inert change and someone must think about it first.
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'club_hand_daily_shard'
  ) THEN
    RAISE NOTICE 'club_hand_daily_shard now has RLS policies -- verify no client write path depends on these grants';
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.club_hand_daily FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.club_hand_daily FROM authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.club_hand_daily_shard FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.club_hand_daily_shard FROM authenticated;

-- ── POST-APPLY ASSERTIONS ───────────────────────────────────────────────────
DO $$
DECLARE v_bad int;
BEGIN
  -- The invariant's own query, run here so this migration fails rather than
  -- leaving CI to discover it did not work.
  SELECT COUNT(*) INTO v_bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE c.relkind = 'v'
     AND c.relname NOT IN ('geography_columns', 'geometry_columns')
     AND (has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE')
       OR has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE'));
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'no_client_writable_views still fails: % view(s) remain client-writable', v_bad;
  END IF;

  -- SELECT must survive, or this "security fix" is an outage.
  IF NOT has_table_privilege('authenticated', 'public.club_hand_daily', 'SELECT') THEN
    RAISE EXCEPTION 'SELECT was revoked from authenticated on club_hand_daily -- that was not the intent';
  END IF;
  IF NOT has_table_privilege('anon', 'public.club_hand_daily', 'SELECT') THEN
    RAISE EXCEPTION 'SELECT was revoked from anon on club_hand_daily -- that was not the intent';
  END IF;

  -- service_role does the actual writing and must be untouched.
  IF NOT has_table_privilege('service_role', 'public.club_hand_daily_shard', 'INSERT') THEN
    RAISE EXCEPTION 'service_role lost INSERT on club_hand_daily_shard -- the stats writer is now broken';
  END IF;

  RAISE NOTICE 'no_client_writable_views now passes; SELECT and service_role writes intact';
END $$;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Restores the (inert) client write grants exactly as they stood. Doing this
-- puts Pre-Deploy Safety Checks back to red and re-blocks the merge queue, so
-- only run it if this migration is proven to have broken something.
--
-- GRANT INSERT, UPDATE, DELETE ON public.club_hand_daily TO anon;
-- GRANT INSERT, UPDATE, DELETE ON public.club_hand_daily TO authenticated;
-- GRANT INSERT, UPDATE, DELETE ON public.club_hand_daily_shard TO anon;
-- GRANT INSERT, UPDATE, DELETE ON public.club_hand_daily_shard TO authenticated;
