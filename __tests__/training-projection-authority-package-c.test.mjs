import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeRequire = createRequire(import.meta.url);
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function compileModule(relativePath, dependencies) {
  const babel = nodeRequire('@babel/core');
  const transformModulesCommonJs = nodeRequire('@babel/plugin-transform-modules-commonjs');
  const compiled = babel.transformSync(read(relativePath), {
    babelrc: false,
    configFile: false,
    filename: relativePath,
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;
  const module = { exports: {} };
  const evaluate = new Function('require', 'module', 'exports', compiled);
  evaluate((specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected ${relativePath} dependency: ${specifier}`);
    return dependencies[specifier];
  }, module, module.exports);
  return module.exports;
}

function loadProgressContract() {
  return compileModule('src/hooks/useTrainingProgress.js', {
    react: {
      useState() {}, useEffect() {}, useCallback(value) { return value; }, useRef(value) { return { current: value }; },
    },
    '../components/training/GameBadge': {
      getPlayStatus() {}, getRankFromMastery() {}, USER_RANKS: { UNRANKED: 'unranked' },
    },
    '../engine/EventBus': { eventBus: {}, EventType: {} },
    '../lib/authUtils': { authedFetch() {}, getAuthUser() {} },
  });
}

function createResponse() {
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

function makeThenableQuery(table, result, calls) {
  const query = {
    select(...args) { calls.push([table, 'select', ...args]); return query; },
    eq(...args) { calls.push([table, 'eq', ...args]); return query; },
    not(...args) { calls.push([table, 'not', ...args]); return query; },
    gte(...args) { calls.push([table, 'gte', ...args]); return query; },
    lte(...args) { calls.push([table, 'lte', ...args]); return query; },
    order(...args) { calls.push([table, 'order', ...args]); return query; },
    limit(...args) { calls.push([table, 'limit', ...args]); return query; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return query;
}

function loadReadApi(relativePath, resultsByTable) {
  const calls = [];
  const client = {
    from(table) {
      calls.push([table, 'from']);
      return makeThenableQuery(table, resultsByTable[table] || { data: [], error: null, count: 0 }, calls);
    },
  };
  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: 'user-a' }, error: null }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value) => String(value || ''), withTiming() {},
    },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../src/data/TRAINING_LIBRARY': {
      TRAINING_LIBRARY: [{ id: 'cash-001', name: 'Cash One', category: 'Cash', difficulty: 1 }],
    },
    '../../../src/lib/training/questionAnalytics.mjs': { buildQuestionConfusion: () => [] },
    '../../../src/lib/training/sessionEvidence.mjs': {
      deriveTrainingSessionAccuracy: (session) => {
        const hands = Number(session?.hands_played);
        const correct = Number(session?.correct_count);
        return Number.isFinite(hands) && hands > 0 && Number.isFinite(correct)
          ? Math.round((correct / hands) * 100)
          : null;
      },
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      runTrainingPersistenceQuery: async (queryFactory) => queryFactory(),
    },
  };
  const exports = compileModule(relativePath, dependencies);
  return { handler: exports.default, calls };
}

test('authenticated identities never inherit a guest cache in a shared browser', () => {
  const { resolveTrainingProgressSnapshot } = loadProgressContract();
  const guestRaw = JSON.stringify({
    'cash-001': { attempts: 9, mastery: 99, completionPercent: 99, currentLevel: 4 },
  });

  for (const userId of ['user-a', 'user-b']) {
    const snapshot = resolveTrainingProgressSnapshot({
      userId,
      serverError: new Error('database unavailable'),
      guestRaw,
    });
    assert.deepEqual(snapshot.progress, {});
    assert.equal(snapshot.source, 'unavailable');
    assert.equal(snapshot.isUnavailable, true);
    assert.match(snapshot.error, /unavailable/i);
  }
});

test('malformed guest cache is rejected while valid guest progress stays guest-scoped', () => {
  const {
    GUEST_TRAINING_PROGRESS_STORAGE_KEY,
    parseGuestTrainingProgress,
    resolveTrainingProgressSnapshot,
  } = loadProgressContract();

  assert.match(GUEST_TRAINING_PROGRESS_STORAGE_KEY, /guest/i);
  assert.equal(parseGuestTrainingProgress('{not-json'), null);
  assert.equal(parseGuestTrainingProgress(JSON.stringify({ 'cash-001': { mastery: 'perfect' } })), null);

  const snapshot = resolveTrainingProgressSnapshot({
    userId: null,
    guestRaw: JSON.stringify({ 'cash-001': { attempts: 2, mastery: 75, completionPercent: 60 } }),
  });
  assert.equal(snapshot.source, 'guest');
  assert.equal(snapshot.progress['cash-001'].mastery, 75);
  assert.equal(snapshot.progress['cash-001'].completionPercent, 60);
});

test('all 107 server rows retain real mastery and completion projections', () => {
  const { normalizeServerTrainingProgress } = loadProgressContract();
  const rows = Array.from({ length: 107 }, (_, index) => ({
    game_id: `game-${String(index + 1).padStart(3, '0')}`,
    hands_played: index + 1,
    correct_answers: index + 1,
    total_answers: index + 2,
    level: 2,
  }));
  const progress = normalizeServerTrainingProgress(rows);

  assert.equal(Object.keys(progress).length, 107);
  assert.ok(progress['game-107'].mastery > 0);
  assert.equal(progress['game-107'].percent, progress['game-107'].completionPercent);
  assert.ok(progress['game-107'].completionPercent > 0);
});

test('Hub and secondary pages consume canonical non-null-attempt progress', () => {
  const hub = read('pages/hub/training.js');
  assert.match(hub, /getGameProgress\?\.\(g\.id\)\?\.completionPercent/);

  const progressPage = read('pages/hub/training/progress.js');
  const streakPage = read('pages/hub/training/streaks.js');
  assert.doesNotMatch(progressPage, /jarvis_training_sessions/);
  assert.match(progressPage, /from\('training_sessions'\)/);
  assert.match(progressPage, /\.not\('attempt_id',\s*'is',\s*null\)/);
  assert.match(progressPage, /variant="retry"/);
  assert.doesNotMatch(streakPage, /jarvis_training_sessions|from\('training_sessions'\)/);
  assert.match(streakPage, /swrKey = user \? '\/api\/training\/streak' : null/);
  assert.match(streakPage, /authedFetch\(url\)/);
  assert.match(streakPage, /payload\?\.success !== true \|\| !payload\?\.streak/);
  assert.match(streakPage, /variant="retry"/);
  assert.doesNotMatch(progressPage, /table:\s*['"]training_sessions['"]/);
  assert.doesNotMatch(streakPage, /table:\s*['"]training_sessions['"]/);
  assert.match(progressPage, /window\.setInterval\(refreshIfVisible, 30_000\)/);
  assert.match(progressPage, /window\.clearInterval\(pollInterval\)/);
  assert.match(progressPage, /removeEventListener\('visibilitychange', refreshIfVisible\)/);
  assert.match(streakPage, /refreshInterval:\s*30_000/);
  assert.match(streakPage, /refreshWhenHidden:\s*false/);
  assert.match(streakPage, /revalidateOnFocus:\s*true/);
});

test('Training readers exclude legacy rows and fail closed on every database result', async () => {
  const readApis = [
    'pages/api/training/recommendations.js',
    'pages/api/training/analytics.js',
    'pages/api/training/smart-practice.js',
  ];
  for (const relativePath of readApis) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /jarvis_training_sessions/);
    assert.match(source, /\.not\('attempt_id',\s*'is',\s*null\)/);

    const { handler, calls } = loadReadApi(relativePath, {
      training_sessions: { data: null, error: { message: 'database unavailable' } },
      training_answers: { data: [], error: null },
      training_spaced_repetition: { data: [], error: null, count: 0 },
    });
    const response = createResponse();
    await handler({
      method: 'GET', headers: { authorization: 'Bearer test-token' }, query: {},
    }, response);
    assert.equal(response.statusCode, 503, `${relativePath} must expose database unavailability`);
    assert.equal(response.body?.success, false);
    assert.equal(response.body?.unavailable, true);
    assert.ok(calls.some((call) => call[0] === 'training_sessions' && call[1] === 'not'));
  }
});

test('secondary analytics and practice query failures cannot become empty-history truth', async () => {
  const cases = [
    {
      relativePath: 'pages/api/training/analytics.js',
      results: {
        training_sessions: { data: [], error: null },
        training_answers: { data: null, error: { message: 'answers unavailable' } },
      },
    },
    {
      relativePath: 'pages/api/training/smart-practice.js',
      results: {
        training_sessions: { data: [], error: null },
        training_answers: { data: [], error: null },
        training_spaced_repetition: { data: null, error: { message: 'schedule unavailable' }, count: null },
      },
    },
  ];

  for (const { relativePath, results } of cases) {
    const { handler } = loadReadApi(relativePath, results);
    const response = createResponse();
    await handler({
      method: 'GET', headers: { authorization: 'Bearer test-token' }, query: {},
    }, response);
    assert.equal(response.statusCode, 503, `${relativePath} must fail closed on a secondary query error`);
    assert.equal(response.body?.success, false);
    assert.equal(response.body?.unavailable, true);
  }
});

test('analytics only projects completed non-practice attempts and measured solver EV', async () => {
  const sessions = [
    {
      id: 'session-authoritative',
      attempt_id: 'attempt-authoritative',
      game_id: 'cash-001',
      gtow_score: 0,
      score_scale: 2,
      hands_played: 2,
      accuracy: 50,
      best_streak: 1,
      level_passed: true,
      level: 1,
      classification_counts: { correct: 1, wrong: 1 },
      created_at: '2026-09-05T12:00:00.000Z',
    },
    {
      id: 'session-legacy-scale',
      attempt_id: 'attempt-legacy-scale',
      game_id: 'cash-001',
      gtow_score: 100,
      score_scale: 1,
      hands_played: 1,
      accuracy: 100,
      best_streak: 2,
      level_passed: true,
      level: 1,
      classification_counts: { best: 1 },
      created_at: '2026-09-05T13:00:00.000Z',
    },
  ];
  const answers = [
    {
      attempt_id: 'attempt-authoritative',
      game_id: 'cash-001',
      question_id: 'q1',
      answer_id: 'call',
      is_correct: false,
      classification: 'wrong',
      ev_loss: 99,
      ev_loss_measured: false,
      solver_verified: true,
      hero_position: 'BTN',
      street: 'flop',
      spot_type: 'single-raised-pot',
      answered_at: '2026-09-05T12:01:00.000Z',
    },
    {
      attempt_id: 'attempt-authoritative',
      game_id: 'cash-001',
      question_id: 'q2',
      answer_id: 'fold',
      is_correct: true,
      classification: 'correct',
      ev_loss: 1.25,
      ev_loss_measured: true,
      solver_verified: true,
      hero_position: 'BTN',
      street: 'flop',
      spot_type: 'single-raised-pot',
      answered_at: '2026-09-05T12:02:00.000Z',
    },
    {
      attempt_id: 'attempt-legacy-scale',
      game_id: 'cash-001',
      question_id: 'q3',
      answer_id: 'raise',
      is_correct: true,
      classification: 'best',
      ev_loss: 10,
      ev_loss_measured: true,
      solver_verified: false,
      hero_position: 'CO',
      street: 'turn',
      spot_type: 'three-bet-pot',
      answered_at: '2026-09-05T13:01:00.000Z',
    },
  ];
  const { handler, calls } = loadReadApi('pages/api/training/analytics.js', {
    training_sessions: { data: sessions, error: null },
    training_answers: { data: answers, error: null },
  });
  const response = createResponse();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: { type: 'full', days: '30', gameId: 'cash-001' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(response.body.milestones.bestScore, 0, 'a verified signed zero score must survive');
  assert.equal(response.body.milestones.last5Avg, 0);
  assert.equal(response.body.milestones.totalEvLoss, 1.25);
  assert.equal(response.body.milestones.avgEvPerHand, 1.25);
  assert.equal(response.body.milestones.measuredEvDecisions, 1);
  assert.equal(response.body.scoreTrend[0].evLoss, 1.25);
  assert.equal(response.body.scoreTrend[0].measuredEvDecisions, 1);
  assert.equal(response.body.scoreTrend[1].gtowScore, null, 'legacy score scales stay unverified');
  assert.equal(response.body.scoreTrend[1].evLoss, null, 'unverified EV is not displayed as zero');
  assert.equal(response.body.positionAccuracy.BTN.evLoss, 1.25);
  assert.equal(response.body.positionAccuracy.CO.evLoss, null);
  assert.ok(calls.some((call) => call[0] === 'training_sessions'
    && call[1] === 'select'
    && String(call[2]).includes('training_attempts!training_sessions_attempt_fk!inner')));
  assert.ok(calls.some((call) => call[0] === 'training_answers'
    && call[1] === 'select'
    && String(call[2]).includes('ev_loss_measured')
    && String(call[2]).includes('training_attempts!training_answers_attempt_fk!inner')));
  for (const table of ['training_sessions', 'training_answers']) {
    assert.ok(calls.some((call) => call[0] === table
      && call[1] === 'eq'
      && call[2] === 'training_attempts.status'
      && call[3] === 'completed'));
    assert.ok(calls.some((call) => call[0] === table
      && call[1] === 'eq'
      && call[2] === 'training_attempts.practice_only'
      && call[3] === false));
  }
});

test('analytics rejects malformed query controls before reading Training history', async () => {
  const { handler, calls } = loadReadApi('pages/api/training/analytics.js', {});
  const invalidDays = createResponse();
  await handler({
    method: 'GET', headers: { authorization: 'Bearer test-token' }, query: { days: 'thirty' },
  }, invalidDays);
  assert.equal(invalidDays.statusCode, 400);
  assert.equal(calls.some((call) => call[1] === 'from'), false);

  const invalidType = createResponse();
  await handler({
    method: 'GET', headers: { authorization: 'Bearer test-token' }, query: { type: 'everything' },
  }, invalidType);
  assert.equal(invalidType.statusCode, 400);
  assert.equal(calls.some((call) => call[1] === 'from'), false);
});

test('Smart Practice excludes practice attempts and never invents unmeasured EV loss', async () => {
  const sessions = Array.from({ length: 3 }, (_, index) => ({
    id: `session-${index}`,
    attempt_id: `attempt-${index}`,
    accuracy: 90,
    hands_played: 10,
    level_passed: true,
    level: 1,
    created_at: `2026-09-05T1${index}:00:00.000Z`,
  }));
  const answers = [
    ...Array.from({ length: 5 }, (_, index) => ({
      attempt_id: 'attempt-0',
      is_correct: false,
      hero_position: 'BTN',
      street: 'flop',
      classification: 'wrong',
      ev_loss: 99 + index,
      ev_loss_measured: false,
      solver_verified: true,
      spot_type: 'facing_cbet',
    })),
    ...Array.from({ length: 5 }, () => ({
      attempt_id: 'attempt-1',
      is_correct: true,
      hero_position: 'BB',
      street: 'turn',
      classification: 'correct',
      ev_loss: 0,
      ev_loss_measured: false,
      solver_verified: true,
      spot_type: 'blind_defense',
    })),
  ];
  const { handler, calls } = loadReadApi('pages/api/training/smart-practice.js', {
    training_sessions: { data: sessions, error: null },
    training_answers: { data: answers, error: null },
    training_spaced_repetition: { data: null, error: null, count: 0 },
  });
  const response = createResponse();
  await handler({
    method: 'GET', headers: { authorization: 'Bearer test-token' }, query: { gameId: 'cash-001' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(response.body.analytics.overallAccuracy, 50);
  assert.equal(response.body.recommendation.type, 'weak_position');
  assert.equal(response.body.recommendation.stats.avgEvLoss, null);
  assert.doesNotMatch(response.body.recommendation.description, /Total -0(?:\.0)? EV/);
  assert.ok(calls.some((call) => call[0] === 'training_sessions'
    && call[1] === 'select'
    && String(call[2]).includes('training_attempts!training_sessions_attempt_fk!inner')));
  assert.ok(calls.some((call) => call[0] === 'training_answers'
    && call[1] === 'select'
    && String(call[2]).includes('ev_loss_measured')
    && String(call[2]).includes('training_attempts!training_answers_attempt_fk!inner')));
  for (const table of ['training_sessions', 'training_answers']) {
    assert.ok(calls.some((call) => call[0] === table
      && call[1] === 'eq'
      && call[2] === 'training_attempts.status'
      && call[3] === 'completed'));
    assert.ok(calls.some((call) => call[0] === table
      && call[1] === 'eq'
      && call[2] === 'training_attempts.practice_only'
      && call[3] === false));
  }
});

test('analytics consumers preserve zero accuracy and render unavailable score or EV honestly', () => {
  const arena = read('src/components/training/GodModeArena.jsx');
  const trends = read('src/components/training/PerformanceTrends.jsx');
  const dashboard = read('src/components/training/CrossSessionAnalytics.jsx');
  assert.doesNotMatch(arena, /milestones\.last5Avg\s*\|\|/);
  assert.match(arena, /Number\.isFinite\(crossSessionAnalytics\.milestones\.overallAccuracy\)/);
  assert.match(trends, /label="Verified Score"/);
  assert.match(trends, /label="Measured EV\/Hand"/);
  assert.doesNotMatch(trends, /milestones\.avgEvPerHand\.toFixed/);
  assert.doesNotMatch(dashboard, /s\.gtoScore\s*\|\|\s*0|s\.evLoss(?:Avg|Total)\s*\|\|\s*0/);
  assert.match(dashboard, /metrics\.totalEV === null \? '-'/);
  assert.match(dashboard, /score === null \? '-'/);
});

test('leak evidence excludes unsealed answers and realtime retires direct rank reads', () => {
  const leaks = read('pages/api/assistant/leaks/detect.js');
  const realtime = read('src/hooks/useTrainingRealtime.js');
  assert.match(leaks, /from\('training_answers'\)[\s\S]{0,500}\.not\('attempt_id',\s*'is',\s*null\)/);
  assert.doesNotMatch(realtime, /training_leaderboard/);
  assert.doesNotMatch(realtime, /pollLeaderboard|leaderboardInterval|lastLeaderboardCheckRef/);
  assert.match(realtime, /POLL_TIMEOUT_MS/);
  assert.match(realtime, /achievementPollInFlightRef/);
  assert.match(realtime, /challengePollInFlightRef/);
  assert.match(realtime, /\.abortSignal\(controller\.signal\)/);
  assert.match(realtime, /clearInterval\(achievementInterval\)/);
  assert.match(realtime, /clearInterval\(challengeInterval\)/);
  assert.match(realtime, /removeEventListener\('visibilitychange', handleVisibility\)/);
});
