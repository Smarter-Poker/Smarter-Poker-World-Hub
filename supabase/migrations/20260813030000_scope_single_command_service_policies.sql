-- ============================================================================
-- Second half of the service-role policy scoping work.
--
-- 20260813020000 handled the 13 FOR ALL policies. This handles the same
-- anti-pattern in single-command form: 38 policies declared FOR INSERT/UPDATE/
-- DELETE/SELECT ... TO public whose entire body is
--     (SELECT auth.role()) = 'service_role'
--
-- Attached TO public, each is evaluated for every row of every matching
-- statement by anon and authenticated, where it is constant-false.
--
-- THE SAFETY ARGUMENT, TESTED RATHER THAN ASSUMED
-- Measured on this database immediately before writing this migration:
--     db role anon          -> auth.role() = NULL
--     db role authenticated -> auth.role() = NULL
-- Never 'service_role'. auth.role() reads the JWT role claim, and PostgREST
-- derives the database role from that same claim, so the two cannot diverge:
-- a caller whose claim is service_role runs AS service_role, which has
-- BYPASSRLS and never consults policies. The predicate is therefore false for
-- exactly the roles that evaluate it. Denied before, denied after.
--
-- CRITICALLY -- 15 sibling policies also mention service_role but as one branch
-- of an OR that grants real users access, e.g.
--     social_posts."Users can create their own posts"
--     trivia_pvp_queue."Users can delete own queue entry"
--     venue_live_tables.venue_live_tables_update_service
-- Re-scoping those would REVOKE genuine user access. This migration therefore
-- does not name policies by hand. It re-derives the "pure" set by normalising
-- each expression and requiring it to reduce to the service_role test alone,
-- and asserts afterwards that all 15 mixed policies are still TO public.
-- ============================================================================

SET LOCAL lock_timeout = '15s';

DO $$
DECLARE
    r record;
    n_altered int := 0;
    n_skipped int := 0;
BEGIN
    FOR r IN
        WITH pol AS (
            SELECT c.relname AS tbl, p.polname,
                   regexp_replace(
                       regexp_replace(
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '~' ||
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
                           '\s|::text|\(|\)|SELECT|AS role', '', 'g'),
                       'auth\.role=''service_role''', 'SVC', 'g') AS sig
              FROM pg_policy p
              JOIN pg_class c ON c.oid = p.polrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND p.polpermissive
               AND 0 = ANY(p.polroles)          -- still attached TO public
               AND p.polcmd <> '*'              -- FOR ALL handled in 20260813020000
               AND coalesce(pg_get_expr(p.polqual, p.polrelid), '')
                || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%service_role%'
        )
        SELECT tbl, polname FROM pol
         WHERE sig IN ('SVC~', '~SVC', 'SVC~SVC')   -- pure service-role test only
         ORDER BY tbl, polname
    LOOP
        EXECUTE format('ALTER POLICY %I ON public.%I TO service_role', r.polname, r.tbl);
        n_altered := n_altered + 1;
    END LOOP;

    SELECT count(*) INTO n_skipped
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND p.polpermissive AND 0 = ANY(p.polroles)
       AND p.polcmd <> '*'
       AND coalesce(pg_get_expr(p.polqual, p.polrelid), '')
        || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%service_role%';

    RAISE NOTICE 're-scoped % pure service-role policies; left % mixed policies TO public', n_altered, n_skipped;
END $$;

-- ---------------------------------------------------------------------------
-- POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    n_pure_left int;
    n_mixed     int;
    missing     text;
BEGIN
    -- 1. No PURE service-role policy is still attached TO public, in any form
    --    (FOR ALL ones were done by the previous migration).
    WITH pol AS (
        SELECT c.relname AS tbl, p.polname,
               regexp_replace(
                   regexp_replace(
                       coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '~' ||
                       coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
                       '\s|::text|\(|\)|SELECT|AS role', '', 'g'),
                   'auth\.role=''service_role''', 'SVC', 'g') AS sig
          FROM pg_policy p
          JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND p.polpermissive AND 0 = ANY(p.polroles)
    )
    SELECT count(*) INTO n_pure_left FROM pol WHERE sig IN ('SVC~', '~SVC', 'SVC~SVC');
    IF n_pure_left > 0 THEN
        RAISE EXCEPTION 'post-apply: % pure service-role policies still attached TO public', n_pure_left;
    END IF;

    -- 2. The 15 MIXED policies MUST be untouched -- re-scoping any of them
    --    would revoke real user access. Verify each by name.
    SELECT string_agg(x.tbl || '.' || x.pol, ', ') INTO missing
      FROM (VALUES
        ('collusion_tracking','collusion_admin_update'),
        ('collusion_tracking','collusion_admin_read'),
        ('ledger_reconcile_log','reconcile_admin_read'),
        ('social_posts','Users can create their own posts'),
        ('trivia_pvp_matches','Participants can view their matches'),
        ('trivia_pvp_queue','Waiting queue entries are discoverable'),
        ('trivia_pvp_queue','Users can update own queue entry'),
        ('trivia_pvp_queue','Users can delete own queue entry'),
        ('union_applications','union_applications_applicant_update'),
        ('union_leave_requests','union_leave_requests_owner_update'),
        ('user_reports','user_reports_select'),
        ('user_streaks','us_upd'),
        ('venue_live_tables','venue_live_tables_update_service'),
        ('venue_live_tables','venue_live_tables_insert_service'),
        ('venue_live_tables','venue_live_tables_delete_service')
      ) AS x(tbl, pol)
     WHERE NOT EXISTS (
        SELECT 1 FROM pg_policy p
         WHERE p.polname = x.pol
           AND p.polrelid = ('public.' || x.tbl)::regclass
           AND 0 = ANY(p.polroles)
     );
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'post-apply: these MIXED policies were wrongly re-scoped or dropped -- real user access lost: %', missing;
    END IF;

    SELECT count(*) INTO n_mixed
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND p.polpermissive AND 0 = ANY(p.polroles)
       AND coalesce(pg_get_expr(p.polqual, p.polrelid), '')
        || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%service_role%';

    RAISE NOTICE 'post-apply: OK -- 0 pure policies on public, % mixed policies correctly preserved', n_mixed;
END $$;
