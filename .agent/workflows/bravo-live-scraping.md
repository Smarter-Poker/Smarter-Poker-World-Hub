---
description: Locked-in Bravo Poker Live scraping protocol — bypasses Cloudflare Turnstile, authenticates, and extracts live table data from 156 venues
---

# Bravo Poker Live Scraping Protocol (LOCKED IN)

> **MANDATORY**: This is the ONLY way to scrape Bravo Poker Live. Any deviation will result in Cloudflare blocking.

## Architecture (DO NOT MODIFY)

```
StealthySession(solve_cloudflare=True)
  → context.new_page()
    → page.goto('/login/')
      → page.fill('input[name="Email"]', credentials)
      → page.fill('input[name="Password"]', credentials)
      → page.press('input[name="Password"]', 'Enter')
        → page.goto('/venues/{slug}/')
          → extract live games + waitlist tables from HTML
```

## Critical Rules

1. **MUST use `StealthySession` with `solve_cloudflare=True`** — No other fetcher works
2. **MUST use `context.new_page()`** — The page from `session.fetch()` is consumed; you need a NEW page in the SAME context
3. **MUST use `page.press('Enter')` to submit** — The login button selector is unreliable
4. **CF cookies are fingerprint-bound** — You CANNOT extract cookies and use them with urllib/requests
5. **Keep the session PERSISTENT** — The browser stays open between 15-minute cycles
6. **Health-check every 3 cycles** — Navigate to Bellagio and check for "Welcome back"
7. **Rate limit: 0.5s between venues** — Prevents Bravo from rate-limiting

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
| `ERROR_CF_BLOCKED` | Cloudflare rotated challenge | Full session restart |
| `ERROR_LOGIN_FAILED` | Credentials rejected | Retry 3x, then check credentials |
| `ERROR_SESSION_DEAD` | Browser crashed | Full session restart |
| `ERROR_VENUE_403` | Single venue CF block | Skip, retry next cycle |
| `ERROR_SUPABASE` | DB write failed | Retry 3x with backoff |

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
```
