# Personal Assistant Phase 7 Of 8: Coaching And Evidence

## Outcome

Phase 7 turns persisted Club Arena audit evidence into an owner-private coaching workspace without changing solver truth. The Leak Finder now has Coach, Evidence, Timeline, Goals, And Report views, with every recommendation tied to the deterministic decision and corrective-review records already produced by the engine.

## Delivered

- Added a deterministic coaching-intelligence layer for decision coverage, confidence reasons, ranked priorities, progress timelines, session debriefs, weekly plans, and reproducible receipts.
- Added an authenticated coaching API that reads only the signed-in owner's leaks, audited decisions, review schedule, goals, feedback, preferences, and latest completed audit.
- Added durable owner-private goals, feedback, and saved-view preferences with forced RLS, owner reads, service-owned writes, bounded validation, indexes, assertions, and rollback instructions.
- Added a mobile-first casino command workspace with loading, empty, error, retry, saved-view, search, feedback, goal, alert, progress, report, and responsive desktop states.
- Added exact-hand continuity: when a persisted example exists, the Evidence view hydrates its real cards, board, street, and pot into the existing Virtual Sandbox handoff. Missing evidence remains explicit and falls back only to a leak-targeted practice setup.
- Added source-to-training traceability from Club Arena hand through normalized decision, solver match, deterministic grade, leak group, and corrective review.
- Added the coaching API and all three new RLS tables to the read-only production watchdog.
- Added permanent logic, security, wiring, accessibility, desktop, mobile, Chromium, and WebKit regression coverage.

## Evidence Boundaries

- Confidence is a displayed deterministic score with visible evidence, sample, repetition, and provenance reasons. It is not an invented solver probability.
- Unverified and unpriced decisions remain explicitly unpriced.
- Corrective review mastery does not mark a real-play leak resolved; fresh Club Arena evidence is still required.
- The browser never supplies an account ID to the coaching API and never writes directly to the coaching tables.
- Foreign-owner and anonymous reads are probed by the production watchdog.

## Verification Before Publication

- `npm run test:leak-engine`: 173/173 passed.
- Exact production Next.js build: passed with 403 static pages and no Phase 7 compile warning.
- Personal Assistant performance budgets: all three route bundles and both server functions passed; Leak Finder retained 94,056 gzip bytes of budget headroom.
- Phase 7 desktop and mobile journey: passed in Chromium, mobile Chrome, desktop WebKit, and iPhone WebKit.
- Accessibility journey: zero unnamed controls, undersized controls, missing image alternatives, duplicate IDs, horizontal overflow, application errors, or runtime error screens.
- Production schema inspection: all three coaching tables have RLS enabled, forced RLS, and exactly two policies each.
- Supabase security advisor: no Phase 7 table finding.
- Supabase performance advisor: only the expected informational notices that the two brand-new indexes have not yet accumulated query usage.

## Publication Evidence

- Pull request #1421 squash-merged the Phase 7 workspace as `f047f89a30adf6bc366ef231440016d478c44afc`.
- Production health reported exact revision `f047f89a` with database status healthy.
- The authenticated production watchdog passed all four public routes, sixteen bounded requests at concurrency four with 283 ms p95, all thirteen protected API reads, and all seven owner-isolation probes.
- Live authenticated desktop and 390-pixel mobile rendering exposed all five coaching views with zero horizontal overflow and zero undersized controls.
- The first live dual-viewport inspection correctly caught that request time made receipt hashes differ. The receipt input now excludes presentation time and is permanently tested across distinct generation timestamps; evidence and engine version changes still produce a new receipt.

- Pull request #1426 squash-merged the receipt-stability correction as `70b8b96ee777aee3672e7face0b62b9ae306d6b3`; production health reported exact revision `70b8b96e`, and consecutive authenticated API calls plus desktop and mobile reloads returned the same receipt.

## Deep Recertification Findings

The pre-Phase 8 audit found additional Phase 7 gaps and closes them in the recertification change set:

- Receipt identity now binds the exact leak, decision, review, rejection, and engine-version evidence set. Row order and presentation time cannot change the receipt, while changed decision evidence must change it. The receipt uses a sixteen-character dual-direction fingerprint instead of the original eight-character aggregate hash.
- Club Arena decision rows now carry their explicit evidence scope, and the Evidence view reconstructs the same deterministic solver group key as Leak Finder even when a separate example-hand link is unavailable.
- Goal dates are validated as real calendar dates, stored at the end of the selected UTC day, and rendered in UTC so a date cannot appear one day early in U.S. time zones.
- Stored analysis depth is now a real Guided, Detailed, or Expert presentation control. Expert mode exposes evidence and engine provenance. Goals now support complete, pause, resume, and owner-scoped removal actions.
- Invalid supplied leak identifiers fail validation instead of silently detaching a goal from its evidence.
- The legacy Leak Finder search placeholder now follows the required Title Case copy policy.
- WebKit receives an explicit 44-pixel analysis-depth control after cross-browser testing proved that Safari ignores the original select `min-height`.

The recertification change set is not considered complete until its focused tests, complete Personal Assistant suite, lint, production build, four-browser journey, authenticated mutation round trip, RLS probes, merge pipeline, and exact production revision check all pass.
