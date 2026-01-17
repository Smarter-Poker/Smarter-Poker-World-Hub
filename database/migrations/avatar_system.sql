-- =====================================================
-- AVATAR ENGINE DATABASE SCHEMA
-- Supports preset library + custom AI-generated avatars
-- =====================================================

-- User Avatar Selection & Custom Avatars
CREATE TABLE IF NOT EXISTS user_avatars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_type TEXT NOT NULL CHECK (avatar_type IN ('preset', 'custom')),
  
  -- For preset avatars (from library)
  preset_avatar_id TEXT, -- e.g., 'free_rockstar', 'vip_dragon'
  
  -- For custom avatars (AI generated)
  custom_image_url TEXT,
  custom_prompt TEXT,
  generation_timestamp TIMESTAMP,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT active_avatar_unique UNIQUE(user_id, is_active)
);

-- Track avatar unlocks (VIP avatars require unlock)
CREATE TABLE IF NOT EXISTS avatar_unlocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_id TEXT NOT NULL,
  unlocked_at TIMESTAMP DEFAULT NOW(),
  unlock_method TEXT DEFAULT 'default', -- 'vip_purchase', 'achievement', 'event', 'default'
  
  UNIQUE(user_id, avatar_id)
);

-- Custom avatar gallery (users can save multiple custom avatars)
CREATE TABLE IF NOT EXISTS custom_avatar_gallery (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  prompt TEXT,
  generation_timestamp TIMESTAMP DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_avatars_user_id ON user_avatars(user_id);
CREATE INDEX IF NOT EXISTS idx_user_avatars_active ON user_avatars(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_avatar_unlocks_user_id ON avatar_unlocks(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_gallery_user_id ON custom_avatar_gallery(user_id);

-- Row Level Security (RLS)
ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_avatar_gallery ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

-- Function to set active avatar (ensures only one active at a time)
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

-- Function to unlock all FREE avatars for a user
CREATE OR REPLACE FUNCTION unlock_free_avatars(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- This will be called when a user first signs up
  -- Unlocks all 25 FREE avatars from AVATAR_LIBRARY
  INSERT INTO avatar_unlocks (user_id, avatar_id, unlock_method)
  SELECT 
    p_user_id,
    'free_' || unnest(ARRAY[
      'rockstar', 'chef', 'cyborg', 'detective', 'business', 
      'teacher', 'musician', 'pirate', 'shark', 'penguin',
      'fox', 'owl', 'lion', 'rabbit', 'ninja',
      'knight', 'samurai', 'android', 'shiba', 'wizard',
      'space_captain', 'viking', 'aztec', 'geisha', 'cowboy'
    ]),
    'default'
  ON CONFLICT (user_id, avatar_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to unlock FREE avatars on user creation
CREATE OR REPLACE FUNCTION trigger_unlock_free_avatars()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM unlock_free_avatars(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger needs to be attached to auth.users which requires admin access
-- Run this manually in Supabase SQL editor:
-- CREATE TRIGGER on_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION trigger_unlock_free_avatars();
