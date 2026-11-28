/**
 * TRAINING HEADER SEALS ARE PURPOSE-MADE EMBLEMS (#SMARTERDESIGN, 2026-11-27).
 *
 * The round chrome frame on the left of every Training image header shows a
 * bold, recognizable page icon (docs/SMARTERDESIGN.md, Image headers). The first
 * pass cropped those seals out of busy scene renders, assigned in file order,
 * so most read as dark noise at 64px. They are now rendered from one distinct
 * symbol per page by scripts/design/render-training-seals.mjs.
 *
 * This guard keeps that true: every Training header in the registry has a seal
 * file, every rendered seal has a declared symbol, no two pages share a symbol,
 * and the scene generator no longer overwrites the emblems by default.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const renderer = read('scripts/design/render-training-seals.mjs');
const declared = [...renderer.matchAll(/^\s*'((?:training|preflop)-[a-z0-9-]+)': '([a-z0-9-]+)',$/gm)];
const SEAL_ICONS = Object.fromEntries(declared.map((m) => [m[1], m[2]]));
const HAND_MADE = new Set(['icm', 'preflop-charts', 'training-goals', 'training-leaderboard']);

test('every page declares exactly one symbol and no two pages share one', () => {
  assert.ok(declared.length >= 80, `expected the full Training seal set, found ${declared.length}`);
  const icons = Object.values(SEAL_ICONS);
  const dupes = icons.filter((icon, i) => icons.indexOf(icon) !== i);
  assert.deepEqual(dupes, [], `seal symbols are reused: ${dupes.join(', ')}`);
  for (const slug of Object.keys(SEAL_ICONS)) assert.ok(!HAND_MADE.has(slug), `${slug} is hand-made art and must not be re-rendered`);
});

test('every declared symbol resolves to a real icon definition (not an alias re-export)', () => {
  for (const [slug, icon] of Object.entries(SEAL_ICONS)) {
    const file = path.join(ROOT, 'node_modules/lucide-react/dist/esm/icons', `${icon}.js`);
    if (!fs.existsSync(file)) continue; // dependency not installed in this runner; the seal file check below still runs
    assert.match(fs.readFileSync(file, 'utf8'), /const __iconNode = \[/, `${slug}: ${icon} is an alias, name the real icon`);
  }
});

test('every Training image header has its emblem on disk', () => {
  const registry = read('src/data/trainingImageHeaders.js');
  const slugs = [...registry.matchAll(/^\s*'([a-z0-9-]+)': \{ title:/gm)].map((m) => m[1]);
  assert.ok(slugs.length > 60, 'registry parsed');
  for (const slug of slugs) {
    const seal = path.join(ROOT, 'public/images/smarterdesign/headers', `${slug}-seal.webp`);
    assert.ok(fs.existsSync(seal), `${slug} has no seal art`);
    if (!HAND_MADE.has(slug)) assert.ok(SEAL_ICONS[slug], `${slug} seal is not declared in render-training-seals.mjs`);
  }
});

test('the scene generator leaves the emblems alone unless asked', () => {
  const generator = read('scripts/design/generate-training-header-art.py');
  assert.match(generator, /crop_seals = '--crop-seals' in sys\.argv/);
  assert.match(generator, /if crop_seals:\s*\n\s*seal\(/);
});
