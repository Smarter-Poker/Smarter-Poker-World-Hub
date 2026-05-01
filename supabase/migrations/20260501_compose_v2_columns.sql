-- ============================================================================
-- Compose V2 — Multi-screen FB-style upload flow
-- 2026-05-01
--
-- Adds columns to social_posts to support the new picker → edit → cover flow:
--   • cover_frames        — array of 8 evenly-spaced frame URLs extracted by
--                           the transcode-videos cron worker after upload
--   • cover_frame_index   — user's chosen frame index (0..7) selected on the
--                           "Edit cover" screen BEFORE the cron has extracted
--                           anything; cron uses this to pick which frame
--                           becomes thumbnail_url
--   • ai_label            — author's self-disclosure that content is AI-generated
--   • audience_mode       — public | friends | friends_except | specific |
--                           only_me | custom (extends the existing
--                           visibility column without breaking anything)
--   • audience_list       — user IDs for friends_except (excluded) or
--                           specific (included) modes
--   • share_to_story      — author chose to also publish as a story
--   • metadata_location   — { name, lat, lng, place_id } for inline location tag
--                           (separate from the check-in flow which posts to a
--                           venue; this is a tag on the post itself)
--   • topics              — array of topic slugs (Club Page topics or global)
--
-- All columns are nullable / default-safe so existing posts keep rendering.
-- No data backfill needed — the new compose flow populates them on new posts.
-- ============================================================================

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS cover_frames TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cover_frame_index INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_label BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS audience_mode TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS audience_list TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS share_to_story BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS metadata_location JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS topics TEXT[] DEFAULT NULL;

-- Constraints + indexes
ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_audience_mode_chk
    CHECK (
      audience_mode IS NULL
      OR audience_mode IN ('public', 'friends', 'friends_except', 'specific', 'only_me', 'custom')
    ) NOT VALID;
-- NOT VALID so existing rows are not retroactively checked; new inserts are.

CREATE INDEX IF NOT EXISTS idx_social_posts_audience_mode
  ON social_posts(audience_mode)
  WHERE audience_mode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_topics_gin
  ON social_posts USING gin(topics)
  WHERE topics IS NOT NULL;

-- Comment annotations for future agents reading the schema
COMMENT ON COLUMN social_posts.cover_frames IS
  '8 evenly-spaced frame URLs extracted by transcode cron after upload';
COMMENT ON COLUMN social_posts.cover_frame_index IS
  'User-selected frame index (0..7) — cron uses this to pick thumbnail_url';
COMMENT ON COLUMN social_posts.ai_label IS
  'Author-disclosed: content is AI-generated';
COMMENT ON COLUMN social_posts.audience_mode IS
  'Extends visibility: public|friends|friends_except|specific|only_me|custom';
COMMENT ON COLUMN social_posts.audience_list IS
  'User IDs for friends_except (excluded) / specific (included)';
COMMENT ON COLUMN social_posts.share_to_story IS
  'Author chose to also publish as a 24h story';
COMMENT ON COLUMN social_posts.metadata_location IS
  '{name, lat, lng, place_id} location tag on the post';
COMMENT ON COLUMN social_posts.topics IS
  'Topic slugs (Club Page topics or global)';
