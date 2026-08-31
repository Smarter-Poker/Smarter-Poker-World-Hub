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
- The 390×844 global-menu trigger now draws its keyboard ring entirely inside the scaled header frame, eliminating the clipped corner stroke caused by the platform 44-pixel target extending below the artwork.
- Poker Near Me command selectors use a dedicated restrained-blue palette, one continuous one-pixel frame, contained focus geometry, and no intersecting decorative edge fragment.

## Inherited coverage

- 12 canonical discovery destinations inherit the navigation and accessibility controller.
- 12 representative source families are guarded: lobby, discovery, location index, state, city, venue detail, home-game directory, home-game near-me, poker-series directory, events calendar, series detail, and tour detail.
- All data-driven venue, location, home-game, series, and tour instances continue to inherit their existing shared templates; no route or data layer was forked.

## Verification before preview

- `npm run test:pnm`: 90/90 passed.
- `npm run prebuild`: 554/554 passed.
- Phase 16 + 17 compiled Chromium desktop/mobile: 14/14 passed.
- Compiled Phase 17 four-engine closeout matrix: 18/18 applicable checks passed across Chromium, mobile Chrome, desktop WebKit, and iPhone WebKit; two forced-colors cases were correctly skipped outside Chromium.
- Exact required webpack build passed and generated 403 static pages.
- Desktop and exact 390×844 checks found no horizontal overflow on the representative discovery/location/detail/event families.
- Repository ESLint remains blocked before source evaluation by the pre-existing ESLint 9 flat-config/circular legacy-config conflict. The focused contracts, complete prebuild suite, compiled browser journeys, and production build provide the release gates for this phase.

## Publication gate

Repository policy intentionally skips Vercel previews for `agent/*` branches because those branches are squash-merged and preview builds otherwise block production. The authoritative cross-engine gate therefore runs against the first healthy production revision containing the merge. The narrow WebKit projects block the unrelated global push service worker, which deadlocks Playwright's headless WebKit process across the entire site; push/offline behavior remains owned by its dedicated suites. Production publication requires healthy deployment status, representative HTTP probes, live desktop/mobile browser journeys, visual inspection, and history restoration on the public origin.

## Production evidence

- PR #1141 squash-merged as `24cae9ed`; the current production main revision contains that merge.
- Vercel deployment `dpl_neTxaecVeVMWQgijKmWY2YiJ2TJq` is Ready, targets production, cloned main revision `4961ccc`, and owns the `smarter.poker` alias.
- The unified live Phase 17 matrix passed 14/14 applicable Chromium, mobile Chrome, desktop WebKit, and iPhone WebKit checks; the two forced-colors cases are intentionally skipped outside Chromium.
- Production desktop 1440×1000 and mobile 390×844 audits each found one main landmark, the correct heading/selected route, zero horizontal overflow, and 44-pixel tab targets.
- A live mobile Events → Map → browser Back journey restored `/daily-tournaments`, selected Events, and the assistive route announcement without a reload.
- Visual inspection confirmed the black-first rendered environment, precision chrome framing, restrained blue energy, readable venue imagery, clean desktop composition, and two-column mobile card geometry remain intact.
- A second exact 390×844 WebKit visual audit verified the closed header trigger and open command menu: every trigger, utility control, section selector, and selected destination has an unbroken contained frame, with zero horizontal overflow.
