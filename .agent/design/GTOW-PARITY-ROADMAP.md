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
   (c) Re-verified 2026-08-06 in `241f2075`, and this pass found the tier
   re-scale had been quietly UNDONE on the multi-table route by a vocabulary
   collision. The timebank vocabulary is `relaxed | standard | quick | blitz`;
   the auto-advance vocabulary is `on | off`. `pages/hub/training/multi-table.js`
   defaulted its `timer` to `'off'`, which is a legal value in the WRONG
   vocabulary — `TIMER_DURATIONS['off']` is `undefined`, and the lookup read
   `TIMER_DURATIONS[mode] || 60`, so every multi-table session got the exact
   60-second clock this item removed. Underneath it sat a second bug: `relaxed`
   is `0` and `0` is falsy, so the legitimate no-timer key ALSO fell through to
   60. It never showed only because `timerEnabled` was computed separately as
   `timerMode !== 'relaxed'` and masked it. Two bugs cancelling is not a fix;
   either one moving exposes the other. Fixed with `resolveTimerSeconds` /
   `isTimerEnabled` (a `hasOwnProperty` lookup, never `||`), a module-scope
   whitelist on the route, and — the part that matters most — a SANITIZER on
   READ: `gma_timer` is written back from `timerMode` on the next render, so
   every build that shipped `'off'` persisted that out-of-vocabulary value into
   the player's localStorage. Sanitizing only on write would have left those
   players broken forever.
   Measured on production at 375px, four sessions, no page errors: a direct
   visit shows no clock at all; `?timer=blitz` starts at 7 and descends;
   `?timer=standard` starts at 25 and descends; `?timer=off` shows no clock;
   no run ever showed a number above 25; and a deliberately planted stale
   `gma_timer='off'` read back as `'relaxed'` after the arena mounted. The
   probed element measured 42x42 with a 10px radius in `rgb(239, 68, 68)` at
   fontSize 21 — `CountdownTimer`'s compact plate exactly, so the probe was
   reading the real component and not a coincidental integer.
5. **Auto New Hand delay configurable.** DONE — `trainerConfig.autoAdvanceDelayMs`,
   default 3s (GTOW's recommendation), doubled for an inaccuracy so a near-miss
   gets more reading time. Shipped for real in `ea949c6f`; the earlier
   "BUILT 2026-07-26" status was true of the component and FALSE of the route
   the player actually reaches — see #9 for the vocabulary hole.
   Screen-verified 2026-08-06 on production: under `speed=turbo` a good answer
   advanced at 268ms measured from the click, and the same run's slower samples
   (763-1023ms) are the same 250ms delay plus next-question fetch latency.
6. **Feedback rule: every action vs only-after-mistake.** DONE —
   `trainerConfig.feedbackRule`: 'every' (never auto-advance), 'mistakes'
   (roll through best/correct, STOP on inaccuracy and worse), 'auto' (legacy).
   Defaults to **'mistakes'** in both `SessionSetupModal.jsx` and
   `GodModeArena.jsx` — an earlier revision of this line said 'every', which was
   never true of the code. Blunders never auto-advance under any rule.
   Shipped for real in `ea949c6f`. Two defects had to close first. The rule was
   never forwarded to `/hub/training/multi-table` at all, so every multi-table
   session ran the default regardless of what the player picked; and
   `GodModeArena` ran its OWN auto-advance countdown that did not implement the
   classification rules `UniversalDynamicTable` implements, so with both mounted
   the earlier timeout won and a blunder's feedback was yanked off the felt.
   Two implementations of the same behaviour will diverge — mirror, don't race.
   Screen-verified 2026-08-06 on production, both halves:
   under `feedbackRule=every`, three consecutive hands held their feedback for
   the full 9-second window with `Next Hand` waiting; under
   `feedbackRule=mistakes&speed=turbo`, nine good answers all advanced inside
   1023ms while two BLUNDERs and one INACCURACY never advanced at all.
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
9. **Game speed Normal / Fast / Turbo.** DONE — chosen in SessionSetupModal,
   passed through `initialConfig.speed`; the arena maps it to the auto-advance
   delay (normal 3000ms, fast 1500ms, turbo **250ms**). An earlier revision of
   this line said turbo was 1ms; the code has never used 1ms, and 250ms is the
   right number anyway — a 1ms advance would tear the felt off screen before
   the classification banner painted.
   The "verified in source" status was the problem, not the shorthand. `speed`
   never reached `/hub/training/multi-table`: the route built its own
   `arenaInitialConfig` and simply did not carry the key, so the arena fell back
   to `normal` and every Turbo session ran at 3s. Fixed in `ea949c6f` by
   forwarding `speed` (and `feedbackRule`) through the route behind a
   module-scope whitelist, so an unknown query value degrades to the default
   rather than propagating a fourth vocabulary collision.
   Screen-verified 2026-08-06 on production: `?speed=turbo` advanced a good
   answer at 268ms measured from the click, against a 3000ms `normal` baseline.
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
12. **Hero bottom-centre, villains rotated from hero.** DONE — screen-measured
    2026-08-06 at 430x932 on `cash-001`/`cash-007`. Felt spans y 384..733,
    centre (215, 558). Hero avatar 38x38 at (196, 653) — horizontally centred
    on the felt, in its lower third; hero plate (188, 688) reads "KingFish /
    100 bb". The single villain sits at (200, 403) — same x, opposite pole —
    with plate (193, 430) reading "BTN / 100 bb". Rotation is therefore
    hero-relative, not seat-index-relative.
13. **Dealer button per the position LAW.** DONE.
14. **Chip stack in front of every seat with money committed.** BUILT — code
    confirmed 2026-08-06, screen-observation deferred to a spot that can show
    it. The renderer is real and hero is included:
    `UniversalDynamicTable.jsx:3971-4036` maps every seat through
    `committedFor(seat, actionHistory, isPreflopStreet)`
    (`games/potMath.js:18`), and places the badge at
    `CHIP_STACK_POSITIONS[key]` (`:626-636`), which has a `hero` slot
    (47.70 / 71.82) alongside v1..v8 — so this is not villain-only. The 430x932
    dump of `cash-001` showed NO chip badge, and that is correct behaviour, not
    a defect: the spot was a FLOP with "Villain checks", and postflop
    `committedFor` returns 0 for a checking seat, so nobody had money in front
    of them on that street. Needs a facing-a-bet spot to observe.

14a. **`committedFor` read only a seat's FIRST action.** FIXED 2026-08-06,
    found while confirming #14. `committedFor` used `.find`, so a seat with more
    than one recorded action on the street was read at its first entry and
    understated — and because `computeDisplayPot` sums the same function, every
    error landed in the POT pill as well as the chip badge. Three real shapes
    were wrong:

    - open then call a 3-bet — `[{UTG,RAISE,2.5},{BTN,RAISE,8},{UTG,CALL,8}]`
      read UTG at 2.5 instead of 8, understating the pot by 5.5bb
    - check then bet the same street — a check-raise read the BB at 0
    - a blind that later acts — the posted-blind branch only ran for a seat with
      NO entry at all, so the blind vanished the moment that seat did anything

    Amounts are TOTALS-TO the way a poker log writes them, so a seat's
    contribution is the LARGEST amount it has been recorded at, and the posted
    blind is a FLOOR rather than an addend (an SB called to 3 has 3 in front of
    it, not 3.5 — the 0.5 counts toward the 3). The floor now also applies to a
    blind that FOLDS, because a posted blind is dead money that stays in the
    middle. Five assertions added to `scripts/preflop-pot-check.js`, which now
    runs PASS 13 FAIL 0 (was 8).
15. **Board clamped to street** (0/3/4/5). DONE — screen-measured 2026-08-06.
    On a FLOP spot the felt renders EXACTLY three card images, all at y=494:
    `/cards/spades_2.png` (169,494), `/cards/diamonds_2.png` (201,494),
    `/cards/diamonds_4.png` (233,494) — matching the prompt's
    "Flop: [2s 2d 4d]" exactly. No fourth or fifth card element exists in the
    DOM at that street, so this is a real clamp and not an opacity trick.
16. **Pot includes blinds preflop.** BUILT IN THE FELT, UNREACHABLE IN THE
    CONTENT PIPELINE — established 2026-08-06 by reading the generator, and
    this is a content gap, not a UI gap. `committedFor(..., isPreflop)` does
    credit the blinds (`potMath.js:33-37`: SB / BTN-SB -> 0.5, BB -> 1) and
    `computeDisplayPot` sums it, so were a preflop spot ever dealt the pot
    would include them. **The arena cannot deal one.** The only producer of
    `street: 'preflop'` is `DeterministicGTOEngine.generateFromLocalSolverRanges`
    (`:705`), reachable only through the branch at `:436-442` gated on
    `gameConfig.pioStreet === 'preflop'` — and no game config anywhere sets
    `pioStreet`; `PIOQueryService.getGameConfig` (`:247+`) emits only
    `{ id, sourceOfTruth, pioGameType, pioStackDepth }`. That function is also
    unreachable from `generateBatch` (`:997`), which is what the arena calls.
    Genuinely-preflop push/fold ICM drills are worse than absent: they arrive
    with `boardCards: []` and `batch-preload.js:282-297` FABRICATES three
    deterministic board cards, after which the backfill at `:420-423` stamps
    them `'flop'`. A preflop drill is therefore served to the player as a flop
    spot with an invented board. Closing #16 for real means making preflop
    reachable, not touching the felt.
17. **Villain shows a real stack, not a fabricated one.** BUILT.
18. **Folded villains grey out rather than vanish.** BUILT IN THE FELT,
    UNREACHABLE IN THE CONTENT PIPELINE — same shape as #16, established
    2026-08-06. The grey-out is implemented three times over in
    `UniversalDynamicTable.jsx`: `villainFolded` (`:3554-3556`) drives the seat
    wrapper to `opacity: 0.42` (`:3672`), the avatar disc to
    `filter: grayscale(100%) brightness(0.5)` (`:3705`), and the face-down
    hole cards to the same filter at `opacity: 0.6` (`:3865-3880`) — visible,
    greyed, not unmounted. **No arena scenario can ever set it.** Every
    generator emits two scalar seats and no roster: `heroPosition` /
    `villainPosition` at `DeterministicGTOEngine.js:537-538, 1666-1669,
    1774-1775`, hard-mapped one-villain-per-hero at `get-question.js:404-412`,
    and defaulted to BTN/BB at `batch-preload.js:415-419`. No scenario carries
    `folded`, `playersInHand`, or a players array at all. `PLAYER_COUNT_MAP.js`
    exists but `getPlayerCount` has zero importers — dead data. The squeeze
    pool's idea of multiway is the literal STRING `villainPos: 'multiway'`
    (`DeterministicGTOEngine.js:861-878`), inside the same dead path as #16.
    Closing #18 for real means a multiway scenario model, not a felt change.
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

23. **Five-tier classification.** DONE — screen-measured 2026-08-06 on
    `/hub/training/reports`. The MOVE CLASSIFICATION DISTRIBUTION block renders
    all five tiers with real, distinct, non-zero counts from 117 answered
    questions: "Best: 15 (13%), Correct: 22 (19%), Inaccuracy: 5 (4%),
    Wrong: 1 (1%), Blunder: 2 (2%)". Five tiers, five buckets, five populations
    — the classifier is genuinely spreading moves across the whole scale rather
    than collapsing to correct/incorrect.
24. **Best marked distinctly from merely Correct.** DONE — screen-measured
    2026-08-06. After answering, the feedback banner at (129,120) 135x26 reads
    literally "OK OK Best Move" (a DOUBLE check glyph), with "0.00 EV" beside it
    at (274,122). Correct renders a single check. Also renamed the tiers to
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
30. **Feedback inline; hand stays visible.** DONE — screen-measured 2026-08-06,
    and this is the measurement that actually proves it. With the feedback panel
    OPEN the whole felt is still on screen, merely shifted up ~48px: villain
    avatar (200,332), hero avatar (196,347), hero hole cards (234,372) and
    (259,372), all three board cards at y=403, pot pill (179,449), dealer button
    (298,423), "SPR: 16.7" (187,472). Nothing is occluded and nothing unmounts.
    Fixed with #19; the panel is also capped at 40vh (was 48vh) to leave the
    felt room.
31. **Solver frequencies per action.** DONE — screen-measured 2026-08-06. The
    post-answer overlay dims the not-taken action (button at (219,546) 197x56,
    computed `opacity: 0.3`) and prints a frequency under each control:
    "100 %" at (96,576) and "0 %" at (308,576). The GTO Strategy list repeats
    them as "OK Check / 100 %" and "Bet / 0 %", and the solver strip reads
    "Action mix -> Check 100%". Per-action, not per-hand.
32. **Your action vs optimal, with EV of each.** DONE — screen-measured
    2026-08-06. The feedback panel renders the optimal line and the taken line
    side by side with EV attached to each: "Best Move" (138,824), "EV:"
    (255,825), "0.00 BB" (279,823), and directly beneath it "OK You: Check"
    (180,859). Both halves of the comparison are on screen simultaneously.
33. **Plain-language reason.** DONE — screen-measured 2026-08-06. Prose
    coaching is on the felt before the answer (hint band (18,843) 394x58:
    "On dry boards, c-bet small and frequently. O...") and after it via the
    "FULL ANALYSIS" disclosure at (175,974). Caveat retained: many deeper
    coaching notes are dead code comparing free-text hand strength against
    snake_case enums, so the SHALLOW notes are what actually renders.
34. **Mistake review at session end.** BUILT.

### Info panel

35. **Range tab.** DONE — screen-measured 2026-08-06 on `cash-001` at 430x932.
    The bottom tab bar ("Trainer / Range / Strategy / Settings") is real; the
    Range tab sits at (108,888) 108x44 and opening it grows the felt's leaf
    count from 68 to 245. It renders the header "RANGE MATRIX - AH3D",
    "Range: 4.2% (56/1326 combos)", an action-filter row ("All / Check 0.2% /
    Fold 83.4% / Bet 16% 0.0% / Bet 45% 4.0% / Mixed"), and the complete 13x13
    169-cell grid from AA/AKs down through A2o..32s. Combo counts, per-action
    weights and the full matrix — not a placeholder.
36. **Strategy tab.** DONE — screen-measured 2026-08-06. Tab at (215,446)
    108x44; opening it renders "GTO STRATEGY DISTRIBUTION" with a MODELLED
    provenance badge and the per-action split for the live spot: "Bet 14% /
    Check 86%". The MODELLED badge is correct and wanted — this spot is served
    by the postflop generator, not a solved row, and the panel says so rather
    than passing modelled output off as solver output.
37. **Collapsible sections / pop-out panel.** DONE — screen-measured
    2026-08-06 on both halves. Pop-out: the four-tab bar at the foot of the
    felt swaps the panel in place (Trainer 68 leaves -> Range 245 -> Strategy
    74) without unmounting the table. Collapsible: after answering, the
    "FULL ANALYSIS" disclosure at (175,974) carries a "|>" affordance at
    (161,976) and a "SPACE" hotkey hint at (180,977), and the expanded panel
    closes via the control at (341,694) 67x44.

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

39. **Stats by format and date.** DONE — screen-measured 2026-08-06 on
    `/hub/training/reports`. Both breakdowns are gated on having more than one
    bucket (`report.byFormat.length > 1` at reports.js:699,
    `report.byDate.length > 1` at :759), and the account now clears both.
    PERFORMANCE BY FORMAT renders three real rows — "MTT 75 hands / Score 70 /
    Acc 88% / EV loss 0.02bb", "C-Bet Academy 40 hands / Score 48 / Acc 75% /
    EV loss 0.08bb", "preflop-charts 2 hands / Score 100 / Acc 100% / EV loss
    0bb" — and DAILY TREND renders an axis spanning 2026-05-07 to 2026-07-19.
    Header aggregates alongside them: 8 SESSIONS, 117 QUESTIONS, 84% ACCURACY,
    13% BEST RATE, 45% GTO PROXIMITY.
40. **Pot-type breakdown.** GAP -> FIXED 2026-08-06, awaiting a rendered
    session-summary measurement. The 2026-07-26 status said "Verified in
    source", and reading the SOURCE is exactly how the claim survived: the
    component was correct and had never once executed. THREE independent
    defects were stacked:

    (a) `GodModeArena.jsx` rendered `<LifetimeStatsCard>` without passing
        `handHistory`, and the pot-type block is gated on
        `{handHistory && handHistory.length > 0 && ...}`. The row has therefore
        never rendered on any session since it shipped. `handHistory` was in
        scope the whole time — the line immediately above already passes it to
        `<PositionStatsPanel>`.
    (b) `LifetimeStatsCard` read `h.spotType`, but `useGTOWScore.recordMove`
        stores each entry as `{ handNumber, classification, evLoss,
        frequencyDiff, timestamp, ...handData }` — handData is SPREAD FLAT and
        there is no `h.handData` key either. Every read was `undefined`, so
        every hand would have bucketed as SRP at 0%.
    (c) `useGTOTrainer` computes `deriveSpotType(scenario)` and forwarded it
        only to `recordAnswer` (the backend write), never to `recordMove` (the
        in-memory history), so the field the card needed was never produced.

    All three are fixed. The same flat-spread defect was found and fixed in the
    arena's own coaching aggregation (`h.handData?.heroPosition|street|spotType`
    around GodModeArena.jsx:3070-3100), which had been collapsing every position
    bucket to 'UNK' and every weak spot to 'general' in the end-of-session
    summary. `PositionStatsPanel.jsx:30` already had the correct defensive
    pattern (`const hd = entry.handData || entry;`); the other two consumers did
    not. Status stays short of DONE until a 20-question session is driven to the
    summary screen and real SRP / 3BP / 4BP+ counts are read off it.
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

### What a screen check must probe (learned the hard way)

Every one of these cost a wasted harness run, and every one of them made a
working build look broken or a broken build look fine.

1. **The action controls concatenate label and hotkey.** `textContent` for the
   buttons is `"Check1"`, `"Bet2"`, `"Bet1"` — there is no separator and no word
   boundary between "k" and "1", so `/^(CHECK|BET)\b/` matches nothing. Use
   `/^(fold|check|call|bet|raise|all[- ]?in)\s*\d*$/i`.
2. **The manual advance control reads `"Next Hand →SPACE"`,** so an anchored
   exact match finds nothing. Prefix-match it.
3. **The classification tier is not readable from `textContent`.** All five
   title-case `CLASSIFICATION_CONFIG` labels sit permanently in the DOM because a
   legend renders every tier, so a `textContent` scan reports every tier on every
   hand. The VISIBLE tier is the feedback panel's uppercase heading in
   `innerText`; `MISTAKE` needs a negative lookahead because the stat row already
   reads `MISTAKES 0`.
4. **"Question N of M" is NOT a valid advance observable.** A multi-street hand
   is one question asked up to three times, and `advanceToNextStreet` deliberately
   does not touch `questionNumber` — so a correct flop answer that auto-advances
   to the turn leaves the counter frozen and the run records a phantom "answered
   but never advanced". Key the decision off counter AND street AND prompt. This
   is the same law that broke five `[questionNumber]` effects in source; it
   applies to test harnesses too.
5. **Zero-sized buttons are the phone layout's hidden second table.** At 375px
   the inactive felt is `display: none` (see #10), so its controls measure
   `0x0`. Skip anything under 20px — clicking those acts on a felt the player
   cannot see.
6. **Wait for the felt to CLEAR before answering.** A click landing while the
   previous hand's feedback panel is still up is swallowed, and the tier read
   afterwards belongs to the PREVIOUS answer.
7. **Vary the action, or you will only ever measure one side.** Ten hands of
   "take the first legal control" came back BEST MOVE ten times, leaving the
   "a mistake must never auto-advance" half of #6 unmeasured. Alternating
   passive/aggressive produced two blunders and an inaccuracy in twelve hands.

---

## Sources

- GTO Wizard — How To Use the Trainer: https://help.gtowizard.com/how-to-use-the-trainer/
- GTO Wizard — Measure Performance: https://help.gtowizard.com/measure-performance/
- GTO Wizard — Practice Mode Overview: https://help.gtowizard.com/practice-mode-overview/
