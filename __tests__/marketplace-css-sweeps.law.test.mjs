/**
 * THE TWO FAULTS THIS PROGRAMME KEPT FINDING ARE SWEPT, NOT LISTED.
 *
 * The Marketplace restoration fixed the same two CSS faults over and over, and
 * each time it pinned the fix by naming the one rule it had just repaired. A
 * per-rule assertion cannot find the next instance, and there were always more:
 * a close-out review of the finished programme turned up nine more percentage
 * paddings and twenty-seven more erased focus rings, with the suite green.
 *
 * These two laws sweep every Marketplace stylesheet instead.
 *
 * FAULT ONE: a percentage padding resolves against the CONTAINING BLOCK's
 * inline size, never the element's own. On a plate that is narrower than its
 * container the padding the artwork asks for is therefore multiplied. Measured
 * instances: the VIP confirmation dialog at 211px a side inside a 520px box,
 * 973px tall in a 720px viewport with both buttons unreachable; the VIP
 * signed-out panel at 480x754 with a 55px content box; .balanceReadout with a
 * content box of exactly zero. The rule is safe only when the element is as
 * wide as its containing block, so that is what this asserts.
 *
 * FAULT TWO: src/index.css ends `input, textarea, select, button:focus` with
 * `outline: none !important`, which outranks any focus-visible outline a module
 * declares normally. Such a ring never paints. Measured: the detail page's
 * inspect button reported `outline-style: none` while :focus-visible matched.
 *
 * This is a correctness fault, not an accessibility rescue, and an earlier
 * version of this comment said otherwise. src/styles/premium.css:480 gives
 * every focusable element a box-shadow focus ring that the outline reset does
 * not touch, so a keyboard user was never left without an indicator. What was
 * wrong is that a module declaring a specific ring silently got the generic one
 * instead. The header's own deliberate radial-gradient glow works for the same
 * reason: it is not an outline.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const DIRS = [
  'pages/hub',
  'src/components/store',
  'src/components/diamond-store',
  'src/components/marketplace-console',
];

const walk = (dir) =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(rel);
    return entry.name.endsWith('.module.css') ? [rel] : [];
  });

const stylesheets = DIRS.flatMap(walk);

const rules = stylesheets.flatMap((file) => {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const found = [];
  for (const match of source.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = match[1]
      .split('\n')
      .filter((line) => !line.trim().startsWith('/*') && !line.trim().startsWith('*'))
      .join(' ')
      .trim();
    if (!selector || selector.startsWith('@')) continue;
    found.push({
      file,
      line: source.slice(0, match.index).split('\n').length,
      selector: selector.slice(-100),
      body: match[2],
    });
  }
  return found;
});

test('the Marketplace has stylesheets to sweep', () => {
  assert.ok(stylesheets.length >= 15, `only found ${stylesheets.length} Marketplace stylesheets`);
  assert.ok(rules.length >= 400, `only parsed ${rules.length} rules`);
});

test('no plate takes a percentage padding it is too narrow to afford', () => {
  const offenders = rules
    .filter((rule) => /padding(-inline|-block)?:[^;]*\d+(\.\d+)?%/.test(rule.body))
    .filter((rule) => {
      const width = /(?:^|[;{\s])width:\s*([^;]+)/.exec(rule.body);
      // No width of its own: the element fills its containing block, so a
      // percentage resolves against the box it is actually painted in.
      if (!width) return false;
      return width[1].trim() !== '100%';
    })
    .map(
      (rule) =>
        `${rule.file}:${rule.line} ${rule.selector} | ${/width:[^;]*/.exec(rule.body)[0].trim()}` +
        ` | ${/padding[^;]*/.exec(rule.body)[0].trim()}`
    );

  assert.deepEqual(
    offenders,
    [],
    'a percentage padding on an element narrower than its containing block is ' +
      'multiplied against the wrong box. Express it as ' +
      'calc(var(--plate-width) * <fraction>) against the element\'s own width, ' +
      'the way .status in pages/hub/merch-store/fulfillment.module.css does, or ' +
      'drop the plate for a card sized by its content:\n  ' +
      offenders.join('\n  ')
  );
});

test('every Marketplace focus ring out-ranks the global reset', () => {
  const reset = readFileSync(join(ROOT, 'src/index.css'), 'utf8');
  assert.match(
    reset,
    /button:focus\s*\{[^}]*outline:\s*none\s*!important/,
    'the global reset moved or changed; re-check whether these rings still need to shout'
  );

  const erased = rules
    .filter((rule) => rule.selector.includes(':focus-visible'))
    .filter((rule) => /outline:/.test(rule.body))
    .filter((rule) => !/outline:[^;]*!important/.test(rule.body))
    .map((rule) => `${rule.file}:${rule.line} ${rule.selector}`);

  assert.deepEqual(
    erased,
    [],
    'src/index.css ends input, textarea, select and button :focus with ' +
      '`outline: none !important`, so an outline focus ring declared at normal ' +
      'specificity never paints. Add !important, or use box-shadow, which the ' +
      'reset does not touch:\n  ' + erased.join('\n  ')
  );
});

test('no Marketplace element is named without a role that can carry the name', () => {
  // A div, span or p with no role is `generic`, and assistive technology drops
  // an accessible name on it. Swept across the markup, not a named pair of
  // files: the first pass at this checked two components and three more named
  // divs survived elsewhere.
  const MARKUP_DIRS = [
    'pages/hub/diamond-store',
    'pages/hub/merch-store',
    'pages/hub/club-shop',
    'pages/hub/vip-membership',
    'pages/hub/smarter-rewards',
    'src/components/store',
    'src/components/diamond-store',
    'src/components/marketplace-console',
  ];
  const markupWalk = (dir) =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return markupWalk(rel);
      return /\.(?:js|jsx)$/.test(entry.name) ? [rel] : [];
    });
  const files = [
    ...MARKUP_DIRS.flatMap(markupWalk),
    'pages/hub/diamond-store.js',
    'pages/hub/merch-store.js',
    'pages/hub/club-shop.js',
    'pages/hub/vip-membership.js',
    'pages/hub/smarter-rewards.js',
    'pages/hub/marketplace.js',
  ];

  const named = [];
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    for (const match of source.matchAll(/<(div|span|p|ul|ol|li)\b([^>]*?)>/gs)) {
      const attributes = match[2];
      if (!/\baria-label(?:ledby)?[=\s]/.test(attributes)) continue;
      if (/\brole=/.test(attributes)) continue;
      named.push(
        `${file}:${source.slice(0, match.index).split('\n').length} <${match[1]}${attributes
          .replace(/\s+/g, ' ')
          .slice(0, 70)}>`
      );
    }
  }

  assert.deepEqual(
    named,
    [],
    'an accessible name on a role-less generic element is dropped by assistive ' +
      'technology. Give it a role that can carry a name (group, region, img):\n  ' +
      named.join('\n  ')
  );
});
