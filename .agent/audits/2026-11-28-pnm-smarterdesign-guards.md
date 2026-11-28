# Poker Near Me #SmarterDesign guards (2026-11-28)

Branch `work/guards-20261128`. Goal: Poker Near Me's #SmarterDesign cannot
regress, measured on rendered styles as well as on source, plus contrast and
page weight.

## What now guards it

1. **Rendered styles**: `e2e/pnm-smarterdesign-render.spec.ts`, fixtures in
   `e2e/fixtures/pnmSmarterDesignFixtures.ts`, projects
   `pnm-smarterdesign-chromium` / `pnm-smarterdesign-webkit` in
   `playwright.config.ts`, step "Verify Poker Near Me #SmarterDesign rendered
   styles" in `global-footer-e2e.yml` (job ceiling 45 -> 55 minutes).
   Seventeen routes (lobby, venues, map, more, roadtrip, alerts, saved, series,
   tours, daily-tournaments, events-calendar, in/nv, venues/1823, tours/wsop,
   series/468, poker-series, home-games). Chromium: 393x852, 768x1024 and
   1280x800 signed out, 393x852 signed in (synthetic HS256 session kept off
   Realtime by `realtimeSessionGuard`). WebKit: 393x852 and 1280x800 signed
   out. Every browser request is answered by fixtures or refused; SSR runs in
   the job's own Next server. Each page is walked to the bottom and every
   `.pnm-subsection` is brought into view so lazy tools mount. Checks on every
   visible text element, button and bordered frame: banned hue (20-70 and
   260-345 degrees, saturation >= 0.25 and chroma >= 0.10, same numbers as
   CHECK 30) outside the exemptions (Leaflet, markers, clusters, pnc-icon,
   halos, avatars, rating chips, photos, images), no computed uppercase,
   contrast 4.5:1 or 3:1 large (backdrop composited up the tree, a gradient
   counted as the mean of its stops, url() artwork not scored), buttons at
   least 44px unless `data-allow-small-target`, the bottom nav `position:
   fixed; bottom: 0` and never above the bottom edge, a `[data-header-art]`
   header with the painted `header-help.webp` "?". Page-specific pins:
   `.rtp-role` one ice ink, never red; Origin/Destination placeholders carry
   no "E.G."; `.ta-toggle` reads On/Off with matching `aria-pressed`; the
   venue hero `.pnm-deep-deck` names the venue and precedes `.map-section`.
   Floors per page: 12 text elements, 6 contrast-scored, 1 button.
   The global header and bottom nav are excluded from the element audit:
   they have their own contracts.
2. **Source**: `scripts/ci/check-pnm-smarterdesign-css.mjs`, CHECK 30 in
   `build-safety-gate.yml`, with `--self-test`. Scans
   `src/styles/worlds/poker-near-me-*.css`, `styles/poker-near-me.css`,
   `src/components/poker-near-me/**/*.css` and the style blocks of the PNM
   pages. Uppercase and banned hues: zero tolerance. The retired painted
   chassis (painted-panels-v1, the painted-controls-v1 utility well; the
   painted-controls-v1 icon pictograms are exempt) is a per-file ratchet in
   `scripts/ci/pnm-smarterdesign-css-baseline.json` (11 references in 5
   files) that may only go down.
3. **Palette**: cross-repo token names on `:root` in
   `styles/smarterdesign.css`, documented in `docs/SMARTERDESIGN.md`
   ("Cross-repo palette").
4. **Weight**: `__tests__/pnm-image-weight-budget.test.mjs` (run in CHECK 30):
   byte ceilings for the 14 header scenes, 14 seals and 12 lobby tiles, set
   totals, every ART key and tile id has its file, tiles past the first eight
   are lazy, the header scene is eager and high priority.

## Defects the guards found and that are fixed at source here

- Banned hues (CHECK 30): orange check-in badge (`styles/poker-near-me.css`,
  two lobby.js style blocks), amber-brown tints on modeled cash counts
  (`poker-near-me-machined.css`), amber and violet Near Me Now row tints and
  the amber Trip Cost no-GPS note (`poker-near-me-console-tools.css`). Now ice
  or navy.
- Contrast (render spec): half-alpha silver `rgba(200,214,229,<=0.5)` text in
  the PNM components (city line on every venue row of the discovery pages,
  LiveGamesFeed, DailyTournamentsPanel, ReportGameModal, ScraperHealthDashboard,
  VenueGameAlerts, LocationEnableModal, the GPS clear button) read 3.95:1 and
  below; slate `#64748b`/`#475569` labels on series detail; `--tour-dim`
  `#65717f` on tour detail; dim results count and two icon buttons on
  `/hub/poker-series`; reviews' muted ink `#5a6270` (3.3:1). All now silver
  dim `#9fbacc` (`--sd-silver-dim`).
- Desktop only (render spec): the Live Games map toggle's "Collapse Map"
  ice ink on the cobalt toggle (3.6:1) is white; its copy is Title Case. The
  cached-data Retry button (53x31) and the tour page's Enable Notifications
  button (204x30) now hold 44px.
- `docs/business-hub-guide-review.json`: lobby.js reviewed hash updated; the
  only lobby.js change is the check-in badge colour, no guide claim moved.

## What ran

- `node scripts/ci/check-pnm-smarterdesign-css.mjs --self-test` and the check:
  clean (20 stylesheets, 12 pages).
- `node --test __tests__/pnm-image-weight-budget.test.mjs`: 5/5.
- `npm run test:pnm`: 177 + 47 + 493, all pass.
- Every `__tests__`/`tests` file naming a touched file (764 tests): all pass
  after the lobby.js hash update.
- `check-ui-text.mjs`, `check-title-case.mjs`: OK.
- The render spec, Chromium only, against `next dev --webpack` with placeholder
  Supabase (system Chromium 1243; Playwright's own download is refused here):
  all 68 Chromium cases passed, the failing ones re-run after their fixes.
  WebKit did not run here (no WebKit binary in this environment); it first
  runs in the Global Footer E2E job.

## Deliberately left

- `pages/hub/venues/[id].js` in-page slate inks (`.info-label`,
  `.info-value.muted`, `.nearby-venue-type`, two empty-state lines; 2.5-4.0:1)
  and the `.info-link` address button (22px tall at desktop). That file
  belongs to the venue page lane this round. They are listed by name in
  `KNOWN_DEBT` in the spec, scoped to `/hub/venues/`, so nothing
  else can hide behind them. Remove each entry when its source is fixed.
- The eleven painted-controls-v1 utility-well references stay on the ratchet.
- `package.json` `test:pnm` is not edited (another lane owns it); the image
  budget test runs from CHECK 30 instead.
