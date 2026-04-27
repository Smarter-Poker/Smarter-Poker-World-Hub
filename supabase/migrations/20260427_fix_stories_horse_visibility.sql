-- ============================================================
-- Fix: Horse stories invisible to non-followers (2026-04-27)
-- ============================================================
-- PROBLEM: fn_get_stories only shows stories from social_followers.
-- But horse accounts use the friendships table, not social_followers.
-- Result: horse stories are invisible to users who haven't explicitly
-- clicked "Follow" on the horse's profile — only "friend" relationships
-- exist (via sendFriendRequests / acceptFriendRequests in HorseSocialEngine).
--
-- FIX: Extend WHERE clause to also include stories from accepted friends
-- (bidirectional friendship check on the friendships table).
-- This ensures any user who is friends with a horse will see their stories.
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_get_stories(uuid);

CREATE OR REPLACE FUNCTION public.fn_get_stories(p_viewer_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      s.id,
      s.author_id,
      s.content,
      s.media_url,
      s.media_type,
      s.background_color,
      s.link_url,
      s.created_at,
      s.expires_at,
      s.view_count,
      p.username AS author_username,
      COALESCE(p.full_name, p.username) AS author_fullname,
      p.avatar_url AS author_avatar,
      (s.author_id = p_viewer_id) AS is_own,
      EXISTS (
        SELECT 1 FROM social_story_views sv
        WHERE sv.story_id = s.id AND sv.viewer_id = p_viewer_id
      ) AS is_viewed
    FROM social_stories s
    JOIN profiles p ON p.id = s.author_id
    WHERE
      s.expires_at > now()
      AND (
        -- Own stories
        s.author_id = p_viewer_id
        -- Stories from users the viewer follows
        OR EXISTS (
          SELECT 1 FROM social_followers sf
          WHERE sf.follower_id = p_viewer_id AND sf.followed_id = s.author_id
        )
        -- BUG FIX 2026-04-27: Stories from accepted friends (horses use friendships, not social_followers)
        -- Without this, horse stories are invisible to users who friended (not followed) the horse.
        OR EXISTS (
          SELECT 1 FROM friendships f
          WHERE f.status = 'accepted'
            AND (
              (f.user_id = p_viewer_id AND f.friend_id = s.author_id)
              OR (f.friend_id = p_viewer_id AND f.user_id = s.author_id)
            )
        )
      )
    ORDER BY s.created_at DESC
    LIMIT 100
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);

EXCEPTION WHEN OTHERS THEN
  RETURN '[]'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_stories(uuid) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_get_stories IS
  'Get stories for a viewer — own + followed + accepted friends (horse visibility fix 2026-04-27).';
