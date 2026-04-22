-- ═══════════════════════════════════════════════════════════════════════════
-- social_reels: add source_type for content provenance tracking
-- ═══════════════════════════════════════════════════════════════════════════
-- Values:
--   'user'          — user-created reel (default, existing)
--   'video_library' — bridged from video_library_videos via Open Claw script
--   'horse'         — posted by a Horse persona (pokernews-videos, etc.)
--   'story'         — promoted from a Story
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE social_reels
    ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'user'
        CHECK (source_type IN ('user', 'video_library', 'horse', 'story'));

-- source_type index for filtered feeds
CREATE INDEX IF NOT EXISTS idx_social_reels_source_type
    ON social_reels (source_type, created_at DESC);

-- Backfill existing rows: pokernews-videos rows have no caption that matches a user pattern,
-- mark them as 'horse' based on the channel pattern
UPDATE social_reels
SET source_type = 'horse'
WHERE source_type = 'user'
  AND created_at < NOW()
  AND id IN (
      SELECT r.id FROM social_reels r
      JOIN profiles p ON p.id = r.author_id
      WHERE p.username ILIKE '%horse%'
         OR p.username ILIKE '%poker_news%'
         OR p.full_name ILIKE '%PokerNews%'
  );

DO $$ BEGIN
    RAISE NOTICE '✅ social_reels source_type column added and indexed';
END $$;
