# Trainer audit pass 2 — what a 50/50 parity tally could not see

**Date:** 2026-08-15
**Scope:** the GTO training arena, audited against `.agent/design/GTOW-PARITY-ROADMAP.md`
**Shipped:** `c02ff5a0` → `f7cc6001` → `4d1e2dd3`, each verified on production
`/api/health` before the next was written.

---

## Why this pass happened at all

The parity roadmap read **50/50 DONE**, and that tally was measured honestly —
every item was promoted on screen evidence, most of it detailed enough to
re-derive. The tally was also not a description of a working product.

Five audits run in parallel over the trainer found **seventeen live defects**.
None was caught by any existing gate. Two made hands unwinnable. One wrote
fabricated rows to the database. Several had been shipped and broken for the
entire life of the component they lived in.

The reason a per-item check missed all of them generalises, and it is the one
thing worth carrying out of this document:

> An item's pass condition asks "does this feature work?". It cannot ask "does
> this feature work **while the rest of the system is also running**?" Every
> defect below lives either BETWEEN two items that each pass, or behind a
> default so plausible that a working-looking panel is the symptom.

Concretely: `#21 difficulty remaps buttons correctly` passes when you check the
remapper. It does not reveal that a SECOND remapper runs afterwards and deletes
the correct answer. `#40 pot-type breakdown` passes once its own `handData`
read is fixed. It does not reveal the six other consumers with the same bug.

---

## The three defect classes, ranked by what they cost the player

### Class 1 — a default that looks like data

The largest cluster. `useGTOWScore.recordMove` pushes
`{handNumber, classification, evLoss, ...handData}` — spread FLAT, with no
`entry.handData` key. Reading `h.handData.heroPosition` returns `undefined`,
the `|| 'UNK'` behind it fires, and a chart renders.

Nothing throws. Nothing logs. The panel is *full of values*. That is why this
survived two previous discoveries and seven remaining sites, including:

- **Every session ever saved** wrote a single `UNK` bucket into
  `training_sessions.position_stats`. `/api/training/gto-reports` and
  `/api/training/coaching-summary` derive "strongest position", "weakest
  position" and the recommended drill from that column. Those rows are not
  recoverable.
- **Action Diversity was hard-wired to 0%** — every hand bucketed to the same
  `'unknown'` key, so `maxActionCount === totalHands`. Every player of every
  session saw a red bar and *"Too predictable — mix in more actions"* on the
  default review tab.
- **Per-street EV loss defaulted a missing street to `'flop'`**, charging every
  preflop mistake to the flop bar. This is the sharpest example in the whole
  audit: the resulting chart is not merely wrong, it is *plausible*, and it
  would survive any amount of visual review.
- **The D1 payload-compaction fix was a no-op on both client and server.** It
  stripped two 169-hand solver matrices off `h.handData`; `if (!hd) return h;`
  was taken on every entry of every session. The comment measuring "compacted
  histories ~400KB" was measuring uncompacted data.

**Fix:** one module, `src/lib/training/handHistoryEntry.js`, that knows an entry
has two possible shapes. **A `.handData` property access anywhere outside it is
now a bug.**

### Class 2 — two implementations of one behaviour

The roadmap already records this law once (#6: *"Two implementations of the
same behaviour will diverge — mirror, don't race"*). It recurred, in the action
pipeline, and this time it was load-bearing.

`useGTOTrainer.applyDifficultyToQuestion` collapses the action set — carefully,
with frequency aggregation, EV re-keying, and an explicit fail-safe that serves
the question *unsimplified rather than unwinnable*. Then
`UniversalDynamicTable` collapsed the result **again**, with a different
vocabulary. The hook emits `fold`/`check`/`bet`; the grouper knew `f`/`x`/`b33`.
Unrecognised ids fell into an `other` bucket the emitter did not emit.

The fail-safe could not help. It validates its own output, and the damage
happened after it returned. A spot whose solver-best was Check or Fold arrived
on the felt **with no button for it**.

Downstream of the same collision: printed frequencies summed to 40–70%; GROUPED
mode could never produce its four sizing buckets because the sizings were
already erased (`x/b33/b75/b125` rendered as `Check | Bet`, making the middle
difficulty tier a duplicate of the easiest one); `c` (call) rendered a **Check**
button facing a bet; and the config card promising "Exact Sizings" resolved to
GROUPED *and was that screen's default*.

**Fix:** one remapper per question. The table skips re-grouping when the
question carries `_difficultyApplied`; GROUPED bucketing moved into
`DifficultyEngine` where the sizings still exist; `actionGrouper` owns the
thresholds and parser so the two cannot drift.

### Class 3 — a call that never happened

`useGTOTrainer` calls ten engine methods that **do not exist in the repo**. Each
wrapper is `try { return engine.getX(...) } catch { return null }`. Every call
threw a `TypeError` on the missing name, the catch swallowed it, and each
panel's `if (!x) return null` guard rendered nothing.

Nine coaching panels have therefore been blank for their entire existence.
Roadmap #33 attributed this to a hand-strength vocabulary mismatch — a real
defect, since fixed — and the attribution was wrong. The mechanism was a
missing method name, and a `catch` broad enough to hide it.

**Fix:** all ten implemented deterministically. The three session-level ones
read `_sessionStats.history`, which `recordSessionHand` has populated since
2026-08-08.

---

## What screen-verification caught that the gates could not

All three post-ship commits exist because a measurement contradicted a green
suite. This is the roadmap's own lesson (#16: *"Three of these four fixes
passed every unit gate while production was still wrong"*) recurring twice more.

1. **`f7cc6001` — the hand-class panel never rendered.** 45 assertions passed;
   the section was absent on screen with no error. Cause: `scenario.board` on a
   served question is the **string** `"7s 4h Tc"`, not an array. `boardRanks`
   required the array, returned `[]`, so every class was bucketed with the
   PREFLOP keys while the row order asked for the postflop ones. Empty
   intersection → zero rows → the whole section gated off. Every unit test had
   passed an array, because I wrote both sides.

2. **`4d1e2dd3` — the panel rendered, and lied.** Reading the screenshot: board
   `Kh Ah Kd`, *"Sets & better 28.5% of range"*. Any hole card matching any
   board rank was graded as trips on a paired board, so every ace read as a
   monster when it is two pair. **A hand-strength readout that errs upward is
   worse than one that is absent** — it flatters the player on exactly the
   texture where the mistake costs stacks. Corrected to 14.7% with a populated
   Two pair bucket at 13%.

3. **Same commit — a top-of-deck gutshot called an open-ender.** "The missing
   card is at an end of the run" is the textbook shorthand and it fails at the
   ace: QJ on an A-K board needs only a ten, because no window sits above the
   ace. Replaced by counting the distinct completing ranks — the definition the
   shorthand approximates, so the two cannot disagree.

A fourth was caught in my own test file rather than in production: the first
draft asserted KK is an overpair on an ace-high board. It is not, and the
classifier was right. **Both directions of that assertion are worth writing
down** — a test can be wrong about poker just as easily as code can.

---

## Verified on screen

Production `4d1e2dd3`, iPhone context 430x932, `cash-007`, eight consecutive
hands, `PAGE_ERRORS=[]`:

- **`CHECK | SMALL BET`** on the felt with `+0.72` / `+0.02` EV chips and
  `97% / 3%`. The sizing bucket is the first time GROUPED mode has rendered a
  sizing category; the frequencies sum to 100.
- **`BY HAND CLASS 1142 COMBOS`**, seven rows summing to 100.0%: Sets & better
  14.7%, Two pair 13%, then 0.5 / 4.2 / 1.4 / 5.3 / 60.9. Identical across
  three consecutive reads of the same spot (deterministic), and the suited
  caveat renders beneath it.
- **Coaching panels populated with spot-aware prose.** POSITION changes with
  hero's seat (BTN text vs BB text across hands); STREET PLAN says *"which turn
  cards"* on a flop and *"which river cards"* on a turn. These panels had never
  rendered once before this pass.
- **Range tab EV overlay**: ~136 per-hand EV cells where it printed none.
  `RangeGrid` has accepted `handEVs` and `showEVOverlay` since it was written;
  the call site passed neither, and `evData.handEVs` was three lines away.

---

## Deliberate non-goals, recorded so they are not read as oversights

- **Flush draws get no hand-class bucket.** A 169-class grid records rank
  structure and a suited flag, not which suits. A suited class holds a flush
  draw in exactly one combination of four, so claiming one would be wrong three
  times out of four. Made hands and straight draws are exact and are reported
  as such; the panel states the limit in `suitedNote` rather than leaving the
  omission to be read as a finding.
- **Villain's range is still solver-blocked.** The harvester writes only the
  acting player's `frequencies`; the `set_range OOP/IP` inputs are never
  persisted. A sibling-row lookup could show villain's strategy *at their own
  node*, which is a different object from their range at hero's node. Not
  built, because the honest version needs the solver change.
- **`getContextualFillers` still adds one option** on a solver node that
  returns a single action. Roadmap #20 forbids padding, and three fabricated
  bet SIZINGS were removed; one unsized aggressive option remains, because a
  one-button decision is not a decision.
- **The three UI difficulty tiers still map `standard → GROUPED`.** That is
  correct for `SessionSetupModal`'s vocabulary, where 'standard' is the middle
  tier. The collision was `TrainerConfigModal` using the same word for "exact
  sizings"; it now emits `'exact'`.

---

## Gates

New: `node scripts/trainer-difficulty-check.js` — **PASS 64 FAIL 0**. Every
defect above has an assertion, including the three that only screen
measurement found. Each new assertion fails against the previous
implementation; that was checked rather than assumed.

Unchanged and re-run green: `preflop-pot-check` 52, `table-geometry-check` 62,
`ev-calibration-check` 10, `avatar-library-check` 29, `node --test` 70.

`supabase/migrations/20260809022000_fn_training_leaderboard_record.sql` adds
the atomic leaderboard writer's `CREATE FUNCTION`, which was live in production
but absent from the repo — so `db reset` and every preview database failed at
the migration that asserts it exists. Timestamped to sort one minute before it.
