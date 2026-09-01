/**
 * THE HAMBURGER IS THE MENU (Dan, 2026-09-01, BINDING)
 *
 * "M-bars" is a copy and layout rule. It does not refer to the approved
 * hamburger menu icon. The hamburger must never be replaced with a gear,
 * settings icon, command grid, or other substitute.
 *
 * This file is the door. It runs in `prebuild`, so a build cannot ship a
 * regressed menu trigger or a box painted over a chrome icon.
 *
 * The sibling law lives at club-arena/tests/approvedHamburgerGearGuard.law.test.ts.
 * Change one, look at the other.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const sha256 = (file) =>
  createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex');

/** Strip comments so prose about a gear cannot fail the build. */
const maskComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Gear/cog signatures, in SVG, emoji and component form. */
const GEAR = /⚙|<Settings\b|<Cog\b|<Gear\b|M19\.4 15a1\.65/;

const HEADER = 'src/components/ui/UniversalHeader.js';
const COMMANDER = 'src/components/commander/CommanderPageShell.jsx';
const BOTTOM_NAV = 'src/components/ui/BottomNavBar.jsx';

/*
 * The header icons are baked into one piece of approved artwork and the
 * buttons are transparent hit regions laid over it. That means the ART is the
 * icon: swapping this file changes the hamburger with an empty code diff,
 * which is exactly the failure that took longest to find last time.
 */
const APPROVED_ART = {
  'public/images/global-header/global-header-approved-source.png':
    '37f2dd1cf6bf264c20402a1a928fa053bcdde4866b231e6d9c5f7d158d01df2a',
  'public/images/global-header/global-header-desktop.png':
    '7c5613a84a395abd6b9527785b46c99fb28b6264e2258bee366a04cac5500c7f',
};

test('the global header still has a menu button over the approved hamburger slot', () => {
  const header = read(HEADER);
  assert.match(header, /approved-global-header__menu/);
  // The accessible name is world-dependent ("Open Social Command Menu"), so it
  // is not the contract. `data-menu-symbol` is: it names which baked glyph the
  // button sits on, and it must stay the hamburger.
  assert.match(header, /data-menu-symbol="hamburger"/);
  // The slot geometry is what puts the button on the hamburger rather than on
  // Back. If this moves, the button is over the wrong icon.
  assert.match(header, /\.approved-global-header__menu \{ left: 1\.7%; width: 7%; \}/);
});

test('the approved header artwork is byte-for-byte the approved artwork', () => {
  for (const [file, hash] of Object.entries(APPROVED_ART)) {
    assert.equal(sha256(file), hash, `${file} was replaced -- open it and look at it`);
  }
});

test('Commander subpages open the menu with the approved hamburger, not a gear or grid', () => {
  const shell = maskComments(read(COMMANDER));
  assert.match(shell, /import \{ Menu \} from 'lucide-react'/);
  assert.match(shell, /<Menu size=\{20\}/);
  assert.doesNotMatch(shell, GEAR);
  assert.doesNotMatch(
    shell,
    /Grid3X3|LayoutGrid|MoreVertical|MoreHorizontal|EllipsisVertical|data-menu-symbol="command-grid"/,
    'the Commander menu trigger must remain the approved hamburger'
  );
});

test('no menu trigger in the header renders a gear', () => {
  const lines = maskComments(read(HEADER)).split('\n');
  const offenders = [];
  lines.forEach((line, i) => {
    if (!GEAR.test(line)) return;
    const block = lines.slice(Math.max(0, i - 12), i + 4).join('\n');
    if (/approved-global-header__menu|data-menu-symbol/.test(block)) {
      offenders.push(`${HEADER}:${i + 1}`);
    }
  });
  assert.deepEqual(offenders, []);
});

/*
 * Dan, 2026-09-01: "Remove any and all boxes that appear over any header or
 * footer icon globally on every page and sub pages."
 *
 * The chrome icons are transparent hit regions over baked art, so a focus
 * outline is a rectangle sitting on top of the icon. Safari on macOS matches
 * :focus-visible after a plain mouse click, so it stuck there after every tap.
 */
const CHROME = [
  [HEADER, '.approved-global-header__button'],
  [BOTTOM_NAV, '.bn-tab'],
];

for (const [file, selector] of CHROME) {
  test(`${file} draws no box over ${selector}`, () => {
    const css = maskComments(read(file));
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // The ring is explicitly killed, for :focus as well as :focus-visible --
    // Safari reaches the first one on a click.
    const kill = new RegExp(
      `${escaped}:focus,\\s*${escaped}:focus-visible\\s*\\{[^}]*outline:\\s*none[^}]*box-shadow:\\s*none[^}]*\\}`
    );
    assert.match(css, kill, `${file} must neutralise the focus ring on ${selector}`);

    // And nothing anywhere in its focus rules puts one back. Read the VALUES:
    // a negative lookahead after \s* backtracks to zero width and matches
    // `outline: none`, the one value we mean to allow.
    const blocks = css.match(new RegExp(`${escaped}:focus[^{]*\\{[^}]*\\}`, 'g')) ?? [];
    assert.ok(blocks.length > 0, `${file} lost its ${selector} focus state entirely`);
    const combined = blocks.join('\n');
    const values = (prop) =>
      [...combined.matchAll(new RegExp(`${prop}\\s*:\\s*([^;}]+)`, 'g'))].map((m) =>
        m[1].trim().toLowerCase()
      );
    const boxy = [...values('outline'), ...values('box-shadow')].filter((v) => v !== 'none');
    assert.deepEqual(boxy, [], `${file} still draws a box over ${selector}`);

    // A ring drawn as a bordered pseudo-element is still a box. This is not
    // hypothetical: main replaced the outline with
    // `:focus-visible::before { border: 2px solid #36baff; inset: 2px }`,
    // which is the exact cyan rectangle Dan screenshotted. Both attempts were
    // shapes with straight edges. The answer is not a better-placed box.
    const pseudo =
      css.match(new RegExp(`${escaped}:focus[^{]*::(?:before|after)\\s*\\{[^}]*\\}`, 'g')) ?? [];
    for (const block of pseudo) {
      assert.doesNotMatch(
        block,
        /border(-(top|right|bottom|left))?\s*:\s*(?!none|0)[^;]*\d/,
        `${file} draws a pseudo-element ring over ${selector} -- that is still a box`
      );
      assert.doesNotMatch(
        block,
        /box-shadow\s*:\s*(?!none)[^;]*\d/,
        `${file} draws a pseudo-element shadow ring over ${selector}`
      );
    }

    // Keyboard users must still be able to see where they are.
    assert.match(combined, /radial-gradient/, `${file} left ${selector} with no focus cue`);
  });
}
