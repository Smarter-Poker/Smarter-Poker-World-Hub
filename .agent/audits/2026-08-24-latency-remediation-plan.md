# Platform latency remediation — plan and status

**Date:** 2026-08-24
**Companion to:** `.agent/audits/2026-08-24-platform-latency-root-cause.md`
**Scope:** every item that audit identified, with what shipped, what is pending, and why.

---

## The number we are moving

| | |
|---|---|
| Query execution demanded | **49.39 core-hours** (13.74 h window) |
| CPU capacity available | **27.48 core-hours** (2 vCPU) |
| Oversubscription | **1.80x** |

Roughly half of that demand is waste. This plan removes the waste; the compute
upgrade covers the rest.

---

## BLOCKER: the compute upgrade has not taken effect

Read live from `pg_settings` at 2026-08-25 00:10 UTC, **after** the upgrade was
purchased:

| Setting | Reading | Expected on a larger tier |
|---|---|---|
| `max_parallel_workers` | **2** | 4+ |
| `shared_buffers` | **1 GB** | 2-4 GB |
| `effective_cache_size` | **3 GB** | 6-12 GB |
| `max_connections` | **120** | 160-400 |

These are byte-identical to the pre-purchase readings. Supabase compute changes
require a **database restart** to take effect - buying the add-on alone does not
apply it. Until that restart happens the platform is still running on 2 vCPU and
none of the capacity that was paid for exists.

**Action for Dan:** Supabase Dashboard -> Project Settings -> Compute and Disk ->
confirm the add-on shows as active, then apply the pending restart. Re-run the
verification query in the "How to verify" section below afterwards.

---

## Shipped and verified

### Database - applied to production, assertions green

| # | Change | Measured effect |
|---|---|---|
| 1 | `bbj_record_contribution` lookups made indexable + `idx_bbj_contrib_pool_nullhand` | **1201.840 ms -> 0.180 ms**, 79,330 buffers -> 12 (`EXPLAIN ANALYZE`) |
| 2 | 7 never-read indexes dropped (0-10 scans in **7 months**) | `bbj_contributions` 9 idx/135 MB -> 5/100 MB; `rake_records` 11/388 MB -> 9/322 MB |
| 3 | `idle_in_transaction_session_timeout = 60s` on the `authenticator` role | A wedged transaction can no longer hold a lock forever |
| 4 | `idx_hand_history_players_gin` `gin_pending_list_limit` 4 MB -> 32 MB | `hand_history` INSERTs buffer instead of doing full GIN maintenance inline |
| 5 | **`REPLICA IDENTITY` fix on the two largest published tables** | see below |

**#5 is the largest realtime win and deserves its own note.** `table_hole_cards`
(529k writes) and `tournament_players` (528k writes) - 78% of all published write
traffic - were both on `REPLICA IDENTITY FULL`, which writes the **entire old
row** into the WAL on every UPDATE and DELETE, and forces the logical decoder to
parse both copies.

- `table_hole_cards` -> `DEFAULT`. Exactly one subscription exists platform-wide
  (`TablePage.tsx:4058`, `event: 'INSERT'`). An INSERT payload has no old row, so
  `FULL` was buying literally nothing.
- `tournament_players` -> `USING INDEX tournament_players_tournament_id_user_id_key`.
  Its six subscriptions use `event: '*'` with `filter: tournament_id=eq....`, so
  DELETE events genuinely need the old row's `tournament_id`. `USING INDEX` keeps
  that column in the old tuple while dropping the rest - the filters keep working
  and the WAL shrinks.
- `tournaments` (62k writes) deliberately **left on FULL**: its subscriptions
  filter on `club_id` and `union_id`, and no unique non-partial index covers
  those, so neither `DEFAULT` nor `USING INDEX` can preserve DELETE filtering.
  4% of the volume is not worth the silent regression.

### Code - merged

**World Hub PR #722 (merged).**
- `supabaseServerClient.getUser` is now **local-first**. It was calling GoTrue
  over the network on every request of ~78 API routes. Verified the local path is
  real HS256 verification, not a bare decode: rejects `alg` confusion, recomputes
  HMAC-SHA256, **constant-time** signature compare, enforces `exp`/`nbf`, and
  refuses entirely when `SUPABASE_JWT_SECRET` is absent (falling through to the
  network). No auth bypass.
- `/api/user/get-header-stats` deduped from 3 concurrent calls per page load to 1.
- Unbounded `social_messages` scan bounded, plus a `head:true` count fast path.
- Easter-egg sweep: throttle moved to `localStorage` so it survives remount,
  `force:true` dropped, verifiers batched 5-wide (awards stay sequential because
  they mutate budgets in order).
- Serial waterfalls removed in `AvatarContext`, `ActiveIdentityContext`, `WorldHub`.
- 4 stray browser GoTrue clients replaced with the shared singleton.

**Club Arena PR #731 (auto-merge armed, 334/334 test files green, tsc clean).**
- 11 `postgres_changes` subscriptions scoped with a `filter:`.
- `ChunkPreloader`: `TablePage` + `MultiTablePage` dropped from `CRITICAL_CHUNKS`
  (~1.7 MB no longer downloaded on every boot); whole preloader skipped on
  `saveData` or sub-4g connections.
- `MilestoneToast`: `SoundService` (87 KB) moved to a dynamic import, out of the
  entry chunk.
- `TournamentAutoSeat` 12s -> 45s and paused while hidden;
  `TournamentStartingTicker` paused while hidden with its two independent queries
  parallelised.

---

## Two regressions caught and reverted - worth reading

An agent working from the shared clone (which sat on an old branch) produced
"fixes" for `GlobalWaitlistListener` and `HomePage` that were **worse than what
was already on main**:

- `GlobalWaitlistListener` on main already filters `table_seats` by
  `table_id=in.(watched)` **and subscribes to nothing when the user is queuing
  for nothing**. The replacement was a weaker `user_id` filter on `table_waitlist`.
- `HomePage` on main had already removed its `home-clubs` channel (folded into
  `PostgresSyncHooks`' global channel) and already polls at 45 s with visibility
  pausing. The replacement re-added the deleted channel.

Both were caught by existing guard tests - `tests/no-unfiltered-realtime-firehose.test.ts`
and `tests/wallet-is-always-on.test.ts` - which is exactly what those tests are
for. Both files were reverted to main's version and the PR carries only the
genuinely new work.

**Lesson worth institutionalising:** never let an agent edit the shared clone
while it is parked on a feature branch. Give it a worktree cut from `origin/main`,
or verify every edited file against `origin/main` before committing.

---

## Pending - needs Dan

### 1. Apply the compute restart (see blocker above)

### 2. Review and apply the rakeback batch rewrite

File: `club-arena/supabase/migrations/PENDING-REVIEW_20260824_perf_rakeback_stats_batch_set_based.sql`

`fn_apply_rakeback_player_stats_batch`: 139 calls, mean 39 s, **max 380 s**,
1.51 core-hours. It loops per item, and each iteration opens a **subtransaction**
(every plpgsql `EXCEPTION` block does), runs an idempotency INSERT, and takes a
**row lock** on `player_stats` - so items for the same player serialise against
each other inside one batch.

The rewrite collapses this to three statements regardless of batch size, keeps
the apply-once guarantee via `INSERT ... ON CONFLICT DO NOTHING ... RETURNING`, and
retains the original loop verbatim as an exception fallback.

**This was written but deliberately NOT applied.** It mutates `player_stats.total_rake`,
which feeds rakeback payouts. The safety classifier refused it twice and that was
correct - financial accumulation logic should get a human read. The one judgement
call to check is the rounding paragraph in the file header: rounding moves from
per-item to per-batch, which is identical for 2dp money and strictly less lossy
otherwise.

### 3. Remaining batch jobs, same treatment

| Function | Calls | Mean | Max | Core-hours |
|---|---:|---:|---:|---:|
| `fn_refresh_member_fee_rollup` | 720 | 12.1 s | 30 s | 2.41 |
| `fn_credit_agent_commissions_batch` | 195 | 26.4 s | **287 s** | 1.43 |
| `fn_reconcile_tournament_denormals` | 421 | 11.3 s | 105 s | 1.32 |
| `ca_refresh_hand_player_index` | 47 | 67.3 s | 173 s | 0.88 |
| `fn_credit_stalled_seat_first_stacks` | 460 | 4.1 s | 67 s | 0.53 |

`fn_credit_agent_commissions_batch` is the same per-item-loop shape as the
rakeback one and the same rewrite applies. The other three are maintenance jobs
that should either move to a read replica or be chunked so no single call holds a
core for minutes. Together with the rakeback job these are **~7.5 core-hours** -
the single largest remaining block.

### 4. Lint rule for unfiltered subscriptions

`tests/no-unfiltered-realtime-firehose.test.ts` already asserts this for a
known table list. Extend that list rather than writing a new rule - it is the
mechanism that caught today's regression.

### 5. Six admin pages still have unfiltered subscriptions

`FinancialAlertsPage`, `FinancialAdminHub`, `RateAuditPage`, `CreditAdminPanel`,
`SettlementDashboardPage`, `FlashPoolPage`. Every one is a genuinely global
admin view with no scoping key in scope, so the fix is to give the page a scope,
not to invent a filter. Low volume; left deliberately.

---

## How to verify, after the restart

```sql
-- 1. Compute actually applied
select name, setting from pg_settings
 where name in ('max_connections','shared_buffers','effective_cache_size','max_parallel_workers');

-- 2. Reset the counters, wait a full busy hour, then re-measure
select pg_stat_statements_reset();

-- 3. Demand vs capacity
select round(sum(total_exec_time)::numeric/3600000,2) as core_hours_used,
       round(extract(epoch from (now()-stats_reset))/3600,2)
         * (select setting::int from pg_settings where name='max_parallel_workers')
         as core_hours_available
  from pg_stat_statements, pg_stat_statements_info;
```

Target: `core_hours_used` comfortably below `core_hours_available`. Anything at
or above 1.0x means queries are still queueing for CPU.

Also worth watching: `cache_hit_pct` should climb from 97.6% toward 99.9% once
`shared_buffers` grows.

```sql
select round(100.0*sum(blks_hit)/nullif(sum(blks_hit)+sum(blks_read),0),2) from pg_stat_database;
```
