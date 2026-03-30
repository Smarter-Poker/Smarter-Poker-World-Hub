# Context: Platform Architecture

## Vercel Multi-Project Setup

Three Vercel projects deploy from the same GitHub repo (Smarter-Poker-World-Hub):

| Project | ID | Domain | Purpose |
|---|---|---|---|
| hub-vanguard | prj_op66GkZyZcygXQKm76iyycfVFAQx | **smarter.poker** | PRODUCTION — this is the live site |
| smarter-poker | prj_FNUaJmcjRnwCSh1JzblIUYuOXDGK | (secondary) | Alternate deployment |
| smarter-poker-world-hub | — | (secondary) | Alternate deployment |

**CRITICAL**: When deploying changes to smarter.poker, you must deploy to `hub-vanguard`. The GitHub integration auto-deploys all three on push.

**Team**: Smarter-Poker (team_SVD8r7AOPH065G3usBxVvrBc) — 22 total Vercel projects

## World Hub Architecture

- **Framework**: Next.js 14 with Pages Router (NOT App Router)
- **Pages**: 952 across pages/ directory
- **API Routes**: 54 top-level directories, 716+ endpoint files
- **Cron Jobs**: 45 scheduled via vercel.json (was 57, consolidated)
- **PWA**: manifest.json + sw.js (Workbox), standalone mode

## Middleware

Located in `middleware.js`, protects:
- `/api/admin/*` — requires `x-admin-secret` matching `ADMIN_ROUTE_SECRET` env var
- `/api/debug/*` — same protection
- `/api/emergency/*` — same protection
- 7 destructive poker routes — same protection

## Club Arena

- **Stack**: React 19, Vite 6, hosted on Vercel + Hetzner
- **Game Server**: engine.smarter.poker (Hetzner Cloud, migrated from Railway)
- **V8 Bible**: Poker rules engine, ~40% compliance (up from 4%)
- **Engine Files**: 24 files in server/src/engine/
- **Tests**: 13 engine tests, 120+ unit tests, 9 E2E tests

## Database (Supabase)

- **Project**: kuklfnapbkmacvwxktbh.supabase.co
- **Key Tables**: profiles, diamond_reward_claims, diamond_balance, trivia_pvp_matches, trivia_pvp_stats, trivia_pvp_queue, venue_live_history, venue_games
- **Key RPC**: add_diamonds_to_balance (awards diamonds with logging)
- **Auth**: Supabase Auth with JWT, patched with local decode fallback

## Connected Services

- **PostHog**: Analytics (MCP suggested but not yet connected)
- **Vercel MCP**: Connected — can deploy, read logs
- **Sentry**: Error tracking (in codebase)
- **GitHub**: Via CLI (gh commands)
