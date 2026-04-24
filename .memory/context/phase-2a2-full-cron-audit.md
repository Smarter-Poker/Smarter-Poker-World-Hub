# Phase 2A.2 — Full double-fire safety audit (all 16 dispatcher jobs)

**Date:** 2026-04-24
**Plan reference:** line 235 — *"we need to confirm each one is [idempotent]"*

## Question answered for every job

*"If Mac fires this at minute N and Hetzner fires the same job at minute N+5, what is the worst thing that can happen?"*

## The 16 jobs

| Job | Schedule | Runs what? | If fired twice (5 min apart) | Verdict |
|---|---|---|---|---|
| auto-settlement | Mon 10:00 | Close settlement periods, invoice agents | Second run finds all periods `status='closed'` → skips every club. Lock table also guards. | ✅ safe (staggered anyway) |
| auto-settlement-distribute | Mon 10:10 | Agent→player rakeback, unfreeze clubs | Reads settlement_locks. Period-id unique keys on inserts. | ✅ safe (staggered anyway) |
| union-rakeback | Mon 10:20 | Weekly rakeback to union members | Postgres-atomic `fn_claim_settlement_period` idempotency key. Strongest guard. | ✅ safe (staggered anyway) |
| **venue-game-alerts** | **every hour** | Push notification when tracked game is running | Reads `alert.last_triggered`, compares to 4h cooldown, sends push, writes new timestamp. **Race window between read and write** — simultaneous fires can both pass the cooldown check and both send. | ⚠️ **needs stagger** (added) |
| **scraper-watchdog** | **every 2h** | SMS + push when venue scrapers go stale | Supabase-backed cooldown (Tier 2: 1h, Tier 3: 30min). Same read/write race if fired simultaneously — could send duplicate SMS to admin phone. | ⚠️ **needs stagger** (added) |
| license-reminders | daily 9:00 | OneSignal push for expiring gaming licenses | Gates on `dealer_documents.last_reminder_sent_at` column — updates after each send. Second run sees updated timestamps → skips already-notified docs. | ✅ safe |
| scraper-data-cleanup | daily 3:00 | DELETE rows older than 90 days | `DELETE WHERE timestamp < X` is naturally idempotent. Second run deletes zero rows. | ✅ safe |
| venue-review-prompts | every 6h | Prompt users to leave venue review | Gates on `review_prompt_sent=false` flag. Updates to `true` after send. Second run skips flagged rows. | ✅ safe |
| tour-schedule-scraper | every 3 days 4:00 | Python scraper process | SCRIPT_JOB — invokes local Python. Python handles its own dedup via DB unique constraints. | ✅ safe |
| scrape-charity-schedules | every 3 days 3:00 | Python scraper process | Same pattern as tour-schedule-scraper. | ✅ safe |
| deploy-error-poll | every 2 min | Autofix bot poller | 14 distinct idempotence guards in the handler. Designed for exactly-once semantics across retries. | ✅ safe |
| clawbot/orchestrator | daily 7:00 | Dispatches to downstream task endpoints | Pure dispatcher — safety depends on sub-tasks, which are all safe per the list above. | ✅ safe |
| video-library-scraper | daily 6:00 | Python RSS ingest | SCRIPT_JOB. Writes to `data_audit_log` with unique record_id per run. DB-level dedup on the video table. | ✅ safe |
| video-library-backfill | Sat 23:00 | Python backfill | SCRIPT_JOB. Same pattern. | ✅ safe |
| video-library-purge | Sun 00:00 | Python cleanup | SCRIPT_JOB. DELETE operations naturally idempotent. | ✅ safe |
| video-library-views | Fri 22:00 | Python view-count refresh | SCRIPT_JOB. Updates are upserts — re-running is a no-op delta. | ✅ safe |

## Decision: 5 jobs get the stagger (up from 3)

Original audit flagged only the 3 Monday-morning money-movement jobs. Full audit
identified 2 more where a simultaneous fire could produce a duplicate user-facing
notification (SMS, push):

- `venue-game-alerts` — duplicate push to same user for same match
- `scraper-watchdog` — duplicate SMS to Dan's phone + duplicate admin push

Mac (primary) fires at original minute; Hetzner (secondary) fires 5 min later.
This closes all 5 race windows without changing any handler code.

## The 11 jobs that don't need stagger

All 11 have one or more of:
- DB-level unique constraint or cursor-based dedup
- Idempotent DELETE-by-cutoff
- `column_name = false` → update → `column_name = true` flag pattern
- SCRIPT_JOB (dedup lives in the Python process)

They're safe to fire concurrently on both dispatchers. The 48 h burn-in
should show zero duplicate side effects from any of them.

## How to verify during the burn-in

Same Supabase delta check the AG 2A.2 prompt already does, plus:

- **Twilio** — check the SMS log for the 48 h window. Expect ≤ N SMS
  per scraper alert event (where N is # of staleness tiers crossed),
  not 2×N. Twilio web console has the record.
- **OneSignal** — check the push delivery log. Expect unique `external_id`
  (user_id) per alert event, not duplicates.
- **`alert.last_triggered` distinct values** — sample a few
  venue_game_alerts rows before/after a known double-fire window,
  confirm last_triggered advanced once, not twice.

## Code artifact shipped alongside this doc

`scripts/openclaw-cron-dispatcher.py` STAGGERED_JOBS set grew from 3 to 5
entries in the same commit. The stagger is env-gated (`DISPATCHER_ROLE=secondary`)
and logs `[STAGGERED]` next to each affected schedule at startup so
journalctl confirms which variant is active.
