# Poker Near Me Phase 13 — Reliability and Operational Hardening

Date: 2026-08-30
Phase: 1 of 6 in the post-redesign hardening program

## Outcome

Phase 13 removes the remaining third-party Leaflet runtime dependency from the
Poker Road Trip Planner, establishes one local control skin for every Poker Near
Me map, raises zoom controls to the 44-pixel interaction contract, adds a
read-only production directory monitor to the canonical Open Claw scheduler,
and makes snapshot refreshes auditable and atomically staged.

No venue, authentication, permissions, Supabase, realtime, geolocation, route,
or filter behavior was changed.

## Shipped behavior

### Local map runtime

- `RoadTripPlanner.jsx` now calls the same `loadPokerMapRuntime()` used by the
  primary and lobby maps.
- Leaflet, MarkerCluster, their image assets, and the new Poker Near Me control
  skin are served from `/public/vendor/leaflet`.
- No Poker Near Me map requests Leaflet CSS or JavaScript from unpkg.
- Zoom controls are 44 by 44 pixels, keyboard-focused with a visible cyan ring,
  and disable transitions under reduced motion.

### Directory monitoring

- Open Claw runs `_internal/pnm-directory-health` hourly at minute 35.
- The monitor reads the public directory API and the exact browser snapshot a
  visitor receives. It does not mutate or refresh either source.
- Structured logs include candidate/public/snapshot counts, data revision,
  snapshot age, ID drift, projection-change state, current latency, rolling
  p50/p95 latency, warnings, and hard failures.
- Latency samples are bounded to 96 entries. Two consecutive hard failures send
  one alert; a healthy recovery clears the alert cycle and sends recovery
  confirmation.
- Hard failures cover invalid/empty data, degraded live mode, expired snapshot,
  manifest/count mismatch, and drift beyond five IDs or two percent.

### Safe snapshot workflow

- `npm run pnm:snapshot:audit` exercises the healthy production projection in
  read-only mode and prints the proposed manifest without changing files.
- `npm run pnm:snapshot:refresh` still refuses degraded or incomplete sources.
- Both checked-in outputs are fully written and byte-verified in temporary files
  before atomic rename promotion.

## Verification

- Phase 11–13 focused contracts: 13/13 pass.
- Full prebuild: 518/518 pass.
- TypeScript: pass.
- Exact production webpack path: pass, 402 static pages emitted.
- Live read-only snapshot audit: 482 candidates, 399 public venues.
- Live monitor execution: healthy, 399 public, 399 snapshot, zero ID drift,
  snapshot age under one day.
- Compiled mobile browser at 390 by 844: map returned 200, local control skin
  loaded exactly once, two 44 by 44 zoom controls, zero horizontal overflow,
  and zero unpkg Leaflet requests.

## Remaining phases

1. Phase 2 — consolidate duplicated map icon, cluster, popup, and lifecycle code.
2. Phase 3 — performance budgets, bundle attribution, and image/asset tuning.
3. Phase 4 — decompose the lobby and directory page controllers.
4. Phase 5 — visual, WebKit, assistive-technology, and state-restoration tests.
5. Phase 6 — venue anomaly automation, SEO/indexation checks, usability polish,
   unused-asset cleanup, final regression, and production closeout.
