-- Enable UPDATE for own posts: allows users to edit their own post content
-- Required for the Post Edit feature (pencil icon on own posts)
-- The RPC functions (increment_post_count/decrement_post_count) use service role,
-- so they bypass RLS and are not affected by this policy.

DROP POLICY IF EXISTS "Users can update own posts" ON social_posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON social_posts;

CREATE POLICY "Users can update own posts" ON social_posts
    FOR UPDATE TO authenticated
    USING (auth.uid() = author_id)
    WITH CHECK (auth.uid() = author_id);
