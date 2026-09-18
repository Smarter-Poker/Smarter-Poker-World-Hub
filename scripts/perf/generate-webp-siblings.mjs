#!/usr/bin/env node
/**
 * generate-webp-siblings.mjs - WebP siblings for the oversized rasters in public/
 *
 * Performance checklist audit, phase 2 (2026-09-17). The World Hub served 86
 * referenced PNG/JPG files over 300 KB (83 MB) straight from public/ with no
 * WebP alongside, and only 13 of 221 pages go through next/image. The hub's
 * own tiles (/cards/*.png, 1.1 to 1.5 MB each) load as Three.js textures on
 * every visit to /hub.
 *
 * This writes a .webp next to every raster in public/ at or above MIN_BYTES,
 * keeps alpha, and leaves the original untouched so every existing reference
 * keeps working. Callers opt in by pointing at the .webp (or a <picture> with
 * the PNG as fallback). Outputs are committed, not built: Vercel's build does
 * not run this, so it costs the build nothing and the repo already carries a
 * thousand committed WebP files.
 *
 * Skipped on purpose:
 *   - public/images/footers/**       approved footer artwork, sha256-pinned by
 *                                    __tests__/the-footer-keeps-its-artworks-shape
 *   - public/images/global-header/** approved header artwork, sha256-pinned by
 *                                    __tests__/world-command-menu-law
 *   - public/cards/optimized/**      card faces, already sized for the table
 *   - public/hub/**                  never re-created (Club Arena is a rewrite)
 *   - anything that already has a newer .webp sibling
 *   - rasters nothing in pages/, src/, lib/ or styles/ references (80 of the
 *     166 oversized files are orphans; a sibling for those is repo weight
 *     for nothing). --all converts them anyway.
 *
 * Usage:  node scripts/perf/generate-webp-siblings.mjs [--dry] [--min=250000] [--quality=82]
 * Rerun whenever a large raster lands; it is idempotent.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// fileURLToPath, not URL.pathname: a checkout under a directory with a space
// or any non-ASCII character (`~/My Documents/`, an accented surname) comes
// back percent-encoded from .pathname, every join below then points at a
// directory that does not exist, the walk finds nothing, and the script
// reports "0 files" as though the repository were already converted.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');

// A number that is not a number is not a default. NaN in MIN_BYTES makes
// `size < MIN_BYTES` false for every file, so a typo would silently convert
// the entire directory; NaN in QUALITY reaches sharp as an invalid option.
function numeric(flag, fallback) {
  const raw = args.find((a) => a.startsWith(flag));
  if (!raw) return fallback;
  const value = Number(raw.slice(flag.length));
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${flag}: expected a positive number, got ${JSON.stringify(raw.slice(flag.length))}`);
    process.exit(2);
  }
  return value;
}
const MIN_BYTES = numeric('--min=', 250000);
const QUALITY = numeric('--quality=', 82);
const SKIP = ['images/footers/', 'images/global-header/', 'cards/optimized/', 'hub/'];
const ALL = args.includes('--all');
const SOURCE_DIRS = ['pages', 'src', 'lib', 'styles'];
const SOURCE_EXT = ['.js', '.jsx', '.ts', '.tsx', '.css', '.json', '.mjs'];

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp is not installed; run from the repo root after npm ci');
  process.exit(2);
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// Refusing here is the whole point: the failure this replaces looked exactly
// like success, because a walk of a directory that is not there finds nothing
// to do and says so cheerfully.
if (!existsSync(PUBLIC) || !statSync(PUBLIC).isDirectory()) {
  console.error(`public/ not found under ${ROOT} - run this from the World Hub repository root.`);
  process.exit(2);
}

let sourceText = '';
if (!ALL) {
  const { readFileSync } = await import('node:fs');
  for (const d of SOURCE_DIRS) {
    const dir = join(ROOT, d);
    if (!existsSync(dir)) continue;
    for (const f of walk(dir)) {
      if (SOURCE_EXT.includes(extname(f))) sourceText += readFileSync(f, 'utf8') + '\n';
    }
  }
}

const candidates = [];
for (const file of walk(PUBLIC)) {
  const ext = extname(file).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) continue;
  const rel = relative(PUBLIC, file);
  if (SKIP.some((s) => rel.startsWith(s))) continue;
  const size = statSync(file).size;
  if (size < MIN_BYTES) continue;
  if (!ALL && !sourceText.includes('/' + rel)) continue;
  const out = file.slice(0, -ext.length) + '.webp';
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(file).mtimeMs) continue;
  candidates.push({ file, out, rel, size });
}

let before = 0;
let after = 0;
for (const c of candidates) {
  before += c.size;
  if (DRY) {
    console.log(`would write ${c.rel} -> .webp (${(c.size / 1024).toFixed(0)} KB)`);
    continue;
  }
  const info = await sharp(c.file).webp({ quality: QUALITY, effort: 5, alphaQuality: 90 }).toFile(c.out);
  after += info.size;
  console.log(`${c.rel}: ${(c.size / 1024).toFixed(0)} KB -> ${(info.size / 1024).toFixed(0)} KB`);
}
console.log(`${candidates.length} files, ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB${DRY ? ' (dry run)' : ''}`);
