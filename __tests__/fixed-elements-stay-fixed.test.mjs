/**
 * NOTHING THAT CAN CONTAIN A position:fixed ELEMENT MAY BE AN ACCIDENTAL SCROLLER.
 *
 * The Club Arena half of this bug was reported by Dan three times in six days
 * ("THE FOOTER IS COMING UP ON MOBILE AND ISN'T STAYING LOCKED TO THE FOOTER")
 * and was, every time, this one declaration:
 *
 *     overflow-x: hidden;
 *
 * CSS Overflow 3: when one axis is a non-visible value and the other is
 * `visible`, the `visible` one COMPUTES TO `auto`. That single line silently
 * makes the element a scroll container on BOTH axes, and WebKit then resolves
 * `position: fixed` descendants against IT rather than the viewport.
 *
 * The hub has the same shape. `.pnm-page` carried `overflow-x: hidden` while
 * the same stylesheet positions three fixed elements inside it: the
 * favourite-venue live toast at `top: 80px`, which scrolls away with the
 * content instead of staying put, and two full-bleed `inset: 0` backgrounds,
 * which size to the whole scroll height rather than the screen.
 *
 * Chrome does not do any of this. That is why it survives review, survives
 * jsdom, and only shows up on a phone after it ships — so the declaration is
 * banned outright rather than judged case by case.
 *
 * ALLOWED: a rule that also declares `overflow-y` (or the `overflow`
 * shorthand) is a deliberate scroller and is exempt. `src/index.css` body is
 * the real one — it sets `overflow-y: auto` on purpose.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPES = ['styles', 'src/styles'];
const EXTRA_FILES = ['src/index.css'];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test('no stylesheet sets overflow-x: hidden without pairing it with clip', () => {
  const offences = [];

  const files = [
    ...SCOPES.flatMap((s) => walk(path.join(ROOT, s))).filter((f) => f.endsWith('.css')),
    ...EXTRA_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
  ];

  {
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      // Innermost brace pairs are the declaration blocks; a media query's own
      // block contains further braces and is skipped by this pattern.
      for (const m of src.matchAll(/\{[^{}]*\}/g)) {
        const block = m[0];
        if (!/^[ \t]*overflow-x:\s*hidden(\s*!important)?;\s*$/m.test(block)) continue;
        if (/overflow-x:\s*clip/.test(block)) continue; // paired, correct
        if (/overflow-y\s*:/.test(block)) continue; // a deliberate scroller
        if (/(^|[\s;{])overflow\s*:/.test(block)) continue; // shorthand, deliberate
        const before = src.slice(0, m.index ?? 0);
        const selector = (before.split(/[}{]/).pop() || '').trim().replace(/\s+/g, ' ').slice(-80);
        offences.push(`${file.replace(`${ROOT}/`, '')}  {${selector}}`);
      }
    }
  }

  assert.deepEqual(
    offences,
    [],
    `These rules make their element an accidental scroll container, which is how a\n` +
      `position:fixed descendant comes unstuck from the viewport on iOS. Add\n` +
      `\`overflow-x: clip;\` on the line after \`overflow-x: hidden;\`, or declare an\n` +
      `explicit overflow-y if the element really is meant to scroll:\n  ` +
      offences.join('\n  ')
  );
});

test('the one deliberate scroller still declares itself', () => {
  // src/index.css's body is the legitimate case: it sets overflow-x: hidden AND
  // overflow-y: auto, so the exemption above applies to it honestly. If somebody
  // drops that explicit overflow-y, the rule silently becomes the accidental
  // kind — and the scan above would then flag it, which is the point. This pins
  // the intent so the exemption is never mistaken for an oversight.
  const src = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
  const bodyWithOverflowX = [...src.matchAll(/\nbody[^{]*\{[^}]*\}/g)]
    .map((m) => m[0])
    .filter((b) => /overflow-x:\s*hidden/.test(b));
  for (const block of bodyWithOverflowX) {
    assert.match(
      block,
      /overflow-y:\s*(auto|scroll|hidden|clip)/,
      'a body rule sets overflow-x: hidden without declaring overflow-y; that makes <body> ' +
        'an accidental scroll container for every fixed element on the page'
    );
  }
});
