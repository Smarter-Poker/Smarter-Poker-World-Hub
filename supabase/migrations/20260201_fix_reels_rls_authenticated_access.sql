-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Reels RLS Policy - Allow BOTH authenticated AND anonymous users
-- ═══════════════════════════════════════════════════════════════════════════
-- ISSUE: The 20260124 migration replaced the original "Anyone can view public reels"
-- policy (which had no role restriction) with one that ONLY applies to authenticated
-- users. This inadvertently blocked authenticated users while allowing anon users.
-- 
-- ROOT CAUSE: The new policy used "TO authenticated" instead of applying to all roles.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the broken policy
DROP POLICY IF EXISTS "Reels are publicly viewable" ON public.social_reels;

-- Create the correct policy that applies to BOTH authenticated AND anonymous users
CREATE POLICY "Reels are publicly viewable" ON public.social_reels
    FOR SELECT
    USING (is_public = true OR author_id = auth.uid());

-- Also fix social_posts to ensure video content is accessible
DROP POLICY IF EXISTS "Public posts are viewable by anyone" ON public.social_posts;

CREATE POLICY "Public posts are viewable by anyone" ON public.social_posts
    FOR SELECT
    USING (visibility = 'public' OR visibility IS NULL OR author_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION: This policy now allows:
-- 1. Anonymous users to view public reels (is_public = true)
-- 2. Authenticated users to view public reels (is_public = true)
-- 3. Authenticated users to view their own private reels (author_id = auth.uid())
-- ═══════════════════════════════════════════════════════════════════════════
