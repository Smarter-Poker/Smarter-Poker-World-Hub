# Training Complete Audit And Upgrade Program

Date: 2026-08-30
Owner: Codex Training Program
Status: Phases 1-6 Complete; Phase 7 In Progress

## Objective

Systematically implement, test, publish, and verify the complete Smarter.Poker
Training product. The scope includes every canonical game, every Training page,
every secondary flow, every primary interaction, all supported responsive
layouts, and the live production release.

The global header is frozen. No phase may redesign, replace, or fork it.

## Completion Standard For Every Phase

A phase is complete only when all applicable requirements below have evidence:

1. The implementation is wired to a reachable caller and rendered route.
2. Focused unit and contract tests pass with recorded counts.
3. Desktop and mobile browser flows pass without page errors or overflow.
4. Loading, empty, error, success, retry, and stale-client states are exercised.
5. Relevant visual screenshots are inspected, not merely captured.
6. Existing Training invariants and the production build remain green.
7. Changes are published through the protected pull-request pipeline.
8. Production serves the expected commit and the affected path is exercised.
9. Stubs, mocks, silent fallbacks, TODOs, dead code, and unwired functions are
   explicitly searched for and either removed or documented as an honest
   dependency.
10. The phase report names what changed, what passed, what remains, and the
    exact next phase.

## Program

### Phase 1: Release Synchronization, Preservation, And Baseline Truth

Preserve existing work, reconcile open Training pull requests with current
`main`, inspect CI failures, simulate merges, capture production health and
visual baselines, and verify the scanline removal without regressing newer work.

### Phase 2: Exhaustive Surface And Function Inventory

Generate the authoritative manifest of all Training routes, 107 canonical
games, play and arena entry points, secondary pages, components, APIs, CTAs,
dialogs, persistence writes, realtime subscriptions, and existing tests. Produce
a route-by-state-by-function coverage ledger that later phases must close.

### Phase 3: Hub Media, Performance, And Browse Experience

Wire responsive AVIF/WebP sources, optimize the shared HUD overlay, improve
mobile browse density and legibility, preserve unique casino-realism artwork,
and measure payload, layout shift, broken images, search, filters, and all 107
card launches.

### Phase 4: Poker Truth And Question Contract For All 107 Games

Audit every cached and generated question for legal action chronology,
positions, streets, stacks, pots, minimum raises, card uniqueness, board state,
solver provenance, explanation quality, and meaningful answer choices. Enforce
four distinct answers except literal Yes/No and Push/Fold decisions. Prevent
answer-choice hinting and simulated data from masquerading as solver-exact.

### Phase 5: All-Game Runtime Gameplay Matrix

Exercise every game through both play and arena routes on desktop and mobile.
Validate load, answer, feedback, Next, completion, retry, level transition,
resume, and failure recovery for all 107 games.

Phase 5 implementation PR 1164 merged normally as `9fe70d5dc9`; production
serves verified healthy descendant `63b33a60fb`. Full local and production
evidence is recorded in
`2026-08-31-training-phase-5-all-game-runtime-matrix.md`. Protected closeout
PR 1166 merged normally as `d8d3b1468e`. A fresh real-account certification
then passed the complete representative mobile/desktop production matrix.

### Phase 6: Club Arena One-To-One Gameplay Parity

Lock table geometry, avatars, hero cards, seats, dealer and blind markers, pot,
community cards, HUD, action rail, feedback layers, and responsive states to the
Club Arena reference. Add pixel baselines for idle, preflop, flop, turn, river,
action, verdict, all-in, and completion states.

Phase 6 started from exact protected main after Phase 5 closeout. Its first
production cold-cache audit found two certification races and one false bundle
budget regression. The visible-image check now waits for decoding before it
classifies an image as broken, persistent feedback is checked through the same
semantic visible locators that observed it appear, and Club Arena current and
retained compatibility generations are measured independently without raising
the 9 MB current-code ratchet. Detailed evidence is recorded in
`2026-09-01-training-phase-6-club-arena-parity.md`.

Phase 6 implementation PR 1177 merged as `10c62c39df7`; production-hardening
PR 1202 merged as `ccf12df912`. Immutable production deployment
`dpl_9MxEg12t87P5egh9zbFwrcNXzvdd` passed the 16-case mobile/desktop Club Arena
ledger, both real 20-hand manual-Next completions, Level 11 and 12 serving and
grading, and direct login hydration. The ledger recorded 50 captures with zero
page errors, console errors, broken images, overflow, or seat/player drift.
Worker activation can no longer reload a live Training decision, and the
footerless mobile lobby no longer reserves a phantom footer row. The approved
global header remained untouched.

Protected closeout PR 1208 merged as `c70dda95fd`; its complete local
Chromium/mobile matrix passed 689 tests with 24 intentional skips and no
failures or flaky results. The protected broad E2E rerun and the exact
Chromium/WebKit Global Footer rerun both passed. Production then passed the
authenticated mobile/desktop smoke across the 107-card Hub, login, three
representative 12-level campaigns, four representative arenas, four-option
contracts, explicit feedback, persistent manual Next, footerless mobile launch
geometry, and zero page, console, image, scanline, or overflow defects. The
permanent smoke now asserts the immersive footerless arena contract instead of
waiting for the deliberately absent global footer. Follow-up PR 1218 publishes
that permanent smoke correction and regression contract through protected
checks.

### Phase 7: Every Game's Secondary Pages

Audit and optimize the setup, campaign, level selection, lobby, resume, review,
and other page 2/page 3/page 4 flows reachable from every game card. Exercise
every CTA and state across all 107 games on desktop and mobile.

### Phase 8: Feedback, Progression, Rewards, And Recovery

Verify unmistakable Correct and Incorrect states, Your Answer, Correct Answer,
rationale, solver data, manual Next, results, progression, rewards, achievements,
mistake replay, session history, stale local storage, expired auth, old bookmarks,
network drops, and duplicate submissions.

### Phase 9: Challenges And Tournament Preparation

Complete and test Challenges, Daily Challenge, Tournament Preparation, final
table preparation, scheduled availability, completion, scoring, rewards,
leaderboards, empty states, and repeat-entry protections.

### Phase 10: PvP

Replace explicit non-live states with server-authoritative matchmaking, match
state, ratings, persistence, anti-cheat, disconnect recovery, settlement, and
rewards. Test two-client concurrency, duplicate actions, reconnects, timeouts,
and every terminal match state.

### Phase 11: Training Social System

Wire Training Feed to real privacy-aware friend and shared activity, then fully
test Study Groups, Study Group Finder, sharing, membership, moderation,
pagination, realtime updates, and empty/error states.

### Phase 12: Coach Mode And Analytics

Move Coach Mode progression from device-only storage to authenticated
cross-device persistence. Verify curriculum, recommendations, weak spots,
spaced repetition, analytics, session history, exports, and data consistency.

### Phase 13: Live HUD Sync And Imports

Define and implement the supported pairing or native bridge, retain honest
unavailable states for unsupported transports, and test hand-history import,
deduplication, parsing failures, account pairing, disconnects, and recovery.

### Phase 14: Responsive, Accessibility, And Cross-Browser Certification

Test mobile, tablet, desktop, keyboard, screen reader semantics, focus, contrast,
reduced motion, touch targets, safe areas, orientation changes, zoom, Chromium,
WebKit, and Firefox. Add durable visual regression coverage.

### Phase 15: Performance, Resilience, Security, And Maintainability

Measure and improve bundle size, code splitting, image delivery, rendering,
network behavior, caching, API latency, observability, RLS, ownership,
anti-cheat, reward idempotency, and silent-fallback behavior. Split oversized
table modules only behind locked visual and behavioral baselines.

### Phase 16: Complete Regression And Production Certification

Run the final route-by-state-by-function ledger. Exercise every game, every
page, every primary function, and all supported viewports and browsers. Publish
through canary and production, verify the exact production commit, inspect final
screenshots, and record any genuine external dependency without claiming it is
complete.

## Phase 1 Evidence To Date

- Worktree is isolated under `.agent-trees`.
- Commit identity is `Smarter-Poker` with the approved GitHub noreply address.
- Hooks resolve to the tracked `.husky/pre-commit` guard.
- Phase 5 PR 1019 merged through the protected pipeline as
  `2ccb64d5f297293bcb6b836e9070782ca09159b1`.
- Scanline removal PR 1021 merged as
  `54f5b4a39874509e06010d2f0527849a9563dee5`.
- Release-hardening PR 1029 merged through Autopilot as
  `06e1640967cb00fcd3f14c2523e36323a775840d`. It removed a browser-matrix
  worker race, kept mobile Start controls above the approved global footer,
  suppressed gameplay-interrupting first-run prompts, and bounded the
  production database health probe.
- Every required PR 1029 workflow completed successfully: Build Safety,
  authenticated Playwright E2E, Chromium/WebKit footer geometry, Supabase
  invariants, Agent Autopilot, audit marker, no-conflict, silent-write, and
  undefined-identifier guards.
- The exact protected branch head passed 44 focused auth, question-integrity,
  runtime-wiring, card-art, deployment-stamp, and health-deadline tests.
- The exact branch head passed the complete deterministic browser matrix:
  107 games, mobile and desktop, 428 rendered surfaces, 214 campaign checks,
  214 arena checks, 174 Club Arena tables, 40 psychology scenarios, explicit
  Correct and Incorrect states, and persistent manual Next. No failures.
- The read-only production-source content audit validated 107 games and all 12
  levels: 1,284 cells, 25,958 compatible cache questions, 1,016 real
  deterministic-engine questions, and 1,179 incompatible rows rejected. No
  question, answer-count, chronology, legality, or generation failures.
- Production served exact build `06e16409`. The first cold database probe
  returned an honest 503 in 3.2 seconds instead of hanging; the next probe
  recovered to HTTP 200 with 550ms database latency.
- An in-app production audit loaded every one of the 107 lazy card images,
  found zero scanlines, zero horizontal overflow, one approved global header,
  and one Training footer.
- A fresh real test-account production session passed mobile and desktop hub,
  campaign, and gameplay checks for `cash-001`, `adv-011`, `quiz-gauntlet`, and
  `psy-001`. All campaigns rendered 12 levels; all poker games rendered the
  Club Arena table; psychology rendered its scenario surface; all questions
  exposed four answers; Cash and psychology feedback remained until manual
  Next; and the run recorded zero console, page, overflow, or visible-image
  errors.
- Repeating the unmocked production smoke exposed an intermittent campaign
  deadlock: `/api/games/:id` had no deadline, so an upstream stall could leave
  `LevelSelector` on `Loading Levels...` forever instead of using its complete
  client catalog. The final fix applies an eight-second fail-open deadline to
  both game and progress enrichment, retains the real 12-level fallback, and
  adds a focused regression contract.
- The corrected release passed 45 focused tests, TypeScript compilation, and
  the complete 428-surface mobile/desktop matrix with zero failures.
- Release-certification PR 1038 merged through the protected pipeline as
  `09eb5bdfc392cc16b4affd54b13d49b3fbaa159b`. Production reported that exact
  build at `/api/health` with HTTP 200, `status: ok`, an 88ms database check,
  and an 89ms server response.
- The real-account production certification harness now waits for the lobby's
  settled visual state before asserting mobile footer clearance, records a
  screenshot plus DOM diagnostics when gameplay fails to mount, and retries a
  lazy-image sweep only when the browser explicitly replaces its document. A
  retry must remain on `/hub/training` with all 107 cards or it fails.
- Two consecutive fresh-session production certifications passed after that
  harness hardening. Each covered signed-out login, authenticated mobile and
  desktop hubs, all 107 lazy card images, three campaign families, four arena
  families, Club Arena poker gameplay, psychology gameplay, four-answer
  contracts, explicit feedback, persistent manual Next, footer clearance,
  scanline removal, and broken-image, overflow, console, hydration, and page
  error guards. Both runs recorded zero failures.
- Repository instructions reference `.memory/WORKING-RULES.md` and
  `.memory/REALIGN-PROTOCOL.md`, but neither file exists in this worktree. The
  current playbook, binding rules, operations guide, and audit history were used
  as the authoritative fallback.

## Phase 1 Remaining Exit Items

None. Phase 2 may begin from the published `09eb5bdf` production baseline.

## Phase 2 Evidence

- Inventory PR 1055 merged normally as
  `31543bd4f64419692c454b97ed00119cf08e400a`; authenticated production-closeout
  PR 1056 merged normally as
  `9bee6d2022a6e1b78fcec453b4184a551e697585`.
- The authoritative machine-readable inventory covers 107 canonical games, 94
  Training route templates, 214 canonical play/arena expansions, 51 API route
  templates, 588 dependencies, 337 components, 15 hooks, 765 CTAs, 12 dialogs,
  77 persistence files, 8 realtime files, and 25 Training-aware test files.
- All 765 CTAs have explicit wiring or intentional disabled-state evidence.
  All 315 audit-marker candidates and 342 one-reference function candidates
  have recorded dispositions; 65 dead or unwired functions were removed.
- The 752-cell route-state ledger records 236 currently unevidenced cells and
  assigns every one to its exact later implementation phase. The unassigned
  queue is zero, so the program does not infer untested states as complete.
- The complete runtime inventory opened 306 unique Training paths on desktop
  and mobile: 612/612 jobs passed with zero scanlines, overflow failures,
  broken images, page errors, or relevant console errors.
- Thirty-eight focused Training tests, TypeScript compilation, inventory
  freshness, syntax checks, Build Safety, Global Footer E2E, Supabase
  invariants, and every required protected-publication guard passed.
- The production harness now rejects expired authentication before any
  real-account assertion and rejects an unexplained 107-card drift. A fresh
  authenticated certification passed 107/107 card images, three 12-level
  campaign families, four gameplay families, Club Arena poker UI, psychology
  UI, four-answer contracts, explicit feedback, persistent manual Next, and
  zero Training page or relevant console errors.
- Production serves exact build `9bee6d20` with HTTP 200 health, a 61ms database
  probe, and no degraded checks. The approved global header was not changed.
- The broad repository Playwright workflow retains unrelated legacy failures;
  its exact results and the passing Training-specific evidence are recorded in
  the Phase 2 audit instead of being hidden or misattributed.

## Phase 2 Remaining Exit Items

None. Phase 3 begins from the published `9bee6d20` production baseline.

## Phase 4 Evidence

- Implementation PR #1065 merged as
  `932e62a503ac5e1a3f2318555ca12382682b2b00`; protected truth, provenance,
  runtime, and release-gate PR #1151 merged as
  `12720a8152472cf4868936cd52caa4fe89b281f6`.
- The authoritative truth ledger covers 107 games, 1,284 game-level cells,
  5,895 compatible cache questions, 4,244 generated questions, and 101,390
  passing truth assertions with zero failures.
- The warehouse ledger covers 516,973 rows. It separates 409,307 structurally
  reusable matrices from 107,666 replacements and explicitly records zero
  provenance-complete exact-runtime rows. River has 169,401 reusable matrices
  and 20,278 replacements; reuse never implies exact node certification.
- The protected production writer requires complete validated v2 provenance
  for new or materially changed artifacts. Historical rows remain unverified.
- The complete 192-route and 428-surface desktop/mobile Training matrices pass,
  including all 107 games, both play and arena routes, 174 Club Arena poker
  surfaces, 40 psychology surfaces, four-answer contracts, explicit verdicts,
  and persistent manual Next.
- Independently authenticated live desktop and mobile certifications pass on
  healthy descendant production build `e16e5e73`: direct login has zero
  hydration errors; the Hub has 107 cards, zero scanlines, no broken images or
  overflow; `cash-001`, `adv-011`, `quiz-gauntlet`, and `psy-001` expose the
  correct runtime UI and four answers; and feedback persists until manual Next.
- M1 and M2 remain explicitly unsafe to restart or retarget. M1 is alive but
  idle on an exhausted legacy manifest; M2 is offline on revoked credentials.
  Neither is credited with current Training-exact output.
- The approved global header was not changed.

## Phase 4 Remaining Exit Items

None. Phase 5 begins with the published Phase 4 truth and provenance baseline.

## Phase 5 Evidence

- Runtime implementation PR 1164 merged through the protected pipeline as
  `9fe70d5dc9f0d544bcab6e0ed60622e9d3bc120a`.
- The exhaustive production-build matrix passed all 107 games on mobile and
  desktop: 214 game/viewport pairs, 642 campaign/arena/lifecycle surfaces, and
  8,560 graded answer interactions with zero remaining failures.
- Every pair passed transient preload recovery, explicit Correct and Incorrect
  verdicts, persistent manual Next, completion, retry, Level 2 transition, and
  authenticated campaign-resume state.
- Production serves deployed descendant `63b33a60fb392e4fc1be10feee6d8a8677cc1446`.
  A fresh authenticated production certification passed the 107-card Hub,
  three campaign families, four gameplay families, both viewports, four-answer
  contracts, persistent feedback, signed-out login hydration, and all image,
  scanline, overflow, console, and page-error guards.
- The approved global header was not changed.

## Phase 5 Remaining Exit Items

None. Phase 6 begins with the published all-game runtime baseline.
