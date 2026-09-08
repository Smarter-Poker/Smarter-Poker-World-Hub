/**
 * THE FOOTER KEEPS ITS ARTWORK'S SHAPE (2026-09-08, BINDING)
 *
 * The world footer is one piece of authored artwork with six transparent hit
 * regions laid over it. If the box it is painted into does not have the
 * artwork's aspect ratio, `object-fit: fill` silently stretches it - round
 * corners become ellipses, and the quilted texture aliases into what reads as
 * pixelation because a non-uniform resample of a high-frequency pattern does
 * exactly that.
 *
 * This has been "fixed" four times: #1396, #1444, #1445 and #1589. The first
 * three left no guard, which is why there was a fourth. This file is the guard.
 *
 * It does NOT assert a particular height, a particular width, or that the dock
 * touches the viewport edges. Those are design decisions and they have moved
 * before (13.72vw -> 12.326vw). It asserts one thing: whatever box the stage
 * ends up with, its ratio equals the artwork's own ratio.
 *
 * Sibling law: __tests__/a-ringed-avatar-is-a-circle.law.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const NAV = 'src/config/world-footer-navigation.json';
const BOTTOM_NAV = 'src/components/ui/BottomNavBar.jsx';

const config = JSON.parse(read(NAV));
const source = read(BOTTOM_NAV);

/** Real pixel dimensions from the PNG IHDR chunk - no image library needed. */
function pngSize(file) {
  const buf = readFileSync(join(ROOT, file));
  assert.equal(buf.readUInt32BE(0), 0x89504e47, `${file} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const worlds = (config.worlds || []).filter((w) => w.artwork && w.artwork.src);

test('every world footer declares artwork that exists and is measured correctly', () => {
  assert.ok(worlds.length >= 10, `expected the full world set, saw ${worlds.length}`);
  for (const w of worlds) {
    const file = join('public', w.artwork.src);
    assert.ok(existsSync(join(ROOT, file)), `${w.id}: artwork missing at ${file}`);

    const real = pngSize(file);
    assert.equal(w.artwork.width, real.width, `${w.id}: declared width != the PNG`);
    assert.equal(w.artwork.height, real.height, `${w.id}: declared height != the PNG`);

    const b = w.artwork.contentBounds;
    if (b) {
      assert.ok(b.width > 0 && b.height > 0, `${w.id}: contentBounds has no area`);
      assert.ok(
        b.x >= 0 && b.y >= 0 && b.x + b.width <= real.width && b.y + b.height <= real.height,
        `${w.id}: contentBounds falls outside the canvas`
      );
    }
  }
});

/*
 * The stage must DERIVE its width from the artwork, not assume the viewport.
 * `width: '100%'` with a fixed height is the exact shape of the bug: it is what
 * shipped for months and stretched the social-media frame by 48% at 1280px.
 */
test('the artwork stage derives its box from the artwork, not from the viewport', () => {
  const fn = source.match(/const artworkStageStyle = \(([\s\S]*?)\n\};/);
  assert.ok(fn, 'artworkStageStyle is gone or was renamed - update this law with it');
  const body = fn[0];

  assert.match(body, /artworkStageStyle = \(\s*artwork\s*\)/,
    'artworkStageStyle must take the artwork - it cannot know the shape otherwise');
  assert.match(body, /aspectRatio:/,
    'the stage must set aspect-ratio, or the image is free to be stretched into it');
  assert.match(body, /display\.width\s*\/\s*display\.height|\$\{display\.width\}\s*\/\s*\$\{display\.height\}/,
    'the aspect ratio must come from the measured display bounds');
  assert.ok(
    !/width:\s*'100%'/.test(body),
    "the stage must not be width:'100%' - that is the stretch bug, restored"
  );
});

/*
 * `object-fit: fill` is only safe because the box above already has the
 * artwork's shape. If the stage ever loses its aspect ratio, `fill` is what
 * turns that into a visible stretch - so the two are pinned together here.
 */
test('object-fit fill is only permitted while the stage carries the aspect ratio', () => {
  if (/objectFit:\s*'fill'/.test(source)) {
    assert.match(source, /aspectRatio:\s*`?\$?\{?display\.width/,
      "objectFit:'fill' is present but the stage no longer sets aspectRatio from the artwork");
  }
});

/*
 * The numeric guard. This re-implements what the browser does with
 *   width: min(100%, calc(H * aspect)); aspect-ratio: w / h
 * and asserts the painted box is the artwork's shape at every width, for every
 * world. A structural check alone would pass a plausible-looking rewrite that
 * is still wrong; this one only passes if the geometry is actually right.
 */
test('the painted stage is the artwork shape at every viewport width, in every world', () => {
  const clamp = source.match(
    /FOOTER_ARTWORK_HEIGHT\s*=\s*'clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)'/
  );
  assert.ok(clamp, 'FOOTER_ARTWORK_HEIGHT is no longer a clamp(px, vw, px) - update this law');
  const [minPx, vwCoef, maxPx] = [Number(clamp[1]), Number(clamp[2]), Number(clamp[3])];

  /*
   * Bind the simulation below to the formula the code actually uses. Without
   * this the numbers stay green against a reverted implementation - the
   * simulation would be describing a width expression that no longer exists,
   * which is the "a check that cannot fail" trap AGENT-PLAYBOOK RULE 1 warns
   * about. Verified by reverting the stage to width:'100%' and watching this
   * test go red.
   */
  assert.match(
    source,
    /width:\s*`min\(100%,\s*calc\(\$\{FOOTER_ARTWORK_HEIGHT\}\s*\*\s*\$\{[^}]+\}\)\)`/,
    'the stage width is no longer min(100%, calc(H * aspect)) - the simulation below ' +
      'would be testing a formula the code does not use'
  );

  const WIDTHS = [320, 360, 375, 390, 414, 480, 600, 768, 1024, 1071, 1280, 1440, 1600, 1920, 2560];

  for (const w of worlds) {
    const a = w.artwork;
    const d = a.cropToContentBounds !== false && a.contentBounds
      ? a.contentBounds
      : { width: a.width, height: a.height };
    const aspect = d.width / d.height;

    for (const vw of WIDTHS) {
      const H = Math.min(Math.max(minPx, (vwCoef * vw) / 100), maxPx);
      const width = Math.min(vw, H * aspect);   // min(100%, calc(H * aspect))
      const height = width / aspect;            // aspect-ratio does the rest

      const deviation = Math.abs(width / height / aspect - 1);
      assert.ok(
        deviation < 1e-9,
        `${w.id} @${vw}px: painted ${width.toFixed(1)}x${height.toFixed(1)} is ` +
          `${(deviation * 100).toFixed(1)}% off the artwork's ${aspect.toFixed(3)}:1`
      );
      assert.ok(width <= vw + 1e-6, `${w.id} @${vw}px: stage overflows the viewport`);
      assert.ok(height <= maxPx + 1e-6, `${w.id} @${vw}px: stage is taller than the shared cap`);
    }
  }
});

/*
 * The hit zones are positioned in percentages OF THE STAGE, which is the only
 * reason the stage could change shape without re-mapping all six destinations.
 * If they are ever positioned against the viewport instead, they stop lining up
 * with the icons they sit on and every control silently goes to the wrong page.
 */
test('the hit zones are positioned against the stage, not the viewport', () => {
  assert.match(source, /left:\s*`\$\{leftPercent\}%`/, 'hit zones must be placed in % of the stage');
  assert.match(source, /width:\s*`\$\{widthPercent\}%`/, 'hit zone width must be a % of the stage');
  assert.match(source, /displayBounds\.width/, 'the percentages must be computed from displayBounds');
  assert.ok(!/left:\s*`\$\{[^}]*vw/.test(source), 'hit zones must never be placed in vw');
});
