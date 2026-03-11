-- ═══════════════════════════════════════════════════════════════════════════
-- SOCIAL FEED FIX V5 - TYPE MISMATCH RESOLUTION
-- Fixes "structure of query does not match function result type"
-- Changes media_urls from TEXT[] to JSONB to match table schema.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. FIX FEED FUNCTION (Type Correction)
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
    media_urls JSONB,        -- FIXED: Matched to Table Type (JSONB)
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
        COALESCE(udp.username, 'Anonymous')::TEXT AS author_username,
        udp.avatar_url::TEXT AS author_avatar,
        COALESCE(udp.current_level, 1)::INTEGER AS author_level,
        sp.content AS content,
        sp.content_type::TEXT AS content_type,
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
    LEFT JOIN user_dna_profiles udp ON udp.id = sp.author_id
    WHERE (sp.visibility = 'public' OR sp.visibility IS NULL)
    ORDER BY sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_get_social_feed_v2 TO anon, authenticated;

-- 2. FIX CREATE POST FUNCTION (Type Correction)
CREATE OR REPLACE FUNCTION fn_create_social_post(
    p_author_id UUID,
    p_content TEXT,
    p_content_type TEXT,
    p_media_urls JSONB,     -- FIXED: Matched to Table Type (JSONB)
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

    -- Return clean object
    SELECT jsonb_build_object(
        'id', v_post_id,
        'author_id', p_author_id,
        'content', p_content,
        'created_at', NOW(),
        'media_urls', p_media_urls
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_create_social_post TO authenticated;
