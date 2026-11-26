// The source artwork remains intact. The rendered frames share the Poker
// Arena height and cover the viewport, with controls mapped to the same crop.
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

test('every rendered artwork uses the same edge-to-edge stage and Poker Arena height', () => {
  const tokens = read('src/styles/global-tokens.css');
  assert.match(tokens, /--sp-footer-frame-scale: 12\.326vw/);
  assert.match(tokens, /@media \(max-width: 600px\) \{\s*:root \{\s*--sp-footer-frame-scale: 15\.53vw/);
  assert.match(source, /FOOTER_FRAME_HEIGHT = 'min\(132px, var\(--sp-footer-frame-scale\)\)'/);
  assert.match(source, /className="bn-artwork-stage"[\s\S]*?style=\{\{\s*width: '100%',\s*height: FOOTER_FRAME_HEIGHT/);
  assert.match(source, /minWidth: MIN_FOOTER_HIT_ZONE/);
  for (const world of worlds) {
    assert.ok(320 / world.items.length >= 44, `${world.id}: controls must fit at 320px`);
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
