-- Update the system account to have an avatar_url
-- This fixes the issue where SmarterPokerOfficial posts show default avatar

UPDATE profiles
SET avatar_url = '/smarter-poker-logo.png'
WHERE id = '00000000-0000-0000-0000-000000000001';
