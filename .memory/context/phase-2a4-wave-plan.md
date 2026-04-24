# Phase 2A.4 — Wave plan for migrating the 40 Vercel crons into Open Claw

**Date:** 2026-04-24
**Source of truth:** `vercel.json` `crons` array (40 entries)
**Plan reference:** `smarter-poker-optimization-plan.md` lines 255–280

This doc pre-stages Phase 2A.4 so it's a paste-in, not a re-analysis, when
2A.3 (Mac decommission) clears and 2A.4 dispatches. Nothing here touches
live state — it's a classification + per-job Open Claw trigger spec.

## Plan criteria recap

> **Wave 1 — Lowest-risk crons first** (idempotent, non-user-facing,
> tolerate missed runs): scrapers, content generation, log cleanup.
>
> **Wave 2 — Medium-risk user-facing jobs:** horse batches, social posts,
> venue alerts.
>
> **Wave 3 — Highest-risk jobs (last):** settlement, diamond economy,
> identity sync, anything hitting the atomic ledger.
>
> Migration steps per wave: add to `ALL_CRONS` + remove from `vercel.json`
> in the same PR (atomic switch), deploy, monitor 48 h, proceed to next
> wave.

## Totals

| Wave | Count | Notes |
|---|---|---|
| Wave 1 — scrapers / content gen / cleanup | 18 | Safest — idempotent, no user-visible side effects if missed |
| Wave 2 — user-facing content & notifications | 18 | Horse infra + trivia tournaments + analytics aggregates |
| Wave 3 — ledger / economy / security | 4 | `ledger-reconcile` is the atomic-ledger job the plan calls out |
| **Total** | **40** | matches `vercel.json` |

Plan says "waves of ~10 at a time." Wave 2 is large (18); if operationally
safer, split it into **Wave 2a** (the 10 horse-batch jobs — functionally
one unit) and **Wave 2b** (the other 8). Flagged but not mandatory.

---

## Wave 1 — scrapers, content generation, cleanup (18 jobs)

All jobs here either (a) write to a table with a dedup-capable key
(upsert/unique constraint), (b) produce derived caches safely re-generated
on the next run, or (c) delete rows older than a cutoff (idempotent).

| Vercel schedule | Path | Open Claw trigger_kwargs | Category |
|---|---|---|---|
| `0 4 * * *` | /api/cron/scrape-sports-clips | `dict(hour=4, minute=0)` | scraper |
| `0 6 * * *` | /api/cron/scrape-venue-info?batch=1 | `dict(hour=6, minute=0)` | scraper |
| `0 12 * * *` | /api/cron/scrape-venue-info?batch=2 | `dict(hour=12, minute=0)` | scraper |
| `0 6 * * 1,3,5` | /api/cron/scrape-venue-info?batch=3 | `dict(day_of_week='mon,wed,fri', hour=6, minute=0)` | scraper |
| `0 12 * * 1,3,5` | /api/cron/scrape-venue-info?batch=4 | `dict(day_of_week='mon,wed,fri', hour=12, minute=0)` | scraper |
| `0 18 * * 1,3,5` | /api/cron/scrape-venue-info?batch=5 | `dict(day_of_week='mon,wed,fri', hour=18, minute=0)` | scraper |
| `0 4 * * *` | /api/cron/venue-tournaments | `dict(hour=4, minute=0)` | scraper |
| `0 5 * * *` | /api/cron/refresh-venue-json | `dict(hour=5, minute=0)` | cache refresh |
| `0 */2 * * *` | /api/cron/news-scraper | `dict(hour='*/2', minute=0)` | scraper |
| `30 */3 * * *` | /api/cron/pokernews-videos | `dict(hour='*/3', minute=30)` | scraper |
| `15 */4 * * *` | /api/cron/poker-news | `dict(hour='*/4', minute=15)` | scraper |
| `59 5 * * *` | /api/cron/trivia-daily-generator | `dict(hour=5, minute=59)` | content gen |
| `0 6 * * *` | /api/cron/memory-matrix-daily-challenge | `dict(hour=6, minute=0)` | content gen |
| `5 6 * * *` | /api/cron/training-daily-challenge | `dict(hour=6, minute=5)` | content gen |
| `5 0 * * *` | /api/cron/daily-challenges | `dict(hour=0, minute=5)` | content gen |
| `0 6 * * *` | /api/cron/content-health-check | `dict(hour=6, minute=0)` | self-healing monitor |
| `30 8 * * *` | /api/cron/purge-idempotency-keys | `dict(hour=8, minute=30)` | log cleanup |
| `0 */4 * * *` | /api/cron/trivia-pvp-cleanup | `dict(hour='*/4', minute=0)` | stale-state cleanup |

**Expected 48 h post-cutover checks for Wave 1:**
- Supabase row counts on `venue_live_tables`, `news_articles`, and
  content tables match or exceed the 48 h before (scrapers producing).
- No Sentry spike in `CronError` or `ScraperTimeout`.
- `scraper_metrics.cycle_start` has entries on the expected cadence.

---

## Wave 2 — horses, social, tournaments, aggregates (18 jobs)

User-visible side effects if a run is missed (missing social post, missing
analytics row, tournament round doesn't advance). Still idempotent via
unique keys or per-run cursors — safe to re-run — but users notice gaps.

| Vercel schedule | Path | Open Claw trigger_kwargs | Notes |
|---|---|---|---|
| `0 */2 * * *` | /api/cron/horses-social-all | `dict(hour='*/2', minute=0)` | horse posts to all |
| `15 */6 * * *` | /api/cron/horses-social-friends | `dict(hour='*/6', minute=15)` | horse posts to friends |
| `5,20,35,50 * * * *` | /api/cron/horses-stories | `dict(minute='5,20,35,50')` | 4×/hr horse stories |
| `0 0 * * *` | /api/cron/horse-batch/0 | `dict(hour=0, minute=0)` | horses 0–9 |
| `30 2 * * *` | /api/cron/horse-batch/1 | `dict(hour=2, minute=30)` | horses 10–19 |
| `0 5 * * *` | /api/cron/horse-batch/2 | `dict(hour=5, minute=0)` | horses 20–29 |
| `30 7 * * *` | /api/cron/horse-batch/3 | `dict(hour=7, minute=30)` | horses 30–39 |
| `0 10 * * *` | /api/cron/horse-batch/4 | `dict(hour=10, minute=0)` | horses 40–49 |
| `30 12 * * *` | /api/cron/horse-batch/5 | `dict(hour=12, minute=30)` | horses 50–59 |
| `0 15 * * *` | /api/cron/horse-batch/6 | `dict(hour=15, minute=0)` | horses 60–69 |
| `30 17 * * *` | /api/cron/horse-batch/7 | `dict(hour=17, minute=30)` | horses 70–79 |
| `0 20 * * *` | /api/cron/horse-batch/8 | `dict(hour=20, minute=0)` | horses 80–89 |
| `30 22 * * *` | /api/cron/horse-batch/9 | `dict(hour=22, minute=30)` | horses 90–99 |
| `0 1 * * *` | /api/cron/trivia-tournaments | `dict(hour=1, minute=0)` | daily tournament lifecycle |
| `0 * * * *` | /api/cron/trivia-tournament-rounds | `dict(minute=0)` | hourly round advance + push |
| `0 8 * * *` | /api/cron/training-daily-report | `dict(hour=8, minute=0)` | per-user Jarvis report |
| `0 10 * * *` | /api/cron/commander-daily-aggregate | `dict(hour=10, minute=0)` | club analytics upsert |
| `0 */6 * * *` | /api/cron/freeroll-qualification-sync | `dict(hour='*/6', minute=0)` | freeroll eligibility upsert |

**Expected 48 h post-cutover checks for Wave 2:**
- `horses_posts` and `stories` tables advance at same rate as pre-cutover.
- `commander_analytics_daily` has 1 row per venue per day, no gaps.
- `commander_freeroll_qualifications` upserts continue; nobody loses
  existing qualification progress.
- `trivia_tournaments` rows transition open → running → archived on
  schedule; no stuck `running` rows >24 h.
- OneSignal push deliveries for tournament rounds continue without dup
  (the handler has idempotency — trust but verify via the delivery log).

---

## Wave 3 — ledger, diamond economy, identity (4 jobs)

The highest-consequence set. Any double-fire or missed fire could move
money. Cutover last, monitor for 72 h (not 48), and keep the old Vercel
entry in a feature-flagged standby state for the first 24 h before full
removal.

| Vercel schedule | Path | Open Claw trigger_kwargs | Risk |
|---|---|---|---|
| `0 8 * * *` | /api/cron/ledger-reconcile | `dict(hour=8, minute=0)` | atomic ledger reconcile |
| `0 * * * *` | /api/cron/vip-status-check | `dict(minute=0)` | revokes VIP (permission change) |
| `5 0 1 * *` | /api/cron/vip-diamond-stipend | `dict(day=1, hour=0, minute=5)` | grants 500 diamonds monthly |
| `30 3 * * *` | /api/cron/collusion-scan | `dict(hour=3, minute=30)` | writes findings that trigger admin review |

**Expected 72 h post-cutover checks for Wave 3:**
- `ledger-reconcile` runs once, writes exactly one row to
  `ledger_reconciliation_reports`, and reports zero-variance (or the
  same variance pattern as pre-cutover).
- `vip-status-check` does not revoke any user whose `vip_expires_at` is
  in the future.
- `vip-diamond-stipend` on the 1st grants exactly N × 500 diamonds where
  N is the `is_vip = true AND vip_expires_at > now` count, and writes
  exactly N rows to `chip_transactions`. (Run this check at 00:10 UTC
  on the 1st of the month.)
- `collusion-scan` produces at most the same number of alerts as the 7-d
  trailing average; any spike means data corruption.

---

## Judgment calls flagged for Dan

Two classifications are defensible either way — sanity-check before PR:

1. **`collusion-scan`** — plan puts "identity sync / atomic ledger" in
   Wave 3. This job writes to `collusion_tracking` which admins review
   manually; it does not auto-ban. I put it in Wave 3 because a false
   positive has reputational risk. Could defensibly drop to Wave 2.

2. **`commander-daily-aggregate` / `freeroll-qualification-sync`** — both
   touch the commander schema (club management) and could be argued into
   Wave 3 (they're money-adjacent: `freeroll_qualifications` affects who
   enters a freeroll, which has chip value). I put both in Wave 2 because
   the writes are upserts on clear composite keys, double-fire is a
   no-op. Dan should confirm the freeroll writes don't have any user-
   visible side effect beyond the upsert row itself.

## Operational discipline for each wave

Per plan line 268 — *"Simultaneously remove it from `vercel.json` (single
PR, atomic switch — we do NOT parallel-run Vercel + Open Claw on the
same endpoint)."*

For each wave:
1. PR adds the Open Claw entries to `ALL_CRONS` AND deletes the matching
   entries from `vercel.json` in the same commit.
2. CI must still pass (cron-governance check at `CLAUDE.md` §11).
3. Merge to main → Vercel redeploys → Vercel stops firing those paths
   → Open Claw picks them up on the next matching trigger.
4. `bash scripts/deploy-openclaw.sh` to sync the new `ALL_CRONS` entries
   to Hetzner systemd.
5. Watch 48 h (72 h for Wave 3).
6. Proceed to next wave only if green.

## Not addressed by this doc (deferred to 2A.4 execution)

- Renaming `OVERFLOW_CRONS` → `ALL_CRONS` in the dispatcher (mechanical,
  happens in the Wave-1 PR).
- SCRIPT_JOBS handling for any wave-1 items that might be local scripts
  (none of the 40 are currently SCRIPT_JOBS — all are HTTP routes under
  `/api/cron/` in the World Hub monolith).
- Vercel cron deletion order — whether to delete in the same PR or
  delete in a follow-up PR. Plan says same-PR, so that.
