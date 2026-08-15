---
name: Data Integrity Framework
description: MANDATORY 15-layer enforcement for ALL poker tournament data ingestion. READ BEFORE writing to ANY data table.
---

# Data Integrity Framework — Agent Skill (MANDATORY)

> [!CAUTION]
> **This skill is MANDATORY for ANY agent touching poker data tables.** Failure to follow these procedures resulted in 8,000+ AI-generated fake records entering the database. There is ZERO tolerance for non-compliance.

## Database State

| Table | Status | Protection Level |
|-------|--------|-----------------|
| `poker_venues` | `name_only` — names/cities/states preserved, all details wiped | Venue trigger |
| `poker_events` | **EMPTY** — purged, awaiting real scraped data | **NOT NULL + CHECK constraint** |
| `venue_daily_tournaments` | **EMPTY** — purged, awaiting real scraped data | **NOT NULL + CHECK constraint** |
| `poker_series` | **EMPTY** — purged, awaiting real scraped data | **NOT NULL + CHECK constraint** |
| `tournament_series` | **EMPTY** — purged, awaiting real scraped data | **NOT NULL + CHECK constraint** |

## Database Enforcement (Cannot Be Bypassed via REST API)

### 4 Data Tables: `poker_events`, `venue_daily_tournaments`, `poker_series`, `tournament_series`
- `scrape_html_hash` → **NOT NULL** (SHA-256 of source HTML)
- `scrape_timestamp` → **NOT NULL** (when the scrape happened)
- `data_quality` → **CHECK constraint**: only `scraped_verified`, `stale`, `expired` allowed
- Trigger `enforce_scrape_provenance()` rejects any INSERT/UPDATE missing provenance
- Trigger `auto_audit_log()` logs every INSERT/UPDATE/DELETE to `data_audit_log`

### Venues: `poker_venues`
- Trigger `enforce_venue_provenance()` allows `name_only`, `unverified`, `pending`
- To mark a venue as `scraped_verified`, you MUST provide `scrape_html_hash` + `scrape_timestamp`

## Source of Truth Hierarchy

1. **PRIMARY**: The venue/casino/club/tour's **own website**
2. **BACKUP #1**: PokerAtlas (login: `danbekavac4545` / `$SMARTER_POKER_SHARED_PASSWORD`)
3. **BACKUP #2**: Bravo Poker Live (login: `admin@smarter.poker` / `$SMARTER_POKER_SHARED_PASSWORD`, token: `$BRAVO_API_TOKEN`)

## The 7 Commandments (Non-Negotiable)

1. **NEVER fabricate, estimate, or infer data** — every field value MUST come from a live webpage
2. **ALWAYS use Scrapling/OpenClaw** — no `requests`, no `urllib`, no `fetch` for data scraping
3. **ALWAYS capture SHA-256 hash** of the raw HTML before parsing
4. **ALWAYS save evidence** to `data/scrape-evidence/` before seeding to Supabase
5. **ALWAYS run anti-hallucination check** (`scripts/anti-hallucination-check.py`) before seeding
6. **NEVER bypass the data_quality gate** — must be `scraped_verified` with provenance
7. **ALWAYS log to data_audit_log** — every batch gets an entry with scrape proof

## Mandatory Provenance Template

Every record inserted into a data table MUST include:

```python
record = {
    # ... data fields ...
    'data_quality': 'scraped_verified',
    'scrape_html_hash': hashlib.sha256(raw_html.encode()).hexdigest(),
    'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
    'scrape_confidence': 'high',  # or 'medium', 'low'
    'scrape_batch_id': batch_uuid,  # groups records from same scrape run
}
```

## Pre-Seed Verification Gate (MANDATORY)

Before seeding ANY batch to Supabase:

```bash
# Step 1: Run anti-hallucination check
.venv/bin/python3 scripts/anti-hallucination-check.py data/scrape-output/batch.json

# Step 2: Verify source URL returns 200
curl -sI [source_url] | head -1  # Must show "HTTP/2 200"

# Step 3: Spot-check 3 random records against live page
# Open the source URL in browser and visually confirm data matches
```

## Red Flag Detection — STOP AND INVESTIGATE

| Red Flag | What It Means |
|----------|---------------|
| No `scrape_html_hash` | Data was NOT scraped from a real page |
| `source_url` returns 404 | Data was fabricated for a page that doesn't exist |
| >90% buy-ins are round multiples of $100 | AI-generated patterns |
| All timestamps identical | Data was batch-generated, not scraped |
| Names follow `$X NLH` pattern | AI templating |
| Phone numbers ending in 5555/0000/1234 | AI-generated phone numbers |

## Forbidden Actions

- ❌ Writing to data tables via `exec_sql` (bypasses triggers)
- ❌ Setting `data_quality = 'scraped_verified'` without a real scrape
- ❌ Using `urllib.request` or `requests` instead of Scrapling
- ❌ Hardcoding data in JSON files and calling it "scraped"
- ❌ Estimating 2026 tournament schedules from 2025 data
- ❌ Inserting data with `data_quality = 'ai_generated'` or `'unverified'` into data tables
