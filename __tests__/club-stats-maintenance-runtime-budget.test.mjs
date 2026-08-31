import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const handler = readFileSync('pages/api/cron/club-stats-maintenance.js', 'utf8');
const dispatcher = readFileSync('scripts/openclaw-cron-dispatcher.py', 'utf8');

test('Stats maintenance finishes inside its Open Claw request deadline', () => {
  const drainBudget = Number(
    handler.match(/const DRAIN_BUDGET_SECONDS = (\d+);/)?.[1] ?? Number.NaN
  );
  const requestTimeout = Number(dispatcher.match(/REQUEST_TIMEOUT = (\d+)/)?.[1] ?? Number.NaN);

  assert.ok(Number.isFinite(drainBudget), 'handler drain budget must remain explicit');
  assert.ok(Number.isFinite(requestTimeout), 'dispatcher request timeout must remain explicit');
  assert.ok(
    drainBudget <= requestTimeout - 30,
    `drain budget ${drainBudget}s leaves less than 30s inside ${requestTimeout}s caller timeout`
  );
  assert.match(handler, /const drainDeadline = Date\.now\(\) \+ DRAIN_BUDGET_SECONDS \* 1000/);
  assert.match(handler, /drainDeadline - Date\.now\(\)/);
  assert.doesNotMatch(handler, /Math\.max\(20, Math\.floor\(DRAIN_BUDGET_SECONDS/);
});
