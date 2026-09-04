# 2026-09-04: Always-Displayed Mobile Standard, Phase 2 (Preflop Charts) + full tutorial

Dan, 2026-09-03: Phase 2 of the mobile rollout is Preflop Charts, "and this
needs a full tutorial added to it when you start." Standard:
`docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`; every-phase
list: `ROLLOUT-PLAN.md`. Route: `/hub/preflop-charts` (canonical) and
`/hub/memory-games` (same page, `pages/hub/memory-games.js`).

## 1. No slide to see

- `.preflop-mode-rail` (scroll-snap carousel, 118px flex cards, hidden
  scrollbar) is a wrapping grid: `repeat(auto-fill, minmax(140px, 1fr))`,
  two columns at or below 768. Every mode card is visible.
  `PreflopTabRail.jsx` keeps its roving-tabindex keyboard model and loses
  `scrollIntoView`.
- `.preflop-subpage-nav` (hidden-scrollbar strip) is a wrapping row
  (`src/components/memory-games/PreflopSubpageNav.jsx`), sticky at
  `top: var(--sp-header-height)` instead of an assumed 44px.
- The leaderboard `.preflop-ranking-table` (`min-width: 720px` inside an
  `overflow-x: auto` scroller) is a `<ResponsiveTable>`: a table above 768,
  one labelled card per row at or below it. `.preflop-ranking-scroll` is
  gone.
- `memory-games.css` had six breakpoints (640, 720, 768, 900, 1080); it now
  has 900 and 768 (plus their `min-width` complements) and reduced-motion.
  `scrollbar-width: none`, `scroll-snap-type`, `overflow-x: auto`: zero
  occurrences.

## 2. The 13x13 matrix fits 375px

`.preflop-lab-grid` is `minmax(20px, 0.8fr) repeat(13, minmax(0, 1fr))`,
`width: 100%`, `min-width: 0` (was `30px repeat(13, minmax(44px, 1fr))`
with `min-width: 628px`, a sideways scroller on every phone). Rank headers
stay at 12px; at or below 768 a cell shows its colour and, on the pair
diagonal, a 12px label; every other hand is named by its two rank headers
and by the always-visible readout bar above the grid (last touched hand,
its action, the solver's action when grading, 14px, 44px tall).

`PreflopRangeMatrix.jsx` cells are `role="gridcell"` elements driven from
the grid container by pointer events: pointerdown selects, pointermove
paints every new cell the finger crosses (`document.elementFromPoint`),
pointerup ends the stroke; one light haptic per stroke. Arrow keys,
Home/End, Enter and Space keep working on the container, with
`aria-selected` on every cell.

Sanctioned exception, recorded in both places: the grid carries
`data-allow-small-target="true"` and `e2e/mobile-budget.spec.ts` excludes
its descendants from the 44px tap-target count. A paint grid is ONE control
with 169 cells; 13 cells cannot each be 44px in 351px. Desktop keeps 44px
cells with a label in every cell.

## 3. Shell and the upgrade set

`<HubPageShell className="preflop" maxWidth={1080}>` owns the shell; no
`100vh`, no page `paddingBottom`, no `window.innerWidth` deciding what
renders (the confetti origin now reads the button's own rect).
`useLoadFailsafe` + `useInitialLoadRef` with a `.preflop-skel` first-paint
skeleton that mirrors the menu. `useOnlineStatus` / `requireOnline()` on
every mutation: game start (spends diamonds), result submission, daily
challenge, preferences, leaderboard writes, filter saves. `useHaptics` on
mode picks, paint strokes, submit and result. `PullToRefresh` around the
menu only (disabled during a game). `useModalHistory` + `useScrimDismiss`
on every overlay the page opens (JarvisExplanationDialog, the review panel,
ScenarioFilterPanel, OutOfDiamondsModal, the result overlay); each is a
bottom sheet at or below 600 with a drag handle, a 44x44 X below the status
bar, 16px inputs and a sticky footer. Off-menu screens (speed drill,
pressure cooker, pattern recognition, mixed strategy, spot trainer,
tournament), the review panel, the Jarvis dialog and the filter panel are
`dynamic(..., { ssr: false })` with skeleton loaders; the menu and the
matrix stay eager.

## 4. Text

No font under 12px in `memory-games.css`, the page, the components or the
four subpages (the budget measured 88 sub-12px text nodes on this route;
now 0). Axis labels, the podium and table headers were re-laid for 12px.

## 5. The tutorial

`src/tutorials/preflop-charts.js`: eight steps (Welcome, Reading The 13x13
Matrix, Positions And Stack Depth, Actions And Colours, Build Your Range,
Submit And Score, Modes And The Daily Challenge, Stats Leaderboard And
Achievements), Title Case, no em dashes, each with a `data-tutorial` target
on the page. Registered for both `/hub/preflop-charts` and
`/hub/memory-games` (exact match, so the subpages keep their own future
tours). The page listens for `TUTORIAL_WILL_OPEN_EVENT` and returns to the
menu unless a game is in progress; `PreflopMatrixPrimer.jsx`, a real
always-visible 13x13 legend on the menu (diagonal, suited, offsuit regions
coloured and labelled at 12px), carries the matrix, legend and submit
targets so every step has a spotlight without starting a game.
`TutorialProvider` now honours `?tutorial=1` on a registered route (opens
once, strips the query with a shallow replace). `pages/hub/memory-games/
tutorial.js` keeps its guide content, renders the eight steps as stacked
articles, and its 44px primary CTA links to `/hub/preflop-charts?tutorial=1`.
Nothing on the page auto-launches a tour and there is no visible Tutorial
button; the three-second prompt and the hamburger's Page Tutorial row are
the entry points.

## 6. Tests, laws, budget

- `__tests__/preflop-mobile-upgrades.test.mjs` (new): shell, failsafe,
  offline guard, haptics, no 100vh, no `window.innerWidth` render branch,
  no sub-12px font in the page/CSS/components/subpages, the matrix CSS has
  no `min-width: 628` and no `overflow-x: auto`, ResponsiveTable in the
  leaderboard, PreflopTabRail has no scrollIntoView, the tutorial is
  registered for both prefixes with eight steps and every target present,
  the guide page links to `?tutorial=1`, the provider supports the query.
- `__tests__/no-slide-to-see.law.test.mjs`: `CONVERTED = [1, 2]`.
- `__tests__/page-tutorials.test.mjs`: phase 2 in `LANDED`.
- `scripts/ci/mobile-budget.json`: `/hub/preflop-charts` flipped to
  `converted: true` (12px floor and 44px targets enforced), JS and LCP
  budgets lowered to the measured baseline plus allowance (see 7).

## 7. Verification (measured 2026-09-04, production build)

- `node --test` on the ten mobile suites (preflop, page-tutorials,
  no-slide-to-see, overlays, fixed-elements, bottom-nav, foundation,
  bankroll, header, hamburger): 63 pass, 0 fail. All 20 changed files parse
  with @babel/parser. `tsc --noEmit` exit 0. `next build --webpack` exit 0.
- Playwright against `next start`, authenticated, at 375x812 / 390x844 /
  1280x900: scrollWidth == innerWidth on all three, 8 `data-tutorial`
  targets, 0 text nodes under 12px, 0 tap targets under 44px, 0 page errors.
- At 375: the prompt appears with a 44x44 close at y 624; Start opens the
  tour; steps 2 to 8 draw a spotlight ring (step 1, Welcome, has none by
  design); Done closes it. Starting a game renders the matrix 323px wide
  (fits 375), 169 gridcells, a 3-cell drag stroke paints 3 cells, no
  sideways scroll in-game.
- Mobile budget for `/hub/preflop-charts`: jsKb 817, LCP 564ms, overflow 0,
  smallText 0, tinyTargets 0, `converted: true`. Note: merging main brought
  the Sentry integration (#1315) into the shared chunk and raised every
  route by about 100KB (bankroll 687 to 792, poker-tools 652 to 757); the
  budget rows were re-baselined once above that shell growth (converted
  850, unconverted 900) and the reason is recorded in the JSON comment.
