-- 20260507200000_backfill_iframe_reel_thumbnails.sql
--
-- ── PROBLEM ───────────────────────────────────────────────────────────────
-- Browser test of /hub/reels (2026-05-07) revealed: when a YouTube-iframe
-- reel becomes the active slot, the player shows pure black for ~1-2 seconds
-- while the YouTube embed initializes. Looks broken to users.
--
-- Root cause: 8,980 reels with media_status='ready' and a YouTube URL in
-- video_url have NO thumbnail_url set. The Reels.jsx player has:
--
--   {reel.thumbnail_url && (
--     <img src={reel.thumbnail_url} ... />
--   )}
--
-- — conditional render. With thumbnail_url=null, no <img>, no poster, the
-- iframe loads onto a black background.
--
-- ── FIX ───────────────────────────────────────────────────────────────────
-- Derive a YouTube thumbnail URL from the video_url. YouTube serves a
-- universally-available preview at:
--
--   https://img.youtube.com/vi/{video_id}/hqdefault.jpg
--
-- (hqdefault is 480×360 and ALWAYS exists. maxresdefault is 1280×720 but
-- isn't always available — would 404 on shorter videos. The player can
-- onError-fallback to hqdefault if it tries maxresdefault first; for the
-- DB backfill we use hqdefault to guarantee a valid URL on every row.)
--
-- The video_id is the 11-character segment after '/embed/', '/shorts/', or
-- '/watch?v='. Extract via regexp.
--
-- ── SCOPE ─────────────────────────────────────────────────────────────────
-- Only updates reels that:
--   - media_status = 'ready'        (currently visible to users)
--   - thumbnail_url IS NULL          (don't overwrite existing thumbs)
--   - video_url matches a YouTube URL pattern with extractable video_id
--
-- Idempotent: re-running matches 0 rows because thumbnail_url is no longer NULL.

WITH derived AS (
  SELECT
    id,
    -- Extract YouTube video ID from common URL shapes.
    -- Handles: /embed/{id}, /shorts/{id}, /watch?v={id}, /{id} (rare)
    COALESCE(
      (regexp_match(video_url, '/(?:embed|shorts|v)/([A-Za-z0-9_-]{11})'))[1],
      (regexp_match(video_url, '[?&]v=([A-Za-z0-9_-]{11})'))[1]
    ) AS video_id
  FROM social_reels
  WHERE media_status = 'ready'
    AND thumbnail_url IS NULL
    AND video_url ILIKE '%youtube%'
)
UPDATE social_reels sr
SET thumbnail_url = 'https://img.youtube.com/vi/' || derived.video_id || '/hqdefault.jpg'
FROM derived
WHERE sr.id = derived.id
  AND derived.video_id IS NOT NULL;
