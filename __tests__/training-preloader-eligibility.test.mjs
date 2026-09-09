import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../pages/hub/training/gto-preloader.js',
  import.meta.url,
), 'utf8');

test('offline packs request only server-verified unlocked levels', () => {
  assert.match(source, /api\/training\/progress\?gameId=/);
  assert.match(source, /highest_level_unlocked/);
  assert.match(source, /const eligibleLevels = await fetchUnlockedLevels\(tree\.gameId\)/);
  assert.match(source, /for \(const \[index, level\] of eligibleLevels\.entries\(\)\)/);
  assert.match(source, /levels: eligibleLevels/);
  assert.doesNotMatch(source, /for \(const level of LEVELS\)[\s\S]*?batch-preload/);
  assert.doesNotMatch(source, /Cache All 12 Levels/);
});

test('cached-pack completeness is measured against its verified level manifest', () => {
  assert.match(source, /normalizePackLevels\(manifest\.levels\)/);
  assert.match(source, /manifestLevels\.length > 0 && cachedLevels === manifestLevels\.length/);
  assert.match(source, /eligibleLevels: manifestLevels\.length/);
  assert.match(source, /Cache Unlocked Levels/);
});
