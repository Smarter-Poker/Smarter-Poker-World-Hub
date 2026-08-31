# Stats Maintenance Dispatcher Timeout

## TL;DR

The scheduled Club Stats maintenance handler allowed 150 seconds of rebuild
draining, but its Open Claw caller stopped waiting after 120 seconds. The
19:45 UTC production cycle on 2026-08-31 timed out at exactly 120 seconds after
the two previous successful cycles had already taken 102.1 and 97.6 seconds.

The handler now gives resumable rebuild work a 60-second wall-clock budget and
recomputes each club's share from the time actually remaining. Production then
showed why a drain-only budget was insufficient: the 20:30 UTC cycle took
115.5 seconds, leaving only 4.5 seconds before the caller timeout. A 90-second
whole-handler target now stops optional scheduling at 75 seconds and reserves
the next 15 seconds for post-drain work and the response. A cross-file test
keeps that 90-second whole-request target at least 30 seconds inside the caller
deadline.

## Evidence

Production `journalctl -u openclaw.service` reported:

- 19:15 UTC: HTTP 200 in 102.1 seconds
- 19:30 UTC: HTTP 200 in 97.6 seconds
- 19:45 UTC: timeout after 120 seconds
- 20:15 UTC after the first fix: HTTP 200 in 90.6 seconds
- 20:30 UTC after the first fix: HTTP 200 in 115.5 seconds (insufficient margin)

The scheduler remained active with `NRestarts=0` and `ExecMainStatus=0`; the
failure was the request budget mismatch, not a dead scheduler.

## Root Cause

`pages/api/cron/club-stats-maintenance.js` set
`DRAIN_BUDGET_SECONDS = 150` based only on Vercel's 300-second function limit.
`scripts/openclaw-cron-dispatcher.py` independently set
`REQUEST_TIMEOUT = 120`. The handler also enforced a 20-second minimum per
club, which could make aggregate drain time exceed the nominal total when
enough clubs had backlog.

## Resolution

- Limit resumable drain work to 60 wall-clock seconds.
- Target a 90-second whole-handler finish, 30 seconds below the caller.
- Stop optional scheduling at 75 seconds and reserve the next 15 seconds for
  post-drain work and the HTTP response.
- Recalculate the per-club allowance before every RPC from the remaining time
  and remaining clubs.
- Report `budget_exhausted` when resumable work is deferred to the next cycle.
- Keep at least 30 seconds between the whole-handler budget and the caller
  timeout in a regression test.
- Verify the deployed endpoint by observing a subsequent Open Claw fire cycle
  complete with HTTP 200 inside 120 seconds.

No database migration or new infrastructure is involved.
