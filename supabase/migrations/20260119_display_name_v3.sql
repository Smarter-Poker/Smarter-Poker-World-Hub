-- ═══════════════════════════════════════════════════════════════════════════
-- DISPLAY NAME PREFERENCE FIX V3
-- FIXED: Uses profiles.username as fallback when user_dna_profiles.username is NULL
-- This ensures users always show their correct username, not "Anonymous"
-- ═══════════════════════════════════════════════════════════════════════════

-- UPDATE FEED FUNCTION to fix author_username fallback chain
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
    content TEXT,
    content_type TEXT,
    media_urls JSONB,
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
        -- FIX: Check user_dna_profiles.username THEN profiles.username THEN 'Anonymous'
        COALESCE(udp.username, p.username, 'Anonymous')::TEXT AS author_username,
        p.full_name::TEXT AS author_full_name,
        COALESCE(p.display_name_preference, 'full_name')::TEXT AS author_display_name_preference,
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
    LEFT JOIN profiles p ON p.id = sp.author_id
    WHERE (sp.visibility = 'public' OR sp.visibility IS NULL)
    ORDER BY sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_get_social_feed_v2 TO anon, authenticated;
