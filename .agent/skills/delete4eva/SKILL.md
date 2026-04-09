---
name: DELETE4EVA
description: Permanent suppression protocol for poker venues, series, and tours. Use when the user wants to delete something and make sure it NEVER comes back — even after scrapers re-run. Uses the is_suppressed blocklist system. MANDATORY: READ THIS before deleting ANY venue, series, or tour from Supabase.
---

# DELETE4EVA — Permanent Suppression Protocol

## ⚠️ CRITICAL RULE — READ FIRST

**NEVER hard-delete a venue, series, or tour from Supabase by itself.**
If you only DELETE the row, the next scraper run (daemon, cron, or manual) will **re-insert it from PokerAtlas or Bravo** because those sources still exist online.

**The correct action is ALWAYS: `is_suppressed = true`**

The `is_suppressed` flag is checked by ALL scrapers before any write. A suppressed record is **skipped forever** — no exceptions.

---

## Suppression Commands

### Suppress a Venue (Poker Room / Casino)
```sql
UPDATE poker_venues
SET is_suppressed = true,
    is_active = false
WHERE id = <VENUE_ID>;
```

To find the ID first:
```sql
SELECT id, name, city, state, is_active, is_suppressed
FROM poker_venues
WHERE name ILIKE '%venue name%';
```

### Suppress a Poker Series
```sql
UPDATE poker_series
SET is_suppressed = true
WHERE series_uid = 'pa_the-series-slug-here';
```

To find the series_uid first:
```sql
SELECT series_uid, series_name, city, state, is_suppressed
FROM poker_series
WHERE series_name ILIKE '%series name%';
```

### Suppress a Tournament Series (tournament_series table)
```sql
UPDATE tournament_series
SET is_suppressed = true
WHERE series_uid = 'pa_the-series-slug-here';
-- OR by name:
-- WHERE name ILIKE '%series name%';
```

### Suppress Multiple Venues at Once
```sql
UPDATE poker_venues
SET is_suppressed = true,
    is_active = false
WHERE id IN (1234, 5678, 9012);
```

---

## Full DELETE4EVA Protocol (Step by Step)

When asked to "delete", "remove", or "get rid of" a venue/series/tour **permanently**:

### Step 1 — Identify
Find the exact record(s) to suppress. Always verify with a SELECT first:
```sql
-- Venues
SELECT id, name, city, state, venue_type, is_active, is_suppressed
FROM poker_venues
WHERE name ILIKE '%search term%'
ORDER BY name;

-- Series
SELECT series_uid, series_name, tour, city, state, is_suppressed
FROM poker_series
WHERE series_name ILIKE '%search term%';
```

### Step 2 — Suppress (not delete)
Run the appropriate UPDATE from the commands above.

### Step 3 — Verify
Confirm suppression took effect:
```sql
SELECT id, name, is_suppressed, is_active FROM poker_venues WHERE id = <ID>;
-- Should return: is_suppressed=true, is_active=false
```

### Step 4 — Cascade (Optional but Recommended)
Suppress related tournament data so it doesn't leak into the UI:
```sql
-- Remove daily tournaments for suppressed venue
UPDATE venue_daily_tournaments
SET is_active = false
WHERE venue_id = <VENUE_ID>;
```

### Step 5 — Document
Always log what was suppressed and why in a comment or migration file so future agents know. Example migration comment:
```sql
-- DELETE4EVA: Suppressed venue ID=1234 (Bad Beat Poker Room)
-- Reason: Permanently closed. Verified via website + Google Maps.
-- Date: 2026-04-09
-- Agent: Anti-Gravity
UPDATE poker_venues SET is_suppressed = true, is_active = false WHERE id = 1234;
```

---

## Execution Methods

### Method A — Supabase SQL Migration File (Preferred for batches)
```bash
# Create migration file
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_delete4eva_<description>.sql

# Write your suppression SQL in the file, then run:
node scripts/antigravity_sql_push.js supabase/migrations/YOUR_FILE.sql
```

### Method B — Inline SQL (Quick single suppressions)
Use the Python script pattern:
```python
import json, urllib.request

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
KEY = 'YOUR_SERVICE_ROLE_KEY'

def suppress_venue(venue_id, reason=''):
    headers = {
        'apikey': KEY,
        'Authorization': f'Bearer {KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }
    body = json.dumps({'is_suppressed': True, 'is_active': False}).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{venue_id}',
        data=body, method='PATCH', headers=headers
    )
    urllib.request.urlopen(req)
    print(f'🚫 Suppressed venue {venue_id}: {reason}')

def suppress_series(series_uid, reason=''):
    headers = {
        'apikey': KEY,
        'Authorization': f'Bearer {KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }
    body = json.dumps({'is_suppressed': True}).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/poker_series?series_uid=eq.{series_uid}',
        data=body, method='PATCH', headers=headers
    )
    urllib.request.urlopen(req)
    print(f'🚫 Suppressed series {series_uid}: {reason}')
```

### Method C — Supabase Dashboard
1. Go to Table Editor → `poker_venues` (or `poker_series`)
2. Find the row
3. Set `is_suppressed = true` and `is_active = false`
4. Save

⚠️ This still works — but you still need to run Steps 1-5 above to document it.

---

## How the Suppression System Works

Every scraper in the codebase checks `is_suppressed` before writing:

### Venue Scrapers
- `scripts/utils/venue_upsert.py` → Checks `is_suppressed` + `is_active` before every upsert
- `scripts/scrape_pokeratlas_venues.py` → Filters `is_suppressed=false` in initial DB query + per-record guard
- `scripts/daily_venue_scraper.py` → Inherits via `venue_upsert.py`

### Series Scrapers
- `scripts/scrape_poker_series_v6.py` → Loads all suppressed series UIDs at startup, skips in loop
- `scripts/scrape_pokeratlas_series.py` → Same pattern
- `scripts/scrape_series_schedules.py` → Guards Phase 1 (known slugs) AND Phase 2 (discovered slugs)
- `scripts/utils/tournament_upsert.py` → Checks venue suppression before inserting ANY tournament record

### The Guard Pattern (common to all scrapers)
```python
# At startup:
load_suppressed_series()  # fetches all is_suppressed=true UIDs into memory

# In the main loop:
if is_series_suppressed(series_uid):
    print(f'🚫 SUPPRESSED — permanently skipping: {series_name}')
    continue  # NEVER written to DB
```

### The Upsert Guard (venue_upsert.py)
```python
# Scrapers CANNOT write is_suppressed — it's stripped from every payload:
clean.pop('is_suppressed', None)

# Before any write, suppression is checked:
if target_venue.get('is_suppressed') or not target_venue.get('is_active', True):
    print(f'🚫 SUPPRESSED — permanently skipping: {venue_name}')
    return "suppressed"
```

---

## Tables With Suppression Support

| Table | Column | Notes |
|---|---|---|
| `poker_venues` | `is_suppressed BOOLEAN DEFAULT false` | Also set `is_active = false` |
| `poker_series` | `is_suppressed BOOLEAN DEFAULT false` | Keyed by `series_uid` |
| `tournament_series` | `is_suppressed BOOLEAN DEFAULT false` | Keyed by `series_uid` |

---

## Pre-Suppressed Records (as of 2026-04-09)

These 20 venues were suppressed during the initial DELETE4EVA implementation and will never be re-inserted:

```
IDs: 1929, 1857, 1866, 1864, 2498, 2625, 1949, 2320, 2654, 2730,
     2653, 2701, 1873, 2641, 1874, 2646, 3118, 2616, 2692, 1990,
     1989, 2652, 1846, 2764, 2729, 2636, 1900, 1905, 2413, 1907,
     1910, 2639, 1914, 1915, 1916, 2716, 2759, 1898, 1897
```

Includes: Ameristar KC, Black Bear Casino, Bicycle Hotel & Casino, Hollywood Penn National, Horseshoe Tunica, and 15 others.

---

## Common Agent Mistakes — DO NOT DO THESE

| ❌ WRONG | ✅ RIGHT |
|---|---|
| `DELETE FROM poker_venues WHERE id = 1234` | `UPDATE poker_venues SET is_suppressed = true, is_active = false WHERE id = 1234` |
| Delete row in Supabase Dashboard only | Mark suppressed + document it |
| Delete venue without suppressing tournaments | Suppress venue → also deactivate `venue_daily_tournaments` |
| Assume deletion is permanent | Without `is_suppressed`, ANY scraper re-run will bring it back |
| Ask user to re-delete after scraper runs | Use DELETE4EVA — it's permanent on the first try |

---

## Verifying Suppression Worked

After suppressing, always verify with this query:
```sql
-- Should return is_suppressed = true
SELECT id, name, is_suppressed, is_active
FROM poker_venues
WHERE id = <YOUR_ID>;

-- Check it won't show in the app (is_active filter)  
SELECT COUNT(*) FROM poker_venues
WHERE is_active = true AND is_suppressed = false;
-- This is the count users see in Poker Near Me
```

---

## Reverting a Suppression (Emergency Only)

If you accidentally suppressed the wrong record:
```sql
UPDATE poker_venues
SET is_suppressed = false,
    is_active = true
WHERE id = <VENUE_ID>;
```

⚠️ Only do this with explicit user approval.
