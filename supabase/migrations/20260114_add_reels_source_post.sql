-- ═══════════════════════════════════════════════════════════════════════════
-- ADD SOURCE_POST_ID COLUMN TO SOCIAL_REELS
-- Links reels that were auto-created from video posts
-- ═══════════════════════════════════════════════════════════════════════════

-- Add source_post_id column to track which post a Reel originated from
ALTER TABLE social_reels 
ADD COLUMN IF NOT EXISTS source_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL;

-- Index for querying reels by source post
CREATE INDEX IF NOT EXISTS idx_reels_source_post ON social_reels(source_post_id) 
WHERE source_post_id IS NOT NULL;

COMMENT ON COLUMN social_reels.source_post_id IS 'Reference to the social post this reel was auto-generated from';
