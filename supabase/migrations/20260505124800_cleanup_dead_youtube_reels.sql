-- ════════════════════════════════════════════════════════════════════
-- Migration: cleanup_dead_youtube_reels
-- Date: 2026-05-05
-- Purpose:
--   1. Re-queue video_transcode_jobs that failed due to temporary
--      cookie expiry or IP rate-limiting (recoverable failures).
--   2. Soft-delete social_reels whose source YouTube video is
--      permanently unavailable (private/geo-blocked/deleted) so they
--      never render broken iframes in the user feed.
-- ════════════════════════════════════════════════════════════════════

-- ─── STEP 1: Re-queue recoverable false-positive failures ───────────
-- These jobs failed because cookies expired mid-flight or the datacenter
-- IP was temporarily rate-limited by YouTube. They should be retried.
WITH recoverable AS (
  SELECT DISTINCT ON (youtube_url)
    id
  FROM video_transcode_jobs
  WHERE source_type  = 'youtube'
    AND status       = 'failed'
    AND (
      error_message ILIKE '%rate-limited%'
      OR error_message ILIKE '%cookies%'
    )
  ORDER BY youtube_url, created_at DESC  -- pick most recent job per URL
)
UPDATE video_transcode_jobs vtj
SET
  status      = 'queued',
  worker_id   = NULL,
  started_at  = NULL,
  completed_at = NULL,
  error_message = 'requeued: was recoverable (rate-limit / cookie expiry)'
FROM recoverable r
WHERE vtj.id = r.id
  -- Don't re-queue if a healthy job for the same URL already exists
  AND NOT EXISTS (
    SELECT 1
    FROM video_transcode_jobs vtj2
    WHERE vtj2.youtube_url = vtj.youtube_url
      AND vtj2.status IN ('queued', 'processing', 'completed')
  );

-- ─── STEP 2: Soft-delete permanently dead reels from the social feed ─
-- Videos that are private, geo-restricted, or deleted can never be
-- transcoded. Mark them failed + private so the frontend skips them.
-- Uses the media_status CHECK constraint: only 'ready','queued','processing','failed'
UPDATE social_reels sr
SET
  media_status = 'failed',
  is_public    = false,
  updated_at   = NOW()
FROM video_transcode_jobs vtj
WHERE
  -- Match on the original YouTube URL stored when the reel was created
  sr.original_youtube_url = vtj.youtube_url
  AND vtj.source_type = 'youtube'
  AND vtj.status      = 'failed'
  AND (
    vtj.error_message ILIKE '%Private%'
    OR vtj.error_message ILIKE '%unavailable%'
    OR vtj.error_message ILIKE '%members only%'
    OR vtj.error_message ILIKE '%copyright%'
    OR vtj.error_message ILIKE '%geo%'
    OR vtj.error_message ILIKE '%not available%'
  )
  -- Idempotent: skip rows already marked correctly
  AND NOT (sr.media_status = 'failed' AND sr.is_public = false);

-- ─── STEP 3: Final queue health check (informational) ───────────────
SELECT
  status,
  COUNT(*) AS job_count
FROM video_transcode_jobs
WHERE source_type = 'youtube'
GROUP BY status
ORDER BY job_count DESC;
