import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const handler = readFileSync('pages/api/cron/club-stats-maintenance.js', 'utf8');
const dispatcher = readFileSync('scripts/openclaw-cron-dispatcher.py', 'utf8');
const cronHealth = readFileSync('src/lib/cronHealth.js', 'utf8');

test('Stats maintenance finishes inside its Open Claw request deadline', () => {
  const drainBudget = Number(
    handler.match(/const DRAIN_BUDGET_SECONDS = (\d+);/)?.[1] ?? Number.NaN
  );
  const handlerBudget = Number(
    handler.match(/const HANDLER_BUDGET_SECONDS = (\d+);/)?.[1] ?? Number.NaN
  );
  const responseReserve = Number(
    handler.match(/const RESPONSE_RESERVE_SECONDS = (\d+);/)?.[1] ?? Number.NaN
  );
  const requestTimeout = Number(dispatcher.match(/REQUEST_TIMEOUT = (\d+)/)?.[1] ?? Number.NaN);

  assert.ok(Number.isFinite(drainBudget), 'handler drain budget must remain explicit');
  assert.ok(Number.isFinite(handlerBudget), 'whole-handler budget must remain explicit');
  assert.ok(Number.isFinite(responseReserve), 'response reserve must remain explicit');
  assert.ok(Number.isFinite(requestTimeout), 'dispatcher request timeout must remain explicit');
  assert.ok(
    handlerBudget <= requestTimeout - 30,
    `handler budget ${handlerBudget}s leaves less than 30s inside ${requestTimeout}s caller timeout`
  );
  assert.ok(responseReserve >= 15, 'final response work needs at least 15 seconds');
  assert.match(handler, /const handlerDeadline = started \+ HANDLER_BUDGET_SECONDS \* 1000/);
  assert.match(handler, /const drainDeadline = Math\.min\(/);
  assert.match(handler, /handlerDeadline - RESPONSE_RESERVE_SECONDS \* 1000/);
  assert.match(handler, /drainDeadline - Date\.now\(\)/);
  assert.match(
    handler,
    /if \(Date\.now\(\) < handlerDeadline - RESPONSE_RESERVE_SECONDS \* 1000\)/
  );
  assert.match(
    handler,
    /if \(Date\.now\(\) >= handlerDeadline - RESPONSE_RESERVE_SECONDS \* 1000\)/
  );
  assert.match(handler, /result\.budget_exhausted = true/);
  assert.match(handler, /const workAbort = new AbortController\(\)/);
  assert.match(handler, /admin\.rpc\(name, args\)\.abortSignal\(workAbort\.signal\)/);
  assert.match(handler, /AbortSignal\.timeout\(RESPONSE_RESERVE_SECONDS \* 1000\)/);
  assert.doesNotMatch(handler, /await admin\.rpc\(/);
  assert.doesNotMatch(handler, /Math\.max\(20, Math\.floor\(DRAIN_BUDGET_SECONDS/);
});

test('Cron health telemetry cannot outlive the dispatcher response budget', () => {
  const telemetryTimeout = Number(
    cronHealth.match(/const TELEMETRY_TIMEOUT_MS = (\d+);/)?.[1] ?? Number.NaN
  );
  assert.ok(Number.isFinite(telemetryTimeout), 'telemetry timeout must remain explicit');
  assert.ok(telemetryTimeout <= 10000, 'telemetry may delay a cron response by at most 10 seconds');
  assert.match(cronHealth, /\.abortSignal\(AbortSignal\.timeout\(TELEMETRY_TIMEOUT_MS\)\)/);
});
