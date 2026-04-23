-- Migration: Round 4 deep audit fixes
-- 
-- FIX 15: social_interactions UNIQUE(post_id, user_id, interaction_type) blocked
-- second comment_like on same post (error 23505).
-- Example: user likes comment A and comment B on the same reel — the UNIQUE
-- constraint blocked the 2nd insert because both had the same (post_id, user_id, 'comment_like').
-- 
-- Fix: Drop the 3 redundant UNIQUE constraints, replace with targeted partial indexes:
--   - bookmark: partial UNIQUE(post_id, user_id) WHERE interaction_type='bookmark'
--   - comment_like: partial UNIQUE(post_id, user_id, metadata->>'comment_id') WHERE interaction_type='comment_like'
ALTER TABLE social_interactions
  DROP CONSTRAINT IF EXISTS social_interactions_post_user_type_key,
  DROP CONSTRAINT IF EXISTS social_interactions_unique_bookmark,
  DROP CONSTRAINT IF EXISTS social_interactions_user_id_post_id_interaction_type_key;

-- Bookmark: exactly one bookmark per (post, user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_interactions_unique_bookmark
  ON social_interactions(post_id, user_id)
  WHERE interaction_type = 'bookmark';

-- Comment like: exactly one like per (post, user, comment)
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_interactions_unique_comment_like
  ON social_interactions(post_id, user_id, (metadata->>'comment_id'))
  WHERE interaction_type = 'comment_like';
