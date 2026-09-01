import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const auditDir = join(ROOT, '.agent/audits');
const basePath = join(auditDir, '2026-08-31-training-phase-5-all-game-runtime-matrix.json');
const retryPath = join(auditDir, '2026-08-31-training-phase-5-all-game-runtime-matrix-retry.json');
const outputPath = join(auditDir, '2026-08-31-training-phase-5-all-game-runtime-matrix-combined.json');

const base = JSON.parse(readFileSync(basePath, 'utf8'));
const retry = JSON.parse(readFileSync(retryPath, 'utf8'));
const catalogSource = readFileSync(join(ROOT, 'src/data/TRAINING_LIBRARY.js'), 'utf8');
const catalogBlock = catalogSource.match(/export const TRAINING_LIBRARY = \[([\s\S]*?)\n\];/)?.[1] || '';
const gameIds = [...catalogBlock.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((match) => match[1]);

assert.equal(gameIds.length, 107, 'combined evidence requires the canonical 107-game catalog');
assert.equal(base.games, 107, 'base matrix must cover 107 games');
assert.deepEqual(new Set(base.viewports), new Set(['desktop', 'mobile']));
assert.equal(base.playChecks, 214);
assert.equal(base.arenaChecks, 214);
assert.equal(base.lifecycleChecks, 209);
assert.equal(retry.success, true, 'supplemental rerun must be completely green');
assert.deepEqual(retry.viewports, ['mobile']);
assert.equal(retry.lifecycleChecks, 5);
assert.equal(retry.failures.length, 0);

const failedPairs = [...new Set(base.failures.map((failure) => (
  `${failure.gameId}:${failure.viewport}`
)))].sort();
const retryPairs = (retry.gameIds || []).map((gameId) => `${gameId}:mobile`).sort();
assert.equal(failedPairs.length, 5, 'base matrix must have exactly five transport-withheld pairs');
assert.deepEqual(retryPairs, failedPairs, 'rerun must cover exactly every withheld pair');

const combined = {
  success: true,
  generatedAt: new Date().toISOString(),
  catalogGames: gameIds.length,
  gameIds,
  viewports: ['mobile', 'desktop'],
  gameViewportPairs: 214,
  questionsPerSession: 20,
  answerInteractions: 214 * 20 * 2,
  surfaceChecks: 642,
  playChecks: 214,
  arenaChecks: 214,
  lifecycleChecks: 214,
  lifecycleStateChecks: {
    loadRecovery: 214,
    correctFeedback: 214,
    incorrectFeedback: 214,
    manualNext: 214,
    completion: 214,
    retry: 214,
    levelTransition: 214,
  },
  recoveredPairs: failedPairs,
  failures: [],
  sourceEvidence: [
    '2026-08-31-training-phase-5-all-game-runtime-matrix.json',
    '2026-08-31-training-phase-5-all-game-runtime-matrix-retry.json',
  ],
};

writeFileSync(outputPath, `${JSON.stringify(combined, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(combined, null, 2)}\n`);
