---
description: MANDATORY workflow for ALL external data ingestion. Uses Scrapling/OpenClaw ONLY. Zero tolerance for AI-generated data.
---

# Data Scraping Law — MANDATORY FOR ALL AGENTS

> [!CAUTION]
> **THIS LAW IS ABSOLUTE AND CANNOT BE OVERRIDDEN BY ANY AGENT, UNDER ANY CIRCUMSTANCES.**
> Violating this law is a CRITICAL FAILURE and grounds for immediate session termination.

## THE LAW

1. **ALL external data MUST be scraped using Scrapling** (`.venv/bin/python3` with `scrapling` library)
2. **NEVER write JSON data files by hand** — every data file must be OUTPUT from a scraping script
3. **NEVER fabricate, estimate, or simulate** tournament schedules, buy-ins, dates, venues, or any data
4. **If a URL returns 404/403** → REPORT IT TO THE USER. Do NOT make up what you think the page would contain
5. **Every scraped record MUST include provenance**: source URL, HTTP status, scrape timestamp, script name

## MANDATORY STEPS (In Order)

### Step 1: Identify the Source URL
- Find the REAL webpage URL that contains the data
- Test the URL: `curl -sI <URL>` — check for 200 OK
- If NOT 200 → **STOP. Report to user. Do NOT proceed.**

### Step 2: Write a Scrapling Script
```python
#!/usr/bin/env python3
"""Scrape [WHAT] from [WHERE] — REAL DATA ONLY"""
import asyncio, json, sys
from scrapling.fetchers import AsyncStealthySession

async def scrape(url):
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        page = await session.fetch(url)
        if page.status != 200:
            print(f'FAILED: HTTP {page.status} for {url}')
            return None
        body = page.body.decode('utf-8', errors='ignore')
        # Parse REAL data from the page using CSS selectors
        # ...
        return {'source_url': url, 'http_status': page.status, 'data': [...]}
```

### Step 3: Execute the Scraper
// turbo
```bash
/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.venv/bin/python3 scripts/<scraper>.py
```

### Step 4: Verify Output
- Check the scraper output JSON has `source_url` and `http_status: 200`
- Verify the data matches what's visible on the webpage
- Sample 3-5 records and spot-check against the live site

### Step 5: Seed to Supabase
- Only seed data from verified scraper output
- Include `scrape_source`, `scrape_timestamp` in every row

### Step 6: Commit with Provenance
- Commit message MUST include: URLs scraped, record count, HTTP statuses
- Example: `"Scraped 45 events from pokeratlas.com (HTTP 200) via Scrapling"`

## RED FLAGS — Signs of AI-Generated Data

If you see ANY of these in a data file, it is FAKE and must be rejected:

| Red Flag | Example |
|----------|---------|
| 97%+ round buy-in numbers | $400, $600, $1,100 |
| All files have same timestamp | `last_updated: 2026-01-26` |
| Source URL returns 404 | `wsop.com/2026/` → 404 |
| Uniform event naming | `$X NLH`, `$X Deep Stack` pattern |
| No HTML artifacts in data | Real scraped data is messy |
| No scraper output file exists | The script was never run |

## Scrapling Environment

```bash
# Python venv with Scrapling installed:
/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.venv/bin/python3

# Verify:
.venv/bin/python3 -c "import scrapling; print(f'Scrapling v{scrapling.__version__}')"
```

## What To Do When Source URLs Don't Exist

Many tour schedules are published in waves. If a URL returns 404:

1. **Report to user**: "The 2026 WSOP schedule has not been published yet on wsop.com"
2. **Check alternatives**: PokerAtlas, CardPlayer, HendonMob often aggregate published schedules
3. **Only scrape what exists**: If only 20 events are published, scrape 20 — do NOT fill in the other 67
4. **Set `data_quality = 'pending'`** for tours that haven't published yet
