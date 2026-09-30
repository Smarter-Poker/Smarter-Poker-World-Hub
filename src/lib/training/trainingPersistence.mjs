import { withRetry } from '../supabaseRetry.js';

export const TRAINING_PERSISTENCE_ERROR_CODE = 'TRAINING_PERSISTENCE_UNAVAILABLE';
export const TRAINING_PERSISTENCE_TIMEOUT_MS = 6000;

/**
 * Lock-contention SQLSTATEs. Two concurrent preloads of the same game/level
 * upsert the same deterministic question ids; Postgres resolves the resulting
 * lock cycle by aborting one transaction with deadlock_detected (40P01), and
 * a serializable snapshot conflict reports serialization_failure (40001).
 * Both mean "this statement may simply be run again", not "this data is bad".
 */
export const TRAINING_PERSISTENCE_CONTENTION_SQLSTATES = Object.freeze(['40P01', '40001']);
export const TRAINING_PERSISTENCE_CONTENTION_ATTEMPTS = 3;
const CONTENTION_SQLSTATE_SET = new Set(TRAINING_PERSISTENCE_CONTENTION_SQLSTATES);

export function isTrainingPersistenceContention(error) {
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  return CONTENTION_SQLSTATE_SET.has(code);
}

/**
 * Submit rows in one stable key order so two concurrent writers of the same
 * rows acquire their row locks in the same sequence, which removes the
 * classic AB/BA deadlock at its source. Returns a new array; the caller's
 * serving order is untouched.
 */
export function orderRowsForConcurrentWrite(rows, keyColumn) {
  const list = Array.isArray(rows) ? [...rows] : [];
  return list.sort((left, right) => {
    const a = String(left?.[keyColumn] ?? '');
    const b = String(right?.[keyColumn] ?? '');
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export class TrainingPersistenceUnavailableError extends Error {
  constructor(label, cause) {
    super(`${label} is temporarily unavailable`);
    this.name = 'TrainingPersistenceUnavailableError';
    this.code = cause?.code || TRAINING_PERSISTENCE_ERROR_CODE;
    this.trainingCode = TRAINING_PERSISTENCE_ERROR_CODE;
    this.cause = cause;
  }
}

export function isTrainingPersistenceUnavailable(error) {
  return error instanceof TrainingPersistenceUnavailableError
    || error?.trainingCode === TRAINING_PERSISTENCE_ERROR_CODE;
}

async function runBoundedQuery(queryFactory, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Training persistence query timed out after ${timeoutMs}ms`);
      error.name = 'AbortError';
      error.code = 'ABORT_ERR';
      // Abort the real PostgREST fetch, but do not depend on the transport
      // observing that signal: a wedged client must not keep question delivery
      // open forever.
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    const query = queryFactory();
    if (!query || typeof query.abortSignal !== 'function') {
      throw new TypeError('Training persistence query must support abortSignal');
    }
    return await Promise.race([
      query.abortSignal(controller.signal),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run one Training database operation with a hard per-attempt deadline.
 * Query factories are recreated for each retry so an aborted PostgREST builder
 * is never reused. Any final database error is thrown and must fail the route
 * closed before a question is served or an answer is acknowledged.
 */
export async function runTrainingPersistenceQuery(queryFactory, options = {}) {
  const {
    label = 'TrainingPersistence',
    timeoutMs = TRAINING_PERSISTENCE_TIMEOUT_MS,
    maxRetries = 1,
    baseDelay = 250,
    // Lock contention is retried in-request, bounded, with jitter so the two
    // colliding writers do not collide again on the same tick. Any other
    // database error still fails closed exactly as before.
    contentionAttempts = TRAINING_PERSISTENCE_CONTENTION_ATTEMPTS,
    contentionBaseDelayMs = 40,
    random = Math.random,
  } = options;
  const attempts = Math.max(1, Math.min(Number(contentionAttempts) || 1, TRAINING_PERSISTENCE_CONTENTION_ATTEMPTS));

  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await withRetry(
        () => runBoundedQuery(queryFactory, timeoutMs),
        { label, maxRetries, baseDelay },
      );
      if (result?.error) throw result.error;
      return result;
    } catch (error) {
      if (isTrainingPersistenceUnavailable(error)) throw error;
      if (isTrainingPersistenceContention(error) && attempt < attempts) {
        const delay = Math.round(contentionBaseDelayMs * attempt * (1 + random()));
        console.warn(
          `[${label}] Lock contention ${String(error?.code || error?.cause?.code)} `
          + `(attempt ${attempt}/${attempts}), retrying in ${delay}ms`,
        );
        await sleep(delay);
        continue;
      }
      throw new TrainingPersistenceUnavailableError(label, error);
    }
  }
}

export function trainingPersistenceUnavailableBody() {
  return {
    success: false,
    error: 'Training data is temporarily unavailable. Please retry this hand.',
    code: TRAINING_PERSISTENCE_ERROR_CODE,
    retryable: true,
  };
}
