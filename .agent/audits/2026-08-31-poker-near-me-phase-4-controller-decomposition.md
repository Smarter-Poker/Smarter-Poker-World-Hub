# Poker Near Me Phase 4 — Controller Decomposition and Release Audit

Date: 2026-08-31

## Outcome

Phase 4 moves route, filter, persistence, gesture, dialog, sharing, analytics, and recovery ownership out of the two oversized Poker Near Me page components into reusable controller boundaries. The lobby and all 11 canonical discovery tabs retain their existing routes, APIs, Supabase/realtime flows, map/geolocation behavior, filters, forms, permissions, navigation, and responsive output while becoming easier to test and change safely.

The phase also closed defects found during the required adversarial recertification: the lobby's modal panel now renders above the fixed global header, map teardown/recreation uses the supported deep-link contract, remote-media fallback tests tolerate React rerenders, keyboard skip navigation reflects retained header focus, credential-dependent journeys skip only when their required local credentials are absent, and the exact `/commander` root rewrite no longer loops between trailing-slash redirects.

## Inherited Route Families

The new controller system directly powers 12 routes:

- `/hub/poker-near-me/lobby`
- `/hub/poker-near-me/venues`
- `/hub/poker-near-me/nearnow`
- `/hub/poker-near-me/homegames`
- `/hub/poker-near-me/live`
- `/hub/poker-near-me/map`
- `/hub/poker-near-me/tours`
- `/hub/poker-near-me/calendar`
- `/hub/poker-near-me/daily`
- `/hub/poker-near-me/series`
- `/hub/poker-near-me/roadtrip`
- `/hub/poker-near-me/favorites`

Alias and legacy deep links continue to resolve through the same canonical route controller. The broader directory/location system remains at 354 current URLs from prior phases and was regression-tested, but it is not counted as a direct controller-decomposition target.

## Shared Ownership Added

| Boundary | Ownership |
|---|---|
| `lobbyController.js` | Lobby graph, cache/batch limits, voice-filter normalization, GPS persistence, feature metadata, and crawlable structured data. |
| `discoveryController.js` | Canonical tabs and aliases, URL construction, deep-link restoration, safe storage, analytics bounds, date helpers, and game/stakes predicates. |
| `ControllerRecovery.jsx` | Shared tab/pod error boundaries and live-favorite recovery toast. |
| `useLobbyInteractionController.js` | Dialog focus trap, Escape/restore behavior, and share/clipboard lifecycle. |
| `useDiscoveryGestureController.js` | Scroll-aware swipe navigation and pull-to-refresh semantics. |

The lobby controller shrank from 3,967 to 3,728 lines and the discovery controller from 4,741 to 4,144 lines: 836 page-level lines were removed while behavior moved into named shared modules.

## Defects and Gaps Closed

- Raised the `aria-modal` lobby panel over the global header so Back/Close controls are physically clickable on desktop and mobile.
- Added an exact `/commander` Vercel root rewrite before the nested catchall, preventing the apex trailing-slash redirect loop while preserving `/commander/:path*` and `/api/commander/:path*`.
- Corrected map teardown coverage to remount the deep-link-only inline panel through its supported URL instead of clicking hidden UI behind a modal.
- Stabilized the remote venue-image failure check across asynchronous React rerenders.
- Corrected keyboard skip-link traversal for browsers that preserve focus in the fixed header.
- Made authenticated admin and Pro road-trip journeys explicitly credential-aware locally without reducing credentialed CI coverage.
- Aligned local Leaflet-style detection with both `localhost` and `127.0.0.1`, and recalibrated the stable two-pixel screenshot rasterization tolerance.

## Permanent Verification

- Poker Near Me controller/unit contracts: 85/85 passed, including eight new Phase 16 contracts.
- Fresh compiled-production representative matrix: 38 non-map-recreation checks passed; the isolated corrected Phase 14 matrix then passed 8/8 on Chromium and 390x844 mobile Chrome.
- TypeScript: passed with `npx tsc --noEmit`.
- Source hygiene: `git diff --check` passed and `vercel.json` parsed successfully.
- Exact Next.js webpack production build: passed with 403 generated static pages.
- Repository prebuild, protected merge, production deployment, health, redirect, and live browser evidence are recorded in the release closeout below.

## Release Closeout

Pending protected PR merge and production verification. This section must be replaced with the merged revision, Vercel deployment, health result, `/commander` redirect proof, and live Phase 14/16 browser counts before the phase is declared complete.

## Next Phase

Phase 5 of 6 should complete cross-engine visual/accessibility hardening: WebKit behavior, assistive-technology semantics beyond source contracts, state restoration across back/forward navigation, reduced-motion and high-contrast behavior, and representative visual comparisons across the inherited secondary route families.
