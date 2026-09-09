export const TRAINING_REQUEST_TIMEOUT_MS = 15000;

const BOUNDED_TRAINING_API_PREFIXES = Object.freeze([
  '/api/training/',
  '/api/gto/',
  '/api/jarvis/',
]);

// Existing critical consumers already wrap authedFetch with this transport.
// Track those in-flight signals so the central auth boundary can reuse the
// outer deadline instead of stacking a second timer and draining two clones.
const activeTrainingDeadlineSignals = new WeakSet();

export function isBoundedTrainingApiUrl(input) {
  return typeof input === 'string'
    && BOUNDED_TRAINING_API_PREFIXES.some((prefix) => input.startsWith(prefix));
}

export function trainingDeadlineIsActive(signal) {
  return Boolean(signal && activeTrainingDeadlineSignals.has(signal));
}

export const TRAINING_TIMEOUT_MESSAGE =
  'The Training Request Timed Out. No Result Was Assumed. Please Retry.';

function trainingTimeoutError() {
  const error = new Error(TRAINING_TIMEOUT_MESSAGE);
  error.name = 'TrainingTimeoutError';
  error.code = 'TRAINING_REQUEST_TIMEOUT';
  return error;
}

function callerAbortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('The Training request was cancelled.');
  error.name = 'AbortError';
  return error;
}

/**
 * Apply one end-to-end deadline to an authenticated Training request. Native
 * fetch resolves after headers, so the response clone is drained before the
 * deadline is released. The caller receives the untouched original Response.
 * A rejecting deadline also bounds token-refresh work inside authedFetch.
 */
export async function boundedTrainingFetch(
  input,
  init = {},
  timeoutMs = TRAINING_REQUEST_TIMEOUT_MS,
  requestImpl = fetch,
) {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let abortSource = null;
  let rejectDeadline;

  const deadline = new Promise((_, reject) => {
    rejectDeadline = reject;
  });

  const forwardAbort = () => {
    if (abortSource) return;
    abortSource = 'caller';
    controller.abort();
    rejectDeadline(callerAbortError(upstreamSignal));
  };
  if (upstreamSignal?.aborted) forwardAbort();
  else upstreamSignal?.addEventListener?.('abort', forwardAbort, { once: true });

  const timer = abortSource ? null : setTimeout(() => {
    if (abortSource) return;
    abortSource = 'timeout';
    controller.abort();
    rejectDeadline(trainingTimeoutError());
  }, timeoutMs);

  activeTrainingDeadlineSignals.add(controller.signal);
  try {
    if (abortSource === 'caller') return await deadline;
    const request = (async () => {
      const response = await requestImpl(input, { ...init, signal: controller.signal });
      await response.clone().arrayBuffer();
      return response;
    })();
    return await Promise.race([request, deadline]);
  } catch (error) {
    if (abortSource === 'timeout') throw trainingTimeoutError();
    throw error;
  } finally {
    activeTrainingDeadlineSignals.delete(controller.signal);
    if (timer) clearTimeout(timer);
    upstreamSignal?.removeEventListener?.('abort', forwardAbort);
  }
}

export function createBoundedTrainingFetch(
  requestImpl,
  timeoutMs = TRAINING_REQUEST_TIMEOUT_MS,
) {
  return (input, init = {}) => boundedTrainingFetch(input, init, timeoutMs, requestImpl);
}

export default boundedTrainingFetch;
