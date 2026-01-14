-- ═══════════════════════════════════════════════════════════════════════════
-- ENHANCED STORIES: Prioritize Friends' Stories
-- Updates fn_get_stories to show friends' stories first, then following, then others
-- ═══════════════════════════════════════════════════════════════════════════

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
    is_own BOOLEAN,
    is_friend BOOLEAN,
    is_following BOOLEAN
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
        (s.author_id = p_viewer_id) AS is_own,
        -- Check if author is a friend
        EXISTS(
            SELECT 1 FROM friendships f 
            WHERE f.user_id = p_viewer_id 
            AND f.friend_id = s.author_id 
            AND f.status = 'accepted'
        ) AS is_friend,
        -- Check if viewer is following author
        EXISTS(
            SELECT 1 FROM follows fo 
            WHERE fo.follower_id = p_viewer_id 
            AND fo.following_id = s.author_id
        ) AS is_following
    FROM social_stories s
    JOIN profiles p ON p.id = s.author_id
    WHERE s.is_active = true
      AND s.expires_at > NOW()
    ORDER BY 
        -- 1. Own stories first
        (s.author_id = p_viewer_id) DESC,
        -- 2. Friends' stories second
        EXISTS(
            SELECT 1 FROM friendships f 
            WHERE f.user_id = p_viewer_id 
            AND f.friend_id = s.author_id 
            AND f.status = 'accepted'
        ) DESC,
        -- 3. Following's stories third
        EXISTS(
            SELECT 1 FROM follows fo 
            WHERE fo.follower_id = p_viewer_id 
            AND fo.following_id = s.author_id
        ) DESC,
        -- 4. Then by recency (unviewed first within each group)
        EXISTS(SELECT 1 FROM social_story_views v WHERE v.story_id = s.id AND v.viewer_id = p_viewer_id) ASC,
        s.created_at DESC;
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION fn_get_stories(UUID) TO authenticated;
