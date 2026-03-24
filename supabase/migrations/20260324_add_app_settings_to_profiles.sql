-- Add app_settings JSONB column to profiles table
-- Stores all user preferences (notifications, privacy, appearance, gameplay, display/sound)
-- Previously these were localStorage-only and would be lost on device/browser changes
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_settings JSONB DEFAULT '{}';

-- Add a comment for documentation
COMMENT ON COLUMN profiles.app_settings IS 'User app settings (notifications, privacy, appearance, gameplay, display/sound). All settings save here for cross-device persistence.';
