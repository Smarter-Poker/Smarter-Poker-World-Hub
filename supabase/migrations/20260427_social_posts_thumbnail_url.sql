-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Add thumbnail_url to social_posts
-- Allows video posts to store a user-selected cover frame URL.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN social_posts.thumbnail_url IS
  'Optional cover/thumbnail image URL for video posts. Set by user at post time.';
