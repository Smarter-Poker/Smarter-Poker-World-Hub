# Poker Tournament Scraper Infrastructure

The most comprehensive poker tournament database in the country.

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env.local

# 2. Add your Supabase credentials to .env.local

# 3. Install dependencies
npm install

# 4. Run the full pipeline
node scripts/run-full-pipeline.js
```

## Pipeline Overview

The scraping pipeline has 2 phases:

### Phase 1: Database Setup
- Verifies database connection
- Adds final 2 tournament series (ARIA Poker Classic, U.S. Poker Open)
- Sets up PokerAtlas URLs for all 777 venues

### Phase 2: Data Scraping
- Scrapes each venue's tournament schedule
- Parses tournament data (buy-in, time, day, game type, guaranteed)
- Inserts into `venue_daily_tournaments` table
- Updates venue `scrape_status` and `last_scraped`

## Available Scripts

### Master Orchestrator
```bash
# Full pipeline (setup + scrape all 777 venues)
node scripts/run-full-pipeline.js

# Test mode (10 venues only)
node scripts/run-full-pipeline.js --test

# Setup only (no scraping)
node scripts/run-full-pipeline.js --setup-only

# Scrape only (skip setup)
node scripts/run-full-pipeline.js --scrape-only

# Filter by state
node scripts/run-full-pipeline.js --state TX
node scripts/run-full-pipeline.js --state NV --test
```

### Individual Scrapers
```bash
# Multi-source venue scraper
node scripts/multi-source-venue-scraper.js --state FL --limit 20

# Basic venue scraper (PokerAtlas only)
node scripts/venue-tournament-scraper.js --state CA

# Daily tournament series scraper
node scripts/daily-tournament-scraper.js
```

## API Endpoints

### POST /api/admin/run-migration
Run database migrations.

```bash
curl -X POST http://localhost:3000/api/admin/run-migration \
  -H "Content-Type: application/json" \
  -d '{"migration": "all"}'
```

Available migrations:
- `scraper-infrastructure` - Add scrape columns
- `finalize-series` - Add final 2 series + lock URLs
- `setup-venues` - Add PokerAtlas URLs to venues
- `all` - Run all migrations

### POST /api/poker/finalize-series
Finalize tournament series with source URLs.

### POST /api/poker/setup-venue-scraping
Generate PokerAtlas URLs for all venues.

## Data Sources

| Source | Coverage | Venues |
|--------|----------|--------|
| PokerAtlas | Primary | ~400 |
| Venue Websites | Secondary | ~200 |
| Web Search | Tertiary | ~100 |
| Manual Entry | Fallback | ~77 |

### Source Priority
1. **PokerAtlas** - Standardized format, real-time updates
2. **Venue Websites** - For Texas clubs and others not on PokerAtlas
3. **Web Search** - Discover tournament pages via search
4. **Manual Queue** - Flag for human review

## Database Schema

### poker_venues (777 records)
```sql
id, name, city, state, country
venue_type, address, phone, website
games_offered[], stakes_cash[]
poker_tables, hours_weekday, hours_weekend
lat, lng, trust_score
is_featured, is_active
-- Scrape tracking:
pokeratlas_url, pokeratlas_slug
scrape_source, scrape_url
scrape_status, last_scraped
```

### tournament_series (40 records)
```sql
id, name, short_name, location
start_date, end_date, total_events
series_type, is_featured
venue_id, venue_name
scrape_url, scrape_status, last_scraped
```

### venue_daily_tournaments
```sql
id, venue_id, venue_name
day_of_week, start_time
tournament_name, buy_in
rebuy_addon, starting_stack, blind_levels
guaranteed, game_type, format
source_url, last_scraped, is_active
```

## GitHub Actions

The pipeline runs automatically via GitHub Actions:

- **Schedule:** Daily at 4am UTC (11pm EST)
- **Manual Trigger:** Available in GitHub Actions UI
- **Timeout:** 2 hours max

### Required Secrets
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Rate Limiting

- 2 second delay between requests
- 3 retry attempts with exponential backoff
- 15 second timeout per request

## Error Handling

Venues are tracked with status:
- `pending` - Not yet scraped
- `ready` - URL configured, ready to scrape
- `complete` - Successfully scraped
- `no_data` - No tournaments found
- `error` - Scrape failed

## Monitoring

Check scrape coverage:
```sql
SELECT
  scrape_status,
  COUNT(*)
FROM poker_venues
GROUP BY scrape_status;
```

Recent scrape activity:
```sql
SELECT name, city, state, scrape_status, last_scraped
FROM poker_venues
WHERE last_scraped > NOW() - INTERVAL '24 hours'
ORDER BY last_scraped DESC;
```

Tournament counts by venue:
```sql
SELECT
  v.name,
  v.city,
  v.state,
  COUNT(t.id) as tournament_count
FROM poker_venues v
LEFT JOIN venue_daily_tournaments t ON v.id = t.venue_id
GROUP BY v.id, v.name, v.city, v.state
ORDER BY tournament_count DESC;
```
