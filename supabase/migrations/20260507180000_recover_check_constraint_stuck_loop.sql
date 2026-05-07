-- 20260507180000_recover_check_constraint_stuck_loop.sql
--
-- AUDIT MIGRATION (already applied 2026-05-07 12:18 + 12:23 UTC via SQL MCP).
-- This file is a permanent audit record — re-running is a no-op because the
-- WHERE filters no longer match (the rows in question have been moved out of
-- 'processing' state).
--
-- ── CONTEXT ───────────────────────────────────────────────────────────────
-- 2026-05-07 incident: the YouTube transcode worker accumulated 217 jobs in
-- 'processing' state with zero forward progress for 2+ hours.
--
-- ROOT CAUSE: a CHECK-constraint bug in the worker code. When yt-dlp's
-- --match-filter rejected a video as too long (>10min) or too large (>400MB),
-- the worker called:
--
--   await supa.from('video_transcode_jobs').update({
--     status: 'skipped',
--     completed_at: new Date().toISOString(),
--     error_message: 'filtered: video exceeds duration or size limit',
--   }).eq('id', job.id);
--   return;
--
-- The video_transcode_jobs.status CHECK constraint allows ONLY:
--   ('queued', 'processing', 'running', 'completed', 'done', 'failed', 'cancelled')
--
-- 'skipped' violates the constraint. The UPDATE silently failed (supabase-js
-- returns the error in the result object but the worker didn't check),
-- the worker returned, the row stayed in 'processing' state. After 10 min
-- resetStaleProcessing flipped it back to 'queued', the worker re-claimed
-- and re-skipped it — infinite loop. After 2 hours, 217 unique jobs were
-- locked in this loop.
--
-- ── CODE FIX ──────────────────────────────────────────────────────────────
-- Shipped in commit e3f97e7085 (deployed 2026-05-07 12:20:18 UTC):
--   Replaced the silent UPDATE with `throw new Error('filtered_too_long_or_large: ...')`
--   so the existing catch block handles it correctly:
--     - Sets status='failed' (allowed by CHECK constraint)
--     - Sets reel media_status='ready' (iframe-forever)
--     - Broadcasts iframe-forever to all sibling reels with the same URL
--   Added /filtered_too_long_or_large/i to PERMANENT_PATTERNS.
--
-- ── DATA RECOVERY (this file documents) ───────────────────────────────────
-- The 217 already-stuck jobs needed cleanup. The worker can't terminal them
-- (CHECK still rejects 'skipped'), so we did it via SQL:
--
--   1. Set status='failed' with the new permanent-pattern error_message
--   2. Flip associated reels to media_status='ready' (iframe-forever)
--      so they don't sit in 'queued' or 'failed' indefinitely
--
-- Two waves: 104 jobs at 12:18 UTC (the original cohort), 113 more at
-- 12:23 UTC (claimed by old worker between cleanup and restart).

-- ── Step 1: clear stuck processing rows (idempotent: filters no longer match) ──
WITH cleared AS (
  UPDATE video_transcode_jobs
  SET status = 'failed',
      completed_at = COALESCE(completed_at, now()),
      error_message = CASE
        WHEN error_message ILIKE '%filtered_too_long_or_large%' THEN error_message
        ELSE 'filtered_too_long_or_large: cleared by SQL (CHECK constraint blocked status=skipped from worker, see code fix in commit e3f97e7085)'
      END
  WHERE status = 'processing'
    AND source_type = 'youtube'
    AND started_at < '2026-05-07 12:23:00+00'   -- bounds: only the pre-restart cohort
    AND error_message IS NULL                    -- bounds: never had a real failure recorded
  RETURNING id
)
SELECT COUNT(*) AS jobs_cleared_by_this_migration FROM cleared;

-- ── Step 2: flip affected reels to iframe-forever (idempotent) ────────────
WITH affected_reels AS (
  SELECT DISTINCT sr.id
  FROM social_reels sr
  WHERE sr.media_status IN ('queued', 'processing', 'failed')
    AND sr.source_type = 'youtube'
    AND sr.video_url ILIKE '%youtube%'
    AND sr.original_youtube_url IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM video_transcode_jobs j
      WHERE (j.youtube_url = sr.original_youtube_url OR j.source_url = sr.original_youtube_url)
        AND j.status = 'failed'
        AND j.error_message ILIKE '%filtered_too_long_or_large%'
    )
)
UPDATE social_reels SET media_status = 'ready'
WHERE id IN (SELECT id FROM affected_reels)
  AND media_status <> 'ready';   -- only update rows that haven't been moved already
