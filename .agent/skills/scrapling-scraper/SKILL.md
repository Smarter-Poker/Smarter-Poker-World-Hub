---
name: Scrapling Web Scraper
description: Cloudflare-bypassing web scraper using Scrapling + camoufox. Use this skill when you need to scrape data from websites protected by Cloudflare, CAPTCHAs, or other anti-bot systems.
---

# Scrapling Web Scraper — Agent Skill

> [!CAUTION]
> **READ `.agent/skills/data-integrity/SKILL.md` FIRST.** This Scrapling skill is the ONLY authorized tool for data ingestion. No other HTTP library may be used.

## The 7 Commandments (Non-Negotiable)

1. **NEVER fabricate, estimate, or infer data** — every field value MUST come from a live webpage
2. **ALWAYS use Scrapling** — no `requests`, no `urllib`, no `fetch` for scraping
3. **ALWAYS capture SHA-256 hash** of the raw HTML before parsing
4. **ALWAYS save evidence** to `data/scrape-evidence/` before seeding to Supabase
5. **ALWAYS run `scripts/anti-hallucination-check.py`** before seeding any batch
6. **NEVER bypass the data_quality gate** — must be `scraped_verified` with full provenance
7. **ALWAYS log to `data_audit_log`** — every batch gets an entry with scrape proof

## Source of Truth Hierarchy

| Priority | Source | Credential | Use For |
|----------|--------|------------|---------|
| 1️⃣ PRIMARY | Venue/Tour OWN WEBSITE | None (public) | Address, phone, hours, tournament schedule |
| 2️⃣ BACKUP | PokerAtlas | `danbekavac4545` / `215SlalomCt!` | Cross-verification of venue data |
| 3️⃣ BACKUP | Bravo Poker Live | `admin@smarter.poker` / `215SlalomCt!` (token: `cd6942d7-4d38-4ecc-95b2-cc9bee944b07`) | Real-time game data, tournament listings |

## Environment Setup

```bash
# Python venv with Scrapling installed
cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
source .venv/bin/activate
python3 -c "import scrapling; print(scrapling.__version__)"  # Should print 0.4.2+
```

## Scrapling Usage Patterns

### Pattern 1: Simple HTTP Fetch (non-Cloudflare sites)
```python
from scrapling.fetchers import Fetcher
import hashlib
from datetime import datetime, timezone

page = Fetcher.get(url, stealthy_headers=True)
body = page.body or page.text.encode()

provenance = {
    'scrape_url': url,
    'scrape_http_status': page.status,
    'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
    'scrape_html_hash': hashlib.sha256(body).hexdigest(),
    'scrape_byte_count': len(body),
    'scrape_script': __file__,
}
```

### Pattern 2: Cloudflare Bypass (PokerAtlas, Bravo, casinos)
```python
from scrapling.fetchers import AsyncStealthySession
import asyncio

async def scrape_cloudflare(url):
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        page = await session.fetch(url, google_search=False)
        body = page.body
        # ... capture provenance same as Pattern 1
```

### Pattern 3: Authenticated Scrape (PokerAtlas login)
```python
async def scrape_pokeratlas_authenticated():
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        # Login first
        login_page = await session.fetch('https://www.pokeratlas.com/login')
        # ... fill form with credentials ...
        # Then scrape protected pages
```

## Mandatory Workflow for Every Scrape

```
1. Verify source URL is in scrape_source_registry (or add it)
2. Scrape with Scrapling (Fetcher or StealthySession)
3. Verify HTTP 200 response
4. SHA-256 hash the raw HTML
5. Parse data with CSS selectors
6. Save evidence JSON to data/scrape-evidence/
7. Run anti-hallucination-check.py
8. Seed to Supabase with full provenance
9. Log to data_audit_log
```

## Red Flag Detection Table

If you see ANY of these patterns, STOP and flag for review:

| 🚨 Red Flag | What It Means |
|-------------|---------------|
| No `scrape_html_hash` | Data was NOT scraped from a real page |
| `source_url` returns 404 | Data was fabricated for a nonexistent page |
| >90% buy-ins multiples of $100 | AI-generated patterns |
| All timestamps identical | Batch-generated, not scraped |
| Names follow `$X NLH` pattern | AI templating |
| Phone numbers ending 5555/0000 | AI-generated phone numbers |
| "Schedule not yet published" sources | Real — DO NOT fabricate what it might be |

## Evidence File Format

Save to `data/scrape-evidence/{source}_{timestamp}.json`:
```json
{
  "scrape_url": "https://...",
  "scrape_http_status": 200,
  "scrape_html_hash": "sha256...",
  "scrape_byte_count": 47622,
  "scrape_timestamp": "2026-03-25T16:28:52Z",
  "scrape_script": "scripts/scrape_pokeratlas.py",
  "records_extracted": 42,
  "batch_id": "uuid...",
  "body_preview": "first 200 chars of HTML..."
}
```

## Forbidden Actions

- ❌ Using `urllib.request`, `requests`, or `fetch` for data scraping
- ❌ Writing to data tables via `exec_sql` RPC (bypasses enforcement triggers)
- ❌ Inserting records without `scrape_html_hash` and `scrape_timestamp`
- ❌ Hardcoding data in JSON and seeding it as "scraped"
- ❌ Estimating future schedules from past data
- ❌ Skipping the anti-hallucination check before seeding
- ❌ Using `data_quality = 'ai_generated'` or `'unverified'` on data tables
