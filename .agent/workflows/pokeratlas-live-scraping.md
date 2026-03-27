---
description: Locked-in PokerAtlas scraping protocol — bypasses Cloudflare with StealthySession, extracts game catalog data from 149 venues across 11 regions
---

# PokerAtlas Live Games Scraping Protocol (LOCKED IN)

> **MANDATORY**: This is the ONLY way to scrape PokerAtlas. Mirrors the Bravo daemon architecture.

## Architecture (DO NOT MODIFY)

```
StealthySession(headless=True, solve_cloudflare=True)
  → session.fetch('https://www.pokeratlas.com/poker-cash-games/{region-slug}')
    → Extract venue_name, game_name, buy-in, runs schedule
    → Atomic batch upsert to Supabase (source='pokeratlas')
    → Delete stale records (source=eq.pokeratlas only)
```

## Critical Differences from Bravo

| Aspect | Bravo | PokerAtlas |
|---|---|---|
| **Login** | Required (email/password) | NOT required (public data) |
| **Fetch method** | `context.new_page()` + `page.goto()` | `session.fetch()` direct |
| **Data type** | Real-time table counts | Game catalog + schedules |
| **Navigation** | Per-venue slug | Per-region slug |
| **Regions** | 156 venue slugs | 11 validated region slugs |

## Critical Rules

1. **MUST use `StealthySession` with `solve_cloudflare=True`** — Same as Bravo
2. **NO LOGIN NEEDED** — PokerAtlas game catalog is public
3. **Use `session.fetch()` DIRECTLY** — NOT `context.new_page()` — response has full HTML
4. **REDIRECT DETECTION MANDATORY** — Check page `<title>` for "Las Vegas" to catch silent 301 redirects
5. **Source isolation** — ALWAYS set `source='pokeratlas'` and scope deletes to `source=eq.pokeratlas`
6. **Rate limit: 1s between regions** — Prevents rate-limiting
7. **Use ONLY validated region slugs** from `data/pokeratlas-room-registry.json`

## Validated Region Slugs (11 TOTAL)

These are the ONLY slugs that return unique data. All others redirect to Las Vegas.

| Region | Venues | Games |
|---|---|---|
| `las-vegas-nevada` | 19 | 210 |
| `texas` | 65 | 268 |
| `montana` | 24 | 46 |
| `portland-oregon` | 18 | 53 |
| `biloxi-mississippi` | 7 | 29 |
| `iowa` | 7 | 28 |
| `atlantic-city-new-jersey` | 3 | 33 |
| `wisconsin` | 2 | 13 |
| `laughlin-nevada` | 2 | 9 |
| `virginia` | 1 | 34 |
| `georgia` | 1 | 6 |

## HTML Data Extraction Pattern

```html
<li class="cash-games-list-item cds-item">
  <a href="/poker-cash-game/venue-slug-game-type-stakes">
    <div class="venue">
      <h2 class="venue-name">Aria Casino</h2>
    </div>
    <div class="cash-games-item-overview">
      <div class="uber-row title">
        <ul class="inline-list">
          <li class="inline-list-item">1/3 No Limit Holdem</li>
        </ul>
      </div>
      <div class="uber-row details">
        <ul class="inline-list">
          <li class="inline-list-item">
            <span class="label">Buy-in:</span> $100 to $500
          </li>
          <li class="inline-list-item">
            <span class="label">Runs:</span> Always
          </li>
        </ul>
      </div>
    </div>
  </a>
</li>
```

## "Runs" to Table Estimate Mapping

| Runs Value | Tables Estimate |
|---|---|
| "Always" | 3 |
| "Multiple tables" | 3 |
| "One or two tables" / "2" | 2 |
| "Daily" | 2 |
| "One" / "Weekday" / "Weekend" | 1 |
| "Occasionally" / "Rare" | 0 |
| (empty) | 1 |

## Troubleshooting

| Error Code | Cause | Fix |
|---|---|---|
| `ERROR_CF_BLOCKED` | Cloudflare rotated challenge | Full session restart with `google_search=True` |
| `ERROR_SESSION_DEAD` | Browser crashed | Reconnect `StealthySession` |
| `ERROR_SUPABASE` | DB write failed | Retry 3x with exponential backoff |
| Silent redirect (301) | Invalid region slug | Detected via title check; use only validated slugs |
| Duplicate LV data | Multiple redirects | Redirect detection blocks this; registry limits slugs |

## Running the Daemon

```bash
# Start (background via launchd, auto-restart on boot):
launchctl load ~/Library/LaunchAgents/com.smarter-poker.pokeratlas-daemon.plist

# Stop:
launchctl unload ~/Library/LaunchAgents/com.smarter-poker.pokeratlas-daemon.plist

# Check logs:
tail -f data/pokeratlas-logs/daemon_$(date +%Y%m%d).log

# Manual foreground run:
cd /Users/smarter.poker/Documents/Smarter-Poker-World-Hub
PYTHONUNBUFFERED=1 .venv/bin/python3 scripts/pokeratlas-live-daemon.py
```

## Problem-Solving Checklist

1. **Daemon not running?** → `launchctl list | grep pokeratlas` — if not listed, reload the plist
2. **0 records saved?** → Check logs for redirect detection; verify registry slugs are valid
3. **Stale data?** → Check `scrape_batch_id` in Supabase; ensure stale-batch delete is scoped to `source=eq.pokeratlas`
4. **Cross-source data wipe?** → NEVER delete without `source=eq.pokeratlas` filter
5. **Session crash?** → Daemon auto-reconnects with exponential backoff; `KeepAlive: true` in launchd
6. **New regions added to PokerAtlas?** → Run discovery script; update `data/pokeratlas-room-registry.json`
7. **Duplicate venue names?** → `bravo_slug` is prefixed with `pa-{region}` to avoid key collision with Bravo
