-- Migration: Add link metadata columns to social_posts
-- This enables proper storage of article/link preview data

-- Add columns for link metadata (all nullable to support existing posts)
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_title TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_description TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_image TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS link_site_name TEXT;

-- Add index for faster queries on link posts
CREATE INDEX IF NOT EXISTS idx_social_posts_link_url ON social_posts(link_url) WHERE link_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN social_posts.link_url IS 'The actual article/link URL for link-type posts';
COMMENT ON COLUMN social_posts.link_title IS 'Pre-fetched OpenGraph title for the link';
COMMENT ON COLUMN social_posts.link_description IS 'Pre-fetched OpenGraph description for the link';
COMMENT ON COLUMN social_posts.link_image IS 'Pre-fetched OpenGraph image URL for the link';
COMMENT ON COLUMN social_posts.link_site_name IS 'Pre-fetched site name (e.g., "PokerNews")';
