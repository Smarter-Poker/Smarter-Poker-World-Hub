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
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.counts.canonicalGames, 107);
  assert.equal(manifest.games.length, 107);
  assert.equal(manifest.counts.dynamicGameRouteExpansions, 214);
  assert.equal(manifest.routes.length, manifest.counts.trainingRouteTemplates);
  assert.equal(manifest.apiRoutes.length, manifest.counts.trainingApiRouteTemplates);
  assert.equal(manifest.routeCoverage.length, manifest.routes.length);
  assert.equal(manifest.counts.routeStateCells, manifest.routes.length * 8);
  assert.equal(manifest.ctaLedger.length, manifest.counts.ctas);
  assert.equal(manifest.dialogLedger.length, manifest.counts.dialogs);
  assert.equal(manifest.gaps.ctas.length, 0);
  assert.equal(manifest.counts.ctaWiringGaps, 0);
  assert.equal(manifest.counts.functionPhaseReview, 0);
  assert.equal(manifest.counts.markerPhaseReview, 0);
  assert.equal(manifest.counts.routeStateUnassignedGaps, 0);
  assert.equal(manifest.classifications.markers.length, manifest.counts.markerCandidates);
  assert.equal(manifest.classifications.possibleUnwiredFunctions.length, manifest.counts.possibleUnwiredFunctions);
  assert.ok(manifest.classifications.markers.every((entry) => entry.disposition && entry.review && entry.rationale));
  assert.ok(manifest.classifications.markers.every((entry) => ['accepted', 'documented-follow-up'].includes(entry.review)));
  assert.ok(manifest.classifications.markers.filter((entry) => entry.review === 'documented-follow-up').every((entry) => Number.isInteger(entry.followUpPhase)));
  assert.ok(manifest.classifications.possibleUnwiredFunctions.every((entry) => entry.disposition && entry.review && entry.rationale));
  assert.ok(manifest.classifications.possibleUnwiredFunctions.every((entry) => entry.review === 'accepted'));
  assert.ok(manifest.routes.every((route) => route.sample?.path));
  assert.deepEqual(manifest.gaps.missingLinks, []);
  assert.deepEqual(manifest.gaps.missingApiDefinitions, []);
  assert.equal(manifest.frozenInvariants.globalHeader, 'unchanged');
});
