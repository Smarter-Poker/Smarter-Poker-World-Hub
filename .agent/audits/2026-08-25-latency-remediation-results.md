# Latency remediation — results, regressions found, and what is left

**Date:** 2026-08-25
**Follows:** `2026-08-24-platform-latency-root-cause.md` (diagnosis) and
`2026-08-24-latency-remediation-plan.md` (plan)

---

## Result so far

| Metric | Before | After | |
|---|---|---|---|
| Oversubscription | **1.80x** | **1.14x** | queries still queue, but far less |
| `hand_history` INSERT mean | **855 ms** | **55.6 ms** | **15x faster** |
| `bbj_record_contribution` | **1201.840 ms** | **0.180 ms** | 6,600x, `EXPLAIN ANALYZE` verified |
| Cache hit ratio | 97.59% | **98.66%** | target is 99.9% |

Measured on a fresh `pg_stat_statements` window that began at the database
restart. Short window, so treat the ratio as indicative; the per-statement
numbers are solid.

---

## STILL BLOCKED: the compute upgrade has not applied

The database **did restart** at 2026-08-25 00:25 UTC (uptime confirmed at 21.6
minutes when checked). The settings did not change:

| Setting | Reading | Same as before restart? |
|---|---|---|
| `max_parallel_workers` | **2** | yes |
| `shared_buffers` | **1 GB** | yes |
| `effective_cache_size` | **3 GB** | yes |
| `max_connections` | **120** | yes |
| `work_mem` | 7 MB | yes |

`get_project` reports `PokerIQ-Production`, `ACTIVE_HEALTHY`, Postgres 17.6.1,
region us-west-2 — but the management API does not expose the compute add-on
tier, so the dashboard is the only place to confirm it.

A restart happened and the size did not change, which means the add-on is either
not actually active on **this** project, still provisioning, or was purchased
against a different project in the org. **Worth checking the billing page shows
the add-on attached to `kuklfnapbkmacvwxktbh` specifically.** Everything below is
measured on 2 vCPU.

---

## Regressions I introduced yesterday, found by review and now fixed

An adversarial review of the merged perf pass found real damage. All of it came
from one root cause: **subagents editing the shared clone while it was parked on
an old branch**, so they "fixed" files against a stale base and silently reverted
newer work. Worth institutionalising: agents get a worktree cut from
`origin/main`, never the shared clone.

### P0 — avatar scope was silently reverted (WH PR #727)

The perf commit reverted #699. The `scope` parameter was dropped from
`selectPresetAvatar` and `setActiveAvatar`, and the scoped `updateData` builder
became a bare `{ avatar_url }` update. Callers in `AvatarGallery.jsx` still
passed `scope`, so:

- **preset avatars wrote nothing at all** to `profiles` — `updateData` stayed
  empty and failed its own length guard;
- **custom avatars always wrote the social column**, never `arena_avatar_url`.

That left `profiles.arena_avatar_url` with **no writer anywhere in the estate**,
while Club Arena reads it in 20+ places including the seat renderer
(`server/src/services/supabase/tables.ts` aliases `avatar_url:arena_avatar_url`).
A player changing their avatar would never see it change at a poker table again.

### SECURITY — cross-user cache leak in the new header-stats memo (WH PR #727)

`src/lib/headerStats.js` was a bare module singleton with **no user key**, and
`invalidateHeaderStats` had **no call site**. The payload carries diamonds,
`avatar_url`, VIP flag, `is_admin`, notification count and unread messages.

- Resolved cache: sign-out then sign-in inside 5 s served the new user the
  previous user's payload.
- In-flight promise, worse: a request issued under the old bearer token could be
  joined by the new user's callers, because `inflightForced` let any later forced
  caller join a forced request *of any age*.

Now keyed by owner, cleared on identity change, wired to the existing
`SIGNED_OUT` handler, and only the current in-flight request may write the cache.

### Other confirmed defects fixed

| Where | Defect |
|---|---|
| `get-header-stats.js` | perf pass dropped `order+limit(200)` on the conversations query. Its result feeds a `.in()`, which PostgREST sends as a **URL parameter** — a few thousand conversations means a 414 and total endpoint failure. Restored. |
| `get-header-stats.js` | dropped `ORDER BY` on the bounded unread scan. A bare `LIMIT` in Postgres returns **arbitrary rows**, so the badge could under-report. Restored. |
| `marketplace-purchase.js` | `requireEmailVerified` reads `email_confirmed_at`, which is **not a JWT claim**. Once auth went local-first the gate rejected **every** user — a hard 403 on every marketplace purchase. Added the DB fallback its three sibling store endpoints already carry. Confirmed no other endpoint has the gate unguarded. |
| `eggs/evaluate.js` | verifying all keys up front meant a user at their monthly cap paid the **full** verifier workload to award nothing, since the cap-stop is only knowable from an award result. Verify and award now interleave per chunk — keeps the 5-wide concurrency, restores the early stop. |
| `useEasterEggSweep.js` | a **future** timestamp (clock skew or tampering) blocked the sweep until wall-clock caught up; and the throttle was written **before** the `res.ok` check, so a 429/5xx burned the full window having evaluated nothing. |
| `WorldHub.tsx` | derived-avatar effect only ever set, never cleared — a removed avatar persisted until reload. |
| `TournamentAutoSeat.tsx` | I had stretched the poll 12s to 45s. That file is marked **BINDING** and says the poll exists because *"a missed socket frame here means a player misses a tournament they paid for"*. Reverted to 12s; the load saving now comes entirely from the visibility gate, which is strictly better (hidden tabs poll not at all and check immediately on return). |
| `PromotionsPage` / `SettlementPage` | `...(resolved ? { filter } : {})` silently widened to an **unfiltered** subscription whenever a club slug failed to resolve — restoring the exact platform-wide firehose the scoping removed. The firehose test is static and cannot see a runtime widening. No scope now means no subscription. |
| `ChunkPreloader.ts` | `MultiTablePage` was dropped from `CRITICAL_CHUNKS` on the stated grounds that `ROUTE_CHUNKS` already warmed it — true of `TablePage` only, so the first table open after boot blocked on a cold chunk. And the `shouldPreload()` gate wrapped the whole function, skipping the **deck warmer** too, which has its own more permissive guard; Chrome reports `'3g'` on plenty of usable mobile, so those users never warmed their card deck. |
| `TournamentStartingTicker.tsx` | missing `ORDER BY` on a bounded query. Also **documented, not changed**: `.in('status', ['REGISTERED'])` has always matched zero rows — production `tournament_players.status` only holds `eliminated` (73k), `winner` (12k), `playing` (1k). That badge has never rendered. Correcting it is a product decision, flagged for Dan. |

---

## New optimisation shipped today

**Member-fee rollup capped at a 50% duty cycle** (`server/src/index.ts`).

It was **13.7% of all database time** — 12 calls in 9 minutes at 15,289 ms mean,
with **565,894 hands still to roll up**, roughly 11 more hours at that rate.

The batch size was not the problem. A 250-hand batch had drifted from the 5.7 s
recorded on 2026-08-23 to 15.3 s, while the loop still slept a flat 2 s between
calls — an **~88% duty cycle**. On 2 vCPU this one reporting rollup was holding
roughly half the platform's query capacity while people were playing.

A longer fixed delay would waste real idle capacity when the database is quiet.
Instead the loop now sleeps at least as long as the batch it just ran, so it
self-tunes: fast when the database is fast, backing off exactly when it is slow —
which is precisely when live play needs the core.

---

## What is left, in order

1. **Confirm the compute add-on is attached to this project** (see blocker).
2. **Realtime WAL decoding is now the single largest consumer at 33.8%** of all
   database time (1,626 calls, 279 ms mean). The `REPLICA IDENTITY` fix already
   took the mean down from 355 ms. Remaining levers: `tournaments` is still on
   `FULL` (deliberately — no unique non-partial index covers `club_id`/`union_id`,
   so neither `DEFAULT` nor `USING INDEX` can preserve its DELETE filters), and
   the publication still carries ~86 zero-write tables that cost nothing at
   runtime but should be pruned for hygiene.
3. **`PENDING-REVIEW_20260824_perf_rakeback_stats_batch_set_based.sql`** — written,
   deliberately not applied. It mutates `player_stats.total_rake`, which feeds
   rakeback payouts. Check the rounding paragraph in its header, then apply.
4. **Remaining batch jobs**: `fn_credit_agent_commissions_batch` (same per-item
   loop shape as the rakeback one), `fn_reconcile_tournament_denormals`,
   `ca_refresh_hand_player_index`, `fn_credit_stalled_seat_first_stacks`.
5. **Six admin pages still have unfiltered subscriptions** — all genuinely global
   views with no scoping key in scope, so the fix is to give the page a scope,
   not to invent a filter. Low volume, left deliberately.

---

## How to re-measure

```sql
select pg_stat_statements_reset();   -- then wait a full busy hour

select round(sum(total_exec_time)::numeric/3600000,3) as core_hours_used,
       round(((select setting::int from pg_settings where name='max_parallel_workers')
              * extract(epoch from (select now()-stats_reset from pg_stat_statements_info))/3600)::numeric,3)
         as core_hours_available
  from pg_stat_statements;
```

Below 1.0x means queries no longer queue for CPU.
