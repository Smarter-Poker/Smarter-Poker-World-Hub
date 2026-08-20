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
