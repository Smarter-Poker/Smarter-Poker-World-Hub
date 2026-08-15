---
name: Scrapling Web Scraper
description: Cloudflare-bypassing web scraper using Scrapling + camoufox. Use this skill when you need to scrape data from websites protected by Cloudflare, CAPTCHAs, or other anti-bot systems.
---

# Scrapling Web Scraper — Agent Skill (v3.1)

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
| 2️⃣ BACKUP | PokerAtlas | `danbekavac4545` / `$SMARTER_POKER_SHARED_PASSWORD` | Cross-verification of venue data |
| 3️⃣ BACKUP | Bravo Poker Live | `admin@smarter.poker` / `$SMARTER_POKER_SHARED_PASSWORD` (token: `$BRAVO_API_TOKEN`) | Real-time game data, tournament listings |

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
from scrapling.fetchers import StealthySession
import asyncio

# HARDENED PATTERN: Network pre-check + retry on initial fetch
def _network_available():
    """Quick network check before launching browser."""
    try:
        import urllib.request
        req = urllib.request.Request('https://1.1.1.1', method='HEAD')
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception:
        return False

def scrape_cloudflare(url):
    if not _network_available():
        raise ConnectionError("Network unavailable")
    
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    
    # Retry initial CF-solve fetch up to 3x (sleep/wake recovery)
    resp = None
    for attempt in range(3):
        try:
            resp = session.fetch(url, google_search=True)
            if resp.status == 200:
                break
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
                session.close()
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start()
            else:
                raise
    
    body = resp.body
    # ... capture provenance same as Pattern 1
```

### Pattern 3: Authenticated Scrape (Bravo login)
```python
def scrape_bravo_authenticated():
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    
    # CF-solve with retry (Pattern 2)
    resp = session.fetch('https://www.bravopokerlive.com/login/', google_search=True)
    
    # Use browser context for login
    context = session.context
    page = context.new_page()
    page.goto('https://www.bravopokerlive.com/login/')
    page.fill('input[name="Email"]', 'admin@smarter.poker')
    page.fill('input[name="Password"]', os.environ['SMARTER_POKER_SHARED_PASSWORD'])
    page.press('input[name="Password"]', 'Enter')
    page.wait_for_load_state('networkidle')
    # Now scrape authenticated pages with page.goto()
```

### Pattern 4: Multi-tier Fallback (production daemon pattern)
```python
def fetch_with_fallback(session, url, expected_slug=None):
    """4-tier fallback: reconnect → StealthySession → PlayWrightFetcher → urllib"""
    # Tier 0: Pre-flight reconnect if session is dead
    if session._session_dead or not session.session:
        session.connect()  # Will include network pre-check
    
    # Tier 1: Primary StealthySession
    if session.session and not session._session_dead:
        result = session.fetch_page(url, expected_slug)
        if result is not None:
            return result
    
    # Tier 2: PlayWrightFetcher (independent browser, no CF solve)
    from scrapling.fetchers import PlayWrightFetcher
    fetcher = PlayWrightFetcher(headless=True)
    resp = fetcher.fetch(url)
    if resp and resp.status == 200:
        return resp.html_content or resp.body.decode()
    
    # Tier 3: Raw urllib (fastest, only works when CF isn't active)
    import urllib.request
    req = urllib.request.Request(url, headers={'User-Agent': '...'})
    resp = urllib.request.urlopen(req, timeout=15)
    return resp.read().decode()
```

## Resilience Features (v3.1 — April 2026)

> [!IMPORTANT]
> These features were added to fix production outages. ALL new scraper daemons MUST implement them.

| Feature | Why | How |
|---|---|---|
| **Network pre-check** | Machine wakes from sleep → StealthySession hangs 60s → timeout → wasted cycle | HEAD `https://1.1.1.1` before `StealthySession.start()` |
| **CF-solve retry (3x)** | First `session.fetch()` fails with `ERR_INTERNET_DISCONNECTED` on wake | Retry loop with fresh session per attempt |
| **Pre-flight reconnect** | Dead session → Tier 1 always fails → Tier 2/3 blocked by CF → 0 data | Check `_session_dead` before Tier 1, auto-reconnect |
| **Discovery abort guard** | Session dies mid-discovery → 30+ doomed fetch attempts | Abort after 3 consecutive failures |
| **Sleep/wake detection** | Machine sleeps 10h → daemon thinks 15min passed → dead session | Wall-clock drift check: if `actual_elapsed > 2x expected`, force reconnect |
| **Circuit breaker** | Network flap → every venue fails → 156 wasted requests | Abort cycle after 5-8 consecutive failures, force reconnect |

## Mandatory Workflow for Every Scrape

```
1. Verify source URL is in scrape_source_registry (or add it)
2. Network pre-check (_network_available)
3. Scrape with Scrapling (Fetcher or StealthySession) — with retry
4. Verify HTTP 200 response
5. SHA-256 hash the raw HTML
6. Parse data with CSS selectors
7. Save evidence JSON to data/scrape-evidence/
8. Run anti-hallucination-check.py
9. Seed to Supabase with full provenance
10. Log to data_audit_log
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
- ❌ Launching StealthySession without network pre-check
- ❌ Running discovery loops without abort guard (max 3 consecutive failures)
- ❌ Ignoring sleep/wake drift detection between cycles
