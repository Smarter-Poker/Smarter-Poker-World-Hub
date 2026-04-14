-- Fix: GTD amounts incorrectly stored as buy_in in poker_events
-- Scraper parsed "$100K Gtd" / "$40K Gtd" names and stored guarantee as buy_in
-- Affects: Series 469 (Trailblazer Season II Finale) and potentially others

BEGIN;

-- Step 1: Rescue contaminated buy_in values → move to guarantee column
UPDATE poker_events
SET
  guarantee = COALESCE(guarantee, buy_in),  -- preserve guarantee if already set
  buy_in = NULL
WHERE
  buy_in >= 5000
  AND (
    event_name ILIKE '%gtd%'
    OR event_name ILIKE '%guaranteed%'
    OR event_name ~* '\$\d+[kK]\s*(Gtd|Guaranteed)'
    OR event_name ~* '\d{4,}\s*(Gtd|Guaranteed)'
  );

-- Step 2: Fix series-level main_event_buyin for series 469
-- Real max legitimate buy-in is $2,500 after stripping GTD contamination
UPDATE poker_series
SET main_event_buyin = (
  SELECT MAX(pe.buy_in)
  FROM poker_events pe
  WHERE pe.series_uid = poker_series.series_uid
    AND pe.buy_in IS NOT NULL
    AND pe.buy_in < 5000
)
WHERE id = 469;

-- Step 3: Broader fix — any other series where main_event_buyin >= 5000
-- but no legitimate event (non-GTD-named) has a buy-in that high
UPDATE poker_series ps
SET main_event_buyin = (
  SELECT MAX(pe.buy_in)
  FROM poker_events pe
  WHERE pe.series_uid = ps.series_uid
    AND pe.buy_in IS NOT NULL
    AND pe.buy_in < 5000
)
WHERE
  ps.main_event_buyin >= 5000
  AND NOT EXISTS (
    SELECT 1 FROM poker_events pe2
    WHERE pe2.series_uid = ps.series_uid
      AND pe2.buy_in >= 5000
      AND pe2.event_name NOT ILIKE '%gtd%'
      AND pe2.event_name NOT ILIKE '%guaranteed%'
  );

COMMIT;
