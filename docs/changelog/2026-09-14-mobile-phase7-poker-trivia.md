# 2026-09-14: Always-Displayed Mobile Standard, Phase 7 (Poker Trivia)

Dan, 2026-09-03: phase 7 of the mobile rollout is Poker Trivia. Standard:
`docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`; every-phase list:
`ROLLOUT-PLAN.md`. Routes: `/hub/trivia` (the lobby) and its subpages
(tournaments, stats, leaderboard, achievements, settings, the game modes).

Measured before, on production at 375: the lobby rendered 112 text nodes under
12px (8px eyebrows and live count, 9px chip counts, 10px kickers) and one
sideways rail (the mode filters, 715px of chips in a 357px strip); achievements
rendered 60 nodes at 11px. After: 0 and 0, no rail, on every route.

## 1. No slide to see

- The mode-filter row was a hidden-scrollbar strip with snap points and a
  `rail.scrollTo` that centred the active chip, pinned under the header as a
  sticky bar. It is a wrapping grid (auto-fit at 150px, two columns on a
  phone) with every filter on screen. Keyboard roving stays: ArrowLeft and
  ArrowRight, Home and End still move between chips and land focus, because
  that is the WAI-ARIA toolbar pattern and not a rail. The three lobby tests
  that pinned the rail (`ref={filterRailRef}`, `rail.scrollTo(`, the sticky
  strip at 700px) were MOVED to pin the grid, with the reason recorded.
- The tournament bracket was a flex row with `overflow-x: auto` and snap,
  so a four-round bracket on a phone was three rounds off screen. Rounds are
  a grid that wraps on desktop and stack one per row under 768px: round
  heading, then its match cards, every round on the page.
- The By Mode table on stats (a `<table>` with `minWidth: 460` inside an
  `overflowX: auto` box) and the leaderboard table are `ResponsiveTable`: a
  real table on desktop, one card per row on a phone with the column header
  as the label.

## 2. Shell, foundation, text, targets

`<HubPageShell className="trivia" maxWidth={1000}>` owns the lobby shell; the
CSS module's `.page` keeps the world background and loses its `100vh` and
`padding-bottom: 70px` (BottomNavSpacer in `_app.js` owns that clearance and
every trivia route is in `bottom-nav-routes.json`). `useLoadFailsafe` caps the
skeleton at eight seconds. `PullToRefresh` re-reads balance, daily state and
streak. `requireOnline()` guards the refresh and every mode start (the game
pages charge and load over the network, so an offline start says so instead
of routing into a page that cannot begin), with a haptic on the start.
`useModalHistory` on the Diamond Entry popup, so Back closes it before it
leaves the page.

Across the surface (`pages/hub/trivia/**`, `src/components/trivia/**`,
`trivia.css`, `TriviaHub.module.css`): every `100vh` is `100dvh` (fourteen
places), every bare `overflow-x: hidden` is `clip`, the six hub-style
subpages drop their own 70px bottom pad, breakpoints 390 / 400 / 480 / 680 /
700 become 600 / 768 / 900, and every font declaration under 12px (px, rem
and the `font:` shorthand) is 12px: 42 rules across the lobby, the game
components, `GTOScenarioDisplay`, `SurvivalModeGame`, `LeaderboardDisplay`,
`GhostOpponent`, `StreakBadge` and the rest. Back and filter buttons on the
subpages are 44px.

## 3. The tutorial

`src/tutorials/trivia.js`: eight Title Case steps (Welcome To Poker Trivia,
Daily Trivia, Choose Your Game, Filter By Category, The Mode Cards, Quick
Stakes, Stats Leaderboard Achievements, Where To Find This Again), no em
dashes, registered as a PREFIX row for `/hub/trivia`. Targets on the lobby:
`daily`, `modes`, `filters`, `grid`, `stakes`.

## 4. Tests, laws, budget

- `__tests__/trivia-mobile-upgrades.test.mjs` (new, 7 tests): the foundation
  (shell, pull to refresh, failsafe, requireOnline and haptic handed to the
  lobby, Back on the popup), the wrapping filters and stacked bracket with
  no rail pattern anywhere on the surface, the two ResponsiveTables, `100dvh`
  / `clip` / no page-owned bottom pad / the three breakpoints, the 12px floor
  read as a number (px, rem and shorthand), the tutorial with its targets,
  and the budget row.
- Imported by `__tests__/_test-guards-exist.test.mjs` (CHECK 8).
- `__tests__/no-slide-to-see.law.test.mjs`: `CONVERTED = [1, 2, 3, 4, 5, 6, 7]`.
- `__tests__/page-tutorials.test.mjs`: phase 7 in `LANDED` (targets live in
  `TriviaLobby.jsx`, listed under `also`).
- Pins moved (all with the reason in the test): `trivia-lobby-phase-3`
  (rail ref and scroll), `trivia-lobby-phase-4` (sticky rail, 700px),
  `trivia-ui-foundation` (700px), `trivia-phase-5-integrity` (`<main>` is the
  shell's; the module class is on the div inside).
- `scripts/ci/mobile-budget.json`: `/hub/trivia` flipped to `converted: true`,
  LCP 3500 to 2500ms.
- Training surface inventory regenerated (the tutorial registry is
  training-reachable).
