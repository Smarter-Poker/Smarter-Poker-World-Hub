-- ═══════════════════════════════════════════════════════════════════════════
-- BUG FIX: Feed RPC — add thumbnail_url, metadata, author fields
--
-- fn_get_social_feed_v2 was missing:
--   • thumbnail_url   → every video post showed black box (no poster frame)
--   • metadata        → live replay posts couldn't be routed to /hub/lives
--   • author_full_name / author_display_name_preference / author_tier
--
-- fn_create_social_post was missing p_thumbnail_url → thumbnails were never
-- stored when creating posts via the RPC path.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. PATCH fn_get_social_feed_v2 — add missing columns
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
    author_full_name TEXT,
    author_display_name_preference TEXT,
    author_avatar TEXT,
    author_level INTEGER,
    author_tier TEXT,
    content TEXT,
    content_type TEXT,
    media_urls TEXT[],
    thumbnail_url TEXT,
    metadata JSONB,
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
        p.full_name::TEXT AS author_full_name,
        COALESCE(p.display_name_preference, 'full_name')::TEXT AS author_display_name_preference,
        p.avatar_url::TEXT AS author_avatar,
        COALESCE(p.current_level, 1)::INTEGER AS author_level,
        COALESCE(p.tier_id, 'BRONZE')::TEXT AS author_tier,
        sp.content AS content,
        COALESCE(sp.content_type, 'text')::TEXT AS content_type,
        sp.media_urls AS media_urls,
        sp.thumbnail_url::TEXT AS thumbnail_url,
        sp.metadata AS metadata,
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

-- 2. PATCH fn_create_social_post — add p_thumbnail_url parameter
CREATE OR REPLACE FUNCTION fn_create_social_post(
    p_author_id UUID,
    p_content TEXT,
    p_content_type TEXT,
    p_media_urls TEXT[],
    p_visibility TEXT,
    p_achievement_data JSONB DEFAULT NULL,
    p_thumbnail_url TEXT DEFAULT NULL
)
RETURNS JSONB
AS $$
DECLARE
    v_post_id UUID;
    v_result JSONB;
BEGIN
    INSERT INTO social_posts (
        author_id, content, content_type, media_urls, visibility,
        achievement_data, thumbnail_url
    ) VALUES (
        p_author_id, p_content, p_content_type, p_media_urls, p_visibility,
        p_achievement_data, p_thumbnail_url
    )
    RETURNING id INTO v_post_id;

    -- Return object with full fields for immediate feed card hydration
    SELECT jsonb_build_object(
        'success', true,
        'id', v_post_id,
        'author_id', p_author_id,
        'content', p_content,
        'content_type', p_content_type,
        'created_at', NOW(),
        'media_urls', p_media_urls,
        'thumbnail_url', p_thumbnail_url,
        'like_count', 0,
        'comment_count', 0
    ) INTO v_result;

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_create_social_post TO authenticated;
