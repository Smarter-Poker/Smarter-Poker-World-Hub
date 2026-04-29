-- ============================================================================
-- Video Transcode Tracking
-- 2026-04-30
--
-- Adds columns to social_posts to track server-side HEVC → H.264 transcoding.
-- iPhone-recorded videos are HEVC/H.265 in .mov containers which only play in
-- Safari. Chrome and Firefox desktop show a black box. This migration supports
-- a Hetzner-based transcode worker that polls for queued videos, runs ffmpeg,
-- and replaces the media URL with a universally-playable H.264 MP4.
-- ============================================================================

-- 1. Add tracking columns
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS transcode_status TEXT DEFAULT NULL,       -- NULL | 'queued' | 'running' | 'done' | 'failed'
  ADD COLUMN IF NOT EXISTS original_media_url TEXT DEFAULT NULL,     -- preserved pre-transcode URL for rollback
  ADD COLUMN IF NOT EXISTS transcode_error TEXT DEFAULT NULL;        -- error message on failure

-- 2. Backfill: mark all existing video posts whose primary URL ends in .mov/.hevc/.heic as queued
UPDATE social_posts
SET transcode_status = 'queued',
    original_media_url = media_urls->>0
WHERE content_type = 'video'
  AND transcode_status IS NULL
  AND (
    (media_urls->>0) ILIKE '%.mov'
    OR (media_urls->>0) ILIKE '%.hevc'
    OR (media_urls->>0) ILIKE '%.heic'
  );

-- 3. Partial index for the worker's poll query (only rows that need processing)
CREATE INDEX IF NOT EXISTS idx_social_posts_transcode_queued
  ON social_posts(transcode_status, created_at DESC)
  WHERE transcode_status IN ('queued', 'running');

-- 4. Trigger: auto-queue new video uploads for transcoding
CREATE OR REPLACE FUNCTION fn_queue_video_transcode() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.content_type = 'video'
     AND (NEW.media_urls->>0) IS NOT NULL
     AND (
       (NEW.media_urls->>0) ILIKE '%.mov'
       OR (NEW.media_urls->>0) ILIKE '%.hevc'
       OR (NEW.media_urls->>0) ILIKE '%.heic'
       OR (NEW.media_urls->>0) ILIKE '%.mkv'
       OR (NEW.media_urls->>0) ILIKE '%.avi'
     )
  THEN
    NEW.transcode_status := 'queued';
    NEW.original_media_url := (NEW.media_urls->>0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_queue_video_transcode ON social_posts;
CREATE TRIGGER tr_queue_video_transcode
  BEFORE INSERT ON social_posts
  FOR EACH ROW EXECUTE FUNCTION fn_queue_video_transcode();
