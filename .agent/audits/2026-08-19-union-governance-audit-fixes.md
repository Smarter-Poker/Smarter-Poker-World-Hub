# 2026-08-19 — Union governance & billing: line-by-line audit and fixes

Follow-up to `2026-08-19-union-table-governance.md`. A full audit of that
release found the headline feature — weekly win/loss billing — was **not
working at all**, plus three pre-existing money bugs it sat on top of.

## The feature was silently dead (three independent reasons)

1. **CHECK constraint.** The square-up invoice used `invoice_type
   'union_club_pnl'` / `to_entity_type 'union'`; both were rejected
   (`23514`, reproduced in production). The code only `console.warn`'d, so
   every close returned `200 {success:true, playerPnl:{...}}` while writing
   nothing.
2. **Wrong process.** The P&L code lived in
   `/api/club-arena/settle-period`, which **is on no cron**. Weekly
   settlement in production is the `smarter-poker-workers`
   `/cron/auto-settlement` route — it never had the code.
3. **No payment path.** The only invoice payer filters
   `invoice_type = 'club_to_agent'`. A `union_club_pnl` row would sit
   `generated` forever, and nothing moved chips regardless.

## Pre-existing money bugs found

- **Weekly union rakeback has never paid a club.** `union-rakeback.ts`
  selected `unions.rake_wallet` — a dead legacy column, `0` on every row —
  while the live balance is in `union_wallets.rake_wallet`, the same table it
  already debits. `.gt('rake_wallet', 0)` matched nothing, so the job
  returned "No unions with rake balance" every week. **470k+ chips stranded.**
- **The weekly union hold destroyed chips.** The worker debited the club
  treasury and never credited the union wallet.
- **`tournaments` RLS was `Public read access`** — private club tournaments
  world-readable.

## Modeling bug found by testing (not by reading)

The first dry run showed both clubs losing almost exactly the rake. That is
the seat/wallet identity: `realized_net + stack_delta == transfer - rake`.
Since the engine already sweeps rake to the union per hand, settling that
figure **double-charges the rake**. Settlement is now rake-neutral —
`+ rake_paid`, attributed per club from `rake_records.player_contributions`
— which makes club nets sum to ~0. That zero-sum property is asserted on
every run and is the correctness proof.

## Regression this release introduced (now fixed)

Stamping `union_id` on every non-private game of a union club also stamped
the engine's per-tournament tables. `getUnionTables` never filtered
`tournament_id`, so the union **cash** lobby filled with tournament tables
(31 open when found).

## Shipped

- **DB**: invoice constraints; UPDATE-side ownership triggers; scoped
  `tournaments` SELECT policy; `fn_union_rake_paid_by_club`;
  `fn_union_settle_player_pnl` (atomic, rake-neutral, collect-then-pay,
  idempotent on `(union_id, period_start)`, computes lock-free then moves
  chips in a short lock window); `fn_union_settle_player_pnl_guarded`
  (refuses to pay when the books do not balance, records `needs_review`);
  `fn_union_pnl_bootstrap`; `fn_union_close_club_tables_for_join`.
- **workers** `9e13579`: rakeback wallet source, union-hold conservation,
  PHASE 7 weekly player P&L.
- **club-arena** `3ced571`: union/club/platform lobby leaks + the
  tournament-table regression.
- **world-hub** `1e5a1fe`: join flow via the atomic RPC; settle-period via the
  guarded RPC, failing loud and leaving the period open.

## Known-remaining / deliberate

- `chip_transactions` cash-outs carry no `table_id`, so a private-game
  cash-out inside a union club can fall into the union P&L scope. Zero
  private games exist today; the engine should stamp `table_id`.
- Seated stack is read at call time, not at `period_end`; run the weekly job
  close to the boundary.
- Many `settle-period` failures are still `console.warn`-only (agent
  commissions, union hold, ledger writes). Only the P&L leg was made loud.
  Listed for a follow-up pass.
- No cron calls `settle-period`/`settlement-history auto_close`; its header
  comment claiming a Monday cron is false. Left as the manual/admin path.
