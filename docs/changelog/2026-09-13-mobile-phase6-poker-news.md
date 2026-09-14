# 2026-09-13: Always-Displayed Mobile Standard, Phase 6 (Poker News)

Dan, 2026-09-03: phase 6 of the mobile rollout is Poker News. Standard:
`docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`; every-phase list:
`ROLLOUT-PLAN.md`. Routes: `/hub/news` and `/hub/news/sources`.

## 1. Five sections, one page

`/hub/news` was a tabbed app: News, Reels, Videos, Events and Read Later each
rendered only while its tab was active (`activeSection === 'x' && (...)`), so
four fifths of the page was off screen at any moment. All five render now,
stacked under their headings with anchor ids (`news-section-news` and so
on). The tab row is a `<nav>` of anchors: no `tablist` semantics, no roving
tabindex, natural tab order, `aria-current` on the chosen section.
`selectSection` keeps its contract (the persisted preference and the
`?tab=` / `?filter=` query still work, so a deep link and the hamburger's
section links still land where they said) and additionally SCROLLS to the
section instead of swapping it in.

## 2. No slide to see

- The section tab row was a hidden-scrollbar strip of 108px cards at **8px**,
  the smallest type on the page, with two of the five off the right edge. It
  is a wrapping `auto-fit` grid of 44px anchors at 12px.
- The reels preview strip in the News section (ten cards, arrow buttons, a
  scroll strip, `reelsCarouselRef`) is gone, and its twelve CSS rules with
  it: the full Reels section is on the page directly below, so the strip was
  the same content twice and the only part of it that scrolled sideways. The
  reels grid is two columns at phone width.
- The source-filter chips were a sideways rail (`.source-filters`
  `overflow-x: auto`) with Card Player cut off at 375. They wrap.

## 2b. A bounded page: Load More and Show All, not an infinite feed

Stacking five sections exposed two things a tabbed page had hidden.

- The news feed loaded itself as you scrolled (an IntersectionObserver
  sentinel asking for the next page 200px before the viewport reached it).
  With Reels, Videos, Events and Read Later stacked UNDER the feed, a thumb
  heading for Events dragged that sentinel through the viewport and the feed
  grew underneath: measured at 375, one anchor scroll to Events took the
  page from 13,931px to 20,807px and Events landed 7,000px lower than the
  tap had asked. An infinite feed above four sections starves them. The next
  page is a 44px full-width Load More Stories button now (with the count
  waiting), the same control as the Reels and Videos Show All caps: eight of
  each at first, one tap for the rest. The page has a bounded height and
  every section is reachable.
- The app shell (`pages/_app.js`) scrolled to the top on EVERY
  `routeChangeComplete`, shallow included, 100ms after the event. Next's own
  router declines to reset scroll on a shallow route (`router.js`:
  `shouldScroll = options.scroll ?? !isValidShallowRoute`); the shell ignored
  that, so every page that records a filter, a search or a section in its
  own `?query` yanked the reader to the top a tenth of a second later. On
  this page it undid the section scroll the tap had just made. The shell now
  reads the `shallow` flag and leaves a shallow change where it is. This is
  platform-wide, and it is the root of the defect, not a timer around it.

## 3. Nothing is culled, and the sidebar is under the feed

- The sidebar used to jump ABOVE the main column on a phone (`order: -1`, in
  three places) as a three-up strip and cull every widget but three
  (`.widget:not(.leaderboard):not(.events):not(.newsletter) { display: none }`),
  so the trending, sources and digest widgets simply vanished. Every widget
  stays, two up at 900 and one up at 600, under the main column, which is
  what ROLLOUT-PLAN phase 6 asked for. The `news-intelligence-phase-7` pin
  that expected the cull and the `order: -1` was MOVED to pin the opposite,
  with the reason recorded.
- Six more content culls are layout again: the desk kicker and freshness
  label (the one line saying how old the feed is), the story excerpt on every
  card but the first (now clamped to two lines), the view counts, the
  bookmark count beside the view toggle, and the list rows' bookmark / share
  actions (a phone could read a story but not save it).

## 4. Shell, foundation, text, targets

`<HubPageShell className="news" maxWidth={1280}>` owns the shell. The page's
own `padding-bottom: 70px` / `74px` and the sources route's `paddingBottom:
70` are gone: `BottomNavSpacer` in `_app.js` owns that clearance and both
routes are in `bottom-nav-routes.json`. `100vh` becomes `100dvh` (four
places) and bare `overflow-x: hidden` becomes `clip` (five).

`useLoadFailsafe` caps the feed's SWR `isLoading` at eight seconds.
`requireOnline()` guards the feed refresh. `PullToRefresh` re-reads every
feed (news, reels, videos, events) together, disabled while any overlay is
open. `useModalHistory` on the share dialog, the reel viewer and the article
reader, so Back closes them before it leaves the route.

Text: 59 rendered nodes under 12px (44 at 8px) to 0, across `news.js` (25
declarations), `LiveWireStyles.js` (14 base rules plus the phone block),
`NewsBox`, `ReelCard`, `VideoCard`, `MSPTBox`, `SourcePlaceholderBox`.
Targets: 9 under 44px to 0 (the read-later overlay button, card actions,
list actions, the search clear, the view toggle, the breaking ticker, the
freshness / sort / alert buttons). Two pre-existing layout defects found by
measuring and fixed because the rules were the ones being edited: compact
cards rendered NO title at 375 (a duplicated grid put the card in a 96px
column and its text column computed to 0px), and the hero card's text was
clipped at both edges (`width: 100%` content-box plus 32px padding).

Breakpoints 390 / 768 / 1000 became 600 / 768 / 900.

## 5. The tutorial

`src/tutorials/news.js`: eight Title Case steps (Welcome To The Live Wire,
Five Sections One Page, The News Feed, Poker Reels, Poker Videos, Upcoming
Events, Read Later And Bookmarks, Where To Find This Again), no em dashes,
registered as a PREFIX row for `/hub/news`. Targets: `sections`, `news`,
`reels`, `videos`, `events`, `later`.

## 6. Tests, laws, budget

- `__tests__/news-mobile-upgrades.test.mjs` (new, 7 tests): the foundation,
  every section always rendered with its anchor id and the tab row an anchor
  list, the shell's shallow-change scroll exemption, no auto-loading feed
  (Load More and Show All are 44px buttons), no rail / no preview carousel /
  no cull / no `order: -1`, `100dvh`
  and `clip` and the three breakpoints, the 12px floor read as a number, the
  tutorial with its targets, and the budget row.
- Imported by `__tests__/_test-guards-exist.test.mjs` (CHECK 8).
- `__tests__/no-slide-to-see.law.test.mjs`: `CONVERTED = [1, 2, 3, 4, 5, 6]`;
  the phase 5 test's exact-array pin moved to a prefix check.
- `__tests__/page-tutorials.test.mjs`: phase 6 in `LANDED`.
- `scripts/ci/mobile-budget.json`: `/hub/news` flipped to `converted: true`,
  LCP 3500 to 2500ms.
