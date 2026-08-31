# Poker Near Me Phase 3 of 6 — Secondary Interaction Foundation

Date: 2026-08-31

## Outcome

Phase 3 hardens the secondary Poker Near Me surfaces that sit beyond the primary discovery and map routes. The release establishes one semantic page contract, one accessible interaction floor, and one resilient venue-identity path without changing route handlers, data APIs, Supabase/realtime behavior, maps, filters, forms, permissions, or navigation destinations.

## Production defects closed

- The representative venue detail route did not expose a semantic `main` landmark.
- A failed remote venue logo was hidden in-place, leaving a blank identity position.
- Shared family navigation links measured 36 pixels high.
- Secondary tabs and venue actions measured 37–39 pixels high, while some saved-card actions measured 29–36 pixels.
- These local defaults made the same discovery system feel mechanically inconsistent between desktop and mobile deep links.

## Shared system delivered

| Contract | Implementation |
|---|---|
| Semantic surface ownership | Eight secondary page families expose exactly one `main[data-pnm-secondary-foundation="interaction-v1"]` contract. |
| Resilient venue identity | Venue profiles reuse `PokerIdentityMark`; failed or absent remote artwork resolves to the deterministic illuminated monogram rather than disappearing. |
| Accessible interaction floor | Family navigation, tabs, selectors, date controls, action buttons, favorites, map preferences, and recenter controls receive a 44-pixel minimum target while retaining the compact machined-instrument presentation. |
| Visual continuity | Existing Void, Graphite, Raised Steel, Electric Blue, Chrome, Gold, Rajdhani, and Inter tokens remain the only Phase 3 visual language. No generic glass, arcade gradient, or SaaS-card layer was introduced. |

## Page families upgraded

1. Venue detail (`/hub/venues/[id]`)
2. Home Games directory (`/hub/home-games`)
3. Home Games near-me results (`/hub/home-games/near-me`)
4. Home Game detail (`/hub/home-games/[slug]`)
5. Poker Series directory (`/hub/poker-series`)
6. Series detail (`/hub/series/[id]`)
7. Events calendar (`/hub/events-calendar`)
8. Tour detail (`/hub/tours/[code]`)

The family-navigation interaction contract also propagates through all 354 current directory-driven URLs (11 discovery routes, one national route, 40 state routes, and 302 city routes). Venue, home-game, series, and tour detail URL counts remain data-driven; every instance inherits from the eight route-family implementations above.

## Permanent regression coverage

- `__tests__/poker-near-me-phase-15.test.mjs` locks semantic landmarks, the shared identity fallback, the 44-pixel interaction floor, icon geometry, and focus-visible behavior.
- `e2e/013-poker-near-me-phase-15.spec.ts` exercises a real venue detail with hostile remote-image failure, four representative secondary directories, and exact 390×844 map controls.
- The Phase 15 source contract is included in both `npm run test:pnm` and repository `prebuild`.

## Verification

- Focused Poker Near Me contracts: 77/77 passed.
- Phase 15 Chromium and mobile Chrome journeys: 6/6 passed against the local application.
- TypeScript: passed.
- `git diff --check`: passed.
- Full prebuild: 538/538 passed.
- Exact webpack production build: passed; 402/402 static pages generated.
- Compiled-production browser verification: 6/6 passed in desktop Chromium and mobile Chrome.
- PR #1103: squash auto-merged as `383910e7aed3a8db0cdcd3a580b494f3ea89cb44`.
- Production deployment: Vercel deployment `GZBGoKLAekJxtdWqR9VET6iDN6NX` completed at main head `4bd00ffbb5055d25792304ef5a2061efc546dc92`; the Phase 3 merge is confirmed in its ancestry and `/api/health` reported version `4bd00ffb`.
- Live production: six representative routes returned HTTP 200 and all 6/6 Phase 15 Chromium/mobile Chrome journeys passed against `https://smarter.poker`.
- Live visual audit: desktop venue detail exposed one semantic main, 44-pixel family/actions, deterministic fallback identity, zero broken images, and zero overflow; exact 390×844 map exposed its map/tablist, 44-pixel tabs/filters, and zero overflow.

The installed ESLint 9 runtime cannot load the repository's legacy `.eslintrc.json` and exits in the configuration loader with a circular-JSON error before examining a source file. This is an existing repository tooling incompatibility; TypeScript, source contracts, prebuild, and the production compiler all passed.

## Scope preserved

No API shape, route destination, data query, realtime subscription, map/geolocation implementation, filter semantics, form submission, permission boundary, or mutation path was replaced. This phase is deliberately the secondary interaction/media foundation; deeper content-density and editorial enhancement work belongs to Phases 4–6.
