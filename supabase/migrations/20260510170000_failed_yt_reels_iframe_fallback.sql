-- 20260510170000_failed_yt_reels_iframe_fallback.sql
--
-- Bulk-flip public YouTube reels stuck in media_status='failed' or 'queued'
-- (with no live job) to media_status='ready' so the iframe fallback path
-- renders. Counterpart to the new failedReelFallbackSweep in
-- scripts/yt-transcode-worker/index.js (eighth self-healer).
--
-- Background: when transient retries cap out (TRANSIENT_RETRY_CAP=3), the
-- worker leaves reels in 'failed'. The frontend renders nothing for non-ready
-- rows, so users see broken feed entries even though YouTube iframe playback
-- would work fine. This migration applies the same logic as the new sweep
-- one-shot for the existing backlog.
--
-- Idempotent: re-running flips zero rows once converged.

-- 1. Failed-state public YT reels with valid YT URL → ready+iframe
UPDATE social_reels
SET
  media_status = 'ready',
  video_url = COALESCE(original_youtube_url, video_url)
WHERE
  is_public = true
  AND media_status = 'failed'
  AND source_type = 'youtube'
  AND COALESCE(original_youtube_url, video_url) ~* 'youtube\.com|youtu\.be';

-- 2. Queued-orphan public YT reels (no live job) with valid YT URL → ready+iframe
UPDATE social_reels
SET
  media_status = 'ready',
  video_url = COALESCE(original_youtube_url, video_url)
WHERE
  is_public = true
  AND media_status = 'queued'
  AND source_type = 'youtube'
  AND COALESCE(original_youtube_url, video_url) ~* 'youtube\.com|youtu\.be'
  AND NOT EXISTS (
    SELECT 1 FROM video_transcode_jobs j
    WHERE j.reel_id = social_reels.id AND j.status IN ('queued', 'processing')
  );

-- 3. Sanity check: no public YT reels left outside 'ready' state.
DO $$
DECLARE
  bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM social_reels
  WHERE is_public = true
    AND source_type = 'youtube'
    AND media_status NOT IN ('ready');
  IF bad_count > 0 THEN
    RAISE NOTICE 'Migration informational: % public YT reels still outside ready (likely have live jobs in flight)', bad_count;
  END IF;
END $$;
