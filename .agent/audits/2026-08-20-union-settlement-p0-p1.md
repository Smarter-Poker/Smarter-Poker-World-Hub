# Union Settlement — P0 + P1 continuation (2026-08-20, ~04:00–05:15 UTC)

Continuation of `.agent/handoffs/2026-08-20-union-settlement-continuation.md`.
All items verified against production. Governance + conservation CLEAN at
session end; engine throughput healthy throughout (110–323 hands/min except
two transient DB blips, see Incidents).

## P0-1 — fn_union_rake_paid_by_club survives a full week (DONE)

Migration `20260820_union_rake_daily_rollup.sql` (applied via MCP as
`union_rake_daily_rollup`). Incremental `(union_id, club_id, day)` rollup:

- `union_rake_rollup_days` + `union_rake_paid_daily` (RLS on, no policies).
  Detail stores UNROUNDED sums; `rake_paid_humans` is NULL (not 0) when no
  human contributed, so humans-mode reproduces legacy no-row behavior.
- `fn_union_rake_paid_live` — exact legacy computation, single jsonb
  expansion (window SUM replaces the per-row correlated subquery).
- `fn_union_rake_rollup_refresh_day` — idempotent per-day finalizer under an
  advisory xact lock; refuses incomplete UTC days.
- `fn_union_rake_paid_by_club` — same signature, now VOLATILE plpgsql:
  lazily finalizes missing whole days, reads rolled days + live edges;
  falls back to exact legacy whole-window computation if any day cannot be
  finalized. Only in-DB caller is fn_union_settle_player_pnl (VOLATILE).

Acceptance: 7-day call **1.07s** (extrapolated legacy: ~50s+ of double jsonb
expansion over ~640k records — outage class). Matches legacy **to the cent**
on a 42h window spanning two day boundaries, both horse modes. Days
2026-08-13..19 prewarmed (~3s/day each, one bounded query at a time).
Worst case: late-in-day calls carry up to ~24h of live edge (~3s) — still
bounded. Rollup is lazily self-maintaining; no new scheduler needed.

## P0-2 — Monday fires end to end (VERIFIED)

- Open Claw dispatcher deployed SHA == repo SHA; `openclaw.service` active;
  `/api/cron/auto-settlement` registered mon 10:00 UTC; dispatcher→workers
  HTTP delivery proven by 200s in journalctl.
- Running workers container (`ghcr .../smarter-poker-workers:latest`,
  matches local HEAD bea7591) contains PHASE 7
  (`fn_union_settle_player_pnl_weekly` in /app/dist/index.mjs).
- Chain anchor intact at `2026-08-20 03:42:22.209436+00` (latest
  settled/baseline by period_start); Monday gives ~102h >> p_min_hours=12.
- `notifyUnionSettlementProblem` delivery: union owner exists
  (47965354-…) + 1 union_admin; the exact `notifications` insert the worker
  performs was proven compatible via a forced-rollback probe.

## P0-3 — 90% rakeback (VERIFIED, one live bug found and fixed)

`fn_union_weekly_statement` over a 6h window: both clubs receive exactly 90%
of their own generated rake (SHARK 44,846.88→40,362.19; JAQK
1,398.95→1,259.06); `pay_or_collect` = net player loss − rakeback to the
cent; positive = club pays union. The old pay-nobody bug is gone.

**Bug found: two rival rakeback payers.** The engine
(`RakebackSettlerService.runUnionWeeklyRakeback` →
`fn_union_weekly_rakeback_close_all`, every settler cycle, idempotent per
ISO week) is the canonical payer per Dan's 90/10 spec — it paid the
2026-08-19 15:51 catch-up (980,957.04 to SHARK for 04-01..08-17; JAQK was
not a member then). But Open Claw ALSO had `/api/cron/union-rakeback`
scheduled mon 10:20 → workers route that **drains 100% of
union_wallets.rake_wallet and splits it by commission-rate WEIGHT (50/50
for two clubs at 0.90)** — wrong amount, wrong allocation, second payer on
the same wallet. It only ever no-op'd because it read the dead
`unions.rake_wallet` column; the 2026-08-19 wallet-read fix armed it, so
**2026-08-24 10:20 would have been its first real (double, misallocated)
payment**. Fixed by retiring the schedule + route mapping in
`scripts/openclaw-cron-dispatcher.py` (commit a8a4d92f35), deployed via
`deploy-openclaw.sh`: 90 jobs registered, union-rakeback absent, 0 errors,
auto-settlement/auto-settlement-distribute intact.

Known remaining nuance (P2, not a Monday blocker): the statement's rake
basis (`fn_union_rake_basis_by_club`) = cash rake + tournament entry fees;
the settle path's `fn_union_rake_paid_by_club` = cash rake only (tournament
tables write no rake_records; diff on a fixed 6h window = exactly the
988.70 of fees). The union wallet receives only cash rake, so the engine
close pays 0.9 × (rake + fees) out of a wallet fed by rake alone — the
union's effective keep is ~8% not 10%. Decide: credit fees to the rake
wallet, or exclude fees from the close basis.

## P1-4 — ambiguous overload dropped (DONE)

Both `fn_union_move_rake_to_chips_atomic` overloads were retired tombstones;
the duplicate made every named-arg call (union-wallet.js) fail with
"function is not unique" instead of returning the graceful refusal. Dropped
`(uuid,numeric,uuid,text,uuid)`; named-arg call verified to return
`retired_rake_is_held_in_trust`.
Migration `20260820_drop_ambiguous_move_rake_overload.sql`.

## P1-2 — deterministic cashout club attribution (DONE)

`atomic_credit_wallet_and_log`: club_members lookup now
`ORDER BY joined_at ASC NULLS LAST, club_id` (was unordered LIMIT 1 —
arbitrary for the 578 multi-club users), matching the P&L's attribution.
Last-resort fallback now books to the Midway Union house container club
(was SHARK CLUB), marker kept. 0 fallback rows in the last 7 days.
Migration `20260820_credit_wallet_attribution_determinism.sql`.

## P1-3 — 1,015 unkeyed 2026-08-19 cash-outs resolved (DONE)

1,365,360.08 chips across 765 ordinary "Cash-out from table" rows + 250
"Union migration: table restarted under union ownership" rows (all
16:01:34). Evidence trail: `table_cashout_history` is EMPTY (dead schema);
seat-leave ±5s → 70 unique; seat-session containment (seated at exactly one
table at the instant) → 153 unique; buy-in history useless (horses
multi-table; 1,014/1,015 ambiguous). Result: **153 backfilled** with
provenance metadata, **862 marked permanently unattributable** — no
guessing. Chain anchor (03:42) is after this window, so Monday unaffected.
Write path clean since the 23:33 cutover (0 new NULL-table cashouts).
Migration `20260820_backfill_unkeyed_cashouts_20260819.sql`.

## P1-5 — settlement bookkeeping hygiene (DONE)

- Deleted the orphan `open` period 2026-07-19..07-26 with NULL club AND
  NULL union (zero invoices referenced it).
- March `disputed` period 21d817b2 LEFT ALONE — carries a real invoice;
  resolving it is Dan's decision. **Dan: SHARK period 1 (2026-03-04..03-11)
  sits disputed with one invoice; say the word and an agent can close it.**
- `fn_union_governance_check` extended: `settlement_period_overdue_open`
  (warning, >24h past end_at) and `settlement_period_orphan` (critical).
- `seated_stack_snapshot` confirmed live (populated by the 03:42
  settlement for both clubs) — no longer dead schema.
Migration `20260820_settlement_period_hygiene_invariants.sql`.

## Incidents / operational notes

- Two transient DB blips during the session (connection timeouts + a
  hands/min dip to 0 then 10). Both self-recovered in ≤2 min. journalctl
  showed a workers 500 "Could not query the database for the schema cache"
  at 03:02 — the DB was flaky before this session's queries; every query
  this session was day-bounded or catalog-only. Protocol followed: stop,
  wait 90–150s, probe hands/min.
- This sandbox's GitHub MCP token only sees the stale PUBLIC duplicate
  `SmarterPoker/Smarter-Poker-World-Hub` (dead since March) — do NOT push
  there. The real repo is `Smarter-Poker/...` (private). Pushes done via
  host terminal + isolated worktree recipe with the Smarter-Poker identity.
- The VM mount cannot unlink files; never run git write commands through it.

## Work queue remaining (from the handoff)

- P1-1: unify the two cash-out write paths (chip_transactions vs
  wallet_transactions) — the FULL OUTER JOIN asymmetry remains.
- P2: `.eq('club_id', <uuid>)` sweep on `tables`; XMTTPage filter; BBJ pool
  fragmentation; admin 403 on union tables; human click-test of union
  dashboard (needs Dan or Claude-in-Chrome).
- P3: schedule governance+conservation invariants on Open Claw with
  alerting; CI regression for baseline-at-p_end and rake/P&L population
  parity; index review; read-replica proposal (RULE 12 — Dan);
  reconciliation dashboard. Plus the fee-basis decision from P0-3 above.

## P1-1 — cash-out ledgers unified (DONE, added after Dan's go-ahead)

Dan's correction recorded: union fee = 10% of all cash rake AND 10% of all
tournament fees, period. The "~8%" note above is withdrawn — no adjustment
needed while everything is test data.

`atomic_credit_wallet_and_log` now mirrors cash-outs into
wallet_transactions (canonical player-money ledger, same row shape as
atomic_table_cashout incl. balance_after) and marks its chip_transactions
row `metadata.mirrored_to_wallet=true`. `fn_union_pnl_all_clubs.chip_flows`
excludes mirrored rows — the chip leg is historical-only by data, no magic
cutover constant. Only 'cashout' is mirrored (prize/bounty/tournament
categories never pass through this function — no double-count risk). No
engine deploy needed; both write paths converge via their existing RPCs.
Migration `20260820_unify_cashout_ledger.sql`.

Verified: rollback probe wrote both ledgers + moved balance; live 5/5
engine cash-outs mirrored in first 3 min, 0 unmirrored since; settle
dry-run residual flat (-1,993.69 → -2,001.18, in-flight pot noise) while
5,489.44 of mirrored cash-outs accrued — double counting would have moved
it +5,489.

## Second DB incident (~05:35–05:45 UTC)

Supabase went fully unreachable for ~8 min (MCP connection timeouts, WH
/api/health timeout from the Mac, engine logged supabase_timeout and
restarted). No postgres FATALs in the platform logs for the window; no
heavy query from this session was in flight. Self-recovered. Same class as
the 03:02 blip. If this recurs, look at the pooler/compute tier, not the
application queries.

## Round 2 (after Dan's go-ahead): P2 + P3 items

- **P2-4 + P3-1 (engine, CA commit 2b144b85):** authorizeTableAdmin now
  authorizes the union owner, union admins, and admin-tier members of any
  member club on union-owned tables (they carried the union container as
  club_id, so every admin action 403'd). RakebackSettlerService runs
  fn_union_governance_check + fn_settlement_conservation_check every
  30-minute cycle (reportError only). Deployed via the server/** auto-deploy;
  verified in the running container bundle and by the adjacent treasury
  sentinel executing in the same cycle chain. tsc clean.
- **Rakeback recompute fix (unplanned, found in engine logs):**
  fn_rakeback_recompute_periods aborted EVERY cycle on the
  (user_id, period_start) unique constraint after the 08-19 catch-up close
  left paid rows with a different period_end. ON CONFLICT now targets that
  constraint; paid rows skip silently. Migration
  20260820f_rakeback_recompute_conflict_target.sql (CA repo, c52ce737);
  verified: the failing call returns written:129 and subsequent settler
  cycles log failures: 0.
- **P2-1 + P2-2 (CA frontend, c9c0268b):** new src/utils/unionScope.ts
  (clubGamesOrFilter). Union-aware table queries in AdminTableHeatmap,
  StatsExport, ClubFinancialDashboard, AdminDashboardPage (3 sites),
  ClubDashboard. XMTTPage was triple-broken (integer club code vs uuid
  column, union scope, type filter on a SELECT alias with lowercase values
  — tournament_type holds 'MTT'); status tabs also compared lowercase to
  uppercase. Deployed: production build-info.json serves ca_sha c9c0268b;
  WH prod /api/health served 69b9940ab8 (contains e4a641222f) at 06:22 UTC.
- **P2-3 BBJ fragmentation: already resolved.** Retired JAQK pool's last
  contribution predates the 08-19 merge; all live contributions flow to the
  active union pool (11,259.44/24h). No action.
- **P3-2 (WH 5e0ace61):** union-settlement-math tests now assert defect A
  (baseline anchored at p_end lets an inside-window bootstrap win) and
  defect B (rake/P&L population mismatch resurfaces rake as phantom loss).
  11/11 pass.
- **Operational:** engine settler is draining a ~26k-row backlog (9.2h lag)
  accumulated during tonight's repeated Supabase connection incidents; its
  own treasury sentinel is alerting and catch-up mode is active. Platform
  DB had at least three multi-minute unreachability episodes (~03:02,
  ~05:35, ~06:38) with no postgres FATALs logged — if this recurs, look at
  the pooler/compute tier, not application queries.

Still open from the handoff: P2 `.eq('club_id')` sweep only covered the
tables/tournaments read sites listed above (other candidates should be
reviewed per-site); P2-5 human click-test of the union dashboard (needs
Dan); P3 index review, read-replica proposal (RULE 12 — Dan), and the
reconciliation dashboard.

---

# REVIEW ROUND (2026-08-20 ~11:00–12:45 UTC) — line-by-line re-audit

Dan asked for a full verification that everything was pushed and published,
then a line-by-line hunt for bugs/stubs/gaps/regressions, then upgrades.
Dan's correction recorded: **the union fee is 10% of all cash game rake AND
10% of all tournament fees, period.** The earlier "~8%" note is withdrawn;
nothing needs adjusting while everything is test data.

## Publish audit — all 12 earlier commits verified live

WH 9 + CA 3 commits all ancestors of origin/main; 7 migrations registered in
production; dispatcher SHA == repo SHA; engine container contains the admin
+ sentinel code; prod CA bundle (ca_sha 96ff3e8d) contains c9c0268b, and the
deployed chunks were fetched and inspected: `unionScope-wzmhUs1v-v6.js` is
served, XMTT ships `.or(await le(r))` and `in("tournament_type",["MTT","XMTT"])`
with lowercase-safe status tabs.

## THE BIG ONE — my own rake rollup was silently WRONG

Diffing the rollup against the legacy computation on a fixed historical
window exposed it: SHARK CLUB **489,066.11 (rolled) vs 489,205.40 (live)**.
Two independent causes:

1. **Finalized days go stale.** The rollup caches a query whose inputs change
   retroactively — the union migration keeps setting `tables.union_id` on
   EXISTING tables, so historical `rake_records` enter the union's scope
   after a day was finalized. Measured: 2026-08-16 held 100,548 records when
   rolled and 102,171 an hour later (+1,623); 08-17/18/19 likewise. That rake
   was missing from the settlement basis, **under-crediting the club that
   earned it**.
2. **Attribution was baked in** at refresh time, so a player joining or
   leaving a club silently invalidated the cached answer.

**Fix (migration 20260820h):** rake is now stored **per user per day**;
club attribution and the horse filter are applied at READ time using exactly
the legacy expressions; every day carries `records_seen` and a day whose live
record count no longer matches is treated as MISSING and recomputed live for
that day only. The cache can now only ever be a SPEED optimisation.
Verified: readonly == live **to the cent in both horse modes**, and with the
cache deliberately poisoned (`records_seen` wrong AND `rake_amount` × 99) the
reader still returned the exact correct figure.

## Two more real defects in my own P0-1 work (migration 20260820g)

- **The fallback WAS the outage.** If a day failed to finalize, the function
  fell back to a live scan of the ENTIRE window — the ~50s query P0-1 existed
  to eliminate. The safety net was the hazard. Now every path is bounded to
  one day plus the ragged edges.
- **Monday would finalize days inside the money transaction.** The rollup is
  filled lazily by its first caller; on Monday that is
  `fn_union_settle_player_pnl` holding FOR UPDATE locks on `union_wallets`
  and `clubs.chip_treasury`. Measured: 4 unrolled days = ~12s of extra scan
  inside that lock window while live horse funding contends on the same rows.
  `fn_union_rake_rollup_catchup_all()` now warms it outside any money
  transaction.

## The weekly STATEMENT was still unbounded

`fn_union_weekly_statement` → `fn_union_rake_basis_by_club` still had the
original double-jsonb-expansion shape. P0-1 fixed the settle path only, so
the report **a human would actually run** was still outage-class. Rebuilt on
the rollup (cash leg) + live tournament fees (0.34s over 7 days). Both legs
kept, per Dan's 10% + 10% spec.

## Upgrades shipped

- `fn_union_rake_paid_readonly` — STABLE, never writes, always bounded.
- `fn_union_rake_day_is_fresh` — cheap per-day staleness probe.
- `fn_union_rake_rollup_catchup` / `_all` — re-validate and re-roll outside
  money transactions.
- `union_rake_rollup_unmaintained` governance invariant (warning: settlement
  would do the work inline; correctness is unaffected).
- **`fn_union_reconciliation_report(union, start, end)`** — the read-only
  pre-Monday preview (handoff P3-5): per-club settle_net, direction, rake,
  stack delta, plus residual/tolerance/within_tolerance. Granted to
  `authenticated` so the union dashboard can render it. Current window shows
  residual −5,608.61 against tolerance 11,204.93 → within tolerance.
- **Workers `/cron/union-rakeback` is now a 410 tombstone with no database
  access at all**, asserted by a test that strips comments and greps the code
  for `getSupabase` / `from(` / `rake_wallet`. Defence in depth behind the
  dispatcher retirement. 43/43 workers tests pass.

## Checked and found FINE (no change needed)

- `fn_settlement_conservation_check` 1.2s, `fn_union_governance_check` 0.86s
  warm (the 4.5s first call was cold cache) — safe at a 30-minute cadence.
- `authorizeTableAdmin` returns the union container as `clubId`, used only
  for the `anti_cheat_events` audit row — correct, that IS the table's owner.
- P1-1 mirroring cannot double-count: `chip_flows` already dropped NULL
  `table_id` rows, so nothing moved from "counted once" to "counted twice".
- `fn_rakeback_recompute_periods` ON CONFLICT rewrite cannot silently move a
  user between clubs — the `eligible` CTE already excludes users holding a
  row at another club for that period.
- Index review (handoff P3-3): the four indexes it asks for already exist.
  7-day `fn_union_pnl_all_clubs` is 6.7s, bounded and index-backed.

## BLOCKED — needs Dan (RULE 0 human-only exception)

**GitHub Actions stopped running at ~12:22 UTC.** Every workflow in
Smarter-Poker-Club-Arena and Smarter-Poker-World-Hub now fails in 3–6s with
**zero steps executed** (CI, Silent Revert Guard, Build for World Hub Sync,
Auto-Deploy Hetzner). The last green run was workers CI at 12:20:59Z. That
signature — instant failure, no steps, every workflow, multiple repos — is
what an **Actions spending-limit / billing block** looks like. The deploy
token cannot read the billing API (403) to confirm it.

**Dan: check GitHub → Settings → Billing → Actions spending limit.**

Consequences while it is down (nothing is broken, two changes are pending):
- `43a7ce579` + `f0a61596f` (engine: rollup catch-up wiring) are on main but
  NOT deployed. **Correctness is unaffected** — a stale/missing day is
  recomputed live at read time. The only cost is that Monday's settlement
  would roll up to ~4 days inline. Mitigated for now: the rollup was warmed
  by hand this session (`stale_remaining: 0` for every union).
- `db9bc64` (workers: retired-route tombstone) is on main but not deployed;
  the workers image only rebuilds on a `v*.*.*` tag or dispatch. The live
  route is still the old code — harmless, because its Open Claw schedule was
  removed, so only a manual call could reach it.
- The engine's P2-4 admin fix and P3-1 sentinel ARE already live (deployed
  earlier at d18479ff8), as is every DB migration.

Re-run both deploys once Actions is restored; no code changes needed.
