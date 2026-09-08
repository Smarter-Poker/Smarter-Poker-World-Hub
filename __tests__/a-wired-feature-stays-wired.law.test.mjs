/**
 * A WIRED FEATURE STAYS WIRED (2026-09-08, BINDING)
 *
 * Four features on the social surface rendered UI, stored state, and did
 * nothing. Each failed in the same shape: something was WRITTEN and never READ,
 * or a setter existed and was never called. None of them threw, none went red,
 * and none was visible in a diff - so each survived for months.
 *
 *   - showClubPostsOnly: setShowClubPostsOnly(true) appeared ZERO times, so
 *     both filter expressions and the whole "No Club Posts Yet" empty state
 *     were unreachable.
 *   - notInterestedIds: hydrated from localStorage and updated on every
 *     dislike, read by nobody. A reel you dismissed vanished from /hub/reels
 *     and kept appearing in the feed.
 *   - GoLiveModal reset: wired to one of three close paths.
 *   - setTitle(''): never called, so an abandoned session pre-filled the next.
 *
 * This law does not test that the features are good. It tests that the wire is
 * still attached at both ends.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
/** Prose about a call is not a call. */
const code = (f) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FEED = 'pages/hub/social-media/index.js';
const CAROUSEL = 'src/components/social/ReelsFeedCarousel.jsx';
const GOLIVE = 'src/components/social/GoLiveModal.jsx';

test('the club-posts filter can still be switched ON', () => {
  const src = code(FEED);
  assert.match(src, /setShowClubPostsOnly\(/, 'the club filter state is gone');
  // The bug was that every call site set it to false. At least one must be able
  // to set it true, or the filter and its empty state are unreachable again.
  const canEnable =
    /setShowClubPostsOnly\(true\)/.test(src) || /setShowClubPostsOnly\(opt\.on\)/.test(src);
  assert.ok(
    canEnable,
    'nothing can set showClubPostsOnly true, so the filter and the "No Club Posts Yet" ' +
      'empty state are dead code again'
  );
  assert.match(src, /aria-pressed=/, 'the filter control must report its state to assistive tech');
});

test('Not Interested is still read, not just written', () => {
  const src = code(CAROUSEL);
  assert.match(src, /setNotInterestedIds\(/, 'the Not Interested state is gone');
  assert.match(
    src,
    /notInterested\.has\(/,
    'notInterestedIds is written and never read again - dismissing a reel does nothing'
  );
  /*
   * The Set is OWNED by ReelViewer, but the filter that matters lives in
   * ReelsFeedCarousel - a different component. The first version of this fix put
   * a ref in ReelViewer and read it from the carousel, which is a ReferenceError
   * on every load. Both must go through the module-level reader, which reads the
   * localStorage both components already persist to.
   */
  assert.match(src, /function readNotInterested\(\)/, 'the shared reader is gone');
  assert.match(
    src,
    /const notInterested = readNotInterested\(\);/,
    'loadReels must read the persisted Set, not a ref from another component'
  );
  assert.ok(
    !/notInterestedIdsRef/.test(src),
    'notInterestedIdsRef is back - it is declared in ReelViewer and read in ' +
      'ReelsFeedCarousel, which is a ReferenceError'
  );
});

test('every GoLiveModal close path resets the modal', () => {
  const src = code(GOLIVE);
  assert.match(src, /const resetModalState = \(\) =>/, 'the shared reset is gone');

  // The modal returns null when closed but never unmounts, so a close path that
  // skips the reset carries the whole previous session into the next open.
  const calls = (src.match(/resetModalState\(\)/g) || []).length;
  assert.ok(
    calls >= 2,
    `resetModalState is called ${calls} time(s). The End Stream path and the backdrop ` +
      'path both need it, or closing by the backdrop leaks an un-revoked object URL ' +
      'and pre-fills the next session.'
  );

  assert.match(src, /setTitle\(''\)/, 'the title is never cleared, so it pre-fills the next open');

  // The backdrop handler specifically.
  const backdrop = src.match(/e\.target === e\.currentTarget && stage !== 'live'[\s\S]{0,160}/);
  assert.ok(backdrop, 'the backdrop close handler is gone or was rewritten');
  assert.match(backdrop[0], /resetModalState\(\)/, 'the backdrop close path skips the reset');
});

test('exactly one reels carousel is injected, and a short feed still gets it', () => {
  const src = code(FEED);
  const injections = (src.match(/<ReelsFeedCarousel\b/g) || []).length;
  assert.equal(
    injections,
    1,
    'more than one ReelsFeedCarousel is rendered. Each instance runs its own 50-row ' +
      'fetch and opens its own realtime channel - hoist both out of the component first.'
  );
  assert.match(
    src,
    /filteredPosts\.length < 3/,
    'the short-feed fallback is gone, so a feed with fewer than 3 posts shows no carousel'
  );
  // The header claimed "every 3 posts" for months while the code injected once.
  assert.ok(
    !/inserted after every 3 posts/.test(read(FEED)),
    'the file header claims a cadence the code does not implement'
  );
});
