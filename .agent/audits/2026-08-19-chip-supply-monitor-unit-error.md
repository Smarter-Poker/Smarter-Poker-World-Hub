# 2026-08-19 — The chip-supply monitor was crying wolf

## What prompted it

While recommending a conservation check I discovered `chip_supply_snapshots`
already existed and ran hourly — with its own `unexplained_delta` column
reading **3,557,768**. I flagged it as "a real signal sitting unexamined" and
moved on. This is going back to answer it.

## What it turned out to be

Not chip creation. A **unit error**.

`fn_snapshot_chip_supply` summed every seat stack and differenced it against
wallet cash flows. But a tournament seat's `stack` is tournament scrip —
granted from `tournaments.starting_chips`, never purchased. A 10-chip buy-in
grants 10,000 tournament chips.

Measured: **31,080,208 of the 31,166,604 chips on seats (99.7%, 1,027 seats)
were tournament chips**, against 86,396 real cash chips on 191 seats. So every
tournament start pumped millions of phantom "unexplained delta" into a
money-supply monitor.

The trail that led there, in order:
- wallets flat (~732.1M) while seated stacks grew 15.4M → 30.1M in 8 hours
- `atomic_table_buyin` verified to debit the wallet AND log it — real buy-ins
  conserve, so buy-ins were not the source
- horses seat through that same RPC, so horses were not the source either
- `club_members.chip_balance` unchanged at 105,615,833 — not the source
- cash tables alone: 85,461 on felt vs 360,044 net bought in, i.e. stacks are
  *below* buy-ins by roughly the rake, exactly as they should be
- so the growth had to be tournament seats — and it was

## Why it mattered

A monitor that always screams is a monitor nobody reads. This one would have
masked a genuine conservation break — the exact failure mode this project
already hit, when the weekly union hold debited club treasuries and never
credited the union, destroying chips silently for months.

## Fix and result

Cash and tournament stacks recorded separately; the conservation delta is
computed against cash only. Pre-fix rows are not comparable and are treated as
a baseline.

    unexplained_delta:  3,557,768  ->  -60.88

Verified on two consecutive live snapshots. The residual is rake leaving cash
tables for the union rake wallet across the ~40s between them — an untracked
pool, small and explainable.

## Note

`fn_settlement_conservation_check` (added the same day) is unaffected and
remains the strict assertion: it covers settlement flows, which ARE
double-entry by construction. This monitor covers the broader supply, which is
observational.
