/**
 * THE TOP SAFE-AREA INSET IS APPLIED ONCE, BY THE ELEMENT THAT PAINTS UNDER
 * THE STATUS BAR.
 *
 * WHAT HAPPENED (2026-09-07). On mobile, inside the World Hub, the header sat
 * far too low: a wide empty band between the status bar and the header
 * artwork. Two rules were each adding the same inset.
 *
 *   src/index.css (2026-01-13)          body { padding-top: env(safe-area-inset-top) }
 *   UniversalHeader.js (2026-08-29)     .approved-global-header { padding-top: env(...) }
 *
 * `.approved-global-header` is `position: sticky; top: 0`, and a sticky box can
 * never paint above its normal flow position. Its flow position was already one
 * inset down because of the body rule, and then it added its own. Both bands
 * are transparent, so they rendered as empty page colour:
 *
 *     Dynamic Island (14/15/16 Pro):  59 + 59 = 118px   (59 is correct)
 *     Notch (13 / X class):           47 + 47 =  94px   (47 is correct)
 *
 * It was invisible in a browser tab — `env(safe-area-inset-top)` is 0 there —
 * and only appeared in the installed PWA, which is where `manifest.json` sends
 * people (`display: standalone`, `start_url: /hub`) and where
 * `apple-mobile-web-app-status-bar-style: black-translucent` puts the page
 * under the clock.
 *
 * WHY THE BODY IS THE ONE THAT GAVE WAY. Every fixed and sticky chrome element
 * on this site already applies its own top inset — the list below is the
 * measured set — so ALL of them were double-counting, not just the header. The
 * element that paints under the status bar is the one that must own the offset;
 * a body padding cannot be right for a `position: fixed` bar, which does not
 * see it at all, and right for ordinary flow content at the same time.
 *
 * The other three sides stay on the body: nothing else applies them, and a
 * left/right/bottom gutter really is a property of the page box.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Strip comments so a rule quoted in prose cannot pass or fail this. */
const code = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('the global stylesheet does not push the whole page down by the top inset', () => {
  const css = code(read('src/index.css'));
  const bodyBlocks = [...css.matchAll(/\bbody\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(bodyBlocks.length > 0, 'no body rule found in src/index.css');
  for (const block of bodyBlocks) {
    assert.ok(
      !/padding-top\s*:\s*[^;]*safe-area-inset-top/.test(block),
      'body applies the TOP safe-area inset. Every sticky and fixed chrome ' +
        'element on this site already applies it too, so this makes each of ' +
        'them exactly one inset too low. See the note at the top of this file.'
    );
    assert.ok(
      !/\bpadding\s*:\s*[^;]*safe-area-inset-top/.test(block),
      'body applies the top inset through the `padding` shorthand'
    );
  }
});

test('the other three insets are still applied, so the gutters do not vanish', () => {
  const css = code(read('src/index.css'));
  for (const side of ['bottom', 'left', 'right']) {
    assert.match(
      css,
      new RegExp(`padding-${side}\\s*:\\s*env\\(safe-area-inset-${side}\\)`),
      `the ${side} safe-area gutter was removed along with the top one`
    );
  }
});

test('the header still owns its own top inset', () => {
  // The fix is "one owner", not "no owner". If this ever goes away the header
  // slides UNDER the status bar, which is the opposite bug and just as bad.
  const header = read('src/components/ui/UniversalHeader.js');
  assert.match(
    header,
    /\.approved-global-header\s*\{[^}]*padding-top\s*:\s*env\(safe-area-inset-top/,
    '.approved-global-header no longer applies the top inset; with the body ' +
      'rule gone, nothing would keep the header clear of the status bar'
  );
});
