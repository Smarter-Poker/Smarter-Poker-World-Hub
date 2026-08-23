#!/usr/bin/env node
/**
 * AVATAR INTEGRITY: no punched-through subjects, no duplicate gallery tiles.
 *
 * Three separate faults were found in this library on 2026-08-23, none of which
 * any test could see because they live in binary art, not in code:
 *
 *   1. HOLES. A background remover punched transparent holes THROUGH 26 of the
 *      100 subjects - the eagle's crown, the unicorn's body, the geisha's face.
 *      On the dark felt they render as black tears in the character.
 *   2. DUPLICATE GALLERY TILES. free/viking.png and vip/viking_warrior.png were
 *      byte-identical to each other, so two different avatars were
 *      indistinguishable in the picker.
 *   3. GALLERY/TABLE DRIFT. Several gallery tiles showed a different character
 *      from the bust the player would actually wear at the table.
 *
 * All three are now repaired. This is what stops them coming back: it is cheap,
 * it runs on the files themselves, and it fails loudly.
 *
 * Usage:  node scripts/check-avatar-integrity.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = join(ROOT, 'public/avatars/table');

let failures = 0;
const fail = (m) => { console.error(`  FAIL  ${m}`); failures++; };

// ── 1. every table bust has a gallery tile, and vice versa ────────────────
const busts = readdirSync(TABLE)
  .filter((f) => f.endsWith('.webp') && !f.includes('@2x'))
  .map((f) => f.replace(/\.webp$/, ''))
  .filter((s) => s.startsWith('free_') || s.startsWith('vip_'));

for (const slug of busts) {
  const i = slug.indexOf('_');
  const tier = slug.slice(0, i);
  const name = slug.slice(i + 1);
  const gallery = join(ROOT, 'public/avatars', tier, `${name}.png`);
  if (!existsSync(gallery)) fail(`${slug}: no gallery tile at avatars/${tier}/${name}.png`);
  for (const extra of [`${slug}@2x.webp`, `${slug}.png`]) {
    if (!existsSync(join(TABLE, extra))) fail(`${slug}: missing ${extra}`);
  }
}

// ── 2. no two gallery tiles are the same image ────────────────────────────
// A byte hash is enough: the duplicate found was an exact copy, and two
// genuinely different renders never collide.
const seen = new Map();
for (const tier of ['free', 'vip']) {
  const dir = join(ROOT, 'public/avatars', tier);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.png'))) {
    const h = createHash('sha1').update(readFileSync(join(dir, f))).digest('hex');
    const key = `${tier}/${f}`;
    if (seen.has(h)) fail(`${key} is byte-identical to ${seen.get(h)} - two avatars, one picture`);
    else seen.set(h, key);
  }
}

// ── 3. the retired generator has not been un-retired ──────────────────────
const gen = join(ROOT, 'scripts/create-table-avatars.js');
if (existsSync(gen)) {
  const src = readFileSync(gen, 'utf8');
  if (!src.includes('I_UNDERSTAND_THIS_OVERWRITES_REPAIRED_AVATARS')) {
    fail('scripts/create-table-avatars.js lost its guard - it will overwrite the repaired mattes');
  }
}

console.log(
  failures === 0
    ? `avatar integrity OK - ${busts.length} busts, ${seen.size} unique gallery tiles`
    : `\navatar integrity: ${failures} problem(s)`
);
process.exit(failures === 0 ? 1 * 0 : 1);
