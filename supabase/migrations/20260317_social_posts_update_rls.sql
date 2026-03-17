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

-- Enable UPDATE for own likes: allows users to change their reaction type
-- Required for the Reaction Picker (change from 'like' to 'love', etc.)
DROP POLICY IF EXISTS "Users can update own likes" ON social_likes;

CREATE POLICY "Users can update own likes" ON social_likes
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
