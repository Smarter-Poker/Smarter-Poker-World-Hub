/**
 * LAW: THE GLOBAL HEADER PORTRAIT'S FRAME IS A 0.5px BLACK HAIRLINE, AND THE
 * ARTWORK'S BAKED ORNAMENT IS MASKED - IN EVERY HEADER, AT EVERY WIDTH.
 * ═══════════════════════════════════════════════════════════════════════════
 * Full text: GLOBAL_HEADER_PROFILE_FRAME_LAW.md (repo root).
 *
 * Dan, 2026-09-07, with a screenshot of the chrome ring showing around his
 * photo: "the profile pic is supposed to be a .5 pixel black frame that
 * 'appears invisible' instead of this thick broken frame that exists now.
 * once you fix it back, i need you to harden it, and make it regression proof."
 * Dan, 2026-09-05: "BACK TO THE THICK BROKEN FRAME INSTEAD OF THE THIN .5
 * PIXEL INVISIBLE BLACK FRAME." Dan, 2026-09-03: "INSTEAD OF HAVING THE .50
 * PIXEL BLACK INVISIBLE CIRCLE FRAME." Dan, 2026-08-31: remove the ring.
 *
 * WHY IT KEPT COMING BACK. The approved artwork bakes a silver ring with a
 * blue glow around a placeholder silhouette. On 2026-09-01 (#1216) "the
 * profile image needs to be fixed" was read as "show that ring": the black
 * disc that masked it was removed, the photo was seated in the ring's
 * aperture, and global-header-approved.test.mjs was rewritten to FORBID the
 * disc as "a shape drawn over approved artwork". Every fix after that obeyed
 * the tests - the hairline came back, the offset was corrected - and the ring
 * stayed. The ring IS the "thick broken frame": the photo and the baked ring
 * are two circles that never agree to the pixel, so the ring always reads as a
 * chipped bezel.
 *
 * WHAT THIS PINS, by arithmetic rather than literal, in both headers this repo
 * ships (src/components/ui/UniversalHeader.js for every Hub page, and the
 * vendored vendor/commander-shared/.../CommanderLayout.jsx for Club Commander):
 *   1. the profile button paints an opaque #000 disc (border-radius 50%)
 *      whose geometry on the artwork's 1648x168 plane covers the ornament's
 *      glow (r 52 around (1159.75, 80.5)) and stays off the rails (r 62);
 *      every rule that touches its background, in any media query, bottoms
 *      out in #000 - including :focus-visible;
 *   2. the avatar slot declares `border: 0.5px solid rgba(0, 0, 0, .94)` in
 *      exactly ONE rule, so there is one copy to regress;
 *   3. nothing else draws around the photo, and the explanation stays in the
 *      file next to the rule so the next reader does not "fix" it.
 *
 * "NO BOXES OVER HEADER ICONS" (2026-09-01) is about focus rings on icons; the
 * disc is Dan's mask and that rule's one deliberate exception. If you believe a
 * written rule contradicts this one, stop and ask Dan. Do not show the ring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const HEADERS = [
  {
    name: 'World Hub',
    file: 'src/components/ui/UniversalHeader.js',
    block: 'approved-global-header',
  },
  {
    name: 'Club Commander',
    file: 'vendor/commander-shared/src/components/commander/shared/CommanderLayout.jsx',
    block: 'cmd-approved-header',
  },
];

/* Measured off public/images/global-header/global-header-desktop.png, the
   1648x168 file both headers render at every width (aspect-ratio 1648 / 168,
   object-fit: contain - the ornament is a true circle everywhere). Radial
   luminance around its centre: ring r 40-48, glow gone by r 52, black until
   the header's silver rails begin at r 62. */
const PLANE_W = 1648;
const PLANE_H = 168;
const ORNAMENT = { cx: 1159.75, cy: 80.5, glowR: 52, railR: 62 };
const HAIRLINE = /border:\s*0\.5px\s+solid\s+rgba\(0,\s*0,\s*0,\s*0?\.94\)\s*;/;

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every `selector { ... }` block in the source, with its enclosing @media. */
function rulesFor(css, selector) {
  const out = [];
  const re = new RegExp(`(^|[\\s}])${escape(selector)}\\s*\\{`, 'g');
  let m;
  while ((m = re.exec(css))) {
    const open = m.index + m[0].length;
    const close = css.indexOf('}', open);
    const body = css.slice(open, close);
    let media = null;
    const before = css.slice(0, m.index);
    const mediaRe = /@media\s*([^{]+)\{/g;
    let mm;
    while ((mm = mediaRe.exec(before))) {
      let depth = 1;
      for (let i = mm.index + mm[0].length; i < before.length && depth > 0; i++) {
        if (before[i] === '{') depth++;
        else if (before[i] === '}') depth--;
      }
      if (depth > 0) media = mm[1].trim();
    }
    const decls = new Map();
    for (const d of body.split(';')) {
      const idx = d.indexOf(':');
      if (idx > 0) decls.set(d.slice(0, idx).trim(), d.slice(idx + 1).trim().replace(/\s*!important$/, ''));
    }
    out.push({ media, body, decls });
  }
  return out;
}

const pct = (v, what) => {
  assert.match(String(v), /^-?\d+(\.\d+)?%$/, `${what} must be declared as a percentage`);
  return parseFloat(v);
};

for (const { name, file, block } of HEADERS) {
  const raw = readFileSync(join(root, file), 'utf8');
  const css = stripComments(raw);
  const btnRules = rulesFor(css, `.${block}__profile`);
  const slotRules = rulesFor(css, `.${block}__avatar-slot`);
  const base = btnRules.find((r) => r.media === null);
  const baseSlot = slotRules.find((r) => r.media === null);

  test(`${name}: the profile button is an opaque black disc centred on the ornament, covering its glow and clear of the rails`, () => {
    assert.ok(base, `.${block}__profile base rule must exist`);
    assert.equal(base.decls.get('background'), '#000');
    assert.equal(base.decls.get('border-radius'), '50%');
    assert.equal(base.decls.get('aspect-ratio'), '1');
    assert.equal(base.decls.get('position'), 'absolute');

    // The controls plane has the artwork's aspect ratio, so % of width is %
    // of 1648 and % of height is % of 168; aspect-ratio 1 makes the disc's
    // height equal its width in plane units.
    const left = (pct(base.decls.get('left'), 'profile left') / 100) * PLANE_W;
    const top = (pct(base.decls.get('top'), 'profile top') / 100) * PLANE_H;
    const size = (pct(base.decls.get('width'), 'profile width') / 100) * PLANE_W;
    const r = size / 2;
    const offset = Math.hypot(left + r - ORNAMENT.cx, top + r - ORNAMENT.cy);
    assert.ok(r - offset >= ORNAMENT.glowR + 2, `${name}: the disc (r ${r.toFixed(1)}, ${offset.toFixed(1)} units off the ornament centre) must cover the ring's glow (r 52) from every direction`);
    assert.ok(r + offset <= ORNAMENT.railR - 2, `${name}: the disc must stay off the header rails (r 62)`);
  });

  test(`${name}: every rule that paints the profile button, in any media query or state, bottoms out in #000`, () => {
    for (const rule of btnRules) {
      const bg = rule.decls.get('background');
      if (bg !== undefined) assert.match(bg, /(^|,\s*)#000$/, `${name}: background in @media ${rule.media ?? '(none)'}`);
      assert.equal(rule.decls.get('background-color') ?? '#000', '#000');
      assert.equal(rule.decls.get('background-image') ?? 'none', 'none');
      for (const banned of ['opacity', 'visibility', 'display', 'mix-blend-mode', 'mask', 'clip-path', 'box-shadow', 'outline', 'min-height', 'padding']) {
        assert.ok(!rule.decls.has(banned), `${name}: ${banned} on the profile button (@media ${rule.media ?? '(none)'})`);
      }
      if (rule.decls.has('border-radius')) assert.equal(rule.decls.get('border-radius'), '50%');
    }
    // The shared __button:focus-visible glow replaces the background on
    // keyboard focus; on this button it must be layered over the black.
    const focus = rulesFor(css, `.${block}__profile:focus-visible`);
    assert.ok(focus.length >= 1, `${name}: .${block}__profile:focus-visible must layer its glow over #000`);
    for (const rule of focus) assert.match(rule.decls.get('background') ?? '', /,\s*#000$/);
    // And the button must stay square for the percentages to mean anything:
    // the (0,2,0) min-height reset that beats the global mobile touch floor.
    assert.match(css, new RegExp(`\\.${block}\\s+\\.${block}__button\\s*\\{[^}]*min-height:\\s*0`), `${name}: the min-height reset is gone - a 44px touch floor turns the disc into a tall ellipse`);
  });

  test(`${name}: the slot declares the 0.5px hairline exactly once, in the base rule, and it is a circle inside the disc`, () => {
    assert.ok(baseSlot, `.${block}__avatar-slot base rule must exist`);
    assert.match(baseSlot.body, HAIRLINE);
    assert.equal(baseSlot.decls.get('border-radius'), '50%');
    assert.equal(baseSlot.decls.get('aspect-ratio'), '1');
    assert.equal(baseSlot.decls.get('overflow'), 'hidden');
    assert.equal(baseSlot.decls.get('background'), 'transparent');
    assert.equal(baseSlot.decls.get('top'), '50%');
    assert.equal(baseSlot.decls.get('left'), '50%');

    const withBorder = slotRules.filter((r) => /(^|[\s;])border(-(top|right|bottom|left|width|color|style))?\s*:/.test(r.body));
    assert.equal(withBorder.length, 1, `${name}: exactly one avatar-slot rule may declare the border - one copy to regress`);
    assert.equal(withBorder[0].media, null);

    // The photo sits inside the disc with black around it, never at the disc's
    // full width where its own edge would land on the artwork again.
    const width = pct(baseSlot.decls.get('width'), 'slot width');
    assert.ok(width >= 65 && width <= 80, `${name}: slot width ${width}% must be 65-80% of the disc`);
    for (const rule of slotRules) {
      for (const banned of ['box-shadow', 'outline', 'filter', 'mix-blend-mode']) {
        assert.ok(!rule.decls.has(banned), `${name}: ${banned} on the avatar slot`);
      }
      const w = rule.decls.get('width');
      if (w && w !== 'auto') assert.ok(parseFloat(w) <= 80, `${name}: a slot override widens the photo past the disc`);
    }
  });

  test(`${name}: nothing else draws around the photo, and the law is written next to the rule`, () => {
    const img = rulesFor(css, `.${block}__avatar-slot > .${block}__avatar`);
    assert.ok(img.length >= 1);
    for (const rule of img) {
      assert.equal(rule.decls.get('border'), '0');
      assert.equal(rule.decls.get('border-radius'), '50%');
      assert.equal(rule.decls.get('object-fit'), 'cover');
      assert.ok(!rule.decls.has('box-shadow') && !rule.decls.has('outline'));
    }
    // button > slot > img
    assert.match(raw, new RegExp(`className="${block}__button ${block}__profile"[\\s\\S]*?<span className="${block}__avatar-slot"[^>]*>[\\s\\S]*?<img[\\s\\S]*?className="${block}__avatar"`));
    // The explanation is what stops the disc being read as "a shape drawn over
    // approved artwork" and deleted again. It stays with the rule.
    assert.ok(raw.includes('THE PROFILE FRAME IS A 0.5px BLACK HAIRLINE. THE BAKED ORNAMENT IS MASKED.'), `${name}: the law heading must stay in the stylesheet`);
    assert.ok(raw.includes("'appears invisible'"), `${name}: Dan's words must stay in the stylesheet`);
    assert.ok(raw.includes('GLOBAL_HEADER_PROFILE_FRAME_LAW.md'), `${name}: the stylesheet must point at the law`);
  });
}

test('the law document exists and names both headers and the Club Arena twin', () => {
  const law = readFileSync(join(root, 'GLOBAL_HEADER_PROFILE_FRAME_LAW.md'), 'utf8');
  assert.match(law, /appears invisible/);
  assert.match(law, /UniversalHeader\.js/);
  assert.match(law, /CommanderLayout\.jsx/);
  assert.match(law, /the-header-portrait-frame-is-a-hairline\.law\.test\.ts/);
});
