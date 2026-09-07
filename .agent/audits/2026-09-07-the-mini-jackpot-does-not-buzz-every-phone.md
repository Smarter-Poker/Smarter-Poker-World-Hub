# The Mini jackpot does not buzz every phone in the club

2026-09-07. World Hub half of a Club Arena change.

## What happened

Club Arena shipped BBJ phase 6 today: a second jackpot tier, the **Mini**, a
flat few hundred chips out of the backup reserve for a hand that came close to
the main bar and missed. It writes a `bbj_winners` row exactly like the main
jackpot, which is the right design - one ledger, one reconciliation, one
winners list.

`src/components/club-arena/BBJDisplay.js` subscribes to that INSERT and, on
every one, fires:

- three **heavy haptics**, 200ms apart;
- a two-second **audio fanfare** (a 440 -> 880Hz ramp);
- a full-screen **"JACKPOT HIT!"** takeover.

That is right for the main jackpot. Measured on production, the main fires about
**once a fortnight** and pays six figures. The Mini fires **about four times a
day** for a few hundred chips.

Left alone, every phone looking at a club page would have buzzed three times and
played a fanfare every six hours, and within a week the real jackpot would have
been indistinguishable from background noise. Club Arena's CLAUDE.md 10.84 puts
it exactly: an alarm that is always on is an alarm that gets muted - except what
gets muted here is the biggest moment on the platform.

Nothing had fired yet. No Mini has hit in production; this was caught in the gap
between the feature merging and the first real one.

## What changed

- **`BBJDisplay.js`** skips the haptics, the fanfare and the takeover when
  `payload.new.kind` is anything but `main`. It still refetches so the winners
  list below stays current, and the refetch failure is logged rather than
  swallowed.
- The winners card labels a Mini row **"Mini Jackpot - "** before the variant.
  A few hundred chips listed beside a five-figure main with nothing between them
  reads as the big one having paid almost nothing.
- The celebration headline reads **"MINI JACKPOT HIT!"** if one is ever shown
  deliberately.
- **`pages/api/club-arena/bbj.js`** passes `kind` through on every winner.

**A row with no `kind` is a main jackpot.** Every row written before 2026-09-07
has none, so all 29 historical hits behave exactly as they did.

A Mini is not hidden - it still gets the full celebration at its own table in
Club Arena, where the people it happened to are sitting. It just does not
interrupt everybody else.

## Verified

`npx next build` compiled successfully, 397 static pages generated. ESLint clean
on both files (0 errors). No `.single()`, no new module-scope client, no emoji -
the 8 immutable rules hold on the diff.
