---
name: Tournament Source Registry
description: Authoritative registry of all 26+ traveling poker tour sources with automated 3-day refresh scheduling.
version: 2.0.0
updated: 2026-01-26
---

# Tournament Source Registry Skill

## Purpose

This skill provides the **authoritative source of truth** for all poker tournament scraping operations. Every traveling tour has verified source URLs that MUST be used when collecting schedule data.

**NEW in v2.0:** Automated refresh scheduling every 3 days to ensure data stays current.

## MANDATORY: Before Any Tournament Data Operation

1. **Consult this registry** before scraping any tournament data
2. **Use ONLY the URLs listed here** as sources of truth
3. **Never invent or extrapolate** tournament data
4. **Run refresh checker** every 3 days to detect updates

---

## Tour Coverage Summary

| Category | Tours | Refresh Interval |
|----------|-------|------------------|
| Major Tours | WSOP, WPT, EPT | 3 days |
| Circuit Tours | WSOPC, MSPT, RGPS | 3 days |
| High Roller | PGT, Triton | 3-7 days |
| Regional/Venue | Venetian, Wynn, Borgata, Seminole | 3 days |
| Texas | Lodge, TCH | 3 days |
| Grassroots | BPO, FPN, LIPS | 7 days |
| Cruise | Card Player Cruises | 14 days |

**Total Active Tours:** 25+

---

## Primary Data Sources

### A-Tier: Major Tours (Official Websites)

| Brand | Official Source | Schedule URL |
|-------|-----------------|--------------|
| **WSOP** | https://www.wsop.com | https://www.wsop.com/tournaments/ |
| **WSOP Circuit** | https://www.wsop.com | https://www.wsop.com/circuit/ |
| **WPT** | https://www.worldpokertour.com | https://www.worldpokertour.com/schedule/ |
| **MSPT** | https://msptpoker.com | https://msptpoker.com/schedule/ |
| **RGPS** | https://rungoodgear.com | https://rungoodgear.com/poker-series/ |
| **PGT** | https://www.pokergo.com | https://www.pokergo.com/pgt/ |

### B-Tier: Vegas Venues

| Venue | Primary URL | PokerAtlas Backup |
|-------|-------------|-------------------|
| **Venetian** | venetianlasvegas.com/casino/poker | pokeratlas.com/poker-room/venetian-poker-room |
| **Wynn** | wynnlasvegas.com/casino/poker | pokeratlas.com/poker-room/wynn-las-vegas |
| **ARIA** | aria.mgmresorts.com | pokeratlas.com/poker-room/aria-poker-room |

### C-Tier: Regional Venues

| Venue | PokerAtlas URL |
|-------|----------------|
| **Borgata** | pokeratlas.com/poker-room/borgata-poker-room/tournaments |
| **Seminole Hard Rock** | pokeratlas.com/poker-room/seminole-hard-rock-hollywood/tournaments |
| **Thunder Valley** | pokeratlas.com/poker-room/thunder-valley-casino-resort/tournaments |
| **Commerce** | pokeratlas.com/poker-room/commerce-casino/tournaments |
| **bestbet Jacksonville** | pokeratlas.com/poker-room/bestbet-jacksonville/tournaments |

### D-Tier: Texas Rooms

| Venue | PokerAtlas URL |
|-------|----------------|
| **The Lodge** | pokeratlas.com/poker-room/the-lodge-card-club/tournaments |
| **TCH Dallas** | pokeratlas.com/poker-room/texas-card-house-dallas/tournaments |
| **TCH Houston** | pokeratlas.com/poker-room/texas-card-house-houston/tournaments |

---

## Automated Refresh System

### Database Table: `tour_source_registry`

Tracks all tour sources with refresh scheduling:

```sql
CREATE TABLE tour_source_registry (
    tour_code TEXT UNIQUE NOT NULL,    -- 'WSOP', 'WPT', etc.
    tour_name TEXT NOT NULL,
    tour_type TEXT NOT NULL,           -- major, circuit, regional, etc.
    official_website TEXT NOT NULL,
    schedule_url TEXT NOT NULL,        -- URL to scrape
    scrape_method TEXT DEFAULT 'puppeteer',
    refresh_interval_days INTEGER DEFAULT 3,
    last_checked_at TIMESTAMPTZ,
    next_check_at TIMESTAMPTZ,
    scrape_status TEXT DEFAULT 'pending'
);
```

### View: `tours_due_for_refresh`

Returns tours that need checking:

```sql
SELECT * FROM tours_due_for_refresh;
-- Returns tours where next_check_at <= NOW()
```

### Refresh Checker Script

Run every 3 days to check for updates:

```bash
# Check all due tours
node scripts/tour-refresh-checker.js

# Check specific tour
node scripts/tour-refresh-checker.js --tour WSOP

# Force check all tours
node scripts/tour-refresh-checker.js --force

# Preview without changes
node scripts/tour-refresh-checker.js --dry-run

# Generate status report
node scripts/tour-refresh-checker.js --report
```

### Cron Setup

```bash
# Every 3 days at 3 AM
0 3 */3 * * cd /path/to/project && node scripts/tour-refresh-checker.js >> logs/tour-refresh.log 2>&1
```

---

## Data Files

### Tour Source Registry JSON

**File:** `/data/tour-source-registry.json`

Complete registry of all tours with:
- Official URLs
- Scrape selectors
- Refresh intervals
- 2026 stop schedules
- Buy-in ranges

### 2026 Tour Series Data

**File:** `/data/poker-tour-series-2026.json`

All verified 2026 series including:
- WSOP (99 events)
- WPT (8+ stops)
- WSOPC (24 stops)
- MSPT (23 stops)
- RGPS (17 stops)
- Regional series

---

## Adding a New Tour

### 1. Add to Registry JSON

```json
{
  "NEW_TOUR": {
    "tour_code": "NEW_TOUR",
    "tour_name": "New Tour Name",
    "tour_type": "circuit",
    "official_website": "https://newtour.com",
    "source_urls": {
      "primary": "https://newtour.com/schedule/"
    },
    "scrape_config": {
      "method": "puppeteer",
      "selectors": {...}
    },
    "refresh_interval_days": 3
  }
}
```

### 2. Add to Database

```sql
INSERT INTO tour_source_registry (
    tour_code, tour_name, tour_type,
    official_website, schedule_url,
    refresh_interval_days
) VALUES (
    'NEW_TOUR', 'New Tour Name', 'circuit',
    'https://newtour.com', 'https://newtour.com/schedule/',
    3
);
```

### 3. Add Scraper Config

If custom parsing needed, add to `comprehensive-tour-scraper.js`:

```javascript
NEW_TOUR: {
    name: 'New Tour Name',
    baseUrl: 'https://newtour.com',
    scheduleUrl: 'https://newtour.com/schedule/',
    selectors: {...}
}
```

---

## Aggregator Sources

Use these for backup/validation:

| Source | URL | Coverage |
|--------|-----|----------|
| **PokerAtlas** | pokeratlas.com/poker-tournaments | US/Canada |
| **Hendon Mob** | thehendonmob.com/poker-tournaments | Worldwide |
| **PokerNews** | pokernews.com/tours/ | Worldwide |

---

## Quality Assurance

### Data Validation Rules

1. All events must have: name, buy-in, date
2. Buy-ins must be between $50 and $500,000
3. Dates must be valid (no past dates unless historical)
4. Source URL must be tracked for every record

### Change Detection

The refresh checker detects:
- New series/stops added
- New events added
- Schedule changes
- Canceled events (manual review)

### Error Handling

- Failed scrapes increment `error_count`
- After 3 consecutive failures, tour marked as `error`
- Errors logged to `logs/tour-changes-YYYY-MM-DD.json`

---

## Files Reference

```
/data/tour-source-registry.json          # Master registry
/data/poker-tour-series-2026.json        # 2026 series data
/scripts/tour-refresh-checker.js          # Refresh automation
/scripts/comprehensive-tour-scraper.js    # Full scraper
/supabase/migrations/20260126_tour_source_registry.sql
/.agent/skills/tournament-source-registry/SKILL.md (this file)
```

---

## If Unsure

1. Check `tour-source-registry.json` first
2. Use PokerAtlas as fallback aggregator
3. Never invent data - if source unavailable, mark as `manual`
4. Document any new sources discovered
