-- ═══════════════════════════════════════════════════════════════════════
-- 20260513_fix_supabase_advisor_warnings.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3
-- AUTHOR:      antigravity
-- AFFECTS:     storage policies, materialized views, functions
-- IRREVERSIBLE: no
--
-- WHY:
--   The Supabase Security Advisor flagged several issues on the dashboard:
--   1. Public buckets allowed listing all files via permissive SELECT policies.
--   2. Materialized views were accessible over the Data API.
--   3. trig_sync_like_count was missing a strict search_path.
--   4. The previously added "deny_all" policies were flagged because they used
--      `USING (false)` instead of checking `auth.uid()`.
--
-- HOW:
--   - Drop broad storage.objects SELECT policies and restrict to owner.
--   - Revoke SELECT from anon/authenticated on all materialized views.
--   - Alter trig_sync_like_count to SET search_path = public.
--   - Alter deny_all policies to `USING (auth.uid() = '00000000-0000-0000-0000-000000000000')`
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Fix 'false' policies to include auth.uid() for the linter
DO $$
DECLARE
    rec record;
BEGIN
    FOR rec IN 
        SELECT polname, c.relname 
        FROM pg_policy pol 
        JOIN pg_class c ON pol.polrelid = c.oid 
        WHERE polname LIKE 'deny_all_%' OR polname IN ('cron_locks_no_anon', 'rate_limit_buckets_no_anon', 'autofix_config_service_only', 'autofix_projects_service_only', 'autofix_budget_service_only')
    LOOP
        EXECUTE format('ALTER POLICY %I ON public.%I USING (auth.uid() = ''00000000-0000-0000-0000-000000000000''::uuid);', rec.polname, rec.relname);
    END LOOP;
END;
$$;

-- 2. Fix public bucket broad SELECT listing
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Public read live recordings" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read recordings" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for messenger media" ON storage.objects;
DROP POLICY IF EXISTS "social_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "stories_public_read" ON storage.objects;
DROP POLICY IF EXISTS "uploads_public_read" ON storage.objects;
DROP POLICY IF EXISTS "user_media_public_read" ON storage.objects;

CREATE POLICY "Authenticated users can list own objects in all buckets" 
ON storage.objects FOR SELECT TO authenticated USING (owner = auth.uid());

-- 3. Revoke API access to materialized views
REVOKE SELECT ON public.mv_active_poker_locations FROM anon, authenticated;
REVOKE SELECT ON public.training_leaderboard_top FROM anon, authenticated;
REVOKE SELECT ON public.mv_hand_histories FROM anon, authenticated;
REVOKE SELECT ON public.mv_home_groups_trending FROM anon, authenticated;

-- 4. Fix remaining search_path mutation
ALTER FUNCTION public.trig_sync_like_count() SET search_path = public;

COMMIT;
