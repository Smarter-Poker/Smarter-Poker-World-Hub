-- ═══════════════════════════════════════════════════════════════════════════
-- Fix increment_post_count / decrement_post_count RPCs
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEM: Existing increment_post_count(p_user_id) has wrong signature.
--          Code calls with (p_post_id UUID, p_field TEXT) causing silent
--          failure and 2-query fallback on every like/comment/share.
-- FIX: Create overloaded functions with correct (p_post_id, p_field) signature.
--      This halves DB load for denormalized counter updates.
-- ═══════════════════════════════════════════════════════════════════════════

-- INCREMENT: Atomically increment a counter field on social_posts
CREATE OR REPLACE FUNCTION public.increment_post_count(p_post_id UUID, p_field TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_field = 'like_count' THEN
        UPDATE social_posts SET like_count = COALESCE(like_count, 0) + 1 WHERE id = p_post_id;
    ELSIF p_field = 'comment_count' THEN
        UPDATE social_posts SET comment_count = COALESCE(comment_count, 0) + 1 WHERE id = p_post_id;
    ELSIF p_field = 'share_count' THEN
        UPDATE social_posts SET share_count = COALESCE(share_count, 0) + 1 WHERE id = p_post_id;
    END IF;
END;
$$;

-- DECREMENT: Atomically decrement a counter field on social_posts (floor at 0)
CREATE OR REPLACE FUNCTION public.decrement_post_count(p_post_id UUID, p_field TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_field = 'like_count' THEN
        UPDATE social_posts SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0) WHERE id = p_post_id;
    ELSIF p_field = 'comment_count' THEN
        UPDATE social_posts SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0) WHERE id = p_post_id;
    ELSIF p_field = 'share_count' THEN
        UPDATE social_posts SET share_count = GREATEST(COALESCE(share_count, 0) - 1, 0) WHERE id = p_post_id;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.increment_post_count(UUID, TEXT) IS 'Atomically increment a counter field (like_count, comment_count, share_count) on social_posts';
COMMENT ON FUNCTION public.decrement_post_count(UUID, TEXT) IS 'Atomically decrement a counter field (like_count, comment_count, share_count) on social_posts, floored at 0';
