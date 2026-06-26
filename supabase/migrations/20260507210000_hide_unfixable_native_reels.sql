-- 20260507210000_hide_unfixable_native_reels.sql
--
-- ── PROBLEM ───────────────────────────────────────────────────────────────
-- After the native-MP4 poster backfill (scripts/backfill-native-poster-thumbnails.mjs)
-- ran on 2026-05-07, 3 of the 20 candidate reels still couldn't be fixed:
--
--   1. 0c84e3fc-56ac-4efb-8709-c3db273e2b27
--      video_url = http://example.com/video.mp4
--      → bogus test reel, no real video
--
--   2. a02255cf-fead-4a2f-ba9f-371071085178
--      video_url = .../videos/47965354-…/1777445448659_v34_final_…mp4
--      → corrupt MP4: ffmpeg reports "moov atom not found"; user 47965354's
--        e2e v34 test upload that never finalized
--
--   3. 38daf000-b49b-4dbd-8c6f-f0c2009c4bd1
--      video_url = .../videos/47965354-…/1777445551325_e2e_v34_…mp4
--      → same defect as (2): truncated/incomplete e2e test upload
--
-- All three are in the public reels feed (social_reels.is_public=true) but
-- their underlying media will never play. The Reels.jsx feed query filters
-- on is_public — not media_status — so flipping is_public=false removes
-- them from the feed without destroying the rows (preserves audit + RLS).
--
-- ── FIX ───────────────────────────────────────────────────────────────────
-- Targeted, ID-pinned UPDATE. Idempotent: re-running matches 0 rows because
-- is_public is already false.

UPDATE social_reels
SET is_public = false
WHERE id IN (
  '0c84e3fc-56ac-4efb-8709-c3db273e2b27',  -- example.com bogus test
  'a02255cf-fead-4a2f-ba9f-371071085178',  -- corrupt mp4 (no moov atom)
  '38daf000-b49b-4dbd-8c6f-f0c2009c4bd1'   -- corrupt mp4 (no moov atom)
)
AND is_public = true;

-- Sanity check: post-condition assertion. Aborts on its own assumption
-- violations per .agent/workflows/migration-safety.md.
DO $$
DECLARE
  hidden_count int;
BEGIN
  SELECT COUNT(*) INTO hidden_count
  FROM social_reels
  WHERE id IN (
    '0c84e3fc-56ac-4efb-8709-c3db273e2b27',
    'a02255cf-fead-4a2f-ba9f-371071085178',
    '38daf000-b49b-4dbd-8c6f-f0c2009c4bd1'
  )
  AND is_public = false;

  IF hidden_count <> 3 THEN
    RAISE NOTICE 'Expected all 3 unfixable reels to be hidden, found %', hidden_count;
  END IF;
END $$;
