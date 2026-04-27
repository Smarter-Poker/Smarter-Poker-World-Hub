# Smarter.Poker URL → Repo → Push-path Map

**Source of truth.** Maintained 2026-04-27. Updated by `~/Documents/SMARTER-POKER-PLATFORM-CONSOLIDATION.md` Phase 6.

This file answers exactly one question: **"I want to change behavior at URL X — which repo do I edit, and where does my push end up?"**

If your change isn't covered by a row below, STOP and ask before inventing a new push path. Adding a new URL or new Vercel project requires updating this file in the same PR.

## Push-path matrix

| Change at this URL/surface | Edit which repo? | Branch | Deploy mechanism | Visible at |
|---|---|---|---|---|
| `smarter.poker/` (homepage, hub UI, /api/*) | `Smarter-Poker/Smarter-Poker-World-Hub` | `main` | git push → Vercel auto (`hub-vanguard` project) | https://smarter.poker |
| `smarter.poker/commander/*` (UI) | `Smarter-Poker/smarter-poker-commander` | `main` | git push → Vercel auto (`smarter-poker-commander` project), proxied via World Hub rewrite | https://smarter.poker/commander/ → https://commander.smarter.poker |
| `smarter.poker/api/commander/*` (Commander API) | `Smarter-Poker/smarter-poker-commander` | `main` | same as above (rewrite) | https://commander.smarter.poker/api/* |
| `smarter.poker/hub/club-arena/*` (Vite frontend assets) | `Smarter-Poker/Smarter-Poker-Club-Arena` (root) | `main` | git push + manual Vercel deploy hook (project: `club-arena`) | https://smarter.poker/hub/club-arena/ |
| `engine.smarter.poker` (WebSocket game server) | `Smarter-Poker/Smarter-Poker-Club-Arena` (`server/` dir) | `main` | git push + `bash server/deploy-hetzner.sh` | wss://engine.smarter.poker |
| Cron handler logic (any `/cron/*` job) | `Smarter-Poker/smarter-poker-workers` | `main` | git push → GitHub Action builds Docker image → systemd reload on workers VM | Hetzner workers VM `178.104.180.220` (no public DNS) |
| Cron schedule (when a job fires) | `Smarter-Poker/Smarter-Poker-World-Hub` (`scripts/openclaw-cron-dispatcher.py`) | `main` | git push + manual `systemctl reload openclaw.service` on openclaw VM | Hetzner openclaw VM `178.104.160.250` (no public DNS) |
| `commander.smarter.poker` (direct domain) | `Smarter-Poker/smarter-poker-commander` | `main` | same as `/commander/*` row | https://commander.smarter.poker |
| `club.smarter.poker` (vanity redirect) | `Smarter-Poker/Smarter-Poker-Club-Arena` (rewrite block in `vercel.json`) | `main` | manual Vercel deploy hook | redirects to `smarter.poker/hub/club-arena/` |

## Hard rules (enforced by pre-push hooks where possible)

1. **NEVER push to `Smarter-Poker/Club-Arena-Design`.** It is archived (read-only) as of 2026-04-27. Its old Vercel project (`club-engine`) is deleted.
2. **NEVER add `crons` blocks to `vercel.json`** in any repo. New scheduled work goes to Open Claw → workers exclusively. Smarter-Poker-Diamond-Arena had a stale crons block — removed in commit `24bc2c15d` 2026-04-27.
3. **One canonical Vercel project per surface.** Active production projects: `hub-vanguard`, `smarter-poker-commander`, `club-arena`. The `smarter-poker-world-hub` dual-build was deleted 2026-04-27.
4. **Server-side auth only** — no client-side PIN gates, no raw `supabase.auth.getUser()` outside `src/lib/auth/*`.

## What deletes have already happened

| Action | Date | Why |
|---|---|---|
| Vercel project `smarter-poker-world-hub` deleted | 2026-04-27 | Dual-build duplicate of `hub-vanguard`. Owned zero custom domains. |
| Vercel project `club-engine` deleted | 2026-04-27 | Broken since 2026-04-06 (11 consecutive ERROR deploys). Connected to deprecated repo. |
| Vercel project `diamond-arcade` deleted | 2026-04-27 | Connected to 6 KB scaffold repo, last deploy 5+ weeks ago, no custom domain. |
| GitHub repo `Smarter-Poker/Club-Arena-Design` archived | (already archived prior to consolidation) | Replaced by `Smarter-Poker/Smarter-Poker-Club-Arena`. |
| `crons` block removed from `Smarter-Poker-Diamond-Arena/vercel.json` | 2026-04-27 (`24bc2c15d`) | Diamond Arena is closed; crons never fired anyway (no Vercel project connected). Eliminates policy violation. |

## Where to find the full plan

`~/Documents/SMARTER-POKER-PLATFORM-CONSOLIDATION.md` on Dan's Mac. 666-line consolidation plan with phased migration, rollback procedures, URL safety verification, and the Agent Rulebook.

## Last verified production status (2026-04-27)

```
HTTP 200  https://smarter.poker/
HTTP 200  https://smarter.poker/api/health
HTTP 200  https://smarter.poker/api/test                       (App Router pilot)
HTTP 200  https://commander.smarter.poker/
HTTP 200  https://engine.smarter.poker/health
```
