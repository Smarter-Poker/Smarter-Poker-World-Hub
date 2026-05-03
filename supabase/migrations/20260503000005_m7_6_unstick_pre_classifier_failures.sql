-- ════════════════════════════════════════════════════════════════════════════
-- M7.6: One-shot — promote reels stuck in 'queued' that have no live/completed
-- job to media_status='ready' (iframe-forever).
-- ════════════════════════════════════════════════════════════════════════════
--
-- Deep audit found 8,177 reels with media_status='queued' but only
-- cancelled+failed jobs in video_transcode_jobs. Their URLs failed with
-- error patterns that weren't in the worker's PERMANENT_PATTERNS regex
-- (cookie-auth required, region-blocked, "available to this channel's
-- members", yt-dlp crashes). The worker classified them transient so
-- the iframe-forever broadcast never fired.
--
-- The companion code change in scripts/yt-transcode-worker/index.js
-- expands PERMANENT_PATTERNS to catch these going forward. This SQL
-- handles the existing backlog.
--
-- Effect: M4 gate query (`SELECT COUNT(*) FROM social_reels WHERE
-- video_url ILIKE '%youtube%' AND media_status != 'ready'`) drops to 0.
-- All Reels feed entries now render correctly — converted ones as
-- <video>, unconvertible ones as YouTube iframe.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE social_reels
SET media_status = 'ready'
WHERE source_type='youtube'
  AND media_status='queued'
  AND NOT EXISTS (
    SELECT 1 FROM video_transcode_jobs j
    WHERE j.reel_id=social_reels.id
      AND j.status IN ('queued','processing','completed')
  );
