-- ════════════════════════════════════════════════════════════════════════════
-- M7.3: Close the dedup-race window in fn_social_reels_yt_queue_job.
-- ════════════════════════════════════════════════════════════════════════════
-- The IF EXISTS check inside the trigger function runs at READ-COMMITTED
-- isolation. Two concurrent INSERTs into social_reels with the same YouTube
-- URL can both pass the EXISTS check (each in its own snapshot) and both
-- INSERT a job. Pre-fix, production had 6 video_urls with duplicate live
-- jobs from this race.
--
-- Fix: enforce uniqueness at the DB level via a partial unique index on
-- (youtube_url) WHERE live states. Wrap the trigger's INSERT in an
-- EXCEPTION handler so the unique-violation from the race loser doesn't
-- roll back the parent social_reels INSERT.
-- ════════════════════════════════════════════════════════════════════════════

-- Cancel any remaining live duplicates before adding the index
WITH ranked AS (
  SELECT j.id AS job_id,
         ROW_NUMBER() OVER (PARTITION BY j.youtube_url ORDER BY j.created_at, j.id) AS rn
  FROM video_transcode_jobs j
  WHERE j.source_type='youtube' AND j.status IN ('queued','processing')
)
UPDATE video_transcode_jobs SET status='cancelled', completed_at=NOW(),
       error_message='cancelled_race_dup_m73v2'
WHERE id IN (SELECT job_id FROM ranked WHERE rn > 1);

-- Partial unique index — live states only (queued, processing). Multiple
-- completed entries for the same URL is acceptable (idempotent reads).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_video_transcode_jobs_yt_url_live
  ON video_transcode_jobs (youtube_url)
  WHERE source_type='youtube' AND status IN ('queued','processing');

-- Race-tolerant trigger
CREATE OR REPLACE FUNCTION fn_social_reels_yt_queue_job()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NEW.source_type IS DISTINCT FROM 'youtube' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM video_transcode_jobs
             WHERE reel_id = NEW.id AND status IN ('queued','processing')) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM video_transcode_jobs j JOIN social_reels sr ON sr.id=j.reel_id
             WHERE sr.video_url = NEW.video_url AND j.status IN ('queued','processing','completed')) THEN
    RETURN NEW;
  END IF;
  -- Race-tolerant insert: if the partial unique index fires unique_violation,
  -- a concurrent INSERT for the same youtube_url won the race. Swallow the
  -- exception — the conversion is already in flight, same outcome.
  BEGIN
    INSERT INTO video_transcode_jobs (
      reel_id, user_id, source_url, youtube_url, source_type,
      status, target_format, target_bitrate
    ) VALUES (NEW.id, NEW.author_id, NEW.video_url, NEW.video_url, 'youtube',
              'queued', 'h264_1080p', 2500000);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RETURN NEW;
END;
$fn$;
