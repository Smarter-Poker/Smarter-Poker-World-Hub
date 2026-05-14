-- ═══════════════════════════════════════════════════════════════════════════
-- 20260514_fix_social_feed_reactions.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- AUTHOR:      antigravity
-- AFFECTS:     fn_get_social_feed
--
-- WHY:
--   fn_get_social_feed was querying the deprecated `social_interactions` table 
--   instead of `social_likes`. Furthermore, it lacked `reaction_type`, 
--   `thumbnail_url`, `metadata`, and advanced profile name columns.
--   This patches fn_get_social_feed to return all needed fields for the UI.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.fn_get_social_feed(UUID, INT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_get_social_feed(
    p_user_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0,
    p_filter TEXT DEFAULT 'recent'
)
RETURNS TABLE (
    post_id UUID,
    author_id UUID,
    author_username TEXT,
    author_full_name TEXT,
    author_display_name_preference TEXT,
    author_avatar TEXT,
    author_level INT,
    content TEXT,
    content_type TEXT,
    media_urls JSONB,
    thumbnail_url TEXT,
    metadata JSONB,
    like_count INT,
    comment_count INT,
    share_count INT,
    is_liked BOOLEAN,
    reaction_type TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.id AS post_id,
        sp.author_id AS author_id,
        COALESCE(p.username, 'Anonymous')::TEXT AS author_username,
        p.full_name::TEXT AS author_full_name,
        p.display_name_preference::TEXT AS author_display_name_preference,
        p.avatar_url::TEXT AS author_avatar,
        COALESCE(p.current_level, 1)::INT AS author_level,
        sp.content AS content,
        COALESCE(sp.content_type, 'text')::TEXT AS content_type,
        sp.media_urls::JSONB AS media_urls,
        sp.thumbnail_url::TEXT AS thumbnail_url,
        sp.metadata::JSONB AS metadata,
        COALESCE(sp.like_count, 0)::INT AS like_count,
        COALESCE(sp.comment_count, 0)::INT AS comment_count,
        COALESCE(sp.share_count, 0)::INT AS share_count,
        CASE 
            WHEN p_user_id IS NOT NULL THEN 
                EXISTS(
                    SELECT 1 FROM public.social_likes sl 
                    WHERE sl.post_id = sp.id 
                    AND sl.user_id = p_user_id 
                )
            ELSE FALSE
        END AS is_liked,
        (
            SELECT sl.reaction_type FROM public.social_likes sl 
            WHERE sl.post_id = sp.id AND sl.user_id = p_user_id 
            LIMIT 1
        )::TEXT AS reaction_type,
        sp.created_at AS created_at
    FROM public.social_posts sp
    LEFT JOIN public.user_dna_profiles p ON p.user_id = sp.author_id
    WHERE (sp.visibility = 'public' OR sp.visibility IS NULL)
    ORDER BY 
        CASE WHEN p_filter = 'trending' THEN COALESCE(sp.like_count, 0) ELSE 0 END DESC,
        sp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.fn_get_social_feed TO anon, authenticated;

COMMIT;
