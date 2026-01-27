-- =====================================================
-- SMARTER CAPTAIN - SOCIAL PAGES MIGRATION
-- =====================================================
-- Tables for Club/Home Game public pages (Facebook Page-like features)
-- Posts, Photos, Reviews, Followers
-- =====================================================

-- ===================
-- TABLE 1: captain_venue_posts
-- ===================
-- Announcements/posts for venue pages

CREATE TABLE IF NOT EXISTS captain_venue_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Author (staff member)
  author_id UUID REFERENCES profiles(id),
  author_name TEXT,

  -- Content
  content TEXT NOT NULL,
  post_type TEXT DEFAULT 'announcement' CHECK (post_type IN ('announcement', 'promotion', 'event', 'update', 'photo')),

  -- Media
  image_urls TEXT[],
  video_url TEXT,

  -- Engagement
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,

  -- Visibility
  is_pinned BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_posts_venue ON captain_venue_posts(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_posts_pinned ON captain_venue_posts(venue_id, is_pinned);

-- ===================
-- TABLE 2: captain_home_posts
-- ===================
-- Announcements/posts for home game group pages

CREATE TABLE IF NOT EXISTS captain_home_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES captain_home_groups(id) ON DELETE CASCADE,

  -- Author
  author_id UUID REFERENCES profiles(id),

  -- Content
  content TEXT NOT NULL,
  post_type TEXT DEFAULT 'announcement' CHECK (post_type IN ('announcement', 'game_recap', 'photo', 'update')),

  -- Media
  image_urls TEXT[],
  video_url TEXT,

  -- Engagement
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,

  -- Visibility (private groups: members only)
  is_pinned BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  visible_to TEXT DEFAULT 'members' CHECK (visible_to IN ('public', 'members')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_posts_group ON captain_home_posts(group_id, created_at DESC);

-- ===================
-- TABLE 3: captain_venue_photos
-- ===================
-- Photo gallery for venues

CREATE TABLE IF NOT EXISTS captain_venue_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Uploader
  uploaded_by UUID REFERENCES profiles(id),

  -- Photo details
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'poker_room', 'tournament', 'winner', 'event', 'high_hand')),

  -- Display
  is_cover_photo BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,

  -- Engagement
  likes_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_photos_venue ON captain_venue_photos(venue_id, display_order);

-- ===================
-- TABLE 4: captain_venue_reviews
-- ===================
-- Player reviews for venues

CREATE TABLE IF NOT EXISTS captain_venue_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id),

  -- Rating
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  game_selection_rating INTEGER CHECK (game_selection_rating BETWEEN 1 AND 5),
  staff_rating INTEGER CHECK (staff_rating BETWEEN 1 AND 5),
  atmosphere_rating INTEGER CHECK (atmosphere_rating BETWEEN 1 AND 5),
  food_rating INTEGER CHECK (food_rating BETWEEN 1 AND 5),

  -- Review content
  title TEXT,
  content TEXT,

  -- Metadata
  visit_date DATE,
  games_played TEXT[], -- ['NLH 1/3', 'PLO 2/5']

  -- Response
  venue_response TEXT,
  venue_responded_at TIMESTAMPTZ,

  -- Moderation
  is_verified BOOLEAN DEFAULT false, -- Verified visit through check-in
  is_published BOOLEAN DEFAULT true,

  -- Engagement
  helpful_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue ON captain_venue_reviews(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_rating ON captain_venue_reviews(venue_id, overall_rating);

-- ===================
-- TABLE 5: captain_venue_followers
-- ===================
-- Users following venues for updates

CREATE TABLE IF NOT EXISTS captain_venue_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Notification preferences
  notify_posts BOOLEAN DEFAULT true,
  notify_events BOOLEAN DEFAULT true,
  notify_promotions BOOLEAN DEFAULT true,
  notify_tournaments BOOLEAN DEFAULT true,

  -- Timestamps
  followed_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_followers_venue ON captain_venue_followers(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_followers_user ON captain_venue_followers(user_id);

-- ===================
-- TABLE 6: captain_post_likes
-- ===================
-- Likes on venue/home posts

CREATE TABLE IF NOT EXISTS captain_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  post_type TEXT NOT NULL CHECK (post_type IN ('venue', 'home')),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post ON captain_post_likes(post_id);

-- ===================
-- TABLE 7: captain_post_comments
-- ===================
-- Comments on posts

CREATE TABLE IF NOT EXISTS captain_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  post_type TEXT NOT NULL CHECK (post_type IN ('venue', 'home')),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Content
  content TEXT NOT NULL,

  -- Reply threading
  parent_comment_id UUID REFERENCES captain_post_comments(id) ON DELETE CASCADE,

  -- Engagement
  likes_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON captain_post_comments(post_id, created_at);

-- ===================
-- ENABLE RLS
-- ===================

ALTER TABLE captain_venue_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_home_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_venue_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_venue_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_venue_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_post_comments ENABLE ROW LEVEL SECURITY;

-- Public read policies for venue content
CREATE POLICY "Public read venue posts" ON captain_venue_posts
  FOR SELECT USING (is_published = true);

CREATE POLICY "Public read venue photos" ON captain_venue_photos
  FOR SELECT USING (true);

CREATE POLICY "Public read venue reviews" ON captain_venue_reviews
  FOR SELECT USING (is_published = true);

CREATE POLICY "Public read venue followers count" ON captain_venue_followers
  FOR SELECT USING (true);

CREATE POLICY "Public read comments" ON captain_post_comments
  FOR SELECT USING (true);

-- Home posts visible based on group privacy
CREATE POLICY "Read home posts based on visibility" ON captain_home_posts
  FOR SELECT USING (
    is_published = true AND (
      visible_to = 'public' OR
      EXISTS (
        SELECT 1 FROM captain_home_members
        WHERE group_id = captain_home_posts.group_id
        AND user_id = auth.uid()
        AND status = 'approved'
      )
    )
  );

-- Write policies for authenticated users
CREATE POLICY "Users can like posts" ON captain_post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can comment" ON captain_post_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can review venues" ON captain_venue_reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can follow venues" ON captain_venue_followers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own likes" ON captain_post_likes
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own follows" ON captain_venue_followers
  FOR DELETE USING (auth.uid() = user_id);

-- ===================
-- UPDATE poker_venues with social fields
-- ===================

ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS
  cover_photo_url TEXT,
  profile_photo_url TEXT,
  tagline TEXT,
  about TEXT,
  follower_count INTEGER DEFAULT 0,
  social_links JSONB DEFAULT '{}'; -- { "facebook": "...", "twitter": "...", "instagram": "..." }

-- ===================
-- UPDATE captain_home_groups with social fields
-- ===================

ALTER TABLE captain_home_groups ADD COLUMN IF NOT EXISTS
  cover_photo_url TEXT,
  profile_photo_url TEXT,
  tagline TEXT;

-- ===================
-- FUNCTIONS
-- ===================

-- Update follower count on follow/unfollow
CREATE OR REPLACE FUNCTION update_venue_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE poker_venues SET follower_count = follower_count + 1 WHERE id = NEW.venue_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE poker_venues SET follower_count = follower_count - 1 WHERE id = OLD.venue_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_venue_follower_count
  AFTER INSERT OR DELETE ON captain_venue_followers
  FOR EACH ROW EXECUTE FUNCTION update_venue_follower_count();

-- Update post like counts
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_type = 'venue' THEN
      UPDATE captain_venue_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE captain_home_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_type = 'venue' THEN
      UPDATE captain_venue_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
    ELSE
      UPDATE captain_home_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_post_likes_count
  AFTER INSERT OR DELETE ON captain_post_likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

-- Update post comment counts
CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_comment_id IS NULL THEN
    IF NEW.post_type = 'venue' THEN
      UPDATE captain_venue_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE captain_home_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_comment_id IS NULL THEN
    IF OLD.post_type = 'venue' THEN
      UPDATE captain_venue_posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
    ELSE
      UPDATE captain_home_posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_post_comments_count
  AFTER INSERT OR DELETE ON captain_post_comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comments_count();
