-- ═══════════════════════════════════════════════════════════════════════════
-- GOD MODE - Admin Privileges for KingFish
-- ═══════════════════════════════════════════════════════════════════════════

-- Add role column if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Set KingFish as god
UPDATE profiles SET role = 'god' WHERE id = '47965354-0e56-43ef-931c-ddaab82af765';

-- Create function to check if user is god
CREATE OR REPLACE FUNCTION is_god_mode() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'god'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES - God Mode Overrides
-- ═══════════════════════════════════════════════════════════════════════════

-- SOCIAL POSTS: God can delete any post
DROP POLICY IF EXISTS "god_delete_any_post" ON social_posts;
CREATE POLICY "god_delete_any_post" ON social_posts FOR DELETE TO authenticated
USING (author_id = auth.uid() OR is_god_mode());

-- SOCIAL POSTS: God can update/edit any post
DROP POLICY IF EXISTS "god_update_any_post" ON social_posts;
CREATE POLICY "god_update_any_post" ON social_posts FOR UPDATE TO authenticated
USING (author_id = auth.uid() OR is_god_mode());

-- SOCIAL STORIES: God can delete any story
DROP POLICY IF EXISTS "god_delete_any_story" ON social_stories;
CREATE POLICY "god_delete_any_story" ON social_stories FOR DELETE TO authenticated
USING (author_id = auth.uid() OR is_god_mode());

-- SOCIAL REELS: God can delete any reel
DROP POLICY IF EXISTS "god_delete_any_reel" ON social_reels;
CREATE POLICY "god_delete_any_reel" ON social_reels FOR DELETE TO authenticated
USING (author_id = auth.uid() OR is_god_mode());

-- PROFILES: God can update any profile
DROP POLICY IF EXISTS "god_update_any_profile" ON profiles;
CREATE POLICY "god_update_any_profile" ON profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR is_god_mode());
