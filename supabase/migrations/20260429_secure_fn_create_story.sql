-- SECURITY HARDENING: fn_create_story — same author-id spoofing fix as fn_create_social_post
--
-- fn_create_story has identical vulnerability profile: SECURITY DEFINER,
-- accepts p_user_id, no auth check, granted to PUBLIC + anon + authenticated.
-- Anyone can create a story posing as anyone.
--
-- Called by SocialService.createPost auto-story logic, so trusted callers
-- (server endpoints with service_role + browser sessions posting as self)
-- are unaffected. Plus added SET search_path = 'public' which the original
-- function was missing — defense against schema-injection attacks.
--
-- Authored alongside sweep 3 of the upload-flow audit, 2026-04-29.

REVOKE EXECUTE ON FUNCTION public.fn_create_story(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_create_story(uuid, text, text, text, text, text) FROM anon;

CREATE OR REPLACE FUNCTION public.fn_create_story(
  p_user_id uuid,
  p_content text,
  p_media_url text DEFAULT NULL::text,
  p_media_type text DEFAULT NULL::text,
  p_background_color text DEFAULT NULL::text,
  p_link_url text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_story_id uuid;
  v_caller_role text;
  v_caller_uid uuid;
BEGIN
  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();

  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_user_id <> v_caller_uid THEN
      RAISE WARNING 'fn_create_story: forbidden author spoof attempt by % targeting %', v_caller_uid, p_user_id;
      RETURN NULL;
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN NULL;
  END IF;
  -- service_role: bypass

  INSERT INTO social_stories (
    author_id, content, media_url, media_type, background_color, link_url,
    expires_at, created_at
  ) VALUES (
    p_user_id, p_content, p_media_url, p_media_type, p_background_color, p_link_url,
    now() + interval '24 hours', now()
  )
  RETURNING id INTO v_story_id;

  RETURN v_story_id;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_create_story failed for user %: % %', p_user_id, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$function$;
