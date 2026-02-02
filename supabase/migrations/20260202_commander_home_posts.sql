-- ═══════════════════════════════════════════════════════════════════════════
-- Commander Home Game Posts table
-- Required by: /api/commander/home-games/[id]/posts.js
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS commander_home_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES commander_home_groups(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'announcement' CHECK (post_type IN ('announcement', 'discussion', 'game_recap', 'poll')),
  image_urls TEXT[] DEFAULT '{}',
  video_url TEXT,
  is_pinned BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  visible_to TEXT NOT NULL DEFAULT 'members' CHECK (visible_to IN ('members', 'public')),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_posts_group ON commander_home_posts(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_home_posts_author ON commander_home_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_home_posts_pinned ON commander_home_posts(group_id, is_pinned DESC, created_at DESC);

ALTER TABLE commander_home_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY home_posts_select ON commander_home_posts FOR SELECT USING (true);
CREATE POLICY home_posts_insert ON commander_home_posts FOR INSERT WITH CHECK (true);
CREATE POLICY home_posts_update ON commander_home_posts FOR UPDATE USING (true);
CREATE POLICY home_posts_delete ON commander_home_posts FOR DELETE USING (true);
