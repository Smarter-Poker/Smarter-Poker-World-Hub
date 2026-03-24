-- Profile social/contact & birthday fields
-- Adds tiktok, telegram, birthday columns to profiles

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tiktok TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday DATE;
