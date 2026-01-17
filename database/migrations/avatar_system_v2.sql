-- =====================================================
-- AVATAR ENGINE DATABASE SCHEMA v2
-- Fixed constraint and set_active_avatar function
-- =====================================================

-- Step 1: Drop the old constraint if it exists
ALTER TABLE IF EXISTS user_avatars 
  DROP CONSTRAINT IF EXISTS active_avatar_unique;

-- Step 2: Add the correct constraint - only ONE active avatar per user
ALTER TABLE user_avatars 
  ADD CONSTRAINT user_avatars_user_id_key UNIQUE(user_id);

-- Step 3: Update the set_active_avatar function to use UPSERT pattern
CREATE OR REPLACE FUNCTION set_active_avatar(
  p_user_id UUID,
  p_avatar_type TEXT,
  p_preset_avatar_id TEXT DEFAULT NULL,
  p_custom_image_url TEXT DEFAULT NULL,
  p_custom_prompt TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_avatar_id UUID;
BEGIN
  -- Use INSERT ... ON CONFLICT for atomic upsert
  INSERT INTO user_avatars (
    user_id,
    avatar_type,
    preset_avatar_id,
    custom_image_url,
    custom_prompt,
    generation_timestamp,
    is_active,
    updated_at
  ) VALUES (
    p_user_id,
    p_avatar_type,
    p_preset_avatar_id,
    p_custom_image_url,
    p_custom_prompt,
    CASE WHEN p_avatar_type = 'custom' THEN NOW() ELSE NULL END,
    true,
    NOW()
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
  
  RETURN v_avatar_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
