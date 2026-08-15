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

## Reconciliation — 2026-08-08

**Tally: 50/50 numbered items DONE (plus sub-items 14a, 28a FIXED). 0 BUILT ·
0 GAP · 0 BROKEN.** The "15 DONE / 30 BUILT / 2 GAP" tally still circulating in
handoffs describes a pre-2026-08-06 revision of this file and must not be
planned against; every item was promoted on measured evidence in the commits
between `78034a5131` and `2532cecce2`. Two stale claims have now wasted agent
time twice and are dead: streaks (#43) were wired 2026-07-26
(`pages/api/training/streak.js` writes `training_streaks`; callers in
`pages/hub/training/streaks.js` and `src/config/diamondRewards.js`), and the
training_answers metadata migration landed long ago.

Every item was re-verified against the code on 2026-08-08 (grep for the
load-bearing symbol, not memory). Spot evidence, one pointer per cluster:

- #1-2 `GodModeArena.jsx:initialConfig` honoured, no re-prompt
- #3 `useGTOTrainer.js:gameMode` / `targetStreet`
- #4 `SessionSetupModal.jsx` timebank tiers (No timer / 25 / 15 / 7)
- #5, #9 `GodModeArena.jsx:autoAdvanceDelayMs` + `speed` mapping
- #6 `SessionSetupModal.jsx` + `GodModeArena.jsx`: `feedbackRule`
- #7 `SessionSetupModal.jsx` + `useGTOTrainer.js`: `handSelection`
- #10 `pages/hub/training/multi-table.js`: N `GodModeArena` mounts,
  single-column + tablist switcher below 700px
- #11 `games/UniversalDynamicTable.jsx:questionText` rendered
- #14/14a/#16 `games/potMath.js:committedFor` / `postedBlind`;
  `src/lib/training/declaredStreet.js`
- #25, #28 `useGTOWScore.js:score_scale`, `avgEVLossPerMistake`
- #27 `UniversalDynamicTable.jsx:1227` renders `(N% pot)` beside bb
- #34 `GodModeArena.jsx:#hand-replay-section`
- #38, #49 `UniversalDynamicTable.jsx:rngTargetAction`, `decisionKey`
- #40 `GodModeArena.jsx:11129` passes `handHistory` to `LifetimeStatsCard`;
  `useGTOTrainer.js:deriveSpotType`
- #42 `pages/api/training/leaderboard.js` + `useGTOWScore.js`:
  `training_leaderboard`
- #47 `src/lib/scrollLock.js` reference-counted lock
- #50 `supabase/migrations/20260806_solved_spots_gold_next_street_index.sql`

**Genuinely still open**, all documented inside their DONE entries and none of
them blocking the item's own pass condition — do not re-open the items, work
these directly:

- #14 postflop chip badge is a CONTENT gap: no `solved_spots_gold` row ends in
  a facing-bet node, so `_villainBetBB` correctly returns 0 postflop. Phase A
  solver work, not felt work.
- #18 cosmetic: `cash_6max` squeeze spots render on the 9-max ring
  (`UniversalDynamicTable.jsx:playerCount` matches neither '6max' nor 'cash');
  switching rings drops HJ and re-introduces the `c2c5cad682` seat bug, so it
  needs a seat-map change, not a one-word fix.
- #33 caveat: deeper coaching notes compare free-text hand strength against
  snake_case enums and are dead; only the shallow notes render.
- #10 residuals: `gma_difficulty`/`gma_timer` unnamespaced across tables; the
  `BroadcastChannel` bus is not per-table; `training_leaderboard` update is a
  read-modify-write and two tables finishing together can lose an increment.

---

## Reconciliation — 2026-08-15 (audit pass 2)

**The 50/50 tally above was measured honestly and was still hiding real
defects.** Every item's own pass condition held; what a per-item check cannot
see is a defect that lives BETWEEN two items, or one whose symptom is a
plausible-looking default. Five audits run in parallel over the trainer found
seventeen live defects, none of which any existing gate caught. The two worst
made hands unwinnable and wrote fabricated rows to the database.

Recorded here rather than by re-opening items, because none of them falsifies
an item's pass condition — they falsify the assumption that a passing item
means a working feature.

### 1. The flat-spread law now has a home: `src/lib/training/handHistoryEntry.js`

`useGTOWScore.recordMove` pushes `{handNumber, classification, evLoss, ...handData}`
— handData is SPREAD FLAT and there is no `entry.handData` key. Reading
`h.handData.x` returns undefined and renders the default behind the `||`. This
had already been found twice (#40) and was fixed at those two sites only. It
was live at **seven more**:

- `utils/saveSession.js:65` — every session ever saved wrote a single `UNK`
  bucket into `training_sessions.position_stats`, and `/api/training/gto-reports`
  and `/api/training/coaching-summary` derive "strongest position", "weakest
  position" and the recommended drill from that column. Historic rows are not
  recoverable.
- `GodModeArena.jsx` Action Diversity — every hand bucketed to `'unknown'`, so
  `maxActionCount === totalHands` and the score was **hard-wired to 0%**. Every
  player of every session was told "Too predictable — mix in more actions" on
  the default review tab.
- `AccuracyByPositionChart`, `WeaknessHeatmap`, per-street EV loss, and the
  Weakest Spot callout — all four collapsed to `UNK` / `flop`. The per-street
  chart is the instructive one: defaulting a missing street to `'flop'`
  attributed **every preflop mistake to the flop bar** and produced a chart
  that looked entirely reasonable.
- `FrequencyTrainer.jsx:339` read `userAction`/`selectedAnswer`; the field is
  `action`. Its filter dropped every hand, so the Frequency Adherence panel has
  shown "need at least 3 mixed-strategy hands" after a 50-hand session for its
  entire life.
- `GhostReplayEngine.jsx:57` — `currentHand?.handData || {}` with no flat
  fallback, so Ghost Replay opened with no cards, no board, `Pot: ? BB`,
  `HERO (UNK)`.
- `saveSession.js:83` + `save-session.js:47` — the D1 payload-compaction fix
  was a **provable no-op on both sides**: it stripped the two 169-hand solver
  matrices off `h.handData`, and `if (!hd) return h;` was taken on every entry.
  Payloads have been full-size the whole time, which puts long sessions back
  in reach of the 2MB guard → silent 413 → session never saved. The comment
  measuring "compacted histories ~400KB" was measuring uncompacted data.

All seven now go through one module. **Rule for reviewers: a `.handData`
property access anywhere outside `handHistoryEntry.js` is a bug.**

### 2. Two remappers ran on every question, and they disagreed (#20, #21)

`useGTOTrainer.applyDifficultyToQuestion` collapses the action set, then
`UniversalDynamicTable` ran `actionGrouper` over that OUTPUT. The hook emits
`fold`/`check`/`bet`; the grouper knew only `f`/`x`/`b33`. Unrecognised ids fell
to an `other` bucket that the emitter did not emit.

- **A spot whose solver-best was Check or Fold had no button for it.** Measured:
  `f40/c45/r75` rendered `Call` and `Bet / Raise` only, answer key on `fold`.
  The hook's own "serve unsimplified rather than unwinnable" fail-safe cannot
  help — the damage happens after it returns.
- Printed frequencies summed to 40–70%, not 100.
- **GROUPED mode never produced its four sizing buckets.** The four-bucket logic
  existed and was correct, but the hook had already rewritten `b75` to the bare
  token `bet`, and `parseSizingPercent('bet')` is null. An `x/b33/b75/b125` node
  rendered `Check | Bet` — the middle difficulty tier was SIMPLE mode wearing a
  different name.
- `b101`–`b150` — bets larger than the pot — were labelled "Large Bet".
- `c` (call) was categorised as `'check'`, putting a **Check button on the felt
  facing a bet**.
- `TrainerConfigModal`'s card promising "Exact Sizings, up to 9 buttons" emitted
  `id: 'standard'`, which `toEngineDifficulty` maps to GROUPED — and it was the
  screen's default, so exact sizings were unreachable from it. Now `'exact'`.
- `resolveGroupedAction` returned the highest-*frequency* member, so with `b50`
  (30%) and `b75` (25%) in one Medium bucket and `b75` as the key, picking
  "Medium Bet" submitted `b50` and was graded wrong.
- #20: `getContextualFillers` injected `b33`/`b66`/`b100` on a check-only node —
  three fabricated sizings presented with solver authority. Now one unsized Bet.

Fix shape: **one remapper per question.** The table skips re-grouping when the
question carries `_difficultyApplied`, and GROUPED bucketing moved into
`DifficultyEngine` where the sizings still exist. `actionGrouper` owns the
thresholds and parser; both remappers import them so they cannot drift.

### 3. RNG mode graded against the previous decision's frequencies

`lastGTOFrequencies` is written at GRADE time and was never cleared, so during
the whole pre-answer phase of the next decision the table held the previous
one's mix — and on a multi-street hand, every street after the flop held the
flop's. That value feeds `rngRanges` → `rngTargetAction` →
`effectiveCorrectAnswer`, so **RNG mode rolled against, displayed, and graded
against stale bands**, and Study mode printed them as this spot's solver output.
Fixed at both ends: the table prefers `question.gtoFrequencies` (guaranteed
populated at `get-question.js:610`) and the hook clears the state on
`nextQuestion` and `advanceToNextStreet`.

### 4. Multi-table (#10 residuals) — one refuted, one real, one already fixed

- (a) **REAL, and worse than recorded.** The roadmap says all tables share one
  preference; reads were already fixed by `prefsScope: 'table'`. The WRITES
  were not, and fired unconditionally on mount with multi-table's *defaults*.
  Opening two tables silently overwrote the Expert + Blitz a player had set on
  the single-table arena, and the next visit there came back Standard with no
  clock. Nothing they touched caused it. Table-scoped arenas no longer write
  the shared keys.
- (b) **REFUTED as stated** — no in-tab cross-table talk remains; both real
  listeners filter by `gameId`. But a different defect sat underneath: EventBus
  mirrors every emit onto a BroadcastChannel, so `SESSION_END` crosses **tabs**
  with `source` still `'GodModeArena'`. A second tab's completion was folded
  into this run's combined stats and could trip the all-tables-done auto-save,
  **POSTing a session the player never played**. The route already hands each
  arena a `<runId>-<gameId>` sessionId; it now travels with the event.
- (c) **ALREADY FIXED** — the live writer is the atomic RPC. The read-modify-write
  survives only in two dead, documented endpoints. New finding: the RPC's
  `CREATE FUNCTION` was **absent from `supabase/migrations`**, so `db reset` and
  every preview database failed at the revoke migration that asserts it exists.
  Added as `20260809022000_fn_training_leaderboard_record.sql`, timestamped to
  sort before it.
- Unlisted, also real: `sp_bookmarked_hands` was hydrated into state at mount
  and written back from that snapshot, a genuine cross-table lost update. The
  toggle now re-reads and merges.

### 5. #33 was stale in one direction and understated in the other

The recorded caveat — free-text hand strength compared against snake_case enums
— is CLOSED; `a8a1fcbc` routed all 19 sites through `_getHandToken`. What the
caveat missed is larger: `useGTOTrainer` calls **ten engine methods that do not
exist anywhere in the repo**. Each wrapper is
`try { return deterministicEngine.getX(...) } catch { return null }`, so every
call threw a TypeError, the catch swallowed it, and **nine coaching panels have
been silently blank for their entire existence** — PRINCIPLE, POSITION, TEXTURE,
SPR, VILLAIN RANGE and STREET PLAN behind "More coaching insights", plus
Frequency Correction, Tilt Recovery and Session Pacing on the summary. That is
exactly what "only the SHALLOW notes render" meant, and the mechanism was a
missing method name, not a vocabulary mismatch.

All ten implemented deterministically. The three session-level ones read
`_sessionStats.history`, which `recordSessionHand` has populated since
2026-08-08. Pacing now also gets a measured `answerTimeSeconds` rather than
inferring from the gap between hands, which includes reading time.

### 6. #36 Strategy tab: the range-level half was missing

The item's measurement — "Bet 14% / Check 86%" — is hero's ONE hand, which the
felt already tells you. GTOW's Strategy tab also shows **hand-class strategy**,
and the data for it was present the whole time: `rawFrequencies` is the full
169-class × action matrix, already fetched and already rendered as a grid on
the Range tab. `src/lib/training/handClassStrategy.js` groups it by what each
class IS on this board, combo-weighted (a pocket pair is 6 combos, an offsuit
class 12 — averaging raw percentages lets the rarest classes shout loudest).

Deliberate limit, stated in the panel rather than hidden: a 169-class grid
records rank structure and a suited flag, not which suits. Made hands and
straight draws are therefore EXACT; **flush draws are not determinable** — a
suited class holds one in exactly one combo of four. There is no flush-draw
bucket, and `suitedNote` says why. Inventing the missing suit information would
have produced a panel that looks more complete and is less true.

Also wired, having accepted the props since it was written: `RangeGrid`'s
per-hand EV overlay and classification colouring. `evData.handEVs` was three
lines away from the call site the whole time.

**New gate: `node scripts/trainer-difficulty-check.js` — PASS 58 FAIL 0.**
It pins every defect above, including that KK on an ace-high board is NOT an
overpair (the first draft of that assertion had it backwards, and the
classifier was right).

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
14. **Chip stack in front of every seat with money committed.** DONE ON
    PREFLOP, screen-measured 2026-08-07, production smarter.poker at
    `9e945718`, 430x932, `cash-001`. The badge had never rendered once in the
    product's history. It renders now:

        SPOT hero=SB villain=BTN pot=4.5  chips=[{"t":"0.5","x":206,"y":519}]
        SPOT hero=BB villain=SB  pot=4.5  chips=[{"t":"0.5",...},{"t":"1",...}]
        SPOT hero=UTG villain=BB pot=1.5  chips=[{"t":"1","x":271,"y":437}]

    Visible in the screenshot as a gold chip disc reading `0.5` sitting between
    hero's seat and the pot, in its `DEALER_BUTTON_AND_CHIP_POSITIONS_LAW`
    slot. Both blinds render together when hero and villain occupy them.

    What unblocked it was not more plumbing. `potMath.postedBlind` credits
    SB 0.5 / BB 1 from the seat NAME alone, with no action history required --
    so the badge only ever needed a spot where a blind is at the table, and
    until #16 shipped, the arena could not deal one. The chip work recorded
    below (`14a`, and the `villainBet` plumbing in `c7d0585a`) was necessary
    and is unchanged; this is the screen it was waiting for.

    **The postflop half remains a CONTENT gap and is not closed by this.**
    `scenario.action` is prose built by `buildActionDescription` ("CO bets into
    BTN") and carries no number, so `committedFor` returns 0 for every seat on
    every postflop spot. `_villainBetBB` reads a facing-bet node off
    `strategy_matrix.node` when one exists and returns 0 rather than
    fabricating -- and measured against `solved_spots_gold` on 2026-08-07,
    `select ... where node ~ 'b[0-9]+$'` over 3000 node-carrying rows returned
    `[]`. Not one solved row ends in a bet. Closing the postflop half is Phase
    A solver work: the machines must store facing-bet nodes with their `pot`,
    or the badge stays dark postflop permanently.


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
16. **Pot includes blinds preflop.** DONE -- screen-measured 2026-08-07,
    production smarter.poker at `d3998aa6`, iPhone context at 430x932,
    `cash-001` at level 1. The felt reads:

        PREFLOP BLUEPRINT
        You opened from CO with J3o and face a 3-Bet. What do you do?
        CO - VS 3BETTOR - PREFLOP
        POT 4.5 BB     SPR: 22.2
        [three empty board slots]
        KINGFISH 100bb  J(spade) 3(heart)
        YOUR ACTION:  FOLD | RAISE | CALL
        Question 1 of 20

    Eight consecutive spots measured, `PAGE_ERRORS=[]`, question number
    advancing once per hand (1..8) because a preflop question is a single
    decision. Pots read 4.5bb in 3-bet spots and 1.5bb in RFI spots -- both
    blinds-inclusive, which is the item's actual subject.

    Off the wire in the same run, ahead of any rendering:

        WIRE=[{"ep":"batch-preload","status":200,"n":20,
               "streets":{"preflop":20},"withBoard":0}]

    Closing this took FOUR shipped commits, and the three that were not the
    obvious one are the interesting part. Each was found only because the
    previous fix was measured against the screen rather than assumed.

    (a) `c7d0585a` / `b300c280` -- the dead flag. `pioStreet` was READ in
        exactly one place (`DeterministicGTOEngine.js:439`) and WRITTEN by no
        config anywhere in the repo. `cash-001` therefore routed to the
        postflop generator and dealt 20/20 postflop questions. The preflop
        generator had worked the entire time and was simply unreachable. Fixed
        by declaring `pioStreet: 'preflop'` on `cash-001` and routing to the
        generator FIRST -- ahead of the L8+ postflop route, not as a fallback
        behind it, because a game whose subject is preflop must stay preflop at
        every level -- with the same branch added to `generateBatch`, which is
        the path the arena actually takes.

    (b) `68fdbc2f` -- the cache-first bypass. Every gate passed and production
        still dealt flop: `batch-preload` returned `{"flop":20}`. Both question
        routes read `training_question_cache` FIRST by design (Phase 92: cache
        rows carry the pedagogical rebalancing fresh generation loses) and
        consult the engine only on a MISS. `cash-001`'s cache holds 25 rows per
        level across ten levels, 250 in total, every one postflop -- and 25 is
        more than the 20 a session asks for, so the branch holding the fix
        never executed once. `src/lib/training/declaredStreet.js` closes it:
        when, and only when, a game DECLARES a street, cached rows of a
        different street are not eligible. A game declaring nothing gets its
        array passed through by reference; a row with no street recorded is
        KEPT (absence is not contradiction, and older seeding migrations did
        not always write the field); an emptied pool falls to the existing
        cache-miss path. Self-healing, not a purge -- reseed the cache with
        matching rows later and cache-first resumes with no code change.

    (c) `d3998aa6` -- two output-contract defects in a generator that had never
        once been consumed by the felt. Symptom: **Arena Crash Detected --
        Cannot read properties of undefined (reading 'toLowerCase')**.
        `heroCards` were `[{rank,suit}]` objects while every consumer treats a
        card as the string `'Ah'`; `getCardPath`'s guard is `card.length < 2`,
        an object's `.length` is `undefined`, and `undefined < 2` is FALSE, so
        the object sailed past the guard into `card[0].toLowerCase()`. A guard
        that reads as a length check does not reject a non-string -- it waves
        one through. And `options` carried `label` but not `text`, the field
        the whole app grades and renders on, so `batch-preload`'s
        `opt.text || String(opt)` served three buttons reading
        `"[object Object]"`.

    The felt and preloader work recorded previously still stands unchanged:
    `committedFor(..., isPreflop)` credits the blinds (`potMath.js:33-37`),
    `d6e0bded`'s street veto reads the declared street before fabricating
    boards or defaulting the pot, and `computeDisplayPot` takes
    `max(explicit, committed)` on PREFLOP only -- postflop the committed sum
    covers just the current street, so trusting it would drop every earlier
    street's money.

    `scripts/preflop-pot-check.js` is now **PASS 33 FAIL 0**, up from 18. The
    twelve added here assert contracts rather than symptoms: `generateBatch`
    fills a whole 20-question session preflop with no board cards and no
    repeated decision; the declared-street filter empties a wrong-street pool
    rather than serving from it, passes a non-declaring game through
    untouched, and keeps street-less rows; every hero card is a two-character
    rank+suit string; every option carries a non-empty `text` that is not the
    stringified-object marker; the correct answer resolves to a served option.

    **The lesson worth keeping.** Three of these four fixes passed every unit
    gate while production was still wrong, and each was caught only by loading
    the screen. A cache in front of the code under test, a guard that admits
    the wrong type instead of rejecting it, and a field name that differs from
    the one every consumer reads are all invisible to a green test suite. This
    is the entry to point at when someone proposes closing an item on a
    passing gate alone.
17. **Villain shows a real stack, not a fabricated one.** DONE —
    screen-measured 2026-08-06 on `cash-001` at 430x932. The felt rendered
    `KingFish / 100 bb` for hero and `BB / 100 bb` for the villain against a
    POT of `6` and an `SPR: 16.7` chip. 100/6 = 16.67, so the seat stacks and
    the SPR readout are computed from the same number rather than one being a
    decorative constant beside the other -- which is the whole point of the
    item. A fabricated stack would not have divided cleanly into the pot the
    panel was already showing.
18. **Folded villains grey out rather than vanish.** DONE -- screen-measured
    2026-08-07, production smarter.poker at `9e945718`, iPhone context at
    430x932, `cash-001`. A squeeze spot renders as a genuine multiway table:

        CO opens and BTN calls. You are in SB with AJs. Squeeze or fold?
        SB - VS CO - PREFLOP
        UTG  100bb  [FOLD]  greyed avatar, greyed face-down cards
        HJ   100bb  [FOLD]  greyed
        CO   100bb  [OPEN]  full colour, red face-down cards
        BTN  100bb  [CALL]  full colour, dealer button
        KINGFISH 100bb  chip 0.5  A(spade) J(spade)
        POT 8.5 BB    SPR: 11.8

    Measured opacities in the same run, read off the seat wrappers: folded
    seats 0.42, live seats 1. Sixteen consecutive spots, `PAGE_ERRORS=[]`.

    **The recorded blocker was wrong, and the way it was wrong is the lesson.**
    This entry previously said closing #18 "means a multiway scenario model,
    not a felt change". The felt half was right -- the grey-out is built three
    times over and needed nothing. The roster half was not: the seat filter at
    `:3574` shows any seat that appears in `actionHistory`, and `villainFolded`
    reads the same array. There was never a roster to build. What was missing
    was a HISTORY, and preflop is the one street where a truthful one can be
    derived rather than invented, because the spot type states the sequence
    exactly.

    Two changes, both in `DeterministicGTOEngine`:

    (a) The squeeze pool was putting the literal string `'multiway'` in the
        villain seat, and the felt drew a player plate reading MULTIWAY --
        observed on production the moment the #16 preflop route went live. The
        range key already names both villains: `BTN_vs_UTG_open_MP_call` is
        hero BTN, UTG opened, MP called. The opener is now the villain seat,
        the caller is carried as an extra actor so the table draws him, and the
        question reads "CO opens and BTN calls" instead of "There's an open and
        a call."

    (b) `_preflopActionHistory` derives the rest. The villain's own action is
        recorded only when the villain is a real seat acting BEFORE hero -- the
        RFI pool names BB as the villain purely to say who is being opened
        into, and BB has not acted, so marking him would be a lie about the
        hand. Everyone seated before hero who is not a named actor folded,
        which the spot definition forces. Anyone seated AFTER hero is left off
        entirely: they have neither folded nor acted, and a fold entry would
        grey out a player who is still live.

    Nothing in the history carries an amount, and that is load-bearing rather
    than incidental. `amountOf` returns 0 for a fold and 0 for an action with
    no number, and `committedFor` still credits the posted blind by seat name,
    so the history cannot move a chip badge or the POT pill by a single big
    blind. One of the five assertions pins exactly that, comparing
    `committedFor` across all seven seats with and without the history and
    requiring equality.

    The cosmetic gap recorded here previously -- "MP is derived as a fold but
    draws no plate" -- is CLOSED, and its recorded mechanism was wrong twice
    over. The blamed nine-max ring was never in play: GameUIRouter maps
    cash-001 to '6max', so these spots always rendered SEAT_CONFIGS[6]. And
    the feared getHeroSeatIndex `?? 0` hazard was moot for hero -- the 6-max
    position map has ALWAYS aliased both MP and HJ to seat 4. The real defect
    was that only hero placement consulted that alias table; the four
    action-history matches (villainFolded, villainSeatAction, isActiveVillain,
    activeCount) and the chip-visibility gate compared raw name strings, and
    the 6-max ring has no seat literally named 'MP', so every MP entry was
    silently dropped. Fixed 2026-08-14 (`777ad2c8`): all five sites match by
    resolved seat index via `positionSeatIndex`, which uses the same alias
    tables but returns null for an unknown name instead of `?? 0` -- the
    fallback that is right for hero, who must sit somewhere, would weld every
    mislabeled entry onto the BTN seat when used for matching. Screen-measured
    on production the same day: a CO RFI renders UTG and HJ greyed at 0.42
    with FOLD bubbles (the HJ seat absorbing MP's fold via the alias, which is
    what a six-seat table would truly show), BB live at 1.0 with his 1bb blind
    chip, pot 1.5. Sixteen spots, `PAGE_ERRORS=[]`. Two entries aliasing to
    one seat is correct behaviour, not a collision -- the solver's seven-name
    vocabulary has to land on six seats somewhere.


19. **Avatar must not float mid-table.** DONE — screen-measured 2026-08-06
    by the same run that proved #30, which is the measurement that closes this
    one too: with the feedback panel OPEN the entire felt stayed on screen,
    shifted up ~48px, rather than clipping. Clipping was the mechanism that
    stranded hero's avatar mid-view, so a non-clipping open is direct evidence
    the strand cannot recur. Root cause was
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
25. **GTOW Score -100..+100.** DONE — screen-measured 2026-08-06. The
    signed range was only ever half-proved: every prior session scored
    POSITIVE, so the negative half of the scale had never been rendered and a
    clamp-to-zero bug would have been invisible. A 20-question production
    session was driven with the action choice pinned to the aggressive option
    on every decision (18 BLUNDER / 3 INACCURACY / 5 CORRECT / 9 BEST) and the
    summary rendered **-13%** under GTOW SCORE, grade **F**, "Review
    Fundamentals". Negative scores render, and the transform is live in
    production, not just in a unit test. The
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
28. **Average loss per mistake.** DONE — screen-measured 2026-08-06. The
    tile rendered **-0.75** EV LOSS/MISTAKE beside **21** MISTAKES and
    **-15.7** EV LOSS (BB); 15.7 / 21 = 0.7476, so the number on screen is the
    real quotient of the two numbers next to it and not a placeholder.
    Corrected earlier during cross-reference: `avgEVLossPerMistake` already
    existed in useGTOWScore and is threaded through the arena, so the roadmap's
    original GAP status was wrong.

28a. **`handsPlayed` counted DECISIONS, not hands.** FIXED and shipped
    2026-08-06 (`d6e0bded`), found while measuring #28 — the same screen that
    proved #28 disproved the tile beside it. The summary rendered **20** HANDS,
    **-15.7** EV LOSS and **-0.45** EV LOSS/HAND. 15.7/20 is 0.79, not 0.45;
    15.7/35 is 0.45. Two tiles were dividing by different denominators and
    only one of them was the hand count.

    Root cause is the multi-street model wearing a disguise. `useGTOTrainer`
    passed ``handId: currentQuestion.id || `q_${level}_${questionNumber}```,
    which READS as a per-hand identity and is not one: `advanceToNextStreet`
    replaces the whole question object (`nextQ = data.question` straight off
    `/api/training/next-street`), so `currentQuestion.id` is a per-DECISION id.
    `useGTOWScore.recordMove` increments `handsPlayed` on every change of that
    key, so a 20-question session whose hands ran flop -> turn -> river counted
    35 "hands" while the tile beside it printed `totalQuestions`.

    This is the inverse of the five `[questionNumber]` effect bugs fixed
    earlier: there, code keyed off a per-hand counter when it needed
    per-decision. Here it keyed off a per-decision id when it needed per-hand.
    The law generalises — **`questionNumber` is the ONLY value in this hook
    that advances once per hand.** `nextQuestion` increments it and
    `advanceToNextStreet` deliberately never touches it. Anything that must be
    per-hand keys off `questionNumber` and nothing else; anything that must be
    per-decision uses the `decisionKey` composite. An id that merely looks
    stable is not evidence that it is.
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
34. **Mistake review at session end.** DONE -- screen-measured 2026-08-07,
    production smarter.poker, iPhone context at 430x932, `cash-001`, a full
    20-question / 32-decision session driven to the summary.

    The review lives on the HANDS tab, in `<div id="hand-replay-section">`
    (`GodModeArena.jsx:5938`), and the `Mistakes Only` toggle that filters it
    sits on the OVERVIEW tab (`:5575`) -- a deliberate split, but the reason
    two earlier harness runs reported the list "missing". With the toggle
    engaged the control read `Mistakes Only (20)` and the section rendered,
    verbatim off the element (first six of twenty entries):

        HAND REPLAY
        List  Detail  All
        1  warning Blunder    BTN flop Th9h   Bet -> Check   -0.4
        2  warning Blunder    BB  flop As2s   Bet -> Check   -0.5
        3  warning Blunder    BB  turn As2s   Bet -> Check
                              (top pair, weak kicker + nut flush draw)  -0.8
        4  warning Blunder    BB  flop 7h6h   Bet -> Check   -0.5
        5  warning Blunder    BB  turn 7h6h   Bet -> Check (weak flush draw)  -0.8
        6  warning Blunder    BB  flop QhJh   Bet -> Check   -0.6

    Every field GTO Wizard's mistake review carries is present: severity tier,
    hero position, STREET, hero's exact holding, the move played versus the
    solver's move, the EV loss in bb, and a hand-strength annotation on the
    spots where one applies. The list scrolled cleanly (max 406) and re-read
    identically at the bottom, so nothing is clipped. `PAGE_ERRORS=[]`.

    Two things this measurement specifically proves, because both were live
    suspicions:

    (a) It is keyed per DECISION, not per hand. Entries 2/3 and 4/5 are the
        same question at `flop` then `turn` (`BBflopAs2s` / `BBturnAs2s`), and
        the run logged 32 decisions across 20 questions. Anything keyed off
        `questionNumber` alone would have collapsed each multi-street hand to
        one row and shown at most 20 of the 32.

    (b) The flat-spread read is correct here. Street, position and holding all
        render, and those live in the spread `...handData`, not under an
        `h.handData` key -- a `h.handData.street` read would have printed
        `undefined` in all twenty rows.

    A HARNESS defect was found and fixed to get this measurement, recorded so
    it is not rediscovered: `clickExact` scans `button, [role="tab"], div,
    span, a` and accepts any match >= 8x8px, and the summary HEADER carries a
    stat label whose exact textContent is also "Hands". Clicking it matched a
    38x16 span at y=-1970 instead of the 64x44 tab at y=584, so the tab never
    changed and `#hand-replay-section` was never mounted -- while the same
    helper hit `Analysis` correctly, which is why the failure looked
    product-shaped. Fix: scroll the scroller to 0 first, then require
    `height >= 30 && width >= 24 && y >= -50`, and take the lowest-y candidate.


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
40. **Pot-type breakdown.** DONE -- screen-measured 2026-08-07, after being
    FIXED 2026-08-06. The 2026-07-26 status said "Verified in
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
    THE MEASUREMENT (2026-08-07, production smarter.poker, iPhone context at
    430x932, `cash-001`, 20 questions / 35 decisions driven to the summary).
    The block renders on the ANALYSIS tab inside the "Data & History" accordion
    and reads, verbatim off the element:

        POT-TYPE ACCURACY
        SRP (35)   39%
        3BP (0)    0%
        4BP+ (0)   0%

    35 is the decision count the harness actually played, so the card is
    counting real hands rather than defaulting -- the exact failure mode (b)
    would have produced. All 35 bucketed SRP because `cash-001` deals only
    single-raised pots; a 3-bet-pool game is what moves the other two buckets.

    A FOURTH defect was found in the harness, not the product, and is recorded
    here because it invalidated two earlier "verified" runs: `AnalysisSection`
    styles its title span `textTransform: 'uppercase'`, and **`innerText` is
    the RENDERED text and honours text-transform while `textContent` does
    not** -- so a button whose title prop is literally `Data & History` reports
    `innerText === "DATA & HISTORY"` and any `.includes("Data & History")`
    match fails. Match styled labels on `textContent`, case-insensitively.
41. **Frequency-difference metric.** DONE — screen-measured 2026-08-06. The
    summary rendered **73.3%** FREQ DIFF on the aggressive-bias session,
    against 37.9% on the mixed-bias session driven earlier the same day. The
    metric moves with how far the player's action distribution sits from the
    solver's, which is what it is for; a hardcoded or always-zero readout would
    not have differed between two sessions on the same game.
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
8. **`window` is NOT the scroller on the session-summary screen.** Four
   `window.scrollTo(0, k*700)` calls all reported `scrollY = 0` and the run
   concluded, wrongly, that two items were missing. The summary scrolls an inner
   `div` (measured: `scrollHeight 3844` against `clientHeight 863`, while
   `window` reads 932/932). Find the deepest element with
   `scrollHeight - clientHeight >= 80`, an `overflowY` of `auto|scroll`, and a
   height >= 200, then drive its `scrollTop`.
9. **The summary screen is TABBED, not scrolled.** `reviewTab` defaults to
   `'overview'`; the mistake review (`<HandReplayViewer>`) is inside the `hands`
   block and the pot-type breakdown (`<LifetimeStatsCard>`) is inside `analysis`.
   Neither is below the fold — they are not in the document. Worse, the
   `Mistakes Only (N)` toggle that FILTERS the replay lives on `overview`, a
   different tab from the list it filters, so the sequence is: flip the toggle on
   Overview, THEN switch to Hands.
10. **Nav chips must be matched EXACTLY, never by prefix.** The tab bar carries
   ~160 chips with real prefix collisions — "Overview"/"Overbet",
   "Analysis"/"Analytics", "3-Bet"/"3B Def" — and "Squeeze" appears twice. A
   prefix matcher silently clicks the wrong one. (The SETUP screen is the
   opposite case: its controls concatenate label + sublabel into
   "RelaxedNo timer", so those need prefix matching. Different screens, opposite
   rules.)
11. **A collapsed `AnalysisSection` renders `{open && ...}` — its children are
   not in the DOM at all.** Six accordions live on the Analysis tab and only two
   ("Player Rating & Overview", "Leak Detection") open by default. The pot-type
   row sits inside "Data & History" (`defaultOpen={false}`), so a run that
   scrolled that tab to its true maximum still found nothing and reported a
   working feature as missing. The collapse is deliberate progressive
   disclosure, not a bug: the harness expands the section, the source does not
   change its default.
12. **`document.body.innerText.slice(0, N)` is worthless on the summary
   screen.** The ~160-entry nav chip bar sits between the header stats and the
   tab body, so 1800 characters never once reached the content being measured.
   Read the target ELEMENT instead — the replay is wrapped in
   `<div id="hand-replay-section">` precisely so it can be addressed.

---

## Sources

- GTO Wizard — How To Use the Trainer: https://help.gtowizard.com/how-to-use-the-trainer/
- GTO Wizard — Measure Performance: https://help.gtowizard.com/measure-performance/
- GTO Wizard — Practice Mode Overview: https://help.gtowizard.com/practice-mode-overview/
