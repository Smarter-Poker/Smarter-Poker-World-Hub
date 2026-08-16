# hand_history retention

**Policy: 90 days. Hands with `reported = true` are never auto-deleted.**

Enforced inside Postgres by `public.sp_prune_hand_history(p_batch int)`, scheduled
by the pg_cron job `sp_prune_hand_history_10m` every 5 minutes. There is no GitHub
Action and no Node script — see "Why not CI" below.

## Why 90 days

Every hand is treated as a real hand, horse-vs-horse included. Ninety days is the
shortest window that still covers a full monthly rakeback cycle plus a dispute
tail, keeps anti-cheat pattern history meaningful, and matches what a player
expects "my hand history" to contain. At ~1,415 bytes/row it puts a ceiling on a
table that previously had none (it reached ~6.6M rows over seven months).

To change the window, edit the interval in the function body. It appears once.

## Consumers that depend on this data

Shortening the window is a product decision, not a disk-space decision. These read
`hand_history`:

- `pages/api/club-arena/anti-cheat.js` — collusion detection, needs historical patterns
- `server/src/services/RakebackSettlerService.ts` — rakeback settlement
- `server/src/services/supabase/bbj.ts` — bad beat jackpot
- `pages/hub/hand-history.js`, `src/components/poker/HandReplayerModal.jsx`,
  `pages/api/club-arena/my-hands.js` — players reviewing their own play
- `pages/api/training/{get-sessions,gto-reports,save-session}.js`,
  `pages/hub/training/performance-heatmap.js`,
  `pages/api/assistant/leaks/detect.js` — training and leak analysis

## Why not CI (this was tried, and could not work)

A GitHub Action running a `supabase-js` script was the original approach. Removed
because of three independent defects:

1. **It never ran successfully, not once.** The workflow pinned `node-version: 20`;
   the installed `supabase-js` requires Node 22+ and throws at `createClient`:
   `Error: Node.js detected but native WebSocket not found`. It died on line 4
   before issuing a query, and would have failed silently at 03:00 UTC nightly.

2. **Even on Node 22 it would have timed out.** It issued one unchunked
   `DELETE ... WHERE created_at < cutoff`. PostgREST connects as `authenticator`,
   which carries `statement_timeout = 8s`, and `service_role` does not override it.
   Deleting ~1M rows does not finish in 8 seconds.

3. **A companion backfill script abandoned data.** After 5 failures on a slice it
   logged "Skipping slice" and advanced anyway, so those hours were never retried.

In-database avoids all three: no PostgREST timeout, no Node runtime, no secrets,
no network, and it keeps working when GitHub does not. Each call deletes at most
`p_batch` rows oldest-first via `idx_hand_history_created` (measured: 5,000 rows
in 3.1s; the job uses 2,500), so no statement approaches a timeout and no
transaction is held open.

## Note on disk space

`DELETE` does not return space to the operating system. Autovacuum makes it
reusable, which is what bounds the table — the file does not shrink without
`VACUUM FULL` or `pg_repack`, both of which take heavy locks. Retention stops
growth; it does not reclaim.

**`hand_history` is also not what is consuming the database.** Measured
2026-08-16: the database is 83 GB, of which `solved_spots_gold` is 62 GB
(3.5 GB heap + 57 GB TOAST across 8.1M rows) and `hand_history` is 10 GB.
Deleting every hand ever played would take 83 GB to 73 GB. The quota question is
a `solved_spots_gold` architecture question, not a hand-history one.
