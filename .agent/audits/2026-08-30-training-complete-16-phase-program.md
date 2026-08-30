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
- Phase 5 is represented by PR 1019 at commit
  `b116c50f17bf8a1a6ea49ca969fbd93a2f9450f8`.
- Scanline removal PR 1021 merged as
  `54f5b4a39874509e06010d2f0527849a9563dee5`.
- Production served `54f5b4a3` during the Phase 1 probe.
- Live mobile Training probe: HTTP 200, 107 cards, zero scanline elements,
  zero horizontal overflow, unchanged header present, and zero page errors.
- The Phase 5 merge was simulated against current `main`; it merged cleanly,
  retained the Phase 5 question and hydration code, and contained zero
  scanline code.
- The exact simulated post-merge tree passed 39 focused tests with zero
  failures. Coverage included auth routing, the visual scanline contract,
  authored question integrity, four-choice legality, action chronology,
  manual Next, Club Arena routing, offline packs, analytics honesty, and
  fail-closed persistence.
- A direct production visit to `/auth/login?next=/hub/training` reproduced
  React hydration errors 425, 418, and 423 on both mobile and desktop. The
  protected Training game routes redirected to login without overflow or
  page errors. This confirms that the Phase 5 hydration fix is still required
  in production and cannot be certified before PR 1019 deploys.
- The failed Phase 5 Build Safety Gate was a Supabase transport error:
  `PGRST303 JWT issued at future` after seven attempts. The failed workflow was
  re-run after production database health recovered.
- On the re-run, all 14 diamond economy assertions passed. The same job then
  received an upstream HTTP 504 and `PGRST303 JWT issued at future` while
  executing the merchandise assertions. The workflow again classified this as
  a transport failure rather than a failed product invariant.
- Repository instructions reference `.memory/WORKING-RULES.md` and
  `.memory/REALIGN-PROTOCOL.md`, but neither file exists in this worktree. The
  current playbook, binding rules, operations guide, and audit history were used
  as the authoritative fallback.

## Phase 1 Remaining Exit Items

- Confirm the re-run Build Safety Gate result.
- Confirm the Phase 5 E2E workflow reaches a terminal result and investigate
  any genuine product or harness failure.
- Confirm PR 1019 merges through Autopilot without bypass.
- Confirm production serves the merged Phase 5 content and the latest `main`
  commit relevant to the release.
- Re-run representative authenticated and unauthenticated Training paths in
  production and attach the final Phase 1 results.
