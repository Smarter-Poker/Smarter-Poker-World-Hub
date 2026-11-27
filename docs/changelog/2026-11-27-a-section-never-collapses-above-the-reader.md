# 2026-11-27 A Section Never Collapses Above The Reader

Signature: Global Footer E2E, `e2e/024-world-menu-mobile-phase3.spec.ts` "Poker Near Me deep Series route keeps its approved header trigger after document scroll", project `world-menu-phase3-webkit` only. The header trigger read y + height = 2007.23 against a bound of 813 (1401.23 on smaller data) in about half the WebKit runs since 2026-11-26 03:22 UTC, the first runs after #3018 made the approved header `position: fixed` and portaled it into `<body>`. #3111 changed the spec to a DOM read and the flake stayed.

What a CI probe found (a MutationObserver on every Poker Near Me section while the test scrolled to the bottom of the deep Series route, four WebKit visits): in every visit, as soon as the first tours, series and daily requests settled, the page swapped its first-paint card skeletons for panels that were not there yet.

- Rooms And Venues fell from 1641px to 105px: the venue list is a dynamic chunk with no loading placeholder, so it rendered nothing until the chunk arrived.
- Daily Tournaments fell from 804px to 288px: its LazyPanel placeholder is a 240px strip, and a reader at the bottom never scrolls near it to mount it.
- The document fell from 10944px to 8911px under a reader at y = 10073. The scroll position clamped to 8099.

Why only WebKit: Chromium's scroll anchoring hides a collapse above the reader. WebKit (Safari) has none, so the page moved under the reader, and for the rest of that frame WebKit laid the fixed header out against its old layout viewport, 10073 - 8099 = 1974px down. Every synchronous read in that window (getBoundingClientRect, elementFromPoint, Playwright's box) put the header off screen, which is what the test saw. In Safari it is a page that jumps by a screen and a half while the reader is looking at it.

Fix: one skeleton and no empty hand-off.

- `src/components/poker-near-me/CardSkeletons.jsx` draws the first-paint card skeleton and every placeholder that takes over from it. The venue list chunk loads behind the eight-card venue skeleton, the daily list (its LazyPanel placeholder and its chunk) behind the four-card daily skeleton, and each venue and tour card chunk in `VenuesTabPanel.jsx` behind one skeleton card. The second probe had shown the venue section still falling from 1641px to 648px while 20 card chunks rendered nothing.
- `src/components/poker-near-me/LazyPanel.jsx` keeps its placeholder's height as a min-height once it mounts, until the panel has drawn something (bounded at 10 seconds). The second probe had shown the Discovery Tools falling from 3639px to 3061px (Best Time To Go 308px to 48px, Road Trip Planner 368px to 50px) under the reader while their chunks downloaded.

After the fix (third probe, four WebKit visits) no placeholder collapsed. The header read y = 4.95 at once in every visit, the deep Series test passed 10 of 10 WebKit repeats with its immediate DOM and protocol reads (it had failed about half of them), and the full e2e/024 spec passed in both projects (32 of 32).

Not fixed here: about 4 seconds after load every venue card loses about 170px (Rooms And Venues 7703px to 6800px) when the card's live game list and freshness line give way to the stakes list. That is the card's data changing, not a placeholder, and it lands after the reader's first look; it is worth its own look.

The spec keeps every assertion and gets back the immediate protocol box read that #3111 had moved behind a poll.

Hardening: `__tests__/poker-near-me-sections-never-collapse-above-the-reader.law.test.mjs`, wired into `test:pnm` (runs on every build). It renders the skeleton, drives LazyPanel through mount, chunk download, first draw and the hold limit, pins each hand-off to the same skeleton, and fails when a new first-paint skeleton appears without one.
