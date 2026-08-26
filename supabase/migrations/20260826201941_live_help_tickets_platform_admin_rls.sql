-- ═══════════════════════════════════════════════════════════════════════
-- 20260826143000_live_help_tickets_platform_admin_rls.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      Claude (horses admin round two)
-- AFFECTS:     rls: public.live_help_tickets (live_help_tickets_select,
--                   live_help_tickets_update)
--              grants: EXECUTE on public.fn_is_platform_admin() to authenticated
-- IRREVERSIBLE: no                            (ROLLBACK section is filled in below)
--
-- WHY:
--   The Bug Reports tab in /horses renders empty for two of the three real
--   admin accounts, and its status updates silently no-op for them. The cause
--   is the RLS on public.live_help_tickets. Both the SELECT and the UPDATE
--   policy currently read:
--
--       auth.uid() = user_id
--       OR auth.jwt()->>'email' = ANY(ARRAY['admin@smarter.poker','support@smarter.poker'])
--       OR EXISTS (SELECT 1 FROM profiles
--                  WHERE id = auth.uid()
--                    AND role = ANY(ARRAY['admin','super_agent','owner']))
--
--   Two things are wrong with that, both verified against production on
--   2026-08-26:
--
--   1. The role list is missing 'superadmin' and 'god'. The three accounts
--      that actually administer this platform are
--        daniel@smarter.poker        role 'god'
--        daniel@bekavactrading.com   role 'god'
--        danimal5022@yahoo.com       role 'admin'
--      so only the third one has ever been able to see or update a ticket.
--      Nobody at all holds 'super_agent' or 'owner' -- a GROUP BY over
--      public.profiles returns exactly: user 1003, player 10, venue_owner 6,
--      god 2, admin 1.
--
--   2. The hardcoded email allowlist is not merely dead, it is a privilege
--      leak. admin@smarter.poker does not exist in profiles at all.
--      support@smarter.poker DOES exist and its role is 'user' -- an ordinary
--      account that the policy grants read and write over every support
--      ticket on the platform. An allowlist keyed on a JWT claim also drifts
--      the moment an address is reassigned, which is precisely why the repo
--      has a role function for this.
--
--   The canonical helper is public.fn_is_platform_admin(): SECURITY DEFINER,
--   STABLE, zero arguments, returns true when the CALLER's profiles.role is
--   one of admin / superadmin / god. 44 other policies across 44 tables
--   already call it, so this migration adopts the house pattern rather than
--   inventing a second role list that will drift again.
--
--   SECOND, LARGER FINDING -- read this before applying:
--   `authenticated` currently has NO EXECUTE privilege on
--   fn_is_platform_admin(). Its ACL is {postgres=X/postgres,service_role=X/postgres}.
--   Verified directly:
--       BEGIN; SET LOCAL ROLE authenticated;
--       SELECT public.fn_is_platform_admin();
--       -- ERROR: 42501: permission denied for function fn_is_platform_admin
--   That means all 44 of those existing policies raise 42501 for a logged-in
--   user whenever the planner actually evaluates the function rather than
--   short-circuiting the preceding `auth.uid() = user_id` term. The affected
--   tables include user-facing ones (user_notifications, direct_messages,
--   friend_requests, user_bookmarks, purchase_history). So this migration
--   MUST grant that EXECUTE, otherwise it would replace one broken policy
--   with another -- and the grant simultaneously repairs the other 44.
--   That grant is a wider blast radius than the two policies below, which is
--   why it is called out here rather than buried: it hands `authenticated`
--   the ability to ask one question, "am I myself a platform admin", about
--   nobody but the caller. It exposes no rows and no other user's data.
--
-- HOW (high level):
--   - Assert the table, the function and both policies are as described, and
--     abort if any profile has turned up holding 'super_agent' or 'owner'
--     (those two roles are being dropped from the grant list; if somebody now
--     holds one, a human has to decide before this runs).
--   - GRANT EXECUTE ON FUNCTION public.fn_is_platform_admin() TO authenticated.
--   - Replace live_help_tickets_select and live_help_tickets_update with
--     "own row OR fn_is_platform_admin()". The email allowlist is deleted.
--   - Assert afterwards that both policies reference the function, that
--     neither still mentions the allowlist or the stale roles, that
--     authenticated can execute the function, and that RLS is still enabled.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    v_stale_role_holders integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'live_help_tickets'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.live_help_tickets not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'live_help_tickets'
          AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: RLS is not enabled on public.live_help_tickets';
    END IF;

    -- The helper must exist with exactly the signature the policies below
    -- assume: no arguments, returns boolean. If a second overload has appeared
    -- the policy reference would be ambiguous, so insist on exactly one.
    IF (
        SELECT count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_is_platform_admin'
          AND p.pronargs = 0
          AND pg_get_function_result(p.oid) = 'boolean'
    ) <> 1 THEN
        RAISE EXCEPTION 'pre-flight failed: expected exactly one public.fn_is_platform_admin() returning boolean';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.live_help_tickets'::regclass
          AND polname = 'live_help_tickets_select'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: policy live_help_tickets_select not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.live_help_tickets'::regclass
          AND polname = 'live_help_tickets_update'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: policy live_help_tickets_update not found';
    END IF;

    -- 'super_agent' and 'owner' are being dropped from the admin grant.
    -- On 2026-08-26 no profile held either. If that has changed, someone
    -- would silently lose access, so stop and make it a human decision.
    SELECT count(*) INTO v_stale_role_holders
    FROM public.profiles
    WHERE role IN ('super_agent', 'owner');

    IF v_stale_role_holders > 0 THEN
        RAISE EXCEPTION
            'pre-flight failed: % profile(s) hold role super_agent or owner. This migration drops those roles from the live_help_tickets admin grant. Decide explicitly (promote them, or add the roles to fn_is_platform_admin) before applying.',
            v_stale_role_holders;
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

-- 2a. Without this, every policy that calls fn_is_platform_admin() raises
--     42501 for a logged-in user. See the SECOND FINDING in the header.
GRANT EXECUTE ON FUNCTION public.fn_is_platform_admin() TO authenticated;

-- 2b. SELECT: own ticket, or platform admin.
DROP POLICY IF EXISTS live_help_tickets_select ON public.live_help_tickets;
CREATE POLICY live_help_tickets_select
    ON public.live_help_tickets
    FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        OR public.fn_is_platform_admin()
    );

-- 2c. UPDATE: same test. The old policy left WITH CHECK null, which makes
--     Postgres reuse USING for the check; it is written out explicitly here
--     so the intent is on the page rather than in a Postgres default.
DROP POLICY IF EXISTS live_help_tickets_update ON public.live_help_tickets;
CREATE POLICY live_help_tickets_update
    ON public.live_help_tickets
    FOR UPDATE
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        OR public.fn_is_platform_admin()
    )
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        OR public.fn_is_platform_admin()
    );

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    v_qual text;
    v_check text;
BEGIN
    IF NOT has_function_privilege('authenticated', 'public.fn_is_platform_admin()', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply assertion failed: authenticated still cannot EXECUTE public.fn_is_platform_admin()';
    END IF;

    -- SELECT policy
    SELECT pg_get_expr(polqual, polrelid) INTO v_qual
    FROM pg_policy
    WHERE polrelid = 'public.live_help_tickets'::regclass
      AND polname = 'live_help_tickets_select';

    IF v_qual IS NULL THEN
        RAISE EXCEPTION 'post-apply assertion failed: live_help_tickets_select is missing';
    END IF;
    IF v_qual NOT LIKE '%fn_is_platform_admin%' THEN
        RAISE EXCEPTION 'post-apply assertion failed: live_help_tickets_select does not call fn_is_platform_admin(): %', v_qual;
    END IF;
    IF v_qual LIKE '%smarter.poker%' OR v_qual LIKE '%super_agent%' THEN
        RAISE EXCEPTION 'post-apply assertion failed: live_help_tickets_select still carries the email allowlist or stale roles: %', v_qual;
    END IF;

    -- UPDATE policy, both halves
    SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
      INTO v_qual, v_check
    FROM pg_policy
    WHERE polrelid = 'public.live_help_tickets'::regclass
      AND polname = 'live_help_tickets_update';

    IF v_qual IS NULL OR v_check IS NULL THEN
        RAISE EXCEPTION 'post-apply assertion failed: live_help_tickets_update is missing its USING or WITH CHECK expression';
    END IF;
    IF v_qual NOT LIKE '%fn_is_platform_admin%' OR v_check NOT LIKE '%fn_is_platform_admin%' THEN
        RAISE EXCEPTION 'post-apply assertion failed: live_help_tickets_update does not call fn_is_platform_admin() on both halves: using=% check=%', v_qual, v_check;
    END IF;
    IF v_qual LIKE '%smarter.poker%' OR v_check LIKE '%smarter.poker%'
       OR v_qual LIKE '%super_agent%' OR v_check LIKE '%super_agent%' THEN
        RAISE EXCEPTION 'post-apply assertion failed: live_help_tickets_update still carries the email allowlist or stale roles: using=% check=%', v_qual, v_check;
    END IF;

    -- The ticket-creation policy is untouched and must survive.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'public.live_help_tickets'::regclass
          AND polname = 'Users can create own tickets'
    ) THEN
        RAISE EXCEPTION 'post-apply assertion failed: the INSERT policy "Users can create own tickets" disappeared';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'live_help_tickets' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'post-apply assertion failed: RLS is no longer enabled on public.live_help_tickets';
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 3 — paste into a NEW _revert_live_help_tickets_platform_admin_rls.sql
-- migration and apply normally. Never edit this file after it has been applied.)
--
-- NOTE: reverting restores a policy that (a) locks out both 'god' accounts and
-- (b) grants full ticket read/write to support@smarter.poker, an account whose
-- profiles.role is 'user'. Only revert if this migration caused a concrete,
-- worse problem.
--
-- The GRANT is deliberately NOT revoked here. Revoking it would re-break the
-- 44 unrelated policies that call fn_is_platform_admin(); if you truly need it
-- gone, do that in its own migration with its own justification.
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
--
-- DROP POLICY IF EXISTS live_help_tickets_select ON public.live_help_tickets;
-- CREATE POLICY live_help_tickets_select
--     ON public.live_help_tickets
--     FOR SELECT
--     TO authenticated
--     USING (
--         (SELECT auth.uid()) = user_id
--         OR ((SELECT auth.jwt()) ->> 'email') = ANY (ARRAY['admin@smarter.poker', 'support@smarter.poker'])
--         OR EXISTS (
--             SELECT 1 FROM public.profiles
--             WHERE profiles.id = (SELECT auth.uid())
--               AND profiles.role = ANY (ARRAY['admin', 'super_agent', 'owner'])
--         )
--     );
--
-- DROP POLICY IF EXISTS live_help_tickets_update ON public.live_help_tickets;
-- CREATE POLICY live_help_tickets_update
--     ON public.live_help_tickets
--     FOR UPDATE
--     TO authenticated
--     USING (
--         (SELECT auth.uid()) = user_id
--         OR ((SELECT auth.jwt()) ->> 'email') = ANY (ARRAY['admin@smarter.poker', 'support@smarter.poker'])
--         OR EXISTS (
--             SELECT 1 FROM public.profiles
--             WHERE profiles.id = (SELECT auth.uid())
--               AND profiles.role = ANY (ARRAY['admin', 'super_agent', 'owner'])
--         )
--     );
--
-- COMMIT;
