-- ════════════════════════════════════════════════════════════════════════════
-- OPERATION TIKTOK REELS — M1a: media pipeline columns
-- ════════════════════════════════════════════════════════════════════════════
--
-- Adds the YouTube → native-MP4 pipeline tracking columns required for the
-- Hetzner worker to convert existing YouTube-iframe reels into Supabase-hosted
-- native MP4s. The conversion is invisible to users:
--
--   * media_status='ready' is the default for everything that already plays
--     fine today (whether YouTube iframe or already-native MP4).
--   * 'queued' / 'processing' transition through the worker; on success
--     video_url is rewritten to the Supabase public URL and source_type
--     flips to 'native'. On failure it stays as 'youtube' and the iframe
--     keeps playing — no user impact.
--
-- The video_transcode_jobs table already exists (used by pages/api/video/
-- transcode.js, currently orphaned). We extend it with the columns the
-- existing scripts/transcode-worker now needs to claim and process YouTube
-- jobs alongside the existing HEVC user-upload pipeline (which polls
-- social_posts.transcode_status and is left untouched).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── social_reels: pipeline state ───────────────────────────────────────────
ALTER TABLE social_reels
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'user'
    CHECK (source_type IN ('user','youtube','native','video_library')),
  ADD COLUMN IF NOT EXISTS youtube_video_id TEXT,
  ADD COLUMN IF NOT EXISTS media_status TEXT DEFAULT 'ready'
    CHECK (media_status IN ('ready','queued','processing','failed')),
  ADD COLUMN IF NOT EXISTS original_youtube_url TEXT;

-- ─── video_transcode_jobs: extended for the YouTube path ────────────────────
-- Existing columns we rely on (already on this table):
--   id, post_id, user_id, source_url, status, target_format,
--   target_bitrate, output_url, progress, error_message, created_at,
--   updated_at
-- New columns for the YouTube poller:
ALTER TABLE video_transcode_jobs
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS reel_id UUID REFERENCES social_reels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ─── Worker poll index (cheap predicate-conditional partial index) ──────────
-- The Hetzner worker polls every 60s; this index keeps that to a single
-- O(log n) read regardless of how big the jobs table grows.
CREATE INDEX IF NOT EXISTS idx_transcode_jobs_yt_worker_poll
  ON video_transcode_jobs(source_type, status, created_at)
  WHERE status = 'queued';

-- ─── Backfill: tag every existing YouTube reel ──────────────────────────────
-- media_status stays 'ready' so the iframe keeps playing exactly as today.
-- Only the bookkeeping columns get filled in. The actual queueing is done
-- by scripts/backfill-youtube-reels.js (M3) once the worker is live.
UPDATE social_reels SET
  source_type = 'youtube',
  original_youtube_url = video_url,
  youtube_video_id = CASE
    WHEN video_url LIKE '%youtube.com/watch?v=%'
      THEN substring(video_url FROM 'v=([A-Za-z0-9_-]{11})')
    WHEN video_url LIKE '%youtu.be/%'
      THEN substring(video_url FROM 'youtu\.be/([A-Za-z0-9_-]{11})')
    WHEN video_url LIKE '%youtube.com/shorts/%'
      THEN substring(video_url FROM 'shorts/([A-Za-z0-9_-]{11})')
    WHEN video_url LIKE '%youtube.com/embed/%'
      THEN substring(video_url FROM 'embed/([A-Za-z0-9_-]{11})')
    ELSE NULL
  END,
  media_status = 'ready'
WHERE (
    video_url LIKE '%youtube.com%'
    OR video_url LIKE '%youtu.be%'
  )
  AND (source_type IS NULL OR source_type = 'user');

-- ════════════════════════════════════════════════════════════════════════════
-- M2: AUTO-QUEUE TRIGGER — replaces JS-level patches at every insert site
-- ════════════════════════════════════════════════════════════════════════════
--
-- Why a trigger instead of patching pages/hub/social-media/index.js +
-- Stories.jsx + every future insert path:
--
--   1. Atomic with the reel creation. No fire-and-forget API call that can
--      drop on the floor.
--   2. Future-proof. Any new code path (admin import, content engine, manual
--      SQL) automatically benefits.
--   3. Single source of truth. The pipeline state lives in the DB, not split
--      between client JS, server JS, and DB.
--   4. SECURITY DEFINER lets us insert into video_transcode_jobs regardless
--      of the caller's RLS — clients never need direct table access.
--
-- Trigger fires BEFORE INSERT so it can both stamp the row metadata AND
-- queue the job in one transaction. NEW.id has the gen_random_uuid()
-- default applied by the time the trigger runs.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_social_reels_yt_intercept()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yt_id TEXT;
BEGIN
  -- Only act on YouTube URLs. Skip everything else (native MP4, Supabase
  -- public URLs, video library, etc.).
  IF NEW.video_url IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.video_url NOT LIKE '%youtube.com%' AND NEW.video_url NOT LIKE '%youtu.be%' THEN
    RETURN NEW;
  END IF;

  -- Extract the 11-char YouTube video ID. Handles watch?v=, youtu.be/,
  -- shorts/, embed/, all the common forms.
  v_yt_id := CASE
    WHEN NEW.video_url LIKE '%youtube.com/watch?v=%'
      THEN substring(NEW.video_url FROM 'v=([A-Za-z0-9_-]{11})')
    WHEN NEW.video_url LIKE '%youtu.be/%'
      THEN substring(NEW.video_url FROM 'youtu\.be/([A-Za-z0-9_-]{11})')
    WHEN NEW.video_url LIKE '%youtube.com/shorts/%'
      THEN substring(NEW.video_url FROM 'shorts/([A-Za-z0-9_-]{11})')
    WHEN NEW.video_url LIKE '%youtube.com/embed/%'
      THEN substring(NEW.video_url FROM 'embed/([A-Za-z0-9_-]{11})')
    ELSE NULL
  END;

  -- Stamp the reel with pipeline state. The reel still plays as a YouTube
  -- iframe in the meantime — Reels.jsx checks video_url, not source_type,
  -- to decide which player to render. The Hetzner worker rewrites video_url
  -- when the conversion completes.
  NEW.source_type := 'youtube';
  NEW.original_youtube_url := NEW.video_url;
  NEW.youtube_video_id := v_yt_id;
  NEW.media_status := 'queued';

  RETURN NEW;
END;
$$;

-- BEFORE INSERT: tag the row, return NEW.
DROP TRIGGER IF EXISTS trg_social_reels_yt_intercept ON social_reels;
CREATE TRIGGER trg_social_reels_yt_intercept
  BEFORE INSERT ON social_reels
  FOR EACH ROW
  EXECUTE FUNCTION fn_social_reels_yt_intercept();

-- AFTER INSERT: now that the row exists with its id, queue the conversion
-- job. Splitting BEFORE/AFTER avoids the "row doesn't exist yet for the FK"
-- problem with video_transcode_jobs.reel_id REFERENCES social_reels(id).
CREATE OR REPLACE FUNCTION fn_social_reels_yt_queue_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only queue if the BEFORE trigger flagged this as a YouTube reel.
  IF NEW.source_type IS DISTINCT FROM 'youtube' THEN
    RETURN NEW;
  END IF;

  -- Idempotent: don't double-queue if a job already exists for this reel.
  IF EXISTS (
    SELECT 1 FROM video_transcode_jobs
    WHERE reel_id = NEW.id AND status IN ('queued','processing')
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO video_transcode_jobs (
    id, reel_id, user_id, source_url, youtube_url, source_type,
    status, target_format, target_bitrate, created_at
  ) VALUES (
    gen_random_uuid(), NEW.id, NEW.author_id, NEW.video_url, NEW.video_url,
    'youtube', 'queued', 'h264_1080p', 2500000, NOW()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_reels_yt_queue_job ON social_reels;
CREATE TRIGGER trg_social_reels_yt_queue_job
  AFTER INSERT ON social_reels
  FOR EACH ROW
  EXECUTE FUNCTION fn_social_reels_yt_queue_job();

-- ─── Sanity check view (useful for monitoring queries) ──────────────────────
-- `SELECT * FROM v_yt_pipeline_health;` shows conversion progress at a glance.
CREATE OR REPLACE VIEW v_yt_pipeline_health AS
SELECT
  source_type,
  media_status,
  COUNT(*) AS reel_count
FROM social_reels
WHERE source_type IS NOT NULL
GROUP BY source_type, media_status
ORDER BY source_type, media_status;

-- `SELECT * FROM v_yt_jobs_health;` shows queue depth + worker activity.
CREATE OR REPLACE VIEW v_yt_jobs_health AS
SELECT
  status,
  worker_id,
  COUNT(*) AS job_count,
  MIN(created_at) AS oldest_created_at,
  MAX(completed_at) AS latest_completed_at
FROM video_transcode_jobs
WHERE source_type = 'youtube'
GROUP BY status, worker_id
ORDER BY status, worker_id NULLS FIRST;
