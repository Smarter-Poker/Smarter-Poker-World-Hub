-- =======================================================================
-- 20260808200000_views_readonly_and_invoker.sql
-- =======================================================================
-- TIER:        3            (privilege change on API-exposed views)
-- AUTHOR:      claude (cowork session, 2026-08-08)
-- AFFECTS:     public.trivia_tournaments_public (+ 23 other reporting views)
-- IRREVERSIBLE: no — ROLLBACK at the bottom
--
-- WHY — a CONFIRMED unauthenticated write path
-- ───────────────────────────────────────────────────────────────────────
-- public.trivia_tournaments_public is a view over trivia_tournaments that
-- strips correct_index/explanation from the questions payload. Two things
-- were true about it at once:
--
--   1. It had NO security_invoker option, so it ran with the VIEW OWNER's
--      privileges and bypassed row level security on trivia_tournaments.
--   2. anon and authenticated held INSERT, UPDATE, DELETE and TRUNCATE on
--      it, and information_schema reports it as is_updatable = YES (single
--      base table, no aggregates — Postgres auto-updatable).
--
-- Together that is an anonymous write to tournament data over the public
-- PostgREST API. This was not theoretical; it was executed against
-- production as the `anon` role and it SUCCEEDED:
--
--     SET LOCAL ROLE anon;
--     UPDATE public.trivia_tournaments_public
--        SET prize_pool = prize_pool WHERE id = <a real tournament>;
--     -- no error
--
-- Writable columns included prize_pool, winners, status, entry_fee,
-- max_players and round_deadline. No login required.
--
-- WHAT THIS DOES
--   Revokes INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER from anon
--      and authenticated on every non-extension view in `public`. SELECT is
--      untouched — these are read surfaces and the app only ever reads them
--      (verified: zero .insert/.update/.upsert/.delete calls against any of
--      these view names across pages/ and src/).
--
--   The other 23 views already carry security_invoker = true, so their base
--   table RLS was still being enforced and they were not exploitable the
--   same way. Revoking write privileges they never needed is defence in
--   depth: it means a future view losing its invoker flag, or a base table
--   gaining a permissive policy, cannot quietly become the same bug.
--
--   geography_columns and geometry_columns are skipped — they belong to the
--   PostGIS extension and are catalog views, not application surfaces.
-- =======================================================================

-- --- 1. PRE-FLIGHT -----------------------------------------------------
DO $preflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'trivia_tournaments_public' AND c.relkind = 'v'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: view trivia_tournaments_public not found';
    END IF;
END
$preflight$;

-- --- 2. THE EXPLOITABLE VIEW ------------------------------------------
-- NOTE: this migration originally also ran
--     ALTER VIEW public.trivia_tournaments_public SET (security_invoker = true);
-- and 20260808201500 immediately reverted it. Under invoker semantics the
-- READER needs privileges on the base table, and anon deliberately has none
-- (has_table_privilege('anon','trivia_tournaments','SELECT') is false, because
-- that table carries correct_index and explanation). Setting the flag broke
-- the public tournament listing for every logged-out visitor.
--
-- Definer semantics are the POINT of this view: a sanitised projection that
-- lets anonymous readers see tournament data they must not read directly.
-- The vulnerability was never the definer property — it was that a definer
-- view ALSO carried write grants. Step 3 is the actual fix.

-- --- 3. REVOKE WRITES ON EVERY APPLICATION VIEW IN public -------------
DO $revoke$
DECLARE
    v_view text;
BEGIN
    FOR v_view IN
        SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'v'
           -- PostGIS catalog views: extension-owned, not ours to alter.
           AND c.relname NOT IN ('geography_columns', 'geometry_columns')
           -- Only touch views that actually carry a write grant today.
           AND EXISTS (
               SELECT 1 FROM information_schema.role_table_grants g
                WHERE g.table_schema = 'public'
                  AND g.table_name = c.relname
                  AND g.grantee IN ('anon', 'authenticated')
                  AND g.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
           )
    LOOP
        EXECUTE format(
            'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated',
            v_view
        );
        RAISE NOTICE 'revoked writes on public.%', v_view;
    END LOOP;
END
$revoke$;

-- --- 4. POST-APPLY ASSERTIONS -----------------------------------------
DO $postcheck$
DECLARE
    v_left integer;
    v_msg  text;
    v_id   uuid;
BEGIN
    -- 4a. No application view still grants writes to anon/authenticated.
    SELECT COUNT(*) INTO v_left
      FROM information_schema.role_table_grants g
      JOIN pg_class c ON c.relname = g.table_name
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE g.table_schema = 'public'
       AND c.relkind = 'v'
       AND g.grantee IN ('anon', 'authenticated')
       AND g.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
       AND g.table_name NOT IN ('geography_columns', 'geometry_columns');
    IF v_left > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % view write grants remain', v_left;
    END IF;

    -- 4b. SELECT must survive — these views are live read surfaces.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public'
           AND table_name = 'trivia_tournaments_public'
           AND grantee = 'anon'
           AND privilege_type = 'SELECT'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: anon lost SELECT on trivia_tournaments_public';
    END IF;

END
$postcheck$;

-- =======================================================================
-- ROLLBACK (restores the write grants and definer semantics — re-opens the
-- anonymous write path; only for emergency feature restoration)
-- =======================================================================
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--    ON public.trivia_tournaments_public TO anon, authenticated;
