/**
 * THE FOOTER FOLLOWS THE READER, NOT WHICHEVER THING SCROLLED LAST.
 *
 * `useHideOnScroll` in BottomNavBar listens for scroll in the CAPTURE phase at
 * the document, so it sees every scroller on the page, not only the window.
 * That is deliberate - several hub pages put their scroll on an inner panel.
 * It also means the hook is handed events from things that are not the reader
 * travelling the page, and twice now that has taken the footer down with it.
 *
 * 2026-09-06: `Global Footer E2E` failed on `video-library` in BOTH browsers
 * and all three retries - "video-library should return on the way back up".
 * The reader scrolled back up and the bar stayed parked below the viewport.
 *
 * The video library is the page that has a horizontal filter rail:
 * `.vl-type-toggle-row` is `overflow-x: auto` with `scroll-snap-type: x
 * mandatory` below 900px, and `keepRailButtonInView` smooth-scrolls it on
 * mount to keep the pressed chip visible. Measured on that page at 390px:
 *
 *     scrollWidth 1219 > clientWidth 372     (it moves sideways)
 *     scrollHeight  44 === clientHeight 44   (it cannot move vertically)
 *
 * Two properties of the hook made that rail able to speak for the reader, and
 * this file pins both closed. They are pinned by reading the source because
 * the logic lives inside a JSX component with no seam to call into; a text pin
 * is weaker than an execution test and is still enough to stop a silent
 * re-introduction, which is the failure mode that actually happened.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/components/ui/BottomNavBar.jsx', import.meta.url), 'utf8');

test('a scroller with no vertical travel cannot steer the footer', () => {
  assert.match(
    SRC,
    /const canScrollVertically = \(source\) => \{/,
    'canScrollVertically must exist: a sideways-only rail reports scrollTop 0 forever, ' +
      'which reads as "the reader is at the top of the page" and force-reveals the bar - ' +
      'or, measured against a fresh seed, as travel downward, which force-hides it.'
  );
  assert.match(
    SRC,
    /if \(!canScrollVertically\(source\)\) return;/,
    'settleOne must drop a source that cannot scroll vertically before reading its scrollTop.'
  );
});

test('two scrollers in one frame do not erase each other', () => {
  assert.match(
    SRC,
    /const pending = new Set\(\);/,
    'The pending scrollers must be a Set. As a single slot, a second scroller firing in ' +
      'the same frame overwrote the first, and the one that lost was the document - the ' +
      'only scroller the footer follows. A dropped document event leaves its `last` stale, ' +
      'so the NEXT event is measured from the wrong place and the bar sticks.'
  );
  assert.match(SRC, /pending\.add\(event\?\.target \|\| document\);/, 'onScroll must add, not assign.');
  assert.doesNotMatch(
    SRC,
    /\bpending = (event|null)\b/,
    'Assigning to `pending` is the single-slot bug this test exists to stop.'
  );
  assert.match(
    SRC,
    /for \(const source of sources\) settleOne\(source\);/,
    'Every scroller that moved this frame must be settled. Coalescing to one FRAME is the ' +
      'point; coalescing to one SCROLLER was the bug.'
  );
});

test('a scroller seen for the first time is seeded where it actually is', () => {
  assert.doesNotMatch(
    SRC,
    /seed\(source, 0\);/,
    'Seeding a newly-seen panel at 0 while it sits at 120 invents 120px of downward travel ' +
      'nobody performed, and hides the bar. Seed it at its own reported position instead; ' +
      'the document is still seeded with its real position when the listener is installed, ' +
      'so the first flick on the page keeps counting.'
  );
  assert.match(SRC, /seed\(source, y\);\n\s*return;/, 'A first sample carries no direction, so it must decide nothing.');
});
