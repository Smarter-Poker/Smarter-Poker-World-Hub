# 2026-08-19 — Union governance & billing: session close

Closing record for the union work. Earlier rounds are in
`2026-08-19-union-table-governance.md`, `-audit-fixes.md`, `-round2.md`,
`-round3.md`, `-round4-decisions.md`.

## Delivered

**The hard rule.** A club inside a union plays only on union-created games.
Enforced in three places so no writer can bypass it: DB triggers stamp
`union_id` on every non-private insert AND update, `tables` RLS + the
`fn_create_tournament` RPC gate creation, and the API layer returns a clear
403. Clubs keep private games (`is_private`), which never carry a `union_id`
and never appear in a union or platform lobby.

**Weekly billing.** Player wins/losses on union tables are settled between
each club and its union every Monday: rake-neutral, collect-from-losers before
paying-winners, idempotent on `(union_id, period_start)`, and it refuses to pay
on data it cannot prove. Runs in the workers repo (`/cron/auto-settlement`
PHASE 7) — the only process actually on a schedule.

**The migration.** All 54 open cash tables were closed with full refunds and
recreated union-owned; the corrupt orphan was tombstoned; live tournaments were
stamped in place rather than cancelled.

## The three that mattered most

1. **The feature shipped dead.** The first implementation could never have
   worked: the invoice violated a CHECK constraint, the error was swallowed by
   a `console.warn`, the code sat in a file no cron calls, and nothing moved
   chips. It returned `success: true` every time.
2. **Rake was being double-charged.** By the seat/wallet identity,
   `realized_net + stack_delta` equals *(inter-club transfer − rake)*. The
   engine already sweeps rake to the union per hand, so settling that figure
   collected it twice. Now rake-neutral, and the club nets sum to ~0 — an
   invariant asserted on every run.
3. **It was measuring house AI.** 1,148 of 1,156 union club members are horses
   and 100% of seated union chips were horse chips. A dry run showed an
   imbalance of **1,112,929** — the job would have moved over a million chips
   on house noise. The guard refused. Excluding horses brought the same window
   to **−1,138**.

## Also found and fixed (not in the original brief)

- **Weekly union rakeback had never paid a club.** It filtered
  `unions.rake_wallet`, a dead column that is 0 on every row, while the real
  balance sat in `union_wallets`. 470k+ stranded.
- **The weekly union hold destroyed chips** — treasury debited, union never
  credited.
- **`tables` SELECT RLS was `USING (true)`** despite being named "Club members
  can view tables". Private games were world-readable.
- **`settle-period` reported success while losing a week of settlement** in
  five ways, including an unchecked `agents` read that silently zeroed every
  commission and the union hold.
- **Five features were reading tables that receive no writes** — `rake_history`
  (last write 2026-05-01) and `hand_players` (zero rows). Club financials, the
  revenue chart, table admin stats, every player's profile stats, and
  friend suggestions were all showing users nothing.
- **A hardcoded club fallback** in `atomic_credit_wallet_and_log` was booking
  every unattributable credit against one real club's ledger.

## Durability

`fn_union_governance_check()` states the invariants once — club-owned games in
a union, mirror drift, private games carrying a union_id, missing triggers, RLS
losing its `is_private` clause, rake accumulating unpaid, settlements parked and
forgotten. PHASE 8 runs it weekly and notifies union owners/admins on a
critical break. These failures are data drift, not build errors, so no CI gate
could ever have caught them. Currently: **clean, zero violations.**

## Deliberately left

- **Client-side hand persistence** (`HandHistoryService` /
  `HandPersistenceService` writing `hand_players`). Verified dead: `TablePage`
  has no call sites and the engine writes `hand_history` server-side, so the
  writes never fire. Removing it belongs to MIGRATION-LAW STEP 1
  ("RIP OUT client-side engine code"), which is a governed phase — not a
  drive-by edit.
- **`rakeback_distributions` reads empty** — correct. It is fed by the weekly
  settlement, which had not been running. It populates on the first Monday.
- **`settlement-history auto_close`** is not scheduled by anything. Its
  idempotency header was fixed so it is no longer a loaded gun, but the dead
  path itself was left.

## Unproven

Chips moved by the player-P&L settlement: **0**. Every path is dry-run verified
and the numbers reconcile, but the first real execution is Monday 10:00 UTC.
It will be small — one active real player — which is the right size to eyeball
on the union dashboard before volume arrives.
