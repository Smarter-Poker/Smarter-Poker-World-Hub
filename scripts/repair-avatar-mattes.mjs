#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  repair-avatar-mattes — close the holes a background remover ate through the
 *                         avatars, and leave the gaps it did not
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-09-08: "CHECK ALL THE AVATARS, BUT THEM AGAINST A BLACK BACKGROUND
 * SO YOU CAN SEE ANY THAT NEED TO BE FIXED, FIND ANY AND ALL DISTORTIONS AND FIX
 * THEM ALL AS YOU FIND THEM."
 *
 * On black they are unmistakable. `vip_geisha_master` has her white face makeup
 * torn out in two black wedges across the cheek and chin. `free_penguin` has
 * holes through its white belly. `free_knight`'s armour, `vip_liberty`'s robe,
 * `vip_unicorn`'s muzzle, `vip_jazz`'s saxophone, `free_cyborg`'s chassis — the
 * remover took the subject wherever the subject was close to the backdrop in
 * colour, and it happened to the light-coloured avatars almost without
 * exception. On the felt those read as green tears in the character.
 *
 * ── THIS HAS BEEN FOUND BEFORE, AND THE GUARD THAT WAS LEFT DOES NOT MEASURE IT
 *
 * `scripts/check-avatar-integrity.mjs` opens by saying a background remover
 * "punched transparent holes THROUGH 26 of the 100 subjects" and that "all three
 * are now repaired. This is what stops them coming back." It checks that every
 * bust has a gallery tile, that no two tiles are byte-identical, and that the
 * retired generator still has its guard. **It never looks at a pixel.** So the
 * one fault of the three that lives in the art itself has had no detector at all
 * since the day it was written, and 40 busts are still holed.
 *
 * That is fixed here too: the same classifier this repair uses is what the
 * checker now runs, so the guard and the repair cannot disagree.
 *
 * ── WHAT IT WILL NOT DO
 *
 * It will not fill a gap between a panther's whiskers or a badger's fur spikes.
 * The rule is wall thickness, not enclosure; `scripts/lib/avatarMatte.mjs`
 * carries the measurements the threshold came from, and panther (27 deep, 94
 * thin) is the case that proves it.
 *
 * It will not re-cut the busts from `avatars/{free,vip}/`, which would be the
 * obvious move now that we know some sources are clean.
 * `scripts/create-table-avatars.js` is retired for three stated reasons and the
 * second is exactly this: the busts carry hand repairs that regenerating throws
 * away, and for three slugs the gallery source is a different character. The
 * busts are repaired where they stand.
 *
 * ── RUNNING IT
 *
 *     node scripts/repair-avatar-mattes.mjs           # report only
 *     node scripts/repair-avatar-mattes.mjs --write   # repair
 *
 * A repaired @2x bust is re-derived down to its 125x170 .webp and .png, because
 * those are downscales of it — alpha differs by 0.00 across the family, measured
 * — and leaving them behind would ship a bust whose two halves disagree.
 *
 * Idempotent: a second --write finds nothing.
 */

import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import {
  classifyMatte,
  dropKeepers,
  inpaint,
  largestBlob,
  minWallFor,
  KEEP_SEE_THROUGH,
} from './lib/avatarMatte.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AVATARS = path.resolve(HERE, '../public/avatars');
const WRITE = process.argv.includes('--write');
/**
 * `--busts` / `--gallery` run one half. Inpainting 100 1024px tiles takes about
 * a minute, which is longer than some agent shells will hold a call open, and a
 * job killed halfway leaves the library half-repaired.
 */
const ONLY_BUSTS = process.argv.includes('--busts');
const ONLY_GALLERY = process.argv.includes('--gallery');
const DO_BUSTS = !ONLY_GALLERY;
const DO_GALLERY = !ONLY_BUSTS;

/** Below this a hole is a speck the eye cannot resolve at seat size. */
const MIN_HOLE_PX_AT_340 = 12;



/**
 * The library is WebP end to end — a `.png` beside these files in a working clone
 * is an untracked leftover from before `chore/the-avatars-lose-three-quarters-of-
 * their-weight`, and writing one ships nothing.
 *
 * A REPAIR MUST NOT CHANGE WHAT A FILE COSTS. The two halves of the library are
 * not encoded alike — the 1024px gallery tiles sit around q82 (geisha_master is
 * 107KB; q92 would make it 130KB) while the busts are nearer q92 (free_geisha@2x
 * is 35KB; q92 gives 28KB). One setting for both either inflates the gallery by
 * a fifth or throws 8dB away on the art players actually look at.
 *
 * So each file keeps its own budget: try these in order, take the best quality
 * that comes in no larger than the file it replaces.
 */
const WEBP_LADDER = [92, 86, 82, 78, 74].map((quality) => ({
  quality,
  alphaQuality: 100,
  // effort 4 rather than 6: the ladder already guarantees the file does not
  // grow, and 6 triples the wall clock on a hundred 1024px tiles for about a
  // per-cent of size.
  effort: 4,
}));

/** Encodes within the byte budget the existing file already had. */
async function encodeWithin(sharp, pipeline, budget) {
  let last = null;
  for (const opts of WEBP_LADDER) {
    last = await pipeline().webp(opts).toBuffer();
    if (last.length <= budget) return last;
  }
  return last;
}

const BUST_W = 125;
const BUST_H = 170;

async function readRaw(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Repairs one image in memory. Returns the patched RGBA buffer, or null when
 * there was nothing deep enough to be worth touching.
 */
function repair({ data, width, height }, keeps = []) {
  const n = width * height;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) alpha[i] = data[i * 4 + 3];

  const minWall = minWallFor(height);
  const { deep } = classifyMatte(alpha, width, height, minWall);
  const kept = dropKeepers(deep, width, height, keeps);
  let deepCount = 0;
  for (let i = 0; i < n; i += 1) if (deep[i]) deepCount += 1;
  if (!deepCount) return null;

  const floor = Math.max(4, Math.round((MIN_HOLE_PX_AT_340 * height * height) / (340 * 340)));
  if (largestBlob(deep, width, height) < floor) return null;

  // Solve on the holes, with the surrounding subject as the fixed boundary.
  const value = new Float32Array(n * 3);
  const known = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    known[i] = alpha[i] >= 250 && !deep[i] ? 1 : 0;
    value[i * 3] = data[i * 4];
    value[i * 3 + 1] = data[i * 4 + 1];
    value[i * 3 + 2] = data[i * 4 + 2];
  }
  inpaint(value, known, deep, width, height, 3);

  const out = Buffer.from(data);
  let filled = 0;
  for (let i = 0; i < n; i += 1) {
    if (!deep[i]) continue;
    filled += 1;
    out[i * 4] = Math.max(0, Math.min(255, Math.round(value[i * 3])));
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(value[i * 3 + 1])));
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(value[i * 3 + 2])));
    out[i * 4 + 3] = 255;
  }
  return { buffer: out, filled, kept, width, height };
}

async function main() {
  const table = path.join(AVATARS, 'table');
  const busts = (await readdir(table)).filter((f) => f.endsWith('@2x.webp')).sort();

  const gallery = [];
  for (const tier of ['free', 'vip']) {
    const dir = path.join(AVATARS, tier);
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.webp'))) {
      gallery.push(path.join(dir, f));
    }
  }
  gallery.sort();

  let touched = 0;

  for (const file of DO_BUSTS ? busts : []) {
    const full = path.join(table, file);
    const img = await readRaw(full);
    const rel = `table/${file}`;
    const fixed = repair(img, KEEP_SEE_THROUGH.filter(([f]) => f === rel).map(([, x, y]) => [x, y]));
    const slug = file.replace('@2x.webp', '');
    if (!fixed) continue;
    touched += 1;
    console.log(
      `bust     ${slug.padEnd(26)} filled ${String(fixed.filled).padStart(5)} px` +
        (fixed.kept ? `   kept ${fixed.kept} see-through` : '')
    );
    if (!WRITE) continue;

    const raw = { raw: { width: img.width, height: img.height, channels: 4 } };
    const smallPath = path.join(table, `${slug}.webp`);
    const budget2x = (await stat(full)).size;
    const budget1x = (await stat(smallPath)).size;
    await writeFile(full, await encodeWithin(sharp, () => sharp(fixed.buffer, raw), budget2x));
    // the 125x170 file is a downscale of this one; re-derive rather than leave a
    // bust whose two halves disagree
    await writeFile(
      smallPath,
      await encodeWithin(
        sharp,
        () => sharp(fixed.buffer, raw).resize(BUST_W, BUST_H, { kernel: 'lanczos3' }),
        budget1x
      )
    );
  }

  for (const full of DO_GALLERY ? gallery : []) {
    const img = await readRaw(full);
    const rel = path.relative(AVATARS, full);
    const fixed = repair(img, KEEP_SEE_THROUGH.filter(([f]) => f === rel).map(([, x, y]) => [x, y]));
    if (!fixed) continue;
    touched += 1;
    console.log(
      `gallery  ${rel.padEnd(26)} filled ${String(fixed.filled).padStart(5)} px` +
        (fixed.kept ? `   kept ${fixed.kept} see-through` : '')
    );
    if (!WRITE) continue;
    const budget = (await stat(full)).size;
    await writeFile(
      full,
      await encodeWithin(
        sharp,
        () => sharp(fixed.buffer, { raw: { width: img.width, height: img.height, channels: 4 } }),
        budget
      )
    );
  }

  console.log(
    WRITE
      ? `\nrepaired ${touched} file${touched === 1 ? '' : 's'}`
      : `\n${touched} file${touched === 1 ? '' : 's'} would change — re-run with --write`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
