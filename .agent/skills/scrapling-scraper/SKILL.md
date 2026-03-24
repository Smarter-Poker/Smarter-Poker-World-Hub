---
name: Scrapling Web Scraper
description: Cloudflare-bypassing web scraper using Scrapling + camoufox. Use this skill when you need to scrape data from websites protected by Cloudflare, CAPTCHAs, or other anti-bot systems.
---

# Scrapling Web Scraper Skill

## MANDATORY LAW: REAL DATA ONLY

> **THIS LAW IS ABSOLUTE AND CANNOT BE OVERRIDDEN**
>
> 1. **ONLY extract data that is EXPLICITLY LABELED on the source page.**
>    Every value must trace to a labeled element (e.g., `<span class="label">Total Earnings</span><span>$123,456</span>`).
>
> 2. **NEVER guess, assume, infer, or simulate any scraped value.**
>    If a stat is not found with its exact label on the page, it MUST be reported as `null`.
>
> 3. **NEVER use "fallback" logic** that picks arbitrary values
>    (e.g., "find the largest dollar amount on the page" is FORBIDDEN).
>
> 4. **NEVER manually insert or hardcode scraped values.**
>    All data must come from the live scrape. If the scraper can't find it, report it as missing.
>
> 5. **If data cannot be scraped, REPORT IT and move on.**
>    Display "—" in the UI for missing data. Never fill gaps with fake values.
>
> **Violating this law corrupts user data and destroys platform trust.**

---

## Overview
This skill provides a production-ready web scraping capability using **Scrapling** with **camoufox** (undetectable Firefox-based browser). It can bypass Cloudflare Turnstile CAPTCHAs and other anti-bot protections.

## When to Use This Skill
- When you need to scrape data from a website that returns **403 Forbidden**
- When Cloudflare **Turnstile CAPTCHA** blocks automated access
- When CORS proxies are also blocked
- When `fetch()`, `axios`, or server-side requests consistently fail

## Prerequisites
The Scrapling Python environment is pre-installed at:
```
/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.venv/
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

## Building a New Scraper

### Template (Real Data Only)
```python
#!/usr/bin/env python3
"""
REAL DATA ONLY — Never guess, assume, or simulate values.
Only extract explicitly labeled data from the source page.
"""
import asyncio, re, json

async def scrape_site(url):
    from scrapling.fetchers import AsyncStealthySession
    
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        page = await session.fetch(url, google_search=False)
        
        if page.status != 200:
            print(f'Failed: {page.status}')
            return None
        
        body = page.body.decode('utf-8', errors='ignore')
        data = {}
        
        # ONLY extract explicitly labeled values:
        label_pairs = re.findall(
            r'<span[^>]*label[^>]*>(.*?)</span>\s*(?:<[^>]*>\s*)*<span[^>]*>(.*?)</span>',
            body, re.DOTALL | re.IGNORECASE
        )
        for raw_label, raw_value in label_pairs:
            label = re.sub(r'<[^>]+>', '', raw_label).strip()
            value = re.sub(r'<[^>]+>', '', raw_value).strip()
            if label and value:
                data[label] = value
        
        # Report what was NOT found
        if not data:
            print('WARNING: No labeled data found on page')
        
        return data

if __name__ == '__main__':
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://example.com'
    result = asyncio.run(scrape_site(url))
    print(json.dumps(result, indent=2))
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
