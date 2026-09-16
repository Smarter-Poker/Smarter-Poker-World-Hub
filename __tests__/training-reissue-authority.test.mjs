import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeRequire = createRequire(import.meta.url);
const ROUTE = 'pages/api/training/reissue-questions.js';

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

function filterRows(rows, filters) {
  return rows.filter((row) => filters.every((filter) => {
    if (filter.kind === 'eq') return row[filter.column] === filter.value;
    if (filter.kind === 'in') return filter.values.includes(row[filter.column]);
    return true;
  }));
}

function createSupabase(fixtures) {
  return {
    from(table) {
      const filters = [];
      let ascendingOrder = null;
      let rowLimit = null;
      const query = {
        select() { return query; },
        eq(column, value) { filters.push({ kind: 'eq', column, value }); return query; },
        in(column, values) { filters.push({ kind: 'in', column, values }); return query; },
        order(column, { ascending } = {}) {
          ascendingOrder = { column, ascending: ascending !== false };
          return query;
        },
        limit(value) { rowLimit = Number(value); return query; },
        maybeSingle() {
          const rows = filterRows(fixtures[table] || [], filters);
          return Promise.resolve({ data: rows[0] || null, error: null });
        },
        then(resolve, reject) {
          let rows = filterRows(fixtures[table] || [], filters);
          if (ascendingOrder) {
            const direction = ascendingOrder.ascending ? 1 : -1;
            rows = [...rows].sort((left, right) => (
              (Number(left[ascendingOrder.column]) - Number(right[ascendingOrder.column])) * direction
            ));
          }
          if (Number.isFinite(rowLimit)) rows = rows.slice(0, rowLimit);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function loadHandler(fixtures = {}) {
  const source = fs.readFileSync(path.join(ROOT, ROUTE), 'utf8');
  const babel = nodeRequire('@babel/core');
  const transformModulesCommonJs = nodeRequire('@babel/plugin-transform-modules-commonjs');
  const compiled = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: ROUTE,
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;
  const calls = { attemptDeliveries: [], receiptDeliveries: [] };
  const supabase = createSupabase(fixtures);
  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({
        user: { id: 'user-1' },
        error: null,
      }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => supabase },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../src/lib/training/gradingReceipt.mjs': {
      trainingQuestionDigest: (question) => `digest:${question.id}`,
      prepareTrainingQuestionForDelivery: (input) => {
        calls.receiptDeliveries.push(input);
        return {
          id: input.canonicalQuestion.id,
          _gradingContext: {
            sessionId: input.sessionId,
            attemptId: input.attemptId,
            snapshotKey: input.snapshotKey,
            sessionKind: input.sessionKind,
            sessionTargetHands: input.sessionTargetHands,
            handOrdinal: input.handOrdinal,
            decisionOrdinal: 1,
            countsTowardCompletion: true,
            practiceOnly: input.practiceOnly,
          },
        };
      },
    },
    '../../../src/lib/training/questionContract.mjs': { isTrainingQuestionValid: () => true },
    '../../../src/lib/training/trainingAttemptDelivery.mjs': {
      isTrainingAttemptContractError: () => false,
      trainingQuestionSnapshotMatchesIdentity: () => true,
      trainingQuestionCampaignEligibility: (question) => ({
        eligible: question?.authorityEligible !== false,
        reason: question?.authorityEligible === false ? 'authority_unverified' : 'test_fixture',
      }),
      prepareTrainingAttemptDelivery: async (input) => {
        calls.attemptDeliveries.push(input);
        return {
          attemptId: 'replay-attempt',
          sessionKind: input.sessionKind,
          targetHands: input.requestedHands,
          questions: input.questions.map((question) => ({ id: question.id })),
        };
      },
      recordTrainingQuestionsServedForAttempt: async (_db, input) => {
        calls.servedDelivery = input;
        return { questionCount: input.delivery.questions.length };
      },
      trainingAttemptDecisionServeKey: (attemptId, handOrdinal, decisionOrdinal) => (
        `training-attempt:${attemptId}:hand:${handOrdinal}:decision:${decisionOrdinal}`
      ),
    },
    '../../../src/lib/training/sessionAttemptContract.mjs': {
      normalizeTrainingSessionKind: (value) => String(value || 'campaign').toLowerCase(),
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      runTrainingPersistenceQuery: async (factory) => factory(),
      trainingPersistenceUnavailableBody: () => ({ success: false }),
    },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value, length) => String(value || '').slice(0, length),
      withTiming() {},
    },
  };
  const routeModule = { exports: {} };
  const evaluate = new Function('require', 'module', 'exports', compiled);
  evaluate((specifier) => {
    assert.ok(dependencies[specifier], `unexpected dependency: ${specifier}`);
    return dependencies[specifier];
  }, routeModule, routeModule.exports);
  return { handler: routeModule.exports.default, calls };
}

function canonicalSnapshot(id, ordinal) {
  return {
    snapshot_key: `snapshot-${ordinal}`,
    source_question_id: id,
    game_id: 'cash-001',
    level: 1,
    content_digest: `digest:${id}`,
    question_data: { id, question: `Question ${ordinal}` },
  };
}

function openAttemptFixtures({ started = false } = {}) {
  return {
    training_attempts: [{
      id: 'attempt-1',
      user_id: 'user-1',
      client_nonce: 'session-1',
      game_id: 'cash-001',
      level: 1,
      session_kind: 'campaign',
      difficulty: 'grouped',
      expected_hands: 2,
      practice_only: false,
      status: 'open',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }],
    training_attempt_hands: [
      { attempt_id: 'attempt-1', hand_ordinal: 1, snapshot_key: 'snapshot-1', status: started ? 'scored' : 'allocated' },
      { attempt_id: 'attempt-1', hand_ordinal: 2, snapshot_key: 'snapshot-2', status: 'allocated' },
    ],
    training_question_snapshots: [canonicalSnapshot('q-1', 1), canonicalSnapshot('q-2', 2)],
  };
}

async function post(handler, body) {
  const res = response();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body,
  }, res);
  return res;
}

test('reissue route never starts a reward attempt from the shared question cache', () => {
  const source = fs.readFileSync(path.join(ROOT, ROUTE), 'utf8');
  assert.doesNotMatch(source, /from\('training_question_cache'\)/);
  assert.doesNotMatch(source, /requestedHands\s*=\s*Number\.parseInt\(req\.body/);
  assert.match(source, /attemptId: delivery\.attemptId/);
  assert.match(source, /recoveredExistingAttempt: true/);
  assert.match(source, /hand\.status !== 'allocated'/);
  assert.match(source, /sessionKind: 'replay'/);
});

test('campaign recovery cannot mint a fresh attempt from arbitrary question ids', async () => {
  const { handler, calls } = loadHandler(openAttemptFixtures());
  const res = await post(handler, {
    gameId: 'cash-001',
    level: 1,
    sessionId: 'session-1',
    sessionKind: 'campaign',
    questionIds: ['q-1'],
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'TRAINING_REISSUE_ATTEMPT_REQUIRED');
  assert.equal(calls.attemptDeliveries.length, 0);
  assert.equal(calls.receiptDeliveries.length, 0);
});

test('campaign recovery requires the exact untouched manifest and preserves attempt identity', async () => {
  const partial = loadHandler(openAttemptFixtures());
  const partialResponse = await post(partial.handler, {
    gameId: 'cash-001',
    level: 1,
    sessionId: 'session-1',
    sessionKind: 'campaign',
    attemptId: 'attempt-1',
    questionIds: ['q-1'],
  });
  assert.equal(partialResponse.statusCode, 409);
  assert.equal(partialResponse.body.code, 'TRAINING_REISSUE_MANIFEST_MISMATCH');
  assert.equal(partial.calls.attemptDeliveries.length, 0);

  const exact = loadHandler(openAttemptFixtures());
  const exactResponse = await post(exact.handler, {
    gameId: 'cash-001',
    level: 1,
    sessionId: 'session-1',
    sessionKind: 'campaign',
    attemptId: 'attempt-1',
    questionIds: ['q-2', 'q-1'],
    difficulty: 'exact',
  });
  assert.equal(exactResponse.statusCode, 200);
  assert.equal(exactResponse.body.recoveredExistingAttempt, true);
  assert.equal(exactResponse.body.attemptId, 'attempt-1');
  assert.equal(exactResponse.body.sessionId, 'session-1');
  assert.deepEqual(exactResponse.body.questions.map(({ id }) => id), ['q-1', 'q-2']);
  assert.equal(exact.calls.attemptDeliveries.length, 0);
  assert.equal(exact.calls.receiptDeliveries.length, 2);
  assert.equal(exact.calls.servedDelivery.delivery.attemptId, 'attempt-1');
  assert.deepEqual(
    exact.calls.servedDelivery.delivery.questions.map(({ id }) => id),
    ['q-1', 'q-2'],
  );
  assert.ok(exact.calls.receiptDeliveries.every((delivery) => (
    delivery.attemptId === 'attempt-1'
    && delivery.sessionId === 'session-1'
    && delivery.practiceOnly === false
    && delivery.difficultyMode === 'grouped'
  )));
  assert.deepEqual(
    exact.calls.receiptDeliveries.map((delivery) => delivery.receiptId),
    [
      'training-attempt:attempt-1:hand:1:decision:1',
      'training-attempt:attempt-1:hand:2:decision:1',
    ],
  );
});

test('a started campaign cannot refresh receipts for already allocated hands', async () => {
  const { handler, calls } = loadHandler(openAttemptFixtures({ started: true }));
  const res = await post(handler, {
    gameId: 'cash-001',
    level: 1,
    sessionId: 'session-1',
    sessionKind: 'campaign',
    attemptId: 'attempt-1',
    questionIds: ['q-1', 'q-2'],
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'TRAINING_REISSUE_ATTEMPT_STARTED');
  assert.equal(calls.attemptDeliveries.length, 0);
  assert.equal(calls.receiptDeliveries.length, 0);
});

test('campaign recovery cannot move an attempt onto a new browser session', async () => {
  const { handler, calls } = loadHandler(openAttemptFixtures());
  const res = await post(handler, {
    gameId: 'cash-001',
    level: 1,
    sessionId: 'attacker-selected-new-session',
    sessionKind: 'campaign',
    attemptId: 'attempt-1',
    questionIds: ['q-1', 'q-2'],
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'TRAINING_REISSUE_ATTEMPT_INVALID');
  assert.equal(calls.attemptDeliveries.length, 0);
  assert.equal(calls.receiptDeliveries.length, 0);
});

test('campaign recovery cannot re-seal an authority-ineligible historical snapshot', async () => {
  const fixtures = openAttemptFixtures();
  fixtures.training_question_snapshots[0].question_data.authorityEligible = false;
  const { handler, calls } = loadHandler(fixtures);
  const res = await post(handler, {
    gameId: 'cash-001',
    level: 1,
    sessionId: 'session-1',
    sessionKind: 'campaign',
    attemptId: 'attempt-1',
    questionIds: ['q-1', 'q-2'],
  });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'TRAINING_REISSUE_QUESTION_AUTHORITY_INELIGIBLE');
  assert.equal(res.body.reason, 'authority_unverified');
  assert.equal(calls.attemptDeliveries.length, 0);
  assert.equal(calls.receiptDeliveries.length, 0);
});

test('mistake replay accepts only incorrect parent hands and remains practice-only', async () => {
  const fixtures = openAttemptFixtures();
  fixtures.training_attempts[0] = {
    ...fixtures.training_attempts[0],
    status: 'completed',
  };
  fixtures.training_answers = [{
    attempt_id: 'attempt-1',
    hand_ordinal: 2,
    decision_ordinal: 1,
    is_correct: false,
  }];

  const rejected = loadHandler(fixtures);
  const rejectedResponse = await post(rejected.handler, {
    gameId: 'cash-001',
    level: 1,
    sessionId: 'replay-session',
    sessionKind: 'replay',
    parentAttemptId: 'attempt-1',
    questionIds: ['q-1'],
  });
  assert.equal(rejectedResponse.statusCode, 409);
  assert.equal(rejectedResponse.body.code, 'TRAINING_REPLAY_HAND_NOT_ELIGIBLE');
  assert.equal(rejected.calls.attemptDeliveries.length, 0);

  const accepted = loadHandler(fixtures);
  const acceptedResponse = await post(accepted.handler, {
    gameId: 'cash-001',
    level: 1,
    sessionId: 'replay-session',
    sessionKind: 'replay',
    parentAttemptId: 'attempt-1',
    questionIds: ['q-2'],
    requestedHands: 100,
    difficulty: 'exact',
  });
  assert.equal(acceptedResponse.statusCode, 200);
  assert.equal(accepted.calls.attemptDeliveries.length, 1);
  assert.equal(accepted.calls.attemptDeliveries[0].sessionKind, 'replay');
  assert.equal(accepted.calls.attemptDeliveries[0].requestedHands, 1);
  assert.equal(accepted.calls.attemptDeliveries[0].difficultyMode, 'grouped');
  assert.equal(accepted.calls.attemptDeliveries[0].parentAttemptId, 'attempt-1');
  assert.equal(accepted.calls.servedDelivery.delivery.attemptId, 'replay-attempt');
  assert.deepEqual(accepted.calls.servedDelivery.delivery.questions.map(({ id }) => id), ['q-2']);
});
