/**
 * LAW: a World footer never sends a phone its full-resolution PNG.
 *
 * 2026-10-16. Every World footer except Trivia shipped one 0.76-1.53 MB PNG
 * to every page (Personal Assistant 1,056,474 B, News 802,173 B), and the
 * footer art is regularly a Largest Contentful Paint candidate on the mobile
 * budget. scripts/generate-footer-derivatives.mjs now writes WebP
 * derivatives (640 / 960 / 1280 / source width) next to each approved PNG
 * and records them as `sources`. The PNG stays the approved original and the
 * <img> fallback; this law keeps every derivative honest:
 *
 * - each one exists, and its filename hash matches its bytes;
 * - its decoded size keeps the approved aspect within the footer gate's one
 *   density-corrected pixel;
 * - phone-sized files stay small enough to matter;
 * - `sizes` follows BottomNavBar's stage arithmetic;
 * - no derivative is left on disk unreferenced.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { footerSizes, derivativeHeight } from '../scripts/generate-footer-derivatives.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(ROOT, 'src/config/world-footer-navigation.json'), 'utf8'));
const FOOTER_DIR = join(ROOT, 'public/images/footers/world-hub');

// Canvas size from a WebP header (VP8X, VP8L or VP8), without a decoder.
function webpSize(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  throw new Error(`unknown WebP chunk ${chunk}`);
}

const generated = config.worlds.filter((world) => world.artwork?.generatedSources === true);

test('every PNG World footer carries responsive WebP sources', () => {
  for (const world of config.worlds) {
    if (!world.artwork?.src?.endsWith('.png')) continue;
    assert.ok(Array.isArray(world.artwork.sources) && world.artwork.sources.length > 0, `${world.id} ships only its full PNG`);
  }
  assert.ok(generated.length >= 12, `expected the generated footers, found ${generated.length}`);
});

for (const world of generated) {
  test(`${world.id}: derivatives are real, hashed, in aspect and small`, () => {
    const { artwork } = world;
    assert.equal(artwork.sources.length, 1);
    const [source] = artwork.sources;
    assert.equal(source.type, 'image/webp');
    assert.equal(source.sizes, footerSizes(artwork), 'sizes follows the stage arithmetic');
    const candidates = source.srcSet.split(',').map((entry) => entry.trim().split(/\s+/));
    const widths = candidates.map(([, descriptor]) => Number(descriptor.replace(/w$/, '')));
    assert.deepEqual(widths, [...[640, 960, 1280].filter((w) => w < artwork.width), artwork.width]);
    for (const [path, descriptor] of candidates) {
      const width = Number(descriptor.replace(/w$/, ''));
      assert.match(path, new RegExp(`^${artwork.src.replace(/\.png$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${width}\\.[0-9a-f]{10}\\.webp$`));
      const bytes = readFileSync(join(ROOT, 'public', path));
      const hash = path.match(/\.([0-9a-f]{10})\.webp$/)[1];
      assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 10), hash, `${path} bytes match its URL`);
      const size = webpSize(bytes);
      assert.equal(size.width, width, `${path} width`);
      assert.ok(Math.abs(size.height - derivativeHeight(artwork, width)) <= 1, `${path} keeps the approved aspect`);
      if (width <= 640) assert.ok(bytes.length <= 80 * 1024, `${path} is ${bytes.length} B; a phone file must stay under 80 KB`);
      if (width <= 1280) assert.ok(bytes.length <= 200 * 1024, `${path} is ${bytes.length} B; a 1280w file must stay under 200 KB`);
    }
    // The approved original is untouched.
    const png = readFileSync(join(ROOT, 'public', artwork.src));
    assert.equal(createHash('sha256').update(png).digest('hex'), artwork.sha256);
  });
}

test('no footer derivative is left on disk unreferenced', () => {
  const referenced = new Set(config.worlds.flatMap((world) => (world.artwork?.sources || [])
    .flatMap((source) => source.srcSet.split(',').map((entry) => entry.trim().split(/\s+/)[0].split('/').pop()))));
  for (const file of readdirSync(FOOTER_DIR)) {
    if (!file.endsWith('.webp')) continue;
    assert.ok(referenced.has(file), `${file} is not referenced by any footer`);
    assert.ok(statSync(join(FOOTER_DIR, file)).size > 0);
  }
});

test('the footer renders the sources ahead of the approved PNG', () => {
  const nav = readFileSync(join(ROOT, 'src/components/ui/BottomNavBar.jsx'), 'utf8');
  assert.match(nav, /<picture>\s*\{\(artwork\.sources \|\| \[\]\)\.map\(\(source\) => \(\s*<source/);
  assert.match(nav, /src=\{artwork\.src\}/);
});
