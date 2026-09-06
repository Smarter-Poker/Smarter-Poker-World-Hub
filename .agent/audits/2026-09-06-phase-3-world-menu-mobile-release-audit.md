# Phase 3 World Menu Mobile Release Audit

Date: 2026-09-06

## Scope

Phase 3 hardens the World Hub command menus for mobile across thirteen worlds.
Social Media is deliberately excluded from the adaptive redesign and retains
its approved Facebook-style blue and white composition. No icon or artwork
asset was changed.

## Completed Work

- Full-viewport drawers now respect safe areas, short landscape viewports, and
  the 44-pixel target floor for independently laid-out controls.
- Search remains visible below the utility rail without overlapping content.
- Drawer-only widgets are client-only chunks; Preflop reporting workflows are
  loaded only when requested.
- Opening a drawer isolates every obscured document branch with `inert` and
  `aria-hidden`, with exact cleanup on close.
- Report Bug is a portalled modal with focus containment, Escape handling,
  reduced motion, safe-area containment, and return focus.
- Geeves exposes its disclosure state, removes collapsed controls from keyboard
  navigation, and uses accessible names and mobile-sized controls.
- A fallback-menu tap survives approved-header hydration without duplicate
  visible drawers or a lost interaction.
- Poker Near Me uses the real `/hub/poker-near-me/series` Events destination,
  and deep routes preserve their sticky approved menu trigger.
- Swipe close ignores interactive controls and clears cancelled gestures.
- The 13 non-Social world roots are permanently covered by the mobile budget.

## Regression Boundaries

- The approved hamburger remains a hamburger. No gear, command grid, M bar, or
  substitute icon was introduced.
- Social Media retains the Facebook palette and preserved composition.
- Exact header/footer artwork files are unchanged.
- The World Hub landing page and Club Arena ownership rules are unchanged.

## Release-Candidate Verification

- Production build: passed, including all 278 prebuild checks and postbuild
  Personal Assistant budgets.
- TypeScript: passed with `npx tsc --noEmit`.
- Full lint: 4,007 files passed.
- Static Phase 3/navigation integrity: 24/24 passed.
- Phase 3 Chromium + WebKit mobile suite: 36/36 passed.
- Premium visual references: 14/14 passed.
- Legacy WebKit containment/handoff suite: 17/17 passed.
- Authoritative hamburger suite: 24/25 passed on its first serialized run; the
  sole failure was its stale `/events` fixture. The corrected canonical
  `/series` case then passed, and the other 24 cases were green.
- Mobile route budgets: 13/13 passed. Preflop Charts was initially 9 KB over;
  off-path reporting code was split from initial load and the gate passed.
- Whitespace/error check: passed.
- Image/icon diff: empty.

Publication and live-version evidence are recorded in the release pull request
and deployment checks for this phase.
