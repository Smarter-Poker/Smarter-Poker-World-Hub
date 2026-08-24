# Serverless functions moved to the database's region (iad1 -> pdx1)

**Date:** 2026-08-24
**Change:** `vercel.json` -> `"regions": ["pdx1"]`

## What was wrong

Vercel functions were pinned to `iad1` (us-east-1, Virginia). The Supabase
project `kuklfnapbkmacvwxktbh` is in `us-west-2` (Oregon). Every database query
from an API route was therefore a cross-country round trip of roughly 60-70ms,
and the API routes in this repo commonly issue 5-8 sequential queries, so they
paid that 5-8 times before doing any real work.

`pdx1` is Vercel's us-west-2 region, so functions now sit in the same AWS
region as the database.

## Why it was `iad1`

Commit `4673007690` (2026-05-18) pinned it as part of a Vercel **cost**
initiative. Its own message says "Vercel defaults to this for US teams anyway".
Proximity to the database was never a consideration - the value was never
chosen for latency, it was chosen to stop multi-region replication.

## Evidence (measured 2026-08-24)

| Path | Latency |
| --- | --- |
| Raw Postgres, trivial single-row query | 0.17 ms |
| Same shape via `/api/health` from `iad1`, best case | 294 ms |
| Same, warm instance under load (uptime 167-176s) | 2,117 / 2,533 / 3,548 ms |
| Same, earlier peak | 13,027 ms |

The database itself was healthy at the time: `pg_stat_activity` showed every
active query at 0.0-0.1s in `wait_event: ClientRead`, i.e. Postgres finished and
waiting on the client. The latency was in the path, not the query.

## The failed first attempt, and why this file exists

The first attempt (PR #714, commit `705f515`) **broke production deploys**. It
put the deployment into ERROR with *zero build log events* - Vercel rejected the
configuration before the build ever started. Both preview deploys of that commit
failed identically.

The cause was NOT `pdx1`. It was an extra `"_regions_note"` key added alongside
it: **`vercel.json` is validated against a strict schema and unknown top-level
properties are rejected.**

This was proven rather than guessed. Branch `test/pdx1-region-probe` pushed the
region change *alone* - same `pdx1` value, no custom key - and its Vercel commit
status came back `success`.

**So: never put commentary keys in `vercel.json`.** That is why this
explanation lives in `docs/perf/` instead. PR #715 restored `iad1` to unblock
production before this retry was made.

## Scope

- `crons` (15) and `rewrites` (2) are unchanged, so the CHECK 6 cron-governance
  gate is unaffected.
- The two `runtime: 'edge'` routes (`pages/api/og/*`) are region-independent.
- Fully reversible: set the value back to `iad1`.

Do not move this back to `iad1` without moving the Supabase project with it.
