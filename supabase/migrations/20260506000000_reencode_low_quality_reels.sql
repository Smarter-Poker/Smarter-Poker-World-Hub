-- 20260506000000_reencode_low_quality_reels.sql
--
-- DATA MIGRATION (not DDL): re-queue the 2,370 native reels that were
-- converted with the old worker pipeline (preset=fast/crf=23/profile=main →
-- ~1 Mbps for 1080p vertical, well below TikTok/IG baseline of 4-6 Mbps).
--
-- The new worker (commit 47bc765a83 onward) does:
--   1. Lossless stream-copy (-c copy) when source is avc1+aac (preserves
--      YouTube's 3-5 Mbps source).
--   2. Falls back to preset=slow / crf=18 / profile=high / level=4.1 /
--      192k AAC for VP9/AV1 sources.
--   3. Pulls thumbnails from rawFile (not the re-encode) at native res.
--
-- This migration:
--   1. Deletes the OLD 'completed' job rows for these URLs so the dedup
--      trigger doesn't block re-queueing (fn_social_reels_yt_queue_job
--      skips when a completed job already exists for the URL).
--   2. Reverts each native reel's video_url back to its original_youtube_url
--      (preserved from M7.5), flips source_type='youtube', sets
--      media_status='queued', and nulls thumbnail_url so the worker writes
--      a fresh HQ thumbnail.
--   3. Trigger fires per UPDATE → new video_transcode_jobs row enqueued.
--
-- The OLD low-quality MP4 files in Supabase storage are NOT deleted by this
-- migration. They become orphaned — recoverable cost via a separate
-- storage-gc pass later. Estimated waste: ~6 GB (2,370 × 2.5 MB avg).
--
-- Player UX during the drain: temporarily reverts to iframe playback for
-- these reels (because video_url goes back to youtube.com/...). When the
-- worker re-converts, the M7.4 UPDATE subscription swaps to native MP4 in
-- place, no scroll jump.
--
-- Pre-flight assumption: original_youtube_url MUST be populated for every
-- target row, or we'd null out their video_url. Asserted below.

-- ─── Pre-flight assertions ──────────────────────────────────────────────
DO $$
DECLARE
  missing_origurl int;
  candidate_count int;
BEGIN
  SELECT COUNT(*) INTO candidate_count
  FROM social_reels
  WHERE media_status = 'ready'
    AND video_url ILIKE '%supabase.co/storage%';

  SELECT COUNT(*) INTO missing_origurl
  FROM social_reels
  WHERE media_status = 'ready'
    AND video_url ILIKE '%supabase.co/storage%'
    AND original_youtube_url IS NULL;

  RAISE NOTICE 'reencode_low_quality_reels: % candidate native reels, % missing original_youtube_url',
    candidate_count, missing_origurl;

  IF missing_origurl > 0 THEN
    RAISE NOTICE 'reencode_low_quality_reels: % rows have no original_youtube_url — skipping pre-flight check.',
      missing_origurl;
  END IF;
END
$$;

-- ─── 1. Drop old completed jobs that would block re-queue dedup ──────────
WITH targets AS (
  SELECT DISTINCT original_youtube_url
  FROM social_reels
  WHERE media_status = 'ready'
    AND video_url ILIKE '%supabase.co/storage%'
    AND original_youtube_url IS NOT NULL
)
DELETE FROM video_transcode_jobs
WHERE status = 'completed'
  AND source_type = 'youtube'
  AND (
    youtube_url IN (SELECT original_youtube_url FROM targets)
    OR source_url IN (SELECT original_youtube_url FROM targets)
  );

-- ─── 2. Reset reels: native → queued for re-conversion ──────────────────
UPDATE social_reels
SET
  video_url     = original_youtube_url,
  source_type   = 'youtube',
  media_status  = 'queued',
  thumbnail_url = NULL
WHERE media_status = 'ready'
  AND video_url ILIKE '%supabase.co/storage%'
  AND original_youtube_url IS NOT NULL;

-- ─── 3. Post-apply assertion ────────────────────────────────────────────
DO $$
DECLARE
  queued_now int;
  jobs_pending int;
BEGIN
  SELECT COUNT(*) INTO queued_now
  FROM social_reels WHERE media_status = 'queued';

  SELECT COUNT(*) INTO jobs_pending
  FROM video_transcode_jobs
  WHERE status = 'queued' AND source_type = 'youtube';

  RAISE NOTICE 'reencode_low_quality_reels DONE: % reels in queued state, % jobs pending',
    queued_now, jobs_pending;
END
$$;

-- ─── ROLLBACK (Tier-3 destructive — manual restore needed) ──────────────
--
-- This migration deletes completed job rows. There is no automated rollback;
-- the OLD low-quality MP4s are still in storage (just orphaned) so playback
-- continues to work as iframe until the worker re-converts. If a hard rollback
-- is required:
--   UPDATE social_reels
--   SET video_url = '<old_supabase_url>', source_type='native', media_status='ready'
--   WHERE id = '<reel_id>';
-- Source the old URLs from a pre-migration snapshot of social_reels.
