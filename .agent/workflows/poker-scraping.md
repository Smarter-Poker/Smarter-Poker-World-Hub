---
description: Scrape poker tournament schedules from tour websites
---

# Poker Schedule Scraping Workflow

// turbo-all

## Quick Start
1. Check existing data: `SELECT tour, COUNT(*) FROM poker_series GROUP BY tour ORDER BY count DESC;`
2. Find gaps: `SELECT series_uid FROM poker_series WHERE events_scraped = FALSE AND start_date > CURRENT_DATE;`

## Scrape Order Priority
1. **WSOPC** - wsop.com/tournaments
2. **WPT** - wpt.com/schedule  
3. **MSPT** - msptpoker.com/schedule
4. **Vegas** (Wynn, Venetian, WSOP)
5. **Florida** (Seminole, bestbet)
6. **California** (LAPC, Thunder Valley)
7. **Regional** (RGPS, state championships)

## SQL Generation Pattern
```sql
INSERT INTO poker_series (series_uid, series_name, tour, tier, venue_name, city, state, start_date, end_date, buy_in_min, buy_in_max, guarantee, source, events_scraped, scrape_status) VALUES 
('[series-uid]', '[Series Name]', '[Tour]', '[Tier]', '[Venue]', '[City]', '[ST]', '[YYYY-MM-DD]', '[YYYY-MM-DD]', [min], [max], [gtd], '[source]', [bool], '[status]')
ON CONFLICT (series_uid) DO NOTHING;
```

## Card Player Aggregator
Use cardplayer.com/poker-tournaments for cross-referencing schedules.

## Hendon Mob Verification
Use pokerdb.thehendonmob.com/venues/[venue-id]/festivals to verify dates.
