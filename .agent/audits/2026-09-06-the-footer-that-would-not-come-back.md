# The footer that would not come back

`Global Footer E2E` red on `main`, found 2026-09-06. This is the SECOND cause of
that gate being red this week; the first (three marketplace tests run by
`npm run build`) was fixed by #1398 and is gone. Fixing the build failure is what
let this one become visible.

## What was failing

    every footer drops while the reader travels down and returns on the way back up
    Error: video-library should return on the way back up
    Expected: "false"   Received: "true"    (data-footer-hidden)

`footer-chromium` and `footer-webkit`, all three attempts, one world out of
fifteen. Not a flake.

One attempt failed a line later instead, on geometry:

    expect(Math.abs(shownBox.y + shownBox.height - 844)).toBeLessThan(4)
    Expected: < 4   Received: 48

`expectedClubFooterHeight(390) = min(132, max(44, 390 * 0.12326)) = 48`. A box
whose bottom edge sits exactly its own height below the viewport is a box still
carrying `transform: translateY(100%)`. **That is the same defect one assertion
later, not a second one** - the bar was still parked.

## Why video-library and no other world

It is the page with a horizontal filter rail. Below 900px
`.vl-type-toggle-row` is `overflow-x: auto` with `scroll-snap-type: x mandatory`,
and `keepRailButtonInView` smooth-scrolls it on mount - twice, from two effects
that fire on `[selectedType, libraryFilter]` and `[selectedSource]` - to keep the
pressed chip in view. Measured on that page at 390px:

    scrollWidth  1219  >   clientWidth  372     it moves sideways
    scrollHeight   44  === clientHeight  44     it cannot move vertically

`useHideOnScroll` listens for scroll in the CAPTURE phase at the document, on
purpose, because several hub pages put their scroll on an inner panel. So it is
handed this rail's events too, and it had no way to tell them apart from a
reader travelling the page.

## The three defects, all now closed

1. **A sideways-only scroller could steer a vertical behaviour.** The rail
   reports `scrollTop: 0` forever. Read as vertical travel that is `0`, it means
   "the reader is at the top", which force-reveals the bar; measured against a
   fresh seed it reads as travel downward, which force-hides it. It is neither.
   `canScrollVertically` now drops any source whose `scrollHeight` does not
   exceed its `clientHeight`, before its `scrollTop` is ever read.

2. **Two scrollers in one frame erased each other.** `pending` was a single
   variable, so the second scroller to fire inside a frame overwrote the first
   and that scroller's travel was never measured. The one that usually lost was
   the document - the only scroller this footer follows - and a dropped document
   event leaves `travel.get(document).last` stale, so the NEXT event is measured
   from the wrong place and the bar sticks. It is a `Set` now, and `settle`
   settles every source that moved. Coalescing to one FRAME is the point;
   coalescing to one SCROLLER was the bug.

3. **A newly-seen scroller was seeded at 0.** A panel already at `scrollTop: 120`
   was therefore credited with 120px of downward travel nobody performed, which
   hides the bar. It is seeded at its own reported position now and decides
   nothing from that first sample, because one sample carries no direction. The
   document does not pay this cost: it is still seeded with its real position
   when the listener is installed, so "THE FIRST FLICK MUST COUNT" (2026-09-04)
   still holds for the page itself.

## What is proven, and what is not

Proven: the rail has exactly the shape defect 1 describes (measured above); all
three defects are real by reading; the pin in
`__tests__/footer-follows-the-reader-not-a-rail.test.mjs` fails on every one of
them against `origin/main` and passes here.

NOT proven: that defect 1 is the specific trigger for the CI failure. It could
not be reproduced against a dev server on this Mac - the page passes there, with
and without the fix, including when the rail is driven in the same frame as the
up-scroll. CI runs a production build on a loaded 16-core box with 18 runners,
and that is where the ordering is different. **The pull request's own
`Global Footer E2E` run is the verification** - it is the same job, on the same
hardware, that produced the failure.

If that run is still red on `video-library`, the remaining suspect is the pair of
`keepRailButtonInView` effects firing late (they run again whenever the catalog
load changes `selectedType` / `selectedSource`), and the next step is to make
that call skip a rail the reader has not interacted with rather than to loosen
anything in the contract.

## Not touched

The E2E spec. Every assertion in it is correct and describes behaviour a reader
would notice; the bar really did not come back. A gate that is telling the truth
does not get adjusted to go green.
