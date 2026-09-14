# 2026-09-14: Always-Displayed Mobile Standard, Phase 10 (Odds Calculator)

Dan, 2026-09-03: phase 10, the last of the mobile rollout, is the Odds
Calculator. Standard: `docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`;
every-phase list: `ROLLOUT-PLAN.md`. Route: `/hub/poker-tools`.

Measured before, on production at 375: 54 targets under 44px (52 of them the
card picker, thirteen fixed columns of 22px-wide cards) and the equity shown
only on 10px seat badges. After: 0 targets under 44px, 0 text nodes under
12px, and the numbers as readable cards.

## 1. What changed

- **The card picker is a 44px grid.** `repeat(13, 1fr)` put every one of the
  52 cards in a 22px column on a phone. `repeat(auto-fill, minmax(44px, 1fr))`
  gives eight 44px cards per row at 375 and the full thirteen on a desktop.
- **Results as stacked cards.** The equity was shown only on the seat badges
  on the felt, at 10px, the smallest text on the page. A results section
  under the picker now lists one card per seat (equity, wins and ties out of
  10,000 runouts), a grid on desktop and one column on a phone; the badges
  keep the number too, at 12px.
- **The shared header and hamburger.** The page carried its own header (a
  "Hub" back link and a settings button) and its own fixed settings sheet,
  which duplicated the shared chrome and, because the page had no
  HamburgerMenu, never offered a Page Tutorial row. `HubPageShell` with
  `UniversalHeader` and `HamburgerMenu` (`getMenuConfig('odds-calculator')`,
  the Analysis Workspace menu that already existed and nothing used) replace
  both; the route leaves `HUB_ROUTES_WITHOUT_SHARED_HEADER` in `_app.js`
  since the page owns its header now, and leaves the overlay law's
  FIXED_FILES list since it has no fixed overlay of its own.
- **Foundation.** `useHaptics` on every card tap and on Calculate. The
  calculator runs in the browser with no network at all, so the load
  failsafe, pull to refresh and the offline guard have nothing to guard on
  this page and are deliberately not wired. `100vh`, `overflowX: 'hidden'`
  and `paddingBottom: 70` are gone (the shell is `100dvh` and `clip`;
  `BottomNavSpacer` owns the bottom clearance).
- **Text and targets.** The seat badge label (10px), the "Dead:" label
  (10px), the preset chips (11px) and the felt watermark floor
  (`Math.max(8, ...)`) are 12px. The game tabs, New Hand, Board, Dead,
  Presets, Calculate (36px), the preset chips and the dead-card thumbnails
  (30x42 click targets, now buttons) are 44px.

## 2. The tutorial

`src/tutorials/poker-tools.js`: eight Title Case steps (Welcome To The Odds
Calculator, Pick The Game, The Table, Board Dead Cards Presets, The Card
Picker, Calculate, Reading The Results, Where To Find This Again), no em
dashes, registered as an exact row for `/hub/poker-tools`. Targets: `title`,
`games`, `table`, `actions`, `presets`, `picker`, `results`.

## 3. Tests, laws, budget

- `__tests__/poker-tools-mobile-upgrades.test.mjs` (new, 5 tests): the
  foundation (shell, shared header and menu, haptics, no page-owned sheet),
  the 44px picker grid and the results cards, the 12px floor (including the
  `Math.max` floor) and every 44px control, the tutorial with its targets,
  and the budget row plus the completed `CONVERTED` list.
- Imported by `__tests__/_test-guards-exist.test.mjs` (CHECK 8).
- `__tests__/no-slide-to-see.law.test.mjs`: `CONVERTED = [1, 2, 3, 4, 5, 6, 7, 9, 10]`,
  every surviving phase of the rollout (8 retired, see the plan).
- `__tests__/page-tutorials.test.mjs`: phase 10 in `LANDED`.
- `__tests__/overlays-leave-room-to-close.law.test.mjs`: `poker-tools.js`
  removed from FIXED_FILES with the reason beside it.
- `scripts/ci/mobile-budget.json`: `/hub/poker-tools` flipped to
  `converted: true`, LCP 3500 to 2500ms.
- Training surface inventory regenerated.
