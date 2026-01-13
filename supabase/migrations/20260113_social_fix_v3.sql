-- ═══════════════════════════════════════════════════════════════════════════
-- SOCIAL FEED FIX V3 - AGGRESSIVE RESOLUTION
-- Use this file if you encountered "syntax error" on the previous attempt.
-- 1. Creates fn_get_social_feed_v2 (New name, clean slate)
-- 2. Creates fn_create_social_post to safely create posts (bypassing triggers)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. NEW FEED FUNCTION (V2)
-- Using simplified types to avoid syntax errors
CREATE OR REPLACE FUNCTION fn_get_social_feed_v2(
    p_user_id UUID,
    p_limit INTEGER,
    p_offset INTEGER,
    p_filter TEXT
)
RETURNS TABLE (
    post_id UUID,
    author_id UUID,
    author_username TEXT,
    author_avatar TEXT,
    author_level INTEGER,
    content TEXT,
    content_type TEXT,
    media_urls TEXT[],
    like_count INTEGER,
    comment_count INTEGER,
    share_count INTEGER,
    is_liked BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.id AS post_id,
        sp.author_id AS author_id,
        COALESCE(p.username, 'Anonymous')::TEXT AS author_username,
        p.avatar_url::TEXT AS author_avatar,
        COALESCE(p.current_level, 1)::INTEGER AS author_level,
        sp.content AS content,
        COALESCE(sp.content_type, 'text')::TEXT AS content_type,
        sp.media_urls AS media_urls,
        COALESCE(sp.like_count, 0)::INTEGER AS like_count,
        COALESCE(sp.comment_count, 0)::INTEGER AS comment_count,
        COALESCE(sp.share_count, 0)::INTEGER AS share_count,
        CASE 
            WHEN p_user_id IS NOT NULL THEN 
                EXISTS(
                    SELECT 1 FROM social_interactions si 
                    WHERE si.post_id = sp.id 
                    AND si.user_id = p_user_id 
                    AND si.interaction_type = 'like'
                )
            ELSE FALSE
        END AS is_liked,
        sp.created_at AS created_at
    FROM social_posts sp
    LEFT JOIN profiles p ON p.id = sp.author_id
    WHERE (sp.visibility = 'public' OR sp.visibility IS NULL)
    ORDER BY sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_get_social_feed_v2 TO anon, authenticated;

-- 2. SAFE CREATE POST FUNCTION (Bypasses Ambiguity)
CREATE OR REPLACE FUNCTION fn_create_social_post(
    p_author_id UUID,
    p_content TEXT,
    p_content_type TEXT,
    p_media_urls TEXT[],
    p_visibility TEXT,
    p_achievement_data JSONB DEFAULT NULL
)
RETURNS JSONB
AS $$
DECLARE
    v_post_id UUID;
    v_result JSONB;
BEGIN
    INSERT INTO social_posts (
        author_id, content, content_type, media_urls, visibility, achievement_data
    ) VALUES (
        p_author_id, p_content, p_content_type, p_media_urls, p_visibility, p_achievement_data
    )
    RETURNING id INTO v_post_id;

    -- Return clean object without querying possibly ambiguous views
    SELECT jsonb_build_object(
        'id', v_post_id,
        'author_id', p_author_id,
        'content', p_content,
        'created_at', NOW(),
        'media_urls', p_media_urls,
        'like_count', 0,
        'comment_count', 0
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_create_social_post TO authenticated;
