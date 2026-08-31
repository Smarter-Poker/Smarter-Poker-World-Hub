# Poker Near Me Phase 1 Closeout — Adversarial Audit and Release Repair

Date: 2026-08-31

Program: Post-redesign hardening, Phase 1 of 6

Scope: Poker Near Me route family, shared maps, Road Trip Planner, directory snapshot operations, Open Claw monitoring, and release evidence

## Outcome

The previous Phase 13 release was present in production, but it was not eligible
for a complete closeout. Independent frontend, operations, and test/publishing
reviews found functional and operational defects that earlier summaries had
missed. This repair pass closes those findings without changing venue-write,
Supabase, realtime, permission, geolocation, filter, or navigation contracts.

## Findings closed

### Discovery and Road Trip Planner

- Replaced the invalid boolean map color passed by Events Calendar with a valid
  color and hardened the map to accept only a color string.
- Moved all Leaflet zoom styling into the shared, Poker Near Me-scoped control
  stylesheet. The skin no longer leaks into unrelated Leaflet surfaces and is
  no longer duplicated inside `VenueMap`.
- Added visible retry recovery to every shared map and to the route map. A
  failed dynamic import no longer leaves an endless loading state.
- Replaced sampled corridor checks with point-to-leg distance checks and
  distance-aware route interpolation.
- Added strict complete/ordered travel-date validation. Route results no longer
  match partial or reversed ranges.
- Limited series to venues along the calculated route instead of showing every
  series inside the selected dates.
- Preserved origin, destination, waypoints, corridor, and dates across reloads
  and shared links. Share links always resolve to the canonical lobby planner.
- Recomputed map dimensions and bounds after a collapsed mobile map is reopened.
- Added labels, radio semantics, disclosure state, status/alert semantics,
  visible keyboard focus, reduced-motion overrides, and 44-pixel touch targets.
- Expanded marker/popup cache signatures so changed rendered venue fields cannot
  leave stale popups behind.
- Added truthful empty states for route venues and dated schedule results.
- Made the feature gate a focus-managed, Escape-dismissable dialog whose option
  controls work with both keyboard and pointer input.

### Directory snapshot integrity

- Removed the silent 1,000-row ceiling by paging the complete public directory
  and rejecting revision/count changes, missing IDs, and duplicate IDs.
- Added request timeouts and schema-v2 exact plus material-content hashes.
- Added future-date rejection and recomputation of hashes from the actual
  snapshot payload; manifests are no longer trusted as their own proof.
- Split the non-mutating preview command from the real local/live audit command.
- Added a process lock covering fetch through promotion, fsynced staging, pair
  rollback, interrupted-promotion recovery, and concurrent-writer refusal.
- Refreshed both checked-in snapshots from the live, non-degraded source: 482
  source candidates, 399 public venues, and zero ID drift.

### Open Claw and release operations

- Invalid optional monitor thresholds now fail safely to bounded defaults rather
  than crashing the scheduler at import time.
- SMS alert state is set only after a successful Twilio send, so failed alerts
  remain retryable. The administrator phone number is environment-only.
- Added the existing Twilio and administrator values to GitHub Actions secrets;
  no secret values are committed or printed.
- Corrected the deploy workflow's SSH user, preserved legacy environment keys,
  deployed the repository-owned unit and dispatcher, ran the unit as the
  unprivileged `openclaw` user, and added live unit/file/hash verification.
- The hourly monitor now reads every directory page and independently verifies
  exact and material snapshot hashes, duplicates, timestamps, and counts.
- CI no longer retains duplicate videos and traces for broad failures. Compact
  screenshots, error context, HTML index, and server logs are retained for
  three days instead of multi-gigabyte duplicate artifact trees.

## Regression coverage

- `npm run test:pnm`: 66/66.
- Full prebuild contracts: 524/524.
- TypeScript `--noEmit`: pass.
- Python compile and invalid-environment scheduler load: pass.
- Workflow YAML parse: pass.
- Exact Next.js production webpack build: pass, 402 static pages generated.
- Existing production representative PNM browser matrix: 19/19.
- Compiled local Phase 13 browser closeout: desktop Chromium and 390x844 mobile
  Chrome cover local map assets, one control skin, 44-pixel controls, draft
  restoration, route calculation, date validation, map collapse/reopen, and
  horizontal overflow.

## Release verification required before marking complete

The branch must merge through the repository PR/autopilot path. Completion also
requires the merged commit on `origin/main`, a successful Vercel production
deployment, a successful Open Claw deployment, `/api/health`, the live snapshot
audit, and the Phase 13 browser closeout against production. Those identifiers
are recorded in the PR and final task summary after promotion.
