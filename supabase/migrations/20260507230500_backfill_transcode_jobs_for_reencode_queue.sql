-- ═══════════════════════════════════════════════════════════════════════
-- 20260507230500_backfill_transcode_jobs_for_reencode_queue.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:    3 (DATA migration, ~749 INSERTs into video_transcode_jobs)
-- APPLIED: 2026-05-07 via Supabase MCP (recorded as
--          "backfill_transcode_jobs_for_reencode_queue_v2" in
--          supabase_migrations.schema_migrations)
--
-- WHY:
--   The previous migration (20260507230000_reencode_low_quality_youtube_reels_targeted)
--   set 2,372 reels' media_status='queued' / source_type='youtube' to
--   re-trigger high-quality encoding. The author of the original
--   committed-but-never-applied migration assumed the reels-update
--   trigger would enqueue transcode jobs. It does NOT — the trigger
--   trg_social_reels_yt_queue_job is INSERT-only:
--
--     CREATE TRIGGER trg_social_reels_yt_queue_job
--       AFTER INSERT ON social_reels  -- ← INSERT only, no UPDATE
--       FOR EACH ROW EXECUTE FUNCTION fn_social_reels_yt_queue_job();
--
--   So the 2,372 reels were stuck: media_status='queued' with no
--   corresponding video_transcode_jobs row. The Hetzner worker would
--   never see them.
--
-- HOW:
--   This migration manually INSERTs the missing job rows using the
--   EXACT field set the trigger function would have inserted, including:
--     - reel_id, user_id, source_url, youtube_url
--     - source_type='youtube', status='queued'
--     - target_format='h264_1080p', target_bitrate=2500000
--   DISTINCT ON (video_url) — enqueue ONE job per unique YT URL
--   (multiple reels can share the same YT source). When the worker
--   completes that one job, the trigger dedup gate
--   (status IN ('queued','processing','completed')) blocks future
--   duplicate enqueues for the other reels sharing that URL. Other
--   reels pick up the same completed video_url through the
--   m7_2_mirror_all_video_posts mirroring.
--
-- IDEMPOTENT: skips reels that already have queued/processing/completed
--   jobs for the same youtube_url.
--
-- ROLLBACK (Tier-3):
--   DELETE FROM video_transcode_jobs
--   WHERE status = 'queued' AND source_type = 'youtube'
--     AND created_at >= '<this-migration-apply-time>'
--     AND created_at <  '<this-migration-apply-time + 1 second>';
--   Use the schema_migrations.statements[].executed_at as the bound.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. INSERT missing job rows ───────────────────────────────────────
INSERT INTO video_transcode_jobs (
  reel_id, user_id, source_url, youtube_url, source_type,
  status, target_format, target_bitrate
)
SELECT DISTINCT ON (sr.video_url)
  sr.id, sr.author_id, sr.video_url, sr.video_url, 'youtube',
  'queued', 'h264_1080p', 2500000
FROM social_reels sr
WHERE sr.media_status = 'queued'
  AND sr.source_type = 'youtube'
  AND NOT EXISTS (
    SELECT 1 FROM video_transcode_jobs j
    WHERE j.youtube_url = sr.video_url
      AND j.status IN ('queued','processing','completed')
  )
ORDER BY sr.video_url, sr.created_at DESC;

-- ─── 2. Post-apply telemetry ──────────────────────────────────────────
DO $$
DECLARE
  jobs_queued_now int;
  unique_yt_urls int;
  total_queued_reels int;
BEGIN
  SELECT COUNT(*) INTO jobs_queued_now
  FROM video_transcode_jobs
  WHERE status = 'queued' AND source_type = 'youtube';

  SELECT COUNT(DISTINCT video_url) INTO unique_yt_urls
  FROM social_reels
  WHERE media_status = 'queued' AND source_type = 'youtube';

  SELECT COUNT(*) INTO total_queued_reels
  FROM social_reels
  WHERE media_status = 'queued' AND source_type = 'youtube';

  RAISE NOTICE 'backfill DONE: % YT jobs queued, % unique URLs across % queued reels',
    jobs_queued_now, unique_yt_urls, total_queued_reels;
END
$$;
