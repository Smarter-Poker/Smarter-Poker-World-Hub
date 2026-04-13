-- Migration: Fix tournament buy-in data corruption
-- Root Cause: Scraper was capturing guaranteed prize pool shorthand ($15K GTD → buy_in=15)
-- as buy-in amounts. This migration marks all corrupted records as stale.
-- Date: 2026-04-13

-- Step 1: Mark records with corrupt buy-ins < $20 as stale (these are GTD shorthand captures)
-- e.g., $10 from "$10K GTD", $15 from "$15K GTD"
UPDATE venue_daily_tournaments
SET data_quality = 'stale',
    is_active = false,
    flags = COALESCE(flags, '[]'::jsonb) || '["buyin_was_gtd_shorthand"]'::jsonb
WHERE buy_in IS NOT NULL 
  AND buy_in < 20
  AND data_quality = 'scraped_verified';

-- Step 2: Mark records where tournament_name matches "$X NLH" pattern (auto-generated from bad buy-in)
-- AND buy-in is suspiciously round (likely GTD amounts captured as buy-ins)
UPDATE venue_daily_tournaments
SET data_quality = 'stale',
    is_active = false,
    flags = COALESCE(flags, '[]'::jsonb) || '["buyin_was_gtd_amount"]'::jsonb
WHERE tournament_name ~ '^\$\d+ [A-Z]'
  AND buy_in IS NOT NULL
  AND buy_in >= 500
  AND data_quality = 'scraped_verified';

-- Step 3: Mark records with HTML/CSS fragment names as stale
UPDATE venue_daily_tournaments
SET data_quality = 'stale',
    is_active = false,
    flags = COALESCE(flags, '[]'::jsonb) || '["html_fragment_name"]'::jsonb
WHERE data_quality = 'scraped_verified'
  AND (
    tournament_name ILIKE '%elementor-%'
    OR tournament_name ILIKE '%wix-%'
    OR tournament_name ILIKE '%class=%'
    OR tournament_name ILIKE '%row-unique%'
    OR tournament_name ILIKE '%application/%'
    OR tournament_name ILIKE '%</script%'
    OR tournament_name ILIKE '%</div%'
    OR tournament_name ILIKE '%data-%'
    OR tournament_name ILIKE '%src=%'
    OR tournament_name ILIKE '%style=%'
    OR tournament_name ILIKE '%-wrapper%'
  );

-- Step 4: Mark records with NULL buy_in AND NULL tournament_name as stale (no useful data)
UPDATE venue_daily_tournaments
SET data_quality = 'stale',
    is_active = false,
    flags = COALESCE(flags, '[]'::jsonb) || '["no_buyin_no_name"]'::jsonb
WHERE buy_in IS NULL
  AND tournament_name IS NULL
  AND data_quality = 'scraped_verified';

-- Step 5: For NULL buy_in records that DO have a name, mark as needs_review (might be freerolls)
UPDATE venue_daily_tournaments
SET data_quality = 'needs_review',
    flags = COALESCE(flags, '[]'::jsonb) || '["null_buyin_has_name"]'::jsonb
WHERE buy_in IS NULL
  AND tournament_name IS NOT NULL
  AND data_quality = 'scraped_verified';

-- Audit summary (check counts before committing)
SELECT 
  data_quality,
  is_active,
  COUNT(*) as cnt,
  ROUND(AVG(buy_in)::numeric, 0) as avg_buyin,
  MIN(buy_in) as min_buyin,
  MAX(buy_in) as max_buyin
FROM venue_daily_tournaments
GROUP BY data_quality, is_active
ORDER BY data_quality, is_active;
