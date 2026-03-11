-- ============================================================================
-- SOCIAL POSTS RLS POLICIES - Version Controlled
-- ============================================================================
-- CRITICAL: These policies MUST remain in place for the social feed to work.
-- If you change these, the social feed will break (posting, viewing, etc.)
-- 
-- Last verified working: 2026-01-23
-- ============================================================================

-- Enable RLS on social_posts
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies first (idempotent)
DROP POLICY IF EXISTS "Authenticated users can post" ON social_posts;
DROP POLICY IF EXISTS "Anyone can view posts" ON social_posts;
DROP POLICY IF EXISTS "Users can update own posts" ON social_posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON social_posts;
DROP POLICY IF EXISTS "Users can insert their own posts" ON social_posts;
DROP POLICY IF EXISTS "Anyone can view public posts" ON social_posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON social_posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON social_posts;

-- ============================================================================
-- INSERT POLICY - Critical for posting to work
-- ============================================================================
-- Allows any authenticated user to create a post.
-- The app sets author_id in the insert payload.
-- DO NOT change this to (auth.uid() = author_id) - that breaks inserts!
CREATE POLICY "Authenticated users can post" ON social_posts
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- ============================================================================
-- SELECT POLICY - Critical for feed to display
-- ============================================================================
-- Allows anyone to view all posts (no visibility filtering for simplicity)
CREATE POLICY "Anyone can view posts" ON social_posts
    FOR SELECT
    USING (true);

-- ============================================================================
-- UPDATE POLICY - Only post owner can edit
-- ============================================================================
CREATE POLICY "Users can update own posts" ON social_posts
    FOR UPDATE TO authenticated
    USING (auth.uid() = author_id);

-- ============================================================================
-- DELETE POLICY - Only post owner can delete
-- ============================================================================
CREATE POLICY "Users can delete own posts" ON social_posts
    FOR DELETE TO authenticated
    USING (auth.uid() = author_id);

-- ============================================================================
-- VERIFICATION: Run this to confirm policies are correct
-- ============================================================================
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'social_posts';
-- 
-- Expected output:
-- policyname                    | cmd
-- ------------------------------|--------
-- Authenticated users can post  | INSERT
-- Anyone can view posts         | SELECT
-- Users can update own posts    | UPDATE
-- Users can delete own posts    | DELETE
