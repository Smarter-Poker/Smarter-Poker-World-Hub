-- ============================================================
-- social_likes RLS cleanup — remove duplicate policies
-- Created: 2026-04-22
-- Applied: via psql
-- ============================================================
--
-- PROBLEM: social_likes had 3x SELECT and 2x DELETE policies,
--   causing redundant policy evaluation overhead and potential
--   confusion during future policy audits.
--
-- Before: 7 policies
-- After:  4 clean policies (SELECT, INSERT, DELETE, ALL for service role)
--
-- ============================================================

-- Remove nested-SELECT DELETE (keep direct pattern)
DROP POLICY IF EXISTS "Users can delete own likes" ON public.social_likes;

-- Remove redundant SELECT aliases
DROP POLICY IF EXISTS "Likes are readable" ON public.social_likes;
DROP POLICY IF EXISTS "Users can view all likes" ON public.social_likes;

-- Final state: 4 clean policies
-- 1. Public read access         (SELECT, USING true)
-- 2. Service role full access   (ALL)
-- 3. Users can insert their own likes (INSERT, WITH CHECK user_id = auth.uid())
-- 4. Users can delete their own likes (DELETE, USING user_id = auth.uid())
