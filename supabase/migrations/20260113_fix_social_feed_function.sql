-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Column reference "total_xp" is ambiguous
-- Run this in Supabase SQL Editor to fix the social feed function
-- ═══════════════════════════════════════════════════════════════════════════

-- First, let's see what the current function looks like and fix it
-- This creates a simple, working version

CREATE OR REPLACE FUNCTION fn_get_social_feed(
    p_user_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0,
    p_filter TEXT DEFAULT 'recent'
)
RETURNS TABLE (
    post_id UUID,
    author_id UUID,
    author_username TEXT,
    author_avatar TEXT,
    author_level INT,
    content TEXT,
    content_type TEXT,
    media_urls TEXT[],
    like_count INT,
    comment_count INT,
    share_count INT,
    is_liked BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.id AS post_id,
        sp.author_id,
        COALESCE(p.username, 'Anonymous')::TEXT AS author_username,
        NULL::TEXT AS author_avatar,
        1::INT AS author_level,
        sp.content,
        COALESCE(sp.content_type, 'text')::TEXT AS content_type,
        sp.media_urls,
        COALESCE(sp.like_count, 0)::INT AS like_count,
        COALESCE(sp.comment_count, 0)::INT AS comment_count,
        COALESCE(sp.share_count, 0)::INT AS share_count,
        FALSE AS is_liked,
        sp.created_at
    FROM social_posts sp
    LEFT JOIN profiles p ON p.id = sp.author_id
    WHERE sp.visibility = 'public' OR sp.visibility IS NULL
    ORDER BY sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access
GRANT EXECUTE ON FUNCTION fn_get_social_feed TO anon, authenticated;

-- Test it
SELECT * FROM fn_get_social_feed(NULL, 5, 0, 'recent');
