# Two frozen tournaments settled under the new money authority

2026-09-02. Recorded here because the money moved in the shared Supabase
database, which both repos own between them, and because CLAUDE.md 10.6 now
requires an audit note as part of any settlement.

## Cause

A tournament table can be OPEN in `tables` while holding no engine in the
Hetzner process. Every sweep on the platform walks the engine map, so none can
see such a table, and the players seated on it freeze under a live tournament.
Fixed in Club Arena PR #2643 (`adoptEnginelessTables`). Three tournaments were
already frozen when it merged; one recovered on its own, two were settled by
migration `20260902_settle_two_tournaments_frozen_by_the_engineless_table_defect`.

## What was paid

| Event | Before | After |
| --- | --- | --- |
| `$100 Freeroll 6:00 PM` (f1b134c0) | COMPLETING 15h, 0.00 of a 100.00 pool ever paid, finishing order inverted at the tail, two chip-holders with no place | 100.00 paid across 9 places, order restated from `eliminated_at`, survivors 1st and 2nd on chip count |
| `$100 Freeroll 12:00 AM` (39f751e9) | COMPLETING, 1st never awarded, 282.06 of 354.70 paid, one live player omitted from the count since 07:08 | 396.41 paid: WheelWolf 1st 72.64, StackRat 2nd 41.71 |

The 12:00 AM event ran 41.71 over its pool. That is StackRat's second-place
money, and the 20 already-paid places below him are each one place too generous
by their new number. None of it was clawed back: those players did nothing
wrong, and the platform does not take money back from a player for its own
defect. The house absorbed it.

## Method

Both plans were run first inside a transaction ended by `RAISE EXCEPTION`
(Club Arena CLAUDE.md 11.5) and the committed numbers are the probe's numbers,
asserted by the migration so it aborts on disagreement. Money moved only
through `fn_tournament_payout_reconcile(..., true)`, which reads prior payment
from `tournament_payouts` and credits under a per-user idempotency key. Eleven
wallet credits landed. `financial_alerts` row `5ebec499` resolved with a
`resolution` note recording the accepted overpay.

## Correction to the record

The previous session reported a fleet-wide engine dealing-throughput defect.
There is none. The platform dealt 15,000-17,000 hands an hour across ~550
tables throughout, cash tables with 2+ seated and no hand in an hour numbered
zero, Midway Union dealt 250,302 hands in 24h and Deep Stack Society 58,336.
The real defect was the engineless table above, and it was visible only by
diffing `/health` against `tables`.
