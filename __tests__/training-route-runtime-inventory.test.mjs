import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifestUrl = new URL('../.agent/audits/2026-08-31-training-phase-2-inventory.json', import.meta.url);
const runtimeUrl = new URL('../.agent/audits/2026-08-31-training-phase-2-runtime.json', import.meta.url);

test('Phase 2 runtime evidence covers every route and canonical game entry at both viewports', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  const runtime = JSON.parse(await readFile(runtimeUrl, 'utf8'));
  const expectedPaths = new Set([
    ...manifest.routes.map((route) => route.sample.path),
    ...manifest.games.flatMap((game) => [game.playRoute, game.arenaRoute]),
  ]);
  const resultKeys = new Set(runtime.results.map((result) => `${result.viewport}:${result.path}`));

  assert.equal(manifest.counts.canonicalGames, 107);
  assert.equal(manifest.counts.trainingRouteTemplates, 94);
  assert.equal(manifest.counts.routeStateUnassignedGaps, 0);
  assert.equal(expectedPaths.size, 306);
  assert.deepEqual(runtime.scope.viewports, ['desktop', 'mobile']);
  assert.equal(runtime.scope.uniquePaths, expectedPaths.size);
  assert.equal(runtime.scope.jobs, expectedPaths.size * 2);
  assert.equal(runtime.results.length, expectedPaths.size * 2);
  assert.equal(resultKeys.size, runtime.results.length);

  for (const path of expectedPaths) {
    assert.ok(resultKeys.has(`desktop:${path}`), `missing desktop runtime evidence for ${path}`);
    assert.ok(resultKeys.has(`mobile:${path}`), `missing mobile runtime evidence for ${path}`);
  }

  assert.deepEqual(runtime.summary, {
    passed: 612,
    failed: 0,
    scanlineElements: 0,
    overflowFailures: 0,
    brokenImages: 0,
    pageErrors: 0,
    consoleErrors: 0,
  });
  assert.deepEqual(runtime.failures, []);
});
