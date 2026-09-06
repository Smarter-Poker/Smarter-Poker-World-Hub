# The panel shows what the horses now measure

2026-09-06. Three RPCs existed in the database with no reader on this page,
which is the same failure as a tag nobody reads — the thing the whole horse
audit programme was started to fix. A number nobody can see is a number
nobody acts on.

## What is new on /horses/hand-reviews

**Tournament Scoreboard.** 66% of horse seat-hands are tournaments and this
page could not show a single result: the self-tuner is cash-only by design,
and `horse_daily_nets` records tournament chips as 0.0 bb/100 because chips
are not bb-comparable. ROI against the fee is the number that IS comparable.
Entries, invested, won, ROI, ITM and average finish per type over seven days,
with the caption saying to compare against minus-the-fee rather than zero,
because the fleet plays itself. Only a deep loss (worse than -15%) is
coloured as a fault.

**Frequency Leaks.** Every hand tag needs a 20bb pot and most need a
showdown, so over-folding, never 3-betting, limping and passive postflop play
could never reach one — none of them costs 20bb in a single pot. These come
from `horse_daily_play` on the same bands the self-tuner moves the dials
against, so the panel and the tuner cannot disagree about what a leak is. A
banner fires when a third of the studied horses share one leak: that is a bar
in the brain, not a set of dials, and tuning against it is the fleet trying
and losing.

**Solver Agreement.** The League Card directly above measures one config
against another and can never say whether either plays well. This is the
absolute score — the mean solver frequency of the action the horse chose,
over hold'em push/fold spots. The day-over-day change is coloured because a
fall is the one regression the league structurally cannot see.

## House rules followed

Every card uses the page's existing idiom: a real `<button>` expander with
`aria-expanded` and `aria-controls` (a div answers to neither Enter nor
Space), `T` tokens for colour, a CSV export with its own column map, and the
page's error discipline — **a failed read must LOOK failed** rather than
render as "No Data Yet", because on this page an empty card is itself a
finding and the two states can never be allowed to look alike.

`pct()` renders a rate stored 0..1 as a percent and shows a dash for null,
which is a real answer here: `fn_horse_frequency_leaks` returns null for a
rate whose denominator was too small to mean anything, and a 0% would be a
lie.

Verified: `next build` compiles and `/horses/hand-reviews` renders in the
route table; eslint clean; the title-case gate passes.
