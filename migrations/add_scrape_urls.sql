-- ============================================================
-- ADD SCRAPE_URL COLUMN TO POKER_SERIES TABLE
-- This enables tracking the source URL for each series
-- ============================================================

-- Add scrape_url column if it doesn't exist
ALTER TABLE poker_series 
ADD COLUMN IF NOT EXISTS scrape_url TEXT;

-- Add last_scraped timestamp
ALTER TABLE poker_series 
ADD COLUMN IF NOT EXISTS last_scraped TIMESTAMPTZ;

-- Add events_count for tracking
ALTER TABLE poker_series 
ADD COLUMN IF NOT EXISTS events_count INTEGER DEFAULT 0;

-- ============================================================
-- UPDATE ALL 40 TOURNAMENT SERIES WITH THEIR SCRAPE URLS
-- ============================================================

-- WSOP Circuit stops
UPDATE poker_series SET scrape_url = 'https://www.wsop.com/tournaments/' WHERE tour = 'WSOP Circuit' AND scrape_url IS NULL;
UPDATE poker_series SET scrape_url = 'https://www.wsop.com/tournaments/' WHERE tour = 'WSOP' AND scrape_url IS NULL;

-- WPT
UPDATE poker_series SET scrape_url = 'https://www.wpt.com/schedule/' WHERE tour LIKE 'WPT%' AND scrape_url IS NULL;

-- MSPT
UPDATE poker_series SET scrape_url = 'https://msptpoker.com/schedule/' WHERE tour = 'MSPT' AND scrape_url IS NULL;

-- RGPS
UPDATE poker_series SET scrape_url = 'https://rungoodpokerseries.com/schedule/' WHERE tour LIKE 'RGPS%' OR tour = 'RunGood Poker Series' AND scrape_url IS NULL;

-- PokerStars/NAPT
UPDATE poker_series SET scrape_url = 'https://www.pokerstarslive.com/napt/' WHERE tour LIKE 'PokerStars%' AND scrape_url IS NULL;

-- PokerGO Tour
UPDATE poker_series SET scrape_url = 'https://www.pokergo.com/schedule' WHERE tour = 'PokerGO Tour' AND scrape_url IS NULL;

-- Roughrider
UPDATE poker_series SET scrape_url = 'https://roughriderpokertour.com/schedule/' WHERE tour = 'Roughrider' AND scrape_url IS NULL;

-- Bar Poker Open
UPDATE poker_series SET scrape_url = 'https://barpokeropen.com/events/' WHERE tour LIKE '%Bar Poker%' OR tour = 'BPO' AND scrape_url IS NULL;

-- FPN
UPDATE poker_series SET scrape_url = 'https://freepokernetwork.com/events/' WHERE tour = 'FPN' AND scrape_url IS NULL;

-- Wynn
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/wynn-las-vegas/tournaments' WHERE tour = 'Wynn' AND scrape_url IS NULL;

-- Venetian
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/venetian-poker-room/tournaments' WHERE tour LIKE 'Venetian%' AND scrape_url IS NULL;

-- Borgata
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/borgata-poker-room/tournaments' WHERE tour LIKE 'Borgata%' AND scrape_url IS NULL;

-- Seminole
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/seminole-hard-rock-hollywood/tournaments' WHERE tour LIKE 'Seminole%' OR tour = 'SHRP' AND scrape_url IS NULL;

-- bestbet
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/bestbet-jacksonville/tournaments' WHERE tour = 'bestbet' AND scrape_url IS NULL;

-- LAPC/Commerce
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/commerce-casino/tournaments' WHERE tour = 'LAPC' AND scrape_url IS NULL;

-- Bay 101
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/bay-101-casino/tournaments' WHERE tour = 'Bay 101' AND scrape_url IS NULL;

-- Thunder Valley
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/thunder-valley-casino-resort/tournaments' WHERE tour = 'Thunder Valley' AND scrape_url IS NULL;

-- FireKeepers
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/firekeepers-casino-hotel/tournaments' WHERE tour = 'FireKeepers' AND scrape_url IS NULL;

-- Canterbury Park
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/canterbury-park/tournaments' WHERE tour = 'Canterbury Park' AND scrape_url IS NULL;

-- Running Aces
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/running-aces-casino/tournaments' WHERE tour = 'Running Aces' AND scrape_url IS NULL;

-- Mohegan Sun
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/mohegan-sun-casino/tournaments' WHERE tour = 'Mohegan Sun' AND scrape_url IS NULL;

-- Maryland Live
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/maryland-live/tournaments' WHERE tour = 'Maryland Live' AND scrape_url IS NULL;

-- MGM National Harbor
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/mgm-national-harbor/tournaments' WHERE tour = 'MGM National Harbor' AND scrape_url IS NULL;

-- Beau Rivage
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/beau-rivage-resort-casino/tournaments' WHERE tour = 'Beau Rivage' AND scrape_url IS NULL;

-- Choctaw
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/choctaw-casino-durant/tournaments' WHERE tour = 'Choctaw' AND scrape_url IS NULL;

-- Hard Rock Tulsa
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/hard-rock-tulsa/tournaments' WHERE tour = 'Hard Rock Tulsa' AND scrape_url IS NULL;

-- Talking Stick
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/talking-stick-resort/tournaments' WHERE tour = 'Talking Stick' AND scrape_url IS NULL;

-- JACK Cleveland
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/jack-cleveland-casino/tournaments' WHERE tour = 'JACK Cleveland' AND scrape_url IS NULL;

-- Parx Casino
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/parx-casino/tournaments' WHERE tour = 'Parx Casino' AND scrape_url IS NULL;

-- HPT (Defunct but in DB)
UPDATE poker_series SET scrape_url = 'DEFUNCT' WHERE tour = 'HPT' AND scrape_url IS NULL;

-- TCH Trailblazer
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-room/texas-card-house-dallas/tournaments' WHERE tour = 'TCH Trailblazer' AND scrape_url IS NULL;

-- Card Player Cruises
UPDATE poker_series SET scrape_url = 'https://www.cardplayercruises.com/cruises/' WHERE tour = 'Cruise' AND scrape_url IS NULL;

-- LIPS
UPDATE poker_series SET scrape_url = 'https://www.lipspoker.com/schedule/' WHERE tour = 'LIPS' AND scrape_url IS NULL;

-- Regional (use PokerAtlas regional search)
UPDATE poker_series SET scrape_url = 'https://www.pokeratlas.com/poker-tournaments/united-states' WHERE tour = 'Regional' AND scrape_url IS NULL;

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================
SELECT 
  tour,
  COUNT(*) as series_count,
  COUNT(scrape_url) as with_url,
  COUNT(*) - COUNT(scrape_url) as missing_url
FROM poker_series 
WHERE start_date >= '2026-01-01'
GROUP BY tour
ORDER BY missing_url DESC, tour;
