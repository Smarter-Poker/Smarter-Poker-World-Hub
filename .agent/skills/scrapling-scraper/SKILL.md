---
name: Scrapling Web Scraper
description: Cloudflare-bypassing web scraper using Scrapling + camoufox. Use this skill when you need to scrape data from websites protected by Cloudflare, CAPTCHAs, or other anti-bot systems.
---

# Scrapling Web Scraper Skill

## MANDATORY LAW: REAL DATA ONLY — 15-LAYER INTEGRITY STANDARD

> **THIS LAW IS ABSOLUTE AND CANNOT BE OVERRIDDEN BY ANY AGENT, IN ANY CONVERSATION, UNDER ANY CIRCUMSTANCES.**
>
> **Violating this law is a CRITICAL FAILURE. There are ZERO exceptions.**

### The 7 Commandments
> 1. **ONLY extract data that is EXPLICITLY PRESENT on the source page.**
>    Every value must trace to a real HTML element found via CSS selector or regex on the live page.
>
> 2. **NEVER guess, assume, infer, estimate, or simulate any scraped value.**
>    If a data point is not found on the page, it MUST be reported as `null`.
>
> 3. **NEVER use "fallback" logic** that picks arbitrary values.
>    (e.g., "find the largest dollar amount on the page" is FORBIDDEN).
>
> 4. **NEVER manually write or hand-craft JSON data files.**
>    All data files must be OUTPUT from an executed Scrapling script. Hand-written data = fabricated data.
>
> 5. **If a URL returns non-200, STOP and REPORT to the user.**
>    Do NOT proceed. Do NOT invent what you think the page would contain. Report it and move on.
>
> 6. **Every record MUST include cryptographic provenance:**
>    `scrape_url`, `scrape_http_status`, `scrape_timestamp`, `scrape_html_hash` (SHA-256), `scrape_script`
>
> 7. **If data cannot be scraped, display "—" or "Not yet published" in the UI.**
>    Never fill gaps with AI-generated values. Missing data is infinitely better than fake data.
>
> **Violating this law corrupts user data, destroys platform trust, and is grounds for session termination.**

### Red Flags — Signs of AI-Generated Data (AUTO-REJECT)
| Signal | Why It's Suspicious |
|--------|-------------------|
| 97%+ round buy-in numbers ($400, $600, $1,100) | Real schedules have irregular amounts ($375, $565, $1,125) |
| All records have identical timestamps | Real scrapes happen over seconds/minutes |
| Source URL returns 404 | The page doesn't exist — data was fabricated |
| Uniform event naming (`$X NLH`, `$X Deep Stack`) | Real events have unique, specific names |
| No HTML artifacts in extracted text | Real scraped data has encoding quirks |
| Perfect field completeness (100% filled) | Real data always has gaps |
| Sequential numbering with no gaps | Real schedules have scheduling irregularities |

---

## Overview
This skill provides production-ready web scraping using **Scrapling** with **camoufox** (undetectable Firefox-based browser). It bypasses Cloudflare Turnstile CAPTCHAs and other anti-bot protections.

## When to Use This Skill
- When you need to scrape data from a website
- When Cloudflare or anti-bot systems block access
- When `fetch()`, `axios`, or server-side requests fail
- **ALWAYS** for any external data ingestion (per `/data-scraping` workflow)

## Prerequisites
```bash
# Python venv with Scrapling installed:
/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.venv/bin/python3

# Verify:
.venv/bin/python3 -c "import scrapling; print(f'Scrapling v{scrapling.__version__}')"
# Expected: Scrapling v0.4.2
```

### Installed packages:
- `scrapling` 0.4.2 — Core scraping framework
- `camoufox` 0.4.11 — Undetectable Firefox browser
- `playwright` / `patchright` — Browser automation
- `curl_cffi` — TLS fingerprint spoofing
- `browserforge` — Browser fingerprint generation

## Quick Start

### 1. Simple Fetch (No Cloudflare)
```python
from scrapling.fetchers import Fetcher
page = Fetcher.get('https://example.com', stealthy_headers=True)
print(page.status, page.text)
```

### 2. Cloudflare Bypass (StealthySession)
```python
import asyncio
from scrapling.fetchers import AsyncStealthySession

async def scrape():
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        page = await session.fetch('https://cloudflare-protected-site.com')
        
        # IMPORTANT: Content is in page.body (bytes), NOT page.text
        body = page.body.decode('utf-8', errors='ignore')
        
        # CSS selectors work on the response
        tables = page.css('table')
        links = page.css('a')

asyncio.run(scrape())
```

### 3. Run from Shell
```bash
# Always use the venv Python:
/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.venv/bin/python3 your_script.py
```

## Key API Details

### Response Object Attributes
| Attribute | Type | Description |
|-----------|------|-------------|
| `page.status` | int | HTTP status code |
| `page.body` | bytes | **Full HTML** (use this, not `.text`) |
| `page.text` | str | Often empty for StealthySession |
| `page.css('selector')` | list | CSS selector results |
| `page.headers` | dict | Response headers |

> **CRITICAL**: For `StealthySession`, always use `page.body` instead of `page.text`.

## Mandatory Scraper Template (With Full Provenance)

```python
#!/usr/bin/env python3
"""
Scrape [WHAT] from [WHERE] — REAL DATA ONLY
Outputs: JSON with full cryptographic provenance per Layer 1
"""
import asyncio, hashlib, json, sys
from datetime import datetime, timezone

SCRIPT_NAME = __file__

async def scrape(url):
    from scrapling.fetchers import AsyncStealthySession
    
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        page = await session.fetch(url, google_search=False)
        
        # LAYER 1: Capture provenance
        raw_body = page.body
        provenance = {
            'scrape_url': url,
            'scrape_http_status': page.status,
            'scrape_timestamp': datetime.now(timezone.utc).isoformat(),
            'scrape_html_hash': hashlib.sha256(raw_body).hexdigest(),
            'scrape_byte_count': len(raw_body),
            'scrape_script': SCRIPT_NAME,
        }
        
        if page.status != 200:
            print(f'FAILED: HTTP {page.status} for {url}')
            print(f'PROVENANCE: {json.dumps(provenance)}')
            return None
        
        body = raw_body.decode('utf-8', errors='ignore')
        
        # EXTRACT ONLY what is explicitly on the page
        records = []
        # ... CSS selector parsing here ...
        
        # Attach provenance to every record
        for r in records:
            r.update(provenance)
        
        return {
            'provenance': provenance,
            'records': records,
            'record_count': len(records),
        }

if __name__ == '__main__':
    url = sys.argv[1] if len(sys.argv) > 1 else None
    if not url:
        print('Usage: .venv/bin/python3 script.py <URL>')
        sys.exit(1)
    result = asyncio.run(scrape(url))
    if result:
        print(json.dumps(result, indent=2))
        # Save evidence
        with open(f'data/scrape-evidence/{SCRIPT_NAME}_{int(datetime.now().timestamp())}.json', 'w') as f:
            json.dump(result, f, indent=2)
```

## Existing Implementation: HendonMob Scraper

```bash
# Single user
SUPABASE_SERVICE_ROLE_KEY="<key>" \
  .venv/bin/python3 scripts/hendon_scraper_scrapling.py \
  "https://pokerdb.thehendonmob.com/player.php?a=r&n=238029" \
  "47965354-0e56-43ef-931c-ddaab82af765"

# ALL linked users
SUPABASE_SERVICE_ROLE_KEY="<key>" \
  .venv/bin/python3 scripts/hendon_scraper_scrapling.py --all
```

## Constraints
1. **Cannot run on Vercel** — Requires headless browser. Must run locally or on a VPS.
2. **Rate limiting** — Add 3-5s delays between requests.
3. **Memory** — ~200-300MB per browser session.
4. **First run** — 10-15s for Cloudflare solving; subsequent requests are fast.

## Troubleshooting
| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: scrapling` | Use `.venv/bin/python3` |
| 403 with `Fetcher` | Use `StealthySession` with `solve_cloudflare=True` |
| `page.text` empty | Use `page.body` instead |
| Cloudflare still blocking | Retry — sometimes needs 2 attempts |
