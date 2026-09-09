# The Diamond Arena pages were showing invented players, results and stats

2026-09-08. Phase 5.5 of the diamond accounting roadmap (Club Arena
`docs/DIAMOND-ACCOUNTING-ROADMAP.md`).

## What was live

Five pages under `/hub/diamond-arena` rendered hard-coded data as though it were
real, in a currency players actually hold, for a room that has never opened.

| Page | What it showed | Status |
| --- | --- | --- |
| `schedule.js` | A "Daily Diamond Freeroll" and a "Sunday Million", 50,000 prize pool, 100-Diamond buy-in, "234/500 registered", each beside a Register button with no `onClick` | Fixed earlier by another agent |
| `leaderboard.js` | Three invented players - `PokerPro2024` on 147,832 diamonds, `DiamondKing` on 132,451, `SharkMaster` on 118,923 - with game counts and win rates, plus a realtime subscription to `diamond_arena_scores` | **Fixed here** |
| `history.js` | Two sessions dated with `new Date()` so they always read as today and yesterday: +2,450 over 127 hands, +5,000 over 89 - rendered as the READER'S OWN history | **Fixed here** |
| `stats.js` | 1,247 games, 847 cash, 400 tournaments, 147,832 diamonds won, 68 percent win rate, a 12-game best streak - rendered as the reader's own | **Fixed here** |
| `table-settings.js` | UI preferences only, no player data | No change needed |

Two things make this worse than ordinary placeholder content:

1. **`history.js` and `stats.js` invented the reader's own results.** A
   fabricated leaderboard invents strangers, which a player might doubt. A
   fabricated personal win record is something they have no way to check.
2. **The same 147,832 appeared on two pages** - as the top leaderboard entry and
   as the viewer's lifetime winnings. That is how a set of constants copied
   between files starts to look corroborated.

`diamond_arena_scores`, the table the leaderboard's realtime channel watched,
**is not a table on this database and never has been**, so the subscription
could only ever have refreshed a list of constants that cannot change. It is
removed rather than re-pointed: there is nothing yet for it to watch.

## What is true

The Diamond Arena's club row was created on 2026-09-08
(`clubs.is_platform`, `ca_arena_settings.club_id`) and holds no tables, no
tournaments and no diamonds. Nobody has played a hand in it. Every real figure
on these pages is zero, and zero is now what they show, above an empty state
that says the arena has not opened.

## Pinned

`__tests__/the-diamond-arena-never-invents-a-player.law.test.mjs` fails if any
of the eight invented figures returns, if any page subscribes to
`diamond_arena_scores`, or if a page imports a React hook it does not call
(World Hub rule 2 - an unused hook import is a ReferenceError during SSG and
takes the whole build down). It strips comments before searching, because the
pages now explain by name what they used to show.

## Not done here

Routing `/hub/diamond-arena` into the Club Arena SPA scoped to the platform club
is roadmap 5.5 and waits on the arena having something to show. The entry
condition for opening a diamond table is unchanged and unmet: seven consecutive
days of `fn_ca_diamond_trial_balance` at zero on every account, suspense zero,
and no open critical `ca_diamond_incidents`.
