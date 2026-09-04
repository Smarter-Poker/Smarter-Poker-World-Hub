# 2026-09-04: Always-Displayed Mobile Standard, Phase 3 (Poker Near Me)

Phase 3 of `docs/mobile-standard/ROLLOUT-PLAN.md`, "the worst offender".
Standard: `docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`. Routes:
`/hub/poker-near-me` (redirects to `/lobby`), `pages/hub/poker-near-me/lobby.js`,
`pages/hub/poker-near-me/[pnmTab].js` (map, venues, events and its four
sub-surfaces, live-games, saved, more, roadtrip, alerts) and the state pages
under `/in`. Binding constraint honoured throughout:
`.agent/workflows/live-cash-games-policy.md`. Nothing that reads or writes
`venue_live_tables`, `game_live_history` or `/api/poker/live-tables` changed;
the live counts are still labelled modelled / approximate wherever they show.

## 1. No slide to see

- **The swipe-to-change-tab gesture is gone.** `useDiscoveryGestureController.js`
  (swipe between the six tabs and the two sub-tab sets, plus the hand-rolled
  pull-to-refresh) is deleted, the `onTouchStart/Move/End` handlers on
  `.pnm-content` are deleted, and every comment that leaned on "the swipe
  handler is the sole in-page navigation" is rewritten.
- **No tab hides content.** `renderContent()` (one surface at a time) is
  replaced by six stacked `<section id="pnm-section-<key>">` blocks in
  `PRIMARY_SECTIONS` order (Venues, Events, Live, Map, Saved, More), each
  under its own `<h2>`. Events carries its four sub-surfaces stacked (Daily
  Tournaments, Tours, Series, Calendar) under `<h3>`s, and `MoreTabPanel`
  renders all its tools stacked (Best Time To Go, Road Trip, Social, Alerts,
  Near Me Now, Trip Cost) instead of switching on `activeMoreTab`.
- **The tab rows are anchor jump lists.** `.pnm-top-tabs` is a wrapping
  `<nav>` of buttons with `aria-current`; a tap calls `scrollToSurface()`
  (`src/components/poker-near-me/pnmSections.js`: `scrollIntoView`-style
  scroll offset by the published `--sp-header-height`, retried for a moment
  while a dynamic chunk mounts) and the URL still updates through the
  existing `pushDiscoverySurface`, so `/events`, `/daily-tournaments`,
  `?tab=` deep links, Back/Forward and the canonical tag keep working.
  Arriving on `/hub/poker-near-me/events` (or any slug) scrolls to that
  section after paint and re-aligns once the first load settles. The events
  and More sub-anchor rows work the same way. All six labels are visible at
  every width; nothing is `display: none`.
- **Expensive panels are lazy.** `src/components/poker-near-me/LazyPanel.jsx`
  (IntersectionObserver, `rootMargin: 600px 0px`, SSR-safe, mounts once and
  stays) wraps the map, the live feed, the tournament list, tours, series,
  the calendar and every More tool; each is also `dynamic(..., { ssr:false,
  loading })` with the shared `.pnm-skel` shimmer.
- **The map keeps a fixed height** (`clamp(320px, 55dvh, 520px)` on
  `.map-tab-container`; the old `calc(100vh - 280px)` / `min-height: 500px`
  and the 1024px override are gone) and `.pnm-page` / `.pnm-lobby-page`
  carry `touch-action: pan-y`; Leaflet keeps `touch-action: none` on its own
  container. `.map-desktop-layout` is one column (its 320px second column was
  empty: `MapTabPanel` has no sidebar) and the hover-revealed `.map-sidebar`
  drawer is deleted.
- **Every rail wraps.** `.pnm-family-nav__rail` (and
  `PokerNearMeFamilyNav.jsx` no longer centres a link inside a scroller),
  `.pnm-family-nav__label` is never culled, `.pnm-status-rail`,
  `.pnm-recent-rail__track` (an `auto-fill` grid), `.hgd-tabs`, the phone
  filter bars (the 86px `flex: 0 0 86px; overflow-y: hidden` strip is gone),
  `.pnm-top-search-bar`, `.pnm-chip-strip`, `.sidebar-nav`,
  `.sidebar-sub-nav`, `.mobile-tab-bar`, `.day-selector`,
  `.map-filter-chips`, `.filter-chips`, `.vc3-actions-primary`, the lobby
  panel's quick pod nav (`overflowX: auto; scrollbarWidth: none` inline),
  the lobby grid's inner scroller (`.lobby-card-scroll`, now plain flow),
  `DailyTournamentsPanel.jsx` (day and state strips), `VenueReviews.jsx`
  (`.vr-sort-row`), `BestTimeToGoWidget.jsx` (game tabs wrap; the hour strip
  is a 24-cell grid, 8 per row on phones and 12 above 768, every cell
  labelled at 12px), `PeakActivityHeatmap.jsx` (a 24-column grid that fits
  the container instead of a 600px block in an `overflowX: auto` scroller)
  and `GlobalSearchOverlay.jsx` (two `scrollbarWidth: 'none'` removed).
  `scrollbar-width: none`, `scroll-snap-type`, `::-webkit-scrollbar
  { display: none }`, `flex: 0 0 Npx` and `overflow-x: auto`: zero
  occurrences across the three stylesheets.
- **`VenueCompare.jsx`** renders its comparison through `<ResponsiveTable>`
  (a table above 768, one labelled card per metric at or below it).

## 2. Shell and the upgrade set (both pages)

`<HubPageShell className="pnm" maxWidth={1080} header={<UniversalHeader
pageDepth={2} .../>}>` owns both shells (`body.world-poker-near-me` scoping
untouched). The lobby's absolute header wrapper, its `100vw x 100vh
overflow:hidden` stage and its inner scroller are gone; the lobby is
document flow (`.pnm-lobby-stage { position: relative }`, the canvas fills
it). No `100vh`, no page `paddingBottom`, no `isMobile` / `matchMedia` /
`window.innerWidth` deciding a render on either page.

- `useLoadFailsafe(loading, setLoading)` + `useInitialLoadRef()` on both:
  the skeleton (`.pnm-skel`, one class, one keyframe) is for the first load
  only; filter changes and the 5-minute poll keep content on screen.
- `useOnlineStatus` / `requireOnline()` on every mutation: favourite (both
  pages), preferences, pull to refresh, check-in open and submit
  (`VenueCard.js`, `requireOnlineNow`), review post and vote
  (`VenueReviews.jsx`), report a game (`ReportGameModal.jsx`), invite / copy
  link (`SocialLayer.jsx`), alert preference sync (`TournamentAlerts.jsx`).
- `useHaptics` on tab and sub-tab taps, pod taps, favourite, GPS, check-in,
  report submit.
- `PullToRefresh` around the lobby stage (`handleRefreshAll`) and around the
  stacked discovery page (`refreshDiscovery`: silent `fetchAllData` + live
  count), disabled while any sheet, menu or overlay is open.
- `useModalHistory` + `useScrimDismiss` on every overlay these pages open:
  VenueReviews (component-level), GlobalSearchOverlay (component-level),
  the VenueCard check-in dialog, ReportGameModal, SocialLayer's invite
  dialog, the venue-detail `FullScreenPageOverlay` (page-level), the lobby
  pod panel, voice search, login prompt, location enable popup and manual
  location sheet. VenueReviews, the check-in dialog, the report dialog, the
  invite dialog and voice search are bottom sheets at or below 600px with a
  drag handle, a 44x44 X below the status bar, 16px inputs and 44px actions.
- Sticky bars use `top: var(--sp-header-height, 56px)`; the two floating
  action buttons (voice search, report a game) and the report toast sit at
  `calc(var(--sp-bottom-nav-height) + env(safe-area-inset-bottom) + Npx)`.
- Every `:hover` rule in the three stylesheets, the lobby's inline styles
  and `VenueCard.js` now has the same state on `:active` (63 + 16 + 14 + 1
  rules); anchors, sub-anchors, chips, pills and closes are 44px with
  `touch-action: manipulation`.
- Breakpoints: the three stylesheets and both pages use only 900 / 768 / 600
  (700, 640, 520, 480, 430, 375, 800, 820, 1024 are gone: sheet rules at 600,
  layout at 768/900). `overflow-x: hidden` is never alone.

## 3. Text

No font under 12px on the two pages, the three stylesheets, every component
under `src/components/poker-near-me/` and the state pages: 324 declarations
raised (`font-size`, `font:` shorthand, `fontSize:` numbers and strings,
`clamp()` fonts, `rem` values under 0.75). The lobby stats bar labels wrap
instead of ellipsising, the heatmap axis shows every third hour so 12px
labels never collide, and the `.pnm-map-coverage__integrity` separators are
text at 12px. The budget had measured 19 sub-12px nodes on the lobby; see 7.

## 4. The tutorial

`src/tutorials/poker-near-me.js`: `POKER_NEAR_ME_TUTORIAL`, eight steps
(Welcome, The Map, Live Games Running, Rooms And Venues, Events And
Tournaments, Best Time To Go, Check In And Reviews, Saved And More), Title
Case, no em dashes, live counts worded per the live-cash-games policy
("Modelled From Weeks Of Real Observed History ... Labelled Approximate").
Targets are `data-tutorial` attributes on the six sections and the anchor
row in `[pnmTab].js` plus `best-time` (the Peak Activity grid, now mounted as
"Best Time To Go" in Discovery Tools) and `social` in `MoreTabPanel.jsx`; on
the lobby the hotspots carry `venues`, `live`, `map`, `events`, `saved`,
`social` and the grid carries `nav` (seven of eight; the engine tolerates
the missing `best-time`). Registered as a **prefix** row for
`/hub/poker-near-me` so the lobby, every tab route and the state pages get
it. Both pages listen for `TUTORIAL_WILL_OPEN_EVENT`, close their overlays
and scroll to the top.

Retired: `InteractiveTutorial.jsx` (937 lines, the per-tab walkthrough with
its own `window.innerWidth` branch and `100vh` layer) and
`PNM_TAB_TUTORIALS` / `LOBBY_TUTORIAL_STEPS`; its mount in `[pnmTab].js`,
its mount in `LobbyOverlay.jsx`, the lobby's first-visit auto-launch, both
pages' `replayTutorial`, and the hamburger config's "Replay Tutorial" row
(HamburgerMenu adds "Page Tutorial" for every registered route, so it would
have been a duplicate). Nothing on these pages launches a tour.

## 5. Tests, laws, budget

- `__tests__/pnm-mobile-upgrades.test.mjs` (new, imported by
  `_test-guards-exist.test.mjs`): shell, failsafe, offline guard, haptics,
  back-gesture sheets with 44px closes, no touch navigation, no
  `renderContent`, every section and sub-section stacked, `LazyPanel`, no
  rail / snap / hidden scrollbar / label cull across the three stylesheets,
  the 900/768/600 rule, the 12px floor across pages, stylesheets, components
  and state pages, `ResponsiveTable` in VenueCompare (no raw `<table>` on the
  route), the tutorial's eight steps and prefix registration with every
  target in `[pnmTab]`, the retired files absent, the budget row converted.
- `__tests__/no-slide-to-see.law.test.mjs`: `CONVERTED = [1, 2, 3]`.
- `__tests__/page-tutorials.test.mjs`: phase 3 in `LANDED`.
- `scripts/ci/mobile-budget.json`: `/hub/poker-near-me` flipped to
  `converted: true`, jsKb 850, lcpMs 2500.

### Pins moved (never loosened), each with its reason beside it

- `poker-near-me-phase-3.test.mjs`: the ARIA tablist pin (roving tabindex,
  Arrow/Home/End handler, one `role="tabpanel"`) moved to the anchor-row
  contract (a `<nav>` of buttons with `aria-current`, every section
  `aria-labelledby`); there is no longer a single panel for tabs to control.
  The family-rail centring pin (`railRef` / `rail.scrollTo`) moved to the
  wrapping rule; the rail no longer overflows.
- `poker-near-me-phase-2.test.mjs`: `.pnm-filter-bar { min-height: 86px;
  flex: 0 0 86px }` moved to the wrapping filter-bar rule.
- `poker-near-me-phase-16.test.mjs`: `useDiscoveryGestureController` moved
  to `PullToRefresh` and "no touch handler".
- `poker-near-me-casino-realism.test.mjs`: `@media (max-width: 700px)` moved
  to 768 (the standard's phone boundary).
- `world-command-menu-law.test.mjs`: the lobby's floating header wrapper
  (`zIndex: 10050, pointerEvents: 'none'`) moved to "one header through
  HubPageShell's `header` prop".

### Sanctioned exceptions, recorded here

- `PeakActivityHeatmap` cells carry `data-allow-small-target` and are
  `role="gridcell"`, not buttons: a heat map is one control with 168 cells,
  the same sanction the Preflop 13x13 matrix records in
  `e2e/mobile-budget.spec.ts`.
- `GlobalSearchOverlay` stays a full-screen layer rather than a bottom sheet:
  its input is pinned under the status bar above the keyboard; a sheet would
  put the field behind the keyboard. It gets `useModalHistory` and keeps its
  44px close and safe-area padding.
- The two `mask-image` declarations in `src/styles/worlds/poker-near-me.css`
  (`body::after` grid fade, `.pnm-deep-deck__scan`) are decorative
  backdrops, not rail fade hints, and stay (phase-17 pins them).
- `.mobile-tab-bar { display: none }` above 768 is the sanctioned
  desktop-only duplicate rule (the class is not mounted by any component).
- Hand-history / data policy untouched: the simulator, the API contract and
  the labels are exactly as `live-cash-games-policy.md` describes.

### Two real bugs found on the way

- `src/components/ui/PullToRefresh.jsx` applied `transform: translateY(0px)`
  while idle. Any transform makes the wrapper the containing block for every
  `position: fixed` descendant, so the live feed's report dialog opened at
  the top of a 5,000px page and its FAB pinned to the content. The transform
  now exists only during a pull.
- A 919KB `.fuse_hidden000011d500000001` had been committed to `main`
  (9640f04d2b); it is deleted in this branch.

## 6. Verification (measured 2026-09-04, production build)

- Full `node --test __tests__/*.mjs`: 3078 tests, 3074 pass; the only four
  failures are the pre-existing environment-dependent ones (Open Claw
  config, training inventory, diamond-store phase 14, venue integrity) in
  files this programme does not touch. `tsc --noEmit` exit 0.
  `next build --webpack` exit 0. `check-title-case` OK.
- Playwright against `next start`, authenticated, 375x812 / 390x844 /
  1280x900 on `/lobby`, `/map` and `/events`: scrollWidth == innerWidth on
  every route and viewport; 7 tutorial targets on the lobby, 9 on the tab
  routes; six stacked `section[id]` panels on the tab routes; 0 page errors.
- Tutorial at 375 (lobby): prompt with a 44x44 close at y 626; Start opens
  the tour; steps 2, 3, 4, 5, 7, 8 draw a ring (Welcome has none by design;
  Best Time To Go has no lobby target, the engine shows the step without a
  ring); Done closes it.
- Tab tap at 375 on `/map`: tapping Events moved `window.scrollY` from
  39291 to 14672, the URL became `/hub/poker-near-me/daily-tournaments`,
  the events section top landed at 38px (the published header height), and
  the map stayed mounted (Leaflet still in the DOM).
- Mobile budget for `/hub/poker-near-me`: jsKb 790, LCP 444ms, overflow 0,
  smallText 0, tinyTargets 0, `converted: true`.

## 7. Deep-dive verification before push (Dan's standing rule)

Measuring the stacked tab route at 375 after the first build found three
real defects the section-by-section conversion had not, all fixed and
re-measured on a fresh production build:

- **The live feed ran past the right edge.** `.lgf-venue-grid` used a bare
  `1fr` track, which is `minmax(auto, 1fr)`: a card whose action row would
  not wrap set the track to its min-content width, 367px inside a 275px
  container, and the "Details" button and table counts were cut off (the
  page did not scroll sideways only because the column clips). Track is
  `minmax(0, 1fr)`, cards get `min-width: 0`, and the action bar wraps.
  Elements past the viewport edge in the live section: 0 (was 8 per card).
- **The page was 35,437px tall.** Twenty 650px venue cards (13,222px) and
  thirty live cards (13,539px) opened at once. `INITIAL_VISIBLE = 8` and
  `INITIAL_VISIBLE_LIVE = 8` in `discoveryController.js` open each list
  with eight cards; Show More still grows by `PAGE_SIZE` / `PAGE_SIZE_LIVE`.
  Measured after: venues 5,770px, live 4,970px, page 19,416px. Everything
  is still on the page behind a tap, never a swipe.
- **Two closes and a control were under 44px.** `.sp-icon-btn` (src/index.css)
  sets width and height to `--sp-btn-size` with `!important` and unsets
  `min-height`, so an overlay close carrying `sp-icon-btn sp-overlay-close`
  rendered 44 wide but 32 tall. `.sp-overlay-close` now sets the token to
  44px in `global-tokens.css` (this repairs every 0b overlay estate-wide),
  the check-in close sets it too, and the PNM shell sets it for every icon
  button at or below 768. Check-in close measured 44x44 (was 44x32); the
  live feed's save-venue heart is a 44px labelled, `aria-pressed` button
  (was 24x44).
- The phase-14 cluster pin moved with the mechanism: the two smallest orbs
  are 32/30px (were 30/28) so their digits sit at the 12px floor.

## 8. Deep-dive verification before phase 4 (Dan's standing rule)

- CI on the pushed branch was red on one check: main had just gained CHECK
  19 (`scripts/ci/check-icon-button-sizing.mjs`), which fails when a file
  sets an inline `width` on `.sp-icon-btn` without `--sp-btn-size` (the
  class's `!important` width discards the inline value; exactly the 44-wide,
  32-tall close this phase measured). The branch had 24 such files against
  a baseline of 20. Every one is now fixed at the source: all 32 occurrences
  across the 23 files set `'--sp-btn-size': '<n>px'` on the style object
  (the pages, every 0b overlay, the hamburger, the wallet, the PNM
  components), and the check's baseline is driven to 0 so it can never
  grow again. This also finishes the estate-wide repair started in
  section 7.
- `src/components/bankroll/BankrollTutorial.jsx` was still on main: dead
  since phase 0c moved the tour into `src/tutorials/`, imported by nothing.
  Deleted.
- `VenueGameAlerts.jsx` posted its alert with no offline guard; it now
  refuses offline with the standard toast copy in its own feedback line.
  Every other PNM mutation (check-in, favourite, review, report, vouch,
  tournament-alert prefs) already carried `requireOnline`.
- Measured on the production build at 375: `/hub/poker-near-me/in` and
  `/in/tx` (the state pages, which share the tutorial prefix) have 0
  sideways overflow, 0 text under 12px, 0 targets under 44px, 0 errors.
- Full `node --test __tests__/*.mjs` after the fixes: 3162 tests, the only
  four failures are the pre-existing environment ones; `tsc` 0; title-case
  and em-dash checks OK; `next build --webpack` 0.
