-- SECURITY HARDENING: fn_create_social_post — block author-id spoofing
--
-- Background: this function is SECURITY DEFINER (bypasses RLS), accepts an
-- arbitrary p_author_id parameter, and was granted EXECUTE to PUBLIC + anon +
-- authenticated + service_role. That combination meant ANY unauthenticated
-- visitor could call:
--
--   curl -X POST https://<project>.supabase.co/rest/v1/rpc/fn_create_social_post \
--     -H "apikey: <anon-key>" -H "Content-Type: application/json" \
--     -d '{"p_author_id":"<victim-uuid>","p_content":"impersonated"}'
--
-- and post AS ANY USER, including admins. The legitimate calling paths
-- (/api/social/create-post and SocialService.createPost from authenticated
-- browser sessions) always pass the caller's own user.id, so they're
-- unaffected by adding the check.
--
-- Fix has two layers:
--   1. REVOKE EXECUTE from PUBLIC and anon — only authenticated users and
--      service_role should be able to even reach the function.
--   2. Add an in-body check: when called by the authenticated role, the
--      p_author_id MUST match auth.uid(). service_role bypasses the check
--      because it's used by trusted server endpoints that have already
--      authenticated the caller via JWT. anon is rejected explicitly as
--      defense-in-depth even after the REVOKE.
--
-- Authored alongside sweep 3 of the upload-flow audit, 2026-04-29.

-- ─── 1. Revoke broad grants ────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_create_social_post(uuid, text, text, text[], text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_create_social_post(uuid, text, text, text[], text, text, text) FROM anon;

-- ─── 2. Replace body with auth check ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_create_social_post(
  p_author_id uuid,
  p_content text DEFAULT ''::text,
  p_content_type text DEFAULT 'text'::text,
  p_media_urls text[] DEFAULT '{}'::text[],
  p_visibility text DEFAULT 'public'::text,
  p_achievement_data text DEFAULT NULL::text,
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
  -- Identify caller. service_role JWTs have role='service_role';
  -- authenticated user JWTs have role='authenticated'; anon has role='anon'.
  v_caller_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_caller_uid := auth.uid();

  -- Authorization gate:
  --   authenticated  -> p_author_id MUST equal auth.uid()
  --   anon           -> reject (REVOKE should already prevent reaching here;
  --                      this is defense-in-depth)
  --   service_role   -> bypass (trusted server endpoint already authenticated)
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

  v_media_jsonb := to_jsonb(p_media_urls);

  INSERT INTO social_posts (
    author_id, content, content_type, media_urls, visibility, metadata,
    thumbnail_url, created_at, updated_at
  ) VALUES (
    p_author_id, p_content, p_content_type, v_media_jsonb, p_visibility,
    CASE WHEN p_achievement_data IS NOT NULL THEN p_achievement_data::jsonb ELSE NULL END,
    p_thumbnail_url, now(), now()
  )
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('success', true, 'id', v_post_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
