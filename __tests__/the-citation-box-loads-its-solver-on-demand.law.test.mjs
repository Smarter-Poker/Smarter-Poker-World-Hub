// THE CITATION BOX LOADS ITS SOLVER ON DEMAND (2026-11-28).
//
// CitationBacklinkBox renders on 130+ pages. It imported the solved-spot engine
// (~90KB of source) at module scope, so every one of those pages shipped the
// engine at first load, and /hub/poker-tools went over its 900KB mobile budget
// (e2e/mobile-budget.spec.ts). The engine only answers for a URL that carries a
// spot in its query string, so the box now imports it inside an effect, only
// when there is a query. These two tests pin both halves of that: the import
// stays dynamic, and a bare URL really never produces a solved spot, which is
// what keeps the server render and the first client render identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BOX = 'src/components/seo/CitationBacklinkBox.js';
const ENGINE = 'src/lib/seo/solvedSpotEngine.js';

test('the citation box never imports the solved-spot engine statically', () => {
  const src = readFileSync(join(ROOT, BOX), 'utf8');
  assert.doesNotMatch(src, /^\s*import\s[^;]*solvedSpotEngine/m, `${BOX} imports the engine at module scope again`);
  assert.match(src, /import\('\.\.\/\.\.\/lib\/seo\/solvedSpotEngine'\)/, `${BOX} lost its on-demand engine import`);
  assert.match(src, /if \(!liveQuerySuffix\.startsWith\('\?'\)\) \{\s*setSolvedSpot\(null\);/, `${BOX} must not load the engine for a URL without a query`);
});

test('no tool key yields a solved spot for a bare URL', async () => {
  const src = readFileSync(join(ROOT, ENGINE), 'utf8');
  const keys = [...new Set([...src.matchAll(/key === '([^']+)'/g)].map((m) => m[1]))];
  assert.ok(keys.length > 20, 'could not read the engine tool keys');
  const { computeValidatedSolvedSpot } = await import(join(ROOT, ENGINE));
  const validated = keys.filter((k) => computeValidatedSolvedSpot(k, {})?.hasValidatedSpot);
  assert.deepEqual(validated, [], 'these keys produce a spot with no query, so the box would render differently before and after the engine loads');
});
