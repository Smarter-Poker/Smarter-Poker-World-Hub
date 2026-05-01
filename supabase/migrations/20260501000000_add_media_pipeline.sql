-- ════════════════════════════════════════════════════════════════════════════
-- OPERATION TIKTOK REELS — M1: media pipeline
-- ════════════════════════════════════════════════════════════════════════════
--
-- Adds the YouTube → native-MP4 pipeline. Creates the missing
-- video_transcode_jobs table (referenced by pages/api/video/transcode.js
-- but never created — that endpoint has been failing silently with a
-- "Table might not exist yet" warning since it was written), adds the
-- pipeline state columns to social_reels, installs triggers that auto-
-- queue conversion jobs whenever a YouTube URL is inserted into
-- social_reels, and tags every existing YouTube reel.
--
-- Conversion is invisible to users. While a reel is queued/processing,
-- Reels.jsx still renders it as a YouTube iframe (it checks video_url,
-- not source_type). When the worker finishes, video_url flips to a
-- Supabase public URL and source_type flips to 'native' atomically.
--
-- Tier: 2 (DDL + triggers + data backfill UPDATE). No DROP, no ALTER COLUMN
-- TYPE, no destructive changes. Reversible by dropping the new columns
-- + tables; existing data unaffected.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. video_transcode_jobs (CREATE — does not exist in prod) ──────────────
CREATE TABLE IF NOT EXISTS video_transcode_jobs (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id         UUID        REFERENCES social_posts(id) ON DELETE CASCADE,
  reel_id         UUID        REFERENCES social_reels(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES auth.users(id)   ON DELETE CASCADE,
  source_url      TEXT,
  youtube_url     TEXT,
  source_type     TEXT        DEFAULT 'user',
  status          TEXT        NOT NULL DEFAULT 'queued',
  target_format   TEXT,
  target_bitrate  INTEGER,
  progress        NUMERIC,
  output_url      TEXT,
  error_message   TEXT,
  worker_id       TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Add CHECK constraints idempotently (DROP IF EXISTS first so re-applying
-- the migration with a new constraint def doesn't error).
ALTER TABLE video_transcode_jobs
  DROP CONSTRAINT IF EXISTS video_transcode_jobs_status_check,
  DROP CONSTRAINT IF EXISTS video_transcode_jobs_source_type_check;

ALTER TABLE video_transcode_jobs
  ADD CONSTRAINT video_transcode_jobs_status_check
    CHECK (status IN ('queued','processing','running','completed','done','failed','cancelled')),
  ADD CONSTRAINT video_transcode_jobs_source_type_check
    CHECK (source_type IN ('user','youtube','native','video_library'));

-- updated_at auto-touch trigger (matches pattern of other tables in the app)
CREATE OR REPLACE FUNCTION fn_video_transcode_jobs_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_video_transcode_jobs_touch ON video_transcode_jobs;
CREATE TRIGGER trg_video_transcode_jobs_touch
  BEFORE UPDATE ON video_transcode_jobs
  FOR EACH ROW
  EXECUTE FUNCTION fn_video_transcode_jobs_touch_updated_at();

-- Worker poll index (partial — keeps poll cost O(log n) regardless of
-- historical job count).
CREATE INDEX IF NOT EXISTS idx_transcode_jobs_yt_worker_poll
  ON video_transcode_jobs(source_type, status, created_at)
  WHERE status = 'queued';

-- RLS: service role only (worker + API both use service key). Block
-- direct user access — the trigger inserts via SECURITY DEFINER.
ALTER TABLE video_transcode_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_video_transcode_jobs_service_only ON video_transcode_jobs;
CREATE POLICY p_video_transcode_jobs_service_only
  ON video_transcode_jobs
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ─── 2. social_reels: add pipeline state columns ────────────────────────────
-- source_type already exists in prod (residue from a prior attempt). Add
-- the rest. The CHECK on source_type is dropped + re-added so the value
-- set is consistent with what the trigger writes.
ALTER TABLE social_reels
  ADD COLUMN IF NOT EXISTS youtube_video_id     TEXT,
  ADD COLUMN IF NOT EXISTS media_status         TEXT DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS original_youtube_url TEXT;

ALTER TABLE social_reels
  DROP CONSTRAINT IF EXISTS social_reels_source_type_check,
  DROP CONSTRAINT IF EXISTS social_reels_media_status_check;

ALTER TABLE social_reels
  ADD CONSTRAINT social_reels_source_type_check
    CHECK (source_type IN ('user','youtube','native','video_library')),
  ADD CONSTRAINT social_reels_media_status_check
    CHECK (media_status IN ('ready','queued','processing','failed'));

-- ─── 3. Tag every existing YouTube reel ─────────────────────────────────────
-- media_status stays 'ready' so the iframe player keeps working. The
-- backfill at the bottom of this migration flips them to 'queued' and
-- inserts conversion jobs in one atomic step.
UPDATE social_reels SET
  source_type = 'youtube',
  original_youtube_url = COALESCE(original_youtube_url, video_url),
  youtube_video_id = COALESCE(youtube_video_id, CASE
    WHEN video_url LIKE '%youtube.com/watch?v=%'
      THEN substring(video_url FROM 'v=([A-Za-z0-9_-]{11})')
    WHEN video_url LIKE '%youtu.be/%'
      THEN substring(video_url FROM 'youtu\.be/([A-Za-z0-9_-]{11})')
    WHEN video_url LIKE '%youtube.com/shorts/%'
      THEN substring(video_url FROM 'shorts/([A-Za-z0-9_-]{11})')
    WHEN video_url LIKE '%youtube.com/embed/%'
      THEN substring(video_url FROM 'embed/([A-Za-z0-9_-]{11})')
    ELSE NULL
  END)
WHERE (
    video_url ILIKE '%youtube.com%'
    OR video_url ILIKE '%youtu.be%'
  )
  AND (source_type IS NULL OR source_type = 'user');

-- ─── 4. AUTO-QUEUE TRIGGER (replaces JS-level patches at every insert site) ─
CREATE OR REPLACE FUNCTION fn_social_reels_yt_intercept()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yt_id TEXT;
BEGIN
  IF NEW.video_url IS NULL THEN RETURN NEW; END IF;
  IF NEW.video_url NOT ILIKE '%youtube.com%' AND NEW.video_url NOT ILIKE '%youtu.be%' THEN
    RETURN NEW;
  END IF;

  v_yt_id := CASE
    WHEN NEW.video_url ILIKE '%youtube.com/watch?v=%'
      THEN substring(NEW.video_url FROM 'v=([A-Za-z0-9_-]{11})')
    WHEN NEW.video_url ILIKE '%youtu.be/%'
      THEN substring(NEW.video_url FROM 'youtu\.be/([A-Za-z0-9_-]{11})')
    WHEN NEW.video_url ILIKE '%youtube.com/shorts/%'
      THEN substring(NEW.video_url FROM 'shorts/([A-Za-z0-9_-]{11})')
    WHEN NEW.video_url ILIKE '%youtube.com/embed/%'
      THEN substring(NEW.video_url FROM 'embed/([A-Za-z0-9_-]{11})')
    ELSE NULL
  END;

  NEW.source_type          := 'youtube';
  NEW.original_youtube_url := NEW.video_url;
  NEW.youtube_video_id     := v_yt_id;
  NEW.media_status         := 'queued';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_reels_yt_intercept ON social_reels;
CREATE TRIGGER trg_social_reels_yt_intercept
  BEFORE INSERT ON social_reels
  FOR EACH ROW
  EXECUTE FUNCTION fn_social_reels_yt_intercept();

CREATE OR REPLACE FUNCTION fn_social_reels_yt_queue_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type IS DISTINCT FROM 'youtube' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM video_transcode_jobs
    WHERE reel_id = NEW.id AND status IN ('queued','processing')
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO video_transcode_jobs (
    reel_id, user_id, source_url, youtube_url, source_type,
    status, target_format, target_bitrate
  ) VALUES (
    NEW.id, NEW.author_id, NEW.video_url, NEW.video_url, 'youtube',
    'queued', 'h264_1080p', 2500000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_reels_yt_queue_job ON social_reels;
CREATE TRIGGER trg_social_reels_yt_queue_job
  AFTER INSERT ON social_reels
  FOR EACH ROW
  EXECUTE FUNCTION fn_social_reels_yt_queue_job();

-- ─── 5. Bulk backfill: queue every existing YouTube reel ────────────────────
-- Pure SQL — replaces the Node script. Idempotent: skip rows that already
-- have a queued/processing job. Flips media_status='queued' on every reel
-- that gets a job inserted (atomic with the insert).
WITH eligible AS (
  SELECT r.id, r.author_id, r.video_url
  FROM social_reels r
  WHERE r.source_type = 'youtube'
    AND r.media_status = 'ready'
    AND NOT EXISTS (
      SELECT 1 FROM video_transcode_jobs j
      WHERE j.reel_id = r.id
        AND j.status IN ('queued','processing','completed')
    )
),
inserted_jobs AS (
  INSERT INTO video_transcode_jobs (
    reel_id, user_id, source_url, youtube_url, source_type,
    status, target_format, target_bitrate
  )
  SELECT id, author_id, video_url, video_url, 'youtube',
         'queued', 'h264_1080p', 2500000
  FROM eligible
  RETURNING reel_id
)
UPDATE social_reels SET media_status = 'queued'
WHERE id IN (SELECT reel_id FROM inserted_jobs);

-- ─── 6. Monitoring views ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_yt_pipeline_health AS
SELECT
  source_type,
  media_status,
  COUNT(*) AS reel_count
FROM social_reels
WHERE source_type IS NOT NULL
GROUP BY source_type, media_status
ORDER BY source_type, media_status;

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

-- ─── 7. Post-apply assertions ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='video_transcode_jobs') THEN
    RAISE EXCEPTION 'video_transcode_jobs not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='social_reels' AND column_name='media_status') THEN
    RAISE EXCEPTION 'social_reels.media_status not added';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_social_reels_yt_intercept') THEN
    RAISE EXCEPTION 'BEFORE INSERT trigger not installed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_social_reels_yt_queue_job') THEN
    RAISE EXCEPTION 'AFTER INSERT trigger not installed';
  END IF;
END $$;
