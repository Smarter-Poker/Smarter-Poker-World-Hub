---
name: Poker Schedule Scraper
description: Automated scraping of poker tournament schedules from major tour websites
---

# Poker Schedule Scraper Skill

## Overview
Efficiently scrape and populate the database with poker tournament schedules from major tours.

## Primary Data Sources
| Tour | URL | Schedule Format |
|------|-----|-----------------|
| WSOP Circuit | wsop.com/tournaments | HTML tables |
| WPT | wpt.com/schedule | HTML cards |
| RGPS | rungoodpokerseries.com | Event cards |
| MSPT | msptpoker.com | Schedule page |
| PokerGO Tour | pgt.com/schedule | Dynamic cards |
| Borgata | borgata.mgmresorts.com/poker | PDF + HTML |
| Wynn | wynnlasvegas.com/poker | HTML tables |
| Venetian | venetianlasvegas.com/poker | HTML |
| Seminole | seminolehardrockpokeropen.com | HTML |
| Card Player | cardplayer.com/poker-tournaments | Master index |

## Secondary Sources (Aggregators)
- **PokerNews**: pokernews.com/tours - Tour schedules
- **Hendon Mob**: pokerdb.thehendonmob.com/venues - Historical + upcoming
- **Poker Atlas**: pokeratlas.com - Real-time schedule updates

## Database Schema
```sql
-- Series table (already exists)
CREATE TABLE poker_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_uid TEXT UNIQUE NOT NULL, -- e.g., 'wsopc-thunder-valley-2026'
  series_name TEXT NOT NULL,
  tour TEXT NOT NULL, -- 'WSOP Circuit', 'WPT', 'MSPT', etc.
  tier TEXT, -- 'Major', 'Regional', 'High Roller'
  venue_name TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'USA',
  start_date DATE,
  end_date DATE,
  buy_in_min INTEGER,
  buy_in_max INTEGER,
  guarantee BIGINT,
  source TEXT, -- URL or source name
  events_scraped BOOLEAN DEFAULT FALSE,
  last_scraped TIMESTAMPTZ,
  scrape_url TEXT,
  scrape_status TEXT -- 'complete', 'series_only', 'pending', 'dates_announced'
);

-- Events table (already exists)
CREATE TABLE poker_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_uid TEXT UNIQUE NOT NULL, -- e.g., 'WSOPC-TV-2026-01'
  series_uid TEXT REFERENCES poker_series(series_uid),
  event_name TEXT NOT NULL,
  event_number INTEGER,
  event_type TEXT, -- 'main_event', 'side_event', 'satellite', 'high_roller'
  buy_in INTEGER NOT NULL,
  guarantee BIGINT,
  start_date DATE,
  start_time TIME,
  game_type TEXT, -- 'NLH', 'PLO', 'Mixed', 'Stud', etc.
  format TEXT, -- 'Single Day', 'Multi-Day', 'Multi-Flight', 'Turbo'
  venue_name TEXT,
  city TEXT,
  state TEXT,
  source TEXT,
  notes TEXT
);
```

## Scraping Workflow

### 1. Series Discovery
```javascript
// First scrape series-level data
const TOUR_URLS = {
  'WSOPC': 'https://www.wsop.com/tournaments/',
  'WPT': 'https://www.wpt.com/schedule/',
  'MSPT': 'https://msptpoker.com/schedule/',
  'RGPS': 'https://rungoodpokerseries.com/schedule/',
  'PGT': 'https://www.pgt.com/schedule/'
};

async function discoverSeries(tour) {
  // Navigate to tour schedule page
  // Extract: series name, dates, venue, city/state
  // Generate series_uid from tour + venue + year
  // Insert into poker_series with scrape_status = 'series_only'
}
```

### 2. Event Detail Scraping
```javascript
async function scrapeEventDetails(seriesUid) {
  const series = await getSeries(seriesUid);
  
  // Navigate to series detail page
  // Extract each event row/card:
  //   - Event number, name, date, time
  //   - Buy-in, guarantee
  //   - Game type, format
  
  // Generate event_uid: TOUR-VENUE-YEAR-EVENT#
  // Insert into poker_events
  // Update poker_series.events_scraped = true
}
```

## SQL Generation Pattern
```sql
-- Series INSERT template
INSERT INTO poker_series (
  series_uid, series_name, tour, tier, venue_name, 
  city, state, start_date, end_date, 
  buy_in_min, buy_in_max, guarantee, source, 
  events_scraped, scrape_status
) VALUES (
  '[tour]-[venue-slug]-[year]',
  '[Full Series Name]',
  '[Tour Name]',
  '[Major/Regional/High Roller]',
  '[Venue Name]',
  '[City]', '[ST]',
  '[YYYY-MM-DD]', '[YYYY-MM-DD]',
  [min_buyin], [max_buyin], [guarantee],
  '[source.com]',
  [true/false], '[complete/series_only/pending]'
) ON CONFLICT (series_uid) DO NOTHING;

-- Events INSERT template
INSERT INTO poker_events (
  id, event_uid, series_uid, event_name, event_number,
  event_type, buy_in, guarantee, start_date,
  game_type, format, venue_name, city, state, source
) VALUES (
  gen_random_uuid(),
  '[TOUR]-[VENUE]-[YEAR]-[##]',
  '[series_uid]',
  '[Event Name]',
  [event_number],
  '[main_event/side_event/satellite]',
  [buyin], [guarantee],
  '[YYYY-MM-DD]',
  '[NLH/PLO/Mixed]',
  '[Multi-Day/Single Day]',
  '[Venue]', '[City]', '[ST]', '[source]'
) ON CONFLICT (event_uid) DO NOTHING;
```

## Canonical Tour List (2026)
1. **WSOP** - Summer Las Vegas (May-Jul), WSOPE Prague (Mar-Apr)
2. **WSOPC** - ~18 US stops, 24 ring events each
3. **WPT** - ~15 Main Tour + Prime stops
4. **MSPT** - 24 regional stops
5. **RGPS** - 13+ regional stops
6. **PokerGO Tour** - High roller series (Aria)
7. **Wynn** - Millions, Summer/Fall Classic
8. **Venetian** - DeepStack series (5-6 per year)
9. **Borgata** - Winter/Spring/Fall Poker Open
10. **Seminole Hard Rock** - Hollywood + Tampa series
11. **LAPC** - Commerce Casino (Jan-Mar)
12. **bestbet** - Jacksonville/St. Augustine series
13. **Talking Stick** - Arizona State Championship

## Priority Scraping Order
```
1. WSOPC (Jan-Dec) - 18 stops
2. WPT (year-round) - 15 stops  
3. MSPT (year-round) - 24 stops
4. Major Vegas (Wynn, Venetian, WSOP Summer)
5. Florida (Seminole, bestbet)
6. California (LAPC, Thunder Valley)
7. Regional (RGPS, state championships)
8. High Roller (PGT, Aria)
```

## Quick Commands
```bash
# Verify series counts
SELECT tour, COUNT(*) FROM poker_series GROUP BY tour ORDER BY count DESC;

# Find series needing event scraping
SELECT series_uid, series_name, start_date 
FROM poker_series 
WHERE events_scraped = FALSE 
  AND start_date > CURRENT_DATE
ORDER BY start_date;

# Count total events
SELECT COUNT(*) FROM poker_events;
```

## Typical Scrape Output
When scraping, generate SQL blocks like:
```sql
-- [TOUR NAME] [YEAR] - [VENUE]
-- Source: [url]
-- Scraped: [date]

INSERT INTO poker_series (...) VALUES (...);
INSERT INTO poker_events (...) VALUES (...), (...), ...;
```

## Daily/Weekly Automated Scraper

### Existing Infrastructure
Located at: `scripts/daily-tournament-scraper.js`

**GitHub Actions Workflow:** `.github/workflows/daily-scraper.yml`
- Runs at **6am UTC (midnight CST)** daily
- Can be manually triggered via GitHub Actions

### What It Does
1. Queries `poker_series` for series where `events_scraped = FALSE`
2. Checks if `last_scraped` is older than 7 days
3. Only processes future series (`start_date >= TODAY`)
4. Updates `scrape_status` and `last_scraped` timestamps

### Tour Configurations
```javascript
const TOUR_SCRAPERS = {
  'WSOP Circuit': { baseUrl: 'wsop.com/tournaments/', checkInterval: 7 },
  'WPT Main Tour': { baseUrl: 'worldpokertour.com/schedule/', checkInterval: 7 },
  'WPT Prime': { baseUrl: 'worldpokertour.com/schedule/', checkInterval: 7 },
  'RunGood Poker Series': { baseUrl: 'rungood.com/schedule/', checkInterval: 14 },
  'MSPT': { baseUrl: 'msptpoker.com/schedule/', checkInterval: 7 },
  'Venetian Poker Room': { baseUrl: 'venetianlasvegas.com/poker', checkInterval: 14 },
};
```

### Add New Tour to Scraper
Edit `scripts/daily-tournament-scraper.js`:
```javascript
'NEW_TOUR': {
  baseUrl: 'https://example.com/schedule/',
  urlPattern: (seriesName) => `https://example.com/${slug}/`,
  checkInterval: 7, // days between checks
},
```

### Required Secrets (GitHub Actions)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Run Manually
```bash
cd hub-vanguard
node scripts/daily-tournament-scraper.js
```

## Venue Monitoring List
The scraper should check these sources weekly:
| Venue | Check URL | Priority |
|-------|-----------|----------|
| Wynn | wynnlasvegas.com/poker | High |
| Venetian | venetianlasvegas.com/poker | High |
| Borgata | borgata.mgmresorts.com/poker | High |
| Seminole Hollywood | seminolehardrockpokeropen.com | High |
| Seminole Tampa | shrtpoker.com | Medium |
| Commerce (LAPC) | commercecasino.com/poker | Medium |
| bestbet Jax | bestbetjax.com/poker | Medium |
| Talking Stick | talkingstickresort.com/poker | Medium |
| Thunder Valley | thundervalleyresort.com/poker | Medium |

## Notes
- Always use `ON CONFLICT DO NOTHING` to prevent duplicates
- Generate deterministic `series_uid` and `event_uid` for idempotency
- Include source URL for verification
- Mark `scrape_status` accurately for tracking
