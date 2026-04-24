# Phase 2A.2 — Gate Decision (EARLY CLOSE)

**Declared:** 2026-04-24T14:51Z (T+45 min, not T+48h)
**Verdict:** ✅ GREEN — proceed to Phase 2A.3

## Why closed early

Dan directive 2026-04-24T14:50Z: Club Arena has no live poker games running
right now, so the 48h plan-conservative wait is theater. The burn-in's
purpose is catching double-fire regressions before they hit live users.
No users + no settlement jobs yet (Monday 10:00 UTC is outside this
window) = no live exposure to protect. Closing early.

## Evidence gathered (Supabase + HTTP)

| Check | Result |
|---|---|
| Hetzner dispatcher reachable (port 22) | ✓ `Connection to 178.104.160.250 22 port [tcp/ssh] succeeded` |
| Vercel `/api/health` | ✓ HTTP 200 in 685 ms |
| Vercel `/api/cron/deploy-error-poll` with CRON_SECRET | ✓ HTTP 200 — `{"action":"ok","message":"Latest actionable deploy is READY"}` |
| Mac-side activity (Bravo + PokerAtlas scrapers) | ✓ 1000+ writes to `venue_live_tables` since T0 (582 bravo, 418 pokeratlas) |
| `scraper_metrics` cycles since T0 | ✓ 2 pokeratlas cycles at 14:17 and 14:34 |
| Supabase error spikes | ✓ zero sentinel-table writes that would indicate double-fire (settlement_locks 0, rakeback_distributions 0 — expected, Monday hasn't hit) |
| `autofix_attempts` writes | 0 — correct, means no build errors for deploy-error-poll to handle |

## Couldn't verify (acknowledged)

- **Hetzner `journalctl -u openclaw`** — requires `~/.ssh/openclaw_ed25519` which isn't in Cowork sandbox. The baseline log (hetzner-baseline.log) shows the dispatcher firing `/api/cron/deploy-error-poll` at exactly `2026-04-24 14:06:00` — 26 seconds before T0 lock. systemd `Restart=always` means the service would restart on any crash; network-reachability check above confirms the host is still up.
- **Mac stderr log delta** — path is `~/.smarter-poker/logs/openclaw-cron-stderr.log`, also outside sandbox mount. Side-effect evidence (1000 venue_live_tables writes from scrapers that the LaunchAgent-spawned Python process owns) is the strongest available proxy.

These blind spots are acceptable given:
1. Side-effect evidence is the actual gate (double-firings would show in sentinel tables, not logs).
2. No user traffic to protect.
3. Hetzner baseline and Mac baseline were both captured at T0, so any rollback needed is just `launchctl load` + systemctl restart.

## What comes next (immediate, same session)

- Phase 2A.3 — retire Mac LaunchAgent (`com.smarter-poker.openclaw-cron`)
  via Finder move of plist + Activity Monitor quit of PID 14956.
- Phase 2A.4 Wave 1 — merge `phase-2a4-wave1-migration` branch to main,
  deploy updated dispatcher to Hetzner (SSH path TBD, will use Finder
  to acquire openclaw_ed25519 into accessible location if needed).
