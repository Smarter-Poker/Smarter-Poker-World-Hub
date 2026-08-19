# 2026-08-19 22:38-22:43 UTC — site-wide PostgREST 503 (PGRST002)

## Symptom
Every PostgREST request returned 503 `PGRST002 "Could not query the database
for the schema cache. Retrying."` — not one endpoint, ALL of them (plain
`/rest/v1/profiles` reads included). `/api/health` reported `degraded` with
`db: error`, then recovered to `ok` while PostgREST was still 503, because the
health check talks to Postgres directly and does not go through PostgREST.

## Cause: a pending ACCESS EXCLUSIVE lock on `public.tables`
Postgres queues lock requests in arrival order, and a *waiting* ACCESS
EXCLUSIVE request blocks every lock request that arrives after it — including
plain `AccessShare` reads. Observed chain:

    pid 968094  ca_backfill_club_hand_daily(SHARK CLUB, ...)  AccessShare  GRANTED   (4m15s and counting)
    pid 968826  "begin; -- apply sql from post body" (DDL)    AccessExclusive  WAITING (blocked by 968094)
    pid 968822  PostgREST 14.1  SELECT ... FROM "public"."tables"  AccessShare  WAITING (blocked by 968826)

PostgREST needs `public.tables` to build its schema cache. With its read stuck
behind the pending DDL, the cache could not be built, so every request failed
with PGRST002 regardless of which table it targeted. 18 sessions were blocked
at peak.

The DDL kept retrying, and each retry parked a fresh ACCESS EXCLUSIVE request
at the head of the queue, so the outage was self-sustaining rather than
transient.

## Not caused by the leaderboard work
The leaderboard migrations completed long before (21:58) and hold no locks.
The blocking pair was `ca_refresh_hand_player_index` /
`ca_backfill_club_hand_daily` (the Player Stats / club dashboard work) plus the
DDL retrying against `tables`.

## Resolution
`pg_cancel_backend` on the waiting DDL (968014, then the cycle re-formed as
968826). The long backfill (968094) finished on its own moments later; once no
exclusive request was parked at the head of the queue, the queue drained
immediately. Verified: 0 ungranted locks on `tables`, `/rest/v1/profiles` 200,
`fn_club_leaderboard_period_v2` 200 with live rows, `/api/health` ok.

Cancelling a *waiting* DDL is safe — it never acquired its lock, so nothing was
partially applied; the transaction simply rolls back and the migration can be
re-run.

## How to avoid the recurrence
1. **Never run a long-running query that touches `public.tables` at the same
   time as DDL on it.** `tables` is on PostgREST's schema-cache path, so
   exclusive locks there take the whole API down, not just that table.
2. Set a lock timeout on migrations so a DDL that cannot get its lock fails
   fast instead of parking at the head of the queue and stalling all reads:

       SET lock_timeout = '3s';   -- at the top of any migration touching a hot table

3. Chunk long backfills (`ca_backfill_club_hand_daily` was running minutes per
   call) so they do not hold `AccessShare` for minutes at a time.
4. Diagnosing this shape quickly:

       SELECT pid, mode, granted, pg_blocking_pids(pid)
       FROM pg_locks l JOIN pg_class c ON c.oid=l.relation
       WHERE c.relname='tables' ORDER BY granted DESC;

   A `granted=false` ACCESS EXCLUSIVE row with PostgREST queued behind it is
   this exact outage.
