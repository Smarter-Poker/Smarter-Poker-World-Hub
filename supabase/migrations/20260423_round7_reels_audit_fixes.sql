-- Migration: Round 7 deep audit fixes

-- FIX 28: saved_reels.reel_id FK to social_reels was a regression from Round 5.
-- Post-sourced reels (from social_posts, used as reels in the feed) have
-- social_posts UUIDs as their id, not social_reels UUIDs.
-- The FK rejected any attempt to save these, breaking 'Save' for 1/3 of feed content.
-- Fix: DROP the FK, ADD source_type column to track which table reel_id references.
ALTER TABLE saved_reels DROP CONSTRAINT IF EXISTS fk_saved_reels_reel_id;
ALTER TABLE saved_reels
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'reel'
  CHECK (source_type IN ('reel', 'post'));

-- FIX 32: Reports had no UNIQUE constraint — same user could report the same
-- reel repeatedly, spamming the social_interactions table. Adding a partial
-- UNIQUE index: exactly one report per (post, user).
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_interactions_unique_report
  ON social_interactions(post_id, user_id)
  WHERE interaction_type = 'report';

-- Verify all partial unique indexes on social_interactions
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='social_interactions'
  AND indexname LIKE 'idx_social_interactions_unique%'
ORDER BY indexname;
