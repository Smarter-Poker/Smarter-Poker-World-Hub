import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const ROOT = process.cwd();
const SAVE_PROGRESS = readFileSync(join(ROOT, 'pages/api/training/save-progress.js'), 'utf8');
const SAVE_SESSION = readFileSync(join(ROOT, 'pages/api/training/save-session.js'), 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';

function createResponse() {
  return {
    headers: {},
    headersSent: false,
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

async function loadSaveProgress({
  user = { id: USER_ID },
  rpcResult,
  persistenceError = null,
} = {}) {
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ name, args });
      const result = rpcResult || {
          data: {
            success: true,
            newCompletion: true,
            answered: 20,
            correct: 18,
            accuracy: 90,
            passed: true,
            attemptId: ATTEMPT_ID,
            practiceOnly: false,
            diamondsEarned: 0,
            rewardReference: `training_attempt:${ATTEMPT_ID}`,
          },
          error: null,
      };
      return {
        async abortSignal() {
          return result;
        },
      };
    },
  };
  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => user
        ? { user, error: null }
        : { user: null, error: new Error('unauthorized') },
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/utils/trainingApiUtils': { withTiming: () => {} },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: (error) => error?.trainingCode === 'TRAINING_PERSISTENCE_UNAVAILABLE',
      runTrainingPersistenceQuery: async (queryFactory) => {
        if (persistenceError) throw persistenceError;
        return queryFactory().abortSignal(new AbortController().signal);
      },
      trainingPersistenceUnavailableBody: () => ({
        success: false,
        error: 'Training data is temporarily unavailable. Please retry this hand.',
        code: 'TRAINING_PERSISTENCE_UNAVAILABLE',
        retryable: true,
      }),
    },
  };
  const module = new SourceTextModule(SAVE_PROGRESS, { identifier: 'save-progress.js' });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected save-progress dependency: ${specifier}`);
    const synthetic = new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
    return synthetic;
  });
  await module.evaluate();
  return { handler: module.namespace.default, calls };
}

async function loadSaveSession({ user = { id: USER_ID }, rpcResult, persistenceError = null } = {}) {
  const calls = [];
  const result = rpcResult || {
    data: {
      success: true,
      newSession: true,
      attemptId: ATTEMPT_ID,
      practiceOnly: false,
      session: {
        id: '33333333-3333-4333-8333-333333333333',
        attempt_id: ATTEMPT_ID,
        game_id: 'cash-001',
        hands_played: 20,
        correct_count: 18,
        accuracy: 90,
      },
      diamondsEarned: 0,
    },
    error: null,
  };
  const client = {
    rpc(name, args) {
      calls.push({ name, args });
      return {
        async abortSignal() {
          return result;
        },
      };
    },
  };
  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => user
        ? { user, error: null }
        : { user: null, error: new Error('unauthorized') },
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/utils/trainingApiUtils': { withTiming: () => {} },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: (error) => error?.trainingCode === 'TRAINING_PERSISTENCE_UNAVAILABLE',
      runTrainingPersistenceQuery: async (queryFactory) => {
        if (persistenceError) throw persistenceError;
        return queryFactory().abortSignal(new AbortController().signal);
      },
      trainingPersistenceUnavailableBody: () => ({
        success: false,
        error: 'Training data is temporarily unavailable. Please retry this hand.',
        code: 'TRAINING_PERSISTENCE_UNAVAILABLE',
        retryable: true,
      }),
    },
  };
  const module = new SourceTextModule(SAVE_SESSION, { identifier: 'save-session.js' });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected save-session dependency: ${specifier}`);
    const synthetic = new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
    return synthetic;
  });
  await module.evaluate();
  return { handler: module.namespace.default, calls };
}

function request(body = { attemptId: ATTEMPT_ID }) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body,
  };
}

test('save-progress has one opaque input and no client-authored completion or reward path', () => {
  assert.match(SAVE_PROGRESS, /ALLOWED_BODY_KEYS = new Set\(\['attemptId'\]\)/);
  assert.match(SAVE_PROGRESS, /fn_complete_training_attempt_v2/);
  assert.doesNotMatch(SAVE_PROGRESS, /safeAward/);
  assert.doesNotMatch(SAVE_PROGRESS, /getMasteryGate|req\.body\.(?:questionsAnswered|questionsCorrect|diamondsEarned|timeSpentSeconds)/);
  assert.doesNotMatch(SAVE_PROGRESS, /from\(['"]training_(?:progress|level_history|leaderboard)/);
  assert.match(SAVE_PROGRESS, /Cache-Control', 'private, no-store'/);
});

test('save-progress rejects anonymous, malformed, and client-authored statistic requests before RPC', async () => {
  const anonymous = await loadSaveProgress({ user: null });
  const anonymousResponse = createResponse();
  await anonymous.handler(request(), anonymousResponse);
  assert.equal(anonymousResponse.statusCode, 401);
  assert.equal(anonymous.calls.length, 0);

  const authenticated = await loadSaveProgress();
  for (const body of [
    null,
    { attemptId: 'not-a-uuid' },
    { attemptId: ATTEMPT_ID, accuracy: 100 },
    { attemptId: ATTEMPT_ID, diamondsEarned: 100 },
    { attemptId: ATTEMPT_ID, passed: true },
  ]) {
    const response = createResponse();
    await authenticated.handler(request(body), response);
    assert.equal(response.statusCode, 400);
  }
  assert.equal(authenticated.calls.length, 0);
});

test('save-progress completes exactly the authenticated user attempt and returns the authoritative result', async () => {
  const { handler, calls } = await loadSaveProgress();
  const response = createResponse();
  await handler(request(), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{
    name: 'fn_complete_training_attempt_v2',
    args: { p_user_id: USER_ID, p_attempt_id: ATTEMPT_ID },
  }]);
  assert.equal(response.body.success, true);
  assert.equal(response.body.attemptId, ATTEMPT_ID);
  assert.equal(response.body.answered, 20);
  assert.equal(response.body.correct, 18);
  assert.equal(response.body.passed, true);
  assert.equal(response.body.diamondsAwarded, 0);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers.Vary, 'Authorization');
});

test('save-progress exposes only the reward already settled by the completion transaction', async () => {
  const rpcResult = {
    data: {
      success: true,
      newCompletion: true,
      attemptId: ATTEMPT_ID,
      practiceOnly: false,
      answered: 20,
      correct: 20,
      accuracy: 100,
      passed: true,
      diamondsEarned: 17,
      rewardReference: `training_attempt:${ATTEMPT_ID}`,
      history: { game_id: 'cash-001', level: 1 },
    },
    error: null,
  };
  const { handler, calls } = await loadSaveProgress({ rpcResult });
  const response = createResponse();
  await handler(request(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 1, 'the API must not perform a second reward RPC');
  assert.equal(response.body.diamondsEarned, 17);
  assert.equal(response.body.diamondsAwarded, 17);
});

test('save-progress accepts a legitimate post-multiplier Level 12 reward and rejects out-of-contract awards', async () => {
  const levelTwelveReward = {
    data: {
      success: true,
      newCompletion: true,
      attemptId: ATTEMPT_ID,
      practiceOnly: false,
      answered: 30,
      correct: 30,
      accuracy: 100,
      passed: true,
      diamondsEarned: 68,
      rewardReference: `training_attempt:${ATTEMPT_ID}`,
    },
    error: null,
  };
  const accepted = await loadSaveProgress({ rpcResult: levelTwelveReward });
  const acceptedResponse = createResponse();
  await accepted.handler(request(), acceptedResponse);
  assert.equal(acceptedResponse.statusCode, 200);
  assert.equal(acceptedResponse.body.diamondsAwarded, 68);

  const impossible = await loadSaveProgress({
    rpcResult: {
      ...levelTwelveReward,
      data: { ...levelTwelveReward.data, diamondsEarned: 341 },
    },
  });
  const impossibleResponse = createResponse();
  await impossible.handler(request(), impossibleResponse);
  assert.equal(impossibleResponse.statusCode, 502);
  assert.equal(impossibleResponse.body.code, 'TRAINING_COMPLETION_INVALID_RESPONSE');
});

test('save-progress fails closed on incomplete, database, and malformed RPC results', async () => {
  const incomplete = await loadSaveProgress({
    rpcResult: {
      data: { success: false, status: 409, code: 'TRAINING_ATTEMPT_INCOMPLETE', answered: 7, expectedHands: 20 },
      error: null,
    },
  });
  const incompleteResponse = createResponse();
  await incomplete.handler(request(), incompleteResponse);
  assert.equal(incompleteResponse.statusCode, 409);
  assert.equal(incompleteResponse.body.success, false);
  assert.equal(incompleteResponse.body.answered, 7);

  const rewardNotSettled = await loadSaveProgress({
    rpcResult: {
      data: {
        success: false,
        status: 503,
        code: 'TRAINING_REWARD_NOT_SETTLED',
        error: 'The Training reward could not be settled. Retry this completion.',
        attemptId: ATTEMPT_ID,
      },
      error: null,
    },
  });
  const rewardNotSettledResponse = createResponse();
  await rewardNotSettled.handler(request(), rewardNotSettledResponse);
  assert.equal(rewardNotSettledResponse.statusCode, 503);
  assert.equal(rewardNotSettledResponse.body.code, 'TRAINING_REWARD_NOT_SETTLED');
  assert.equal(rewardNotSettledResponse.body.retryable, true);

  const unavailable = await loadSaveProgress({
    persistenceError: Object.assign(new Error('database unavailable'), {
      trainingCode: 'TRAINING_PERSISTENCE_UNAVAILABLE',
    }),
  });
  const unavailableResponse = createResponse();
  await unavailable.handler(request(), unavailableResponse);
  assert.equal(unavailableResponse.statusCode, 503);
  assert.equal(unavailableResponse.body.success, false);
  assert.equal(unavailableResponse.body.code, 'TRAINING_PERSISTENCE_UNAVAILABLE');
  assert.equal(unavailableResponse.body.retryable, true);

  const malformed = await loadSaveProgress({ rpcResult: { data: null, error: null } });
  const malformedResponse = createResponse();
  await malformed.handler(request(), malformedResponse);
  assert.equal(malformedResponse.statusCode, 502);
  assert.equal(malformedResponse.body.success, false);

  const mismatched = await loadSaveProgress({
    rpcResult: {
      data: {
        success: true,
        attemptId: '44444444-4444-4444-8444-444444444444',
        practiceOnly: false,
        diamondsEarned: 50,
        rewardReference: `training_attempt:${ATTEMPT_ID}`,
      },
      error: null,
    },
  });
  const mismatchedResponse = createResponse();
  await mismatched.handler(request(), mismatchedResponse);
  assert.equal(mismatchedResponse.statusCode, 502);
  assert.equal(mismatchedResponse.body.success, false);
});

test('save-session accepts only an attempt id and delegates all analytics to the atomic database projection', () => {
  assert.match(SAVE_SESSION, /ALLOWED_BODY_KEYS = new Set\(\['attemptId'\]\)/);
  assert.match(SAVE_SESSION, /fn_save_training_session_v2/);
  assert.doesNotMatch(SAVE_SESSION, /safeAward|compactHandHistoryEntry/);
  assert.doesNotMatch(SAVE_SESSION, /\.from\(['"]training_sessions['"]\)/);
  assert.match(SAVE_SESSION, /Cache-Control', 'private, no-store'/);
  assert.deepEqual(
    [...new Set([...SAVE_SESSION.matchAll(/\bbody\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]))],
    ['attemptId'],
  );
});

test('save-session rejects anonymous, malformed, and client-authored analytics before RPC', async () => {
  const anonymous = await loadSaveSession({ user: null });
  const anonymousResponse = createResponse();
  await anonymous.handler(request(), anonymousResponse);
  assert.equal(anonymousResponse.statusCode, 401);
  assert.equal(anonymous.calls.length, 0);

  const authenticated = await loadSaveSession();
  for (const body of [
    null,
    { attemptId: 'not-a-uuid' },
    { attemptId: ATTEMPT_ID, handsPlayed: 20 },
    { attemptId: ATTEMPT_ID, accuracy: 100 },
    { attemptId: ATTEMPT_ID, speedBonusDiamonds: 50 },
    { attemptId: ATTEMPT_ID, handHistory: [] },
  ]) {
    const response = createResponse();
    await authenticated.handler(request(body), response);
    assert.equal(response.statusCode, 400);
  }
  assert.equal(authenticated.calls.length, 0);
});

test('save-session materializes the authenticated completed attempt and preserves idempotency state', async () => {
  const { handler, calls } = await loadSaveSession();
  const response = createResponse();
  await handler(request(), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{
    name: 'fn_save_training_session_v2',
    args: { p_user_id: USER_ID, p_attempt_id: ATTEMPT_ID },
  }]);
  assert.equal(response.body.success, true);
  assert.equal(response.body.newSession, true);
  assert.equal(response.body.attemptId, ATTEMPT_ID);
  assert.equal(response.body.session.hands_played, 20);
  assert.equal(response.body.session.correct_count, 18);
  assert.equal(response.body.diamondsEarned, 0);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers.Vary, 'Authorization');

  const replay = await loadSaveSession({
    rpcResult: {
      data: {
        ...response.body,
        newSession: false,
      },
      error: null,
    },
  });
  const replayResponse = createResponse();
  await replay.handler(request(), replayResponse);
  assert.equal(replayResponse.statusCode, 200);
  assert.equal(replayResponse.body.newSession, false);
});

test('save-session fails closed for incomplete, foreign, unavailable, and malformed projections', async () => {
  for (const [rpcResult, expectedStatus] of [
    [{ data: { success: false, status: 409, code: 'TRAINING_ATTEMPT_NOT_COMPLETED' }, error: null }, 409],
    [{ data: { success: false, status: 404, code: 'TRAINING_ATTEMPT_NOT_FOUND' }, error: null }, 404],
    [{ data: null, error: null }, 502],
    [{
      data: {
        success: true,
        attemptId: '44444444-4444-4444-8444-444444444444',
        session: { attempt_id: '44444444-4444-4444-8444-444444444444' },
        diamondsEarned: 0,
      },
      error: null,
    }, 502],
    [{
      data: {
        success: true,
        attemptId: ATTEMPT_ID,
        session: { attempt_id: ATTEMPT_ID },
        diamondsEarned: 1,
      },
      error: null,
    }, 502],
  ]) {
    const loaded = await loadSaveSession({ rpcResult });
    const response = createResponse();
    await loaded.handler(request(), response);
    assert.equal(response.statusCode, expectedStatus);
    assert.equal(response.body.success, false);
  }

  const unavailable = await loadSaveSession({
    persistenceError: Object.assign(new Error('database unavailable'), {
      trainingCode: 'TRAINING_PERSISTENCE_UNAVAILABLE',
    }),
  });
  const unavailableResponse = createResponse();
  await unavailable.handler(request(), unavailableResponse);
  assert.equal(unavailableResponse.statusCode, 503);
  assert.equal(unavailableResponse.body.code, 'TRAINING_PERSISTENCE_UNAVAILABLE');
  assert.equal(unavailableResponse.body.retryable, true);
});
