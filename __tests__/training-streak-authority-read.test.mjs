import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const SOURCE = readFileSync(new URL('../pages/api/training/streak.js', import.meta.url), 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';

function response() {
  return {
    statusCode: 200,
    body: null,
    headersSent: false,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function loadHandler(results) {
  const queries = [];
  const client = {
    from(table) {
      const state = { table, filters: [] };
      queries.push(state);
      const result = results[table] || { data: null, error: null };
      return {
        select() { return this; },
        eq(column, value) { state.filters.push([column, value]); return this; },
        not(column, operator, value) { state.filters.push([column, operator, value]); return this; },
        order() { return this; },
        limit() { return Promise.resolve(result); },
        maybeSingle() { return Promise.resolve(result); },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
    },
  };
  const dependencies = {
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/utils/trainingApiUtils': { withTiming: () => {} },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: USER_ID }, error: null }),
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      runTrainingPersistenceQuery: async (factory) => factory(),
      trainingPersistenceUnavailableBody: () => ({
        success: false,
        code: 'TRAINING_PERSISTENCE_UNAVAILABLE',
        retryable: true,
      }),
    },
  };
  const module = new SourceTextModule(SOURCE, { identifier: 'training-streak-read.js' });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected Training streak dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return { handler: module.namespace.default, queries };
}

async function getStreak(results) {
  const { handler, queries } = await loadHandler(results);
  const res = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
  }, res);
  return { res, queries };
}

test('GET exposes an authoritative partial entitlement and next-window retry state', async () => {
  const { res, queries } = await getStreak({
    training_streaks: {
      data: {
        authority_current_streak: 60,
        authority_longest_streak: 60,
        authority_last_training_date: '2026-09-06',
        authority_streak_start_date: '2026-07-09',
        authority_milestones_claimed: [],
      },
      error: null,
    },
    training_streak_milestone_claims: {
      data: [{
        milestone_days: 60,
        diamonds_awarded: 1000,
        entitlement_diamonds: 1600,
        reward_multiplier: 2,
        claim_count: 1,
        completed_at: null,
        updated_at: '2026-09-06T12:00:00Z',
      }],
      error: null,
    },
    training_level_history: {
      data: [
        { completed_at: '2026-09-06T12:00:00Z' },
        { completed_at: '2026-09-06T16:00:00Z' },
        { completed_at: '2026-09-05T12:00:00Z' },
      ],
      error: null,
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(queries.length, 3);
  assert.deepEqual(queries.map((query) => query.filters), [
    [['user_id', USER_ID]],
    [['user_id', USER_ID]],
    [
      ['user_id', USER_ID],
      ['attempt_id', 'is', null],
      ['practice_only', false],
    ],
  ]);
  assert.deepEqual(res.body.trainingDays, ['2026-09-06', '2026-09-05']);
  const milestone = res.body.streak.allMilestones.find(({ days }) => days === 60);
  assert.deepEqual(milestone, {
    days: 60,
    diamonds: 800,
    name: 'Double Month Legend',
    achieved: true,
    claimed: false,
    settlementStatus: 'partial',
    diamondsAwardedTotal: 1000,
    entitlementDiamonds: 1600,
    diamondsRemaining: 600,
    rewardMultiplier: 2,
    retryable: true,
    retryWindow: 'next_month',
  });
  assert.equal(res.body.streak.claimableMilestones.find(({ days }) => days === 60)?.diamondsRemaining, 600);
});

test('GET keeps a zero-credit first-window deferral observable and retryable', async () => {
  const { res } = await getStreak({
    training_streaks: {
      data: {
        authority_current_streak: 60,
        authority_longest_streak: 60,
        authority_last_training_date: '2026-09-06',
        authority_streak_start_date: '2026-07-09',
        authority_milestones_claimed: [],
      },
      error: null,
    },
    training_streak_milestone_claims: {
      data: [{
        milestone_days: 60,
        diamonds_awarded: 0,
        entitlement_diamonds: 1600,
        reward_multiplier: 2,
        claim_count: 0,
        completed_at: null,
      }],
      error: null,
    },
    training_level_history: { data: [], error: null },
  });

  const milestone = res.body.streak.allMilestones.find(({ days }) => days === 60);
  assert.equal(milestone.settlementStatus, 'partial');
  assert.equal(milestone.diamondsRemaining, 1600);
  assert.equal(milestone.retryable, true);
  assert.equal(milestone.retryWindow, 'next_month');
});

test('GET fails closed when Supabase returns an authority-read error object', async () => {
  const { res } = await getStreak({
    training_streaks: { data: null, error: { message: 'schema cache unavailable' } },
    training_streak_milestone_claims: { data: [], error: null },
    training_level_history: { data: [], error: null },
  });

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'TRAINING_PERSISTENCE_UNAVAILABLE');
  assert.equal(res.body.retryable, true);
});

test('GET fails closed when the verified training-day read fails', async () => {
  const { res } = await getStreak({
    training_streaks: { data: null, error: null },
    training_streak_milestone_claims: { data: [], error: null },
    training_level_history: { data: null, error: { message: 'history unavailable' } },
  });

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'TRAINING_PERSISTENCE_UNAVAILABLE');
});
