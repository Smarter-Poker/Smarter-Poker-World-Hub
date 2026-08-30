# World Hub Dynamic Footer Audit

## Decision

World Hub uses one app-shell footer component with 14 route-selected navigation definitions. This gives every requested world its own destinations, icon set, active state, and accent without returning to page-level footer mounts. Every definition contains six controls so the full footer fits at 320px without a horizontal carousel.

Club Arena is a separate application boundary. `/hub/club-arena` remains footerless, while Club Arena internal pages continue to use the Club Arena footer owned by that application.

## Audited footer destinations

| World | Footer controls, left to right | What each click opens |
| --- | --- | --- |
| Personal Assistant | Coach · Sandbox · Leaks · Train · Charts · Odds | Assistant home · GTO Sandbox · Leak Finder · Training library · Preflop Charts · Poker Odds Calculator |
| Training Games | Library · Play · Daily · Progress · Goals · Ranks | Training library · Play Mode · Daily Challenge · Player progress · Training challenges · Training leaderboard |
| Poker News | Latest · Videos · Reels · Events · Saved · Sources | News feed · Video news filter · Reels filter · Events filter · Bookmarked stories · Source management |
| Poker Trivia | Lobby · Daily · Arcade · PvP · Stats · Ranks | Trivia lobby · Daily challenge · Quick-play arcade · Head-to-head trivia · Player statistics · Trivia leaderboard |
| Social Media | Feed · Create · Friends · Chat · Reels · Pages | Social feed · Post composer · Friends · Messenger · Poker Reels · Social Pages |
| Diamond Arena | Arena · Schedule · Ranks · Stats · History · Store | Arena lobby · Tournament schedule · Arena leaderboard · Player statistics · Hand history · Diamond Store |
| My Clubs | Clubs · Arena · Pages · Venues · Games · Hub | Followed clubs · footerless Club Arena lobby · Club social pages · Followed venues · Home games · World Hub |
| Video Library | Videos · Cash · Tourneys · Saved · History · Later | All videos · Cash-game filter · Tournament filter · Favorites · Watch history · Watch Later |
| Odds Calculator | Odds · Equity · ICM · Preflop · Hand Lab · Hub | Main multi-game calculator · Equity calculator · ICM calculator · Preflop Charts · Hand Lab · World Hub |
| Bankroll Manager | Summary · Log · Trips · Reports · Rules · Export | Dashboard · Session entry · Trip tracker · Reports · Bankroll rules · Data export |
| Toke Tracker | Tokes · Shift · Stats · Vault · Taxes · Venues | Toke dashboard · Shift tracker · Analytics · Dealer Vault · Tax summary/export · Venue intelligence |
| Preflop Charts | Charts · Speed · Stats · Ranks · Awards · Tutorial | Range lab · Speed Drill · Player statistics · Leaderboard · Achievements · How-to-play guide |
| Poker Near Me | Nearby · Venues · Events · Games · Map · Saved | Poker Near Me lobby · Venue directory · Event directory · Live games · Map view · Saved places |
| Marketplace | Market · Diamonds · Merch · Clubs · VIP · Orders | Marketplace home · Diamond Store · Merchandise Store · Club Shop · VIP Membership · Order history |

The short visible labels are intentional: their full names remain available as accessible names and native titles, while every visible icon and label stays inside its equal-width control on narrow screens.

## Route ownership

- Personal Assistant owns `/hub/personal-assistant/**`.
- Training owns `/hub/training/**`, GTO Trainer, Poker Brain, and the legacy `/pokerbrain` surface.
- News owns `/hub/news/**` and article reader routes.
- Trivia owns `/hub/trivia/**`.
- Social owns feed, post, reels, friend, messenger, social-page, saved-post, and public-user routes.
- Diamond Arena owns `/hub/diamond-arena/**`; entering Diamond Store intentionally changes to the Marketplace footer.
- My Clubs owns My Clubs, My Venues, Home Games, and venue-detail routes. Entering Club Arena crosses to Club Arena ownership.
- Video Library owns `/hub/video-library/**`.
- Odds Calculator owns `/hub/poker-tools/**`; linked training tools change to their destination world's footer.
- Bankroll Manager owns Bankroll Manager and legacy Bankroll routes.
- Toke Tracker owns `/hub/toke-tracker/**`.
- Preflop Charts owns Preflop Charts and legacy Memory Games routes.
- Poker Near Me owns its route tree plus events, daily tournaments, tours, series, and tour-detail routes.
- Marketplace owns Marketplace, Diamond Store, Merchandise Store, Club Shop, VIP Membership, and Smarter Rewards routes.

Routes outside those worlds continue to receive the six-control platform fallback only when they are present in the existing bottom-navigation route policy.

## Problems found and corrected

1. The previous implementation used the same six social/platform destinations on every footer-enabled page.
2. The exact-route manifest gave many world landing pages a footer but omitted most of their child pages.
3. Marketplace detail shells and Preflop subpage shells independently mounted another footer, creating a duplicate-footer risk.
4. Profile gallery components retained obsolete footer imports, including one live modal mount.
5. The previous active-state logic was hard-coded to social destinations and could not represent query-backed world views.

The new registry resolves the actual URL by owned prefix, picks the most specific path/query destination for `aria-current`, uses intent-only prefetch, and keeps one app-shell spacer. The footer is a six-column `minmax(0, 1fr)` grid with a 56px fixed height, safe-area padding, clipped nav overflow, compact responsive labels, and no translate or slide behavior.

## Verification contract

- Registry test: all 14 world IDs, six unique controls each, unique footer signatures, valid destinations, short labels, icons, and accessible titles.
- Ownership test: one mount and one spacer in `_app`, no page or feature-shell mounts, and an explicit Club Arena exclusion.
- Cross-browser E2E: all 14 representative routes at 320px, all controls/icons/labels inside bounds, correct href order, fixed bottom geometry, no footer overflow, seven viewport sizes, and Chromium/WebKit projects.
- Legacy coverage: the platform fallback and the footerless Club Arena lobby remain regression-tested.
