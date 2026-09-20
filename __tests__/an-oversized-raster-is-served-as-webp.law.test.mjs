/**
 * AN OVERSIZED RASTER IS SERVED AS WEBP
 *
 * Performance checklist audit, 2026-09-17. Measured on production before the
 * fix: /hub transferred 13,098 KiB on a phone, and the eight largest requests
 * were the hub's own tiles at 1,072 to 1,356 KB each - PNG, straight out of
 * public/, no WebP alongside. Lighthouse scored the page 47. A player's
 * first look at the hub was a thirteen megabyte download.
 *
 * scripts/perf/generate-webp-siblings.mjs wrote a .webp next to every
 * referenced raster over 250 KB (53.1 MB -> 8.1 MB) and every reference was
 * pointed at the sibling. This law keeps it that way: no file under pages/,
 * src/, lib/ or styles/ may reference a PNG or JPEG in public/ that is
 * 250 KB or larger, unless it sits under one of the exclusions below.
 *
 * When it fails, the fix is two commands, not a judgement call:
 *
 *     node scripts/perf/generate-webp-siblings.mjs
 *     (then point the reference at the .webp it printed)
 *
 * Exclusions, each for a stated reason:
 *   - images/footers/      approved footer artwork; bytes are sha256-pinned
 *                          by the-footer-keeps-its-artworks-shape.law
 *   - images/global-header/ approved header artwork; sha256-pinned by
 *                          world-command-menu-law
 *   - images/og-default.png, images/og-card.jpg
 *                          share images read by crawlers that do not all
 *                          decode WebP; kept PNG/JPEG on purpose
 *   - cards/optimized/     card faces already sized for the table
 *   - hub/                 never re-created; Club Arena is a rewrite
 *
 * A PNG or JPEG reference is allowed when the same file also references the
 * .webp sibling: that is the fallback half of an image-set() or a <picture>,
 * and the browser that can decode WebP never fetches it.
 *
 * Adding an exclusion means adding a reason beside it.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');
const MIN_BYTES = 250 * 1024;
const SOURCE_DIRS = ['pages', 'src', 'lib', 'styles'];
const SOURCE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.json', '.mjs']);
const EXCLUDED = [
  'images/footers/',
  'images/global-header/',
  'images/og-default.png',
  'images/og-card.jpg',
  'cards/optimized/',
  'hub/',
];

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      yield* walk(p);
    } else yield p;
  }
}

test('no source file references a PNG or JPEG in public/ of 250 KB or more', () => {
  const oversized = new Map();
  for (const file of walk(PUBLIC)) {
    const ext = extname(file).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) continue;
    const rel = relative(PUBLIC, file).split('\\').join('/');
    if (EXCLUDED.some((x) => rel.startsWith(x))) continue;
    if (statSync(file).size >= MIN_BYTES) oversized.set('/' + rel, statSync(file).size);
  }
  assert.ok(oversized.size > 0, 'the walk found no oversized rasters at all; the test is broken, not the repo');

  const offenders = [];
  for (const d of SOURCE_DIRS) {
    const dir = join(ROOT, d);
    if (!existsSync(dir)) continue;
    for (const f of walk(dir)) {
      if (!SOURCE_EXT.has(extname(f))) continue;
      if (f.includes('__tests__') || /\.test\.[cm]?[jt]sx?$/.test(f)) continue;
      const text = readFileSync(f, 'utf8');
      for (const [url, size] of oversized) {
        const sibling = url.replace(/\.(png|jpe?g)$/i, '.webp');
        if (text.includes(sibling)) continue; // fallback half of an image-set() or <picture>
        let at = text.indexOf(url);
        while (at !== -1) {
          const before = at === 0 ? '' : text[at - 1];
          const after = text[at + url.length] || '';
          // A whole reference, not a suffix of a longer path and not a longer
          // filename that happens to start the same way.
          if (!/[A-Za-z0-9_.\/-]/.test(before) && !/[A-Za-z0-9_-]/.test(after)) {
            offenders.push(`${relative(ROOT, f)} -> ${url} (${Math.round(size / 1024)} KB)`);
            break;
          }
          at = text.indexOf(url, at + 1);
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Oversized rasters referenced from source. Run node scripts/perf/generate-webp-siblings.mjs and point each reference at the .webp:\n  ${offenders.join('\n  ')}`
  );
});
