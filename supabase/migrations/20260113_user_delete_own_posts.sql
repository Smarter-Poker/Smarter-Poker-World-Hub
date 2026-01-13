-- ═══════════════════════════════════════════════════════════════════════════
-- RLS Policy: Allow users to delete their own posts
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing delete policy if it exists
DROP POLICY IF EXISTS "Users can delete their own posts" ON social_posts;

-- Create policy allowing users to delete their own posts
CREATE POLICY "Users can delete their own posts"
    ON social_posts
    FOR DELETE
    USING (author_id = auth.uid());

-- Also ensure users can update their own posts
DROP POLICY IF EXISTS "Users can update their own posts" ON social_posts;
CREATE POLICY "Users can update their own posts"
    ON social_posts
    FOR UPDATE
    USING (author_id = auth.uid());

-- Verify policies exist
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'social_posts';
