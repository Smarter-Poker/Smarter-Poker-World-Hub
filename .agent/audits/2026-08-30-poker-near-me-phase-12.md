# Poker Near Me Phase 12 — Directory Parity, Progressive Hydration, and Regional Discovery

Date: 2026-08-30
Branch: `agent/codex-pnm12/feat/pnm-phase12-parity-performance`

## Why this phase

Phase 11 made public directory reads resilient, but the checked-in fallback was a
rich legacy export rather than an exact public projection. Its active/location
state had drifted from production and it carried no enforceable generation date
or revision. Discovery also requested the entire public directory again after SSR,
and the location family still reused one national hero for every state and city.

This phase turns the fallback into a reproducible production-derived artifact,
loads the live directory progressively, exposes honest data age/revision signals,
and gives regional location routes purpose-built fictional navigation artwork.

## Current route coverage

The 2026-08-30 production projection contains 399 public, integrity-eligible venues
across 40 states and 302 state/city pairs. The shared system therefore covers:

- 11 canonical dynamic discovery routes (`venues`, `map`, `saved`, `live-games`,
  `tours`, `series`, `daily-tournaments`, `events-calendar`, `more`, `roadtrip`,
  and `alerts`).
- One national location index, 40 current state routes, and 302 current city routes.
- The cinematic lobby and the public `view=directory` API.

That is 354 current directory-driven page URLs, plus the lobby. All 342 state/city
routes inherit the regional visual resolver; the national index retains its
national discovery artwork.

## Shipped behavior

### Exact public snapshot and parity gates

- Added byte-identical server and browser snapshots at
  `data/poker-venue-directory-snapshot.json` and
  `public/data/poker-venue-directory-snapshot.json`.
- The snapshot is generated only from a healthy production `view=directory`
  response. Refresh refuses degraded data, missing identities, or missing location
  integrity.
- Manifest metadata includes schema version, generation time, source deployment,
  source candidate count, public count, projection SHA-256, data revision, and
  newest source time.
- Prebuild now fails if either copy differs, its manifest does not match the
  projected payload, or it is older than 30 days.
- Optional live parity fails when ID drift exceeds five rows or two percent.
- Current evidence: 399 live IDs, 399 snapshot IDs, zero differing IDs; projection
  hash begins `b48f6140abbc`.

### Progressive directory performance and resilience

- Client hydration now requests 160-row pages and yields subsequent pages through
  `requestIdleCallback` (bounded timer fallback), instead of issuing another
  nationwide 1,000-row request immediately after SSR.
- Pages merge by venue ID, render partial results immediately, and abort safely on
  unmount.
- An interrupted later page preserves already loaded live results and exposes a
  `partial_live` recovery state instead of blanking the map/list.
- The versioned one-hour browser cache now stores the venue projection, revision,
  and snapshot metadata. Static fallback downloads the dedicated public projection,
  not the rich legacy export.
- The rich venue request is skipped during normal hydration when SSR already
  supplied an initial directory.
- Unexpected false-empty live projections fall back only when the published
  snapshot has matching rows. Genuinely empty filters remain empty.

### Provenance, freshness, SEO, and observability

- API responses expose `X-PNM-Data-Revision` and, in snapshot mode,
  `X-PNM-Snapshot-Generated-At`.
- Discovery and location routes show the published snapshot date rather than
  labeling fallback data as checked during the current request.
- Location structured data uses the source timestamp as `dateModified`.
- Location cards show source-backed update dates and only use “Location verified”
  when location integrity actually says verified. Generic “verified profile” copy
  was removed.
- Analytics now accepts bounded revision, candidate count, snapshot age, and
  completion state. Interrupted progressive loads emit a separate event.
- Open Graph/Twitter fallbacks moved from `_document` into deduplicated `next/head`
  ownership, so regional routes publish exactly one route-specific social image.

### Regional #SmarterCasinoRealism system

Four 1672×941 WebP navigation scenes were generated with the built-in image
generation tool, then optimized into the repository:

- Pacific — `location-pacific-command-v1.webp`
- Southwest — `location-southwest-command-v1.webp`
- Heartland — `location-heartland-command-v1.webp`
- Atlantic — `location-atlantic-command-v1.webp`

Prompt contract for every image: fictional regional poker discovery machinery;
black-first casino environment; photorealistic materials; restrained electric-blue
energy; thin chrome/gunmetal framing; no people, logos, text, maps presented as
geographically exact, or identifiable real-world venue. Accessible labels explicitly
call the images fictional discovery-console artwork.

### Accessibility and responsive behavior

- Desktop and mobile automated coverage includes serious/critical WCAG A/AA Axe
  scans on representative location content.
- Exact 390×844 and 200% zoom checks retain zero horizontal overflow.
- The lobby tutorial close/dismiss/next controls retain at least a 44px effective
  target even during the 0.95-scale entrance animation.
- Keyboard skip-link order is tested in desktop Chromium; touch-emulated mobile
  separately validates landmarks and target geometry.

## CI blocker repaired

The Phase 11 base PR was repeatedly blocked by Supabase's transient
`PGRST303: JWT issued at future` response. The shared dependency-free CI fetcher
now retries only that exact clock-skew body. Other 401/PGRST303 authentication
failures still fail immediately. The minimal fix was pushed directly to the Phase
11 PR branch before this larger phase continued. Phase 12 CI then demonstrated
that three full schema timeouts could consume the original four-minute wall-clock
budget before a fifth recovery attempt. The bounded total budget is now six minutes,
still below the seven-attempt theoretical maximum and within the 20-minute job cap.

## Verification record

- Focused Phase 8–12 Node contracts: 18/18 green.
- Snapshot local and live parity: 399/399, zero ID drift.
- TypeScript: green.
- Desktop Chromium and mobile Chrome Phase 11–12 journeys cover progressive
  hydration, interrupted-page recovery, snapshot mode, regional art, Open Graph,
  Axe, keyboard skip navigation, 390×844, 200% zoom, touch targets, and overflow.
- Compiled-production Phase 11–12 matrix: 12/12 green. The map recovery journey
  additionally requires a visible Leaflet container and rejects Leaflet runtime
  console errors on desktop and mobile.
- Clean-cache browser rendering verified California snapshot recovery, 49 cards,
  route-specific Pacific art, accurate Aug 30 freshness, and zero console errors.
- Repository prebuild: 514/514 green.
- Exact required production build (`prune-platform-bins`, `patch-next`, and
  `next build --webpack`): green, with 402 static pages emitted.
- Publication is not considered complete until the production-artifact browser
  matrix, PR merge, Vercel promotion, and live route checks finish.

## Deliberate non-changes

- No Supabase mutation, migration, permissions, claims, reviews, map/geolocation,
  realtime, or authentication behavior was relaxed.
- No dynamic value is baked into generated artwork.
- No real venue image is represented by the fictional regional scenes.
- The rich `all-venues.json` export remains available to legacy rich-detail paths;
  it is no longer allowed to impersonate the exact public directory fallback.
