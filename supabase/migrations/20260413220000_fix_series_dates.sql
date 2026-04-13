-- ═══════════════════════════════════════════════════════════════════════
-- Fix Series Date Corruption — 2026-04-13
-- 
-- Three categories of bad data identified and fixed:
--   1. Same-day entries (start_date = end_date) → null out end_date, keeps start
--   2. Corrupted date ranges (pre-2020 starts OR >365 day spans) → null both
--   3. Series that ended >30 days ago → suppress from UI
-- 
-- Column audit: tournament_series has NO updated_at — use scrape_timestamp
--               poker_series has updated_at
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── TABLE 1: poker_series (has updated_at) ──────────────────────────────

-- Fix 1A: Null end_date for same-day entries in poker_series
UPDATE poker_series
SET end_date = NULL,
    updated_at = NOW()
WHERE end_date IS NOT NULL
  AND start_date IS NOT NULL
  AND end_date = start_date;

-- Fix 2A: Null both dates for corrupted entries in poker_series
-- (start before 2020, OR duration > 365 days)
UPDATE poker_series
SET start_date = NULL,
    end_date = NULL,
    updated_at = NOW()
WHERE (start_date IS NOT NULL AND start_date < '2020-01-01')
   OR (
     start_date IS NOT NULL
     AND end_date IS NOT NULL
     AND (end_date::date - start_date::date) > 365
   );

-- Fix 3A: Suppress poker_series that ended more than 30 days ago
UPDATE poker_series
SET is_suppressed = TRUE,
    updated_at = NOW()
WHERE end_date IS NOT NULL
  AND end_date < CURRENT_DATE - INTERVAL '30 days'
  AND is_suppressed = FALSE;

-- Also suppress records with only start_date that was > 30 days ago
-- (same-day records where we just nulled end_date)
UPDATE poker_series
SET is_suppressed = TRUE,
    updated_at = NOW()
WHERE end_date IS NULL
  AND start_date IS NOT NULL
  AND start_date < CURRENT_DATE - INTERVAL '30 days'
  AND is_suppressed = FALSE;

-- ─── TABLE 2: tournament_series (NO updated_at — uses scrape_timestamp) ──

-- Fix 1B: Null end_date for same-day entries in tournament_series
UPDATE tournament_series
SET end_date = NULL
WHERE end_date IS NOT NULL
  AND start_date IS NOT NULL
  AND end_date = start_date;

-- Fix 2B: Null both dates for corrupted entries in tournament_series
UPDATE tournament_series
SET start_date = NULL,
    end_date = NULL
WHERE (start_date IS NOT NULL AND start_date < '2020-01-01')
   OR (
     start_date IS NOT NULL
     AND end_date IS NOT NULL
     AND (end_date::date - start_date::date) > 365
   );

-- Fix 3B: Suppress tournament_series that ended more than 30 days ago
UPDATE tournament_series
SET is_suppressed = TRUE
WHERE end_date IS NOT NULL
  AND end_date < CURRENT_DATE - INTERVAL '30 days'
  AND is_suppressed = FALSE;

-- Suppress tournament_series where only start_date exists and it was >30 days ago
UPDATE tournament_series
SET is_suppressed = TRUE
WHERE end_date IS NULL
  AND start_date IS NOT NULL
  AND start_date < CURRENT_DATE - INTERVAL '30 days'
  AND is_suppressed = FALSE;

COMMIT;

-- Verification query
SELECT
  'poker_series' AS tbl,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE start_date IS NOT NULL AND end_date IS NOT NULL AND end_date = start_date) AS same_day_remaining,
  COUNT(*) FILTER (WHERE start_date IS NOT NULL AND start_date < '2020-01-01') AS pre_2020_remaining,
  COUNT(*) FILTER (WHERE end_date IS NOT NULL AND end_date < CURRENT_DATE - INTERVAL '30 days' AND is_suppressed = FALSE) AS stale_unsuppressed,
  COUNT(*) FILTER (WHERE is_suppressed = TRUE) AS suppressed_total
FROM poker_series
UNION ALL
SELECT
  'tournament_series',
  COUNT(*),
  COUNT(*) FILTER (WHERE start_date IS NOT NULL AND end_date IS NOT NULL AND end_date = start_date),
  COUNT(*) FILTER (WHERE start_date IS NOT NULL AND start_date < '2020-01-01'),
  COUNT(*) FILTER (WHERE end_date IS NOT NULL AND end_date < CURRENT_DATE - INTERVAL '30 days' AND is_suppressed = FALSE),
  COUNT(*) FILTER (WHERE is_suppressed = TRUE)
FROM tournament_series;
