import { withRetry } from '../supabaseRetry.js';

export const TRAINING_PERSISTENCE_ERROR_CODE = 'TRAINING_PERSISTENCE_UNAVAILABLE';
export const TRAINING_PERSISTENCE_TIMEOUT_MS = 6000;

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
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const query = queryFactory();
    if (!query || typeof query.abortSignal !== 'function') {
      throw new TypeError('Training persistence query must support abortSignal');
    }
    return await query.abortSignal(controller.signal);
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
  } = options;

  try {
    const result = await withRetry(
      () => runBoundedQuery(queryFactory, timeoutMs),
      { label, maxRetries, baseDelay },
    );
    if (result?.error) throw result.error;
    return result;
  } catch (error) {
    if (isTrainingPersistenceUnavailable(error)) throw error;
    throw new TrainingPersistenceUnavailableError(label, error);
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
