# Phase 2B.2 — Cumulative Status (2026-04-25 morning UTC)

**Goal of 2B.2:** port every cron handler currently in `pages/api/cron/`
to the `smarter-poker-workers` repo's `src/routes/`, and flip the openclaw
dispatcher to fire them at `http://10.0.0.3:8081/cron/*` instead of
`https://smarter.poker/api/cron/*`.

## Routing scoreboard

`ALL_CRONS` total: **57 jobs**

| Category | Count | Routing |
|---|---|---|
| Flipped to workers (200 verified) | **18** | `WORKERS_PREFERRED` |
| Workers-ported but blocked (handler bugs / path-mismatch) | 3 | still on Vercel |
| Not yet workers-ported | 36 | still on Vercel |

## The 18 flipped (in `WORKERS_PREFERRED`)

| Path | Workers target | Notes |
|---|---|---|
| video-library-scraper | /cron/video-library-scraper | 2B.2(b), was SCRIPT_JOB |
| video-library-backfill | /cron/video-library-backfill | 2B.2(b), was SCRIPT_JOB |
| video-library-purge | /cron/video-library-purge | 2B.2(b), was SCRIPT_JOB |
| video-library-views | /cron/video-library-views | 2B.2(b), was SCRIPT_JOB |
| scraper-data-cleanup | /cron/scraper-data-cleanup | 2B.2(c) |
| purge-idempotency-keys | /cron/purge-idempotency-keys | 2B.2(c) |
| trivia-pvp-cleanup | /cron/trivia-pvp-cleanup | 2B.2(c) |
| refresh-venue-json | /cron/refresh-venue-json | 2B.2(c) |
| content-health-check | /cron/content-health-check | 2B.2(c) |
| trivia-daily-generator | /cron/trivia-daily-generator | 2B.2(c) |
| pokernews-videos | /cron/pokernews-videos | 2B.2(c) |
| venue-game-alerts | /cron/venue-game-alerts | 2B.2(d), notif |
| license-reminders | /cron/license-reminders | 2B.2(d), notif |
| scraper-watchdog | /cron/scraper-watchdog | 2B.2(d), notif |
| venue-review-prompts | /cron/venue-review-prompts | 2B.2(d), notif |
| auto-settlement | /cron/auto-settlement | 2B.2(e), money |
| auto-settlement-distribute | /cron/auto-settlement-distribute | 2B.2(e), money |
| union-rakeback | /cron/union-rakeback | 2B.2(e), money |

All 18 verified to return HTTP 200 from openclaw via private network with
Bearer + X-Forwarded-For headers. Dispatcher banner reports `Workers
routing: 18 paths → http://10.0.0.3:8081`.

## The 3 ported-but-blocked (workers-repo issues to fix)

1. **`/api/cron/daily-challenges`** — workers handler returns HTTP 500:
   ```
   "Could not find the 'bonus_xp_multiplier' column of
    'training_daily_challenges' in the schema cache"
   ```
   The workers port references a column the production Supabase schema
   doesn't have. Either roll the migration or fix the handler's INSERT.

2. **`/api/cron/deploy-error-poll`** — workers handler returns HTTP 500
   on probe. Not yet diagnosed.

3. **`/api/clawbot/orchestrator`** — the orchestrator itself returns 200
   from workers (`/cron/clawbot-orchestrator` with hyphen — naming
   difference is fine, the dispatcher value-side maps it). But the
   downstream sub-task `/api/clawbot/sentry-triage` is unreachable from
   the workers container — workers logs `"Failed to parse URL from
   /api/clawbot/sentry-triage"`. Needs a `MONOLITH_BASE_URL` env var on
   workers so the orchestrator can construct
   `https://smarter.poker/api/clawbot/sentry-triage`. Or port
   sentry-triage to workers too.

## The 36 unported (waiting on smarter-poker-workers repo)

```
horses-social-all  horses-social-friends  horses-stories
horse-batch/0  horse-batch/1  horse-batch/2  horse-batch/3  horse-batch/4
horse-batch/5  horse-batch/6  horse-batch/7  horse-batch/8  horse-batch/9
trivia-tournaments  trivia-tournament-rounds
training-daily-report  training-daily-challenge
commander-daily-aggregate  freeroll-qualification-sync
ledger-reconcile  vip-status-check  vip-diamond-stipend  collusion-scan
memory-matrix-daily-challenge
scrape-sports-clips  scrape-venue-info?batch=1..5  venue-tournaments
news-scraper  poker-news  tour-schedule-scraper  scrape-charity-schedules
hard-stop
```

These need `src/routes/<name>.ts` files in the smarter-poker-workers
repo. Per `phase-2b2-wrap-14-of-16.md` from a parallel session, the
sweep had stopped at 16/31 when scope expanded to 53 mid-session, then
to 57 with hard-stop. As of now: ~21 ported handlers in workers vs. 57
needed = parallel session has ~36 more to port.

## What unblocks Phase 2B.3 (monolith cleanup)

Per plan line 315-319: "After the last wave: 1. Delete the empty
`pages/api/cron/` directory from World Hub. 2. Remove cron-only deps
from World Hub package.json (puppeteer finally...)."

That's blocked on:
- 36 unported handlers landing in workers (parallel-session work)
- 3 broken-port handlers fixed (daily-challenges, deploy-error-poll,
  clawbot/orchestrator subtask routing)

Until both, the monolith stays the source of truth for those 39 routes
and the dispatcher continues firing them at `https://smarter.poker`.

## What I can do now from the Cowork sandbox

Nothing on-plan that's unblocked. The remaining flips depend entirely
on the workers repo getting more handlers ported AND the broken ports
fixed. That's parallel-session/handler-author work, not dispatcher
work. The dispatcher is correct: when a path is in `WORKERS_PREFERRED`,
it routes to workers; otherwise it falls through to Vercel. New paths
get added to `WORKERS_PREFERRED` one at a time as their workers handler
comes online and probes 200.

## 2026-04-25 mid-session: horse-batch path-bug investigation (FALSE POSITIVE)

The wrap doc `phase-2b2-wrap-39-of-44.md` claimed:

> pages/api/cron/horse-batch (10 dispatcher slots — but file MISSING ON
> DISK! Actual file is pages/api/cron/horse/[horseIndex].js. Dispatcher bug.)

This is incorrect. Both files exist:
  pages/api/cron/horse-batch/[batchIndex].js  (16,430 bytes)  — handles batch N
  pages/api/cron/horse/[horseIndex].js        (16,074 bytes)  — handles horse N

They are separate dynamic-route handlers for different responsibilities.

Live probe (2026-04-25T15:55Z):
  GET https://smarter.poker/api/cron/horse-batch/0 → 200
  GET https://smarter.poker/api/cron/horse/0       → 200

The 10 `/api/cron/horse-batch/N` dispatcher paths have been working
correctly the whole time. The flip blocker remains the workers-repo
port (HorseSocialEngine + HumanVoiceEngine + ClipLibrary etc., ~3000
LOC), not a path-resolution bug.

Net effect on plan: scope unchanged, but the false bug claim is
removed so future agents don't go on a wild goose chase.
