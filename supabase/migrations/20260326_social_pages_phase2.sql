-- Phase 2: Social Pages Enhancement Suite Migrations
-- Safe to re-run (uses IF NOT EXISTS / IF NOT EXISTS)

-- Feature 1: Comment Likes table
CREATE TABLE IF NOT EXISTS social_page_comment_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID REFERENCES social_page_post_comments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(comment_id, user_id)
);

-- Feature 2: Pin support
ALTER TABLE social_page_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- Feature 4: Post type (regular, announcement)
ALTER TABLE social_page_posts ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'regular';

-- Feature 6: Reaction type on existing likes table
ALTER TABLE social_page_post_likes ADD COLUMN IF NOT EXISTS reaction_type TEXT DEFAULT 'like';

-- RLS for comment likes
ALTER TABLE social_page_comment_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comment_likes_select' AND tablename = 'social_page_comment_likes') THEN
        CREATE POLICY comment_likes_select ON social_page_comment_likes FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comment_likes_insert' AND tablename = 'social_page_comment_likes') THEN
        CREATE POLICY comment_likes_insert ON social_page_comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comment_likes_delete' AND tablename = 'social_page_comment_likes') THEN
        CREATE POLICY comment_likes_delete ON social_page_comment_likes FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;
