-- Bug Hunt Fix 1: video_library reels have backdated created_at (from published_at)
-- They get buried below recent user reels in the limit-50 feed.
-- Fix: Update all video_library rows inserted today to use now() so they 
-- appear at the top of the feed. Future runs of the bridge script will 
-- also use now() (already fixed in the script).

-- First, check the scope
SELECT COUNT(*) as rows_to_fix,
       MIN(created_at)::date as oldest_date,
       MAX(created_at)::date as newest_date
FROM social_reels
WHERE source_type = 'video_library'
  AND created_at < NOW() - INTERVAL '1 day';

-- Fix: set created_at to now() for all backdated video_library rows
-- so they surface in the feed. We'll use a staggered timestamp so they
-- don't all appear at the exact same second (better UX ordering).
UPDATE social_reels
SET created_at = NOW() - (ROW_NUMBER() OVER (ORDER BY created_at DESC) * INTERVAL '1 second')
WHERE source_type = 'video_library'
  AND created_at < NOW() - INTERVAL '1 day';

-- Verify fix
SELECT source_type, MIN(created_at) as oldest, MAX(created_at) as newest
FROM social_reels
GROUP BY source_type;
