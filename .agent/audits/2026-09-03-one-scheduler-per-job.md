# One scheduler per job (2026-09-03)

Audit of every scheduled job on the platform, from the Hetzner dispatcher's
own 24-hour journal (37,706 lines), pg_cron, vercel.json, and the boxes.

## Found and fixed tonight

1. **A second dispatcher.** `openclaw.service` was running on the ENGINE box
   (5.161.252.33) with a stale copy of `dispatcher.py` (85 jobs, no env, no
   scripts): 8,871 calls a day at Vercel, 5,791 rejected with 401 (rotated
   secret) and 3,080 executed a second time - `hard-stop` 1,440x/day,
   `deploy-error-poll` 720x, `bbj-detect` 288x, `tournament-bounty-detect`
   144x, the anti-cheat sweeps 48x each. Stopped, disabled, moved to
   `/opt/_retired/`. The one dispatcher is on `openclaw-server-ip`.
2. **`player-stats-refresh` on two schedulers, one unable to finish.** The
   Open Claw HTTP job asked for a 26-hour window (~130s) against PostgREST's
   8s cap: 24 fires, 24 timeouts, every day. pg_cron `refresh-player-stats-hourly`
   already does the work inside Postgres (24/24 succeeded, ~10s). HTTP copy
   removed from the dispatcher.
3. **`vip-stipend` on two schedulers.** vercel.json (`0 9 1 * *`) and the
   dispatcher (daily 09:00, idempotent per user per month) both called it on
   the 1st at 09:00. vercel.json copy removed; CHECK 6a baseline 40 -> 16.
4. **`chip-supply-snapshot` timing out 18x/day**: the RPC full-scanned the
   1 GB `wallet_transactions` ledger hourly. Now incremental from the previous
   snapshot (0.058s, totals identical to a full scan to the cent); supporting
   index built CONCURRENTLY. Migration `chip_supply_snapshot_is_incremental`.
5. **`spin-sweep` 500 on 96/96 runs** - two causes. `lease_diagnostics_missing`:
   the engine router 404'd `/health?cb=...` (any query string); fixed in
   Club Arena (`fix/health-answers-a-cache-busted-request`). The double-deal
   check's 57014 is the same :00/:15 pile-up; it answers in 2.1s alone.
6. **`cron-staleness-watchdog` 404 x96/day**: the workers VM was three days
   behind main; deployed, and `auto-deploy-workers.yml` now deploys on merge.

## Still on the Mac (launchd), not Hetzner

`bravo-daemon`, `bravo-simulator`, `pokeratlas-daemon`,
`pokeratlas-tournaments-daemon`, `tournament-schedule-daemon`,
`series-scraper`, `tour-scraper`, `charity-scraper`, `completeness-scraper`,
`scraper-watchdog`, `pnm-freshness-watchdog`, `yt-cookie-refresh`,
`node-memory-boost`, `antigravity-cleanup`, `kill-playwright-zombies`.
`cardplayer-scraper` is skipped on the dispatcher host and runs nowhere.
