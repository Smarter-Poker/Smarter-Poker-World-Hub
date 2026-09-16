import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeVerifiedTrainingWeaknesses } from '../src/lib/training/weaknessAnalysis.mjs';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const TARGETS = [
  'pages/api/training/get-sessions.js',
  'pages/api/training/gto-reports.js',
  'src/lib/liveHelp/contextCollector.ts',
  'src/hooks/useAssistant.js',
  'pages/api/jarvis/user-insights.js',
  'pages/api/gto/generate-adaptive.js',
  'pages/api/gto/get-weak-spots.js',
  'pages/api/gto/lobby-suggestions.js',
];

const SEALED_SESSION_READERS = [
  ...TARGETS,
  'pages/api/training/analytics.js',
  'pages/api/training/gto-reports.js',
  'pages/api/training/recommendations.js',
  'pages/api/training/smart-practice.js',
  'pages/hub/training/progress.js',
  'src/lib/rewards/eggVerifiers.js',
];

function compile(relativePath, dependencies = {}) {
  const babel = require('@babel/core');
  const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
  const compiled = babel.transformSync(read(relativePath), {
    babelrc: false,
    configFile: false,
    filename: relativePath,
    plugins: [transformModulesCommonJs],
    presets: relativePath.endsWith('.ts') ? [require('@babel/preset-typescript')] : [],
    sourceType: 'module',
  }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected ${relativePath} dependency: ${specifier}`);
    return dependencies[specifier];
  }, module, module.exports);
  return module.exports;
}

function response() {
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

function makeClient(resultsByTable, calls) {
  return {
    auth: {
      async getUser() { return { data: { user: { id: 'user-1' } }, error: null }; },
    },
    from(table) {
      calls.push([table, 'from']);
      const result = resultsByTable[table] || { data: [], error: null };
      const query = {
        select(...args) { calls.push([table, 'select', ...args]); return query; },
        eq(...args) { calls.push([table, 'eq', ...args]); return query; },
        not(...args) { calls.push([table, 'not', ...args]); return query; },
        gte(...args) { calls.push([table, 'gte', ...args]); return query; },
        lte(...args) { calls.push([table, 'lte', ...args]); return query; },
        order(...args) { calls.push([table, 'order', ...args]); return query; },
        limit(...args) { calls.push([table, 'limit', ...args]); return query; },
        maybeSingle() { calls.push([table, 'maybeSingle']); return Promise.resolve(result); },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
      return query;
    },
  };
}

function loadGtoRoute(relativePath, resultsByTable) {
  const calls = [];
  const client = makeClient(resultsByTable, calls);
  const sampleRange = { CO: { AA: { raise: 1 } }, BTN: { AA: { raise: 1 } } };
  const module = compile(relativePath, {
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../src/lib/jarvisCache': {
      async getCachedResponse() { return null; },
      async setCachedResponse() {},
    },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/config/solverRanges': {
      RFI: sampleRange,
      RFI_20BB: sampleRange,
      RFI_50BB: sampleRange,
      RFI_200BB: sampleRange,
      BB_DEFENSE: {},
      THREE_BET: {},
    },
  });
  return { handler: module.default, calls };
}

function loadSessionsRoute(resultsByTable) {
  const calls = [];
  const client = makeClient(resultsByTable, calls);
  const sessionEvidence = compile('src/lib/training/sessionEvidence.mjs', {});
  const module = compile('pages/api/training/get-sessions.js', {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: 'user-1' }, error: null }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value) => String(value),
      clampPagination: (value) => ({ limit: Number(value) || 50 }),
      withTiming() {},
    },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../src/lib/training/trainingPersistence.mjs': {
      runTrainingPersistenceQuery: async (queryFactory) => queryFactory(),
    },
    '../../../src/lib/training/sessionEvidence.mjs': sessionEvidence,
  });
  return { handler: module.default, calls };
}

test('every legacy consumer reads only sealed non-practice Training projections', () => {
  for (const file of TARGETS) {
    const source = read(file);
    assert.doesNotMatch(source, /\.from\(['"]jarvis_(?:training_sessions|user_training_profile)['"]\)/, file);
  }

  for (const file of TARGETS.filter((file) => /get-sessions|gto-reports|contextCollector|useAssistant|user-insights|generate-adaptive|get-weak-spots|lobby-suggestions/.test(file))) {
    const source = read(file);
    assert.match(source, /training_attempts!training_sessions_attempt_fk!inner\([^)]*practice_only[^)]*\)/, file);
    assert.match(source, /\.not\(['"]attempt_id['"],\s*['"]is['"],\s*null\)/, file);
    assert.match(source, /\.eq\(['"]training_attempts\.practice_only['"],\s*false\)/, file);
  }

  const sessions = read('pages/api/training/get-sessions.js');
  assert.match(sessions, /from\('training_level_history'\)[\s\S]*?\.not\('attempt_id', 'is', null\)[\s\S]*?\.eq\('practice_only', false\)/);
});

test('every active Training session reader proves completed non-practice ownership', () => {
  for (const file of SEALED_SESSION_READERS) {
    const source = read(file);
    if (!/\.from\(['"]training_sessions['"]\)/.test(source)) continue;
    assert.match(source, /training_attempts!training_sessions_attempt_fk!inner\([^)]*user_id[^)]*status[^)]*practice_only[^)]*\)/, file);
    assert.match(source, /\.eq\(['"]training_attempts\.user_id['"]/, file);
    assert.match(source, /\.eq\(['"]training_attempts\.status['"],\s*['"]completed['"]\)/, file);
    assert.match(source, /\.eq\(['"]training_attempts\.practice_only['"],\s*false\)/, file);
    assert.match(source, /\.not\(['"]attempt_id['"],\s*['"]is['"],\s*null\)/, file);
  }

  assert.equal(existsSync(join(ROOT, 'src/engines/SessionTracker.js')), false);
});

test('session history strips the authority join and never falls back after a database error', async () => {
  const verified = {
    id: 'session-1',
    game_id: 'cash-001',
    gtow_score: 80,
    score_scale: 1,
    attempt_id: 'attempt-1',
    training_attempts: { practice_only: false },
  };
  const success = loadSessionsRoute({ training_sessions: { data: [verified], error: null } });
  const successResponse = response();
  await success.handler({
    method: 'GET', headers: { authorization: 'Bearer token' }, query: { limit: '10' },
  }, successResponse);

  assert.equal(successResponse.statusCode, 200);
  assert.equal(successResponse.body.sessions.length, 1);
  assert.equal(successResponse.body.sessions[0].gtow_score_signed, null);
  assert.equal(successResponse.body.sessions[0].total_ev_loss, null);
  assert.equal(successResponse.body.sessions[0].measured_ev_decisions, 0);
  assert.equal(Object.hasOwn(successResponse.body.sessions[0], 'training_attempts'), false);
  assert.ok(success.calls.some((call) => call[0] === 'training_sessions' && call[1] === 'not' && call[2] === 'attempt_id'));
  assert.ok(success.calls.some((call) => call[0] === 'training_sessions' && call[1] === 'eq' && call[2] === 'training_attempts.practice_only' && call[3] === false));

  const failed = loadSessionsRoute({
    training_sessions: { data: null, error: { message: 'database unavailable' } },
    training_level_history: { data: [{ id: 'must-not-leak' }], error: null },
  });
  const failedResponse = response();
  await failed.handler({
    method: 'GET', headers: { authorization: 'Bearer token' }, query: {},
  }, failedResponse);
  assert.equal(failedResponse.statusCode, 503);
  assert.equal(failedResponse.body.unavailable, true);
  assert.equal(failed.calls.some((call) => call[0] === 'training_level_history'), false);
});

test('the authoritative level-history fallback excludes legacy and practice rows', async () => {
  const route = loadSessionsRoute({
    training_sessions: { data: [], error: null },
    training_level_history: {
      data: [{
        id: 'history-1', game_id: 'cash-001', accuracy_percentage: 75,
        questions_answered: 4, questions_correct: 3, created_at: '2026-09-06T00:00:00Z',
      }],
      error: null,
    },
  });
  const res = response();
  await route.handler({ method: 'GET', headers: { authorization: 'Bearer token' }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sessions[0].gtow_score_signed, null);
  assert.equal(res.body.sessions[0].total_ev_loss, null);
  assert.equal(res.body.sessions[0].measured_ev_decisions, 0);
  assert.ok(route.calls.some((call) => call[0] === 'training_level_history' && call[1] === 'not' && call[2] === 'attempt_id'));
  assert.ok(route.calls.some((call) => call[0] === 'training_level_history' && call[1] === 'eq' && call[2] === 'practice_only' && call[3] === false));
});

test('weakness and profile derivation use canonical projections rather than legacy answer claims', () => {
  const commonDependencies = {
    '../../../src/lib/supabaseServerClient': { createClient() { return {}; } },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
  };
  const { analyzeWeakSpots } = compile('pages/api/gto/get-weak-spots.js', commonDependencies);
  const { deriveVerifiedProfile } = compile('pages/api/gto/lobby-suggestions.js', commonDependencies);
  const sessions = [
    {
      hands_played: 10,
      correct_count: 7,
      position_stats: { BTN: { total: 8, correct: 4 }, BB: { total: 2, correct: 1 } },
      hand_history: [
        { classification: 'blunder', action: 'call', correctAction: 'fold', heroHand: 'AJo' },
        { classification: 'wrong', action: 'call', correctAction: 'fold', heroHand: 'KQo' },
      ],
    },
    {
      hands_played: 10,
      correct_count: 9,
      position_stats: { BTN: { total: 5, correct: 3 }, CO: { total: 5, correct: 5 } },
      hand_history: [],
    },
  ];

  const weakSpots = analyzeWeakSpots(sessions);
  assert.equal(weakSpots[0].type, 'position');
  assert.equal(weakSpots[0].value, 'BTN');
  assert.equal(weakSpots[0].errorCount, 6);

  const profile = deriveVerifiedProfile(sessions);
  assert.equal(profile.total_sessions, 2);
  assert.equal(profile.total_questions, 20);
  assert.equal(profile.total_correct, 16);
  assert.equal(profile.skill_assessment, 'Advanced');
  assert.equal(profile.identified_leaks[0], 'BTN Play');
});

test('secondary insight surfaces preserve missing and true-zero accuracy honestly', () => {
  const jarvisDependencies = {
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => ({ user: null, error: null }) },
    '../../../src/lib/supabaseServerClient': { createClient() { return {}; } },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
  };
  const { summarizeVerifiedTrainingPerformance } = compile(
    'pages/api/jarvis/user-insights.js',
    jarvisDependencies,
  );

  const unavailable = summarizeVerifiedTrainingPerformance([
    { game_id: 'cash-001', hands_played: 0, correct_count: 0 },
    { game_id: 'cash-002', hands_played: 4, correct_count: 5 },
  ]);
  assert.equal(unavailable.totalQuestions, 0);
  assert.equal(unavailable.overallAccuracy, null);
  assert.deepEqual(unavailable.gamePerformance, []);

  const measuredZero = summarizeVerifiedTrainingPerformance([
    { game_id: 'cash-001', game_name: 'Cash Decisions', hands_played: 4, correct_count: 0, level: 2 },
    { game_id: 'cash-001', game_name: 'Cash Decisions', hands_played: 6, correct_count: 5, level: 3 },
  ]);
  assert.equal(measuredZero.totalQuestions, 10);
  assert.equal(measuredZero.totalCorrect, 5);
  assert.equal(measuredZero.overallAccuracy, 50);
  assert.deepEqual(measuredZero.gamePerformance, [{
    gameId: 'cash-001',
    gameName: 'Cash Decisions',
    sessions: 2,
    accuracy: 50,
    highestLevel: 3,
  }]);

  const noEvidence = analyzeVerifiedTrainingWeaknesses([
    { game_id: 'cash-001', hands_played: 0, correct_count: 0 },
    { game_id: 'cash-002', hands_played: 2, correct_count: 3 },
  ]);
  assert.equal(noEvidence.totalHands, 0);
  assert.equal(noEvidence.overallAcc, null);
  assert.deepEqual(noEvidence.leaks, []);

  const weakness = analyzeVerifiedTrainingWeaknesses([
    { game_id: 'preflop-open', hands_played: 4, correct_count: 0 },
  ]);
  assert.equal(weakness.totalHands, 4);
  assert.equal(weakness.overallAcc, 0);
  assert.equal(weakness.leaks.length, 1);
  assert.equal(weakness.leaks[0].acc, 0);
  assert.match(weakness.leaks[0].tip, /4 verified decisions/);
  assert.doesNotMatch(weakness.leaks[0].tip, /losing EV|tighten your calling|overvaluing|undervaluing/i);

  const noInventedLeak = analyzeVerifiedTrainingWeaknesses([
    { game_id: 'cash-001', hands_played: 10, correct_count: 10 },
  ]);
  assert.equal(noInventedLeak.overallAcc, 100);
  assert.deepEqual(noInventedLeak.leaks, []);

  const jarvisPage = read('pages/hub/training/jarvis.js');
  const jarvisPanel = read('src/components/training/JarvisDashboard.tsx');
  const jarvisApi = read('pages/api/jarvis/user-insights.js');
  assert.doesNotMatch(jarvisPage, /overallAccuracy\s*\|\|\s*0/);
  assert.match(jarvisPage, /game\.gameName\s*\|\|\s*game\.name/);
  assert.match(jarvisPage, /leak\.leak\s*\|\|\s*leak\.name/);
  assert.match(jarvisPage, /Math\.round\(measuredWeeklySeconds\s*\/\s*60\)/);
  assert.doesNotMatch(jarvisPanel, /overview\.overallAccuracy\}%/);
  assert.match(jarvisPanel, /weeklyTimeLabel/);
  assert.match(jarvisApi, /if \(times\.length < 2\) return null/);
  assert.match(jarvisApi, /timeSpentSeconds/);
});

test('database failures cannot become successful default coaching payloads or demo statistics', () => {
  for (const file of [
    'pages/api/gto/generate-adaptive.js',
    'pages/api/gto/get-weak-spots.js',
    'pages/api/gto/lobby-suggestions.js',
    'pages/api/jarvis/user-insights.js',
    'pages/api/training/gto-reports.js',
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /fallback:\s*true/, file);
    assert.match(source, /status\(503\)/, file);
  }

  const assistant = read('src/hooks/useAssistant.js');
  assert.doesNotMatch(assistant, /gameId:\s*['"]demo[12]['"]|gamesPlayed:\s*12|River Play|Preflop Ranges/);
  const context = read('src/lib/liveHelp/contextCollector.ts');
  assert.doesNotMatch(context, /Return minimal context on error/);
  assert.match(context, /throw error instanceof Error/);
});

test('adaptive, weak-spot, and lobby routes distinguish new users from unavailable history', async () => {
  const cases = [
    ['pages/api/gto/generate-adaptive.js', 'POST'],
    ['pages/api/gto/get-weak-spots.js', 'GET'],
    ['pages/api/gto/lobby-suggestions.js', 'GET'],
  ];

  for (const [file, method] of cases) {
    const unavailable = loadGtoRoute(file, {
      training_sessions: { data: null, error: { message: 'database unavailable' } },
    });
    const unavailableResponse = response();
    await unavailable.handler({
      method,
      headers: { authorization: 'Bearer token' },
      query: {},
      body: {},
    }, unavailableResponse);
    assert.equal(unavailableResponse.statusCode, 503, `${file} must fail closed`);
    assert.equal(unavailableResponse.body?.success, false);
    assert.equal(unavailableResponse.body?.unavailable, true);

    const newUser = loadGtoRoute(file, {
      training_sessions: { data: [], error: null },
    });
    const newUserResponse = response();
    await newUser.handler({
      method,
      headers: { authorization: 'Bearer token' },
      query: {},
      body: {},
    }, newUserResponse);
    assert.equal(newUserResponse.statusCode, 200, `${file} must preserve an explicit new-user state`);
    assert.equal(newUserResponse.body?.success, true);
    if (file.endsWith('generate-adaptive.js') || file.endsWith('lobby-suggestions.js')) {
      assert.equal(newUserResponse.body?.isNewUser, true);
    } else {
      assert.deepEqual(newUserResponse.body?.weakSpots, []);
    }
  }
});
