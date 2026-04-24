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

## Follow-up finding — SCRIPT_JOBS deployment gap on Hetzner

The idempotence verdicts above are about **correctness if both dispatchers
fire**. Separate question: does the Hetzner dispatcher actually *have* the
code to fire each job?

For the 12 HTTP crons: yes — `fire_cron()` just hits
`https://smarter.poker{path}` with the CRON_SECRET. No local file
dependency.

For the 4 SCRIPT_JOBS: **no**. The dispatcher references
`SCRAPER_PY = Path.home() / 'Documents' / 'Smarter-Poker-World-Hub' /
'scripts' / 'video_library_scraper.py'`. That path exists on Dan's Mac.
On Hetzner (home dir is `/home/openclaw`, systemd unit runs as user
`openclaw`), the path does not exist. `deploy-openclaw.sh` only syncs
`dispatcher.py` — it does not push `video_library_scraper.py` or any of
its Python dependencies. Every SCRIPT_JOB firing on Hetzner would hit
`FileNotFoundError` under `subprocess.run()` and log an error into
journalctl, polluting the burn-in signal for the 12 HTTP crons that do
work.

### Resolution shipped with this addendum

`scripts/openclaw-cron-dispatcher.py` now has a
`should_skip_on_secondary(path, role)` helper and a registration-time
guard. When `DISPATCHER_ROLE=secondary`, the 4 SCRIPT_JOBS are skipped at
registration with a single log line each:

```
Skipping 4 SCRIPT_JOBS on secondary (SCRAPER_PY is Mac-only)
  Skipped (secondary, SCRIPT_JOB): /api/cron/video-library-scraper
  Skipped (secondary, SCRIPT_JOB): /api/cron/video-library-backfill
  Skipped (secondary, SCRIPT_JOB): /api/cron/video-library-purge
  Skipped (secondary, SCRIPT_JOB): /api/cron/video-library-views
Registration complete: 12 registered, 4 skipped
```

Mac (primary) continues to register all 16.

### Burn-in implication

Phase 2A.2 parallel-run covers **12 of 16 jobs**. The 4 video-library
SCRIPT_JOBS stay Mac-only until Phase 2B.2 HTTP-ports them to the
`smarter-poker-workers` repo, at which point they become normal HTTP
crons and this guard becomes a no-op (SCRIPT_JOBS set becomes empty).

This means the AG 2A.2 prompt's "all 12 jobs executing from both
dispatchers" criterion is accurate — the original plan line 235 said
"12 overflow crons", the 4 SCRIPT_JOBS were added after the plan was
written and should not be counted toward the parallel-run success
criterion.

### Test evidence

Inline smoke test covered:

1. `should_skip_on_secondary` returns True for all 4 SCRIPT_JOBS on
   secondary, False on primary, False for all HTTP paths.
2. `SCRIPT_JOBS` keys equal exactly the 4 video-library paths.
3. `apply_stagger_if_secondary` regression: 3/3 (staggered on secondary,
   untouched on primary, wildcard-minute preserved).
4. `main()` loop simulation: primary registers 16/skips 0, secondary
   registers 12/skips 4.

All 4 test groups pass.
