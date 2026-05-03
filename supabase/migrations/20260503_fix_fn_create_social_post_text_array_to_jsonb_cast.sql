-- ─────────────────────────────────────────────────────────────────────────
-- 2026-05-03  Fix fn_create_social_post — text[] cannot cast to jsonb
-- ─────────────────────────────────────────────────────────────────────────
-- Per Dan's bug-hunt audit: the live fn_create_social_post was INSERTing
-- p_media_urls (text[]) directly into media_urls (jsonb) with no conversion.
-- Postgres has NO implicit cast from text[] to jsonb, so every RPC call
-- raised:
--   "column \"media_urls\" is of type jsonb but expression is of type text[]"
-- which the EXCEPTION handler caught and returned as
--   {success: false, error: '...'}
--
-- The parent /hub/social-media handlePost has a fallback direct-INSERT path
-- that worked because the Supabase JS client serializes JS arrays as JSON,
-- which casts cleanly into a jsonb column on the wire. So users still got
-- their post saved — but every single post wasted an RPC round-trip,
-- logged a console warning, and obscured real RLS / auth errors behind the
-- generic cast failure.
--
-- This migration:
--   1. Restores the to_jsonb(p_media_urls) wrapper that the original
--      secure_fn_create_social_post_20260429 + fn_create_social_post_v2
--      migrations had (something overwrote the function with a broken
--      version somewhere between 20260501 and now).
--   2. Re-adds the auth.uid() spoof-check so authenticated users can only
--      post as themselves. service_role bypasses (trusted server callers).
--      anon is rejected explicitly (defense-in-depth on top of REVOKE).
--   3. Re-applies the GRANT to authenticated + service_role and REVOKE
--      from PUBLIC + anon.
--
-- Signature stays at the V1 7-param shape because that's what the parent
-- handlePost in pages/hub/social-media/index.js calls with. The V2 14-param
-- variant was for the /compose detour which has been removed.

DROP FUNCTION IF EXISTS public.fn_create_social_post(uuid, text, text, text[], text, jsonb, text);

CREATE FUNCTION public.fn_create_social_post(
  p_author_id uuid,
  p_content text DEFAULT ''::text,
  p_content_type text DEFAULT 'text'::text,
  p_media_urls text[] DEFAULT '{}'::text[],
  p_visibility text DEFAULT 'public'::text,
  p_achievement_data jsonb DEFAULT NULL::jsonb,
  p_thumbnail_url text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_post_id uuid;
  v_media_jsonb jsonb;
  v_caller_role text;
  v_caller_uid uuid;
BEGIN
  -- Authorization gate
  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();

  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_author_id <> v_caller_uid THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'forbidden: authenticated users may only post as themselves'
      );
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'forbidden: anonymous callers cannot create posts'
    );
  END IF;
  -- service_role and any future trusted role: continue.

  -- THE FIX: explicit text[] → jsonb conversion. Without this the INSERT
  -- raises "column media_urls is of type jsonb but expression is of type
  -- text[]" and the EXCEPTION handler returns {success:false}.
  v_media_jsonb := to_jsonb(p_media_urls);

  INSERT INTO social_posts (
    author_id, content, content_type, media_urls, visibility,
    achievement_data, thumbnail_url, created_at, updated_at
  ) VALUES (
    p_author_id, p_content, p_content_type, v_media_jsonb, p_visibility,
    p_achievement_data, p_thumbnail_url, now(), now()
  )
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_post_id,
    'author_id', p_author_id,
    'content', p_content,
    'content_type', p_content_type,
    'created_at', NOW(),
    'media_urls', v_media_jsonb,
    'thumbnail_url', p_thumbnail_url,
    'like_count', 0,
    'comment_count', 0
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_create_social_post(uuid, text, text, text[], text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_create_social_post(uuid, text, text, text[], text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_create_social_post(uuid, text, text, text[], text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_social_post(uuid, text, text, text[], text, jsonb, text) TO service_role;
