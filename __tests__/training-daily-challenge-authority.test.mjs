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
const DAILY_RECOVERY_MIGRATION_SOURCE = readFileSync(
  join(ROOT, 'supabase/migrations/20260907193000_training_daily_immutable_snapshot_and_midnight_recovery.sql'),
  'utf8',
);
const STREAK_RECOVERY_MIGRATION_SOURCE = readFileSync(
  join(ROOT, 'supabase/migrations/20260907202000_training_streak_out_of_order_completion.sql'),
  'utf8',
);
const POSTGRES_VERIFIER_SOURCE = readFileSync(
  join(ROOT, 'scripts/verify-training-authority-postgres.mjs'),
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

function queryClient(mode, initialQuestion = canonicalQuestion) {
  const calls = [];
  let candidateQuestion = initialQuestion;
  let dailySeal = null;
  let competingSealQuestion = null;
  let priorRecoveryPage = 0;
  const snapshots = new Map();
  const snapshotFor = (question) => ({
    snapshot_key: question.id === canonicalQuestion.id ? SNAPSHOT_KEY : `snapshot-${question.id}`,
    source_question_id: question.id,
    game_id: 'daily-challenge',
    level: 1,
    content_digest: `digest-${question.id}`,
    question_data: question,
  });
  snapshots.set(SNAPSHOT_KEY, snapshotFor({
    ...canonicalQuestion,
    policyChecksum: 'a'.repeat(64),
  }));
  if ([
    'pending',
    'pending-seal-mismatch',
    'pending-digest-mismatch',
    'pending-conflict',
    'prior-pending',
    'prior-conflict',
    'prior-missing-snapshot',
    'prior-answer-mismatch',
    'prior-count-unavailable',
    'completed-aggregate-only',
    'completed-conflict',
    'completed-current-outside-history',
  ].includes(mode)) {
    dailySeal = {
      daily_id: 'daily-2026-09-06',
      snapshot_key: mode === 'pending-seal-mismatch' ? 'mismatched-snapshot' : SNAPSHOT_KEY,
      source_question_id: canonicalQuestion.id,
      source_policy_checksum: 'a'.repeat(64),
    };
  }

  function resolveQuery(state) {
    const single = (value) => ({ data: value, error: null });
    if (state.table === 'training_daily_challenge') {
      const hasCurrentCompletion = [
        'completed-aggregate-only',
        'completed-conflict',
        'completed-current-outside-history',
      ].includes(mode);
      const completedRows = hasCurrentCompletion ? [{
        daily_id: 'daily-2026-09-06',
        score: 100,
        ev_loss: 0,
        selected_action: 'raise',
        completed_at: '2026-09-06T15:00:00.000Z',
        attempt_id: ATTEMPT_ID,
      }] : [];
      return single(state.single
        ? (completedRows[0] || null)
        : mode === 'completed-current-outside-history' ? [] : completedRows);
    }
    if (state.table === 'training_attempts') {
      if (mode === 'prior-overflow' && !state.single) {
        return single(Array.from({ length: 17 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          user_id: USER_ID,
          client_nonce: `daily-2026-08-${String(index + 1).padStart(2, '0')}`,
          game_id: 'daily-challenge',
          level: 1,
          session_kind: 'daily',
          difficulty: 'grouped',
          status: 'open',
          expected_hands: 1,
          started_at: `2026-08-${String(index + 1).padStart(2, '0')}T15:00:00.000Z`,
          expires_at: '2099-09-07T05:00:00.000Z',
        })));
      }
      if (mode === 'prior-count-unavailable' && !state.single) {
        if (state.filters.some(([operator]) => operator === 'or')) {
          return {
            data: [{
              id: ATTEMPT_ID,
              user_id: USER_ID,
              client_nonce: 'daily-2026-08-20',
              game_id: 'daily-challenge',
              level: 1,
              session_kind: 'daily',
              difficulty: 'grouped',
              status: 'open',
              expected_hands: 1,
              started_at: '2026-08-20T15:00:00.000Z',
              expires_at: '2099-09-07T05:00:00.000Z',
            }],
            error: null,
            count: null,
          };
        }
        return {
          data: Array.from({ length: 17 }, (_, index) => {
            const instant = new Date(Date.UTC(2026, 8, 5 - index, 15));
            const productDate = instant.toISOString().slice(0, 10);
            return {
              id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
              user_id: USER_ID,
              client_nonce: `daily-${productDate}`,
              game_id: 'daily-challenge',
              level: 1,
              session_kind: 'daily',
              difficulty: 'grouped',
              status: 'open',
              expected_hands: 1,
              started_at: instant.toISOString(),
              expires_at: '2099-09-07T05:00:00.000Z',
            };
          }),
          error: null,
          count: null,
        };
      }
      if (mode === 'prior-count-unavailable-exact-64' && !state.single) {
        const page = priorRecoveryPage;
        priorRecoveryPage += 1;
        const start = page * 16;
        const pageLength = page < 3 ? 17 : 16;
        return {
          data: Array.from({ length: pageLength }, (_, index) => {
            const ordinal = start + index;
            const instant = new Date(Date.UTC(2026, 8, 5 - ordinal, 15));
            const productDate = instant.toISOString().slice(0, 10);
            return {
              id: `00000000-0000-4000-8000-${String(ordinal + 1).padStart(12, '0')}`,
              user_id: USER_ID,
              client_nonce: `daily-${productDate}`,
              game_id: 'daily-challenge',
              level: 1,
              session_kind: 'daily',
              difficulty: 'grouped',
              status: 'open',
              expected_hands: 1,
              started_at: instant.toISOString(),
              expires_at: '2099-09-07T05:00:00.000Z',
            };
          }),
          error: null,
          count: null,
        };
      }
      if ([
        'prior-pending',
        'prior-conflict',
        'prior-missing-snapshot',
        'prior-answer-mismatch',
      ].includes(mode)) {
        if (state.single) return single(null);
        return single([{
          id: ATTEMPT_ID,
          user_id: USER_ID,
          client_nonce: 'daily-2026-09-06',
          game_id: 'daily-challenge',
          level: 1,
          session_kind: 'daily',
          difficulty: 'grouped',
          status: 'open',
          expected_hands: 1,
          started_at: '2026-09-06T23:59:00.000-05:00',
          expires_at: '2099-09-07T05:00:00.000Z',
        }]);
      }
      if (['pending', 'pending-seal-mismatch', 'pending-digest-mismatch', 'pending-conflict'].includes(mode)) {
        return single({
          id: ATTEMPT_ID,
          user_id: USER_ID,
          client_nonce: 'daily-2026-09-06',
          game_id: 'daily-challenge',
          level: 1,
          session_kind: 'daily',
          difficulty: 'grouped',
          status: 'open',
          expected_hands: 1,
          started_at: '2026-09-06T15:00:00.000Z',
          expires_at: '2099-09-07T05:00:00.000Z',
        });
      }
      if ([
        'completed-aggregate-only',
        'completed-conflict',
        'completed-current-outside-history',
      ].includes(mode)) {
        return single({
          id: ATTEMPT_ID,
          user_id: USER_ID,
          client_nonce: 'daily-2026-09-06',
          game_id: 'daily-challenge',
          level: 1,
          session_kind: 'daily',
          difficulty: 'grouped',
          status: 'completed',
          expected_hands: 1,
          answered_hands: 1,
          correct_hands: 1,
          accuracy_percentage: 100,
          reward_diamonds: 25,
          completed_at: '2026-09-06T15:00:00.000Z',
        });
      }
      return single(null);
    }
    if (state.table === 'training_attempt_hands') {
      if (state.filters.some(([operator, column]) => operator === 'in' && column === 'attempt_id')) {
        if (mode === 'prior-count-unavailable') {
          const attemptIds = state.filters.find(([, column]) => column === 'attempt_id')?.[2] || [];
          return single(attemptIds.includes(ATTEMPT_ID) ? [{
            attempt_id: ATTEMPT_ID,
            snapshot_key: SNAPSHOT_KEY,
          }] : []);
        }
        return single(['prior-overflow', 'prior-count-unavailable-exact-64'].includes(mode) ? [] : [{
          attempt_id: ATTEMPT_ID,
          snapshot_key: SNAPSHOT_KEY,
        }]);
      }
      return single(mode === 'completed-aggregate-only' ? null : { snapshot_key: SNAPSHOT_KEY });
    }
    if (state.table === 'training_answers') {
      if (mode === 'completed-aggregate-only') return single(null);
      if (state.filters.some(([operator, column]) => operator === 'in' && column === 'attempt_id')) {
        if (mode === 'prior-count-unavailable') {
          const attemptIds = state.filters.find(([, column]) => column === 'attempt_id')?.[2] || [];
          if (!attemptIds.includes(ATTEMPT_ID)) return single([]);
        }
        return single(['prior-overflow', 'prior-count-unavailable-exact-64'].includes(mode) ? [] : [{
          attempt_id: ATTEMPT_ID,
          answer_id: 'raise',
          is_correct: true,
          solver_verified: true,
          ev_loss: 0,
          ev_loss_measured: true,
          answered_at: '2026-09-06T15:00:00.000Z',
          snapshot_key: mode === 'prior-answer-mismatch'
            ? 'answer-snapshot-mismatch'
            : SNAPSHOT_KEY,
        }]);
      }
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
      if (state.operation === 'upsert') {
        for (const snapshot of state.values) {
          if (!snapshots.has(snapshot.snapshot_key)) snapshots.set(snapshot.snapshot_key, snapshot);
        }
        return single(state.values);
      }
      const keys = state.filters.find(([operator, column]) => (
        operator === 'in' && column === 'snapshot_key'
      ))?.[2];
      if (keys) {
        if (mode === 'prior-missing-snapshot') return single([]);
        return single(keys.map((key) => snapshots.get(key)).filter(Boolean));
      }
      const key = state.filters.find(([operator, column]) => (
        operator === 'eq' && column === 'snapshot_key'
      ))?.[2];
      const snapshot = snapshots.get(key) || null;
      return single(mode === 'completed-aggregate-only'
        ? null
        : mode === 'pending-digest-mismatch' && snapshot
          ? { ...snapshot, content_digest: 'tampered-digest' }
          : snapshot);
    }
    if (state.table === 'training_daily_question_conflicts') {
      const conflictRows = ['prior-conflict', 'pending-conflict', 'completed-conflict'].includes(mode)
        ? [{
            attempt_id: '88888888-8888-4888-8888-888888888888',
            daily_id: 'daily-2026-09-06',
          }]
        : mode === 'current-conflict'
          ? [{ attempt_id: '99999999-9999-4999-8999-999999999999', daily_id: 'daily-2026-09-06' }]
          : [];
      return single(conflictRows.filter((row) => state.filters.every(
        ([operator, column, value]) => (
          operator === 'eq'
            ? String(row[column]) === String(value)
            : operator === 'in'
              ? value.map(String).includes(String(row[column]))
              : true
        ),
      )));
    }
    if (state.table === 'training_daily_question_seals') {
      if (state.operation === 'upsert') {
        if (!dailySeal && competingSealQuestion) {
          const winnerQuestion = {
            ...competingSealQuestion,
            policyChecksum: competingSealQuestion.policyChecksum || 'f'.repeat(64),
          };
          const winnerSnapshot = snapshotFor(winnerQuestion);
          snapshots.set(winnerSnapshot.snapshot_key, winnerSnapshot);
          dailySeal = {
            daily_id: state.values[0].daily_id,
            snapshot_key: winnerSnapshot.snapshot_key,
            source_question_id: winnerQuestion.id,
            source_policy_checksum: winnerQuestion.policyChecksum,
          };
        } else if (!dailySeal) {
          dailySeal = state.values[0];
        }
        return single(dailySeal ? [dailySeal] : []);
      }
      const requestedDailyIds = state.filters.find(
        ([operator, column]) => operator === 'in' && column === 'daily_id',
      )?.[2];
      if (requestedDailyIds) {
        if (mode === 'prior-count-unavailable') {
          return single(requestedDailyIds.includes('daily-2026-08-20') ? [{
            daily_id: 'daily-2026-08-20',
            snapshot_key: SNAPSHOT_KEY,
            source_question_id: canonicalQuestion.id,
            source_policy_checksum: 'a'.repeat(64),
          }] : []);
        }
        return single(dailySeal && requestedDailyIds.includes(dailySeal.daily_id)
          ? [dailySeal]
          : []);
      }
      return single(dailySeal);
    }
    if (state.table === 'training_question_cache' && state.selectOptions?.head) {
      return { data: null, error: null, count: 1 };
    }
    if (state.table === 'training_question_cache') {
      return single([{
        question_id: candidateQuestion.id,
        game_id: 'cash-001',
        engine_type: 'PIO',
        level: 4,
        question_data: candidateQuestion,
        policy_checksum: candidateQuestion.policyChecksum || 'a'.repeat(64),
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
          neq(column, value) { state.filters.push(['neq', column, value]); return builder; },
          gt(column, value) { state.filters.push(['gt', column, value]); return builder; },
          or(value) { state.filters.push(['or', value]); return builder; },
          like(column, value) { state.filters.push(['like', column, value]); return builder; },
          in(column, value) { state.filters.push(['in', column, value]); return builder; },
          order(column, value) {
            state.orders = [...(state.orders || []), [column, value]];
            return builder;
          },
          limit(value) { state.limit = value; return builder; },
          range(start, end) { state.range = [start, end]; return builder; },
          maybeSingle() { state.single = true; return builder; },
          upsert(values, options) {
            state.operation = 'upsert';
            state.values = values;
            state.upsertOptions = options;
            return builder;
          },
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
    setCandidate(question) { candidateQuestion = question; },
    setCompetingSealQuestion(question) { competingSealQuestion = question; },
    snapshotFor,
    getDailySeal() { return dailySeal; },
  };
}

async function loadHandler({ mode = 'new', authenticated = true, today = '2026-09-06' } = {}) {
  const database = queryClient(mode);
  const deliveries = [];
  const servedAttempts = [];
  let activeUserId = USER_ID;
  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => authenticated
        ? { user: { id: activeUserId }, error: null }
        : { user: null, error: new Error('unauthorized') },
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => database.client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      withTiming: () => {},
      reconcileAnswerKey: () => {},
    },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
    '../../../src/lib/trivia/getTodayCST': { getTodayCST: () => today },
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
      buildTrainingQuestionSnapshot: ({ canonicalQuestion: question }) => database.snapshotFor(question),
      isTrainingAttemptContractError: () => false,
      isTrainingQuestionCampaignEligible: () => true,
      prepareTrainingAttemptDelivery: async (input) => {
        deliveries.push(input);
        const delivered = input.questions[0];
        const snapshot = database.snapshotFor(delivered);
        return {
          attemptId: ATTEMPT_ID,
          questions: [{
            ...publicQuestion(delivered),
            _gradingContext: {
              receipt: 'signed.receipt',
              submissionId: 'submission-1',
              attemptId: ATTEMPT_ID,
              snapshotKey: snapshot.snapshot_key,
              handOrdinal: 1,
            },
          }],
        };
      },
      recordTrainingQuestionsServedForAttempt: async (_client, input) => {
        servedAttempts.push(input);
        return { questionCount: input.delivery.questions.length };
      },
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      runTrainingPersistenceQuery: async (factory) => factory().abortSignal(new AbortController().signal),
      trainingPersistenceUnavailableBody: () => ({ success: false, code: 'TRAINING_PERSISTENCE_UNAVAILABLE' }),
    },
    '../../../src/lib/training/cacheTruthPersistence.mjs': {
      cacheRowIsServingEligible: () => true,
      recordTrainingQuestionsServed: async () => ({ questionCount: 1 }),
      withPersistedCacheReceipt: (question, row) => ({
        ...question,
        id: row.question_id || question?.id,
        policyChecksum: row.policy_checksum || 'a'.repeat(64),
      }),
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
  return {
    handler: module.namespace.default,
    database,
    deliveries,
    servedAttempts,
    setUser(userId) { activeUserId = userId; },
  };
}

test('Daily Challenge GET is private, authenticated, blind, and starts exactly one deterministic daily hand', async () => {
  const { handler, deliveries, servedAttempts } = await loadHandler();
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
  assert.equal(servedAttempts.length, 1);
  assert.equal(servedAttempts[0].delivery.attemptId, ATTEMPT_ID);
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

test('a pending scored attempt with a mismatched global seal fails closed', async () => {
  const { handler, deliveries } = await loadHandler({ mode: 'pending-seal-mismatch' });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH');
  assert.equal(response.body.retryable, true);
  assert.equal(deliveries.length, 0);
});

test('a pending scored attempt with a snapshot body/digest mismatch fails closed', async () => {
  const { handler, deliveries } = await loadHandler({ mode: 'pending-digest-mismatch' });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH');
  assert.equal(response.body.retryable, true);
  assert.equal(deliveries.length, 0);
});

test('a pending scored attempt fails closed when a sibling attempt quarantines its product day', async () => {
  const { handler, deliveries } = await loadHandler({ mode: 'pending-conflict' });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'TRAINING_DAILY_SNAPSHOT_CONFLICT');
  assert.equal(response.body.retryable, false);
  assert.equal(deliveries.length, 0);
});

test('a prior product-day answer scored across Chicago midnight is recovered before today is minted', async () => {
  const { handler, deliveries, database } = await loadHandler({
    mode: 'prior-pending',
    today: '2026-09-07',
  });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.dailyId, 'daily-2026-09-06');
  assert.equal(response.body.completionPending, true);
  assert.equal(response.body.persistedAnswer.attemptId, ATTEMPT_ID);
  assert.equal(response.body.persistedAnswer.selectedAction, 'raise');
  assert.equal(response.body.feedback.correctAnswer, 'raise');
  assert.equal(response.body.question.correctAnswer, undefined);
  assert.equal(response.body.question.explanation, undefined);
  assert.equal(response.body.question._gradingContext, undefined);
  assert.equal(response.body.expiresAt, '2099-09-07T05:00:00.000Z');
  assert.equal(deliveries.length, 0, 'recovery must not mint today or issue another receipt');
  assert.equal(
    database.calls.filter((call) => (
      call.table === 'training_question_cache' && call.selectOptions?.head
    )).length,
    0,
    'the mutable candidate cache must not be consulted before prior completion recovery',
  );
  const priorAttemptRead = database.calls.find((call) => (
    call.table === 'training_attempts'
    && call.filters.some(([operator]) => operator === 'neq')
  ));
  assert.ok(priorAttemptRead, 'recovery must query prior open attempts');
  assert.equal(
    priorAttemptRead.limit,
    17,
    'keyset recovery reads one bounded page plus a continuation sentinel',
  );
  assert.equal(
    priorAttemptRead.selectOptions.count,
    'exact',
    'a platform row cap must be distinguishable from true query exhaustion',
  );
  assert.deepEqual(
    priorAttemptRead.orders.map(([column]) => column),
    ['started_at', 'id'],
    'recovery order needs a unique keyset tie-breaker',
  );
  assert.equal(
    database.calls.filter((call) => (
      call.table === 'training_attempt_hands'
      && call.filters.some(([operator]) => operator === 'in')
    )).length,
    1,
    'prior attempt evidence is read in a batch rather than with one query per candidate',
  );
});

for (const [mode, label] of [
  ['prior-missing-snapshot', 'missing immutable snapshot'],
  ['prior-answer-mismatch', 'answer bound to another snapshot'],
]) {
  test(`a scored prior attempt with ${label} fails closed before today is minted`, async () => {
    const { handler, deliveries, database } = await loadHandler({
      mode,
      today: '2026-09-07',
    });
    const response = createResponse();
    await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH');
    assert.equal(response.body.retryable, true);
    assert.equal(deliveries.length, 0);
    assert.equal(
      database.calls.filter((call) => call.table === 'training_question_cache').length,
      0,
      'corrupt historical evidence must never be skipped in favor of a new daily hand',
    );
  });
}

test('bounded prior recovery fails honestly instead of minting today when the scan budget is exhausted', async () => {
  const { handler, deliveries, database } = await loadHandler({
    mode: 'prior-overflow',
    today: '2026-09-07',
  });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'TRAINING_DAILY_RECOVERY_SCAN_INCOMPLETE');
  assert.equal(response.body.retryable, true);
  assert.equal(deliveries.length, 0);
  assert.equal(
    database.calls.filter((call) => call.table === 'training_attempts' && !call.single).length,
    4,
  );
  assert.equal(
    database.calls.filter((call) => call.table === 'training_question_cache').length,
    0,
    'an incomplete recovery scan must never mint a replacement hand',
  );
});

test('an unavailable exact count keeps keyset paging until hidden prior evidence is found', async () => {
  const { handler, deliveries, database } = await loadHandler({
    mode: 'prior-count-unavailable',
    today: '2026-09-07',
  });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.dailyId, 'daily-2026-08-20');
  assert.equal(response.body.completionPending, true);
  assert.equal(response.body.persistedAnswer.attemptId, ATTEMPT_ID);
  assert.equal(deliveries.length, 0);
  const recoveryReads = database.calls.filter((call) => (
    call.table === 'training_attempts' && !call.single
  ));
  assert.equal(recoveryReads.length, 2);
  assert.ok(
    recoveryReads[1].filters.some(([operator]) => operator === 'or'),
    'a missing count must advance with the unique started_at/id cursor',
  );
});

test('an unavailable exact count treats a 64-row final page as exhausted without a false recovery outage', async () => {
  const { handler, deliveries, database } = await loadHandler({
    mode: 'prior-count-unavailable-exact-64',
    today: '2026-09-07',
  });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.dailyId, 'daily-2026-09-07');
  assert.equal(response.body.completionPending, false);
  assert.equal(deliveries.length, 1, 'a fully exhausted recovery scan may mint today exactly once');
  const recoveryReads = database.calls.filter((call) => (
    call.table === 'training_attempts' && !call.single
  ));
  assert.equal(recoveryReads.length, 4);
  assert.deepEqual(
    recoveryReads.map((call) => call.limit),
    [17, 17, 17, 17],
    'each bounded page retains one continuation sentinel',
  );
  assert.equal(
    recoveryReads.slice(1).every((call) => call.filters.some(([operator]) => operator === 'or')),
    true,
    'every page after the first must advance by its unique keyset cursor',
  );
});

test('a prior scored attempt fails closed when a sibling attempt quarantines its product day', async () => {
  const { handler, deliveries, database } = await loadHandler({
    mode: 'prior-conflict',
    today: '2026-09-07',
  });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'TRAINING_DAILY_SNAPSHOT_CONFLICT');
  assert.equal(response.body.retryable, false);
  assert.equal(deliveries.length, 0);
  assert.equal(
    database.calls.filter((call) => call.table === 'training_question_cache').length,
    0,
  );
});

test('one dailyId keeps the first persisted snapshot for a second user after cache mutation', async () => {
  const runtime = await loadHandler();
  const firstResponse = createResponse();
  await runtime.handler(
    { method: 'GET', headers: { authorization: 'Bearer first-user' } },
    firstResponse,
  );
  assert.equal(firstResponse.statusCode, 200);
  assert.equal(runtime.database.getDailySeal().snapshot_key, SNAPSHOT_KEY);

  runtime.database.setCandidate({
    ...canonicalQuestion,
    id: 'daily-question-added-after-first-user',
    question: 'This Later Cache Candidate Must Not Replace The Daily Seal.',
  });
  runtime.setUser('44444444-4444-4444-8444-444444444444');
  const secondResponse = createResponse();
  await runtime.handler(
    { method: 'GET', headers: { authorization: 'Bearer second-user' } },
    secondResponse,
  );

  assert.equal(secondResponse.statusCode, 200);
  assert.equal(firstResponse.body.dailyId, secondResponse.body.dailyId);
  assert.equal(firstResponse.body.question.id, canonicalQuestion.id);
  assert.equal(secondResponse.body.question.id, canonicalQuestion.id);
  assert.equal(runtime.deliveries.length, 2);
  assert.deepEqual(
    runtime.deliveries.map((delivery) => delivery.questions[0].id),
    [canonicalQuestion.id, canonicalQuestion.id],
  );
  assert.equal(
    runtime.database.calls.filter((call) => (
      call.table === 'training_question_cache' && call.selectOptions?.head
    )).length,
    1,
    'only the first user may select from mutable cache membership/order',
  );
});

test('a concurrent daily seal race serves the persisted winner rather than this request candidate', async () => {
  const runtime = await loadHandler();
  const competingQuestion = {
    ...canonicalQuestion,
    id: 'daily-question-concurrent-winner',
    question: 'Which Action Wins The Concurrent Seal?',
    policyChecksum: 'f'.repeat(64),
  };
  runtime.database.setCompetingSealQuestion(competingQuestion);

  const response = createResponse();
  await runtime.handler(
    { method: 'GET', headers: { authorization: 'Bearer test-user' } },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(runtime.database.getDailySeal().source_question_id, competingQuestion.id);
  assert.equal(response.body.question.id, competingQuestion.id);
  assert.equal(runtime.deliveries.length, 1);
  assert.equal(runtime.deliveries[0].questions[0].id, competingQuestion.id);
  assert.notEqual(
    runtime.database.getDailySeal().source_question_id,
    canonicalQuestion.id,
    'the request must not assume its losing candidate won the database race',
  );
});

test('a completed aggregate without its immutable hand binding fails closed explicitly', async () => {
  const { handler, deliveries } = await loadHandler({ mode: 'completed-aggregate-only' });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    success: false,
    code: 'TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH',
    error: 'The completed Daily Challenge does not match its immutable daily seal.',
    retryable: true,
  });
  assert.equal(deliveries.length, 0, 'aggregate counters must not mint an unrelated replacement hand');
});

test('a completed attempt cannot be replayed when a sibling attempt quarantines its product day', async () => {
  const { handler, deliveries } = await loadHandler({ mode: 'completed-conflict' });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'TRAINING_DAILY_SNAPSHOT_CONFLICT');
  assert.equal(response.body.retryable, false);
  assert.equal(deliveries.length, 0);
});

test('the exact current completion lookup is independent of the bounded history window', async () => {
  const { handler, deliveries, database } = await loadHandler({
    mode: 'completed-current-outside-history',
  });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.completion.attemptId, ATTEMPT_ID);
  assert.equal(deliveries.length, 0);
  const currentRead = database.calls.find((call) => (
    call.table === 'training_daily_challenge'
    && call.single
    && call.filters.some(([operator, column, value]) => (
      operator === 'eq' && column === 'daily_id' && value === 'daily-2026-09-06'
    ))
  ));
  assert.ok(currentRead, 'today must use an exact product-day lookup');
  const historyRead = database.calls.find((call) => (
    call.table === 'training_daily_challenge' && !call.single
  ));
  assert.equal(historyRead.limit, 365);
});

test('a conflict on the current product day blocks candidate selection and attempt minting', async () => {
  const { handler, deliveries, database } = await loadHandler({ mode: 'current-conflict' });
  const response = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'TRAINING_DAILY_SNAPSHOT_CONFLICT');
  assert.equal(response.body.retryable, false);
  assert.equal(deliveries.length, 0);
  assert.equal(database.calls.some((call) => call.table === 'training_question_cache'), false,
    'a conflicted product day must not consult mutable candidates');
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

test('daily snapshot and midnight migration preserves immutable identity and exactly-once settlement', () => {
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /LOCK TABLE[\s\S]*training_attempts[\s\S]*training_attempt_hands[\s\S]*training_question_snapshots[\s\S]*IN SHARE ROW EXCLUSIVE MODE/,
    'historical seal derivation and trigger installation must not race old-server hand writes',
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /CREATE TABLE IF NOT EXISTS public\.training_daily_question_seals/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /CREATE TABLE IF NOT EXISTS public\.training_daily_question_conflicts/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /daily_id text PRIMARY KEY[\s\S]*snapshot_key text NOT NULL[\s\S]*REFERENCES public\.training_question_snapshots/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /training_daily_question_seals_immutable_v1[\s\S]*BEFORE UPDATE OR DELETE/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /fn_training_daily_question_seal_validate_v1[\s\S]*TRAINING_DAILY_QUESTION_SEAL_CONTRACT_INVALID/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /CREATE TRIGGER training_daily_question_seals_validate_v1[\s\S]*BEFORE INSERT/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /INSERT INTO public\.training_daily_question_seals[\s\S]*ON CONFLICT \(daily_id\) DO NOTHING[\s\S]*TRAINING_DAILY_SNAPSHOT_BINDING_MISMATCH/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /HAVING count\(DISTINCT snapshot_key\) > 1[\s\S]*training_daily_question_conflicts[\s\S]*NOT EXISTS \([\s\S]*training_daily_question_conflicts/,
  );
  const historicalConflictScan = DAILY_RECOVERY_MIGRATION_SOURCE.match(
    /WITH historical_daily_hands AS \(([\s\S]*?)\), conflicting_dates AS/,
  )?.[1] || '';
  assert.doesNotMatch(
    historicalConflictScan,
    /snapshots\.(?:game_id|level)/,
    'all served ordinal-1 daily hands must be counted before snapshot metadata validation',
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /fn_training_daily_attempt_matches_start_v1\(attempt_row\.client_nonce, attempt_row\.started_at\)/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /activity_chicago_date := timezone\(''America\/Chicago'', attempt_row\.started_at\)::date[\s\S]*now_utc := activity_chicago_date::timestamp/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /TRAINING_DAILY_SNAPSHOT_CONFLICT[\s\S]*daily_hand_snapshot_key IS DISTINCT FROM daily_seal_snapshot_key/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /completed_daily_guard constant text :=[\s\S]*attempt_row\.session_kind = ''daily'' AND attempt_row\.status = ''completed''[\s\S]*TRAINING_DAILY_SNAPSHOT_CONFLICT[\s\S]*IF attempt_row\.status = ''completed'' THEN/,
    'completed Daily replays must validate the immutable seal before idempotent success',
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /attempts\.expires_at > now\(\)[\s\S]*hands\.status = 'scored'[\s\S]*training_daily_question_seals[\s\S]*training_daily_question_conflicts[\s\S]*training_daily_challenge/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /REVOKE ALL ON public\.training_daily_question_seals\s+FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /TRAINING_DAILY_AUTHORITY_TABLE_SHAPE_INVALID/,
    'CREATE TABLE IF NOT EXISTS must fail closed on a preexisting wrong-shape authority table',
  );
  assert.equal(
    [...DAILY_RECOVERY_MIGRATION_SOURCE.matchAll(/SECURITY DEFINER\s+SET search_path TO pg_catalog/g)].length,
    3,
    'all three new Daily authority definers must resolve only pg_catalog and qualified objects',
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /fn_training_daily_attempt_matches_start_v1[\s\S]*SET search_path TO pg_catalog/,
    'the immutable date helper must also use the hardened search path',
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /REVOKE ALL PRIVILEGES \([\s\S]*source_policy_checksum[\s\S]*\) ON public\.training_daily_question_seals/,
    'a preexisting column ACL must not survive table-level privilege repair',
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /has_function_privilege\([\s\S]*'anon'[\s\S]*fn_complete_training_attempt_v2\(uuid,uuid\)[\s\S]*'EXECUTE'/,
  );
  assert.match(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /AND prosecdef[\s\S]*proconfig[\s\S]*search_path=public[\s\S]*fn_training_daily_attempt_matches_start_v1/,
  );
  assert.doesNotMatch(
    DAILY_RECOVERY_MIGRATION_SOURCE,
    /CREATE OR REPLACE FUNCTION public\.fn_start_training_attempt_v2/,
    'midnight recovery must not broaden daily attempt issuance',
  );
  assert.match(
    MIGRATION_SOURCE,
    /reward_reference := 'training_attempt:' \|\| attempt_row\.id::text/,
    'the patched function retains attempt-keyed idempotent reward settlement',
  );
  assert.match(
    MIGRATION_SOURCE,
    /ON CONFLICT \(user_id, daily_id\) DO UPDATE SET/,
    'the patched function retains one settlement row per user and product day',
  );
  assert.match(
    POSTGRES_VERIFIER_SOURCE,
    /DAILY_RECOVERY_MIGRATION[\s\S]*20260907193000_training_daily_immutable_snapshot_and_midnight_recovery\.sql/,
  );
  assert.equal(
    [...POSTGRES_VERIFIER_SOURCE.matchAll(/'-f', DAILY_RECOVERY_MIGRATION/g)].length,
    2,
    'the permanent PG17 verifier applies and reruns the daily migration',
  );
  assert.match(
    POSTGRES_VERIFIER_SOURCE,
    /multi-snapshot history was crowned or reopened[\s\S]*two product days did not form a two-day streak/,
  );
  assert.match(
    POSTGRES_VERIFIER_SOURCE,
    /completed Daily replay bypassed later conflict evidence/,
    'the real PostgreSQL verifier must exercise post-completion conflict discovery',
  );
});

test('out-of-order Daily settlement is recomputed from an immutable activity-day ledger', () => {
  assert.match(
    STREAK_RECOVERY_MIGRATION_SOURCE,
    /training_streak_activity_days_immutable_v1[\s\S]*BEFORE UPDATE OR DELETE/,
    'immutable activity evidence must reject both mutation and deletion',
  );
  assert.match(
    STREAK_RECOVERY_MIGRATION_SOURCE,
    /CREATE TABLE IF NOT EXISTS public\.training_streak_activity_days[\s\S]*PRIMARY KEY \(user_id, activity_date\)/,
  );
  assert.match(
    STREAK_RECOVERY_MIGRATION_SOURCE,
    /CREATE OR REPLACE FUNCTION public\.fn_training_streak_summary_v1[\s\S]*row_number\(\) OVER \(ORDER BY activity_date\)[\s\S]*GROUP BY island_key/,
  );
  assert.match(
    STREAK_RECOVERY_MIGRATION_SOURCE,
    /FOR UPDATE;[\s\S]*INSERT INTO public\.training_streak_activity_days[\s\S]*fn_training_streak_summary_v1[\s\S]*authority_current_streak =/,
  );
  assert.match(
    STREAK_RECOVERY_MIGRATION_SOURCE,
    /REVOKE ALL ON public\.training_streak_activity_days[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    STREAK_RECOVERY_MIGRATION_SOURCE,
    /TRAINING_STREAK_ACTIVITY_TABLE_SHAPE_INVALID/,
    'the activity ledger must reject a preexisting partial schema',
  );
  assert.equal(
    [...STREAK_RECOVERY_MIGRATION_SOURCE.matchAll(/SECURITY DEFINER\s+SET search_path TO pg_catalog/g)].length,
    4,
    'the immutable trigger, staged/final summary definitions, and capture trigger must resolve only pg_catalog and qualified objects',
  );
  assert.match(
    STREAK_RECOVERY_MIGRATION_SOURCE,
    /REVOKE ALL PRIVILEGES \(user_id, activity_date, first_attempt_id, recorded_at\)/,
    'the private ledger must also clear inherited column-level privileges',
  );
  assert.match(
    STREAK_RECOVERY_MIGRATION_SOURCE,
    /\('SELECT'\), \('INSERT'\), \('UPDATE'\), \('DELETE'\), \('TRUNCATE'\),[\s\S]*\('REFERENCES'\), \('TRIGGER'\), \('MAINTAIN'\)[\s\S]*has_table_privilege/,
    'the migration must audit every PostgreSQL 17 table privilege, including MAINTAIN',
  );
  assert.match(
    STREAK_RECOVERY_MIGRATION_SOURCE,
    /has_function_privilege\([\s\S]*'service_role', 'public\.fn_training_streak_activity_immutable_v1\(\)', 'EXECUTE'/,
    'the trigger-only immutable helper must remain unavailable to service_role',
  );
  assert.match(
    POSTGRES_VERIFIER_SOURCE,
    /ALTER DEFAULT PRIVILEGES IN SCHEMA public[\s\S]*GRANT ALL ON TABLES TO anon, authenticated, service_role;[\s\S]*GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;[\s\S]*GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;/,
    'the disposable verifier must reproduce the live Supabase default ACLs',
  );
  assert.equal(
    [...POSTGRES_VERIFIER_SOURCE.matchAll(/'-f', STREAK_OUT_OF_ORDER_MIGRATION/g)].length,
    3,
    'the PG17 authority verifier must prove first application, rerun safety, and corrupt-shape refusal',
  );
  assert.match(
    POSTGRES_VERIFIER_SOURCE,
    /day 3, day 1, day 2 settlement did not converge/,
  );
  assert.match(
    POSTGRES_VERIFIER_SOURCE,
    /streak migration did not repair preexisting day 3, day 1, day 2 evidence/,
    'the real verifier must cover both migration backfill and runtime settlement order',
  );
});
