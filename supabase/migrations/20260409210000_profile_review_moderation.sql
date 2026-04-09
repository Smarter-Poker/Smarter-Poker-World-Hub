-- Add Moderation tracking to User Profiles

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS can_review BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS deleted_reviews_count INTEGER DEFAULT 0;
