-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: set_active_avatar (applied to production 2026-07-29 via Supabase MCP
-- apply_migration; this file is the auditable copy per RULE 2)
--  1. EXECUTE had been revoked from `authenticated` (20260429 compliance
--     sweep), breaking every avatar equip from the client. Re-grant with a
--     proper auth guard instead of leaving the function unreachable.
--  2. The function never synced profiles.avatar_url, so Club Arena, training
--     games and the header (which all read profiles.avatar_url) never saw
--     avatar changes made on /hub/avatars. New optional p_image_url lets the
--     client pass the display URL for presets; custom avatars use
--     p_custom_image_url automatically.
--  3. Enforce auth.uid() = p_user_id for authenticated callers (service role
--     with NULL auth.uid() is allowed through for admin tooling).
-- Old 5-arg signature must be dropped: adding a defaulted 6th param would
-- otherwise create an ambiguous overload.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.set_active_avatar(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.set_active_avatar(uuid, text);

CREATE OR REPLACE FUNCTION public.set_active_avatar(
  p_user_id uuid,
  p_avatar_type text,
  p_preset_avatar_id text DEFAULT NULL,
  p_custom_image_url text DEFAULT NULL,
  p_custom_prompt text DEFAULT NULL,
  p_image_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_avatar_id uuid;
  v_display_url text;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not allowed: cannot set another user''s avatar';
  END IF;

  IF p_avatar_type NOT IN ('preset', 'custom') THEN
    RAISE EXCEPTION 'invalid avatar type: %', p_avatar_type;
  END IF;

  INSERT INTO user_avatars (
    user_id, avatar_type, preset_avatar_id, custom_image_url,
    custom_prompt, generation_timestamp, is_active, updated_at
  ) VALUES (
    p_user_id, p_avatar_type, p_preset_avatar_id, p_custom_image_url,
    p_custom_prompt,
    CASE WHEN p_avatar_type = 'custom' THEN NOW() ELSE NULL END,
    true, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    avatar_type = EXCLUDED.avatar_type,
    preset_avatar_id = EXCLUDED.preset_avatar_id,
    custom_image_url = EXCLUDED.custom_image_url,
    custom_prompt = EXCLUDED.custom_prompt,
    generation_timestamp = EXCLUDED.generation_timestamp,
    is_active = true,
    updated_at = NOW()
  RETURNING id INTO v_avatar_id;

  v_display_url := COALESCE(p_image_url, p_custom_image_url);
  IF v_display_url IS NOT NULL THEN
    UPDATE profiles SET avatar_url = v_display_url WHERE id = p_user_id;
  END IF;

  RETURN v_avatar_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_active_avatar(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_avatar(uuid, text, text, text, text, text) TO authenticated, service_role;
