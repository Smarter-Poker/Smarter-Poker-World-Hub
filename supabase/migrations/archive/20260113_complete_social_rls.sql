-- ═══════════════════════════════════════════════════════════════════════════
-- COMPLETE RLS POLICIES FOR SOCIAL_POSTS
-- Run this in Supabase SQL Editor to fix ALL social post operations
-- ═══════════════════════════════════════════════════════════════════════════

-- First, make sure RLS is enabled
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can view all posts" ON social_posts;
DROP POLICY IF EXISTS "Users can view public posts" ON social_posts;
DROP POLICY IF EXISTS "Anyone can view public posts" ON social_posts;
DROP POLICY IF EXISTS "Users can create their own posts" ON social_posts;
DROP POLICY IF EXISTS "Users can insert their own posts" ON social_posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON social_posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON social_posts;
DROP POLICY IF EXISTS "Enable read access for all users" ON social_posts;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON social_posts;

-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT: Anyone can view posts (public access)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Anyone can view public posts"
    ON social_posts
    FOR SELECT
    USING (
        visibility = 'public' 
        OR visibility IS NULL 
        OR author_id = auth.uid()
    );

-- ═══════════════════════════════════════════════════════════════════════════
-- INSERT: Authenticated users can create posts
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Users can create their own posts"
    ON social_posts
    FOR INSERT
    WITH CHECK (author_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE: Users can update their own posts
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Users can update their own posts"
    ON social_posts
    FOR UPDATE
    USING (author_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- DELETE: Users can delete their own posts
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Users can delete their own posts"
    ON social_posts
    FOR DELETE
    USING (author_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- Verify policies exist
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 
    policyname,
    cmd,
    permissive
FROM pg_policies 
WHERE tablename = 'social_posts'
ORDER BY cmd;
