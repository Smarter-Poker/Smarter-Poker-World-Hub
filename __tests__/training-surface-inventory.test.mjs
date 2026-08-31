import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifestPath = '.agent/audits/2026-08-31-training-phase-2-inventory.json';

test('Phase 2 Training surface inventory is exhaustive and current', () => {
  const output = execFileSync(process.execPath, ['scripts/training-surface-inventory.mjs', '--check'], {
    encoding: 'utf8',
  });
  const summary = JSON.parse(output);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  assert.equal(summary.success, true);
  assert.equal(manifest.counts.canonicalGames, 107);
  assert.equal(manifest.games.length, 107);
  assert.equal(manifest.counts.dynamicGameRouteExpansions, 214);
  assert.equal(manifest.routes.length, manifest.counts.trainingRouteTemplates);
  assert.equal(manifest.apiRoutes.length, manifest.counts.trainingApiRouteTemplates);
  assert.deepEqual(manifest.gaps.missingLinks, []);
  assert.deepEqual(manifest.gaps.missingApiDefinitions, []);
  assert.equal(manifest.frozenInvariants.globalHeader, 'unchanged');
});
