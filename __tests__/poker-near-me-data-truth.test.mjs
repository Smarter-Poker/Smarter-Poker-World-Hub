import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyScraperHealth,
  dailyTournamentDedupKey,
  fetchAllRows,
  fetchAllDailyTournamentRows,
  isValidIsoDate,
  isValidIsoMonth,
} from '../src/lib/poker-near-me/dailyTournamentData.mjs';

test('daily tournament retrieval exhausts more than one PostgREST page in order', async () => {
  const source = Array.from({ length: 2305 }, (_, id) => ({ id }));
  const ranges = [];
  const buildQuery = () => ({
    async range(from, to) {
      ranges.push([from, to]);
      return { data: source.slice(from, to + 1), error: null };
    },
  });

  const result = await fetchAllDailyTournamentRows(buildQuery);
  assert.equal(result.error, null);
  assert.equal(result.truncated, false);
  assert.equal(result.rows.length, 2305);
  assert.deepEqual(result.rows.map(row => row.id), source.map(row => row.id));
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('pagination never serves a biased partial result after a later-page error', async () => {
  let calls = 0;
  const result = await fetchAllDailyTournamentRows(() => ({
    async range(from, to) {
      calls += 1;
      if (calls === 2) return { data: null, error: { message: 'timeout' } };
      return { data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })), error: null };
    },
  }));

  assert.deepEqual(result.rows, []);
  assert.equal(result.error.message, 'timeout');
});

test('generic paging contract is reusable across every calendar source', async () => {
  const calls = [];
  const result = await fetchAllRows(() => ({
    range: async (lower, upper) => {
      calls.push([lower, upper]);
      return { data: lower === 0 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }], error: null };
    },
  }), { pageSize: 2, maxRows: 10 });
  assert.deepEqual(result.rows.map((item) => item.id), [1, 2, 3]);
  assert.deepEqual(calls, [[0, 1], [2, 3]]);
  assert.equal(result.truncated, false);
});

test('calendar date validators reject impossible dates and months', () => {
  assert.equal(isValidIsoDate('2026-02-28'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2026-13-01'), false);
  assert.equal(isValidIsoDate('2026-9-01'), false);
  assert.equal(isValidIsoMonth('2026-12'), true);
  assert.equal(isValidIsoMonth('2026-13'), false);
});

test('dedup identity preserves distinct days and named events', () => {
  const base = {
    venue_id: 7,
    event_date: '2026-09-06',
    start_time: '7:00 PM',
    buy_in: 200,
    game_type: "No Limit Hold'em",
    tournament_name: 'Sunday Deepstack',
  };
  assert.notEqual(
    dailyTournamentDedupKey(base),
    dailyTournamentDedupKey({ ...base, event_date: '2026-09-07' }),
  );
  assert.notEqual(
    dailyTournamentDedupKey(base),
    dailyTournamentDedupKey({ ...base, tournament_name: 'Sunday Bounty' }),
  );
});

test('fresh zero-output success is unhealthy unless explicitly valid-empty', () => {
  const zero = classifyScraperHealth({
    heartbeat: { run_status: 'success', records_saved: 0, errors: 0 },
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: 1,
    healthyMinutes: 25,
    deadMinutes: 45,
  });
  assert.equal(zero.status, 'warning');

  const validEmpty = classifyScraperHealth({
    heartbeat: { run_status: 'valid_empty', records_attempted: 0, records_saved: 0, records_rejected: 0, errors: 0, status_reason: 'observed data covers all modeled venues' },
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: 900,
    healthyMinutes: 25,
    deadMinutes: 45,
  });
  assert.equal(validEmpty.status, 'healthy');
});

test('fresh progress and maintenance checkpoints are healthy zero-write outcomes', () => {
  for (const runStatus of ['progress', 'maintenance']) {
    const checkpoint = classifyScraperHealth({
      heartbeat: {
        run_status: runStatus,
        records_saved: 0,
        records_attempted: 0,
        records_rejected: 0,
        errors: 0,
        status_reason: `${runStatus}_confirmed`,
      },
      heartbeatStaleMinutes: 1,
      dataStaleMinutes: 900,
      healthyMinutes: 25,
      deadMinutes: 45,
    });
    assert.equal(checkpoint.status, 'healthy');
    assert.equal(checkpoint.reason, `${runStatus}_confirmed`);
  }

  const malformed = classifyScraperHealth({
    heartbeat: {
      run_status: 'progress',
      records_saved: 1,
      records_attempted: 1,
      records_rejected: 0,
      errors: 0,
    },
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: 1,
    healthyMinutes: 25,
    deadMinutes: 45,
  });
  assert.equal(malformed.status, 'warning');
  assert.match(malformed.reason, /progress.*zero-write/i);
});

test('nonlegacy health cannot accept missing truth counts as a healthy success', () => {
  const result = classifyScraperHealth({
    heartbeat: { run_status: 'success', records_saved: 12, errors: 0 },
    heartbeatStaleMinutes: 2,
    dataStaleMinutes: 2,
    healthyMinutes: 30,
    deadMinutes: 60,
  });
  assert.equal(result.status, 'warning');
  assert.match(result.reason, /missing attempted or rejected/i);
});

test('scraper health cannot be held green by future-dated metrics or source rows', () => {
  const heartbeat = {
    run_status: 'success',
    records_attempted: 3,
    records_saved: 3,
    records_rejected: 0,
    errors: 0,
  };
  const futureMetric = classifyScraperHealth({
    heartbeat,
    heartbeatStaleMinutes: -10,
    dataStaleMinutes: 1,
    healthyMinutes: 30,
    deadMinutes: 60,
  });
  const futureData = classifyScraperHealth({
    heartbeat,
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: -10,
    healthyMinutes: 30,
    deadMinutes: 60,
  });

  assert.equal(futureMetric.status, 'warning');
  assert.match(futureMetric.reason, /future timestamp/);
  assert.equal(futureData.status, 'warning');
  assert.match(futureData.reason, /future timestamp/);
});

test('a success metric with rejected or unconfirmed rows is not healthy', () => {
  for (const heartbeat of [
    { run_status: 'success', records_attempted: 3, records_saved: 2, records_rejected: 1, errors: 0 },
    { run_status: 'success', records_attempted: 3, records_saved: 2, records_rejected: 0, errors: 0 },
  ]) {
    const health = classifyScraperHealth({
      heartbeat,
      heartbeatStaleMinutes: 1,
      dataStaleMinutes: 1,
      healthyMinutes: 25,
      deadMinutes: 45,
    });
    assert.equal(health.status, 'warning');
    assert.match(health.reason, /attempted|persist/i);
  }
});

test('a fresh failed metric is dead and a partial metric is warning', () => {
  const failed = classifyScraperHealth({
    heartbeat: { run_status: 'failed', records_saved: 0, status_reason: 'database rejected batch' },
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: 1,
    healthyMinutes: 25,
    deadMinutes: 45,
  });
  assert.equal(failed.status, 'dead');

  const partial = classifyScraperHealth({
    heartbeat: { run_status: 'partial', records_saved: 9, records_attempted: 10 },
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: 1,
    healthyMinutes: 25,
    deadMinutes: 45,
  });
  assert.equal(partial.status, 'warning');
});
