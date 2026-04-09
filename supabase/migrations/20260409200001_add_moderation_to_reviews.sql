-- Add moderation columns to venue_reviews
ALTER TABLE venue_reviews 
ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS flag_reason TEXT DEFAULT NULL;

-- Also add helpful_count / unhelpful_count if they don't exist (just to be safe)
ALTER TABLE venue_reviews
ADD COLUMN IF NOT EXISTS helpful_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS unhelpful_count INTEGER DEFAULT 0;
