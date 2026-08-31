import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('Training runtime and strict cache reseeder share one 107-game solver contract', () => {
  const stdout = execFileSync(process.execPath, ['scripts/training-solver-contract-audit.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const report = JSON.parse(stdout);

  assert.equal(report.success, true, report.failures.join('\n'));
  assert.deepEqual(report.failures, []);
  assert.equal(report.totals.games, 107);
  assert.equal(report.totals.pioGames, 84);
  assert.equal(report.totals.chartGames, 2);
  assert.equal(report.totals.scenarioGames, 21);
  assert.equal(report.totals.pioFamilyStackContracts, 25);
  assert.equal(report.totals.preflopGames, 2);
  assert.equal(report.totals.forcedRiverGames, 1);
});

