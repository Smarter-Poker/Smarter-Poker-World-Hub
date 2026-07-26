# Training Games Full Audit and Repair — 2026-07-25

Scope: all 107 games in `src/data/TRAINING_LIBRARY.js` (27 MTT, 25 Cash, 10 Spins,
20 Psychology, 25 Advanced incl. 7 named games), audited end-to-end for GTO Wizard
parity: question sourcing, poker/GTO logic, grading, session flow, animations,
table rendering, API wiring, and persistence. 10 parallel audit passes over
~60k lines, ~120 confirmed defects fixed across 41 files, adversarially verified
(0 blockers, all smoke tests pass), then 3-way merged with the 2026-07-19
engine-audit wave already on origin/main (no prior fixes reverted).

## Systemic bugs fixed (affected ALL or most games)

1. `DeterministicGTOEngine.fetchSolverPool` queried `.eq('street', null)` —
   PostgREST matches nothing, so the 187k-row solver DB was silently bypassed
   for every PIO game at default levels. Street filter is now conditional.
   (The 2026-07-19 runtime patch fixed this for the batch path; the in-file fix
   covers all other entry points.)
2. batch-preload SCENARIO branch called `generateBatch` positionally and without
   `await` — all 20 psychology games plus cash-020 generated zero questions.
   Fixed signature + await, plus seenIds passthrough.
3. NEW: `src/data/psychologyQuestionBank.js` — 169 authored mental-game questions
   across 21 buckets (8+ per psy game plus cash-020 Table Selection), wired via
   `generateScenarioBatch` in the engine. The Psychology category is functional
   for the first time.
4. Level clamps: API clamped level to 10 while the registry defines 12 —
   Elite Synthesis and Boss Mode silently served level-10 content. Clamps
   raised to 12 in batch-preload, get-question, smart-practice; engine routes
   L11-12.
5. GameScenarioMap routing was largely decorative: spotType regexes used `\b`
   (never matches inside underscore-delimited hashes) and stackDepths referenced
   depth 50 which does not exist in the DB. Patterns re-anchored `(^|_)...(_|$)`
   (both in-file and in deterministicEnginePatches.js), all depth-50 entries
   remapped to real depths, postflop_complete games pinned to [100].
6. Classification case mismatch (`'INACCURACY'` vs lowercase `'inaccuracy'`)
   killed mistake replay, spaced repetition, and weak-spot targeting. Fixed;
   spaced-repetition payloads now carry real classification/evLoss/chosenAction.
7. L8-10 postflop generation discarded its position/street filters and game
   config (every game got generic 100bb cash spots). Filters and gameConfig now
   flow through; ICMIZER games route to charts at all levels.

## Engine correctness (DeterministicGTOEngine + postflop chain)

- `hasAce/hasKing` ReferenceError in 3-bet-pot fold explanations (could wipe
  whole batches) — fixed to in-scope `isAx/isKx`.
- `detectNodeType` misclassified facing-bet nodes as check/bet when fold+call
  present — fold-bearing checks now run first.
- EV-loss double scaling (bb multiplied by pot again) inflated user-facing EV
  feedback ~pot-size-fold; `estimateEVLoss` now treats diffs as bb.
- Duplicate class methods silently shadowing (`_describeCardImpact` x2 →
  TypeError on turn/river; `generateHints`/`estimateEquityVsRange` x2) —
  renamed/deduped.
- Phase-126+ coaching helpers compared free-text hand strength against
  snake_case enums (dead or wrong for ~20 note generators) — `_getHandToken`
  normalizer added and applied to 17 helpers; texture field mismatches
  (isDry/flushDraws vs dry/flushy) fixed in 11 helpers incl. the texture quiz
  whose graded answers were always Dry/0/No.
- `b*` bet actions ignored by later analytics (aggression factor, deviation
  tracking, heatmap) — `_isAggressiveAction` helper applied across ~20 sites;
  action heatmap keys now match the tracker (was always empty).
- Quads/nuts facing an overbet were told to FOLD (missing overbet rows fell to
  a fold-heavy generic) — degrades to pot-size row now.
- Board-paired boards gave any two cards "top pair" (AQ on KK7 = TPTK) — hero
  participation now required.
- OESD/gutshot: ace-edge windows (AKQJ, A234) counted 8 outs; double-gutters 4.
  Correct completing-rank counting implemented.
- 3-of-suit on 4-5 card boards classified "monotone"; `.cards` vs `.board`
  field bug made every J+ turn an "overcard"; river `overcards` class had no
  matrix row; `getEnhancedCbetStrategy` returned undefined on error — all fixed.
- L10 bluff-catcher scenarios: correctAction was check/bet while options were
  Call/Fold (128 of 352 generated) — grading and narrative reconciled; L8
  defender air spots no longer teach 65% calls; multi-sizing spots grade by the
  generator's flagged answer, not max single option.
- Bluff-ratio formula used alpha instead of b/(pot+2b); pot-odds quiz had a
  4-out river draw; UTG range quiz graded standard opens as errors — fixed.

## Session flow and scoring (useGTOTrainer/useGTOWScore)

- Preload effect re-fired mid-game (level change, config change) yanking users
  back to question 1 — mount-only via ref, with explicit level-override calls.
- `resetGame()` crashed on removed `setTotalXP`.
- Difficulty simplification (Simple/Grouped) produced blank buttons with
  undefined ids and never remapped correctAnswer/frequencies — full remap with
  fail-safe (serves unsimplified rather than unwinnable).
- Multi-street hands inflated correctCount past the denominator (accuracy
  >100%, auto-pass) — one credit per hand.
- `checkLevelPassed`/`getRequiredCorrect`/`getDiamondReward` hardcoded 20
  questions — custom/short sessions were unpassable or trivial; all honor the
  actual count (merged with origin/main's selectedLevel fix).
- Mixed-strategy answers: solver-playable actions now grade correct
  (classification-driven), matching GTO Wizard semantics.
- Retry/next-level leaks: GTOW score, mistakes, checkpoints now reset.
- TDZ in the ActionTree scoring block (also fixed on origin/main; merged).

## Table UI and animations (UniversalDynamicTable)

- The "inline feedback" panel was a full-screen 97%-opaque fixed overlay hiding
  the table — now genuinely inline below the action bar (GTO Wizard behavior).
- Keyboard shortcuts answered from a different option list than the visible
  buttons (wrong action submitted in grouped/simple modes) — unified path;
  double-answer window closed.
- Villains vanished for alias positions (MP, HU SB); all villains shared one
  name label; villain stacks were fabricated by two inconsistent PRNGs and SPR
  contradicted displayed stacks — seat alias resolution, per-seat labels, real
  scenario stacks.
- LAW compliance: dealer button restored (DEALER_BUTTON_AND_CHIP_POSITIONS_LAW
  coordinates), active-hand pulse-glow implemented, folded villains now show
  greyed cards instead of disappearing (ACTIVE_HAND_GLOW_LAW).
- Board cards no longer re-deal the whole flop on turn/river; turn/river
  entrance animation actually fires; exit animations un-broken (AnimatePresence
  hoisting); duplicate deal sounds removed; loading skeleton pulse restored.
- Feedback panels read a snapshot of the answered question (no flip to the
  preloaded next hand mid-feedback); board clamped by street; preflop pot
  shown; villain action speech bubble rendered; Review Mistakes overlay
  implemented (was a dead button).

## Arena shell (GodModeArena)

- Review-screen restart actions stranded users on a blank arena (gamePhase
  stuck at 'review') — restore effect added; retry flows re-arm coaching,
  achievements, and session saves.
- ~230 review tabs rendered in one clipped unscrollable row — now scrollable;
  duplicate tab ids (nodelock/sessrev) stacked two panels — deduped.
- Global keyboard shortcuts fired on the splash screen and while typing in the
  import textarea, silently answering background questions — gated by phase and
  input focus, routed through the speed-bonus path.
- Share-to-feed always 401'd silently (no auth header, no error state) — fixed.
- Imported hands were parsed then discarded; now displayed AND graded locally
  against the imported hand (was mis-graded against the trainer queue).
- Solver-tree hand pills passed a tree where a spot was expected (viewer broke
  on click); pill colors used a vocabulary that exists nowhere (every hand
  showed red); coaching tips compared objects to numbers (never rendered) —
  all fixed. Analytics tab labeled as sample data until real sessions wired.

## API layer

- bookmark-solution 500'd and solver-api 401'd for every user (undeclared
  `error` in auth destructure) — also fixed on origin/main; merged.
- Challenges: list always empty (missing `challenges` key), claims sent to the
  wrong verb with the wrong body, progress never incremented (POST select
  omitted target_type) — all wired.
- save-session `parsedLevel` ReferenceError silently killed every speed bonus;
  response no longer claims bonuses that failed. hand-of-the-day now actually
  credits the 25 diamonds (merged with origin/main's alreadyCompleted guard).
- ICM calc credited one player with multiple prizes; tournaments status filter
  dead branch + self-reported scores now clamped; next-street can no longer
  deal a card the hero holds (client sends real heroCards); spot-drill options
  no longer mix raw solver codes with English labels; get-question PIO fallback
  produced invalid hero cards ('AK','s'); seen-question exclusion added to
  batch-preload (fail-safe, repeats-beat-404s); failed sessions no longer
  inflate all-time accuracy; diamond dedup day-bucketed so replays can re-award.
- LevelSelector now authenticates its progress fetch and honors server unlocks
  (merged with origin/main's rewrite of /api/training/progress).

## Deliberately NOT changed (needs decisions/DB access)

- `training_leaderboard` double schema: save-progress writes schema B, readers
  read schema A; no live flow currently writes the board. Needs production
  schema inspection (Supabase MCP) before unifying.
- Streak recording is still not called by any live flow (POST /streak has no
  live caller). Recommend wiring from the session-completion path.
- `training_answers` Phase-14 metadata columns (hero_position, street,
  classification...) still unmigrated; analytics/smart-practice selects will
  no-op until the migration ships and record-question re-enables the fields.
- Dead code surfaces documented but not deleted: /api/gto directory (no
  reachable callers), src/games/ (~24k lines), QUESTIONS_LIBRARY.js,
  the four orphaned games/*UI.jsx dashboards, GameLibrary.ts (underscore ids).
- The three positioning LAW docs contradict each other; code follows
  DEALER_BUTTON_AND_CHIP_POSITIONS_LAW.md as canonical. Chip-stack rendering
  per CHIP_STACK_LAW remains unimplemented (needs a design pass).
- PIOQueryService per-game comment drift (comments name the wrong games) —
  cosmetic, flagged for re-calibration review.

## Verification

- All 41 changed files parse clean (tsc/babel-level check; LevelSelector.tsx
  emits pre-existing repo-wide TS advisory noise only).
- Adversarial verifier pass over the full diff: 0 blockers; its 4 should-fix
  items were all applied (spotType patterns, difficulty remap correctness,
  imported-hand grading, diamond display denominator).
- Functional smoke tests: quads-vs-overbet now raises; board-pair
  misclassification gone; 1,144 generated L8-L10 scenarios show 0
  correctAction-not-in-options; psych bank serves 8+ valid questions per game
  at every level; pot-odds quiz returns 33% for pot-sized bets.
- 3-way merge against origin/main's 2026-07-19 wave: 20 conflicts resolved by
  combining both fixes; no origin/main fix reverted.
- NOT yet run: `npx next build` (must run on the Mac — this session cannot),
  and live browser testing. Both are covered in the deploy handoff.


## Shipping record (added 2026-07-26)

All 43 files shipped in commit `5737eb073bdc094bc554f5e586667dbd29fc4877`
("Deploy header icons and training audit fixes"). 39 files changed in that
commit; the other 4 (`bookmark-solution.js`, `hand-of-the-day.js`,
`progress.js`, `solver-api.js`) were already byte-identical to `main` after
the three-way merge with the 2026-07-19 engine-audit wave, so they produced
no diff.

Verified on 2026-07-26:

- On `origin/main` (local `main` 0 ahead / 0 behind).
- Ancestor of the `READY` production deployment
  `dpl_8QV38T2aJt44yjD4gojfP7oq417n` (commit `380bfc5b92`), so the audit
  code is live on smarter.poker.
- Working tree clean for all 43 paths.

A report that these fixes had been "destroyed by the Antigravity reset" was
incorrect — verified by SHA-256 comparison of all 43 files against the
session's fixed tree (42 byte-identical; `pages/api/training/challenges.js`
differed only by a later `auth['getUser']` bracket-notation edit from
another agent, with the audit fixes intact).

**Process failure to not repeat:** the authoring agent left the fixes
uncommitted and wrote a deploy handoff. That is now explicitly forbidden —
see `.agent/workflows/claude-mcp-push.md`, RULE 0 in `CLAUDE.md`, and
section 1.1 of `.agent/AGENT_BINDING_RULES.md`.


## CORRECTION (2026-07-26): the "dead code" list was wrong

The audit listed `src/games/` (~24k lines), the entire `pages/api/gto/`
directory and `GameLibrary.ts` as dead and recommended deletion. **That was
wrong and deleting them would have broken a live feature.**

`pages/hub/memory-games.js` imports all of it: `GameEngine`,
`ScenarioDatabase`, `ELOService`, and the six game components
(`SpotTrainerGame`, `TournamentModeGame`, `SpeedDrillGame`,
`PressureCookerGame`, `PatternRecognitionGame`, `MixedStrategyGame`), and it
calls `/api/gto/generate-scenario`, `/api/gto/explain-hand`,
`/api/gto/render-analysis-card`, `/api/gto/analyze-game` and
`/api/gto/get-weak-spots`. The auditing agent never saw that page because the
snapshot it was given contained only `pages/hub/training/`, so "no importer
found" meant "no importer in the snapshot".

Consequences:

- **Do not delete `src/games/` or `pages/api/gto/`.** Only
  `src/data/QUESTIONS_LIBRARY.js` (101 lines) is genuinely unreferenced.
- The `/api/gto` defects the audit filed as "latent, dead endpoint" are
  **live bugs in Memory Games**, and two were fixed on 2026-07-26:
  `generate-scenario.js` resolved `FOUR_BET` with a key shape that exists
  nowhere (`vs_<pos>_3bet` instead of `<pos>_vs_3bet`), so every Cold 4-Bet
  scenario returned an empty range; and `pickRfiTable` returned the
  bucket-keyed `SHOVE_FOLD` table where the caller indexed by position, so
  every short-stack open-raise scenario returned an empty range too.

Lesson for future audits: "no importer found" is only valid when the search
covered the whole repo. Verify dead-ness against the full tree before
recommending deletion.
