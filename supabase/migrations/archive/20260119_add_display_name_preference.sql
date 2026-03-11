-- ═══════════════════════════════════════════════════════════════════════════
-- ADD DISPLAY NAME PREFERENCE TO PROFILES
-- Allows users to choose between full name or username for social media display
-- ═══════════════════════════════════════════════════════════════════════════

-- Add display_name_preference column with default 'full_name'
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS display_name_preference TEXT DEFAULT 'full_name' 
CHECK (display_name_preference IN ('full_name', 'username'));

-- Add comment for documentation
COMMENT ON COLUMN profiles.display_name_preference IS 'User preference for how their name appears in social media: full_name (default) or username';

-- Update existing users to have the default preference
UPDATE public.profiles 
SET display_name_preference = 'full_name' 
WHERE display_name_preference IS NULL;
