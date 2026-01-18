-- Add card_back_preference column to profiles table
-- This stores the user's preferred card back design (white, black, red, or blue)
-- Used across Training Games, Club Arena, and Diamond Arena

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS card_back_preference TEXT DEFAULT 'white' CHECK (card_back_preference IN ('white', 'black', 'red', 'blue'));

COMMENT ON COLUMN profiles.card_back_preference IS 'User preferred card back design: white, black, red, or blue';
