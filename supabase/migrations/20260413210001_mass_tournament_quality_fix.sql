-- =============================================================================
-- DEFINITIVE FIX: venue_daily_tournaments — Mass Data Quality Remediation
-- 
-- Strategy:
-- 1. Deactivate records with IMPOSSIBLE times (midnight thru 7 AM)
-- 2. Deactivate records with garbage names (HTML artifacts like @context)
-- 3. Deactivate records with clearly impossible buy-ins ($2026 = year scraped,
--    $4591, $2011, $1099 = likely page element dimensions)
-- 4. Fix bare ambiguous times that clearly should be PM (Bellagio 2:00 etc)
-- 5. Fix specific known-bad records identified in deep audit
--
-- DO NOT deactivate legitimate non-round buy-ins like $21, $31, $51
-- (these are $20+$1, $30+$1 entry+fee structures used by Texas card rooms)
-- =============================================================================

-- ─── TIER 1: Deactivate midnight / near-midnight records ──────────────────────

-- All 00:00 midnight records — always scraped from @context JSON-LD, never real
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND start_time IN ('00:00', '0:00', '12:00AM', '12 AM', '12AM', '12:00 AM');

-- 12:05 AM — close enough to midnight (Deadwood Mountain Grand)
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND start_time IN ('12:05AM', '12:30AM', '11:59PM', '11:59 PM', '11:59pm', '11:45PM');

-- ─── TIER 2: Deactivate explicit early-morning AM times ──────────────────────

-- 1 AM, 2 AM, 3 AM, 4 AM, 5 AM, 6 AM, 7 AM — explicitly labeled AM
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND start_time ~* '^0?[1-7]:[0-5][0-9]\s*AM$';

-- No-colon early AM: "1AM", "2AM", "3AM", "4AM", "5AM", "6AM", "7AM"
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND start_time ~* '^[1-7]\s*AM$';

-- "4:00am" mixed case, "6:00am", "5:30 AM", "7AM" etc
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND start_time ~* '^0?[1-7]:[0-5][0-9]\s*am$';

-- ─── TIER 3: Bare times with no AM/PM that are clearly wrong hours ───────────

-- Sub-8:00 bare times (scraped from CSS values, unix times, version strings etc)
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND start_time ~ '^0:[0-9][0-9]$'  -- 0:xx (e.g. 0:24)
;

UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND start_time ~ '^00:[0-9][0-9]$'  -- 00:xx (e.g. 00:06)
;

UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND start_time ~ '^0[1-7]:[0-5][0-9]$'  -- 01:xx through 07:xx bare
;

UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND start_time ~ '^[0-7]:[0-5][0-9]$'   -- 1:xx through 7:xx bare (no AM/PM)
AND start_time NOT IN ('7:00PM', '7:15PM', '7:00pm', '7:30PM')  -- keep valid ones
;

-- ─── TIER 4: Specific impossible buy-ins (clearly scraped from page metadata) ─

-- $2026 = scraped from copyright year "2026"
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND buy_in = 2026;

-- $2011 = scraped from year
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND buy_in = 2011;

-- $4591 = likely scraped from page pixel dimension or element ID
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND buy_in = 4591;

-- $387 at Resorts World — scraped from JSON-LD @context (confirmed by name "@context")
-- $229 at Resorts World — same source
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'Resorts World Catskills'
AND buy_in IN (387, 229, 100)
AND tournament_name IN ('@context', 'No Limit Hold''em 00:00 $387 Buy In', 'Pot Limit Omaha 00:00 $387 Buy In',
                        'No Limit Hold''em 00:00 $229 Buy In', 'Pot Limit Omaha 00:00 $229 Buy In',
                        'No Limit Hold''em 00:00 $100 Buy In', 'Pot Limit Omaha 00:00 $100 Buy In');

-- $29 at Gulfstream Park (confirmed "Pot Limit Omaha 00:00 $29")
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'Gulfstream Park'
AND buy_in = 29;

-- $28 at Boulder Station (confirmed "00:06" time + $28 buy-in — scraped from metadata)
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'Boulder Station'
AND buy_in = 28;

-- $87 at The Club EPTX (times "0:24" and "5:39" — both impossible)
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'The Club EPTX'
AND buy_in = 87;

-- $650 at High Mountain Poker (time "02:30", name "og: http://ogp.me/ns#")  
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'High Mountain Poker'
AND buy_in = 650;

-- $5000 Outlaws/Graton/Atlantis midnight records
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND buy_in = 5000
AND start_time IN ('00:00', '12:00AM', '12 AM');

-- $1099 Orange City Racing — seems like scraped page count/ID
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name IN ('Orange City Racing & Card Club', 'Orange City Racing and Card Club')
AND buy_in = 1099;

-- $202 Deadwood — verify: looks like year artifact  
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'Deadwood Mountain Grand'
AND buy_in = 202
AND start_time IN ('00:00', '12:00AM', '12:05AM');

-- ─── TIER 5: Garbage tournament names (HTML artifacts) ────────────────────────

UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND tournament_name IN ('@context', 'og: http://ogp.me/ns#', 'fc-head-control rh-flat-ui',
                        'viewport', 'pdf_action', 'typography');

-- ─── TIER 6: Fix specific ambiguous bare times that are clearly PM tournaments ─

-- Bellagio "2:00" = $300 PLO Saturday — clearly 2:00 PM (they have "2 PM" duplicate)
UPDATE venue_daily_tournaments SET is_active = false  -- deactivate the bare-time DUPLICATE
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'Bellagio Poker Room'
AND start_time = '2:00'
AND buy_in = 300;

-- Amarillo Social Club "2:00" bare (null buy_in, $10000 — corrupted record)
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'Amarillo Social Club'
AND start_time = '2:00';

-- MGM National Harbor: "3:15" bare and "6:15" bare — fix to PM since they have 3:15PM records
UPDATE venue_daily_tournaments SET start_time = '3:15PM'
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'MGM National Harbor'
AND start_time = '3:15';

-- MGM "6:15" bare → 6:15PM (confirmed from their schedule)
UPDATE venue_daily_tournaments SET start_time = '6:15PM'
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'MGM National Harbor'
AND start_time = '6:15';

-- Lodge Poker Club "2:15" bare → 2:15PM (was previously patched for Lodge Card Club San Antonio)
UPDATE venue_daily_tournaments SET start_time = '2:15PM'
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name ILIKE '%Lodge%Poker%Club%'
AND start_time = '2:15';

-- ─── TIER 7: "5:39" at The Club EPTX — scraped from ISO timestamp (5:39 UTC) ─
UPDATE venue_daily_tournaments SET is_active = false
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'The Club EPTX'
AND start_time = '5:39';

-- ─── TIER 8: Fix 7:00 Outlaws (was changed to 1:00PM before — now 7:00PM for the rebuy nlhe)
UPDATE venue_daily_tournaments SET start_time = '7:00PM'
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name = 'Outlaws Card Parlour'
AND start_time IN ('07:00', '7:00');

-- South Point "7:00" bare → 7:00PM (casino poker room, evening tournament)
UPDATE venue_daily_tournaments SET start_time = '7:00PM'
WHERE is_active = true AND data_quality = 'scraped_verified'
AND venue_name ILIKE '%South Point%'
AND start_time IN ('7:00', '07:00');

-- ─── VERIFY what's left ───────────────────────────────────────────────────────
-- SELECT count(*) FROM venue_daily_tournaments WHERE is_active = true AND data_quality = 'scraped_verified';
