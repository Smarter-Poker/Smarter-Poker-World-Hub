-- ═══════════════════════════════════════════════════════════════════════════
-- Social Media Pages System
-- Full-featured pages for users, venues, and groups with feeds, followers,
-- and content management
-- ═══════════════════════════════════════════════════════════════════════════

-- Social Pages table - unified pages for venues, groups, and custom pages
CREATE TABLE IF NOT EXISTS social_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    page_type TEXT NOT NULL CHECK (page_type IN ('venue', 'group', 'brand', 'community')),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    description TEXT,
    avatar_url TEXT,
    cover_url TEXT,
    category TEXT DEFAULT 'general',
    website TEXT,
    contact_email TEXT,
    phone TEXT,
    location_city TEXT,
    location_state TEXT,
    location_country TEXT DEFAULT 'US',
    -- Linked entity (venue_id if page_type = 'venue')
    linked_venue_id TEXT,
    linked_entity_type TEXT,
    linked_entity_id TEXT,
    -- Counts (denormalized for perf)
    follower_count INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0,
    member_count INTEGER DEFAULT 0,
    -- Settings
    is_verified BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT true,
    allow_member_posts BOOLEAN DEFAULT true,
    require_post_approval BOOLEAN DEFAULT false,
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page followers
CREATE TABLE IF NOT EXISTS social_page_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES social_pages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'follower' CHECK (role IN ('follower', 'member', 'moderator', 'admin', 'owner')),
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(page_id, user_id)
);

-- Page posts - content posted on pages
CREATE TABLE IF NOT EXISTS social_page_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES social_pages(id) ON DELETE CASCADE,
    author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT,
    content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'link', 'event', 'announcement', 'poll')),
    media_urls JSONB DEFAULT '[]',
    link_preview JSONB,
    -- Engagement counts
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    -- Moderation
    is_pinned BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT true,
    visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'members', 'admins')),
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page post likes
CREATE TABLE IF NOT EXISTS social_page_post_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES social_page_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

-- Page post comments
CREATE TABLE IF NOT EXISTS social_page_post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES social_page_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_id UUID REFERENCES social_page_post_comments(id) ON DELETE CASCADE,
    like_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page invitations
CREATE TABLE IF NOT EXISTS social_page_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES social_pages(id) ON DELETE CASCADE,
    inviter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    invitee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(page_id, invitee_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_social_pages_owner ON social_pages(owner_id);
CREATE INDEX IF NOT EXISTS idx_social_pages_type ON social_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_social_pages_slug ON social_pages(slug);
CREATE INDEX IF NOT EXISTS idx_social_pages_venue ON social_pages(linked_venue_id);
CREATE INDEX IF NOT EXISTS idx_social_page_followers_page ON social_page_followers(page_id);
CREATE INDEX IF NOT EXISTS idx_social_page_followers_user ON social_page_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_social_page_posts_page ON social_page_posts(page_id);
CREATE INDEX IF NOT EXISTS idx_social_page_posts_author ON social_page_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_social_page_posts_created ON social_page_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_page_post_likes_post ON social_page_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_social_page_post_comments_post ON social_page_post_comments(post_id);

-- Trigger: auto-update follower_count
CREATE OR REPLACE FUNCTION update_page_follower_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE social_pages SET follower_count = follower_count + 1, updated_at = NOW() WHERE id = NEW.page_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE social_pages SET follower_count = GREATEST(0, follower_count - 1), updated_at = NOW() WHERE id = OLD.page_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_page_follower_count ON social_page_followers;
CREATE TRIGGER trg_page_follower_count
    AFTER INSERT OR DELETE ON social_page_followers
    FOR EACH ROW EXECUTE FUNCTION update_page_follower_count();

-- Trigger: auto-update post_count
CREATE OR REPLACE FUNCTION update_page_post_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE social_pages SET post_count = post_count + 1, updated_at = NOW() WHERE id = NEW.page_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE social_pages SET post_count = GREATEST(0, post_count - 1), updated_at = NOW() WHERE id = OLD.page_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_page_post_count ON social_page_posts;
CREATE TRIGGER trg_page_post_count
    AFTER INSERT OR DELETE ON social_page_posts
    FOR EACH ROW EXECUTE FUNCTION update_page_post_count();

-- Trigger: auto-update like_count on page posts
CREATE OR REPLACE FUNCTION update_page_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE social_page_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE social_page_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_page_post_like_count ON social_page_post_likes;
CREATE TRIGGER trg_page_post_like_count
    AFTER INSERT OR DELETE ON social_page_post_likes
    FOR EACH ROW EXECUTE FUNCTION update_page_post_like_count();

-- Trigger: auto-update comment_count on page posts
CREATE OR REPLACE FUNCTION update_page_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE social_page_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE social_page_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_page_post_comment_count ON social_page_post_comments;
CREATE TRIGGER trg_page_post_comment_count
    AFTER INSERT OR DELETE ON social_page_post_comments
    FOR EACH ROW EXECUTE FUNCTION update_page_post_comment_count();

-- RLS Policies
ALTER TABLE social_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_page_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_page_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_page_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_page_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_page_invitations ENABLE ROW LEVEL SECURITY;

-- Public pages visible to all authenticated users
CREATE POLICY "Public pages are viewable" ON social_pages FOR SELECT USING (is_public = true);
CREATE POLICY "Owners can manage pages" ON social_pages FOR ALL USING (auth.uid() = owner_id);

-- Followers visible to all
CREATE POLICY "Followers are viewable" ON social_page_followers FOR SELECT USING (true);
CREATE POLICY "Users manage own follows" ON social_page_followers FOR ALL USING (auth.uid() = user_id);

-- Posts on public pages visible to all
CREATE POLICY "Public page posts viewable" ON social_page_posts FOR SELECT USING (
    visibility = 'public' OR author_id = auth.uid()
);
CREATE POLICY "Authors manage own posts" ON social_page_posts FOR ALL USING (auth.uid() = author_id);

-- Likes and comments
CREATE POLICY "Likes viewable" ON social_page_post_likes FOR SELECT USING (true);
CREATE POLICY "Users manage own likes" ON social_page_post_likes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Comments viewable" ON social_page_post_comments FOR SELECT USING (true);
CREATE POLICY "Users manage own comments" ON social_page_post_comments FOR ALL USING (auth.uid() = user_id);

-- Invitations
CREATE POLICY "Invitations viewable by parties" ON social_page_invitations FOR SELECT
    USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);
CREATE POLICY "Users manage own invitations" ON social_page_invitations FOR ALL
    USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);
