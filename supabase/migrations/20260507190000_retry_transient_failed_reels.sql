-- 20260507190000_retry_transient_failed_reels.sql
--
-- AUDIT MIGRATION (already applied 2026-05-07 12:54 UTC via SQL MCP).
-- This file is a permanent audit record — re-running is a no-op because the
-- targeted reels have already been moved out of 'failed' state.
--
-- ── CONTEXT ───────────────────────────────────────────────────────────────
-- 2026-05-07 audit found 117 reels stuck in media_status='failed' whose LATEST
-- transcode_job had a TRANSIENT error (recoverable, not permanent):
--   50 rate-limited
--   31 cookie-auth (cookies-from-browser / cookies for the authentication / Sign in to confirm)
--   24 timeout
--    9 ffmpeg_exit_255 (transient encoder crash)
--    2 yt-dlp_spawn_*  (transient process-spawn error)
--    1 (other transient)
--
-- Both existing self-healers were blind to this state class:
--   - cookieRecoverySweep checks media_status='ready' (iframe-flagged)
--   - orphanedQueuedSweep checks media_status='queued'
--   - 'failed' was an unhandled gap.
--
-- ── ONE-SHOT RECOVERY (this file documents) ───────────────────────────────
-- 60 of the 117 reels qualified for retry: their latest job had a transient
-- error AND they had NO permanent-failure history (no members-only / private /
-- region-blocked / age-restricted / filtered_too_long mixed in).
--
--   Step 1: UPDATE social_reels SET media_status='queued' for those 60.
--   Step 2: INSERT 61 fresh transcode_jobs (one per distinct URL, deduped
--           against any live job).
--
-- ── CODE FIX ──────────────────────────────────────────────────────────────
-- Shipped in commit 599dadcf72 (deployed 2026-05-07 12:55:25 UTC):
--   Added a third self-healer transientFailureRetrySweep() that runs every
--   30 min from the worker poll loop. Same retry logic as this one-shot,
--   but:
--     - Only retries failures older than 1 hour (transient sources had time to recover)
--     - Caps at TRANSIENT_RETRY_CAP=3 to prevent runaway loops
--     - Auto-runs forever; this state class is now self-healing
--
-- After this commit, no other one-shot SQL retries should be needed —
-- transientFailureRetrySweep handles it.

-- ── Step 1: re-queue eligible failed reels (idempotent) ───────────────────
WITH transient_failed AS (
  SELECT DISTINCT sr.id, sr.video_url, sr.author_id
  FROM social_reels sr
  WHERE sr.media_status = 'failed'
    AND sr.source_type = 'youtube'
    AND sr.video_url ILIKE '%youtube%'
    -- Latest job had a transient error
    AND EXISTS (
      SELECT 1 FROM video_transcode_jobs j
      WHERE j.reel_id = sr.id
        AND j.status = 'failed'
        AND (
          j.error_message ILIKE '%cookies-from-browser%'
          OR j.error_message ILIKE '%cookies for the authentication%'
          OR j.error_message ILIKE '%Sign in to confirm%'
          OR j.error_message ILIKE '%rate-limit%'
          OR j.error_message ILIKE '%rate limit%'
          OR j.error_message ILIKE '%timeout%'
          OR j.error_message ILIKE '%ffmpeg_exit_255%'
          OR j.error_message ILIKE '%yt-dlp_spawn%'
          OR j.error_message ILIKE '%Bad Gateway%'
        )
    )
    -- AND no permanent-failure history (those should stay iframe-forever)
    AND NOT EXISTS (
      SELECT 1 FROM video_transcode_jobs j2
      WHERE j2.reel_id = sr.id
        AND j2.status = 'failed'
        AND (
          j2.error_message ILIKE '%members-only%'
          OR j2.error_message ILIKE '%private%'
          OR j2.error_message ILIKE '%age-restricted%'
          OR j2.error_message ILIKE '%not available in your country%'
          OR j2.error_message ILIKE '%filtered_too_long%'
          OR j2.error_message ILIKE '%Video unavailable%'
          OR j2.error_message ILIKE '%removed by the uploader%'
        )
    )
)
UPDATE social_reels SET media_status = 'queued'
WHERE id IN (SELECT id FROM transient_failed);

-- ── Step 2: insert fresh transcode jobs (idempotent via ON CONFLICT) ──────
WITH targets AS (
  SELECT DISTINCT ON (sr.video_url)
    sr.id        AS reel_id,
    sr.author_id AS user_id,
    sr.video_url AS url
  FROM social_reels sr
  WHERE sr.media_status = 'queued'
    AND sr.source_type = 'youtube'
    AND sr.video_url ILIKE '%youtube%'
    AND NOT EXISTS (
      SELECT 1 FROM video_transcode_jobs j
      WHERE j.source_type = 'youtube'
        AND j.youtube_url = sr.video_url
        AND j.status IN ('queued', 'processing')
    )
  ORDER BY sr.video_url, sr.created_at ASC
)
INSERT INTO video_transcode_jobs (
  reel_id, user_id, source_url, youtube_url, source_type,
  status, target_format, target_bitrate
)
SELECT reel_id, user_id, url, url, 'youtube', 'queued', 'h264_1080p', 2500000
FROM targets
ON CONFLICT DO NOTHING;
