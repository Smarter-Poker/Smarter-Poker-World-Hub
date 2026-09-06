export const COMMERCE_REQUEST_TIMEOUT_MS = 20000;

export const COMMERCE_TIMEOUT_MESSAGE =
  'Secure Commerce Request Timed Out. No Result Was Assumed. Retry The Same Purchase.';

/**
 * Bound a customer or operator commerce request without changing its durable
 * request identity. The server may finish after the browser disconnects, so a
 * timeout must never be presented as a failed settlement. Callers retain their
 * existing idempotency key and safely replay the exact request.
 */
export async function boundedCommerceFetch(
  input,
  init = {},
  timeoutMs = COMMERCE_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let timedOut = false;

  const forwardAbort = () => controller.abort();
  if (upstreamSignal?.aborted) controller.abort();
  else upstreamSignal?.addEventListener?.('abort', forwardAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(COMMERCE_TIMEOUT_MESSAGE);
      timeoutError.name = 'CommerceTimeoutError';
      timeoutError.code = 'COMMERCE_REQUEST_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener?.('abort', forwardAbort);
  }
}

export default boundedCommerceFetch;
