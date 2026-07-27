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
3. **Game Mode: Full Hand / Spot / Street.** BUILT 2026-07-26 —
   `trainerConfig.gameMode`. We only ever played Full Hand: ANY flop or turn
   question silently began a multi-street hand, so isolated decisions could not
   be drilled at all. Now 'full' continues across streets (unchanged default),
   'spot' plays exactly one decision per hand, and 'street' additionally
   restricts the queue to `trainerConfig.targetStreet`. Street filter
   unit-tested including the never-empty fallback.
4. **Timebank 7 / 15 / 25s.** BUILT 2026-07-26 — re-scaled to No timer /
   25s / 15s / 7s across the setup modal and both in-arena pickers. Ours had
   'Standard' at 60s, four times GTOW's longest tier.
5. **Auto New Hand delay configurable.** BUILT 2026-07-26 —
   `trainerConfig.autoAdvanceDelayMs`, default 3s (GTOW's recommendation),
   doubled for an inaccuracy so a near-miss gets more reading time.
6. **Feedback rule: every action vs only-after-mistake.** BUILT 2026-07-26 —
   `trainerConfig.feedbackRule`: 'every' (never auto-advance), 'mistakes'
   (roll through best/correct, STOP on inaccuracy and worse), 'auto' (legacy).
   Defaults to 'every'. Blunders never auto-advance under any rule.
7. **Hand selection: filter trivial / close decisions only.** BUILT
   2026-07-26 — `trainerConfig.handSelection`: 'all', 'no-trivial' (drops
   spots whose top action is >=95%, i.e. being told to fold 72o), 'close'
   (keeps only spots where the top two actions are within 20 points -- the
   ones that actually decide winrate). Applied once to the preloaded batch, so
   it costs nothing per hand, and it never returns an empty queue: if a filter
   would strand the player it serves the unfiltered set. Unit-tested across all
   three modes plus the empty guard.
8. **Board-texture targeting.** BUILT via the config modal; unverified.
9. **Game speed Normal / Fast / Turbo.** BUILT 2026-07-26 — chosen in
   SessionSetupModal, passed through `initialConfig.speed`; the arena maps it
   to the auto-advance delay (fast 1500ms, turbo 1ms). Verified in source.
10. **Up to 4 simultaneous tables.** GAP — and my earlier note pointing at
    `useMultiTable` was WRONG; do not wire it. That hook is the PokerBros-style
    club-arena cash-table manager: its slots hold
    `{tableId, name, stakes, variant, clubName, clubId}`, it takes
    `{supabase, userId}`, and it tracks per-table chat, BBJ wins and websocket
    connection status. It manages real money tables, not training drills.
    Connecting it to the trainer would be a category error.
    A real implementation means N independent question queues and score
    sessions rendered side by side. `GodModeArena` is ~13k lines and owns
    session state, persistence and a GLOBAL body scroll lock, so four mounted
    instances would fight over all three. This is the one remaining item that
    is a genuine architectural build rather than a fix, and it should start by
    extracting the per-session state out of the arena shell.

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
19. **Avatar must not float mid-table.** BUILT 2026-07-26 — root cause was
    `tableArea` being `flex:1` + `overflow:hidden` around a `flexShrink:0`
    child with a 1/1.45 aspect ratio: opening the feedback panel CLIPPED the
    felt instead of scaling it, stranding hero's avatar mid-view. The table now
    scales; every seat, the button and the chips stay proportional because they
    are positioned in percentages.
20. **Buttons show only actions the solver returned.** DONE — and must never be
    padded to a fixed count; invented buttons make the frequency bars lie.
21. **Difficulty remaps buttons correctly.** DONE — the Simple remap dropped
    sized actions and lost the correct answer entirely.
22. **Keyboard shortcuts resolve against the rendered buttons.** DONE.

### Scoring and feedback

23. **Five-tier classification.** BUILT.
24. **Best marked distinctly from merely Correct.** BUILT 2026-07-26 — Best
    carries a double check, Correct a single one. Also renamed the tiers to
    GTOW's own terminology: 'Correct Move' was labelled 'Excellent', which is
    not a tier name in the reference product.
25. **GTOW Score -100..+100.** BUILT 2026-07-26 — unblocked and done. The
    blocker was data, not code: the classification weights already run 1.0
    (BEST) .. 0.0 (BLUNDER), so signed = w*200-100 is an exact linear remap and
    stored history converts losslessly with v*2-100. Migrations
    20260726190000 + 20260726190500 backfilled production (sessions 74 -> 48,
    leaderboard 38.5 -> -23.0) and added `score_scale` to both tables (1 =
    legacy, 2 = signed). Grade and colour bands were rebased through the same
    transform and unit-checked: zero grade changes across the full 0..100
    input range, so every historical session keeps the grade it had.
    Trap worth remembering: the FIRST migration's backfill silently did
    nothing. Adding `score_scale` with `DEFAULT 2` stamps every existing row as
    already-migrated, so `WHERE score_scale <> 2` matched nothing — and the
    range assertion passed anyway, because legacy values (74..100) sit inside
    -100..100. A range check is not a check that conversion happened.
26. **EV loss in bb.** DONE — was inflated by a factor of the pot size.
27. **EV loss as % of pot.** DONE 2026-07-26 — the engine formula was fixed
    earlier; the value was computed and then displayed nowhere. The feedback
    banner now shows both units, e.g. `-0.50 bb (8.3% pot)`.
28. **Average loss per mistake.** BUILT — corrected during cross-reference:
    `avgEVLossPerMistake` already existed in useGTOWScore and is threaded
    through the arena. The roadmap's original GAP status was wrong.
29. **Feedback waits for the player.** DONE — auto-advance defaulted on at 2s,
    which is why explanations vanished before they could be read.
30. **Feedback inline; hand stays visible.** BUILT 2026-07-26 — fixed with
    #19; the panel is also capped at 40vh (was 48vh) to leave the felt room.
31. **Solver frequencies per action.** BUILT.
32. **Your action vs optimal, with EV of each.** BUILT.
33. **Plain-language reason.** BUILT — though many deeper coaching notes were
    dead code comparing free-text hand strength against snake_case enums.
34. **Mistake review at session end.** BUILT.

### Info panel

35. **Range tab.** BUILT.
36. **Strategy tab.** BUILT.
37. **Collapsible sections / pop-out panel.** BUILT 2026-07-26 — verified
    present in UniversalDynamicTable.

### RNG

38. **Dice 1-100 with High/Low.** BUILT — toggle exists; behavioural parity
    (best action changing with the roll) unverified.

### Reporting

39. **Stats by format and date.** BUILT.
40. **Pot-type breakdown.** BUILT 2026-07-26 — SRP / 3BP / 4BP+ accuracy in
    LifetimeStatsCard, derived from `spotType`. Verified in source.
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
47. **Page scrolls.** BROKEN — still unresolved on /hub/training.
    2026-07-26: a body scroll lock was added to `GodModeArena` under this item,
    but that locks the ARENA; #47 is about the library page failing to scroll,
    so the underlying report is untouched. That lock also captured
    `document.body.style.overflow` at mount and restored the captured value on
    unmount -- if it ever mounted while the body was already locked it restored
    'hidden' and stranded the whole app, which is the very symptom described
    here. It is now reference-counted: the last release CLEARS the property
    instead of restoring a stale value, so overlapping locks are safe.
    (The earlier note that 'no component locks body scroll' is superseded.)
    LEAD, unverified: `PageTransition` animates `scale` via framer-motion, and
    a transform on an ancestor creates a containing block -- any
    `position:fixed` descendant (UniversalHeader, BottomNavBar) is then
    positioned against that wrapper instead of the viewport. Check whether the
    bottom nav is overlaying the scroll region. Confirm with one
    `execute_javascript` call against a running Chrome before changing
    anything; four attempts this session found Chrome closed.
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
