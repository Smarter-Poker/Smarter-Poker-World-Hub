-- STREAM-POLISH-R4 STORY-VIEW-1 + STORY-CREATE-1: replace phantom
-- fn_view_story stub with a real implementation; tighten
-- fn_create_story with a content-length cap.
--
-- BACKGROUND:
--   migration 20260314_phantom_rpcs.sql introduced a stub
--   fn_view_story whose body is literally `BEGIN NULL; END;`. Every
--   client call to supabase.rpc('fn_view_story', ...) from
--   src/components/social/Stories.jsx has been a silent no-op since
--   then. Consequences:
--     - social_stories.view_count never increments past 0
--     - social_story_views table receives no rows
--     - "who viewed your story" list is empty
--     - the unviewed-ring -> viewed-ring transition never fires
--
-- FIX:
--   1. Real fn_view_story:
--      - SECURITY DEFINER, search_path locked
--      - rejects spoofs: authenticated callers must pass their own
--        auth.uid() as p_viewer_id; service_role bypass preserved
--      - INSERT ... ON CONFLICT (story_id, viewer_id) DO NOTHING
--      - UPDATE social_stories.view_count only when a NEW view was
--        inserted (FOUND semantics) so re-views don't double-count
--   2. fn_create_story content-length cap:
--      - 500 chars is generous for a story overlay
--      - returns NULL with a WARNING if exceeded — matches the
--        existing spoof-failure return path

-- ─── fn_view_story: real implementation ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_view_story(
  p_story_id uuid DEFAULT NULL,
  p_viewer_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_uid uuid;
  v_inserted_id uuid;
BEGIN
  IF p_story_id IS NULL OR p_viewer_id IS NULL THEN
    RETURN;
  END IF;

  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();

  IF v_caller_role = 'authenticated' THEN
    IF v_caller_uid IS NULL OR p_viewer_id <> v_caller_uid THEN
      RAISE WARNING 'fn_view_story: spoof attempt by % targeting %', v_caller_uid, p_viewer_id;
      RETURN;
    END IF;
  ELSIF v_caller_role = 'anon' OR v_caller_role = '' THEN
    RETURN;
  END IF;
  -- service_role: bypass

  INSERT INTO social_story_views (story_id, viewer_id, viewed_at)
  VALUES (p_story_id, p_viewer_id, now())
  ON CONFLICT (story_id, viewer_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF FOUND THEN
    UPDATE social_stories
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = p_story_id;
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_view_story failed (story=%, viewer=%): % %',
    p_story_id, p_viewer_id, SQLERRM, SQLSTATE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_view_story(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_view_story(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_view_story(uuid, uuid) TO authenticated;

-- ─── fn_create_story: add 500-char content cap ───────────────────
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

  -- STREAM-POLISH-R4 STORY-CREATE-1: length cap. 500 chars is
  -- generous (Instagram caps at 250). Anything beyond is almost
  -- certainly a paste-bomb or DB-row-size attack.
  IF p_content IS NOT NULL AND LENGTH(p_content) > 500 THEN
    RAISE WARNING 'fn_create_story: content too long (% chars, max 500)', LENGTH(p_content);
    RETURN NULL;
  END IF;

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
