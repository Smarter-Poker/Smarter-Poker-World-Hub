# Poker Brain — Open Notes & Architectural Decisions

This file captures design decisions, approximations, and known gaps in
the Poker Brain that are intentional or require external input to
resolve. It is **not** a bug list — those belong in GitHub issues. Each
entry should be actionable for the next agent who picks it up.

Last updated: 2026-04-09 (phase 4 — loose-ends cleanup)

---

## 1. PLO tournament push/fold ranges

**Status:** intentional gap — no standard Nash chart exists for PLO.

**Where:** `engine.js`, `getDecision()` tournament branch. Currently the
NLHE branch uses the Sage/Nash `PUSH_RANGE_BY_BB` chart for 5/10/15/20
BB effective stacks. The PLO branch has a simple short-stack jam gate:

```js
if (istournament && isOmaha && bbStackCalc < 12 && action !== 'FOLD') {
  action = 'RAISE';
  raiseAmount = stackSize;
  confidence = Math.max(confidence, 72);
  reasoning += ' (PLO short-stack jam)';
}
```

**Why not more:** Unlike NLHE, there is no published Nash-equilibrium
chart for short-stack PLO. Solvers like MonkerSolver produce MTT PLO
ranges that depend heavily on ante structure, ICM pressure, and
opponent tendencies — they cannot be reduced to a single "shove this
hand at 10 BB" table the way NLHE can.

**What to do next:** either (a) integrate a simpler equity-versus-fold
heuristic (shove any hand with >35% all-in equity vs a random PLO
range at <10BB), or (b) pull canned ranges from a published solver
run for a known MTT structure (e.g., 6-max turbo) and document the
assumptions. Option (a) is faster; option (b) is more accurate but
requires a data file.

---

## 2. Bubble-factor heuristic is stage-based, not ICM-computed

**Status:** intentional approximation.

**Where:** `engine.js`, `bubbleFactorForStage()`:

```js
case 'bubble':     return 1.5;
case 'itm':        return 1.25;
case 'ft':         return 1.35;
case 'middle':     return 1.1;
case 'early':      return 1.0;
```

**Why not real ICM:** Proper ICM bubble factors require the full payout
structure (1st/2nd/.../nth prize), remaining player count, and every
remaining player's stack size. The HUD only knows (at best) the user's
stack and the current blind level. Computing Malmuth-Harville ICM
equity from those inputs is infeasible without a solver.

**What to do next:** when the HUD gains access to the tournament
lobby OCR (payouts + player counts), replace `bubbleFactorForStage`
with a real Malmuth-Harville ICM call. The existing `icmAdjustedEV`
wrapper already takes a numeric bubble factor, so only the source of
that number needs to change — no call-site refactor required.

---

## 3. Tournament "stage" detection is manual

**Status:** intentional — user-driven until OCR can distinguish.

**Where:** `HUD.jsx` — the tournament-stage dropdown is a user control.

**Why:** There is no reliable visual signal in the PokerBros client
that says "we are now on the bubble." The tournament lobby screen
does show player counts relative to paid spots, but that's a different
window from the cash-game HUD.

**What to do next:** add a lightweight tournament-lobby OCR that
reads "X of Y players remaining / pays Z" and derives the stage
automatically. Until then the manual dropdown is correct behavior.

---

## 4. Hi-Lo scoop equity formula is a rough weighting

**Status:** intentional approximation. Accurate enough for HUD use;
not accurate enough for a solver.

**Where:** `engine.js`, postflop Hi-Lo branch:

```js
equity = Math.min(100, (highEquity * 0.5) + (lowEquity * 0.5) + (highEquity > 70 ? 10 : 0));
```

**Why:** The formula assumes the low half always exists — i.e., that
some player always has a qualifying low. In reality the low half
is absorbed into the high half whenever no one has A-2 / A-3 / 2-3
or the board doesn't bring 3 low cards. A fully correct expected
share would be:

```
pot_share = pLowExists * (0.5*highEquity + 0.5*lowEquity)
          + (1 - pLowExists) * highEquity
```

where `pLowExists` is the probability *anyone* has a qualifying low
against this board. We don't currently track `pLowExists` as a return
field, and the HUD's Hi/Lo tiles display `highEquity` and `lowEquity`
independently so the user can eyeball the scoop themselves.

**What to do next:** if Hi-Lo becomes a primary variant, track
`lowPossible` (fraction of iterations where a qualifying low exists
for any player) in `calculateEquity` and expose it on the bridge
return. Update the scoop formula to use the exact expression above.

---

## 5. Historical hand recompute is pure — no DB migration runtime

**Status:** by design. See `recompute.js`.

**Where:** `src/lib/poker-brain/recompute.js`. The module exposes
`recomputeHandEquity`, `recomputeHandsBatch`, and `summarizeRecompute`
as pure functions. It deliberately does NOT talk to Supabase, the
IndexedDB offline queue, or the React layer.

**Why pure:** baking a migration runtime into the browser bundle would
ship table-scan logic to every user and tie the migration to release
timing. Pure functions let us:
  - Unit-test the recompute without mocking Supabase.
  - Run the migration from an offline Node script with full stats.
  - Diff before writing back (dry run).

**How to run the migration (when ready):**

```js
// node scripts/migrate-stale-equities.js
import { createClient } from '@supabase/supabase-js';
import { recomputeHandsBatch, summarizeRecompute } from '../src/lib/poker-brain/recompute.js';

const supabase = createClient(URL, SERVICE_ROLE_KEY);
const { data: oldHands } = await supabase
  .from('pb_hands')
  .select('id, hole_cards, board, game_type, players, equity, low_equity, schema_version')
  .lt('schema_version', 4)
  .limit(1000);

const fixed = recomputeHandsBatch(oldHands.map(h => ({
  holeCards: h.hole_cards,
  board: h.board,
  gameType: h.game_type,
  players: h.players,
  equity: h.equity,
  lowEquity: h.low_equity,
  id: h.id,
})));

console.log(summarizeRecompute(oldHands, fixed));
// dry-run diff -- confirm maxEquityDelta looks sane before writing back

for (const h of fixed) {
  if (h.recomputeError || h.recomputeSkipped) continue;
  await supabase
    .from('pb_hands')
    .update({
      equity: h.equity,
      low_equity: h.lowEquity,
      schema_version: 4,
    })
    .eq('id', h.id);
}
```

**What's still needed:** (a) a `schema_version` column on `pb_hands`
(if not already present), and (b) confirmation from Dan that he wants
historical equities rewritten in place vs preserved for audit.

---

## 6. Matcher dealer-button detection is 6-max only

**Status:** documented fallback path works for other sizes but gives
lower confidence.

**Where:** `dealer-detect.js`:

```js
// Fallback for non-6max (table sizes not yet supported explicitly)
```

**Why:** PokerBros shows dealer seats at fixed screen coordinates per
table size. 6-max is fully calibrated; 9-max and heads-up use a
scanning fallback that is more tolerant but less precise.

**What to do next:** add table-size-specific seat region arrays when
we have a corpus of 9-max and HU screenshots to calibrate from. Low
priority — 6-max is the dominant PokerBros table format.

---

## 7. Preflop equity is not Monte-Carlo

**Status:** by design.

**Where:** `engine.js`, `getDecision()` preflop branch.

**Why:** NLHE preflop uses the 169-hand chart (`RFI`, `THREEBET_RANGE`,
`FOURBET_RANGE`); PLO preflop uses a heuristic (broadways + pair +
suits). Running Monte-Carlo preflop would add ~40 ms per frame for no
decision-quality gain — the charts already encode the optimal answer.

`recomputeHandEquity` therefore returns `{ skipped: true, reason }`
for any hand with an empty board. Historical preflop hands don't
need equity recomputation; they need chart-version tracking, which
is a separate concern.

**What to do next:** nothing unless we introduce a "custom range
analyzer" feature that *does* want preflop MC numbers.

---

## 8. Calibration overlay persistence is localStorage-only

**Status:** intentional — per-device by design.

**Where:** `CalibrationOverlay.jsx`, key `pokerBrain.layoutOverrides.v1`.

**Why:** calibration is a per-device concern (screen DPR, monitor
resolution, PokerBros client theme). Syncing overrides across
devices would cause the wrong layout to load on a user's laptop
after they calibrated on their desktop.

**What to do next:** if we ever add a "Profiles" concept (e.g.,
"my home desktop", "my office laptop"), move the storage to
Supabase keyed by profile slug. Not needed until multi-device
calibration is a demand.

---

## Resolved in phase 4

The following items are no longer "loose ends" as of this session:

- **evaluateHand catastrophic scoring bug** — fixed in phase 1
  (`47d006097`). High-Card and Flush now use base-10 kicker slots
  capped at 7e6, keeping made-hand scores above them.
- **Variant hole-count plumbing** — fixed in phase 2 and phase 3.
  Engine, bridge, matcher, HUD, and layout.json are all aligned on
  `expectedHoleCount(variant)`.
- **Hi-Lo Omaha low-side equity was null** — fixed in phase 4.
  `getOmahaLowBest` now enumerates the 2-from-hole / 3-from-board
  combinations and compares against opponents with proper tie-splits.
- **Hi-Lo lowWins counted unconditionally** — fixed in phase 4.
  `lowWins` now credits tie shares correctly (`1/(oppLowTies+1)`)
  and only fires when hero has a qualifying low.
- **`Calibration.jsx` dead component** — deleted in phase 4. The
  functionality lives in `CalibrationOverlay.jsx` which is wired
  into the HUD.
- **No recompute path for stale stored equities** — fixed in phase 4
  with `recompute.js`.
