# Club Arena — Session State (2026-04-13)

**Type:** CONTEXT
**Date:** 2026-04-13
**Purpose:** Handoff state for next Cowork session. Read this FIRST.

---

## CRITICAL BLOCKER: CORS on engine.smarter.poker

**Status:** Server is running and reachable via curl/web_fetch, but BROWSERS block all requests because CORS headers are missing.

**Proof:**
- `web_fetch https://engine.smarter.poker/health` returns HTTP 200 with JSON
- Browser `fetch('https://engine.smarter.poker/health')` returns "Failed to fetch" (CORS)
- `mode: 'no-cors'` returns opaque response (server responds, browser blocks reading it)
- DNS is correct: `engine.smarter.poker` resolves to `178.156.160.206`
- No Hetzner firewalls configured

**Impact:** EVERY action button (fold, check, call, raise), heartbeat, WebSocket, and straddle toggle fails. The game is completely unplayable. Players can SEE the table (via Supabase Realtime) but cannot ACT.

**Fix Required:** Add CORS headers to the reverse proxy (Caddy) or Node.js server on Hetzner. Must allow:
- Origin: `https://smarter.poker`
- Methods: GET, POST, PUT, DELETE, OPTIONS
- Headers: Content-Type, Authorization
- Credentials: true
- OPTIONS preflight: respond 204

**To fix via SSH:**
```bash
ssh root@178.156.160.206
# Check current reverse proxy
cat /etc/caddy/Caddyfile 2>/dev/null
systemctl status caddy
# OR check nginx
cat /etc/nginx/sites-enabled/* 2>/dev/null
# Fix Caddy config to add CORS headers (see below)
```

---

## What's Working

1. **Hole cards writing to DB** — `table_hole_cards` table recreated, RPC `insert_hole_cards` working, 95 rows confirmed
2. **Hole cards rendering on client** — Hero sees King of spades, 7 of spades (confirmed via screenshot)
3. **Community cards rendering** — Flop showing correctly (3d, 5d, 8c)
4. **CSS overrides deployed** — White dealer button, centered BBJ, oval table, piled pot chips
5. **Game server running** — 18 tables, 569 hands dealt, uptime 1561s
6. **Action panel shows** — CHECK/FOLD, CHECK, CALL ANY buttons visible

## What's Broken

1. **CORS** (blocker #1) — All HTTP to engine.smarter.poker blocked by browser
2. **Action buttons do nothing** — Because CORS blocks the fetch to /action endpoint
3. **Auto-fold timeout** — Client-side 15s timer fires, sends fold via HTTP, also CORS-blocked
4. **HydraService errors** — Hundreds of `seatHorse.logTransaction` and `chip_ledger_write_failed`
5. **Supabase Realtime drops** — Watchdog reports connection lost periodically
6. **WebSocket fails** — Cannot add presence callbacks after subscribe()
7. **Card positioning** — Hero hole cards render ON TOP of avatar, should be to the RIGHT
8. **Dealer button** — Still red dot on some views, should be white "D"
9. **Multiple tables running** — 18 tables active, should be 1 for testing

## Key Files

- **Club Arena source:** `/Users/smarter.poker/Documents/club-arena/src/`
- **World Hub:** `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/`
- **Game server on Hetzner:** `/opt/club-arena/server/src/`
- **SeatSlot.tsx:** Card positioning component (`seat__cards--hero` CSS)
- **GameServerAPI.ts:** All HTTP calls to engine.smarter.poker
- **TablePage.tsx:** 6000+ line main component, action handlers at ~line 4050
- **useTableTimer.ts:** Client-side 15s countdown, auto-fold on expire
- **PokerBros spec:** `docs/POKERBROS_CLONE_SPEC.md`
- **Upgrade plan:** `POKERBROS-PARITY-UPGRADE-PLAN.md`

## Credentials

- **Hetzner SSH:** `ssh root@178.156.160.206` (key-based auth)
- **Hetzner API Token:** `yKYOvufn7iTRIhFlB9TnSIdUYiqTCA3YtEqTmxPwvxpCIBjBFgAYIDNYv7aMi646`
- **Hetzner Server ID:** 125093929
- **Supabase Project:** `kuklfnapbkmacvwxktbh`
- **Test Account:** daniel@bekavactrading.com / Bek454545!!
- **GitHub Token:** `[REDACTED_GH_TOKEN]`
- **Vercel Deploy Hook:** `https://api.vercel.com/v1/integrations/deploy/prj_op66GkZyZcygXQKm76iyycfVFAQx/Tw4O1eDeVc`

## Dan's Rules (NEVER FORGET)

- NEVER say things "look good" — everything is broken until proven otherwise
- NEVER use the word "bot" — use "horses"
- NEVER use emoji in UI code
- NEVER stop to ask for help — figure it out or create an Antigravity prompt
- Design MOBILE-FIRST (95% phone users)
- PokerBros is the reference — clone it but better
- ONE working hand of poker is the #1 priority
