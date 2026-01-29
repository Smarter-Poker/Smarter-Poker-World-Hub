-- Add training preferences to profiles table
-- ═══════════════════════════════════════════════════════════════════════════

-- Add training view mode (standard = beginner-friendly, pro = advanced terminology)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS training_view_mode TEXT DEFAULT 'standard' 
CHECK (training_view_mode IN ('standard', 'pro'));

-- Add sound effects preference
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS training_sound_enabled BOOLEAN DEFAULT true;

-- Add timer preference
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS training_timer_enabled BOOLEAN DEFAULT true;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_training_view_mode 
ON profiles(training_view_mode);

-- Comment for documentation
COMMENT ON COLUMN profiles.training_view_mode IS 'Display mode for training questions: standard (beginner-friendly) or pro (advanced terminology)';
COMMENT ON COLUMN profiles.training_sound_enabled IS 'Enable/disable sound effects in training games';
COMMENT ON COLUMN profiles.training_timer_enabled IS 'Enable/disable timer in training games';
