# 2026-11-26 The Anchor Hold Never Fights A Scroll

Signature: Global Footer E2E, `e2e/024-world-menu-mobile-phase3.spec.ts:339` "Poker Near Me deep Series route keeps its approved header trigger after document scroll", project `world-menu-phase3-webkit` only. `expect(box.y + box.height).toBeLessThanOrEqual(813)` received 2007.23 (1401.23 on two runs). Intermittent since 2026-11-26 03:22 UTC (the first runs after #3018 made the approved header `position: fixed` and portaled it into `<body>`); 9 of the 30 PR runs that reached this step after 19:30 UTC failed it.

Correction (2026-11-27): finding 1 below was wrong, and this change did not fix the flake. The spec's DOM read failed about half its WebKit runs too (y = 1974 to 1979). The root cause is the page collapsing its skeletons above the reader; see `2026-11-27-a-section-never-collapses-above-the-reader.md`. Finding 2 and its fix stand.

What a CI probe found (12 WebKit and 2 to 4 Chromium visits per run, three runs):

1. The header is pinned. In every failing WebKit read, `getBoundingClientRect` gave y = 0, a screenshot taken right after showed the header at the top (identical to the settled frame) and `document.elementFromPoint` at the trigger centre hit the trigger once a frame had rendered. Only Playwright's WebKit protocol box (`boundingBox`, `Page.getContentQuads`) read y = 1979 (or 1373) until the next rendering update after the programmatic scroll, while LazyPanels were still growing the document. Chromium never showed it. The single protocol read in the spec was measuring a WebKit layout viewport lag in the inspector, not the page.
2. The page fought the scroll. The deep-link anchor hold in `pages/hub/poker-near-me/[pnmTab].js` stopped only on wheel, touchstart, pointerdown or keydown, so the test's scroll to y = 10073 was back at y = 341 within about 200ms, in both engines. A visitor's scrollbar drag, find-in-page, anchor link or assistive technology scroll was reverted the same way for up to 6.4 seconds.

Fix:

- The hold remembers the scroll position it last produced. Every scroll event, and every realignment before it runs, asks `isForeignScroll` (`src/components/poker-near-me/pnmSections.js`): a scroll that moved both the document and the held section ends the hold at once. Growth above the section (section moves, position does not) and browser scroll anchoring (position moves, section does not) keep it.
- The spec reads the pin from the DOM at the measured instant (same bounds as before), then requires the trigger to be what a tap at its centre reaches, full viewport containment (`toBeInViewport({ ratio: 1 })`) and the protocol box to converge inside the phone viewport. No assertion was removed; two were added.

Hardening: `__tests__/the-anchor-hold-never-fights-a-scroll.law.test.mjs`, wired into `test:pnm` (runs on every build): the classifier cases, the hold's scroll listener and its removal, the check before every realignment, the e2e pin's DOM and hit-test reads, and a scan of every global stylesheet so `<html>` and `<body>` (the portaled header's only ancestors) never get transform, filter, contain, container-type, will-change, perspective, backdrop-filter or content-visibility.
