-- ═══════════════════════════════════════════════════════════════════════════
-- STORIES FEATURE - Facebook-style 24-hour disappearing content
-- ═══════════════════════════════════════════════════════════════════════════

-- Stories table
CREATE TABLE IF NOT EXISTS social_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT, -- Text overlay on story
    media_url TEXT, -- Image/video URL
    media_type VARCHAR(20) DEFAULT 'image', -- 'image' or 'video'
    background_color VARCHAR(20), -- For text-only stories
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    view_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);

-- Story views tracking
CREATE TABLE IF NOT EXISTS social_story_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES social_stories(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(story_id, viewer_id)
);

-- Story reactions
CREATE TABLE IF NOT EXISTS social_story_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES social_stories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction VARCHAR(10) NOT NULL, -- emoji reaction
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(story_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stories_author ON social_stories(author_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON social_stories(expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_stories_created ON social_stories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_views_story ON social_story_views(story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON social_story_views(viewer_id);

-- Enable RLS
ALTER TABLE social_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_story_reactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for stories
CREATE POLICY "Anyone can view active stories"
    ON social_stories FOR SELECT
    USING (is_active = true AND expires_at > NOW());

CREATE POLICY "Users can create their own stories"
    ON social_stories FOR INSERT
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can delete their own stories"
    ON social_stories FOR DELETE
    USING (author_id = auth.uid());

-- RLS Policies for story views
CREATE POLICY "Story authors can see who viewed"
    ON social_story_views FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM social_stories s
            WHERE s.id = story_id AND s.author_id = auth.uid()
        )
        OR viewer_id = auth.uid()
    );

CREATE POLICY "Users can record their views"
    ON social_story_views FOR INSERT
    WITH CHECK (viewer_id = auth.uid());

-- RLS Policies for story reactions
CREATE POLICY "Anyone can view story reactions"
    ON social_story_reactions FOR SELECT
    USING (true);

CREATE POLICY "Users can add reactions"
    ON social_story_reactions FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove their reactions"
    ON social_story_reactions FOR DELETE
    USING (user_id = auth.uid());

-- Function to create a story
CREATE OR REPLACE FUNCTION fn_create_story(
    p_user_id UUID,
    p_content TEXT DEFAULT NULL,
    p_media_url TEXT DEFAULT NULL,
    p_media_type VARCHAR DEFAULT 'image',
    p_background_color VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_story_id UUID;
BEGIN
    INSERT INTO social_stories (author_id, content, media_url, media_type, background_color)
    VALUES (p_user_id, p_content, p_media_url, p_media_type, p_background_color)
    RETURNING id INTO v_story_id;
    
    RETURN v_story_id;
END;
$$;

-- Function to view a story (records view + increments count)
CREATE OR REPLACE FUNCTION fn_view_story(p_story_id UUID, p_viewer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Record view if not already viewed
    INSERT INTO social_story_views (story_id, viewer_id)
    VALUES (p_story_id, p_viewer_id)
    ON CONFLICT (story_id, viewer_id) DO NOTHING;
    
    -- Increment view count
    UPDATE social_stories
    SET view_count = view_count + 1
    WHERE id = p_story_id;
    
    RETURN true;
END;
$$;

-- Function to get active stories with author info
CREATE OR REPLACE FUNCTION fn_get_stories(p_viewer_id UUID)
RETURNS TABLE(
    id UUID,
    author_id UUID,
    author_username TEXT,
    author_avatar TEXT,
    author_fullname TEXT,
    content TEXT,
    media_url TEXT,
    media_type VARCHAR,
    background_color VARCHAR,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    view_count INTEGER,
    is_viewed BOOLEAN,
    is_own BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.author_id,
        p.username::TEXT,
        p.avatar_url::TEXT,
        p.full_name::TEXT,
        s.content,
        s.media_url,
        s.media_type,
        s.background_color,
        s.created_at,
        s.expires_at,
        s.view_count,
        EXISTS(SELECT 1 FROM social_story_views v WHERE v.story_id = s.id AND v.viewer_id = p_viewer_id) AS is_viewed,
        (s.author_id = p_viewer_id) AS is_own
    FROM social_stories s
    JOIN profiles p ON p.id = s.author_id
    WHERE s.is_active = true
      AND s.expires_at > NOW()
    ORDER BY 
        (s.author_id = p_viewer_id) DESC, -- Own stories first
        s.created_at DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION fn_create_story(UUID, TEXT, TEXT, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_view_story(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_stories(UUID) TO authenticated;

-- Auto-cleanup job: Mark expired stories as inactive (run via cron)
-- This would be called by a cron job: SELECT cleanup_expired_stories();
CREATE OR REPLACE FUNCTION cleanup_expired_stories()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE social_stories
    SET is_active = false
    WHERE expires_at < NOW() AND is_active = true;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
