# Training Complete Audit And Upgrade Program

Date: 2026-08-30
Owner: Codex Training Program
Status: Phase 1 In Progress

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

### Phase 6: Club Arena One-To-One Gameplay Parity

Lock table geometry, avatars, hero cards, seats, dealer and blind markers, pot,
community cards, HUD, action rail, feedback layers, and responsive states to the
Club Arena reference. Add pixel baselines for idle, preflop, flop, turn, river,
action, verdict, all-in, and completion states.

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
  client catalog. The candidate fix applies an eight-second fail-open deadline
  to both game and progress enrichment, retains the real 12-level fallback,
  and adds a production smoke harness plus a focused regression contract.
- The corrected candidate passes 45 focused tests, TypeScript compilation, and
  the complete 428-surface mobile/desktop matrix with zero failures. Its
  protected merge, deployment stamp, and repeat production smoke are still
  required before Phase 1 can close.
- Repository instructions reference `.memory/WORKING-RULES.md` and
  `.memory/REALIGN-PROTOCOL.md`, but neither file exists in this worktree. The
  current playbook, binding rules, operations guide, and audit history were used
  as the authoritative fallback.

## Phase 1 Remaining Exit Items

- Publish the deadline fix and production smoke harness through the protected
  pull-request pipeline without bypass.
- Confirm production serves the final merge commit.
- Repeat signed-out login, real authenticated mobile/desktop campaigns,
  gameplay, feedback, card-image, scanline, overflow, and console checks against
  that exact production deployment.
- Mark Phase 1 complete only after all four items above pass.
