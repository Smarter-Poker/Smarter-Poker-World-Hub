import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const ROOT = process.cwd();
const API_SOURCE = readFileSync(join(ROOT, 'pages/api/training/hand-of-the-day.js'), 'utf8');
const PAGE_SOURCE = readFileSync(join(ROOT, 'pages/hub/training/daily-challenge.js'), 'utf8');
const MIGRATION_SOURCE = readFileSync(
  join(ROOT, 'supabase/migrations/20260907010000_training_server_authoritative_completion.sql'),
  'utf8',
);
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const SNAPSHOT_KEY = 'daily-snapshot-key';

const canonicalQuestion = Object.freeze({
  id: 'daily-question-1',
  question: 'Action Checks To The Button. What Is The Best Decision?',
  scenario: { heroHand: 'AsKs', heroPosition: 'BTN', street: 'flop' },
  boardCards: ['Qs', 'Jh', '2d'],
  options: [
    { id: 'fold', text: 'Fold' },
    { id: 'check', text: 'Check' },
    { id: 'call', text: 'Call' },
    { id: 'raise', text: 'Raise' },
  ],
  correctAnswer: 'raise',
  correctAnswerText: 'Raise',
  explanation: 'Raise Captures The Most Value.',
  gtoFrequencies: { raise: 80, check: 20 },
});

function publicQuestion(question) {
  const clone = JSON.parse(JSON.stringify(question));
  for (const key of ['correctAnswer', 'correctAnswerText', 'explanation', 'gtoFrequencies']) {
    delete clone[key];
  }
  return clone;
}

function createResponse() {
  return {
    headers: {},
    headersSent: false,
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

function queryClient(mode) {
  const calls = [];
  function resolveQuery(state) {
    const single = (value) => ({ data: value, error: null });
    if (state.table === 'training_daily_challenge') return single([]);
    if (state.table === 'training_attempts') {
      return single(mode === 'pending' ? {
        id: ATTEMPT_ID,
        user_id: USER_ID,
        client_nonce: 'daily-2026-09-06',
        game_id: 'daily-challenge',
        level: 1,
        session_kind: 'daily',
        difficulty: 'grouped',
        status: 'open',
        expected_hands: 1,
        expires_at: '2099-09-07T05:00:00.000Z',
      } : null);
    }
    if (state.table === 'training_attempt_hands') return single({ snapshot_key: SNAPSHOT_KEY });
    if (state.table === 'training_answers') {
      return single({
        answer_id: 'raise',
        is_correct: true,
        solver_verified: true,
        ev_loss: 0,
        ev_loss_measured: true,
        answered_at: '2026-09-06T15:00:00.000Z',
        snapshot_key: SNAPSHOT_KEY,
      });
    }
    if (state.table === 'training_question_snapshots') {
      return single({ snapshot_key: SNAPSHOT_KEY, question_data: canonicalQuestion });
    }
    if (state.table === 'training_question_cache' && state.selectOptions?.head) {
      return { data: null, error: null, count: 1 };
    }
    if (state.table === 'training_question_cache') {
      return single([{
        question_id: canonicalQuestion.id,
        game_id: 'cash-001',
        engine_type: 'PIO',
        level: 4,
        question_data: canonicalQuestion,
      }]);
    }
    throw new Error(`Unexpected table ${state.table}`);
  }

  return {
    calls,
    client: {
      from(table) {
        const state = { table, filters: [] };
        calls.push(state);
        const builder = {
          select(columns, options) { state.columns = columns; state.selectOptions = options; return builder; },
          eq(column, value) { state.filters.push(['eq', column, value]); return builder; },
          like(column, value) { state.filters.push(['like', column, value]); return builder; },
          in(column, value) { state.filters.push(['in', column, value]); return builder; },
          order(column, value) { state.order = [column, value]; return builder; },
          limit(value) { state.limit = value; return builder; },
          range(start, end) { state.range = [start, end]; return builder; },
          maybeSingle() { state.single = true; return builder; },
          async abortSignal() {
            const result = resolveQuery(state);
            if (state.single && Array.isArray(result.data)) {
              return { ...result, data: result.data[0] || null };
            }
            return result;
          },
        };
        return builder;
      },
    },
  };
}

async function loadHandler({ mode = 'new', authenticated = true } = {}) {
  const database = queryClient(mode);
  const deliveries = [];
  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => authenticated
        ? { user: { id: USER_ID }, error: null }
        : { user: null, error: new Error('unauthorized') },
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => database.client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      withTiming: () => {},
      reconcileAnswerKey: () => {},
    },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/trivia/getTodayCST': { getTodayCST: () => '2026-09-06' },
    '../../../src/lib/training/questionContract.mjs': {
      enforceTrainingQuestionContract: (question) => question,
      isTrainingQuestionValid: () => true,
    },
    '../../../src/lib/training/gradingReceipt.mjs': {
      toPublicTrainingQuestion: publicQuestion,
    },
    '../../../src/lib/training/difficultyQuestionContract.mjs': {
      applyDifficultyToQuestion: (question) => question,
    },
    '../../../src/lib/training/trainingAttemptDelivery.mjs': {
      isTrainingAttemptContractError: () => false,
      prepareTrainingAttemptDelivery: async (input) => {
        deliveries.push(input);
        return {
          attemptId: ATTEMPT_ID,
          questions: [{
            ...publicQuestion(canonicalQuestion),
            _gradingContext: {
              receipt: 'signed.receipt',
              submissionId: 'submission-1',
              attemptId: ATTEMPT_ID,
              snapshotKey: SNAPSHOT_KEY,
            },
          }],
        };
      },
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      runTrainingPersistenceQuery: async (factory) => factory().abortSignal(new AbortController().signal),
      trainingPersistenceUnavailableBody: () => ({ success: false, code: 'TRAINING_PERSISTENCE_UNAVAILABLE' }),
    },
  };
  const module = new SourceTextModule(API_SOURCE, { identifier: 'hand-of-the-day.js' });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `Unexpected Daily Challenge dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return { handler: module.namespace.default, database, deliveries };
}

test('Daily Challenge GET is private, authenticated, blind, and starts exactly one deterministic daily hand', async () => {
  const { handler, deliveries } = await loadHandler();
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers.Vary, 'Authorization');
  assert.equal(response.body.dailyId, 'daily-2026-09-06');
  assert.equal(response.body.feedback, null);
  assert.equal(response.body.completion, null);
  assert.equal(response.body.question.correctAnswer, undefined);
  assert.equal(response.body.question.explanation, undefined);
  assert.equal(response.body.question.gtoFrequencies, undefined);
  assert.equal(typeof response.body.question._gradingContext.receipt, 'string');
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].clientSessionId, 'daily-2026-09-06');
  assert.equal(deliveries[0].gameId, 'daily-challenge');
  assert.equal(deliveries[0].sessionKind, 'daily');
  assert.equal(deliveries[0].requestedHands, 1);
  assert.equal(deliveries[0].requireFullAttempt, true);
});

test('a durable answer followed by completion transport failure restores feedback and an idempotent retry after reload', async () => {
  const { handler, deliveries } = await loadHandler({ mode: 'pending' });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.completionPending, true);
  assert.deepEqual(response.body.persistedAnswer, {
    attemptId: ATTEMPT_ID,
    selectedAction: 'raise',
    isCorrect: true,
  });
  assert.equal(response.body.feedback.correctAnswer, 'raise');
  assert.equal(response.body.feedback.explanation, canonicalQuestion.explanation);
  assert.equal(response.body.feedback.evLossMeasured, true);
  assert.equal(response.body.feedback.evLoss, 0, 'a sealed measured zero must survive reload');
  assert.equal(response.body.question.correctAnswer, undefined);
  assert.equal(response.body.question._gradingContext, undefined);
  assert.equal(deliveries.length, 0, 'a scored attempt must not receive a second grading receipt');

  assert.match(PAGE_SOURCE, /data\.completionPending && data\.persistedAnswer\?\.attemptId/);
  assert.match(PAGE_SOURCE, /Retry Completion/);
  assert.match(PAGE_SOURCE, /JSON\.stringify\(\{ attemptId \}\)/);
  assert.match(PAGE_SOURCE, /completeDailyAttempt\([\s\S]*activeAttemptId/);
});

test('Daily Challenge removes every browser-authored grading and completion path', () => {
  assert.doesNotMatch(API_SOURCE, /safeAward|req\.method === 'POST'|training_daily_challenge['"]\)\s*\.upsert/);
  assert.match(API_SOURCE, /prepareTrainingAttemptDelivery/);
  assert.match(API_SOURCE, /sessionKind: 'daily'/);
  assert.match(API_SOURCE, /gameId: DAILY_GAME_ID/);
  assert.match(API_SOURCE, /requireFullAttempt: true/);
  assert.match(API_SOURCE, /toPublicTrainingQuestion/);

  assert.doesNotMatch(PAGE_SOURCE, /localStorage/);
  assert.doesNotMatch(PAGE_SOURCE, /challenge\.(?:correct_answer|gto_action)/);
  assert.doesNotMatch(PAGE_SOURCE, /isCorrect\s*=\s*action/);
  assert.match(PAGE_SOURCE, /\/api\/training\/record-question/);
  assert.match(PAGE_SOURCE, /recorded\?\.evidence\?\.isCorrect/);
  assert.match(PAGE_SOURCE, /evLossMeasured: recorded\.evidence\.evLossMeasured === true/);
  assert.match(PAGE_SOURCE, /feedback\?\.evLossMeasured === true/);
  assert.doesNotMatch(PAGE_SOURCE, /evLoss=\{[^\n]*\?\? 0\}/);
  assert.match(PAGE_SOURCE, /Continue To Training Hub/);
  assert.doesNotMatch(PAGE_SOURCE, /accuracy:\s*Number\(completed\.accuracy\s*\|\|\s*0\)/);
  assert.doesNotMatch(API_SOURCE, /score:\s*Number\(attempt\.accuracy_percentage\s*\|\|\s*0\)/);
  assert.match(API_SOURCE, /Math\.round\(\(correctHands \/ answeredHands\) \* 100\)/);

  const answerFlow = PAGE_SOURCE.slice(
    PAGE_SOURCE.indexOf('const handleAnswer'),
    PAGE_SOURCE.indexOf('// Derive question data'),
  );
  assert.ok(answerFlow.indexOf('/api/training/record-question') >= 0);
  assert.ok(answerFlow.indexOf('/api/training/record-question') < answerFlow.indexOf('setShowResult(true)'));
  assert.ok(answerFlow.indexOf('setShowResult(true)') < answerFlow.indexOf('completeDailyAttempt(recorded.attemptId'));
});

test('Daily Challenge rejects anonymous access and exposes GET only', async () => {
  const anonymous = await loadHandler({ authenticated: false });
  const noTokenResponse = createResponse();
  await anonymous.handler({ method: 'GET', headers: {} }, noTokenResponse);
  assert.equal(noTokenResponse.statusCode, 401);

  const authenticated = await loadHandler();
  const postResponse = createResponse();
  await authenticated.handler({ method: 'POST', headers: { authorization: 'Bearer token' }, body: {} }, postResponse);
  assert.equal(postResponse.statusCode, 405);
  assert.equal(postResponse.headers.Allow, 'GET');
});

test('legacy daily rows bind to a sealed attempt without duplicating settlement', () => {
  assert.match(
    MIGRATION_SOURCE,
    /daily_already_completed := FOUND/,
  );
  assert.match(
    MIGRATION_SOURCE,
    /ON CONFLICT \(user_id, daily_id\) DO UPDATE SET[\s\S]*attempt_id = excluded\.attempt_id[\s\S]*training_daily_challenge\.attempt_id IS NULL/,
  );
  assert.match(MIGRATION_SOURCE, /TRAINING_DAILY_COMPLETION_BINDING_MISMATCH/);
  assert.match(MIGRATION_SOURCE, /WHEN attempt_row\.session_kind = 'daily'[\s\S]*THEN 0 ELSE 25/);
});
