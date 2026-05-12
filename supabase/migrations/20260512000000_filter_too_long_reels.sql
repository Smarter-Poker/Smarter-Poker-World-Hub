-- =============================================================================
-- 20260512000000_filter_too_long_reels.sql
--
-- Filter videos with source duration ≥600s out of /hub/reels.
--
-- Applied via Supabase MCP `apply_migration` at 2026-05-12 in response to:
--   "delete the 437 reels that are too long, just straight up delete them and
--    prevent them or other videos of that length from being uploaded to reels;
--    they can just live on the user's profile page and be watched in the
--    social feed but never added to reels."
--
-- Three changes:
--   1. DELETE the 437 social_reels rows whose transcode failed with
--      'filtered_too_long_or_large%'. social_posts is preserved so the
--      video still appears on the user's profile and in the social feed.
--   2. AFTER UPDATE trigger on video_transcode_jobs that auto-deletes the
--      matching social_reels row whenever a job transitions into
--      failed/filtered_too_long_or_large.
--   3. BEFORE INSERT guard on social_reels that drops inserts whose linked
--      social_post has metadata.duration_seconds ≥ 600.
-- =============================================================================

-- ── Pre-flight ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  too_long_jobs INT;
  matching_reels INT;
BEGIN
  SELECT COUNT(*)            INTO too_long_jobs
  FROM video_transcode_jobs
  WHERE status = 'failed' AND error_message ILIKE 'filtered_too_long_or_large%';
  SELECT COUNT(DISTINCT j.reel_id) INTO matching_reels
  FROM video_transcode_jobs j
  JOIN social_reels r ON r.id = j.reel_id
  WHERE j.status = 'failed' AND j.error_message ILIKE 'filtered_too_long_or_large%';
  RAISE NOTICE 'pre-flight: too_long_jobs=%, matching_reels=%', too_long_jobs, matching_reels;
END$$;

-- ── 1. Delete the too-long reels ─────────────────────────────────────────────
WITH targets AS (
  SELECT DISTINCT j.reel_id AS id
  FROM video_transcode_jobs j
  WHERE j.status = 'failed'
    AND j.error_message ILIKE 'filtered_too_long_or_large%'
    AND j.reel_id IS NOT NULL
)
DELETE FROM social_reels r
USING targets t
WHERE r.id = t.id;

-- ── 2. AFTER UPDATE trigger on video_transcode_jobs ──────────────────────────
CREATE OR REPLACE FUNCTION fn_filtered_too_long_delete_reel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NEW.status = 'failed'
     AND COALESCE(NEW.error_message, '') ILIKE 'filtered_too_long_or_large%'
     AND (OLD.status IS DISTINCT FROM NEW.status
          OR COALESCE(OLD.error_message,'') IS DISTINCT FROM COALESCE(NEW.error_message,''))
     AND NEW.reel_id IS NOT NULL
  THEN
    DELETE FROM social_reels WHERE id = NEW.reel_id;
  END IF;
  RETURN NEW;
END$func$;

DROP TRIGGER IF EXISTS trg_filtered_too_long_delete_reel ON video_transcode_jobs;
CREATE TRIGGER trg_filtered_too_long_delete_reel
AFTER UPDATE ON video_transcode_jobs
FOR EACH ROW
EXECUTE FUNCTION fn_filtered_too_long_delete_reel();

-- ── 3. BEFORE INSERT guard on social_reels ──────────────────────────────────
CREATE OR REPLACE FUNCTION fn_social_reels_block_too_long()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  src_duration NUMERIC;
BEGIN
  IF NEW.source_post_id IS NOT NULL THEN
    SELECT (metadata->>'duration_seconds')::NUMERIC INTO src_duration
    FROM social_posts WHERE id = NEW.source_post_id;
    IF src_duration IS NOT NULL AND src_duration >= 600 THEN
      RAISE NOTICE '[reels-filter] blocking insert: post % has duration_seconds=% (>= 600)',
        NEW.source_post_id, src_duration;
      RETURN NULL;
    END IF;
  END IF;
  RETURN NEW;
END$func$;

DROP TRIGGER IF EXISTS trg_social_reels_block_too_long ON social_reels;
CREATE TRIGGER trg_social_reels_block_too_long
BEFORE INSERT ON social_reels
FOR EACH ROW
EXECUTE FUNCTION fn_social_reels_block_too_long();

-- ── Post-apply assertions ────────────────────────────────────────────────────
DO $$
DECLARE
  remaining_reels INT;
  trig_after_update INT;
  trig_before_insert INT;
BEGIN
  SELECT COUNT(*) INTO remaining_reels
  FROM social_reels r
  JOIN video_transcode_jobs j ON j.reel_id = r.id
  WHERE j.status = 'failed' AND j.error_message ILIKE 'filtered_too_long_or_large%';
  SELECT COUNT(*) INTO trig_after_update FROM pg_trigger
  WHERE tgname = 'trg_filtered_too_long_delete_reel';
  SELECT COUNT(*) INTO trig_before_insert FROM pg_trigger
  WHERE tgname = 'trg_social_reels_block_too_long';
  IF remaining_reels > 0 THEN
    RAISE EXCEPTION 'assertion failed: % too-long reels still present', remaining_reels;
  END IF;
  IF trig_after_update <> 1 THEN
    RAISE EXCEPTION 'assertion failed: AFTER UPDATE trigger missing';
  END IF;
  IF trig_before_insert <> 1 THEN
    RAISE EXCEPTION 'assertion failed: BEFORE INSERT trigger missing';
  END IF;
END$$;
