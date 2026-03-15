-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: social_interactions FK + UNIQUE constraint
-- 
-- Problem 1: post_id FK to social_posts rejects reel IDs from social_reels
-- Problem 2: UNIQUE(post_id, user_id) blocks multiple reaction types
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Drop FK so reel IDs (from social_reels) can use social_interactions
ALTER TABLE social_interactions DROP CONSTRAINT IF EXISTS social_interactions_post_id_fkey;

-- 2) Drop old UNIQUE and recreate WITH interaction_type
--    so the same user can swap reaction types without collision
ALTER TABLE social_interactions DROP CONSTRAINT IF EXISTS social_interactions_post_id_user_id_key;
ALTER TABLE social_interactions ADD CONSTRAINT social_interactions_post_user_type_key
  UNIQUE (post_id, user_id, interaction_type);

-- 3) Add index for fast lookups by post_id + user_id (without type)
CREATE INDEX IF NOT EXISTS idx_social_interactions_post_user
  ON social_interactions (post_id, user_id);

-- Verification
DO $$
BEGIN
    RAISE NOTICE '✅ social_interactions FK dropped, UNIQUE updated to (post_id, user_id, interaction_type)';
END;
$$;
