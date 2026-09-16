import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

import {
  getIsoWeekKey,
  getLeaderboardPeriodKey,
} from '../src/lib/training/leaderboardPeriod.mjs';
import {
  getTrainingLeaderboardCategory,
  normalizeTrainingLeaderboardCategory,
} from '../src/lib/training/leaderboardDimensions.mjs';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260907010000_training_server_authoritative_completion.sql',
  import.meta.url,
), 'utf8');
const route = readFileSync(new URL(
  '../pages/api/training/leaderboard.js',
  import.meta.url,
), 'utf8');
const library = readFileSync(new URL('../src/data/TRAINING_LIBRARY.js', import.meta.url), 'utf8');

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function loadRoute({
  rankData = {
    myRank: 7,
    myEntry: {
      userId: '00000000-0000-0000-0000-000000000007',
      accuracy: 88.5,
      sessionsCompleted: 3,
      questionsCorrect: 17,
      gtowScoreAvg: 81,
      bestStreak: 6,
    },
  },
} = {}) {
  const queries = [];
  const rpcCalls = [];
  const client = {
    from(table) {
      const query = { table, filters: [] };
      queries.push(query);
      const builder = {
        select() { return this; },
        eq(column, value) { query.filters.push([column, value]); return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        in() { return Promise.resolve({ data: [], error: null }); },
      };
      return builder;
    },
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return Promise.resolve({
        data: rankData,
        error: null,
      });
    },
  };
  const dependencies = {
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '',
      clampPagination: (value) => ({ limit: Math.max(1, Math.min(Number(value) || 20, 100)) }),
      withTiming: () => {},
    },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({
        user: { id: '00000000-0000-0000-0000-000000000007' },
        error: null,
      }),
    },
    '../../../src/lib/training/leaderboardPeriod.mjs': { getLeaderboardPeriodKey },
    '../../../src/lib/training/leaderboardDimensions.mjs': {
      getTrainingLeaderboardCategory,
      normalizeTrainingLeaderboardCategory,
    },
  };
  const module = new SourceTextModule(route, { identifier: 'training-leaderboard.js' });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected leaderboard dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return { handler: module.namespace.default, queries, rpcCalls };
}

test('ISO leaderboard week keys match PostgreSQL IYYY-WIW at year boundaries', () => {
  assert.equal(getIsoWeekKey(new Date('2021-01-01T23:59:59Z')), '2020-W53');
  assert.equal(getIsoWeekKey(new Date('2018-12-31T00:00:00Z')), '2019-W01');
  assert.equal(getIsoWeekKey(new Date('2024-12-31T12:00:00Z')), '2025-W01');
  assert.equal(getLeaderboardPeriodKey('daily', '2025-01-01T01:00:00Z'), '2025-01-01');
  assert.equal(getLeaderboardPeriodKey('monthly', '2025-01-01T01:00:00Z'), '2025-01');
  assert.equal(getLeaderboardPeriodKey('alltime', '2025-01-01T01:00:00Z'), 'alltime');
});

test('verified competition state never reads or accumulates legacy leaderboard rows', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.training_verified_leaderboard/i);
  assert.match(migration, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
  assert.match(migration, /gtow_score_sum numeric NOT NULL DEFAULT 0/i);
  assert.match(migration, /gtow_score_samples integer NOT NULL DEFAULT 0/i);
  assert.match(migration, /verified\.gtow_score_sum \+ p_gtow_score[\s\S]*verified\.gtow_score_samples \+ 1/i);
  assert.doesNotMatch(migration, /verified\.gtow_score_avg \* verified\.sessions_completed/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fn_training_verified_leaderboard_record_v2/i);
  assert.equal(
    (migration.match(/PERFORM public\.fn_training_verified_leaderboard_record_v2\(/g) || []).length,
    4,
  );
  assert.doesNotMatch(
    migration.match(/CREATE OR REPLACE FUNCTION public\.fn_complete_training_attempt_v2[\s\S]*?\$function\$;/i)?.[0] || '',
    /PERFORM public\.fn_training_leaderboard_record\(/i,
  );
  assert.match(route, /\.from\('training_verified_leaderboard'\)/);
  assert.doesNotMatch(route, /\.from\('training_leaderboard'\)/);
  assert.match(route, /getLeaderboardPeriodKey\(period, new Date\(\)\)/);
});

test('the canonical 107-game library has a deterministic server-owned category', () => {
  const games = library.split('\n').flatMap((line) => {
    const match = line.match(
      /^\s*\{\s*id:\s*'([^']+)'.*category:\s*'(MTT|CASH|SPINS|PSYCHOLOGY|ADVANCED)'/,
    );
    return match ? [{ id: match[1], category: match[2].toLowerCase() }] : [];
  });
  assert.equal(games.length, 107);
  for (const game of games) {
    assert.equal(getTrainingLeaderboardCategory(game.id), game.category, game.id);
  }
});

test('the API selects exactly one verified overall, game, or category dimension', async () => {
  const { handler, queries } = await loadRoute();
  for (const query of [
    { period: 'alltime', expected: [['dimension_type', 'overall']] },
    {
      period: 'alltime',
      gameId: 'cash-001',
      expected: [['dimension_type', 'game'], ['game_id', 'cash-001']],
    },
    {
      period: 'alltime',
      category: 'psychology',
      expected: [['dimension_type', 'category'], ['category', 'psychology']],
    },
  ]) {
    queries.length = 0;
    const res = response();
    await handler({ method: 'GET', query }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(queries.length, 1);
    assert.equal(queries[0].table, 'training_verified_leaderboard');
    assert.deepEqual(
      queries[0].filters.slice(-query.expected.length),
      query.expected,
    );
  }

  for (const query of [
    { period: 'alltime', category: 'not-a-category' },
    { period: 'alltime', gameId: 'not-a-game' },
    { period: 'alltime', gameId: 'cash-001', category: 'cash' },
  ]) {
    queries.length = 0;
    const res = response();
    await handler({ method: 'GET', query }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(queries.length, 0);
  }
});

test('authenticated leaderboard responses expose exact server-ranked viewer state privately', async () => {
  const { handler, queries, rpcCalls } = await loadRoute();
  const res = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token-at-least-twenty-characters' },
    query: { period: 'weekly', category: 'cash' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.equal(res.body.dimensionType, 'category');
  assert.equal(res.body.dimensionKey, 'cash');
  assert.equal(res.body.myRank, 7);
  assert.equal(res.body.myEntry.userId, '00000000-0000-0000-0000-000000000007');
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(rpcCalls[0], {
    name: 'fn_training_verified_leaderboard_rank_v2',
    args: {
      p_user_id: '00000000-0000-0000-0000-000000000007',
      p_period_type: 'weekly',
      p_period_key: getLeaderboardPeriodKey('weekly', new Date()),
      p_dimension_type: 'category',
      p_dimension_key: 'cash',
    },
  });
  assert.equal(queries[0].table, 'training_verified_leaderboard');
  assert.equal(queries[1].table, 'profiles');
});

test('an authenticated user without verified competition state has no fabricated rank', async () => {
  const { handler, rpcCalls } = await loadRoute({ rankData: { myRank: null, myEntry: null } });
  const res = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token-at-least-twenty-characters' },
    query: { period: 'alltime' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.myRank, null);
  assert.equal(res.body.myEntry, null);
  assert.equal(rpcCalls.length, 1);
});

test('verified leaderboard storage and writer remain service-only', () => {
  assert.match(
    migration,
    /REVOKE ALL ON public\.training_verified_leaderboard FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT SELECT ON public\.training_verified_leaderboard TO service_role/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.fn_training_verified_leaderboard_record_v2\([\s\S]*?FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.fn_training_verified_leaderboard_record_v2\([\s\S]*?TO service_role/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.fn_training_verified_leaderboard_rank_v2\([\s\S]*?FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.fn_training_verified_leaderboard_rank_v2\([\s\S]*?TO service_role/i,
  );
});
