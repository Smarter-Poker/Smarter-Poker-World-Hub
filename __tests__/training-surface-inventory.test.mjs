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
  assert.equal(manifest.counts.markerDocumentedFollowUp, 0);
  assert.equal(manifest.counts.routeStateCoverageGaps, 0);
  assert.equal(manifest.counts.routeStateUnassignedGaps, 0);
  assert.equal(manifest.classifications.markers.length, manifest.counts.markerCandidates);
  assert.equal(manifest.classifications.possibleUnwiredFunctions.length, manifest.counts.possibleUnwiredFunctions);
  assert.ok(manifest.classifications.markers.every((entry) => entry.disposition && entry.review && entry.rationale));
  assert.ok(manifest.classifications.markers.every((entry) => entry.review === 'accepted'));
  assert.ok(manifest.classifications.possibleUnwiredFunctions.every((entry) => entry.disposition && entry.review && entry.rationale));
  assert.ok(manifest.classifications.possibleUnwiredFunctions.every((entry) => entry.review === 'accepted'));
  assert.ok(manifest.routes.every((route) => route.sample?.path));
  const dedicatedEntries = manifest.routeCoverage.filter(route => route.gameplayDestination);
  assert.ok(dedicatedEntries.length >= 14);
  for (const entry of dedicatedEntries) {
    assert.ok(manifest.games.some(game => entry.gameplayDestination === '/hub/training/arena/' + game.id));
    assert.ok(entry.reachableFiles.includes('pages/hub/training/arena/[gameId].js'));
  }
  const redirected = manifest.routeCoverage.find(route => route.route === '/hub/training/analyzer');
  assert.equal(redirected.redirectDestination, '/hub/training/hand-history-upload');
  assert.ok(redirected.reachableFiles.includes('pages/hub/training/hand-history-upload.js'));
  const aggregate = manifest.routeCoverage.find(route => route.route === '/hub/training/aggregate');
  assert.equal(aggregate.linkedDestination, '/hub/training/reports');
  assert.ok(aggregate.reachableFiles.includes('pages/hub/training/reports.js'));
  const rake = manifest.routeCoverage.find(route => route.route === '/hub/training/custom-rake');
  assert.equal(rake.states.loading.status, 'not-applicable');
  assert.match(rake.states.loading.rationale, /Local Controls/);
  const risk = manifest.routeCoverage.find(route => route.route === '/hub/training/risk-analyzer');
  for (const state of ['loading', 'error', 'retry']) {
    assert.equal(risk.states[state].status, 'implemented-or-detected');
  }
  assert.deepEqual(manifest.gaps.missingLinks, []);
  assert.deepEqual(manifest.gaps.missingApiDefinitions, []);
  assert.equal(manifest.frozenInvariants.globalHeader, 'unchanged');
});
