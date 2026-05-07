-- ═══════════════════════════════════════════════════════════════════════
-- 20260507230000_reencode_low_quality_youtube_reels_targeted.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:    3 (DATA migration, ~2,372 row UPDATE + completed-job DELETEs)
-- APPLIED: 2026-05-07 via Supabase MCP (recorded as
--          "reencode_low_quality_youtube_reels_targeted" in
--          supabase_migrations.schema_migrations)
--
-- SUPERSEDES: 20260506000000_reencode_low_quality_reels.sql
--   That earlier file was committed in 66619c59c9 but never applied
--   because its pre-flight assertion fired on 21 native user-uploaded
--   reels that legitimately lack original_youtube_url. Those rows are
--   USER posts, never YT-sourced, and were never the intended target.
--
-- WHY:
--   2,372 native MP4 reels were converted with the OLD low-quality
--   worker pipeline (preset=fast/crf=23/profile=main → ~1 Mbps for
--   1080p vertical, well below TikTok/IG baseline of 4-6 Mbps).
--   The new worker (commit 47bc765a83 onward) does lossless stream-
--   copy when source is avc1+aac, falling back to preset=slow/crf=18/
--   profile=high/level=4.1/192k AAC for VP9/AV1 sources.
--
-- HOW:
--   1. DELETE the OLD 'completed' video_transcode_jobs rows for the
--      target YT URLs so the dedup trigger doesn't block re-queue.
--   2. UPDATE the target reels: revert video_url back to
--      original_youtube_url, source_type='youtube', media_status='queued',
--      thumbnail_url=NULL.
--   3. ⚠️ Note: the trigger trg_social_reels_yt_queue_job is INSERT-only,
--      so the UPDATEs do NOT enqueue transcode jobs. A follow-up
--      migration (20260507230500_backfill_transcode_jobs_for_reencode_queue.sql)
--      manually inserts the missing job rows. That migration MUST run
--      after this one.
--
-- TARGET FILTER:
--   The original migration scoped by:
--     media_status='ready' AND video_url ILIKE '%supabase.co/storage%'
--   This included 21 USER-uploaded reels (source_type='user',
--   youtube_video_id=NULL) which were never the target. Pre-flight
--   asserted "missing_origurl=0" globally and aborted on those 21.
--   THIS VERSION scopes the assertion + UPDATE to original_youtube_url
--   IS NOT NULL — i.e., genuinely YT-sourced reels only. The 21 native
--   uploads are untouched.
--
-- IDEMPOTENT: WHERE clause excludes already-queued reels.
-- ROLLBACK: see commented section at bottom; manual snapshot restore.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Pre-flight observation (informational, no abort) ──────────────────
DO $$
DECLARE
  yt_candidates int;
  native_uploads int;
BEGIN
  SELECT COUNT(*) INTO yt_candidates
  FROM social_reels
  WHERE media_status = 'ready'
    AND video_url ILIKE '%supabase.co/storage%'
    AND original_youtube_url IS NOT NULL;

  SELECT COUNT(*) INTO native_uploads
  FROM social_reels
  WHERE media_status = 'ready'
    AND video_url ILIKE '%supabase.co/storage%'
    AND original_youtube_url IS NULL;

  RAISE NOTICE 'reencode_low_quality_youtube_reels: % YT-sourced candidates queued, % native uploads ignored (correctly)',
    yt_candidates, native_uploads;
END
$$;

-- ─── 1. Drop old completed jobs that would block re-queue dedup ────────
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

-- ─── 2. Reset reels: native → queued for re-conversion ────────────────
UPDATE social_reels
SET
  video_url     = original_youtube_url,
  source_type   = 'youtube',
  media_status  = 'queued',
  thumbnail_url = NULL
WHERE media_status = 'ready'
  AND video_url ILIKE '%supabase.co/storage%'
  AND original_youtube_url IS NOT NULL;

-- ─── 3. Post-apply assertion ──────────────────────────────────────────
DO $$
DECLARE
  queued_now int;
  jobs_pending int;
  native_untouched int;
BEGIN
  SELECT COUNT(*) INTO queued_now
  FROM social_reels WHERE media_status = 'queued';

  SELECT COUNT(*) INTO jobs_pending
  FROM video_transcode_jobs
  WHERE status = 'queued' AND source_type = 'youtube';

  SELECT COUNT(*) INTO native_untouched
  FROM social_reels
  WHERE media_status = 'ready'
    AND video_url ILIKE '%supabase.co/storage%'
    AND original_youtube_url IS NULL;

  RAISE NOTICE 'reencode_low_quality_youtube_reels DONE: % reels queued, % jobs pending, % native uploads correctly untouched',
    queued_now, jobs_pending, native_untouched;
END
$$;

-- ─── ROLLBACK (Tier-3 destructive — manual restore needed) ─────────────
-- This migration deletes completed job rows. There is no automated rollback;
-- the OLD low-quality MP4s are still in storage (just orphaned) so playback
-- continues to work as iframe until the worker re-converts. If a hard rollback
-- is required:
--   UPDATE social_reels
--   SET video_url = '<old_supabase_url>', source_type='native', media_status='ready'
--   WHERE id = '<reel_id>';
-- Source the old URLs from a pre-migration snapshot of social_reels.
