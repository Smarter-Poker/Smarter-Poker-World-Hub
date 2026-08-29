/**
 * A WEB APP MANIFEST THAT LIES ABOUT ITS ICON SIZES DOES NOT INSTALL CLEANLY.
 *
 * Found 2026-08-29: `public/manifest.json` declared
 *
 *     { "src": "/icons/icon-512.png", "sizes": "512x512", "purpose": "any maskable" }
 *
 * and the file on disk was **1024x1024**, 657 KB. Chrome checks a manifest
 * icon's real dimensions against the declared `sizes` and ignores the entry
 * when they disagree — so the install prompt was choosing from fewer icons
 * than the manifest appeared to offer, and every install downloaded four times
 * the pixels it asked for. `commander-icon-512.png` had the same shape at
 * 640x640.
 *
 * Neither is the kind of thing anybody notices by looking: the icon renders
 * fine everywhere it is used directly. It only shows up if you measure.
 *
 * This test reads the IHDR chunk of each PNG (bytes 16..24 of the file, which
 * is where width and height live in every valid PNG) and compares it to what
 * the manifest claims. No image library, no dependency to keep current.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MANIFESTS = ['public/manifest.json', 'public/commander-manifest.json'];

/** Width and height straight out of the PNG IHDR chunk. */
function pngSize(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(24);
    fs.readSync(fd, head, 0, 24, 0);
    assert.equal(
      head.toString('ascii', 1, 4),
      'PNG',
      `${file} is declared as image/png in a manifest but is not a PNG`
    );
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Assets served by name, outside any manifest, whose EXTENSION is a promise.
 *
 * Found in the same pass: `icons/icon-192.png`, `icons/apple-touch-icon-180.png`
 * and `default-avatar.png` were all JPEGs with a .png extension. Vercel sets
 * Content-Type from the extension, so the server was announcing image/png over
 * JPEG bytes on three assets — including one the web app manifest declared as
 * `"type": "image/png"` with `"purpose": "any maskable"`, which a JPEG cannot
 * satisfy (no alpha channel to mask against).
 *
 * Browsers mostly sniff past it. Manifest icon validation and maskable-icon
 * processing do not have to, and neither does anything downstream that trusts
 * the header.
 */
const SERVED_PNGS = [
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/apple-touch-icon-180.png',
  'public/icons/commander-apple-touch-icon.png',
  'public/notification-icon.png',
  'public/default-avatar.png',
];

test('a file named .png is a PNG', () => {
  for (const rel of SERVED_PNGS) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const head = Buffer.alloc(8);
    const fd = fs.openSync(file, 'r');
    fs.readSync(fd, head, 0, 8, 0);
    fs.closeSync(fd);
    assert.equal(
      head.toString('hex'),
      '89504e470d0a1a0a',
      `${rel} has a .png extension but is not a PNG (starts ${head.toString('hex')}). ` +
        `Content-Type is served from the extension, so this announces image/png over ` +
        `other bytes — and a JPEG cannot satisfy a maskable manifest icon, which needs alpha.`
    );
  }
});

for (const manifestPath of MANIFESTS) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, manifestPath), 'utf8'));

  test(`${manifestPath}: every icon exists and is the size it claims`, () => {
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'no icons declared');

    for (const icon of manifest.icons) {
      const file = path.join(ROOT, 'public', icon.src.replace(/^\//, ''));
      assert.ok(fs.existsSync(file), `${icon.src} is in ${manifestPath} but not in the repo`);

      // "512x512" or "192x192 512x512" — every declared size must be real.
      for (const size of String(icon.sizes || '').split(/\s+/).filter(Boolean)) {
        const [w, h] = size.split('x').map(Number);
        const actual = pngSize(file);
        assert.deepEqual(
          actual,
          { width: w, height: h },
          `${icon.src} declares sizes "${size}" but the file is ${actual.width}x${actual.height}. ` +
            `Chrome validates this and ignores an icon whose real dimensions disagree, so the ` +
            `install prompt silently has one fewer icon to choose from — and every install ` +
            `downloads the larger file anyway.`
        );
      }
    }
  });

  test(`${manifestPath}: no icon is oversized for what it renders at`, () => {
    // A 512px maskable icon has no business being hundreds of KB. The 1024x1024
    // icon-512.png was 657 KB before this was measured; correctly sized and
    // quantised it is 137 KB with an RMSE of 0.75% against a plain downscale.
    for (const icon of manifest.icons) {
      const file = path.join(ROOT, 'public', icon.src.replace(/^\//, ''));
      if (!fs.existsSync(file)) continue;
      const kb = fs.statSync(file).size / 1024;
      assert.ok(
        kb < 250,
        `${icon.src} is ${kb.toFixed(0)} KB. Manifest icons are fetched on install and on ` +
          `every platform that renders one; run it through pngquant + optipng at its ` +
          `declared size.`
      );
    }
  });
}
