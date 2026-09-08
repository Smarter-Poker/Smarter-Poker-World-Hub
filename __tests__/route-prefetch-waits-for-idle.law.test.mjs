/**
 * ROUTE PREFETCH WAITS FOR IDLE (2026-09-08, BINDING)
 *
 * The social feed carried this, verbatim:
 *
 *     // Route prefetch — preload likely navigation targets during idle time
 *     useEffect(() => {
 *       router.prefetch('/hub/notifications');
 *       router.prefetch('/hub/friends');
 *       router.prefetch('/hub/messenger');
 *     }, [router]);
 *
 * "During idle time" was the intent. The code fired synchronously on mount, so
 * three neighbouring page chunks - measured at ~310KB against a feed chunk of
 * 252KB - came down while the feed was still fetching its own posts and images.
 * UniversalHeader did the same with the signed-in user's own 159KB profile
 * route, on EVERY page of the estate.
 *
 * A speculative fetch that competes with the page's own critical resources is
 * not an optimisation. This law requires every eager router.prefetch on these
 * surfaces to sit behind requestIdleCallback (or a timeout, for Safari).
 *
 * It does NOT forbid prefetch on hover or touchstart - that is a signal of
 * intent and should stay immediate. BottomNavBar's warm() is exactly that.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const code = (f) =>
  readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SURFACES = ['pages/hub/social-media/index.js', 'src/components/ui/UniversalHeader.js'];

test('every eager route prefetch on these surfaces is deferred to idle', () => {
  for (const f of SURFACES) {
    const src = code(f);
    const calls = [...src.matchAll(/router\.prefetch\(/g)];
    assert.ok(calls.length > 0, `${f}: no router.prefetch at all - did the warm-up get deleted?`);

    for (const m of calls) {
      /*
       * Look BOTH ways. The first version of this law only looked backwards and
       * failed on the very fix it was written for: the prefetch sits inside a
       * named function whose requestIdleCallback scheduling appears AFTER the
       * function body in source order.
       */
      const window_ = src.slice(Math.max(0, m.index - 900), m.index + 900);
      const deferred =
        /requestIdleCallback/.test(window_) ||
        /setTimeout\(/.test(window_) ||
        /onMouseEnter|onTouchStart|onFocus/.test(window_) ||
        /const \w*[Ww]arm\w*\s*=/.test(window_);
      assert.ok(
        deferred,
        `${f}: a router.prefetch fires without waiting for idle or a hover. ` +
          'Speculative chunk fetches must not compete with the page own resources.'
      );
    }
  }
});

test('the idle path has a Safari fallback and is cancelled on unmount', () => {
  const feed = code('pages/hub/social-media/index.js');
  assert.match(feed, /requestIdleCallback/, 'the feed no longer defers its neighbour prefetch');
  assert.match(feed, /cancelIdleCallback/, 'the idle callback is never cancelled on unmount');
  assert.match(feed, /setTimeout\(warmNeighbours/, 'no fallback for Safari, which has no requestIdleCallback');
  assert.match(feed, /clearTimeout\(t\)/, 'the fallback timer is never cleared');
});

test('hover prefetch stays immediate - intent is not speculation', () => {
  const nav = code('src/components/ui/BottomNavBar.jsx');
  assert.match(nav, /onMouseEnter=\{\(\) => warm\(/, 'the footer lost its hover warm-up');
  assert.match(nav, /onTouchStart=\{\(\) => warm\(/, 'the footer lost its touch warm-up');
});
