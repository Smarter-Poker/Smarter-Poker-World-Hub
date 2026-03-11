-- Add training preferences columns to profiles table
-- Migration: 20260129_training_preferences_extension
-- ═══════════════════════════════════════════════════════════════════════════

-- Add auto-advance and hints columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS training_auto_advance BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS training_hints_enabled BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN profiles.training_auto_advance IS 'Auto-advance to next question after answering';
COMMENT ON COLUMN profiles.training_hints_enabled IS 'Show hints during training questions';
