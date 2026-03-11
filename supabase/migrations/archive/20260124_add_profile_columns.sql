-- Migration: Add missing profile columns for Facebook-style profile page
-- Run this in Supabase SQL Editor

-- Add hometown column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hometown TEXT;

-- Add cover photo URL column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

-- Add occupation column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS occupation TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.hometown IS 'User''s hometown for Facebook-style profile display';
COMMENT ON COLUMN profiles.cover_photo_url IS 'Cover photo URL for profile header';
COMMENT ON COLUMN profiles.occupation IS 'User''s job title or profession';

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('hometown', 'cover_photo_url', 'occupation');
