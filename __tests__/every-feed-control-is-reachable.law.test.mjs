/**
 * EVERY FEED CONTROL IS REACHABLE FROM THE KEYBOARD (2026-09-08, BINDING)
 *
 * Before this law the social feed had 99 click handlers, 3 roles and ZERO
 * tabIndex. Comment Like / Reply / Edit / Delete and its confirm, "See More",
 * the sidebar tiles, identity-switch rows, notification rows, search results
 * and every media thumbnail were plain divs and spans: no keyboard, no screen
 * reader, no focus ring.
 *
 * The rule is narrow on purpose. A backdrop is not a control - putting a tab
 * stop on the lightbox scrim or the sidebar dim would be worse than leaving it
 * alone - so elements carrying the sp-skip-a11y marker are exempt, and the
 * marker has to say why.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const FEED = 'pages/hub/social-media/index.js';
const src = readFileSync(join(ROOT, FEED), 'utf8');

/** Opening tag of every element of these types, with its attributes. */
function* openingTags(text, types) {
  const re = new RegExp(`<(${types.join('|')})\\b`, 'g');
  let m;
  while ((m = re.exec(text))) {
    let depth = 0;
    for (let i = m.index; i < text.length; i++) {
      const c = text[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) {
        yield { tag: m.group ?? m[1], attrs: text.slice(m.index, i + 1), index: m.index };
        break;
      }
    }
  }
}

const NON_INTERACTIVE = ['div', 'span', 'li', 'td', 'tr', 'section', 'img'];

test('the keyboard activation helper still exists and still prevents default', () => {
  assert.match(src, /function spKeyActivate\(e\)/, 'spKeyActivate is gone');
  assert.match(src, /e\.key !== 'Enter' && e\.key !== ' '/, 'must handle Enter and Space');
  assert.match(src, /e\.preventDefault\(\)/, 'Space scrolls the page unless default is prevented');
  assert.match(
    src,
    /e\.currentTarget\.click\(\)/,
    'activation must reuse the element own onClick, not a second copy of the handler'
  );
});

test('no clickable non-interactive element is unreachable from the keyboard', () => {
  const offenders = [];
  let checked = 0;
  for (const { attrs, index } of openingTags(src, NON_INTERACTIVE)) {
    if (!attrs.includes('onClick')) continue;
    checked++;
    if (attrs.includes('data-sp-skip-a11y')) continue;      // documented exemption

    const role = attrs.match(/role="([^"]+)"/);
    /*
     * An explicit non-button role means the element is a container, not a click
     * target: role="dialog" with an Escape handler is correct as it stands and
     * must NOT get a tab stop. Only things claiming to be buttons owe a
     * tabIndex and a key handler.
     */
    if (role && role[1] !== 'button') continue;
    if (role && attrs.includes('tabIndex') && attrs.includes('onKeyDown')) continue;
    if (!role && attrs.includes('tabIndex') && attrs.includes('onKeyDown')) continue;
    offenders.push(src.slice(0, index).split('\n').length);
  }

  // Control: if this stops finding clickable divs at all, it would pass on an
  // empty file and tell us nothing.
  assert.ok(checked > 20, `only ${checked} clickable non-interactive elements seen - scan is broken`);

  assert.deepEqual(
    offenders,
    [],
    'these elements have onClick but no role/tabIndex, so they cannot be reached by ' +
      'keyboard or announced by a screen reader. Add role="button" tabIndex={0} ' +
      'onKeyDown={spKeyActivate}, or mark them data-sp-skip-a11y="..." with a reason if they are ' +
      'backdrops rather than controls. Lines:\n  ' + offenders.join('\n  ')
  );
});

test('every a11y exemption says why', () => {
  const marks = src.match(/data-sp-skip-a11y="[^"]*"/g) || [];
  assert.ok(marks.length > 0, 'the exemption marker is gone - check the skip list is still needed');
  for (const m of marks) {
    assert.ok(
      /backdrop|propagation|overlay|scrim|not a control/i.test(m),
      `an exemption gives no reason: "${m.trim()}"`
    );
  }
});
