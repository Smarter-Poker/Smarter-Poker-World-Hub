# 2026-09-06 - The World Hub said the Bad Beat Jackpot was empty. It held 107,092 chips.

Part of the Club Arena BBJ build plan, phase 3 of 6 ("everyone hears it").
Plan and full history: `club-arena/docs/BBJ-BUILD-PLAN.md` and
`club-arena/docs/changelog/2026-09-06-bbj-phase-3-everyone-hears-it.md`.

## Measured first

```
pool                     pool_amount   main_balance
union f9806a7f...             0.00       107,092.27
club  a7a65cfc...         1,000.00        23,142.58
```

`bbj_pools.pool_amount` is a legacy column. Nothing has written to it since the
triple-bank rework; the engine banks into `main_balance`. **Every** Bad Beat
Jackpot read in this repo used `pool_amount`.

So for months the World Hub has been telling players the jackpot is empty, or
a thousand chips, while it held a hundred and seven thousand.

## Four separate faults, any one of which was enough

1. **`/api/club-arena/bbj` read `pool_amount`** in both its GET and its status
   branch. Fixed: one `readBbjPool()` helper that asks
   `fn_bbj_pool_for_club` - the one place the union rule lives, and the same
   function Club Arena's own surfaces use.

2. **Every query filtered `club_id=eq.<club>`.** A union banks the jackpot on a
   row whose `club_id` IS NULL, so for every club in a union the query matched
   **nothing at all** and the figure fell back to 0. The union pool is the one
   holding 107,092.

3. **`useBBJ` returned the wrong shape.** Its only caller reads
   `const { bbjData } = useBBJ(...)` and guards on `bbjData.pool?.amount > 0`;
   the hook returned `{ amount }`. `bbjData` was `undefined`, so the guard was
   false for ever and **that ticker has never rendered once**.

4. **`BBJTicker`'s Realtime subscription was actively harmful.** It bound to
   `bbj_pools` UPDATE and read `payload.new.pool_amount` and
   `payload.new.hourly_rate` - the first a dead column, the second not a column
   at all. On every raked hand (one every 2.1 seconds) it **overwrote** the
   correct figure the 30-second poll had just fetched with a stale value or a
   zero, and set the tick-up rate to 0, disabling the animation the component
   exists for. The subscription was not merely useless; it was the reason the
   ticker was wrong.

## And the firehose, which is why the subscriptions are gone rather than fixed

`bbj_pools` is updated on every raked hand: **40,219 updates in twenty-four
hours**, measured on production 2026-09-06. Three surfaces in this repo, and
six in Club Arena, each held a subscription to it - decoded by the WAL reader,
filtered per subscriber, pushed to every open tab, visible or not - to keep
current a figure a player glances at.

Club Arena phase 3.2 replaced its six with one shared ten-second poll per club.
This is the World Hub's three: `BBJDisplay.useBBJ`, `BBJTicker` and
`useWalletData` all poll now. With these gone, **no code anywhere subscribes to
`bbj_pools`**, which is what lets the table leave the Realtime publication.

The event that actually matters - the jackpot being HIT - never came through
this path anyway. It is one `bbj_winners` INSERT per hit, roughly once a
fortnight, and Club Arena phase 3.1 wires it directly.

## What is deliberately NOT here

`bbj_pools` is still in the Realtime publication. It leaves in its own
migration once this deploy is live: a browser still holding the previous bundle
is still subscribing, and taking the table out from under it would freeze its
figure with nothing to say why.
