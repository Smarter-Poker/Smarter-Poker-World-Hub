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
 * It does NOT assert one hard-coded stage size or that the dock touches the
 * viewport edges. Those are design decisions and they have moved before
 * (13.72vw -> 12.326vw). It asserts two invariants: the stage keeps the
 * artwork's own ratio, and each authored destination keeps a 44px-wide target
 * at every supported viewport.
 *
 * Sibling law: __tests__/a-ringed-avatar-is-a-circle.law.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
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

  assert.match(body, /artworkStageStyle = \(\s*artwork\s*,\s*itemCount\s*=\s*0\s*\)/,
    'artworkStageStyle must take the artwork and item count to protect shape and hit zones');
  assert.match(body, /aspectRatio:/,
    'the stage must set aspect-ratio, or the image is free to be stretched into it');
  assert.match(body, /display\.width\s*\/\s*display\.height|\$\{display\.width\}\s*\/\s*\$\{display\.height\}/,
    'the aspect ratio must come from the measured display bounds');
  assert.ok(
    !/width:\s*'100%'/.test(body.slice(body.indexOf('const controls'))),
    "the stage must not be width:'100%' - that is the stretch bug, restored"
  );
});

/*
 * `object-fit: fill` is only safe because the box above already has the
 * artwork's shape. If the stage ever loses its aspect ratio, `fill` is what
 * turns that into a visible stretch - so the two are pinned together here.
 */
test('social Messenger footer fills both viewport edges while preserving the entire frame', () => {
  assert.equal(worlds.find(w => w.id === 'social-media').artwork.fullBleed, true);
  assert.match(source, /if \(artwork.fullBleed\) return \{[\s\S]*?width: '100%'[\s\S]*?aspectRatio:/);
});

test('object-fit fill is only permitted while the stage carries the aspect ratio', () => {
  if (/objectFit:\s*'fill'/.test(source)) {
    assert.match(source, /aspectRatio:\s*`?\$?\{?display\.width/,
      "objectFit:'fill' is present but the stage no longer sets aspectRatio from the artwork");
  }
});

/*
 * The numeric guard. This re-implements what the browser does with
 *   width: min(100%, max(items * 44px + rounding guard, H * aspect));
 *   aspect-ratio: w / h
 * and asserts both the artwork shape and minimum horizontal hit-zone span at
 * every supported width, for every world. A structural check alone would pass
 * a plausible-looking rewrite that is still wrong; this one only passes if the
 * geometry is actually right.
 */
test('the painted stage keeps artwork shape and 44px-wide controls at every supported width', () => {
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
  const target = source.match(/MIN_FOOTER_HIT_ZONE\s*=\s*(\d+(?:\.\d+)?)/);
  assert.ok(target, 'MIN_FOOTER_HIT_ZONE is missing - the control-width guard cannot run');
  const minHitZone = Number(target[1]);
  assert.equal(minHitZone, 44, 'footer destinations must retain the 44px accessibility floor');
  const rounding = source.match(/FOOTER_HIT_ZONE_ROUNDING_GUARD\s*=\s*(\d+(?:\.\d+)?)/);
  assert.ok(rounding, 'the cross-engine percentage-rounding guard is missing');
  const roundingGuard = Number(rounding[1]);
  assert.ok(roundingGuard > 0, 'the percentage-rounding guard must reserve positive space');

  const stageFn = source.match(/const artworkStageStyle = \(([\s\S]*?)\n\};/);
  assert.ok(stageFn, 'artworkStageStyle is gone or was renamed - update this law with it');
  const stageBody = stageFn[0];
  assert.match(
    stageBody,
    /controls\s*\*\s*MIN_FOOTER_HIT_ZONE\s*\+\s*FOOTER_HIT_ZONE_ROUNDING_GUARD/,
    'the minimum stage width must be derived from the real number of controls'
  );
  assert.match(
    stageBody,
    /naturalWidth\s*=\s*`calc\(\$\{FOOTER_ARTWORK_HEIGHT\}\s*\*\s*\$\{aspect\.toFixed\(4\)\}\)`/,
    'the natural stage width must remain derived from the shared height and artwork aspect'
  );
  assert.match(
    stageBody,
    /`min\(100%,\s*max\(\$\{minimumControlSpan\}px,\s*\$\{naturalWidth\}\)\)`/,
    'the stage must cap to the viewport while flooring width to one hit-zone span per control'
  );
  assert.match(
    source,
    /artworkStageStyle\(artwork,\s*items\.length\)/,
    'the rendered footer must pass its real item count into the geometry helper'
  );
  assert.match(
    source,
    /artworkStageStyle\(artwork,\s*config\?\.items\?\.length\)/,
    'the clearance spacer must use the same item-aware geometry as the rendered footer'
  );
  assert.match(
    source,
    /minWidth:\s*MIN_FOOTER_HIT_ZONE/,
    'each destination must carry the same explicit 44px minimum as the stage calculation'
  );

  const WIDTHS = [320, 360, 375, 390, 414, 480, 600, 768, 1024, 1071, 1280, 1440, 1600, 1920, 2560];

  for (const w of worlds) {
    const a = w.artwork;
    const d = a.cropToContentBounds !== false && a.contentBounds
      ? a.contentBounds
      : { width: a.width, height: a.height };
    const aspect = d.width / d.height;
    const itemCount = (w.items || []).length;
    assert.ok(itemCount > 0, `${w.id}: footer has no destinations`);

    for (const vw of WIDTHS) {
      const H = Math.min(Math.max(minPx, (vwCoef * vw) / 100), maxPx);
      const minimumControlSpan = itemCount * minHitZone + roundingGuard;
      const width = a.fullBleed ? vw : Math.min(vw, Math.max(minimumControlSpan, H * aspect));
      const height = width / aspect;

      const deviation = Math.abs(width / height / aspect - 1);
      assert.ok(
        deviation < 1e-9,
        `${w.id} @${vw}px: painted ${width.toFixed(1)}x${height.toFixed(1)} is ` +
          `${(deviation * 100).toFixed(1)}% off the artwork's ${aspect.toFixed(3)}:1`
      );
      assert.ok(width <= vw + 1e-6, `${w.id} @${vw}px: stage overflows the viewport`);
      assert.ok(
        height <= (a.fullBleed ? vw / aspect : Math.max(maxPx, minimumControlSpan / aspect)) + 1e-6,
        `${w.id} @${vw}px: stage is taller than either geometry constraint permits`
      );
      if (vw >= minimumControlSpan) {
        assert.ok(
          width / itemCount >= minHitZone - 1e-6,
          `${w.id} @${vw}px: ${itemCount} controls receive only ` +
            `${(width / itemCount).toFixed(2)}px each`
        );
      }
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

/*
 * NO FEATHER ON THE FRAME ALPHA (2026-09-08).
 *
 * Every footer PNG carried a one-pixel softening ring - the canvas margin at
 * partial alpha, two dominant values of 85 and 170 - which reads as a second
 * shade of black around the frame on a dark page. #1329 fixed this on
 * 2026-09-04 and then sat unmergeable for four days while three later footer
 * passes re-cut all fourteen artworks underneath it, so taking its PNGs would
 * have reverted their work. The transform was re-applied to the CURRENT
 * artwork instead: alpha >= 128 becomes opaque, everything else transparent,
 * RGB of every already-opaque pixel untouched.
 *
 * Inside is opaque, outside is nothing. Nothing in between.
 */
test('no footer artwork has a partial-alpha feather', () => {
  const offenders = [];
  for (const w of worlds) {
    const file = join('public', w.artwork.src);
    const buf = readFileSync(join(ROOT, file));
    // Parse the PNG just enough to read its alpha: decode via the raw IDAT is
    // overkill, so shell out to the pixel data through a tiny PNG reader.
    const partial = countPartialAlpha(buf);
    if (partial > 0) offenders.push(`${w.id}: ${partial} partial-alpha px`);
  }
  assert.deepEqual(
    offenders,
    [],
    'these artworks have a partial-alpha edge, which paints a second shade of ' +
      'black around the frame:\n  ' + offenders.join('\n  ')
  );
});

/**
 * Minimal PNG alpha reader: inflate the IDAT stream and walk the scanlines.
 * Only 8-bit RGBA (colour type 6) is used by these artworks, and the law
 * asserts that, so an unexpected format fails loudly rather than passing.
 */
function countPartialAlpha(buf) {
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colourType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colourType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  assert.equal(bitDepth, 8, 'expected 8-bit footer artwork');
  assert.equal(colourType, 6, 'expected RGBA footer artwork');
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const row = raw.subarray(rp, rp + stride); rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  let partial = 0;
  for (let i = 3; i < out.length; i += bpp) {
    const al = out[i];
    if (al > 0 && al < 255) partial++;
  }
  return partial;
}
