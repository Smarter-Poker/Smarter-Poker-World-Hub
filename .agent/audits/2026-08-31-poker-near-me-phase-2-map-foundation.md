# Poker Near Me Phase 2 — Shared Map Foundation

Date: 2026-08-31

Program: Post-redesign hardening, Phase 2 of 6

Scope: Poker Near Me primary discovery map, lobby map panel, Road Trip Planner,
shared Leaflet runtime, map presentation contracts, and responsive regression
coverage

## Outcome

The three Poker Near Me Leaflet consumers now share one presentation and
lifecycle foundation. Existing routes, venue/tour inputs, geolocation, filters,
viewport search, map preferences, native directions, telemetry, and route-trip
behavior remain in place. More than 800 lines of duplicated marker, cluster,
popup, and map bootstrap code were removed.

## Families migrated

- Primary discovery map (`VenueMap`) used by the Map, Venues, Events, Live,
  Home Games, Poker Series/Tours, and global-search surfaces.
- Compact lobby map (`VenueMapPanel`) with state filtering and viewport search.
- Road Trip route map (`RoadTripPlanner`) with route polylines, venue markers,
  collapse/reopen behavior, and reload-safe drafts.

## Shared contracts

- `mapPresentation.js` owns venue/tour/user icons, density-tier clusters,
  primary and compact popup variants, type themes, safe same-origin popup
  navigation, native directions, and deterministic geography/content
  signatures.
- `mapRuntime.js` owns local Leaflet initialization, Carto tile layers,
  Smarter.Poker attribution, clustered/fallback marker layers, and idempotent
  session destruction.
- All three consumers expose `data-map-foundation="shared-v2"` so optimized
  bundle and production audits can verify migration without inspecting source.

## Defect found and closed during browser audit

Rapidly switching the lobby from Map to Search and back could remove a Leaflet
map while its 250ms zoom-transition fallback was still queued. The delayed
callback then attempted to read `_leaflet_pos` from a removed map pane. Shared
session teardown now cancels pan/fly work and settles the pinned Leaflet zoom
flag before detaching listeners and the container. The desktop and mobile
rapid-recreation regression is now permanent.

## Regression evidence

- `npm run test:pnm`: 73/73.
- Full `npm run prebuild`: 533/533.
- `npx tsc --noEmit --skipLibCheck`: pass.
- Strict focused ESLint (`no-undef`, `no-unused-vars`, hooks): zero errors.
- Exact repository webpack production build: pass, 402 static pages.
- Compiled local Phase 14 Playwright matrix: 8/8 across desktop Chromium and
  mobile Chrome.
- Browser journeys cover primary popup actions, lobby teardown/recreation,
  aborted Carto tile delivery, malformed route-trip storage, one local control
  skin, clustering, 44-pixel mobile zoom targets, and horizontal overflow.
- Visual audit at 1440x1000 and 390x844: zero page overflow; primary and lobby
  maps are ready, clustered, legible, and retain reachable controls.

## Release verification required before completion

The feature branch must merge through the repository PR/autopilot path. Final
completion also requires the merged commit on `origin/main`, a successful
production deployment, `/api/health` ancestry, and representative live desktop
and 390x844 map verification.
