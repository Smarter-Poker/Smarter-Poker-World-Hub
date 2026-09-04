/**
 * LAW: nothing in _app.js scrolls the reader's page for them after the first paint.
 *
 * Added 2026-09-04. pages/_app.js re-issued `scrollTo(0, 0)` every 100ms for
 * the first half second after mount, "to defeat browser scroll restoration
 * cache". It defeated the reader instead: any thumb that started scrolling
 * within 500ms of a page landing was yanked back to the top, on every page.
 * It was also why the footer hide-on-scroll contract was red on main from the
 * day it landed - the bar hid on the flick, the interval scrolled to 0, the
 * bar correctly showed again, 100-200ms later, and the assertion lost the race.
 *
 * `history.scrollRestoration = 'manual'` is what stops a browser restoring a
 * position. One immediate scrollTo covers the first paint. After that the
 * scroll position belongs to the person holding the phone.
 *
 * A second, smaller rule rides along: the hide-on-scroll hook must let the
 * FIRST observed scroll count. Its first event used to only record where the
 * scroller was, so a single coalesced burst on a fresh page never hid the bar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const code = (p) =>
  readFileSync(join(ROOT, p), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');

test('_app.js has no interval or repeated timer that scrolls to the top', () => {
  const src = code('pages/_app.js');
  // The shape that was there: setInterval(() => window.scrollTo(...))
  const intervals = [...src.matchAll(/setInterval\s*\(([\s\S]{0,300}?)\)\s*,/g)].map((m) => m[1]);
  for (const body of intervals) {
    assert.ok(
      !/scrollTo/.test(body),
      'an interval in _app.js calls scrollTo - that is the 500ms yank, do not bring it back'
    );
  }
  assert.ok(!/scrollAttempts/.test(src), 'the "aggressive scroll-to-top" loop is back');
});

test('_app.js still turns browser scroll restoration off, which is the real fix', () => {
  const src = code('pages/_app.js');
  assert.match(src, /history\.scrollRestoration\s*=\s*'manual'/);
});

test('the hide-on-scroll hook seeds the document so the first flick counts', () => {
  const src = code('src/components/ui/BottomNavBar.jsx');
  assert.match(src, /seed\(document, scrollTopOf\(document\)\)/);
  // The old shape: first sight only records and returns.
  assert.ok(
    !/if \(!state\) \{\s*travel\.set\(source, \{ last: y, anchor: y, direction: 0 \}\);\s*return;/.test(
      src
    ),
    'the first scroll event only records again - the first flick would not hide the bar'
  );
});
