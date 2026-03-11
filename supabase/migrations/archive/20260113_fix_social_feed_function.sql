-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Column reference "total_xp" is ambiguous in fn_get_social_feed
-- This migration fixes the ambiguous column reference by properly qualifying
-- all columns with their table aliases.
-- 
-- RUN THIS IN SUPABASE SQL EDITOR:
-- https://supabase.com/dashboard → Your Project → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the old function if it exists to avoid signature conflicts
DROP FUNCTION IF EXISTS fn_get_social_feed(UUID, INT, INT, TEXT);

-- Create the fixed function with proper column qualifications
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
        sp.author_id AS author_id,
        COALESCE(p.username, 'Anonymous')::TEXT AS author_username,
        p.avatar_url::TEXT AS author_avatar,
        COALESCE(p.current_level, 1)::INT AS author_level,
        sp.content AS content,
        COALESCE(sp.content_type, 'text')::TEXT AS content_type,
        sp.media_urls AS media_urls,
        COALESCE(sp.like_count, 0)::INT AS like_count,
        COALESCE(sp.comment_count, 0)::INT AS comment_count,
        COALESCE(sp.share_count, 0)::INT AS share_count,
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
    ORDER BY 
        CASE WHEN p_filter = 'trending' THEN sp.like_count ELSE 0 END DESC,
        sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION fn_get_social_feed TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION: Test the function works
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Quick test to ensure no errors
    PERFORM * FROM fn_get_social_feed(NULL, 5, 0, 'recent');
    RAISE NOTICE '✅ fn_get_social_feed function verified successfully!';
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION '❌ fn_get_social_feed test failed: %', SQLERRM;
END;
$$;
