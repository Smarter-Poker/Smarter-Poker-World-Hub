-- ============================================================================
-- Consolidate duplicate PERMISSIVE RLS policies.
--
-- Supabase's performance advisor reported multiple_permissive_policies
-- warnings across 30 tables. Permissive policies are OR'd, so every duplicate
-- is an extra expression Postgres must evaluate for EVERY row of EVERY query
-- by that role.
--
-- SECURITY NOTE (corrected during this audit): an earlier pass believed
-- training_progress and clawbot_audit_log had `USING (true)` policies granting
-- public access. They do not -- both are scoped TO service_role. Verified
-- behaviourally: an authenticated session with no auth.uid() saw 0 of 4
-- training_progress rows and deleted 0 of 4. No hole existed. This migration
-- therefore changes NO effective permission for the exact-duplicate pairs; it
-- only removes redundant evaluations.
--
-- Two entries DO tighten, deliberately, and are called out inline.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PRE-FLIGHT: prove each "exact duplicate" really is byte-identical to the
-- policy being kept. If anyone has edited one of them since this was written,
-- they are no longer duplicates and dropping one would change behaviour --
-- so abort rather than guess.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r          record;
    d_qual     text; d_check text;
    k_qual     text; k_check text;
    d_found    boolean; k_found boolean;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('diamond_transactions', 'Users can view own transactions',            'diamond_transactions_select_own'),
            ('endless_high_scores',  'Users can insert own endless high score',    'users_insert_own_scores'),
            ('endless_high_scores',  'Users can update own endless high score',    'users_update_own_scores'),
            ('endless_high_scores',  'Endless high scores are viewable by all',    'anyone_read_leaderboard'),
            ('survival_progress',    'Users can insert own survival progress',     'users_insert_own_progress'),
            ('survival_progress',    'Users can update own survival progress',     'users_update_own_progress'),
            ('merchandise_orders',   'Users can view own orders',                  'merchandise_orders_own_read')
        ) AS t(tbl, drop_pol, keep_pol)
    LOOP
        SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid), true
          INTO d_qual, d_check, d_found
          FROM pg_policy
         WHERE polname = r.drop_pol AND polrelid = ('public.' || r.tbl)::regclass;

        SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid), true
          INTO k_qual, k_check, k_found
          FROM pg_policy
         WHERE polname = r.keep_pol AND polrelid = ('public.' || r.tbl)::regclass;

        IF NOT COALESCE(k_found, false) THEN
            RAISE EXCEPTION 'pre-flight: keep-policy % on % is missing; refusing to drop its twin',
                r.keep_pol, r.tbl;
        END IF;

        -- Already dropped by a previous run: idempotent, skip.
        IF NOT COALESCE(d_found, false) THEN
            CONTINUE;
        END IF;

        IF COALESCE(d_qual, '~') IS DISTINCT FROM COALESCE(k_qual, '~')
           OR COALESCE(d_check, '~') IS DISTINCT FROM COALESCE(k_check, '~') THEN
            RAISE EXCEPTION
                'pre-flight: % and % on % are NOT duplicates -- dropping would change behaviour. drop.using=% keep.using=% drop.check=% keep.check=%',
                r.drop_pol, r.keep_pol, r.tbl, d_qual, k_qual, d_check, k_check;
        END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Exact duplicates -- no effective permission change.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own transactions"         ON public.diamond_transactions;
DROP POLICY IF EXISTS "Users can insert own endless high score" ON public.endless_high_scores;
DROP POLICY IF EXISTS "Users can update own endless high score" ON public.endless_high_scores;
DROP POLICY IF EXISTS "Endless high scores are viewable by all" ON public.endless_high_scores;
DROP POLICY IF EXISTS "Users can insert own survival progress"  ON public.survival_progress;
DROP POLICY IF EXISTS "Users can update own survival progress"  ON public.survival_progress;
DROP POLICY IF EXISTS "Users can view own orders"               ON public.merchandise_orders;

-- ---------------------------------------------------------------------------
-- TIGHTENING #1: trivia_scores INSERT.
-- Two policies existed:
--   "Users can insert scores"            WITH CHECK (uid = user_id OR user_id IS NULL)
--   "Users can insert their own scores"  WITH CHECK (uid = user_id)
-- Being permissive they were OR'd, so the looser one won and ANY caller could
-- insert an ownerless score row -- unbounded leaderboard pollution.
-- Verified before dropping: production has 0 rows with user_id IS NULL, and
-- every insert site in the codebase (time-attack, mixed, endless,
-- survival-game, StrategyTrivia, api/trivia/submit) runs authenticated and
-- always supplies user_id. Nothing legitimate relies on the guest path.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname = 'Users can insert their own scores'
           AND polrelid = 'public.trivia_scores'::regclass
    ) THEN
        RAISE EXCEPTION 'pre-flight: strict trivia_scores insert policy missing; refusing to drop the loose one';
    END IF;
END $$;

DROP POLICY IF EXISTS "Users can insert scores" ON public.trivia_scores;

-- ---------------------------------------------------------------------------
-- TIGHTENING #2: clawbot_audit_log (273 rows -- the only non-empty table here).
-- Two service-role policies did the same job:
--   service_role_full_access_audit      TO public        USING (auth.role() = 'service_role')
--   service_role_full_access_audit_log  TO service_role  USING (true)
-- The first is scoped TO public, so Postgres evaluated auth.role() for every
-- row of every audit-log query by any role, only to return false. The second
-- covers the real case. Dropping the first leaves the audit log readable by
-- service_role only, which is what it should be.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polname = 'service_role_full_access_audit_log'
           AND polrelid = 'public.clawbot_audit_log'::regclass
    ) THEN
        RAISE EXCEPTION 'pre-flight: service_role audit-log policy missing; refusing to drop its twin';
    END IF;
END $$;

DROP POLICY IF EXISTS "service_role_full_access_audit" ON public.clawbot_audit_log;

-- ---------------------------------------------------------------------------
-- backtest_* : identical `USING (true)` SELECT policies duplicated across the
-- anon and authenticated roles. Collapse each pair into one policy TO public
-- (public covers both roles), preserving read access exactly.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon read backtest_accuracy"      ON public.backtest_accuracy;
DROP POLICY IF EXISTS "anon read backtest_market_output" ON public.backtest_market_output;
DROP POLICY IF EXISTS "anon read backtest_props"         ON public.backtest_props;

ALTER POLICY "auth read backtest_accuracy"      ON public.backtest_accuracy      TO public;
ALTER POLICY "auth read backtest_market_output" ON public.backtest_market_output TO public;
ALTER POLICY "auth read backtest_props"         ON public.backtest_props         TO public;

-- ---------------------------------------------------------------------------
-- POST-APPLY ASSERTIONS
--
-- Assert on ROWS AFFECTED, never on "the statement did not error". RLS filters
-- rows rather than raising, so a DELETE matching zero rows SUCCEEDS. An earlier
-- version of this audit drew a false conclusion from exactly that.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    n int; total int; leftover text;
BEGIN
    -- 1. Every intended policy is gone.
    SELECT string_agg(polname, ', ') INTO leftover
      FROM pg_policy
     WHERE polname IN (
        'Users can view own transactions', 'Users can insert own endless high score',
        'Users can update own endless high score', 'Endless high scores are viewable by all',
        'Users can insert own survival progress', 'Users can update own survival progress',
        'Users can view own orders', 'Users can insert scores',
        'service_role_full_access_audit', 'anon read backtest_accuracy',
        'anon read backtest_market_output', 'anon read backtest_props');
    IF leftover IS NOT NULL THEN
        RAISE EXCEPTION 'post-apply: these policies survived the drop: %', leftover;
    END IF;

    -- 2. Every keeper survived.
    IF (SELECT count(*) FROM pg_policy WHERE polname IN (
            'diamond_transactions_select_own', 'users_insert_own_scores',
            'users_update_own_scores', 'anyone_read_leaderboard',
            'users_insert_own_progress', 'users_update_own_progress',
            'merchandise_orders_own_read', 'Users can insert their own scores',
            'service_role_full_access_audit_log', 'auth read backtest_accuracy',
            'auth read backtest_market_output', 'auth read backtest_props')) <> 12 THEN
        RAISE EXCEPTION 'post-apply: a policy that must be kept is missing';
    END IF;

    -- 3. BEHAVIOURAL: owner scoping on merchandise_orders still bites. This
    --    session has no auth.uid(), so an authenticated role must see 0 rows.
    SELECT count(*) INTO total FROM public.merchandise_orders;
    IF total > 0 THEN
        SET LOCAL ROLE authenticated;
        SELECT count(*) INTO n FROM public.merchandise_orders;
        RESET ROLE;
        IF n > 0 THEN
            RAISE EXCEPTION
                'post-apply: merchandise_orders leaked % of % rows to a session with no auth.uid()', n, total;
        END IF;
    END IF;

    -- 4. BEHAVIOURAL: the audit log stays closed to non-service roles, measured
    --    by rows returned rather than by absence of an error.
    SELECT count(*) INTO total FROM public.clawbot_audit_log;
    IF total = 0 THEN
        RAISE EXCEPTION 'post-apply: clawbot_audit_log unexpectedly empty; the read test would be vacuous';
    END IF;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.clawbot_audit_log;
    RESET ROLE;
    IF n > 0 THEN
        RAISE EXCEPTION 'post-apply: audit log leaked % of % rows to authenticated', n, total;
    END IF;

    -- 5. BEHAVIOURAL: ownerless trivia_scores inserts are now refused. Attempt
    --    one and require that it FAILS; roll back regardless.
    BEGIN
        SET LOCAL ROLE authenticated;
        INSERT INTO public.trivia_scores (user_id, mode, score) VALUES (NULL, 'daily', 1);
        RESET ROLE;
        RAISE EXCEPTION 'post-apply: an ownerless trivia_scores insert still succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;  -- expected: RLS refused it
    END;

    RAISE NOTICE 'post-apply: all assertions passed';
END $$;
