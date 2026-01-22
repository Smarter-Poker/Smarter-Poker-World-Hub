-- ============================================================
-- ADD FINAL 2 MISSING TOURNAMENT SERIES
-- ARIA Poker Classic + U.S. Poker Open
-- ============================================================

-- Add ARIA Poker Classic (Summer 2026)
-- Based on 2025 dates: May 28 - July 13
INSERT INTO poker_series (
  series_uid, tour, series_name, venue, city, state, country,
  start_date, end_date, source, scrape_url
) VALUES (
  'aria-poker-classic-summer-2026',
  'ARIA',
  'ARIA Poker Classic Summer 2026',
  'ARIA Resort & Casino',
  'Las Vegas',
  'NV',
  'USA',
  '2026-05-28',
  '2026-07-13',
  'PokerAtlas',
  'https://www.pokeratlas.com/poker-room/aria-poker-room/tournaments'
) ON CONFLICT (series_uid) DO UPDATE SET
  scrape_url = EXCLUDED.scrape_url,
  updated_at = NOW();

-- Add U.S. Poker Open (PokerGO Tour - exact dates TBD)
-- Usually held in summer/fall at PokerGO Studio
INSERT INTO poker_series (
  series_uid, tour, series_name, venue, city, state, country,
  start_date, end_date, source, scrape_url
) VALUES (
  'uspo-2026',
  'U.S. Poker Open',
  'U.S. Poker Open 2026',
  'PokerGO Studio at ARIA',
  'Las Vegas',
  'NV',
  'USA',
  '2026-06-01',
  '2026-06-15',
  'PokerGO',
  'https://www.pokergo.com/schedule'
) ON CONFLICT (series_uid) DO UPDATE SET
  scrape_url = EXCLUDED.scrape_url,
  updated_at = NOW();

-- ============================================================
-- VERIFICATION: Final count should now be 40
-- ============================================================
SELECT COUNT(DISTINCT tour) as unique_tours FROM poker_series WHERE start_date >= '2026-01-01';
