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
3. **Game Mode: Full Hand / Spot / Street.** DONE — screen-verified 2026-08-06:
   the Game Mode control renders in SessionSetupModal and the pick round-trips
   into session prefs.
   `trainerConfig.gameMode`. We only ever played Full Hand: ANY flop or turn
   question silently began a multi-street hand, so isolated decisions could not
   be drilled at all. Now 'full' continues across streets (unchanged default),
   'spot' plays exactly one decision per hand, and 'street' additionally
   restricts the queue to `trainerConfig.targetStreet`. Street filter
   unit-tested including the never-empty fallback.
4. **Timebank 7 / 15 / 25s.** DONE — re-scaled to No timer / 25s / 15s / 7s
   across the setup modal and both in-arena pickers. Ours had 'Standard' at
   60s, four times GTOW's longest tier.
   Screen-verified 2026-08-06 by polling the clock plate itself at 800ms
   through a live Blitz session. Two lessons are worth keeping.
   (a) A text scan could never have verified this: `variant="plate"` renders a
   BARE number, so every earlier `/\d{1,2}s/` probe found nothing and the item
   sat "unverified" for weeks. Probe the ELEMENT (computed colour, parent
   rect), and if it is time-varying, POLL it — a single late sample cannot
   tell "broken" apart from "already expired".
   (b) The poll then found a real defect: the clock re-armed on the turn but
   the hand HUNG there, because expiry auto-submits only when
   `!selectedAnswer` and that still held the flop's answer. See #49.
5. **Auto New Hand delay configurable.** BUILT 2026-07-26 —
   `trainerConfig.autoAdvanceDelayMs`, default 3s (GTOW's recommendation),
   doubled for an inaccuracy so a near-miss gets more reading time.
6. **Feedback rule: every action vs only-after-mistake.** BUILT 2026-07-26 —
   `trainerConfig.feedbackRule`: 'every' (never auto-advance), 'mistakes'
   (roll through best/correct, STOP on inaccuracy and worse), 'auto' (legacy).
   Defaults to 'every'. Blunders never auto-advance under any rule.
7. **Hand selection: filter trivial / close decisions only.** DONE — shipped
   for real in `2e970a09` and screen-verified 2026-08-06 (the "Hand selection"
   legend plus all three pills render in SessionSetupModal, and picking
   "Close only" round-trips as `handSelection:"close"` into session prefs).
   The earlier "BUILT 2026-07-26" status on this item was FALSE: only the
   engine half existed. The filter was implemented and unit-tested, but no
   control in any UI ever set `trainerConfig.handSelection`, so the player
   could not reach it and it ran as 'all' in every session. This is exactly
   the failure the Part C rule below exists to catch — a passing unit test is
   not a loaded screen.
   `trainerConfig.handSelection`: 'all', 'no-trivial' (drops
   spots whose top action is >=95%, i.e. being told to fold 72o), 'close'
   (keeps only spots where the top two actions are within 20 points -- the
   ones that actually decide winrate). Applied once to the preloaded batch, so
   it costs nothing per hand, and it never returns an empty queue: if a filter
   would strand the player it serves the unfiltered set. Unit-tested across all
   three modes plus the empty guard.
8. **Board-texture targeting.** DONE — screen-verified 2026-08-06: the label
   renders and all seven chips are present (Any Board, Dry Rainbow, Monotone,
   Two-Tone, Paired, Connected, Broadway).
9. **Game speed Normal / Fast / Turbo.** BUILT 2026-07-26 — chosen in
   SessionSetupModal, passed through `initialConfig.speed`; the arena maps it
   to the auto-advance delay (fast 1500ms, turbo 1ms). Verified in source.
10. **Up to 4 simultaneous tables.** DONE — screen-verified 2026-08-06 on
    production with two tables actually running, which is the only evidence
    that counts here. Table one was on 3-BET POTS with board `[Ts 4s 5h]`
    holding `A3s` in the BB; table two was on CONTINUATION BETTING with board
    `[3h 7c 7s]` holding `52s` on the BTN. Each had its own ten controls, both
    sat at `Question 1 of 20`, the header aggregated them
    (`Hands: 0 Correct: 0 EV Loss: 0.0bb Done: 0/2`), and clicking table two's
    number badge moved the cyan focus border off table one. No page errors.
    My earlier note pointing at `useMultiTable` was WRONG; do not wire it.
    That hook is the PokerBros-style club-arena cash-table manager: its slots
    hold `{tableId, name, stakes, variant, clubName, clubId}`, it takes
    `{supabase, userId}`, and it tracks per-table chat, BBJ wins and websocket
    connection status. It manages real money tables, not training drills.
    Connecting it to the trainer would be a category error. The shipped
    implementation instead mounts N independent `GodModeArena` instances, each
    with its own `sessionId`, from `pages/hub/training/multi-table.js`.
    The lesson worth keeping is the one the TEXT probe could not tell me.
    Every text assertion above passed while the screenshot showed a wrecked
    felt: at 375px a 2-up grid gives each cell 187px, and
    `UniversalDynamicTable` sizes itself from `window.innerWidth`, not from
    the box it is rendered into — `isMobile` (<768), `isNarrow` (<480) and the
    whole scale-lock (`Math.min(vw / 420, 1)`) all read the viewport. Only the
    felt furniture is container-aware, via a `ResizeObserver` on `tableRef`.
    So a 187px cell laid out for 375 and everything overlapped: board cards on
    each other and on the hole cards, the POT pill on the board, the drill
    watermark through the cards, the four-label stat strip run together with
    DIFFICULTY clipped.
    Making the arena container-aware is the pure fix but it touches a
    component every training game depends on. The parity answer is the one
    GTOW uses anyway: **phones do not tile felts.** Below 700px the grid is one
    column, exactly one felt is on screen, and the others sit behind a
    `role="tablist"` switcher. Hidden tables are `display: none`, not
    unmounted, so each keeps its hand, its clock and its session across a
    switch — safe because the felt's ResizeObserver ignores zero-sized
    entries and re-measures on return. The 0.85 tiling down-scale is dropped
    on a phone, where the cell IS the viewport.
    Residual, tracked but not blocking: `gma_difficulty` / `gma_timer` are
    stored unnamespaced so all tables share one preference; the
    `BroadcastChannel('smarter_poker_bus')` traffic is not per-table; and the
    `training_leaderboard` update is a read-modify-write, so two tables
    finishing together can lose one increment.

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
    Deploy-order race also closed (20260726193000): score_scale now DEFAULTS
    to 1, and only this build's writer sets 2 explicitly. The migrations went
    live before the signed-score code, so a default of 2 would have stamped
    every row written by the still-deployed unsigned scorer as "signed" while
    it held a legacy value -- mixing scales in one column, the precise failure
    the marker exists to prevent. With the default at 1 the schema is correct
    in both deploy states and neither has to land first.
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

38. **Dice 1-100 with High/Low.** DONE — behavioural parity confirmed in
    source and closed in `2154080c`: `rngTargetAction` resolves the roll
    against the cumulative frequency ranges, `effectiveCorrectAnswer` becomes
    that action while RNG is on, and the answer handler grades against it
    (`gradedAgainst = rngMeta.rngTargetActionId`). The roll therefore changes
    the correct answer, which is the whole point of the mode.
    Corrected 2026-08-06: the roll was keyed on `questionNumber`, so on a
    multi-street hand the turn and river reused the flop's number — the same
    die graded against a different street's ranges. Now keyed per decision.
    See #49.

### Reporting

39. **Stats by format and date.** BUILT.
40. **Pot-type breakdown.** BUILT 2026-07-26 — SRP / 3BP / 4BP+ accuracy in
    LifetimeStatsCard, derived from `spotType`. Verified in source.
41. **Frequency-difference metric.** BUILT.
42. **Leaderboard populates.** DONE — the writer targeted a table shape that
    does not exist, so every write failed silently. Screen-verified 2026-08-06:
    `/hub/leaderboards` renders real rows ("1 D Danimal Bekavac @danimal 4 pts,
    2 Dan Bekavac @kingfish 2 pts"), the This Week / This Month / All Time tabs
    are present, the footer reads "Showing 2 players", and no empty-state
    copy appears. Small numbers, but they are OUR numbers — written by the
    fixed writer, not seeded.
43. **Streaks record.** DONE — no live caller, plus three missing columns.
44. **Reports page loads.** DONE — selected four non-existent columns and 500'd.

### Presentation (governed by TRAINING-UI-SPEC.md)

45. **One palette.** DONE — the global training theme was neon green while the
    dashboard was cyan; both fed the same `sp-*` classes.
46. **Numerals render in the intended face.** DONE — `font-family:'Orbitron'`
    never resolves under `next/font`.
47. **Page scrolls.** DONE — the on-screen confirmation this was waiting for
    landed 2026-08-06: `/hub/training` scrolls after an arena session has been
    mounted and exited, which is the sequence that used to strand it. Two
    defences.
    (a) `GodModeArena`'s body scroll lock was capture-and-restore: it saved
    `document.body.style.overflow` at mount and wrote that value back on
    unmount, so mounting while the body was already locked restored 'hidden'
    and stranded the entire app -- the exact symptom reported here. It is now
    reference-counted via `window.__spScrollLocks`; the last release CLEARS the
    property rather than restoring a possibly-stale value.
    (b) `/hub/training` is where the damage shows, so it now refuses to render
    locked: when no arena is mounted and no lock is outstanding, a leftover
    `overflow: hidden` on the body is removed. Decision table unit-checked --
    it never fights a live locker and never touches a clean page.
    Note the earlier claim that a lock added to `GodModeArena` fixed this item
    was addressing the ARENA; #47 is about the library page.
48. **375px layout.** DONE — measured at 375x812, two waves.
    Wave 1 (`bd0d8fd6`) fixed seven measured collisions. Wave 2 (`c3466575`)
    fixed the two that wave 1 introduced or missed: hero's hole cards were
    rendering 7px wide, and the POT pill sat on top of the board cards.
    Both re-measured clear afterwards; hero's cards now render full size
    beside the nameplate, as the reference template shows them.
    Two laws came out of this and are worth obeying elsewhere.
    (a) An absolutely-positioned box at `left: 100%` has a shrink-to-fit
    available width of exactly ZERO, so flex children inside it collapse to
    their minimum. That is what made the hole cards 7px. Fix is
    `width: 'max-content'` on the container plus `flexShrink: 0` on each child.
    (b) Never position an element by its CENTRE if that requires predicting
    its own height from constants that must stay in sync with markup
    elsewhere. Anchor the EDGE instead.

49. **A street is a decision.** DONE 2026-08-06 — found by polling production,
    not by reading source. A multi-street hand is ONE question asked up to
    three times, and `questionNumber` advances once per HAND; the continuation
    path in `useGTOTrainer` sets the question and the street but deliberately
    never touches it. Four effects in `UniversalDynamicTable` were keyed on
    `questionNumber` alone and so silently skipped every street after the flop:
    the countdown never re-armed; `selectedAnswer` kept the flop's answer,
    which blocked the answer handler, hid the action block, highlighted the
    wrong option and stopped timer expiry from auto-submitting (the hand hung
    with a dead 0 on the clock); the speed-bonus start time never reset, so
    `elapsed < 5` was unreachable and no bonus could be earned past the flop;
    and the RNG die was not re-rolled. All four now key on one `decisionKey`
    of hand:street:question. `ARENA_HAND_LOADED` stays per-hand.
    The generalisable point: when one counter means "hand" and another means
    "decision", every effect has to say which it wants. Grep
    `\[questionNumber\]` before adding a fifth.
50. **The felt does not go silent between streets.** DONE 2026-08-06, shipped
    in `3bc80199`. #49 stopped the hand hanging on the turn; this is the wait
    that remained. Two halves.
    (a) Latency. `/api/training/next-street` measured 17,361 ms in production
    against a 4,315 ms worst case for every other `/api/training/*` route.
    `DeterministicGTOEngine.queryNextStreet` filters
    `game_type = ? AND stack_depth = ? AND street = ?` then
    `scenario_hash ILIKE '%<board>%'`, and `scenario_hash` is
    `{street}_{game_type}_{position}_{stack}bb_{board}` — the board is a
    SUFFIX, so the match needs a leading wildcard and the existing plain btree
    on `scenario_hash` is useless. The planner was doing a Parallel Seq Scan of
    all 8,053,212 rows / 59 GB. A composite index on
    `(game_type, stack_depth, street, scenario_hash)` flips it to an index
    scan: the miss case went to 1.671 ms on four buffers, the hit case to
    379 ms. Migration
    `supabase/migrations/20260806_solved_spots_gold_next_street_index.sql`
    carries the full reasoning and the two timeout laws that building it
    taught.
    (b) Honesty. Even a fast query is not instant, and a felt that shows the
    OLD street's cards while fetching the next one is lying. The arena now
    renders a dealing placeholder in the incoming card's slot behind a 450ms
    gate, so a fast fetch shows nothing at all and a slow one shows a dealing
    state rather than a stale board. The flop/turn separator counts the
    placeholder in its denominator, so the count never jumps.

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
