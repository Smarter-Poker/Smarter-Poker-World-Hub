-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Add thumbnail_url to social_posts
-- Allows video posts to store a user-selected cover frame URL.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN social_posts.thumbnail_url IS
  'Optional cover/thumbnail image URL for video posts. Set by user at post time.';

DROP FUNCTION IF EXISTS public.fn_create_social_post(uuid, text, text, text[], text, text);

CREATE OR REPLACE FUNCTION public.fn_create_social_post(
  p_author_id uuid,
  p_content text DEFAULT '',
  p_content_type text DEFAULT 'text',
  p_media_urls text[] DEFAULT '{}',
  p_visibility text DEFAULT 'public',
  p_achievement_data text DEFAULT NULL,
  p_thumbnail_url text DEFAULT NULL
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
    thumbnail_url,
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
    p_thumbnail_url,
    now(),
    now()
  )
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('success', true, 'id', v_post_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_create_social_post(uuid, text, text, text[], text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_social_post(uuid, text, text, text[], text, text, text) TO service_role;

COMMENT ON FUNCTION public.fn_create_social_post IS
  'Create a social post with optional thumbnail_url.';
