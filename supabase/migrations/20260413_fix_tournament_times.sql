-- =============================================================================
-- FIX: Daily Tournament Start Time Data Quality
-- Issue: Bare H:MM times (no AM/PM) were scraped without period, causing
--        evening/afternoon tournaments to display as early morning.
-- Also:  Deactivate scraper artifact records with garbage tournament names.
-- =============================================================================

-- 1. FIX MGM National Harbor: 7:15 -> 7:15PM
--    (These are clearly evening events — confirmed by tournament name context)
UPDATE venue_daily_tournaments
SET start_time = '7:15PM'
WHERE start_time = '7:15'
  AND venue_name = 'MGM National Harbor'
  AND is_active = true;

-- 2. FIX Lodge Card Club San Antonio: 2:15 -> 2:15PM
UPDATE venue_daily_tournaments
SET start_time = '2:15PM'
WHERE start_time = '2:15'
  AND venue_name = 'Lodge Card Club San Antonio'
  AND is_active = true;

-- 3. FIX Texas Card House Spring: 6:00 -> 6:00PM
UPDATE venue_daily_tournaments
SET start_time = '6:00PM'
WHERE start_time = '6:00'
  AND venue_name = 'Texas Card House Spring'
  AND is_active = true;

-- 4. FIX Outlaws Card Parlour: 01:00 -> 1:00PM
--    (1 AM poker tournaments are extremely unusual; almost certainly 1 PM)
UPDATE venue_daily_tournaments
SET start_time = '1:00PM'
WHERE start_time = '01:00'
  AND venue_name = 'Outlaws Card Parlour'
  AND is_active = true;

-- 5. NORMALIZE: Standardize HH:MM:SS format to HH:MMPM/AM
--    Rockford Charitable: 12:30:00 -> 12:30PM
UPDATE venue_daily_tournaments
SET start_time = '12:30PM'
WHERE start_time = '12:30:00'
  AND venue_name = 'Rockford Charitable Games (RCG Poker)'
  AND is_active = true;

--    Rockford Charitable: 17:00:00 -> 5:00PM
UPDATE venue_daily_tournaments
SET start_time = '5:00PM'
WHERE start_time = '17:00:00'
  AND venue_name = 'Rockford Charitable Games (RCG Poker)'
  AND is_active = true;

--    Rockford Charitable: 14:30:00 -> 2:30PM
UPDATE venue_daily_tournaments
SET start_time = '2:30PM'
WHERE start_time = '14:30:00'
  AND venue_name = 'Rockford Charitable Games (RCG Poker)'
  AND is_active = true;

-- 6. DEACTIVATE garbage scraper artifacts (tournament_name = HTML element names)
--    Seven Feathers "viewport" record with 00:00 — clearly a scraper parse error
UPDATE venue_daily_tournaments
SET is_active = false
WHERE tournament_name = 'viewport'
  AND start_time = '00:00'
  AND venue_name = 'Seven Feathers Casino Resort';

--    Parx Casino "pdf_action" records — scraped PDF button text, not real data
UPDATE venue_daily_tournaments
SET is_active = false
WHERE tournament_name = 'pdf_action'
  AND venue_name = 'Parx Casino';

--    Lodge Card Club "fc-head-control rh-flat-ui" — scraped CSS class name
UPDATE venue_daily_tournaments
SET is_active = false
WHERE tournament_name = 'fc-head-control rh-flat-ui'
  AND venue_name = 'Lodge Card Club San Antonio';

-- 7. VERIFY: Show remaining ambiguous times after fixes
-- SELECT id, venue_name, day_of_week, start_time, tournament_name
-- FROM venue_daily_tournaments
-- WHERE is_active = true
--   AND data_quality = 'scraped_verified'
--   AND start_time NOT SIMILAR TO '%[APap][Mm]%'
-- ORDER BY venue_name;
