-- ============================================================
-- Fix fn_get_stories: wrong table name + missing horse bypass
-- Created: 2026-04-22
-- Applied: via psql (hotfix)
-- ============================================================
--
-- BUG 1: Wrong table name
--   fn_get_stories referenced 'social_followers' which does NOT exist.
--   The actual table is 'social_follows'. Because the function wraps in
--   EXCEPTION WHEN OTHERS, it silently returned '[]' instead of erroring.
--
-- BUG 2: Wrong column name
--   The EXISTS subquery used 'followed_id', but social_follows uses 'following_id'.
--
-- BUG 3: Missing horse bypass
--   Content-author (horse) stories should always be visible to all users,
--   not just followers. The old query required a follow relationship even
--   for horse stories.
--
-- RESULT: All three bugs combined meant the stories bar showed ZERO stories
--   for any user (except themselves), breaking the stories feature entirely.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_get_stories(p_viewer_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      AND s.is_active = true
      AND (
        -- Always show your own stories
        s.author_id = p_viewer_id
        -- Always show horse/content-author stories (public community feed)
        OR EXISTS (
          SELECT 1 FROM content_authors ca
          WHERE ca.profile_id = s.author_id AND ca.is_active = true
        )
        -- Show stories from users you follow
        -- FIX: correct table = social_follows, correct column = following_id
        OR EXISTS (
          SELECT 1 FROM social_follows sf
          WHERE sf.follower_id = p_viewer_id AND sf.following_id = s.author_id
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

COMMENT ON FUNCTION public.fn_get_stories IS
  'Fixed 2026-04-22: corrected table (social_follows), column (following_id), added horse bypass.';
