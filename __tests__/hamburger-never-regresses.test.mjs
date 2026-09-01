/**
 * THE COMMAND GRID IS THE MENU (Dan, 2026-09-01, BINDING)
 *
 * Three-bar artwork is prohibited globally. The menu trigger is the approved
 * premium six-tile command grid; a gear still says "settings" and sends players
 * hunting for a preferences screen that is not there.
 *
 * This file is the door. It runs in `prebuild`, so a build cannot ship a
 * regressed menu trigger or a box painted over a chrome icon.
 *
 * The sibling law lives at club-arena/tests/unit/noThreeBarArtwork.law.test.ts.
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
    '94a4e8790bc67e42bbd290c3dc34caf6c482d8449ce6618952dbb8d433b3c39f',
  'public/images/global-header/global-header-desktop.png':
    '376ee8088b8c9a73cdfa2be24fbbcdd1b31a7a10acc48faafeeb85bc54278771',
};

test('the global header still has a menu button over the command-grid slot', () => {
  const header = read(HEADER);
  assert.match(header, /approved-global-header__menu/);
  // The accessible name is world-dependent ("Open Social Command Menu"), so it
  // is not the contract. `data-menu-symbol` is: it names which baked glyph the
  // button sits on, and it must stay the command grid.
  assert.match(header, /data-menu-symbol="command-grid"/);
  // The slot geometry is what puts the button on the command grid rather than on
  // Back. If this moves, the button is over the wrong icon.
  assert.match(header, /\.approved-global-header__menu \{ left: 1\.7%; width: 7%; \}/);
});

test('the approved header artwork is byte-for-byte the approved artwork', () => {
  for (const [file, hash] of Object.entries(APPROVED_ART)) {
    assert.equal(sha256(file), hash, `${file} was replaced -- open it and look at it`);
  }
});

test('Commander subpages open the menu with a six-tile command grid, not three bars or a gear', () => {
  const shell = maskComments(read(COMMANDER));
  assert.match(shell, /data-menu-symbol="command-grid"/);
  assert.match(shell, /Array\.from\(\{ length: 6 \}/);
  assert.match(shell, /gridTemplateColumns: 'repeat\(2, 1fr\)'/);
  assert.match(shell, /gridTemplateRows: 'repeat\(3, 1fr\)'/);
  assert.doesNotMatch(shell, GEAR);
  assert.doesNotMatch(
    shell,
    /import\s*\{[^}]*\b(?:Menu|AlignJustify|List|ListChecks)\b[^}]*\}\s*from\s*['"]lucide-react['"]|[☰≡≣]|MoreVertical|MoreHorizontal|EllipsisVertical/,
    'the Commander menu trigger must remain the approved command grid'
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
