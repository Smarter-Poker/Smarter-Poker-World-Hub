# GTO Wizard Parity Roadmap — Trainer

**Status:** canonical conformance checklist. Companion to `TRAINING-UI-SPEC.md`
(which governs look and feel) — this file governs *behaviour*.
**Created:** 2026-07-26
**Destination:** `.agent/design/GTOW-PARITY-ROADMAP.md`

Every item is numbered, has a verifiable pass condition, and a status. Change a
status only after loading the screen and checking — never after reading code.
`GTO-WIZARD-CLONE-PLAN.md` is the *engine* roadmap; it says nothing about the
trainer's behaviour, which is the gap this file closes.

Status key: **DONE** verified · **BUILT** shipped but unverified on screen ·
**GAP** not implemented · **BROKEN** implemented but wrong.

---

## Part A — Reference: what GTO Wizard actually does

Sourced from GTO Wizard's own documentation, not assumed.

**Scoring.** Every move gets a GTOW Score from **-100% to +100%**. Five tiers:
Best (highest-frequency solver action, marked with a double check), Correct (an
action the solver takes at some frequency), Inaccuracy (below ~3.5% frequency
but no serious EV damage), Wrong (not in the GTO strategy at all), Blunder
(never played AND costs substantial EV).

**EV loss** is reported in **two units** — big blinds and **percent of pot**,
the second so losses compare across pot sizes. Aggregates tracked: total
cumulative loss (bb), average loss per hand (bb), and **average loss per
mistake** (bb).

**Difficulty** changes the buttons: Standard = pick the exact solver sizing;
Grouped = small / medium / large / overbet; Simple = bet-raise / check-call /
fold.

**Info panel** has a Range tab (both players' distributions and draw types) and
a Strategy tab (overall approach, range frequencies, hand-class strategy).
Sections collapse via eye icons; the panel pops out into its own window.

**Session settings:** Game Mode (Full Hand / Spot / Street), hand selection
(filter trivial spots, or close decisions only), board-texture targeting, game
speed (Normal / Fast / Turbo), up to 4 simultaneous tables, Auto New Hand with
a configurable delay (~3s recommended), a timebank of 7 / 15 / 25 seconds, and
a feedback rule — stop after *every* action, or **only after a mistake**.

**RNG.** An optional dice showing 1-100 for randomising mixed strategies; it
colours yellow/blue and the "best" action changes with the roll and the chosen
High/Low mode.

---

## Part B — Conformance checklist

### Session setup and flow

1. **One configuration step only.** DONE — the dashboard's SessionSetupModal
   now passes `initialConfig`; the arena no longer re-prompts. You previously
   had to fill in difficulty/timer/mode on two consecutive screens.
2. **Setup choices are honoured.** DONE — `handleSetupStart` literally
   discarded its own prefs, so the arena fell back to defaults.
3. **Game Mode: Full Hand / Spot / Street.** GAP — we always play a spot, with
   partial multi-street support. GTOW makes this an explicit choice.
4. **Timebank 7 / 15 / 25s.** BUILT 2026-07-26 — re-scaled to No timer /
   25s / 15s / 7s across the setup modal and both in-arena pickers. Ours had
   'Standard' at 60s, four times GTOW's longest tier.
5. **Auto New Hand delay configurable.** BUILT — auto-advance is now opt-in;
   the delay is still hardcoded. Expose it, default 3s when enabled.
6. **Feedback rule: every action vs only-after-mistake.** GAP — the single
   most important pacing control in the trainer, and we don't have it.
7. **Hand selection: filter trivial / close decisions only.** GAP.
8. **Board-texture targeting.** BUILT via the config modal; unverified.
9. **Game speed Normal / Fast / Turbo.** GAP.
10. **Up to 4 simultaneous tables.** GAP — a `useMultiTable` hook exists but
    the arena never uses it.

### The table

11. **The question is displayed.** DONE — `questionText` was computed and never
    rendered for the entire life of the component; you only ever saw the
    context strip.
12. **Hero bottom-centre, villains rotated from hero.** BUILT.
13. **Dealer button per the position LAW.** DONE.
14. **Chip stack in front of every seat with money committed.** BUILT.
15. **Board clamped to street** (0/3/4/5). BUILT.
16. **Pot includes blinds preflop.** BUILT.
17. **Villain shows a real stack, not a fabricated one.** BUILT.
18. **Folded villains grey out rather than vanish.** BUILT.
19. **Avatar must not float mid-table.** BROKEN — visible in the feedback view.
20. **Buttons show only actions the solver returned.** DONE — and must never be
    padded to a fixed count; invented buttons make the frequency bars lie.
21. **Difficulty remaps buttons correctly.** DONE — the Simple remap dropped
    sized actions and lost the correct answer entirely.
22. **Keyboard shortcuts resolve against the rendered buttons.** DONE.

### Scoring and feedback

23. **Five-tier classification.** BUILT.
24. **Best marked distinctly from merely Correct.** GAP — GTOW uses a double
    check.
25. **GTOW Score -100..+100.** BROKEN — ours is a 0-100 weighted average.
26. **EV loss in bb.** DONE — was inflated by a factor of the pot size.
27. **EV loss as % of pot.** BUILT 2026-07-26 — the engine formula was fixed
    earlier; the value was computed and then displayed nowhere. The feedback
    banner now shows both units, e.g. `-0.50 bb (8.3% pot)`.
28. **Average loss per mistake.** BUILT — corrected during cross-reference:
    `avgEVLossPerMistake` already existed in useGTOWScore and is threaded
    through the arena. The roadmap's original GAP status was wrong.
29. **Feedback waits for the player.** DONE — auto-advance defaulted on at 2s,
    which is why explanations vanished before they could be read.
30. **Feedback inline; hand stays visible.** BROKEN — renders below, but the
    table collapses (see 19).
31. **Solver frequencies per action.** BUILT.
32. **Your action vs optimal, with EV of each.** BUILT.
33. **Plain-language reason.** BUILT — though many deeper coaching notes were
    dead code comparing free-text hand strength against snake_case enums.
34. **Mistake review at session end.** BUILT.

### Info panel

35. **Range tab.** BUILT.
36. **Strategy tab.** BUILT.
37. **Collapsible sections / pop-out panel.** GAP.

### RNG

38. **Dice 1-100 with High/Low.** BUILT — toggle exists; behavioural parity
    (best action changing with the roll) unverified.

### Reporting

39. **Stats by format and date.** BUILT.
40. **Pot-type breakdown.** GAP.
41. **Frequency-difference metric.** BUILT.
42. **Leaderboard populates.** DONE — the writer targeted a table shape that
    does not exist, so every write failed silently.
43. **Streaks record.** DONE — no live caller, plus three missing columns.
44. **Reports page loads.** DONE — selected four non-existent columns and 500'd.

### Presentation (governed by TRAINING-UI-SPEC.md)

45. **One palette.** DONE — the global training theme was neon green while the
    dashboard was cyan; both fed the same `sp-*` classes.
46. **Numerals render in the intended face.** DONE — `font-family:'Orbitron'`
    never resolves under `next/font`.
47. **Page scrolls.** BROKEN — unresolved; needs live DOM inspection.
48. **375px layout.** GAP — unverified since the changes.

---

## Part C — Build order

Highest user-visible damage first.

1. **#47 scroll, #19 / #30 collapsed table.** The three defects that make the
   product feel broken on sight.
2. **#6 feedback rule, #4 timebank, #5 delay.** Pacing. Cheap, high impact.
3. **#27 % of pot, #25 score range, #28 per-mistake, #24 best-vs-correct.** The
   numbers users judge us on. Wrong numbers are worse than missing ones.
4. **#3 game mode, #7 hand selection, #9 speed.** Session shaping.
5. **#37 pop-out panel, #40 pot-type breakdown, #10 multi-table.** Depth.

**Rule for every item: change the status only after loading the screen.** Four
items above were marked shipped by an audit that never opened the page.

---

## Sources

- GTO Wizard — How To Use the Trainer: https://help.gtowizard.com/how-to-use-the-trainer/
- GTO Wizard — Measure Performance: https://help.gtowizard.com/measure-performance/
- GTO Wizard — Practice Mode Overview: https://help.gtowizard.com/practice-mode-overview/
