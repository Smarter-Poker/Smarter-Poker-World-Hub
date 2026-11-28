/**
 * POKER NEAR ME IMAGE WEIGHT (2026-11-28)
 *
 * site-wide-payload-budget.test.mjs pins the global header art and the
 * avatar; nothing pinned the #SmarterDesign artwork Poker Near Me added in
 * #3209-#3267: fourteen header scenes and seals and the twelve lobby tiles.
 * One re-export at full quality would quietly double what a phone downloads
 * before the first tap. Ceilings are the largest file measured on
 * 2026-11-28 plus about 15 percent, and each set also has a total.
 *
 * It also keeps the loading strategy honest: the header scene is the first
 * screen and loads eagerly at high priority; lobby tiles past the first two
 * rows (the first eight) load lazily.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEADERS = 'public/images/smarterdesign/headers';
const TILES = 'public/images/smarterdesign/pnm';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const list = (dir, re) => fs.readdirSync(path.join(ROOT, dir)).filter((n) => re.test(n)).sort();
const size = (dir, name) => fs.statSync(path.join(ROOT, dir, name)).size;

// Measured 2026-11-28: largest scene 34,992 (map), total 339,604;
// largest seal 13,298 (locations), total 95,092; largest tile 17,960
// (series), total 156,240.
const BUDGET = Object.freeze({
  scene: { each: 40_000, total: 390_000 },
  seal: { each: 15_500, total: 110_000 },
  tile: { each: 20_500, total: 180_000 },
});

function checkSet(files, dir, budget, label) {
  assert.ok(files.length > 0, `${label}: no files found under ${dir}, so this budget would read nothing`);
  let total = 0;
  for (const name of files) {
    const bytes = size(dir, name);
    total += bytes;
    assert.ok(bytes <= budget.each, `${dir}/${name} is ${bytes} bytes (ceiling ${budget.each}). Re-export it smaller; do not raise the ceiling to fit.`);
  }
  assert.ok(total <= budget.total, `${label} total ${total} bytes (budget ${budget.total})`);
}

test('every Poker Near Me header scene and seal stays inside its byte ceiling', () => {
  checkSet(list(HEADERS, /^pnm-.*-scene\.(webp|avif|png|jpe?g)$/), HEADERS, BUDGET.scene, 'header scenes');
  checkSet(list(HEADERS, /^pnm-.*-seal\.(webp|avif|png|jpe?g)$/), HEADERS, BUDGET.seal, 'header seals');
});

test('every Poker Near Me lobby tile stays inside its byte ceiling', () => {
  checkSet(list(TILES, /^tile-.*\.(webp|avif|png|jpe?g)$/), TILES, BUDGET.tile, 'lobby tiles');
});

test('every header route has its scene and seal, so a missing file is not a passing budget', () => {
  const src = read('src/components/poker-near-me/PnmImageHeader.jsx');
  const art = src.match(/const ART = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(art, 'PnmImageHeader.jsx ART map not found');
  const keys = [...art[1].matchAll(/:\s*'(pnm-[a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 10, `expected the full ART map, read ${keys.length} entries`);
  for (const key of keys) {
    for (const part of ['scene', 'seal']) {
      assert.ok(fs.existsSync(path.join(ROOT, HEADERS, `${key}-${part}.webp`)), `${HEADERS}/${key}-${part}.webp is missing`);
    }
  }
});

test('every lobby tile id has its art, and tiles past the first eight load lazily', () => {
  const src = read('src/components/poker-near-me/lobby/LobbyOverlay.jsx');
  const grid = src.match(/const GRID_HOTSPOTS = \[([\s\S]*?)\];/);
  assert.ok(grid, 'GRID_HOTSPOTS not found');
  const ids = [...grid[1].matchAll(/id:\s*'([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(ids.length >= 8, `expected the twelve tiles, read ${ids.length}`);
  for (const id of ids) assert.ok(fs.existsSync(path.join(ROOT, TILES, `tile-${id}.webp`)), `tile-${id}.webp is missing`);
  const img = src.match(/<img[^>]*className="pnm-sd-tile__icon"[\s\S]*?\/>/);
  assert.ok(img, 'tile <img> not found');
  assert.match(img[0], /loading=\{index < 8 \? 'eager' : 'lazy'\}/, 'tiles beyond the first two rows must load lazily');
  assert.match(img[0], /width=\{256\}/);
  assert.match(img[0], /height=\{256\}/);
});

test('the header scene is the first screen: eager, high priority and sized', () => {
  const src = read('src/components/bankroll/BankrollImageHeader.jsx');
  const scene = src.match(/<img className=\{styles\.scene\}[^>]*>/);
  assert.ok(scene, 'header scene <img> not found');
  assert.match(scene[0], /fetchpriority="high"/);
  assert.doesNotMatch(scene[0], /loading="lazy"/, 'the first-screen header must not wait for lazy loading');
  assert.match(scene[0], /width="1200"/);
  assert.match(scene[0], /height="240"/);
});
