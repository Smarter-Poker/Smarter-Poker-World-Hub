/**
 * Two players preloading the same game/level upsert the same deterministic
 * question ids. Production answered one of them 503
 * TRAINING_PERSISTENCE_UNAVAILABLE because Postgres aborted the second writer
 * with deadlock_detected (40P01) and the persistence wrapper treated that like
 * any other database failure.
 *
 * Source fixes under test:
 *   - rows are submitted in one stable question_id order (no AB/BA lock
 *     cycle between concurrent writers), and
 *   - lock-contention SQLSTATEs (40P01, 40001) are retried in-request, at
 *     most three attempts, with jitter; everything else still fails closed.
 *
 * The route tests drive the REAL batch-preload handler through
 * tests/helpers/trainingBatchPreloadHarness.mjs; only the Supabase boundary
 * is an in-memory fake that replays the exact PostgREST error shape.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  createInMemorySupabase,
  invokeBatchPreload,
  load,
} from '../tests/helpers/trainingBatchPreloadHarness.mjs';

const persistence = await load('src/lib/training/trainingPersistence.mjs');
const {
  TRAINING_PERSISTENCE_CONTENTION_ATTEMPTS,
  TRAINING_PERSISTENCE_CONTENTION_SQLSTATES,
  TrainingPersistenceUnavailableError,
  isTrainingPersistenceContention,
  orderRowsForConcurrentWrite,
  runTrainingPersistenceQuery,
} = persistence;

const USER_ID = '3f2b6c1e-8d4a-4b7f-9e2c-1a5d7f9b3c6e';
const DEADLOCK = Object.freeze({ code: '40P01', message: 'deadlock detected', details: null, hint: null });
const SERIALIZATION = Object.freeze({ code: '40001', message: 'could not serialize access due to concurrent update' });
const UNIQUE_VIOLATION = Object.freeze({ code: '23505', message: 'duplicate key value violates unique constraint' });

function scriptedQuery(outcomes) {
  const attempts = [];
  const factory = () => {
    const outcome = outcomes[Math.min(attempts.length, outcomes.length - 1)];
    attempts.push(outcome);
    const query = {
      abortSignal() { return query; },
      then(resolve, reject) {
        if (outcome instanceof Error) return Promise.reject(outcome).then(resolve, reject);
        return Promise.resolve(outcome).then(resolve, reject);
      },
    };
    return query;
  };
  return { factory, attempts };
}

const quiet = async (operation) => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
  try {
    return { value: await operation(), warnings };
  } finally {
    console.warn = originalWarn;
  }
};

test('contention SQLSTATEs are the only codes recognised as lock contention', () => {
  assert.deepEqual(TRAINING_PERSISTENCE_CONTENTION_SQLSTATES, ['40P01', '40001']);
  assert.equal(TRAINING_PERSISTENCE_CONTENTION_ATTEMPTS, 3);
  assert.equal(isTrainingPersistenceContention(DEADLOCK), true);
  assert.equal(isTrainingPersistenceContention(SERIALIZATION), true);
  assert.equal(isTrainingPersistenceContention({ cause: { code: '40p01' } }), true);
  assert.equal(isTrainingPersistenceContention(UNIQUE_VIOLATION), false);
  assert.equal(isTrainingPersistenceContention({ code: 'PGRST301' }), false);
  assert.equal(isTrainingPersistenceContention(null), false);
});

test('a deadlock on the first attempt is retried once and the second result is returned', async () => {
  const success = { data: [{ question_id: 'q-1' }], error: null };
  const { factory, attempts } = scriptedQuery([{ data: null, error: DEADLOCK }, success]);
  const { value, warnings } = await quiet(() => runTrainingPersistenceQuery(factory, {
    label: 'Test:canonicalize', maxRetries: 0, contentionBaseDelayMs: 1, random: () => 0,
  }));
  assert.equal(attempts.length, 2, 'exactly one retry');
  assert.deepEqual(value, success);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Lock contention 40P01 \(attempt 1\/3\)/);
});

test('a serialization failure is retried the same way and the delay grows with jitter', async () => {
  const success = { data: [], error: null };
  const { factory, attempts } = scriptedQuery([
    { data: null, error: SERIALIZATION }, { data: null, error: SERIALIZATION }, success,
  ]);
  const started = Date.now();
  const { value, warnings } = await quiet(() => runTrainingPersistenceQuery(factory, {
    label: 'Test:serialization', maxRetries: 0, contentionBaseDelayMs: 5, random: () => 1,
  }));
  assert.equal(attempts.length, 3);
  assert.deepEqual(value, success);
  assert.deepEqual(warnings.map((line) => /retrying in (\d+)ms/.exec(line)[1]), ['10', '20']);
  assert.ok(Date.now() - started >= 25, 'the retries actually waited');
});

test('persistent contention fails closed after exactly three attempts, and the cap cannot be raised', async () => {
  const { factory, attempts } = scriptedQuery([{ data: null, error: DEADLOCK }]);
  const { value: error } = await quiet(() => runTrainingPersistenceQuery(factory, {
    label: 'Test:persistent', maxRetries: 0, contentionBaseDelayMs: 1, random: () => 0, contentionAttempts: 10,
  }).then(() => null, (thrown) => thrown));
  assert.ok(error instanceof TrainingPersistenceUnavailableError, String(error));
  assert.equal(error.code, '40P01');
  assert.equal(error.trainingCode, 'TRAINING_PERSISTENCE_UNAVAILABLE');
  assert.equal(attempts.length, 3);
});

test('a non-contention database error is not retried and still fails closed', async () => {
  const { factory, attempts } = scriptedQuery([{ data: null, error: UNIQUE_VIOLATION }, { data: [], error: null }]);
  const { value: error } = await quiet(() => runTrainingPersistenceQuery(factory, {
    label: 'Test:constraint', maxRetries: 0, contentionBaseDelayMs: 1,
  }).then(() => null, (thrown) => thrown));
  assert.ok(error instanceof TrainingPersistenceUnavailableError, String(error));
  assert.equal(error.code, '23505');
  assert.equal(attempts.length, 1, 'a constraint violation must never be retried');
});

test('orderRowsForConcurrentWrite returns a stably ordered copy and leaves the served order alone', () => {
  const served = [{ question_id: 'q-c' }, { question_id: 'q-a' }, { question_id: 'q-b' }, { question_id: 'q-a' }];
  const ordered = orderRowsForConcurrentWrite(served, 'question_id');
  assert.deepEqual(ordered.map((row) => row.question_id), ['q-a', 'q-a', 'q-b', 'q-c']);
  assert.deepEqual(served.map((row) => row.question_id), ['q-c', 'q-a', 'q-b', 'q-a'], 'input untouched');
  assert.equal(ordered[0], served[1], 'rows are the same objects, not copies');
  assert.deepEqual(orderRowsForConcurrentWrite(null, 'question_id'), []);
});

async function preload({ writeFaults = {}, gameId = 'cash-001' } = {}) {
  const db = createInMemorySupabase({ writeFaults });
  const result = await invokeBatchPreload({
    db,
    authUserId: USER_ID,
    query: {
      gameId, level: '1', count: '20', gameMode: 'full', handSelection: 'all',
      difficulty: 'grouped', sessionId: `contention-${randomUUID()}`,
    },
  });
  return { ...result, db };
}

test('route: a deadlock on the canonicalize upsert is retried once and the batch is served', async () => {
  const { response, db, serverLog } = await preload({
    writeFaults: { training_question_cache: [DEADLOCK] },
  });
  assert.equal(response.statusCode, 200, JSON.stringify(response.body).slice(0, 200));
  assert.equal(response.body.questions.length, 20);
  const cacheWrites = db.calls.writes.filter((write) => write.table === 'training_question_cache');
  assert.equal(cacheWrites.length, 2, 'one failed attempt, one successful retry');
  assert.deepEqual(cacheWrites[0].keys, cacheWrites[1].keys, 'the retry resubmits the identical rows');
  assert.ok(serverLog.some((args) => /Lock contention 40P01 \(attempt 1\/3\)/.test(String(args[0]))));
  assert.equal(db.tables.get('training_question_cache').length, 20);
});

test('route: a non-contention database error on the same upsert still answers 503 without a retry', async () => {
  const { response, db } = await preload({
    writeFaults: { training_question_cache: [UNIQUE_VIOLATION] },
  });
  assert.equal(response.statusCode, 503, JSON.stringify(response.body));
  assert.equal(response.body.code, 'TRAINING_PERSISTENCE_UNAVAILABLE');
  assert.equal(response.body.retryable, true);
  assert.equal(db.calls.writes.filter((write) => write.table === 'training_question_cache').length, 1);
  assert.equal((db.tables.get('training_question_cache') || []).length, 0, 'nothing was persisted');
  assert.equal((db.tables.get('training_question_snapshots') || []).length, 0);
});

test('route: canonical rows and immutable snapshots are submitted in one stable key order', async () => {
  const { response, db } = await preload();
  assert.equal(response.statusCode, 200);
  const isSorted = (keys) => keys.every((key, index) => index === 0 || String(keys[index - 1]) <= String(key));
  const cacheWrite = db.calls.writes.find((write) => write.table === 'training_question_cache');
  assert.deepEqual(cacheWrite.onConflict, ['question_id']);
  assert.equal(cacheWrite.keys.length, 20);
  assert.ok(isSorted(cacheWrite.keys), `cache rows not in question_id order: ${cacheWrite.keys.join(',')}`);
  const snapshotWrite = db.calls.writes.find((write) => write.table === 'training_question_snapshots');
  assert.deepEqual(snapshotWrite.onConflict, ['snapshot_key']);
  assert.equal(snapshotWrite.keys.length, 20);
  assert.ok(isSorted(snapshotWrite.keys), 'snapshots not in snapshot_key order');
  // Served order is the attempt manifest's hand order, independent of the
  // write order: hand ordinals stay 1..20 and every served id was persisted.
  const servedIds = response.body.questions.map((question) => question.id);
  assert.equal(new Set(servedIds).size, 20);
  assert.ok(servedIds.every((id) => cacheWrite.keys.includes(id)));
});
