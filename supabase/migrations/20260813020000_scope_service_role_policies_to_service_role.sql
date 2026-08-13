-- ============================================================================
-- Scope "service role manages X" policies TO service_role instead of TO public.
--
-- THE ANTI-PATTERN
-- 13 policies are declared FOR ALL ... TO public with body
--     (SELECT auth.role()) = 'service_role'
-- `TO public` attaches the policy to EVERY role, so Postgres evaluates that
-- expression for every row of every query issued by anon and authenticated --
-- where it can only ever return false. It is pure overhead that never grants.
--
-- Being FOR ALL it also collides with each of the table's four commands for
-- both roles, which is why 44 of the 64 multiple_permissive_policies warnings
-- (69%, across 10 tables) trace back to just these 13 policies.
--
-- WHY RE-SCOPING IS SAFE
-- auth.role() reflects the JWT role claim, and PostgREST derives the database
-- role from that same claim. A caller whose claim is service_role therefore
-- already runs AS service_role, which in Supabase has BYPASSRLS and skips
-- policies entirely. The expression is true only for a role that never consults
-- it, and false for every role that does. Re-scoping cannot change an outcome.
--
-- The migration does not rely on that argument: it MEASURES what anon and
-- authenticated can see before and after, and aborts on any difference.
--
-- TWO EARLIER ATTEMPTS FAILED AND ROLLED BACK CLEANLY -- both worth recording:
--   1. Deadlock against live traffic (ALTER POLICY takes AccessExclusiveLock
--      while readers hold RowShareLock). Hence lock_timeout, and hence all
--      measurement is done BEFORE any lock is taken.
--   2. Probing admin_audit_log as anon RAISED "permission denied for function
--      fn_is_platform_admin" -- another policy on that table calls a function
--      anon cannot execute. So a probe must treat "raised an error" as a
--      legitimate, comparable outcome rather than a migration failure. It is
--      recorded as -1 and compared like any other value: error-before and
--      error-after is unchanged behaviour.
-- ============================================================================

SET LOCAL lock_timeout = '15s';

-- Probe helper: rows visible to `as_role`, or -1 if the query is refused.
-- Bounded by LIMIT so it stays cheap on large tables while still detecting any
-- 0 -> N or N -> 0 change in visibility.
CREATE FUNCTION pg_temp.rls_probe(tbl text, as_role text)
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE n int;
BEGIN
    BEGIN
        EXECUTE format('SET LOCAL ROLE %I', as_role);
        EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM public.%I LIMIT 1000) s', tbl) INTO n;
        RESET ROLE;
        RETURN n;
    EXCEPTION WHEN OTHERS THEN
        RESET ROLE;
        RETURN -1;   -- refused; a stable, comparable outcome
    END;
END;
$fn$;

DO $$
DECLARE
    targets text[][] := ARRAY[
        ARRAY['admin_audit_log',             'admin_audit_log_service_only'],
        ARRAY['agent_commissions',           'agent_commissions_service_only'],
        ARRAY['diamond_platform_budget',     'diamond_platform_budget_service'],
        ARRAY['endless_high_scores',         'Service role manages endless high scores'],
        ARRAY['orb1_idempotency_keys',       'Service Role Full Access'],
        ARRAY['survival_progress',           'Service role manages survival progress'],
        ARRAY['trivia_diamond_award_limits', 'Service role manages limits'],
        ARRAY['trivia_prize_wheel_spins',    'Service role manages spins'],
        ARRAY['trivia_pvp_matches',          'Service role manages pvp matches'],
        ARRAY['trivia_scores',               'Service role can manage scores'],
        ARRAY['trivia_streaks',              'Service role can manage streaks'],
        ARRAY['trivia_tournament_entries',   'Service role manages tournament entries'],
        ARRAY['trivia_user_items',           'Service role manages items']
    ];
    before_anon int[] := '{}'; before_auth int[] := '{}';
    todo boolean[] := '{}';
    i int; n int; n_altered int := 0;
BEGIN
    -- PHASE 1 -- measure, before taking any lock.
    FOR i IN 1 .. array_length(targets, 1) LOOP
        todo := todo || EXISTS (
            SELECT 1 FROM pg_policy
             WHERE polname = targets[i][2]
               AND polrelid = ('public.' || targets[i][1])::regclass
               AND 0 = ANY(polroles)
        );
        before_anon := before_anon || pg_temp.rls_probe(targets[i][1], 'anon');
        before_auth := before_auth || pg_temp.rls_probe(targets[i][1], 'authenticated');
    END LOOP;

    -- PHASE 2 -- re-scope (idempotent; skips anything already done).
    FOR i IN 1 .. array_length(targets, 1) LOOP
        CONTINUE WHEN NOT todo[i];
        EXECUTE format('ALTER POLICY %I ON public.%I TO service_role', targets[i][2], targets[i][1]);
        n_altered := n_altered + 1;
    END LOOP;

    -- PHASE 3 -- re-measure; require an exact match on both roles.
    FOR i IN 1 .. array_length(targets, 1) LOOP
        n := pg_temp.rls_probe(targets[i][1], 'anon');
        IF n IS DISTINCT FROM before_anon[i] THEN
            RAISE EXCEPTION 'ABORT: % changed anon visibility from % to % (-1 = refused)',
                targets[i][1], before_anon[i], n;
        END IF;

        n := pg_temp.rls_probe(targets[i][1], 'authenticated');
        IF n IS DISTINCT FROM before_auth[i] THEN
            RAISE EXCEPTION 'ABORT: % changed authenticated visibility from % to % (-1 = refused)',
                targets[i][1], before_auth[i], n;
        END IF;
    END LOOP;

    RAISE NOTICE 're-scoped % policies to service_role; visibility identical for anon and authenticated', n_altered;
END $$;

-- ---------------------------------------------------------------------------
-- POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    still_public text;
    warn_count   int;
BEGIN
    SELECT string_agg(c.relname || '.' || p.polname, ', ')
      INTO still_public
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND p.polpermissive AND p.polcmd = '*'
       AND 0 = ANY(p.polroles)
       AND pg_get_expr(p.polqual, p.polrelid) LIKE '%service_role%';
    IF still_public IS NOT NULL THEN
        RAISE EXCEPTION 'post-apply: still scoped TO public: %', still_public;
    END IF;

    -- Recompute the advisor metric with a proper cartesian expansion of
    -- roles x commands. (An earlier pass used parallel unnest in the SELECT
    -- list, which ZIPS the arrays and pads the shorter one with NULL -- it
    -- reported 195 warnings when the true figure was 64.)
    WITH pol AS (
        SELECT c.relname AS tbl,
               CASE p.polcmd WHEN 'r' THEN ARRAY['SELECT'] WHEN 'a' THEN ARRAY['INSERT']
                    WHEN 'w' THEN ARRAY['UPDATE'] WHEN 'd' THEN ARRAY['DELETE']
                    ELSE ARRAY['SELECT','INSERT','UPDATE','DELETE'] END AS cmds,
               CASE WHEN 0 = ANY(p.polroles) THEN ARRAY['anon','authenticated']
                    ELSE COALESCE((SELECT array_agg(rolname::text) FROM pg_roles
                                    WHERE oid = ANY(p.polroles)), '{}') END AS roles
          FROM pg_policy p
          JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND p.polpermissive
    )
    SELECT count(*) INTO warn_count FROM (
        SELECT pol.tbl, r.role, cm.cmd
          FROM pol
          CROSS JOIN LATERAL unnest(pol.roles) AS r(role)
          CROSS JOIN LATERAL unnest(pol.cmds)  AS cm(cmd)
         WHERE r.role IN ('anon','authenticated')
         GROUP BY pol.tbl, r.role, cm.cmd
        HAVING count(*) > 1
    ) d;

    IF warn_count > 25 THEN
        RAISE EXCEPTION 'post-apply: expected warnings to fall to ~20, got %', warn_count;
    END IF;

    RAISE NOTICE 'post-apply: OK -- multiple-permissive-policy warnings now %', warn_count;
END $$;
