import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const SOURCE = readFileSync(new URL('../pages/api/training/get-progress.js', import.meta.url), 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';

function response() {
  return {
    statusCode: 200,
    body: null,
    headersSent: false,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function loadHandler(rows) {
  const query = { filters: [], order: null, limit: null, select: null };
  const client = {
    from(table) {
      assert.equal(table, 'training_progress');
      return {
        select(columns) { query.select = columns; return this; },
        eq(column, value) { query.filters.push([column, value]); return this; },
        order(column, options) { query.order = [column, options]; return this; },
        limit(value) {
          query.limit = value;
          return Promise.resolve({ data: rows, error: null });
        },
        maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      };
    },
  };
  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: USER_ID }, error: null }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value) => typeof value === 'string' ? value : '',
      withTiming: () => {},
    },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
  };
  const module = new SourceTextModule(SOURCE, { identifier: 'training-get-progress.js' });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected get-progress dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return { handler: module.namespace.default, query };
}

test('get-progress returns all 107 canonical progress rows from authority columns', async () => {
  const rows = Array.from({ length: 107 }, (_, index) => ({
    id: `progress-${index + 1}`,
    user_id: USER_ID,
    game_id: `game-${String(index + 1).padStart(3, '0')}`,
    level: 1 + (index % 12),
    hands_played: 10,
    correct_answers: 8,
    total_answers: 10,
    current_streak: index % 6,
    best_streak: index === 106 ? 12 : 5,
    last_played_at: `2026-09-${String(1 + (index % 6)).padStart(2, '0')}T12:00:00Z`,
  }));
  const { handler, query } = await loadHandler(rows);
  const res = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: {},
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.progress.length, 107);
  assert.deepEqual(res.body.stats, {
    totalGamesPlayed: 107,
    totalGamesMastered: 0,
    totalQuestionsAnswered: 1070,
    totalCorrect: 856,
    overallAccuracy: 80,
    bestStreak: 12,
  });
  assert.deepEqual(query.filters, [['user_id', USER_ID]]);
  assert.deepEqual(query.order, ['authority_last_played_at', { ascending: false }]);
  assert.equal(query.limit, 200);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.Vary, 'Authorization');
  for (const alias of [
    'level:authority_level',
    'hands_played:authority_hands_played',
    'correct_answers:authority_correct_answers',
    'total_answers:authority_total_answers',
    'last_played_at:authority_last_played_at',
  ]) {
    assert.match(query.select, new RegExp(alias.replace(':', '\\:')));
  }
});

test('get-progress distinguishes no scored decisions from a measured zero-percent result', async () => {
  const { handler } = await loadHandler([{
    id: 'progress-empty',
    user_id: USER_ID,
    game_id: 'cash-001',
    level: 1,
    hands_played: 0,
    correct_answers: 0,
    total_answers: 0,
    current_streak: 0,
    best_streak: 0,
    last_played_at: null,
  }]);
  const res = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: {},
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.stats.totalQuestionsAnswered, 0);
  assert.equal(res.body.stats.totalCorrect, 0);
  assert.equal(res.body.stats.overallAccuracy, null);
});

test('authoritative readers cannot silently fall back to legacy streak/progress/history truth', () => {
  const sources = new Map([
    ['get-progress', SOURCE],
    ['daily-bonus', readFileSync(new URL('../pages/api/training/daily-bonus.js', import.meta.url), 'utf8')],
    ['Jarvis insights', readFileSync(new URL('../pages/api/jarvis/user-insights.js', import.meta.url), 'utf8')],
    ['progress page', readFileSync(new URL('../pages/hub/training/progress.js', import.meta.url), 'utf8')],
    ['progress API', readFileSync(new URL('../pages/api/training/progress.js', import.meta.url), 'utf8')],
  ]);

  assert.match(sources.get('get-progress'), /level:authority_level/);
  assert.match(sources.get('get-progress'), /last_played_at:authority_last_played_at/);
  assert.doesNotMatch(sources.get('get-progress'), /\.limit\(100\)/);
  assert.match(sources.get('daily-bonus'), /current_streak:authority_current_streak/);
  assert.match(sources.get('Jarvis insights'), /current_streak:authority_current_streak/);
  assert.match(sources.get('Jarvis insights'), /longest_streak:authority_longest_streak/);
  assert.match(sources.get('progress page'), /current_streak:authority_current_streak/);
  assert.match(sources.get('progress API'), /\.not\('attempt_id', 'is', null\)/);
  assert.match(sources.get('progress API'), /level:authority_level/);
});
