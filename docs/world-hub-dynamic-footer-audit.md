# World Hub Exact-Artwork Footer Audit

## Architecture decision

World Hub uses one authoritative app-shell footer engine, `src/components/ui/BottomNavBar.jsx`, mounted once by `pages/_app.js`. Route ownership, the exact approved asset, its immutable SHA-256, native dimensions, measured control-panel bounds, accessible names, and the six preserved destinations live in `src/config/world-footer-navigation.json`.

For the 14 migrated families, the engine renders the supplied PNG as one unedited `<img>` with `object-fit: contain`. Six transparent, equal-width semantic links are positioned over the visible control panel. The overlay adds no icons, labels, frame, color, filter, glow, crop, or active-state artwork. The complete source canvas remains visible and proportional at every width.

The footer is fixed to the viewport bottom. An app-shell spacer uses the same artwork aspect ratio so page content is not hidden. The implementation has no horizontal carousel, translate, hide animation, or slide behavior.

## Exact approved assets

| Family | Original supplied file | Production asset | Native size | SHA-256 |
| --- | --- | --- | ---: | --- |
| Personal Assistant | `FOOTER PERSONAL ASSISTANT.png` | `footer-personal-assistant.png` | 2135×737 | `af8f8140bc1bacd737d09a70a52a0423ab97716db0470bf7a1687356c13d534a` |
| Training Games | `FOOTER TRAINING GAMES.png` | `footer-training-games.png` | 2081×755 | `0430a6a65890ff5a843a9475a3c52b76f6fa433bdb410b3b5c977f8ffc96c81f` |
| Poker News | `FOOTER POKER NEWS.png` | `footer-poker-news.png` | 2172×724 | `625e2398ffe6e2ea6e4d0262669f3d18e6666f49a479e71c73ffe09ef1677d72` |
| Poker Trivia | `FOOTER POKER TRIVIA.png` | `footer-poker-trivia.png` | 1916×821 | `74414010661c620a2c7948c046f0da0368faed1a2d1bddc95d9ac9f6ad2e27c9` |
| Social Media | `FOOTER SOCIAL MEDIA.png` | `footer-social-media.png` | 2508×627 | `fc640b5d5e21107fb1fc999c09b02a76f8ca26a577234eb01bcdd679594bea53` |
| Diamond Arena | `FOOTER DIAMOND ARENA.png` | `footer-diamond-arena.png` | 2172×724 | `8388cb9da604d220ca67d5628d3afd68a85a209c0b464e039629161e0e431dcb` |
| My Clubs | `FOOTER MY CLUBS.png` | `footer-my-clubs.png` | 2172×724 | `67e6608b10b1f6463177a1034a31183a7c45b7c8313f3d603d0d06dcff9e3307` |
| Video Library | `FOOTER VIDEO LIBRARY.png` | `footer-video-library.png` | 1916×821 | `ade22c3bf2537f89dbfc6a3382cdec2cafcc9d140fefe54fa5bbaf0e7f7008a2` |
| Odds Calculator | `FOOTER ODDS CALCULAOR.png` | `footer-odds-calculator.png` | 2172×724 | `fcd24023d46edd3650001023552a1e7a44660d7a9b4b262c3407a94d60e40792` |
| Bankroll Manager | `FOOTER BANKROLL MANAGER.png` | `footer-bankroll-manager.png` | 2172×724 | `3e7420876d97e767bcfd3a4c153aabd33d8d9a96025752b4cf8458ab6004f261` |
| Toke Tracker | `FOOTER TOKE TRACKER.png` | `footer-toke-tracker.png` | 1672×941 | `11beaef714e522ec2a563c7335748cf7f0782f0ca9a44179f8e66b2c0f1454e3` |
| Preflop Charts | `FOOTER PREFLOP CHARTS.png` | `footer-preflop-charts.png` | 2172×724 | `542a63cc3ccbf8bf4b11e81f9456a7a35fe5eb8aad7a25ad4d8869c23838d84b` |
| Poker Near Me | `FOOTER POKER NEAR ME.png` | `footer-poker-near-me.png` | 2057×764 | `e71e10e1b0983248fa79fac75f215bd239afe6b6ac0d94978736429ca7f77608` |
| Marketplace | `FOOTER MARKETPLACE.png` | `footer-marketplace.png` | 2172×724 | `ef2824ef2f1767773f37f6a785ee3f4e2db10da1e535c97ac8a944c3db38166a` |

Every production hash matches its supplied source. The files are intentionally not trimmed: black or white outer canvas pixels are part of the approved originals.

## Preserved functional destinations

| World | Controls from left to right |
| --- | --- |
| Personal Assistant | Coach · Sandbox · Leaks · Training · Charts · Odds |
| Training Games | Library · Play · Daily · Progress · Goals · Ranks |
| Poker News | Latest · Videos · Reels · Events · Saved · Sources |
| Poker Trivia | Lobby · Daily · Arcade · PvP · Stats · Ranks |
| Social Media | Feed · Create · Friends · Chat · Reels · Pages |
| Diamond Arena | Arena · Schedule · Ranks · Stats · History · Store |
| My Clubs | Clubs · Arena · Pages · Venues · Games · Hub |
| Video Library | Videos · Cash · Tourneys · Saved · History · Later |
| Odds Calculator | Odds · Equity · ICM · Preflop · Hand Lab · Hub |
| Bankroll Manager | Summary · Log · Trips · Reports · Rules · Export |
| Toke Tracker | Tokes · Shift · Stats · Vault · Taxes · Venues |
| Preflop Charts | Charts · Speed · Stats · Ranks · Awards · Tutorial |
| Poker Near Me | Nearby · Venues · Events · Games · Map · Saved |
| Marketplace | Market · Diamonds · Merch · Clubs · VIP · Orders |

The artwork is visual truth; the existing application routes are functional truth. For example, the supplied Bankroll artwork visibly says `BADGES`, while its previously wired fifth destination remains Bankroll Rules. This migration does not invent a new route merely from image text.

## Route coverage and exclusions

The generated [complete route matrix](./world-hub-footer-route-matrix.md) accounts for all 204 applicable physical routes, including nested and parameterized Pages Router entries. Counts are generated from the page tree and registry, and generation fails if the audited total drifts.

- `/hub` is intentionally footerless.
- `/hub/club-arena` is intentionally footerless.
- Club Arena internal pages are an embedded application boundary with their own separately owned footer.
- Routes outside the 14 family prefixes retain the existing platform fallback only where the legacy route policy enables it.

## Verification contract

The completed results and screenshot locations are recorded in the [verification report](./world-hub-footer-verification.md).

- Node regression verifies all 14 IDs, 14 unique assets, six unique destinations per family, 84 total controls, exact PNG headers/dimensions, source SHA-256 values, valid routes, one app-shell mount, one spacer, and the Club Arena boundary.
- Playwright verifies the exact image and six transparent links, real click dispatch for all 84 controls, fixed-bottom geometry, content clearance, no horizontal overflow, and portrait/mobile/tablet/landscape/desktop widths from 320 through 2560 pixels.
- Playwright also verifies the World Hub and Club Arena lobbies stay footerless and the Club Arena internal probe remains owned by Club Arena.
- Visual evidence contains at least 28 screenshots: desktop 1440×900 and mobile 390×844 for every family.

## Legacy disposition

The old generic app-shell renderer remains only as the intentional fallback for unrelated legacy World Hub routes. It is no longer used by any of the 14 migrated route families. The Club Arena footer is retained because it belongs to a separate embedded application. Independent route-level mounts are prohibited by regression test.
