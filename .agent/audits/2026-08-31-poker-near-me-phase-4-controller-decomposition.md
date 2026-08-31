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

Phase 4 is published and production-verified:

- Protected PR [#1126](https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/1126) auto-merged as `638889cce3cebb7020dd87247ba175425190b3c9` after the required repository gates passed.
- Vercel production deployment `dpl_H6vmPtys6n1NP6k5cCrr9f1Se3GA` reached `READY` and promoted to `smarter.poker`.
- `/api/health` returned HTTP 200, exact version `638889cc`, and database status `ok`; `/api/health/header` also returned HTTP 200 and `ok`.
- Lobby, venues, map, road-trip, and series representative routes each returned HTTP 200 from the production alias.
- `/commander` and `/commander/login` both returned HTTP 200 with zero redirects, proving the former root loop is closed without breaking the nested app.
- Live Phase 14 and Phase 16 Playwright coverage passed 14/14 across desktop Chromium and 390x844-equivalent mobile Chrome.
- Live visual inspection covered a 1440x1000 lobby and 390x844 map/discovery surface. The mobile document measured exactly 390 CSS pixels with zero horizontal overflow, and the shared map runtime reported `data-map-ready="true"`.

No Phase 4 implementation, release, or production-verification blocker remains.

## Next Phase

Phase 5 of 6 should complete cross-engine visual/accessibility hardening: WebKit behavior, assistive-technology semantics beyond source contracts, state restoration across back/forward navigation, reduced-motion and high-contrast behavior, and representative visual comparisons across the inherited secondary route families.
