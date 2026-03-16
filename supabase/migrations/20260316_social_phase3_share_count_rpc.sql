-- =============================================================================
-- 📊 Social Media Phase 1-3: increment_share_count RPC Function
-- Created: 2026-03-16
-- Description: Atomic share count increment for social posts.
--              Called by /api/social/share-count.js
-- =============================================================================

-- Create RPC function to atomically increment share_count
CREATE OR REPLACE FUNCTION increment_share_count(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE social_posts
    SET share_count = COALESCE(share_count, 0) + 1
    WHERE id = p_post_id;
END;
$$;

-- Grant execute to authenticated users and anon (for API route)
GRANT EXECUTE ON FUNCTION increment_share_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_share_count(UUID) TO anon;
GRANT EXECUTE ON FUNCTION increment_share_count(UUID) TO service_role;
