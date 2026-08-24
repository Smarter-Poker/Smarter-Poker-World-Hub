# Platform latency root cause — World Hub, Club Commander, Club Arena

**Date:** 2026-08-24
**Scope:** why connection and load times are slow across all three surfaces
**Method:** live telemetry from Supabase project `kuklfnapbkmacvwxktbh` plus static audit of both repos
**Measurement window:** `pg_stat_statements` 2026-08-24 09:00 → 21:35 UTC (12h35m). Index scan counts are cumulative since project creation 2026-01-06.

---

## Headline

The database is running at **188% of its physical CPU capacity**.

| | |
|---|---|
| Query execution demanded | **47.40 core-hours** |
| CPU capacity available | **25.17 core-hours** (2 vCPU x 12.58 h) |
| Oversubscription | **1.88x** |

Everything else follows from this. Queries queue for CPU; connections are held open while they queue; the pool fills; Supavisor starts dropping requests; the frontend sits waiting. The slow page loads are a *symptom* of CPU starvation, not a frontend problem.

**Billing is a contributing cause but is not the whole story, and the compute upgrade already applied did not resolve it.**

---

## 1. Supabase settings and billing — what is actually provisioned

Read from `pg_settings` at 21:35 UTC:

| Setting | Value | Read |
|---|---|---|
| `max_connections` | 120 | |
| `shared_buffers` | 1 GB | `131072 x 8kB` |
| `effective_cache_size` | 3 GB | |
| `max_parallel_workers` | **2** | -> 2 vCPU |
| `work_mem` | 7 MB | |
| `statement_timeout` | 120 s | |
| `idle_in_transaction_session_timeout` | **0 (unlimited)** | see §5 |
| Database size | **99 GB** | |

That signature is the **Medium** add-on: 4 GB RAM, 2 vCPU. The earlier note in this thread that the instance was "Micro" was wrong for the current state — the upgrade did land — but the conclusion drawn from it was also wrong. Moving Micro -> Medium raised RAM and connection count. **It did not raise vCPU count, and CPU is the binding constraint.**

Cache hit ratio is **97.04%**. For an OLTP workload that number needs to be 99.9%. At 99 GB of data against 3 GB of effective cache (3%), a 3% miss rate is a large absolute volume of disk reads competing for the same two cores.

Connections at rest: **66 of 120 in use, 3 active, 55 idle.** PostgREST alone holds 41 and Realtime holds 11. That is 52 connections of baseline overhead before the Hetzner engine or any user opens one.

**Verdict on billing:** the compute add-on is genuinely undersized, but buying a bigger one is the *second* action, not the first. Roughly half the 47.40 core-hours is waste that should be deleted rather than paid for. Fix the waste first, then size the instance against real demand — otherwise you buy 4 vCPU and it saturates again.

---

## 2. Where the 47.40 core-hours went

Top statements by total execution time in the window:

| Statement | Calls | Mean | Max | Total | Disk blocks read |
|---|---:|---:|---:|---:|---:|
| `INSERT INTO hand_history` | 24,785 | 855 ms | 8.0 s | **5.89 h** | 54,528 |
| `atomic_distribute_rake` | 10,326 | 1,661 ms | 8.0 s | **4.76 h** | 152,842 |
| Realtime WAL decode | 43,610 | 355 ms | **53.6 s** | **4.30 h** | 601 |
| `fn_refresh_member_fee_rollup` | 720 | **12.1 s** | 29.9 s | 2.41 h | 44,231 |
| `UPDATE tables` | 23,263 | 261 ms | 8.0 s | 1.69 h | 534 |
| `fn_apply_rakeback_player_stats_batch` | 139 | **39.1 s** | **380.4 s** | 1.51 h | 7,113 |
| `fn_credit_agent_commissions_batch` | 195 | **26.4 s** | **286.9 s** | 1.43 h | 28,900 |
| `fn_reconcile_tournament_denormals` | 421 | **11.3 s** | 104.9 s | 1.32 h | 6,117 |
| `insert_hole_cards` | 108,442 | 36 ms | 8.0 s | 1.09 h | 1,771 |
| `ca_refresh_hand_player_index` | 47 | **67.3 s** | 173.5 s | 0.88 h | 121,048 |
| `bbj_record_contribution` | 1,811 | 1,226 ms | 8.0 s | 0.62 h | **2,607,898** |
| `fn_credit_stalled_seat_first_stacks` | 460 | 4.1 s | 67.5 s | 0.53 h | 1,105 |

Two shapes matter here:

**Shape A — hot-path statements that are individually too slow.** A single-row `INSERT` into `hand_history` averaging 855 ms is not normal. `hand_history` is 8.7 GB / 1.39 M rows carrying **eight indexes totalling 1.14 GB**; every insert maintains all eight, and at 97% cache hit a meaningful share of those maintenance reads come off disk.

**Shape B — batch jobs measured in minutes, running against the same two cores as live play.** `fn_apply_rakeback_player_stats_batch` peaked at **380 seconds**. `fn_credit_agent_commissions_batch` at **287 s**. `ca_refresh_hand_player_index` at **173 s**. While any of those runs it is consuming an entire core and holding a connection. There are 2 cores. One long batch job removes 50% of the platform's query capacity for the duration.

Note the `8.0 s` ceiling appearing repeatedly in the Max column: that is the PostgREST role `statement_timeout` truncating queries. Those are not completions, they are **failures** — and each one burned 8 seconds of CPU before dying.

---

## 3. `bbj_record_contribution` — fixed, shipped, verified

The clearest single defect found, and the cheapest to fix.

**Symptom:** 1,811 calls consumed **2,607,898 disk block reads** — 1,440 blocks (11 MB) per call. `bbj_contributions` logged **506,841,592 sequentially-read tuples** across 3,244 scans.

**Cause:** two lookups inside the function that no index could serve.

```sql
-- entry guard, whenever p_hand_id IS NULL
WHERE pool_id = $1 AND hand_id IS NULL
  AND table_id    IS NOT DISTINCT FROM $2
  AND hand_number IS NOT DISTINCT FROM $3

-- ON CONFLICT DO NOTHING fallback, on every duplicate hand
WHERE pool_id = $1 AND hand_id IS NOT DISTINCT FROM $2
```

`IS NOT DISTINCT FROM` is never indexable — the parameter may or may not be NULL at plan time. The only `pool_id`-leading index, `uq_bbj_contributions_pool_hand`, is **partial** on `WHERE hand_id IS NOT NULL` and cannot serve a NULL-tolerant probe. 171,260 of the table's 656,688 rows have `hand_id IS NULL` and nothing indexed them. Both paths fell through to a full 134 MB sequential scan.

The aggravating factor: this runs on the hand-completion path **inside the transaction that already holds `SELECT ... FROM bbj_pools ... FOR UPDATE`**. Every scan extended a row lock that serialises every table in the club. That is the lock contention observed earlier in this thread — but the lock was a victim, not the cause. The cause was a 1.2-second sequential scan inside the critical section.

**Fix applied:** a partial index on the NULL-hand rows, plus branching the function so each argument shape hits a real index. Allocation maths, the `FOR UPDATE` lock, the `ON CONFLICT` target and the return value are byte-for-byte unchanged.

**Measured, production `EXPLAIN ANALYZE`:**

```
BEFORE  Index Cond: (pool_id = ...)
        Filter: table_id IS NOT DISTINCT FROM ... AND hand_number IS NOT DISTINCT FROM ...
        Rows Removed by Filter: 108,096
        Buffers: shared hit=78,939 read=391
        Execution Time: 1201.840 ms

AFTER   Index Cond: (pool_id = ...) AND (table_id = ...) AND (hand_number = ...)
        Buffers: shared hit=9
        Execution Time: 0.180 ms
```

**1.2 s -> 0.18 ms. 79,330 buffers -> 12.**

Applied to production via Supabase MCP `apply_migration`. Migration file:
`club-arena/supabase/migrations/20260824_perf_bbj_record_contribution_indexable_lookups.sql` — **written to disk, not yet committed** (see §7).

---

## 4. Realtime — 4.3 hours of CPU, and it is mostly waste

`supabase_realtime` publishes **109 tables**. Every write to any of them is WAL-decoded and RLS-evaluated by the Realtime worker.

`realtime.subscription` at audit time held live subscriptions for **16** distinct table/filter groups. The other ~93 published tables are decoded for nobody.

Write volume in the window, for published tables:

| Table | Writes (12.6 h) | Live subscriber? |
|---|---:|:---:|
| `table_hole_cards` | **245,935** | no |
| `tournament_players` | **171,825** | no |
| `tables` | 49,647 | yes |
| `clubs` | 33,565 | yes |
| `tournaments` | 30,655 | yes |
| `agent_commissions` | 13,245 | no |
| `union_wallets` | 8,446 | no |
| `chip_transactions` | 6,173 | no |

`table_hole_cards` and `tournament_players` alone are **418k of ~570k published writes — 73%** — and neither had a subscriber at audit time. (`table_hole_cards` is legitimately subscribed by Club Arena when someone is seated, and Club Arena additionally polls it every 5 s as a fallback; `tournament_players` is subscribed by the tournament screens.)

Compounding it, Club Arena carries **18 `postgres_changes` subscriptions with no `filter:`**. The severe one:

- `src/components/common/GlobalWaitlistListener.tsx:44` — subscribes to **`table_seats` DELETE, platform-wide, unfiltered**, and is mounted at `src/App.tsx:416` **on every page for every logged-in user**. Every seat vacancy anywhere fans out to every connected client, and each client then fires a `table_waitlist` SELECT (`:57`). This is the same fan-out shape already removed once for cost reasons — `src/services/PostgresSyncHooks.ts:95-100` records it as "~80% of the 86M realtime messages ($217/mo)".

Realtime peaked at **53.6 seconds** for a single WAL decode call in this window. When that happens, every subscription across all three apps stalls.

---

## 5. `idle_in_transaction_session_timeout` is 0

Unlimited. A transaction that opens, takes a lock, and then stalls — a crashed engine process, a hung batch job, a dropped network connection — holds that lock **forever**, blocks autovacuum from reclaiming rows behind it, and occupies a connection permanently. There is no automatic recovery.

Recommended: `ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '60s';`

Nothing legitimate on this platform holds an open idle transaction for a minute.

---

## 6. Frontend — real, but secondary

Both client audits found genuine waste. It matters, but note that with the database 188% oversubscribed, halving the request count mostly reduces queuing rather than fixing it.

### World Hub

1. **`vendor/commander-shared/src/lib/supabaseServerClient.js:76-85`** — the patched `auth.getUser` calls GoTrue over the network **first** and only falls back to local HMAC decode. Every one of **78 API routes** pays a full network round-trip per request. `verifySupabaseJwt` (`serverAuth.js:55`) verifies locally in microseconds. **Inverting these two lines is the single highest-leverage change in the repo.**
2. `/api/user/get-header-stats` (~8 DB round-trips) is called **3x concurrently on one page load** — `UniversalHeader.js:392`, `useUnreadCount.jsx:154`, `useDiamondBalance.js:82`.
3. `useEasterEggSweep.js:98` fires `evaluate` with `force: true` on every mount; `pages/api/rewards/eggs/evaluate.js:113-122` then runs **up to 40 verifiers sequentially**, each 1-3 queries. The throttle lives in a `useRef` and so resets every mount.
4. Sequential waterfalls with no data dependency: `AvatarContext.jsx:197->201`, `ActiveIdentityContext.jsx:81->97`, `WorldHub.tsx:465->481`.
5. **~18-20 round trips before the hub is interactive**, five of them serial chains.
6. 4 extra browser GoTrue clients with default `persistSession` and default storageKey — `useMessengerService.js:19`, `SharedPostCard.jsx:16`, `InviteFriendsModal.jsx:18`, `ShareStreakLeaderboard.jsx:33`. Each spins its own refresh timer and socket, and each fights the Auth Migration v6 key cleanup at `_app.js:371-395`.
7. 3 leaked realtime channels, no `removeChannel` on unmount — `PublicGameBoard.jsx`, `ClubPagesView.jsx`, `ClubPageDashboard.jsx`.
8. `get-header-stats.js:163-169` — unbounded `social_messages` fetch, no `.limit()`.

### Club Arena

Bundle and auth bootstrap are **well built** — routes are lazy, one Supabase client, no blocking await before first paint. The costs are elsewhere:

1. `ChunkPreloader.ts:30-52` speculatively downloads **~1.7 MB every boot**, including `TablePage` (438 KB JS + **389 KB CSS**), on connections of any quality.
2. `MilestoneToast.tsx:12` statically imports `SoundService` (87 KB), welding it into the 401 KB entry chunk for a headless toast. Same for `EngineStateClient` (61 KB), `TableService` (41 KB), `DailyChallengeService` (52 KB) via `App.tsx:18,22` and `core/IdentityDNA.ts:20,23`.
3. `TablePage.tsx` mount is a **10-12 step sequential waterfall** opening with a 5-attempt retry on 1/2/4/8 s backoff (`:4717-4734`); `:5942->5946->5963->5974` is a strict chain with no data dependency.
4. Polling on **every page for every user**: `TournamentAutoSeat.tsx:38` every **12 s** (queries `table_seats` + `tables`), `TournamentStartingTicker.tsx:47` every 30 s (3 sequential queries). `HomePage.tsx:1162` polls every **20 s** and fires 4-6 queries *plus a write RPC* (`recompute_club_levels`, `:997`) per tick — a page view triggering a maintenance write.
5. `PersistentTableLayer.tsx:33-58` keeps live tables mounted across navigation by design, so 4 tables x (5 s heartbeat + 5 s hole-card poll + 10 s waitlist poll + ~7 channels) keep running while the user browses the lobby.

---

## 7. Actions

### Done, applied to production, verified

- [x] `bbj_record_contribution` + `idx_bbj_contrib_pool_nullhand` — **1.2 s -> 0.18 ms**, verified by `EXPLAIN ANALYZE` (§3)
- [x] `ANALYZE bbj_contributions` — `reltuples` was stale; the planner was costing every lookup against a wrong row count
- [x] `idx_hand_history_players_gin` — `gin_pending_list_limit` raised 4 MB -> 32 MB so `hand_history` INSERTs buffer into the pending list instead of doing full GIN maintenance inline

### Correction to the earlier diagnosis in this thread

**Do not drop `idx_hand_history_players_gin`.** It was recommended for deletion as "notoriously expensive and probably unused." It is load-bearing: `ca_player_hands()` and `ca_player_stats_full()` both probe it via `players @> ...`. Dropping it converts every player hand-history lookup into an 8.7 GB sequential scan. The `fastupdate` tuning above gets most of the write saving without that risk.

### Needs Dan — blocked on approval or credentials

1. **Commit the migration file.** Written to `club-arena/supabase/migrations/20260824_perf_bbj_record_contribution_indexable_lookups.sql`. The GitHub MCP returned `Bad credentials` this session, and section 12 of `CLAUDE.md` forbids git writes against the mounted worktree from a sandbox. The DB change is already live; only the audit trail is outstanding.
   ```bash
   cd ~/Documents/club-arena && bash scripts/git-safe-push.sh "perf(db): make bbj_record_contribution lookups indexable"
   ```

2. **Drop 7 indexes with zero reads in 7 months** (blocked by the destructive-action classifier):
   ```sql
   DROP INDEX public.idx_bbj_contrib_club_created;    -- 25 MB, idx_scan 0
   DROP INDEX public.idx_bbj_contrib_created_at;      -- 16 MB, idx_scan 10
   DROP INDEX public.idx_bbj_contrib_player;          -- idx_scan 0
   DROP INDEX public.idx_bbj_contrib_club_player;     -- idx_scan 0
   DROP INDEX public.idx_rake_records_table_created;  -- 53 MB, idx_scan 0
   DROP INDEX public.idx_rake_records_club_id;        -- 13 MB, idx_scan 1, covered by idx_rake_records_club_created
   DROP INDEX public.idx_bbj_contrib_pool_id;         -- created by me earlier today, superseded by the partial index
   ```

3. **Set the idle-transaction timeout** (§5):
   ```sql
   ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '60s';
   ```

### Highest value, in order

1. **Move the batch jobs off the live cores.** `fn_apply_rakeback_player_stats_batch` (380 s), `fn_credit_agent_commissions_batch` (287 s), `ca_refresh_hand_player_index` (173 s), `fn_refresh_member_fee_rollup` (12 s x 720), `fn_reconcile_tournament_denormals` (11 s x 421). Together ~ **7.5 core-hours of the 47.40**, taken from the same 2 cores serving live play. Either run them against a read replica, or chunk them so no single call holds a core for minutes.

2. **Prune the realtime publication.** ~93 of 109 tables are decoded for nobody. Cross-reference each published table against `.channel(...postgres_changes...)` call sites in both repos and remove the ones with no consumer. Start with `agent_commissions`, `union_wallets`, `chip_transactions`, and the audit/log tables.

3. **Filter `GlobalWaitlistListener`** (`src/components/common/GlobalWaitlistListener.tsx:44`). One line. Removes a platform-wide `table_seats` DELETE fan-out to every connected client. Then add a lint rule rejecting a `postgres_changes` config without `filter:`, and work through the other 17.

4. **Invert `getUser` to local-first** (`vendor/commander-shared/src/lib/supabaseServerClient.js:76-85`). Three lines. Removes a GoTrue network hop from every authenticated API request across 78 routes.

5. **Then size the compute.** After 1-4, re-measure `sum(total_exec_time)` over a fresh window and buy against the real number. Doing this first means paying for the waste at a higher rate.

6. **Reduce `hand_history` index count.** Eight indexes / 1.14 GB on a table taking 24,785 inserts in 12.6 h. `idx_hand_history_tournament_created` (105 MB) has **4 scans in 7 months**. Audit the rest for overlap before adding any more.

---

## Answer to the question as asked

> is it Supabase settings, billing, or something else entirely?

**All three, in this proportion:**

- **Something else — the largest share.** ~7.5 core-hours of batch jobs running on the live cores, 4.3 core-hours of realtime decoding for tables nobody subscribes to, and hot-path functions doing sequential scans inside locked transactions. This is code and configuration, not capacity.
- **Settings — real and free to fix.** 109-table realtime publication, `idle_in_transaction_session_timeout = 0`, 7 never-read indexes taxing every write, stale planner statistics.
- **Billing — real, but third.** 2 vCPU against a 99 GB database is genuinely too small, and the Medium upgrade did not add cores. It should be increased — but only after the waste is removed, or the next tier saturates the same way.

The frontend waterfalls in §6 are worth fixing on their own merits, but they are not why the platform is slow today. The platform is slow because the database is being asked to do 47 hours of work in 12.
