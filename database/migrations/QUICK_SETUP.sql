-- =====================================================
-- 🎨 AVATAR ENGINE - ONE-CLICK SETUP
-- Copy this ENTIRE file and paste into Supabase SQL Editor
-- Click RUN and wait for "Success"
-- =====================================================

-- 1. Create user_avatars table
CREATE TABLE IF NOT EXISTS user_avatars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_type TEXT NOT NULL CHECK (avatar_type IN ('preset', 'custom')),
  preset_avatar_id TEXT,
  custom_image_url TEXT,
  custom_prompt TEXT,
  generation_timestamp TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create avatar_unlocks table
CREATE TABLE IF NOT EXISTS avatar_unlocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_id TEXT NOT NULL,
  unlocked_at TIMESTAMP DEFAULT NOW(),
  unlock_method TEXT DEFAULT 'default',
  UNIQUE(user_id, avatar_id)
);

-- 3. Create custom_avatar_gallery table
CREATE TABLE IF NOT EXISTS custom_avatar_gallery (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  prompt TEXT,
  generation_timestamp TIMESTAMP DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Create indexes
CREATE INDEX IF  NOT EXISTS idx_user_avatars_user_id ON user_avatars(user_id);
CREATE INDEX IF NOT EXISTS idx_user_avatars_active ON user_avatars(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_avatar_unlocks_user_id ON avatar_unlocks(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_gallery_user_id ON custom_avatar_gallery(user_id);

-- 5. Enable RLS
ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_avatar_gallery ENABLE ROW LEVEL SECURITY;

-- 6. Drop existing policies (if any)
DROP POLICY IF EXISTS "Users can view their own avatars" ON user_avatars;
DROP POLICY IF EXISTS "Users can insert their own avatars" ON user_avatars;
DROP POLICY IF EXISTS "Users can update their own avatars" ON user_avatars;
DROP POLICY IF EXISTS "Users can view their own unlocks" ON avatar_unlocks;
DROP POLICY IF EXISTS "Users can insert their own unlocks" ON avatar_unlocks;
DROP POLICY IF EXISTS "Users can view their own custom gallery" ON custom_avatar_gallery;
DROP POLICY IF EXISTS "Users can insert to their own custom gallery" ON custom_avatar_gallery;
DROP POLICY IF EXISTS "Users can update their own custom gallery" ON custom_avatar_gallery;

-- 7. Create RLS Policies
CREATE POLICY "Users can view their own avatars"
  ON user_avatars FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own avatars"
  ON user_avatars FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own avatars"
  ON user_avatars FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own unlocks"
  ON avatar_unlocks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own unlocks"
  ON avatar_unlocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own custom gallery"
  ON custom_avatar_gallery FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert to their own custom gallery"
  ON custom_avatar_gallery FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom gallery"
  ON custom_avatar_gallery FOR UPDATE
  USING (auth.uid() = user_id);

-- 8. Function to set active avatar
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
  -- Deactivate all existing avatars for this user
  UPDATE user_avatars
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;
  
  -- Insert new active avatar
  INSERT INTO user_avatars (
    user_id,
    avatar_type,
    preset_avatar_id,
    custom_image_url,
    custom_prompt,
    generation_timestamp,
    is_active
  ) VALUES (
    p_user_id,
    p_avatar_type,
    p_preset_avatar_id,
    p_custom_image_url,
    p_custom_prompt,
    CASE WHEN p_avatar_type = 'custom' THEN NOW() ELSE NULL END,
    true
  )
  RETURNING id INTO v_avatar_id;
  
  RETURN v_avatar_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Function to unlock FREE avatars
CREATE OR REPLACE FUNCTION unlock_free_avatars(p_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO avatar_unlocks (user_id, avatar_id, unlock_method)
  SELECT 
    p_user_id,
    'free_' || unnest(ARRAY[
      'rockstar', 'chef', 'cyborg', 'detective', 'business', 
      'teacher', 'musician', 'pirate', 'shark', 'penguin',
      'fox', 'owl', 'lion', 'rabbit', 'ninja',
      'knight', 'samurai', 'android', 'shiba', 'wizard',
      'space_commander', 'viking', 'aztec', 'geisha', 'cowboy'
    ]),
    'default'
  ON CONFLICT (user_id, avatar_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Test the setup with current user (optional)
DO $$
DECLARE
  test_user_id UUID;
BEGIN
  -- Get the first user for testing (if any exist)
  SELECT id INTO test_user_id FROM auth.users LIMIT 1;
  
  IF test_user_id IS NOT NULL THEN
    -- Unlock FREE avatars for test user
    PERFORM unlock_free_avatars(test_user_id);
    RAISE NOTICE 'Unlocked FREE avatars for user: %', test_user_id;
  ELSE
    RAISE NOTICE 'No users found - FREE avatars will be unlocked on user signup';
  END IF;
END $$;

-- =====================================================
-- ✅ SETUP COMPLETE!
-- 
-- You should see: "Success. No rows returned"
-- 
-- Next step: Create 'custom-avatars' storage bucket
-- See: /docs/AVATAR_QUICK_SETUP.md
-- =====================================================
