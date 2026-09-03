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

## Phase 7: Poker Trivia (SMALL-MED)

Files: `src/components/trivia/TriviaLobby.jsx` (1,973),
`pages/hub/trivia/tournaments.js` (2,043), `stats.js`.

Violations: `.mode-filters` snap strip (Lobby:1295-1332); bracket
`overflow-x:auto` (tournaments:1467-1475); `stats.js:335` table.

Work: mode filters wrap; the bracket is redesigned as a vertical round-by-
round list on phones (round heading, then match cards); stats table
stacks.

## Phase 8: Diamond Arena (SMALL here, real work in `diamond-arena`)

Files: `pages/hub/diamond-arena.js` (286, an iframe of
`https://diamond.smarter.poker`), `src/styles/worlds/diamond-arena.css` (26).
Real UI: `/Users/smarter.poker/Documents/diamond-arena` (Vite).

Work: hub page gets the shell (100dvh iframe below the header, no
paddingBottom guess); then the same audit and conversion inside the
`diamond-arena` repo, shipped on its own pipeline. Subpages
(schedule/leaderboard/table-settings/stats/history) get the standard
shell.

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

## Phase 10: Odds Calculator (SMALL)

File: `pages/hub/poker-tools.js` (726), route `/hub/poker-tools`.

Violations: none of the rail kind; `whiteSpace:'nowrap'` at 284; no
hydration guards; `paddingBottom:70` boilerplate.

Work: standard shell; card picker grid `repeat(auto-fill, minmax(44px,1fr))`;
results as stacked cards at <=768; verify at 375.

## Cross-cutting, done once in Phase 1's PR

- `docs/mobile-standard/*` (this folder).
- A law test `__tests__/no-slide-to-see.law.test.mjs` that scans the ten
  page files and their world CSS for `scrollbar-width: none`,
  `scroll-snap-type`, and `::-webkit-scrollbar { display: none }`, with an
  allowlist that shrinks by one phase per PR. Phase 1 lands it with nine
  pages allowlisted.
