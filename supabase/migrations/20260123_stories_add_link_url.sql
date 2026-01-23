-- ═══════════════════════════════════════════════════════════════════════════
-- ADD LINK_URL TO STORIES - Store link URLs separately from content
-- Fixes bug where links in stories were not clickable
-- ═══════════════════════════════════════════════════════════════════════════

-- Add link_url column to social_stories
ALTER TABLE social_stories ADD COLUMN IF NOT EXISTS link_url TEXT;

-- Update fn_create_story to accept link_url parameter
CREATE OR REPLACE FUNCTION fn_create_story(
    p_user_id UUID,
    p_content TEXT DEFAULT NULL,
    p_media_url TEXT DEFAULT NULL,
    p_media_type VARCHAR DEFAULT 'image',
    p_background_color VARCHAR DEFAULT NULL,
    p_link_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_story_id UUID;
BEGIN
    INSERT INTO social_stories (author_id, content, media_url, media_type, background_color, link_url)
    VALUES (p_user_id, p_content, p_media_url, p_media_type, p_background_color, p_link_url)
    RETURNING id INTO v_story_id;
    
    RETURN v_story_id;
END;
$$;

-- Update fn_get_stories to return link_url
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
    link_url TEXT,
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
        s.link_url,
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

-- Update grants (with new signature)
GRANT EXECUTE ON FUNCTION fn_create_story(UUID, TEXT, TEXT, VARCHAR, VARCHAR, TEXT) TO authenticated;
