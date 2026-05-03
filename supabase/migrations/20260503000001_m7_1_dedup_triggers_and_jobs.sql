-- ════════════════════════════════════════════════════════════════════════════
-- M7.1: Dedup auto-mirror + auto-queue triggers by video_url + cancel
-- redundant pending conversion jobs.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bug-hunt finding: 169 reels share the same YouTube URL in the worst case
-- (multiple horses post the same clip). Pre-M7.1, every duplicate reel had
-- its own queued job — so the worker would re-encode the same physical
-- video up to 169 times. Total redundancy: 9,322 jobs out of ~10,200.
--
-- Fixes:
--   1. social_posts → social_reels mirror trigger now also skips when a
--      reel for (author_id, video_url) already exists. Future
--      share-reel-to-feed cycles can no longer create duplicates within
--      the same author's feed. Different authors can still mirror the
--      same clip — that's expected feed behavior.
--   2. social_reels → video_transcode_jobs trigger now also skips when
--      ANY OTHER reel with the same video_url already has a queued/
--      processing/completed job. One conversion serves all siblings.
--   3. One-shot bulk cancel: keep the OLDEST queued job per distinct
--      video_url, mark the rest 'cancelled' with a clear reason. The
--      worker (M7.1 broadcast) fans the surviving job's result out to
--      ALL siblings on completion.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_social_posts_video_to_reel_mirror()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_first_url TEXT;
  v_thumb     TEXT;
BEGIN
  IF NEW.content_type IS DISTINCT FROM 'video' THEN RETURN NEW; END IF;
  IF NEW.media_urls IS NULL OR jsonb_typeof(NEW.media_urls) <> 'array' OR jsonb_array_length(NEW.media_urls) = 0 THEN
    RETURN NEW;
  END IF;
  v_first_url := NEW.media_urls->>0;
  IF v_first_url IS NULL THEN RETURN NEW; END IF;
  IF v_first_url NOT ILIKE '%youtube.com%' AND v_first_url NOT ILIKE '%youtu.be%' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM social_reels WHERE source_post_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- M7.1: don't clone the same content into the same author's feed twice
  IF EXISTS (
    SELECT 1 FROM social_reels
    WHERE author_id = NEW.author_id AND video_url = v_first_url
  ) THEN
    RETURN NEW;
  END IF;

  v_thumb := NEW.thumbnail_url;
  INSERT INTO social_reels (
    author_id, video_url, thumbnail_url, caption, source_post_id, is_public
  ) VALUES (
    NEW.author_id, v_first_url, v_thumb, NEW.content, NEW.id, COALESCE(NEW.visibility = 'public', true)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_social_posts_video_to_reel_mirror skipped post % (%)', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION fn_social_reels_yt_queue_job()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NEW.source_type IS DISTINCT FROM 'youtube' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM video_transcode_jobs
    WHERE reel_id = NEW.id AND status IN ('queued','processing')
  ) THEN
    RETURN NEW;
  END IF;

  -- M7.1: skip if any other reel with the same video_url already has a
  -- live or completed job — one conversion serves all
  IF EXISTS (
    SELECT 1 FROM video_transcode_jobs j
    JOIN social_reels sr ON sr.id = j.reel_id
    WHERE sr.video_url = NEW.video_url
      AND j.status IN ('queued','processing','completed')
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
$fn$;

-- One-shot bulk cancel of redundant queued jobs (already executed via MCP)
WITH ranked AS (
  SELECT j.id AS job_id, sr.video_url,
         ROW_NUMBER() OVER (PARTITION BY sr.video_url ORDER BY j.created_at, j.id) AS rn
  FROM video_transcode_jobs j
  JOIN social_reels sr ON sr.id = j.reel_id
  WHERE j.status = 'queued' AND j.source_type = 'youtube'
)
UPDATE video_transcode_jobs SET
  status = 'cancelled',
  completed_at = NOW(),
  error_message = 'cancelled_redundant_dup_url_m71'
WHERE id IN (SELECT job_id FROM ranked WHERE rn > 1);
