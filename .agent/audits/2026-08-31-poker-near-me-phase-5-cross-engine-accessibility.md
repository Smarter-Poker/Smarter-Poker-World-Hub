# Poker Near Me Phase 5 — Cross-Engine Navigation + Accessibility

Date: 2026-08-31

## Scope

Phase 5 hardens the existing #SmarterCasinoRealism Poker Near Me system across browser engines, browser history, assistive technology, increased-contrast modes, forced colors, reduced motion, and the exact 390×844 mobile viewport. It deliberately preserves the established handlers, APIs, Supabase/realtime ownership, maps, filters, forms, permissions, and route templates.

## Delivered

- User-driven discovery changes now create real history entries while debounced search/filter synchronization replaces only the current entry.
- Browser Back and Forward re-absorb canonical route state for primary tabs, Events sub-tabs, More sub-tabs, live state, query text, and venue type without remounting the discovery application.
- A page-exit guard prevents a stale debounced URL writer from pulling a full navigation back into discovery.
- A polite route live region announces same-document surface changes and history restoration.
- Safari/WebKit receives explicit mask prefixes and a repaired tab-rail hit-test layer.
- Increased contrast and Windows forced-colors modes preserve borders, selected state, focus state, text, and hierarchy without depending on imagery, transparency, or glow.
- The permanent Playwright matrix now includes dedicated desktop Safari and iPhone/WebKit projects for the Phase 17 cross-engine contract.

## Inherited coverage

- 12 canonical discovery destinations inherit the navigation and accessibility controller.
- 12 representative source families are guarded: lobby, discovery, location index, state, city, venue detail, home-game directory, home-game near-me, poker-series directory, events calendar, series detail, and tour detail.
- All data-driven venue, location, home-game, series, and tour instances continue to inherit their existing shared templates; no route or data layer was forked.

## Verification before preview

- `npm run test:pnm`: 89/89 passed.
- `npm run prebuild`: 553/553 passed.
- Phase 16 + 17 compiled Chromium desktop/mobile: 14/14 passed.
- Exact required webpack build passed and generated 403 static pages.
- Desktop and exact 390×844 checks found no horizontal overflow on the representative discovery/location/detail/event families.
- Repository ESLint remains blocked before source evaluation by the pre-existing ESLint 9 flat-config/circular legacy-config conflict. The focused contracts, complete prebuild suite, compiled browser journeys, and production build provide the release gates for this phase.

## Publication gate

The implementation is eligible for merge only after the Vercel preview passes the dedicated desktop and mobile WebKit contract with the deployment's configured Supabase environment. Production publication then requires healthy deployment status, representative HTTP probes, live desktop/mobile browser journeys, visual inspection, and history restoration on the public origin.

