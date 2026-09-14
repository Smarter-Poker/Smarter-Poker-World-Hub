# 2026-09-14: Always-Displayed Mobile Standard, Phase 9 (Video Library)

Dan, 2026-09-03: phase 9 of the mobile rollout is the Video Library.
Standard: `docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`;
every-phase list: `ROLLOUT-PLAN.md`. Route: `/hub/video-library`. (Phase 8,
Diamond Arena, was retired on 2026-09-09 by #1701 and is recorded as such in
the plan; there is no World Hub surface left to convert.)

Measured before, on production at 375: three sideways rails (the command
controls, 1,219px of buttons in a 357px strip with a mandatory snap and an
edge fade mask; the creator row, 1,842px in 357px; New This Week, 14,878px
of cards in 333px), four culls (the rail kicker, the four group labels, the
command heading, the source logo on thirteen cards) and 182 text nodes under
12px. After: 0 rails, 0 culls, 0 nodes under 12px.

## 1. No slide to see

- The command controls (Browse, My Library, Order, Format) were a snap rail
  with the group labels culled and a fade mask hinting at more off screen.
  They are a two-column grid on a phone, every button on screen, each group
  label a full-width heading above its buttons.
- The creator row (25 logos) wraps at every width. On a phone the first ten
  are on screen and one 44px Show All button reveals the rest; on desktop
  every creator is in view in two rows.
- The active-filter list wraps.
- Continue Watching and New This Week were horizontal card strips. They are
  grids (two columns on a phone, fluid on desktop) of four cards with a 44px
  Show All button for the rest. The viewer's Up Next row, which was a strip
  on desktop and culled outright on phones and tablets, is a grid inside the
  viewer's scrolling info bar on every width.
- `keepRailButtonInView` (which scrolled the chosen control into the strip)
  and its two refs are gone; a keyboard choice lands focus on the control
  instead. Three older tests pinned the rail (`ref={filterRailRef}`,
  `ref={sourceRailRef}`, `keepRailButtonInView`, `mask-image`, the 760px
  block, the page's own safe-area pad); each pin was MOVED with its reason.

## 2. Shell, foundation, text, targets

`<HubPageShell className="video-library" maxWidth={1600}>` owns the shell
(the world background and padding stay on `.video-library-page`); the page's
own `<main>` is a `<section>` so the document has one main. `useLoadFailsafe`
caps the catalog skeleton at eight seconds. `PullToRefresh` re-reads the
catalog, disabled while the viewer, Reels or the playlist sheet is open.
`requireOnline()` guards the refresh, with a haptic. `useModalHistory` on the
viewer, the Reels viewer and the playlist sheet, so Back closes them before it
leaves the route.

The page's three bottom pads (`paddingBottom: 70`, `calc(82px + env(...))`,
`calc(78px + env(...))`) are gone: `BottomNavSpacer` in `_app.js` owns that
clearance and the route is in `bottom-nav-routes.json`. `100vh` becomes
`100dvh` (the rail's min and max height, the page), `overflowX: 'hidden'`
becomes `clip`. Breakpoints 480 / 760 / 761 / 767 / 1024 / 1025 / 1180 become
768 / 769 / 900; the 1180 block (a two-column video grid) is replaced by a
fluid `auto-fill` grid that gives three columns beside the rail at 1280 and
two under 1180 without a fourth breakpoint.

Text: 37 CSS rules and 22 inline declarations under 12px (7px, 8px, 9px,
10px, 11px in the `font:` shorthand and `fontSize`) are 12px. Targets: the
non-featured play button (34px), the Continue Watching action (32px), the
Dismiss button and the search box are 44px.

## 3. The tutorial

`src/tutorials/video-library.js`: eight Title Case steps (Welcome To The
Video Library, Browse My Library Order Format, Search The Library, Creators,
New This Week, Continue Watching, The Video Grid, Where To Find This Again),
no em dashes, registered as a PREFIX row for `/hub/video-library`. Targets:
`filters` and `count` on the command rail component; `search`, `sources`,
`new`, `continue`, `main`, `grid` on the page.

## 4. Tests, laws, budget

- `__tests__/video-library-mobile-upgrades.test.mjs` (new, 8 tests): the
  foundation, no rail pattern anywhere on the surface with every row a grid
  or a wrap, the caps and their 44px buttons, no cull, `100dvh` / `clip` /
  no page-owned bottom pad / the sanctioned breakpoints, the 12px floor read
  as a number, the tutorial with its targets, and the budget row.
- Imported by `__tests__/_test-guards-exist.test.mjs` (CHECK 8).
- `__tests__/no-slide-to-see.law.test.mjs`: `CONVERTED = [1, 2, 3, 4, 5, 6, 7, 9]`.
- `__tests__/page-tutorials.test.mjs`: phase 9 in `LANDED` (the command rail
  component under `also`).
- `scripts/ci/mobile-budget.json`: `/hub/video-library` flipped to
  `converted: true`, LCP 3500 to 2500ms.
- Training surface inventory regenerated (the tutorial registry is
  training-reachable).
