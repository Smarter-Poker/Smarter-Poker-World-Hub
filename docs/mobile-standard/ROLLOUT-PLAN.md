# Always-Displayed Mobile Rollout: 10 Phases

Standard: `ALWAYS-DISPLAYED-MOBILE-STANDARD.md`. Order is Dan's, 2026-09-03.
One phase per pull request. Each phase ends with the definition-of-done
checklist and a changelog file. Nothing in a later phase may start before
the earlier phase is merged.

Every path is in `Smarter-Poker-World-Hub` unless stated. The five sister
repos (`Smarter-Poker-Training`, `-Near-Me`, `-Assistant`, `-Trivia`) are
libraries or static landings, not the pages; `diamond-arena` is the one
real exception (phase 8).

## Phase 1: Bankroll Manager (LARGE)

Files: `pages/hub/bankroll-manager.js` (2,608), `src/styles/worlds/bankroll.css` (350), `src/components/bankroll/**`.

Violations: `.bankroll-sidebar { display:none }` at <=768 (css:188); the
14-pill `.bankroll-mobile-nav` horizontal rail with hidden scrollbar
(css:238-251); `.bankroll-analytics-slider` snap carousel, 85% cards
(css:308-325); `activeSection` unmounts all but one of 14 sections
(js:216, 797+); `overflowX:'auto'` tables in `VenueIntelligence.jsx:302`,
`DealerVault.jsx:772, 798`.

Work: render all sections stacked with anchor jump links (the pill row
becomes a wrapping anchor grid, not a scroller); analytics slider becomes
a one-column stack at <=768 and a 2-col grid above; tables become stacked
cards at <=768; keep `dynamic(ssr:false)` guards; route already in
`bottom-nav-routes.json`.

## Phase 2: Preflop Charts + full tutorial (MED-LARGE + new component)

Files: `pages/hub/memory-games.js` (3,448; `preflop-charts.js` re-exports it),
`src/styles/worlds/memory-games.css` (3,318), `src/components/memory-games/*`,
`pages/hub/memory-games/tutorial.js` (static, 47 lines, not a walkthrough).

Violations: `.preflop-mode-rail` snap carousel at <=900 (css:1558-1572,
2910, 3025-3040); `.preflop-subpage-nav` hidden-scrollbar strip (css:2909-2930);
`.preflop-lab-grid-scroll` (css:2509) and `.preflop-ranking-scroll` (css:3151).

Work: mode picker becomes a wrapping grid; subpage nav becomes a wrapping
row; 13x13 matrix scales to fit 375 (`aspect-ratio:1; width:100%`, cell
font `clamp(8px, 2.2vw, 12px)`) instead of scrolling; ranking list
stacks. TUTORIAL: build `src/components/memory-games/PreflopTutorial.jsx`
by generalising `src/components/poker-near-me/InteractiveTutorial.jsx`
(the only working in-app walkthrough). Steps: what a preflop chart is,
reading the 13x13 matrix (suited above / offsuit below / pairs diagonal),
positions and the position selector, the actions and colour legend
(raise/call/fold/3-bet), how the memory drill scores, the daily challenge,
the review panel and the Jarvis explanation, where stats/leaderboard/
achievements live. Launch automatically on first visit (localStorage key
`preflop_tutorial_seen_v1`, try/catch), replayable from a "Tutorial"
button that is always visible in the page header row, bottom-sheet on
phones (z >= 900), every step >= 44px controls, no auto-advance.
`pages/hub/memory-games/tutorial.js` becomes a page that mounts the same
component in "page mode".

**Shipped 2026-09-04** (`docs/changelog/2026-09-04-mobile-phase2-preflop-charts.md`):
mode grid, wrapping subpage nav, ResponsiveTable leaderboard, the matrix
fits 375 as one drag-to-paint control, HubPageShell + the full upgrade set,
eight-step tutorial registered for both routes with the menu primer
carrying the in-game targets, budget row converted.

## Phase 3: Poker Near Me (LARGE, the worst offender)

Files: `pages/hub/poker-near-me/[pnmTab].js` (4,556), `lobby.js` (3,964),
`src/styles/worlds/poker-near-me.css` (1,300), `styles/poker-near-me.css`
(4,158, root-level, also live), `src/components/poker-near-me/**` (24,909).

Violations: swipe-to-change-tab gesture (`[pnmTab].js:1056, 3242-3300`,
comment "swipe is the only in-page navigation on mobile"); 6 tabs + 2
sub-tab sets unmount inactive content; `.pnm-family-nav__label
{ display:none }` (css:858); rails at css:145, 255, 883, 1182, 1201;
`styles/poker-near-me.css:110, 436, 1090, 1125, 3043, 3200, 3236, 3260,
3345`; `DailyTournamentsPanel.jsx:557, 628`; `BestTimeToGoWidget.jsx:420`;
`VenueReviews.jsx:554`; `VenueCompare.jsx:276`.

Work: delete the swipe handlers; tabs stay as anchors, all six panels
render stacked (map panel keeps a fixed height, `touch-action: pan-y` on
the page so the map does not eat the scroll); labels return; every rail
wraps; the compare table becomes stacked cards. The existing
`InteractiveTutorial` keeps working with stacked sections (targets become
scroll-into-view instead of tab-switch).

**Shipped 2026-09-04** (`docs/changelog/2026-09-04-mobile-phase3-poker-near-me.md`):
swipe navigation deleted, six panels stacked under an anchor row on both
pages with lazy mounting, every rail wraps, the map fixed-height with
`touch-action: pan-y`, VenueCompare a ResponsiveTable, HubPageShell + the
full upgrade set, eight-step tutorial as a prefix route, budget row
converted; the old InteractiveTutorial retired.

## Phase 4: Personal Assistant (MEDIUM)

Files: `pages/hub/personal-assistant/index.js` (748), `sandbox.js` (6,487),
`leaks.js` (3,725), `src/styles/worlds/PersonalAssistantHub.module.css`,
`PersonalAssistantTools.module.css`.

Violations: `.tabs` snap carousel at <=640 (Hub.module.css:894-921);
`.loopLabel`, `.sessionDate { display:none }` (883, 1019); `leaks.js:3537-3556`
"Deliberate horizontal snap carousel" of trend points.

Work: `.tabs` wraps into a 2-col grid; labels return; trend points become
a wrapping row of 44px chips (keeps the tap target the carousel was
protecting).

**Shipped 2026-09-09** (`docs/changelog/2026-09-09-mobile-phase4-personal-assistant.md`):
the five section anchors are a wrapping grid, the Decision Loop keeps its
label and every session keeps its date, the leaks trend row and the Coaching
workspace's six views both wrap, the double bottom pad is gone (the page had
its own on top of BottomNavSpacer), 100dvh and overflow-x clip everywhere, 30
sub-12px declarations re-laid, four breakpoints down to three, the full
phase 0a set, and an eight-step tutorial registered for the whole prefix so
the hub, leaks and the evidence gate all offer it. Budget row converted.

## Phase 5: Training Games (LARGE by file count)

Files: `pages/hub/training.js` (1,745), `pages/hub/training/**` (~100 files),
`src/styles/worlds/training.css` (5,104, 31 media blocks),
`src/components/training/**`.

Violations: shared `[data-pills-row]` snap rail (training.css:2432-2452)
used by 7 pages; `.sp-cat-chips` rail (training.js:1148, 1686);
`display:none` culls at training.css:827, 849, 4966, 5059, 5075; ~25
`overflowX:'auto'` tables/strips across pages and components; 13
different breakpoints.

Work: redefine `[data-pills-row]` ONCE as a wrapping row (fixes 7 pages);
category chips wrap; culled labels return; tables become stacked cards;
consolidate breakpoints to 900/768/600.

**Shipped 2026-09-13** (`docs/changelog/2026-09-13-mobile-phase5-training-games.md`):
`[data-pills-row]` redefined once as a wrapping grid for all six adopters, the
category chips and three component rails wrapped, five culls returned to
layout, 866 sub-12px nodes on the hub to 0 (3,016 declarations across 400
files), 104 x 100vh and 60 x overflow-x hidden fixed, fifteen breakpoints to
three, the phase 0a set on the hub, and an eight-step tutorial registered for
the whole prefix. Measured clean at 375 and 390 on eight routes. Budget row
converted.

## Phase 6: Poker News (MED-LARGE)

Files: `pages/hub/news.js` (4,407), `src/components/news/LiveWireStyles.js`
(1,214), `NewsBox.js`, `ReelCard.js`, `VideoCard.js`.

Violations: reels carousel with arrow buttons (news.js:1892-1903, 3425-3470,
4172-4196); 5 `.section-tab`s unmount inactive sections (1463-1507);
sidebar widgets `display:none` at <=1000 (LiveWireStyles:865-880);
`.section-tabs` scroll strip with 8px font (930-944); kicker/freshness
culls (918-922); 200-line `!important` override block (4073+).

Work: reels become a 2-col grid at <=768 (3 rows visible, "See all reels"
button); five sections render stacked under headings, tab row becomes
anchors; sidebar widgets move under the main column instead of vanishing;
delete the override block and put the rules in the styled-jsx they were
bypassing (or one plain `<style>`), no styled-jsx global blocks.

**Shipped 2026-09-13** (`docs/changelog/2026-09-13-mobile-phase6-poker-news.md`):
all five sections stacked with the tab row as anchors, the 8px tab strip a
wrapping grid at 12px, the reels preview carousel and its arrows gone (the
full reels grid sits directly below), the sidebar under the feed with every
widget, seven culls returned, 59 sub-12px nodes and 9 tiny targets to 0,
100dvh / clip, breakpoints to 900/768/600, the phase 0a set, an eight-step
tutorial. The override block stays as the one plain <style> (its !importants
are what beat the component-scoped styles) with its violating rules fixed.
Two lessons for every later phase that stacks sections: (1) an auto-loading
feed above other sections starves them (the news sentinel grew the page
7,000px during one anchor scroll), so a feed on a stacked page pages with a
44px Load More button, not an IntersectionObserver; (2) `_app.js` used to
scroll to top on every routeChangeComplete, shallow included, which undid
any in-page scroll made alongside a `?query` replace; it now skips shallow
changes, platform-wide.

## Phase 7: Poker Trivia (SMALL-MED)

Files: `src/components/trivia/TriviaLobby.jsx` (1,973),
`pages/hub/trivia/tournaments.js` (2,043), `stats.js`.

Violations: `.mode-filters` snap strip (Lobby:1295-1332); bracket
`overflow-x:auto` (tournaments:1467-1475); `stats.js:335` table.

Work: mode filters wrap; the bracket is redesigned as a vertical round-by-
round list on phones (round heading, then match cards); stats table
stacks.

**Shipped 2026-09-14** (`docs/changelog/2026-09-14-mobile-phase7-poker-trivia.md`):
the filter rail a wrapping grid (keyboard roving kept, sticky strip gone),
the bracket a grid that stacks one round per row on a phone, the stats and
leaderboard tables ResponsiveTable, 112 sub-12px nodes on the lobby and 60
on achievements to 0, 14 `100vh` to `100dvh`, breakpoints to 600/768/900
across the whole trivia surface, the phase 0a set on the lobby, an
eight-step tutorial. Four older lobby tests pinned the rail and the 700px
block; each pin was moved with its reason.

## Phase 8: Diamond Arena (SMALL here, real work in `diamond-arena`)

Files: `pages/hub/diamond-arena.js` (286, an iframe of
`https://diamond.smarter.poker`), `src/styles/worlds/diamond-arena.css` (26).
Real UI: `/Users/smarter.poker/Documents/diamond-arena` (Vite).

Work: hub page gets the shell (100dvh iframe below the header, no
paddingBottom guess); then the same audit and conversion inside the
`diamond-arena` repo, shipped on its own pipeline. Subpages
(schedule/leaderboard/table-settings/stats/history) get the standard
shell.

**Retired 2026-09-14 (nothing to convert).** The six standalone
`/hub/diamond-arena*` pages, their iframe and their CSS were removed on
2026-09-09 by #1701 ("make Poker Arena the shared World Hub entrance"):
Diamond now lives inside Club Arena's shared Poker Arena selector, under
Club Arena's own 12-phase programme, repo, pipeline and #ClubArenaConsole
standard. `diamond.smarter.poker` returns 404 and the `diamond-arena` Vite
repo is closed (its crons and Vercel project removed). The no-slide-to-see
law already lists the active phases as 1 to 7, 9 and 10, and pins that the
retired Diamond targets stay absent. Phase 8 is therefore complete by
retirement, not skipped: there is no World Hub surface left to bring to the
standard, and the Diamond UI is Club Arena's to hold to its own rules.

## Phase 9: Video Library (MED-LARGE)

Files: `pages/hub/video-library.js` (3,229), `src/styles/worlds/video-library.css` (1,739).

Violations: `.vl-type-toggle-row` snap strip with mask fade (css:1412-1440);
`.vl-source-pills` (347-366); `.vl-active-filter-list` (538-542);
`.vl-cw-scroll` / `.vl-new-week-scroll` rails (352-358, js:2042);
culls at 1400, 1426, 1442, 1488, 1659; js `overflowX:'auto'` at 1738,
1936, 2864.

Work: all four rails become 2-col grids at <=768 (continue watching and
new this week show 4, then "Show more"); labels/logos return; keep the
SSR-safe viewport pattern at js:373.

**Shipped 2026-09-14** (`docs/changelog/2026-09-14-mobile-phase9-video-library.md`):
the command controls a two-column grid under their group headings, the
creator row wrapping (ten then Show All on a phone), the active filter list
wrapping, Continue Watching and New This Week grids of four then Show More,
Up Next a grid inside the viewer instead of a cull, the rail scroller and
its refs gone, four culls returned, 182 sub-12px nodes at 375 to 0, 100dvh,
the page's three bottom pads gone (BottomNavSpacer), breakpoints
480/760/761/767/1024/1025/1180 to 768/769/900 with a fluid video grid,
the phase 0a set, an eight-step tutorial. Four pins in the phase 5/7/8
video-library tests were moved with their reasons.

## Phase 10: Odds Calculator (SMALL)

File: `pages/hub/poker-tools.js` (726), route `/hub/poker-tools`.

Violations: none of the rail kind; `whiteSpace:'nowrap'` at 284; no
hydration guards; `paddingBottom:70` boilerplate.

Work: standard shell; card picker grid `repeat(auto-fill, minmax(44px,1fr))`;
results as stacked cards at <=768; verify at 375.

**Shipped 2026-09-14** (`docs/changelog/2026-09-14-mobile-phase10-odds-calculator.md`):
the picker an auto-fill grid at 44px (52 cards from 22px targets to 44px),
the equity as one stacked card per seat under the picker, the page-owned
header and settings sheet replaced by the shared header and hamburger (so
the Page Tutorial row exists), haptics on cards and Calculate, 100dvh, no
page-owned bottom pad, every control 44px, the 10px badges and 8px
watermark floor to 12px, an eight-step tutorial. The failsafe, pull to
refresh and offline guard are deliberately not wired: the calculator has no
network. With this phase every one of Dan's original ten routes is converted
(8 retired).

## Phase 11: Toke Tracker (MED, added 2026-09-14)

Not in Dan's original ten. It is here because when phase 10 closed that list,
Toke Tracker was the only World menu root still unconverted that is a real
page: `/hub/my-clubs` and `/hub/marketplace` are both `getServerSideProps`
redirects (retired 2026-09-08 and to the Diamond Store respectively) with no
UI to convert, and `mobile-budget.json` keeps them `converted: false` for
that reason. Leaving Toke Tracker out would have left one of the thirteen
menu roots on the old standard for ever.

Files: `pages/hub/toke-tracker/{index,shift,analytics,vault,venues}.js`
(1,093 lines) plus the five components they mount from
`src/components/bankroll` (`TokeTracker` 2,540, `DealerVault` 1,045,
`TokeDashboard` 602, `TokeCalendar` 584, `VenueIntelligence` 290).

Violations: two hidden-content tab strips (four charts, four document
categories); a year calendar drawn three months across a phone, so every day
was a 15px target and the 44px grid existed only for the one expanded month;
28x28 year arrows; a 14px input; a 300px inner scroller over the day's
downs; `100vh` / `paddingBottom: 70` / `overflowX: hidden` on all five pages;
the same forty lines of preference state copied into all five.

**Shipped 2026-09-14** (`docs/changelog/2026-09-14-mobile-phase11-toke-tracker.md`):
all five pages on `HubPageShell` with one shared `useTokePrefs` hook, every
chart and every document category rendered stacked under its own heading,
the calendar one 44px grid per month bounded by a Show All button, pull to
refresh and the offline guard on the four rooms, the load failsafe on the two
that fetch, haptics, `useModalHistory` on all eight sheets, 16px inputs, a
12px floor, and an eight-step tutorial registered for the prefix.
`CONVERTED = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11]`.

## Every phase, in addition to its page work (added 2026-09-03)

1. Build on the Phase 0 foundation: `HubPageShell`, `useLoadFailsafe` +
   `useInitialLoadRef`, `useModalHistory` on every modal, `useHaptics`,
   `ResponsiveTable`, `PullToRefresh`, `requireOnline`, sheets at 600px with
   a 44px X below the status bar, 16px inputs, `--sp-header-height` for any
   sticky bar, no font under 12px, lazy-load below-the-fold panels.
2. Register the page tutorial (`src/tutorials/<page>.js` + registry row +
   `LANDED` row in `__tests__/page-tutorials.test.mjs`), with spotlight
   targets on the rebuilt DOM.
3. Flip the route's row in `scripts/ci/mobile-budget.json` to
   `converted: true` and lower its numbers to the measured baseline.
4. Append the phase number to `CONVERTED` in
   `__tests__/no-slide-to-see.law.test.mjs`, and import every new test file
   in `__tests__/_test-guards-exist.test.mjs` (CHECK 8 fails on a guard
   nothing runs).
5. Verify at 375/390/1280 with Playwright (overflow, tutorial prompt, a
   sheet's close position and size), run the mobile/overlay/tutorial/law
   tests, `npx tsc --noEmit`, `npx next build`, then push and confirm
   `/api/health` serves the squash SHA before starting the next phase.

## Cross-cutting, done once in Phase 1's PR

- `docs/mobile-standard/*` (this folder).
- A law test `__tests__/no-slide-to-see.law.test.mjs` that scans the ten
  page files and their world CSS for `scrollbar-width: none`,
  `scroll-snap-type`, and `::-webkit-scrollbar { display: none }`, with an
  allowlist that shrinks by one phase per PR. Phase 1 lands it with nine
  pages allowlisted.
