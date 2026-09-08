# Training Phase 6 Of 16: Deep Re-Certification

Date: 2026-09-06 (updated 2026-09-08)
Status: Authority and solver candidate verified locally; protected publication and production re-certification in progress
Protected Main Baseline: `4314b7e8d6036490d4326a0002a4a4859774fd4d`

## Release Decision

Phase 6 required additional remediation before Phase 7. This audit compared the
Training arena against the current Club Arena source, traced question delivery
through canonical persistence and server-owned grading, exercised all 107 games,
and inspected the final mobile and desktop action and verdict captures.

Phase 7 did not begin during this work. Phase 6 remains open until this exact
candidate merges through protected checks, production serves the merged code,
and the production re-certification passes.

## Defects Found And Closed

- Training still used retained Club Arena seat coordinates and table aspect
  constants instead of the current table's 2-, 3-, 6-, and 9-player geometry.
  One pure geometry mirror now owns table bounds, seat anchors, portrait sizing,
  dealer placement, committed-chip placement, and the mobile hero reserve.
- Portrait sizing read nonexistent `width` and `height` properties from the
  geometry result. Intrinsic image dimensions could therefore control the seat
  layout. The renderer now consumes the exact `w` and `h` contract.
- Mobile 9-player hero cards overlapped the action rail, and desktop hero cards
  could overlap the action controls. The arena now reserves the current Club
  Arena phone clearance and its 60-pixel desktop hero clearance.
- The arena root used a full viewport below the unchanged global header. Action
  controls could be clipped below the physical viewport. It now owns the actual
  dynamic viewport minus the approved header height.
- Four desktop answers rendered as a 2 by 2 rail and extended below the viewport.
  Desktop uses up to four columns; mobile retains the touch-safe 2 by 2 layout.
- A top-seat action bubble could cross into the question panel. Top-seat actions
  now sit beside the portrait on the table rail, and the browser ledger rejects
  any remaining collision.
- The parity harness labeled C-Bet Academy as Flop while Level 1 can legitimately
  serve a Preflop prerequisite. It now requests and asserts the prerequisite at
  Level 1 and the authored Flop decision at Level 8.
- The parity harness contained an unreachable Flop/Turn branch and had no exact
  street contract for several representative cases. Every case now declares and
  verifies its required street and board count.
- Generated postflop questions could omit the server-owned PIO family and stack
  metadata used by `record-question`. The question rendered and graded locally,
  but the canonical recorder rejected it as expired. Generated envelopes now
  inherit only missing family and stack fields from the exact game contract.
- Postflop generation still contained a hidden six-big-blind pot fallback. It
  now fails closed when real pot geometry is absent instead of teaching an
  invented SPR or sizing.
- Question canonicalization could log a failed database write and still return
  HTTP 200. Both delivery routes now rebuild bounded PostgREST operations for a
  retry, reject invalid HTTP/2 sessions, enforce a per-attempt deadline, and
  return a stable retryable 503 before any ungradable question is served.
- The answer route could mislabel a database transport failure as an expired
  question. Canonical reads and both answer writes are now bounded and classify
  transport failure separately from a genuinely absent canonical question.
- Explicit Next could outrun the answer write. It now awaits the canonical
  answer result, refreshes a genuinely expired question only after the click,
  and stops visibly instead of consuming a new hand when persistence fails.
- A rapid second Next click could enter while the first click awaited that
  answer write. One transition latch now owns the persistence-and-advance
  sequence, so a second click cannot skip a question or bypass the write.
- The permanent gameplay E2E asserted only that a page body existed. It now
  authenticates, starts `cash-001`, verifies the Club Arena geometry anchors,
  six occupied seats, four answers, loaded portraits, persistence success,
  unmistakable feedback, and persistent manual Next on desktop and mobile.
- A local or preview E2E reused production-origin storage without transferring
  the saved Smarter.Poker auth values to the configured origin. The fixture now
  copies only the saved Smarter.Poker local-storage keys before local navigation.
- A long parity session allowed renderer and cache pressure from the first
  viewport to close the final desktop target, producing a partial receipt.
  Each viewport now runs in an isolated Chromium process while every canonical
  family still receives a fresh page.
- Completion evidence was captured while review-panel entrance motion was still
  fading in, which made a healthy page appear artificially dim. The harness now
  waits for the settled review state before recording desktop and mobile proof.
- The new exact-geometry guard passed the focused suite but was not named by a
  permanent npm or CI entrypoint. The repository reachability meta-guard caught
  the gap; the production build now runs the geometry guard on every release.
- The new authenticated Training E2E read `playwright/.auth/user.json` at module
  scope. A clean CI checkout therefore failed during test discovery before its
  declared authentication setup dependency could create the file. Saved state
  is now read inside the dependent test body, and a permanent source guard
  rejects any return to a discovery-time read.
- After that repair, the full 753-test post-merge matrix passed both Training
  journeys but exposed three unrelated timing defects in the repository test
  harness: a live Poker Near Me card locator could switch cards between its
  fallback and initials assertions, a progressively replaced map could lose
  focus immediately after the check, and a Personal Assistant focus timer could
  race its own wraparound assertion. The checks now observe one atomic fallback
  state and wait for the declared stable map and initial-focus contracts.
- The exhaustive production runtime auditor checked every CSS-visible image only
  100 milliseconds after navigation, including off-screen lazy images, and
  classified pending decodes as broken. It now waits for non-header images that
  intersect the viewport, performs one bounded read-only page replay when an
  image is still pending, records every recovery attempt, and continues to fail
  persistent load or decode errors. All 12 initially reported routes then passed
  48/48 targeted mobile and desktop surface checks with zero recovery attempts.

## Current Club Arena Contract

The pinned geometry source is protected Club Arena revision `30702e1af`.
During final review, Club Arena `origin/main` had advanced to `d6717a0ce0`, but
all three geometry source blobs were byte-identical to the pinned revision and
that revision remained in its ancestry. Training mirrors these measurable
contracts without editing or forking the global header:

- 2-, 3-, 6-, and 9-player seat rings;
- 605:960 desktop table geometry for small rings and 605:1000 for 9-player play;
- phone width bounded to 70 percent of available table height;
- portrait slots derived from table width, with current top-seat caps and hero
  scaling;
- dealer and committed-chip markers derived from the current table center,
  ellipse radii, and seat vectors;
- 50- to 68-pixel phone hero clearance and 60-pixel desktop clearance.

## Machine-Checkable Evidence

The compact all-game receipt is
`2026-09-06-training-phase-6-deep-all-game-runtime.json`. Its completed run
contains:

- 107 canonical games;
- 214 mobile and desktop game pairs;
- 642 campaign, arena, and lifecycle surface checks;
- 214 each for load recovery, correct feedback, incorrect feedback, manual Next,
  completion, retry, and level transition;
- 174 Club Arena poker surfaces and 40 psychology surfaces;
- zero failures, page errors, relevant console errors, broken images, scanlines,
  or horizontal overflow.

The compact parity receipt is
`2026-09-06-training-phase-6-deep-parity-runtime.json`. Its completed run contains
18 persisted action and verdict journeys across phone and desktop:

- `cash-001` 6-max Preflop plus the full 20-hand completion;
- `cash-002` Level 1 Preflop prerequisite and Level 8 Flop continuation bet;
- `cash-012` River;
- `cash-018` heads-up;
- `spins-001` three-player;
- `mtt-002` nine-player;
- `mtt-021` forced Turn;
- `mtt-001` Push/Fold.

Every case recorded HTTP 200 answer persistence, retained its verdict until a
manual Next click, matched the required street and board count, and passed the
seat, table, header, footer, collision, overflow, and image guards. Both
`cash-001` viewport runs reached Session Review after 20 explicit Next clicks.

## Verification Before Publication

- Focused Training, question, solver, warehouse, geometry, and Leak Finder
  contracts: 147/147 passed.
- Independent authenticated gameplay E2E: 2/2 passed in desktop Chromium and
  mobile Chrome.
- Clean Playwright collection now discovers setup, desktop, and mobile tests
  without opening the saved-state file; the post-setup gameplay run passes 2/2.
- Strict TypeScript: passed.
- Full repository lint: passed across 3,947 source and test files.
- Production build: passed with 403/403 statically generated pages.
- Personal Assistant performance budgets run by the repository build: passed.
- Final action, verdict, and settled completion captures were visually inspected
  at 390 by 844 and 1440 by 1000. No clipped controls, unreadable black-on-black
  copy, scanline, seat drift, card overlap, or ambiguous verdict remained.
- Added-line marker review found no TODO, FIXME, HACK, stub, mock, placeholder,
  Coming Soon, Not Implemented, or silent fallback.
- The approved global header has no source or style diff.

## Publication And Production Verification

- Implementation PR #1417 merged normally through protected checks as
  `d43f557036e38081c5c33393b95b841c3fcb681c`.
- Production `/api/health` served exact revision `d43f5570` with a healthy
  database after the Git-integrated deployment landed.
- The optional cross-browser global footer, World menu, and mobile performance
  workflow passed without touching the approved global header.
- The general post-merge E2E exposed the discovery-time saved-state defect
  above. Remediation PR #1418 merged normally as `82ebfa806eac5aaddb13c10cd69537332a4ab745`.
- Global E2E timing remediation PR #1419 merged normally as
  `cfa00625ea196aaddf3cfc2113e409ee5e9e3808`. Its complete post-merge Playwright
  workflow passed, production serves exact revision `cfa00625`, and the live
  database health check is green.
- Phase 6 remains open until the corrected runtime auditor merges through
  protected checks and the final full production Training browser receipts pass
  against the exact release.

## Next Phase

After the production gate passes, Phase 7 audits every setup, campaign, level
selection, lobby, resume, review, and other secondary page reachable from all
107 game cards on desktop and mobile.

## 2026-09-07 Authority And Wiring Sweep Candidate

Phase 6 remained open for a second adversarial pass before Phase 7. This
candidate removes browser-authored grading, completion, rank, reward, and
solver-evidence paths that the earlier geometry-focused certification did not
fully cover. It is not a completion receipt until protected publication and the
exact production runtime pass are recorded below.

- Training questions are delivered with a dedicated HMAC-sealed grading
  receipt, immutable snapshot identity, server-owned RNG rolls, exact attempt
  and hand ordinals, and recursively stripped answer hints. The answer route
  verifies the snapshot and receipt before deriving correctness,
  classification, position, street, spot type, and measured EV.
- Session completion, first-decision locking, question continuation, streak
  settlement, challenge state, leaderboard rows, bookmarks, weekly statistics,
  coaching summaries, recommendations, and dashboard projections now fail
  closed or use server-owned evidence. Compatibility zeroes are never promoted
  to measured solver EV or account accuracy.
- Legacy local Memory, preflop, Jarvis, analysis, opponent, report, solver-tree,
  and ranking mutations are either routed to the verified Training contract or
  explicitly retired. Reachable local-practice surfaces disclose that they do
  not create progress, rank, challenge, streak, reward, or solver evidence.
- Private Training reads are non-cacheable and vary on authorization. Database
  policies block direct authenticated access to answer keys, verified
  leaderboards, memory-score writes, and maintenance-only functions.
- Diamond settlement is serialized across reward families, idempotent across
  duplicate requests, bounded by server caps, and rolls back profile, ledger,
  platform-budget, and shadow-balance writes together.
- The follow-up session evidence projection records the explicit
  `evLossMeasured` marker, backfills only canonical server-bound answer rows,
  computes weighted count-derived accuracy, and reports actual settled reward
  totals instead of estimates.
- Runtime and CI supervisors own bounded retry, timeout, checkpoint, exact-build,
  and complete-ledger contracts. The route audit now recognizes both direct
  default exports and standards-compliant default re-exports.

Historical local candidate evidence before integration with current protected
main (superseded by the 2026-09-08 integrated evidence below):

- Phase 6 authority suite: 578/578 passed.
- Every `training-*.test.mjs` suite: 614/614 passed.
- Repository guard reachability suite: 1,152/1,152 passed.
- Cross-domain prebuild suite: 608/608 passed.
- Leak Finder and Personal Assistant integration suite: 164/164 passed.
- Disposable PostgreSQL reward, authority, and cross-RPC concurrency verifiers:
  all passed, including rollback, cap, idempotency, access-control, and
  evidence-projection assertions.
- Full lint: 4,053/4,053 source and test files passed.
- Strict TypeScript, inventory check, whitespace check, and the 94-page
  Training route/link/API audit passed with zero unresolved or unwired gaps.
- Optimized production build passed with 401 generated pages and all declared
  Personal Assistant route/function performance budgets below their caps.
- `src/components/ui/UniversalHeader.js` and `pages/_app.js` remain byte-identical
  to the candidate baseline; the approved global header has no Phase 6 diff.

Publication, production migration state, exact deployment revision, and the
final 107-game desktop/mobile runtime receipts remain pending for this
candidate. Phase 7 has not started.

## 2026-09-08 Current-Main Integration And Release Gate

Protected `main` at `4314b7e8d6036490d4326a0002a4a4859774fd4d` was merged
locally into the unpublished authority candidate, which was then recertified as
one release candidate. The integration found and closed three test defects instead of
loosening their assertions:

- The daily-authority PostgreSQL fixture could create an expiry before its
  product-date start when run shortly after midnight. Its seed now preserves
  the intended two-hour validity relative to both database time and the
  product-date boundary.
- The seat-offer regression guard still expected a direct `sendWebPush` call
  after protected main moved delivery through the unified `sendPush` adapter.
  The guard now proves the caller supplies the required TTL and the adapter
  forwards it to `sendWebPush`.
- The repository guard coupled repeated-query validation in a Horse Analytics
  route test to a live upstream response that could return 503. The test now
  validates first-selected repeated values deterministically without network
  state masking the API contract.

The merge retained protected main's new acceptance and one-device/one-banner
prebuild guards while preserving the candidate's stricter full-attempt
`batch-preload` canonical delivery contract. Solver ingestion executable mode
was restored, and the Training inventory was regenerated after main changed its
marker classification.

Current integrated local evidence:

- Phase 6 authority suite: 715/715 passed.
- Every `training-*.test.mjs` suite: 754/754 passed.
- Repository guard and reachability suite: 1,370/1,370 passed.
- Cross-domain prebuild suite: 687/687 passed.
- Leak Finder and Personal Assistant integration suite: 181/181 passed.
- Focused solver ingestion and policy suite: 84/84 passed.
- Full lint: 4,192/4,192 source and test files passed.
- Strict TypeScript, whitespace, inventory generation/verification, and the
  94-page Training route/link/API audit passed. The generated inventory records
  107 canonical games, 214 play/arena expansions, 54 API templates, and zero
  unassigned route-state or CTA wiring gaps.
- The complete disposable PostgreSQL Phase 6 gate passed reward concurrency,
  server authority, cross-RPC concurrency, cache replay, and solver-catalog
  admission. Its authority evidence includes 14 reward invariants, 18 canonical
  attempts, 13 completions, and 54 immutable first decisions with the expected
  access-control, write-protection, rollback, cap, idempotency, and key-binding
  assertions.
- The optimized production build passed and generated 395/395 pages. Every
  declared Personal Assistant route, client, and server performance budget
  remained below its cap.
- `src/components/ui/UniversalHeader.js`, `pages/_app.js`, the header-rendered
  hamburger labels, and the command-menu navigation registry match the
  protected-main baseline. The approved global header remains untouched.

The solver admission manifest covers all 107 games and 25 required
family/stack contracts, but remains deliberately `CLOSED` and unapproved for
M1/M2 activation. No solver host was restarted or retargeted. The separate
`strategy_matrix_v2` backfill remains blocked by its production disk-headroom
gate and was not run.

Delivery authority uses a two-protected-PR expand/contract release. The strict
enforcement migration and its verifier are excluded from PR A. PR B may not be
opened until PR A merges normally, the exact dual-write build serves
production, real attempt-scoped delivery evidence and private attestation are
verified, predecessor rollback compatibility passes, and the full production
browser receipts are healthy. After PR B merges normally, production must serve
its exact merge or a reviewed descendant; fresh delivery, reissue, response-loss
replay, next-street, and strict positive/negative probes must pass before the
complete 107-game desktop/mobile production receipt can close the phase. Phase 6
therefore remains open and Phase 7 has not started.
