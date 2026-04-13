-- ═══════════════════════════════════════════════════════════════════════
-- Fix Contaminated/Shared Date Data — 2026-04-13
--
-- Problem: Multiple distinct series records share identical (start_date,
-- end_date, events_count) values — scraper stamped wrong data on them.
-- 
-- Fix: For groups of 3+ distinct series sharing identical dates AND
-- events_count > 1, null out the start/end dates on all members except
-- the one with the earliest (lowest) id — which is most likely correct.
-- This preserves at least one record with dates and nulls the contaminated ones.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Find and fix contaminated poker_series records
-- Null dates on the later duplicates (keep earliest id)
WITH contaminated AS (
  SELECT 
    id,
    series_name,
    start_date,
    end_date,
    event_count,
    ROW_NUMBER() OVER (
      PARTITION BY start_date, end_date, event_count 
      ORDER BY id ASC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY start_date, end_date, event_count
    ) AS group_size
  FROM poker_series
  WHERE start_date IS NOT NULL
    AND end_date IS NOT NULL
    AND event_count > 1
    AND is_suppressed = FALSE
)
UPDATE poker_series ps
SET start_date = NULL,
    end_date = NULL,
    updated_at = NOW()
FROM contaminated c
WHERE ps.id = c.id
  AND c.rn > 1          -- not the first/canonical one
  AND c.group_size >= 3  -- only fix when 3+ share the same data
;

-- Same fix for tournament_series
WITH contaminated_ts AS (
  SELECT 
    id,
    name,
    start_date,
    end_date,
    events_count,
    ROW_NUMBER() OVER (
      PARTITION BY start_date, end_date, events_count 
      ORDER BY id ASC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY start_date, end_date, events_count
    ) AS group_size
  FROM tournament_series
  WHERE start_date IS NOT NULL
    AND end_date IS NOT NULL
    AND events_count > 1
    AND is_suppressed = FALSE
)
UPDATE tournament_series ts
SET start_date = NULL,
    end_date = NULL
FROM contaminated_ts c
WHERE ts.id = c.id
  AND c.rn > 1
  AND c.group_size >= 3
;

COMMIT;

-- Verification: count remaining groups of 3+ with same dates
SELECT 
  'poker_series' AS tbl,
  start_date, end_date, event_count,
  COUNT(*) as cnt
FROM poker_series
WHERE start_date IS NOT NULL AND event_count > 1 AND is_suppressed = FALSE
GROUP BY start_date, end_date, event_count
HAVING COUNT(*) >= 3
ORDER BY cnt DESC
LIMIT 10;
