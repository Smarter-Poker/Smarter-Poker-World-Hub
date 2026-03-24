-- Add cover_photo_position column to profiles table
-- Stores CSS object-position value (e.g. '50% 30%') for cover photo repositioning
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_photo_position text DEFAULT '50% 50%';
