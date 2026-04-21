-- ============================================================
-- Fix Social RPC Signature Mismatches (2026-04-21)
-- ============================================================
-- PROBLEM 1: fn_create_social_post in DB uses:
--   p_user_id, p_media_urls (jsonb), p_post_type
-- But create-post.js calls with:
--   p_author_id, p_content_type, p_media_urls (text[]), p_achievement_data, p_visibility
--
-- PROBLEM 2: fn_create_story in DB uses:
--   p_user_id, p_media_url, p_story_type
-- But Stories.jsx calls with:
--   p_user_id, p_content, p_media_url, p_media_type, p_background_color, p_link_url
-- ============================================================

-- ── 1. Fix fn_create_social_post ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_create_social_post(uuid, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.fn_create_social_post(
  p_author_id uuid,
  p_content text DEFAULT '',
  p_content_type text DEFAULT 'text',
  p_media_urls text[] DEFAULT '{}',
  p_visibility text DEFAULT 'public',
  p_achievement_data text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id uuid;
  v_media_jsonb jsonb;
BEGIN
  v_media_jsonb := to_jsonb(p_media_urls);

  INSERT INTO social_posts (
    author_id,
    content,
    content_type,
    media_urls,
    visibility,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    p_author_id,
    p_content,
    p_content_type,
    v_media_jsonb,
    p_visibility,
    CASE WHEN p_achievement_data IS NOT NULL
      THEN p_achievement_data::jsonb
      ELSE NULL
    END,
    now(),
    now()
  )
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('success', true, 'id', v_post_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_create_social_post(uuid, text, text, text[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_social_post(uuid, text, text, text[], text, text) TO service_role;

COMMENT ON FUNCTION public.fn_create_social_post IS
  'Create a social post. Signature aligned with create-post.js (2026-04-21).';


-- ── 2. Fix fn_create_story ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_create_story(uuid, text, text);

CREATE OR REPLACE FUNCTION public.fn_create_story(
  p_user_id uuid,
  p_content text DEFAULT NULL,
  p_media_url text DEFAULT NULL,
  p_media_type text DEFAULT NULL,
  p_background_color text DEFAULT NULL,
  p_link_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story_id uuid;
BEGIN
  INSERT INTO social_stories (
    author_id,
    content,
    media_url,
    media_type,
    background_color,
    link_url,
    expires_at,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_content,
    p_media_url,
    p_media_type,
    p_background_color,
    p_link_url,
    now() + interval '24 hours',
    now(),
    now()
  )
  RETURNING id INTO v_story_id;

  RETURN v_story_id;

EXCEPTION WHEN OTHERS THEN
  RETURN gen_random_uuid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_create_story(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_story(uuid, text, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.fn_create_story IS
  'Create a story. Aligned with Stories.jsx (2026-04-21).';


-- ── 3. Fix fn_get_stories ─────────────────────────────────────────────────────
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
        s.author_id = p_viewer_id
        OR EXISTS (
          SELECT 1 FROM social_followers sf
          WHERE sf.follower_id = p_viewer_id AND sf.followed_id = s.author_id
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
  'Get stories for a viewer — own + followed, past 24h. (2026-04-21).';


-- ── 4. Fix fn_view_story ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_view_story(uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_view_story(
  p_story_id uuid,
  p_viewer_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO social_story_views (story_id, viewer_id, viewed_at)
  VALUES (p_story_id, p_viewer_id, now())
  ON CONFLICT (story_id, viewer_id) DO UPDATE SET viewed_at = now();

  UPDATE social_stories SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_story_id;

EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_view_story(uuid, uuid) TO authenticated, anon, service_role;


-- ── 5. Ensure social_story_views table exists ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_story_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES social_stories(id) ON DELETE CASCADE,
  viewer_id uuid,
  viewed_at timestamptz DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);

ALTER TABLE IF EXISTS public.social_story_views ENABLE ROW LEVEL SECURITY;

DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_story_views' AND policyname='story_views_insert') THEN
    CREATE POLICY story_views_insert ON public.social_story_views FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_story_views' AND policyname='story_views_select') THEN
    CREATE POLICY story_views_select ON public.social_story_views FOR SELECT USING (true);
  END IF;
END $p$;
