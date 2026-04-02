---
description: Locked-in Bravo Poker Live scraping protocol — bypasses Cloudflare Turnstile, authenticates, and extracts live table data from 156 venues
---

# Bravo Poker Live Scraping Protocol (LOCKED IN) — v3.1

> **MANDATORY**: This is the ONLY way to scrape Bravo Poker Live. Any deviation will result in Cloudflare blocking.

## Architecture (DO NOT MODIFY)

```
_network_available() → HEAD https://1.1.1.1
  → StealthySession(solve_cloudflare=True)
    → session.fetch(login_url) with 3x retry + backoff
      → context.new_page()
        → page.fill('input[name="Email"]', credentials)
        → page.fill('input[name="Password"]', credentials)
        → page.press('input[name="Password"]', 'Enter')
          → page.goto('/venues/{slug}/') → extract live games + waitlist
          → Chunked publish: every 25 venues → upsert to Supabase
          → Page recycle every 50 venues (memory leak prevention)
          → Sleep/wake drift detection between cycles
```

## Critical Rules

1. **MUST use `StealthySession` with `solve_cloudflare=True`** — No other fetcher works
2. **MUST use `context.new_page()`** — The page from `session.fetch()` is consumed; you need a NEW page in the SAME context
3. **MUST use `page.press('Enter')` to submit** — The login button selector is unreliable
4. **CF cookies are fingerprint-bound** — You CANNOT extract cookies and use them with urllib/requests
5. **Keep the session PERSISTENT** — The browser stays open between 15-minute cycles
6. **Health-check every 3 cycles** — Navigate to Bellagio and check for "Welcome back"
7. **Rate limit: 0.5s between venues** — Prevents Bravo from rate-limiting
8. **Network pre-check before browser launch** — HEAD to 1.1.1.1 to avoid wasting time when offline
9. **CF-solve retry: 3 attempts with backoff** — First fetch can fail with ERR_INTERNET_DISCONNECTED on wake from sleep
10. **Sleep/wake detection** — If wall-clock time drifts >2x expected sleep interval, force session reconnect

## Resilience Features (v3.1)

| Feature | Description |
|---|---|
| **Network pre-check** | HEAD request to `1.1.1.1` before launching browser — prevents 30-60s wasted on StealthySession when network is down |
| **CF-solve retry loop** | Initial `session.fetch()` retries up to 3x with exponential backoff — recovers from `ERR_INTERNET_DISCONNECTED` on wake |
| **Sleep/wake detection** | Wall-clock drift check after each cycle — if machine was sleeping, forces session reconnect |
| **Multi-tier fallback** | Tier 1: StealthySession → Tier 2: PlayWrightFetcher → Tier 3: urllib with cached CF cookies |
| **Circuit breaker** | Aborts cycle + forces reconnect after 8 consecutive venue failures |
| **Chunked publish** | Publishes every 25 venues — crash at venue #50 still saves the first 25 |
| **Page recycling** | Recycled every 50 venues to prevent browser memory leaks |
| **Proactive session refresh** | Forces new session after 45 minutes to prevent zombie browsers |
| **Watchdog** | Hard-exit after 30min with no data — launchd `KeepAlive` restarts |
| **Connect timeout** | 60s hard-kill if `connect()` hangs — `os._exit(1)` for clean launchd restart |

## Credentials (from .env/SKILL.md)

- **Email**: admin@smarter.poker
- **Password**: 215SlalomCt!
- **Token**: cd6942d7-4d38-4ecc-95b2-cc9bee944b07 (not used for web login)

## Data Extraction Pattern

Bravo venue pages contain two HTML tables:

### Table 1: Current Live Games
```html
<table class="table table-striped">
  <tr><th>Current Live Games</th><th># of Tables</th></tr>
  <tr><td>1-3 No Limit Holdem 8</td><td>3</td></tr>
</table>
```

### Table 2: Current Waiting List
```html
<table class="table table-striped">
  <tr><th>Current Waiting List</th><th># Players Waiting</th></tr>
  <tr><td>2-5 No Limit Holdem 8</td><td>5</td></tr>
</table>
```

## Troubleshooting

| Error Code | Cause | Fix |
|---|---|---|
| `ERROR_CF_BLOCKED` | Cloudflare rotated challenge | Full session restart (auto-handles via retry loop) |
| `ERROR_LOGIN_FAILED` | Credentials rejected | Retry 3x, then check credentials |
| `ERROR_SESSION_DEAD` | Browser crashed | Full session restart (auto-handles via multi-tier fallback) |
| `ERROR_VENUE_403` | Single venue CF block | Skip, retry next cycle |
| `ERROR_SUPABASE` | DB write failed | Retry 3x with backoff |
| `ERR_INTERNET_DISCONNECTED` | Network down (sleep/wake) | Auto-retries 3x with fresh session per attempt |
| `⏰ Sleep/wake detected` | Machine was sleeping | Auto-forces session reconnect on next cycle |
| `⚠️ Network unavailable` | No internet | Skips browser launch, retries with backoff |

## Running the Daemon

```bash
# Start (background, no terminal needed):
cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
nohup .venv/bin/python3 scripts/bravo-live-daemon.py >> data/bravo-logs/daemon.log 2>&1 &

# Auto-start on boot (macOS):
launchctl load ~/Library/LaunchAgents/com.smarter-poker.bravo-daemon.plist

# Stop:
launchctl unload ~/Library/LaunchAgents/com.smarter-poker.bravo-daemon.plist

# Check logs:
tail -f data/bravo-logs/daemon_$(date +%Y%m%d).log

# Check heartbeat:
cat data/bravo-logs/heartbeat.json
```
