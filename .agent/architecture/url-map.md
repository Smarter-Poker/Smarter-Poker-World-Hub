# Smarter.Poker URL → Repo → Push-path Map

**Source of truth.** Maintained 2026-04-27. Updated by `~/Documents/SMARTER-POKER-PLATFORM-CONSOLIDATION.md` Phase 6 + Club Arena deep-verification 2026-04-27. **Club Arena rows corrected 2026-09-03** to match `Smarter-Poker-Club-Arena/CLAUDE.md` section 1.1: the Vite bundle is published by `publish-club-arena.yml` to its own static origin (`ca-static.smarter.poker`, Caddy on the estate runner); this repo carries ONE rewrite to it and nothing is committed here. There is no `vercel --prod` step anywhere in Club Arena's path any more.

This file answers exactly one question: **"I want to change behavior at URL X — which repo do I edit, and where does my push end up?"**

If your change isn't covered by a row below, STOP and ask before inventing a new push path. Adding a new URL or new Vercel project requires updating this file in the same PR.

---

## Push-path matrix

| Change at this URL/surface | Edit which repo? | Branch | Deploy mechanism | Visible at |
|---|---|---|---|---|
| `smarter.poker/` (homepage, hub UI, /api/* except /api/commander/* and /api/club-arena/*) | `Smarter-Poker/Smarter-Poker-World-Hub` | `main` | git push → Vercel auto (`hub-vanguard`) | https://smarter.poker |
| `smarter.poker/commander/*` (UI) | `Smarter-Poker/smarter-poker-commander` | `main` | git push → Vercel auto (`smarter-poker-commander`), proxied via World Hub rewrite | https://smarter.poker/commander/ |
| `smarter.poker/api/commander/*` (Commander API) | `Smarter-Poker/smarter-poker-commander` | `main` | same as above (rewrite) | https://commander.smarter.poker/api/* |
| **`smarter.poker/api/club-arena/*`** (67 endpoints — cashier, club admin, agent, union, marketplace, settlement, anti-cheat, BBJ) | **`Smarter-Poker/Smarter-Poker-World-Hub`** (Tier 3) | `main` | **git push → Vercel auto (`hub-vanguard`)** | https://smarter.poker/api/club-arena/* |
| `smarter.poker/hub/club-arena/*` (Vite frontend assets) | `Smarter-Poker/Smarter-Poker-Club-Arena` (root) | `main` | push a branch -> autopilot merges -> `publish-club-arena.yml` rsyncs `dist/` to `ca-static.smarter.poker` (`/srv/club-arena/releases/<sha>/`, atomic `current` symlink). World Hub rewrites `/hub/club-arena/:path*` to that origin. Verify: `curl -s https://smarter.poker/hub/club-arena/build-info.json` -> `ca_sha` equals main. **No `vercel --prod`.** | https://smarter.poker/hub/club-arena/ |
| `engine.smarter.poker` (WebSocket game server) | `Smarter-Poker/Smarter-Poker-Club-Arena` (`server/` dir) | `main` | git push + `bash server/deploy-hetzner.sh` | wss://engine.smarter.poker |
| Cron handler logic | `Smarter-Poker/smarter-poker-workers` | `main` | git push → GitHub Action builds Docker image → systemd reload | Hetzner workers VM `178.104.180.220` |
| Cron schedule | `Smarter-Poker/Smarter-Poker-World-Hub` (`scripts/openclaw-cron-dispatcher.py`) | `main` | git push + manual `systemctl reload openclaw.service` | Hetzner openclaw VM `178.104.160.250` |
| `commander.smarter.poker` (direct domain) | `Smarter-Poker/smarter-poker-commander` | `main` | same as `/commander/*` row | https://commander.smarter.poker |
| `club.smarter.poker` (vanity redirect) | `Smarter-Poker/Smarter-Poker-Club-Arena` (rewrite block in `vercel.json`) | `main` | same publish path as the row above (the redirect config ships with the bundle) | redirects to `smarter.poker/hub/club-arena/` |

---

## Club Arena three-tier split (matches ClubGG / PokerBros / WPT pattern)

```
TIER 1 — Realtime game engine:    Smarter-Poker-Club-Arena  (server/)  →  Hetzner CPX11
TIER 2 — Player UI (Vite):        Smarter-Poker-Club-Arena  (src/)     →  ca-static.smarter.poker (Caddy static origin, via World Hub rewrite)
TIER 3 — Operations REST API:     Smarter-Poker-World-Hub   (pages/api/club-arena/*) → Vercel hub-vanguard
```

For the Tier 3 inventory of all 67 endpoints (cashier, club admin, agent, union, marketplace, settlement, anti-cheat, BBJ, etc.), see `.agent/architecture/club-arena-operations-api.md` in this repo.

For the Tier 1 + Tier 2 deploy procedures, see `Smarter-Poker-Club-Arena/.agent/architecture/deploy-paths.md`.

---

## Hard rules (enforced by pre-push hooks)

1. **NEVER push to `Smarter-Poker/Club-Arena-Design`.** Archived (read-only) as of 2026-04-27. Its old Vercel project (`club-engine`) is deleted.
2. **NEVER add `crons` blocks to `vercel.json`** in any repo. New scheduled work goes to Open Claw → workers exclusively. `Smarter-Poker-Diamond-Arena` had a stale crons block — removed in commit `24bc2c15d` 2026-04-27.
3. **One canonical Vercel project per surface.** Active production projects (after 2026-04-27 consolidation): `hub-vanguard`, `smarter-poker-commander`, `club-arena`. Plus 4 KEEPs (`master-bus`, `identity-dna-engine`, `gto-training-engine`, `social-hub-v2`). Total 7. The `smarter-poker-world-hub` dual-build, `club-engine`, `diamond-arcade`, and 8 orphan scaffolds were deleted 2026-04-27.
4. **Server-side auth only** — no client-side PIN gates, no raw `supabase.auth.getUser()` outside `src/lib/auth/*`.

---

## What deletes have already happened (2026-04-27 consolidation session)

| Action | Why |
|---|---|
| Vercel project `smarter-poker-world-hub` deleted | Dual-build duplicate of `hub-vanguard`. Owned zero custom domains. |
| Vercel project `club-engine` deleted | Broken since 2026-04-06 (11 consecutive ERROR deploys). |
| Vercel project `diamond-arcade` deleted | Connected to 6 KB scaffold, 5+ wks dormant, no custom domain. |
| Vercel projects `smarterpoker`, `bankroll-manager`, `marketplace-settings`, `poker-near-me`, `smarter-assistant`, `trivia-orb`, `social`, `training-project` deleted | Orphan scaffolds + dead twin of `social-hub-v2` + 15-wk-stale legacy projects. None had custom domains. |
| GitHub repo `Smarter-Poker/Club-Arena-Design` archived | Replaced by `Smarter-Poker/Smarter-Poker-Club-Arena` — verified no traffic. |
| `crons` block removed from `Smarter-Poker-Diamond-Arena/vercel.json` | Diamond Arena is closed; Vercel cron policy violation eliminated. |
| 10 local clones moved to `~/Documents/_decommissioned-2026-04-27/` graveyard | Reclaim disk + eliminate "which clone do I edit" ambiguity. 30-day soak window. |

---

## Last verified production status (2026-04-27)

```
HTTP 200  https://smarter.poker/                        (World Hub frontend)
HTTP 200  https://smarter.poker/api/health              (World Hub API)
HTTP 200  https://smarter.poker/api/test                (App Router pilot)
HTTP 200  https://smarter.poker/api/club-arena/health   (Tier 3 ops API)
HTTP 405  https://smarter.poker/api/club-arena/buyin    (POST-only, correct)
HTTP 200  https://commander.smarter.poker/              (Commander Orb)
HTTP 200  https://engine.smarter.poker/health           (Hetzner game server)
HTTP 307  https://club.smarter.poker/                   (vanity redirect)
HTTP 308  https://smarter.poker/hub/club-arena/         (Vite static asset proxy -> ca-static.smarter.poker since 2026-09-02)
```
