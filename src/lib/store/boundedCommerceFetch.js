export const COMMERCE_REQUEST_TIMEOUT_MS = 20000;

export const COMMERCE_TIMEOUT_MESSAGE =
  'Secure Commerce Request Timed Out. No Result Was Assumed. Retry The Same Purchase.';

function commerceTimeoutError() {
  const error = new Error(COMMERCE_TIMEOUT_MESSAGE);
  error.name = 'CommerceTimeoutError';
  error.code = 'COMMERCE_REQUEST_TIMEOUT';
  return error;
}

function callerAbortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

/**
 * Bound a customer or operator commerce request without changing its durable
 * request identity. The server may finish after the browser disconnects, so a
 * timeout must never be presented as a failed settlement. Callers retain their
 * existing idempotency key and safely replay the exact request. `requestImpl`
 * lets authenticated fetch wrappers keep their token-refresh behavior while
 * this helper owns the end-to-end transport deadline.
 */
export async function boundedCommerceFetch(
  input,
  init = {},
  timeoutMs = COMMERCE_REQUEST_TIMEOUT_MS,
  requestImpl = fetch
) {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let abortSource = null;
  let rejectDeadline;

  // A signal alone cannot guarantee a deadline when a wrapper is doing work
  // between fetches (for example, refreshing an expired auth token). Racing a
  // rejecting promise makes the caller terminal even if that wrapper is slow
  // to observe the abort. The underlying request is still aborted so the
  // browser can release its network and response-body resources.
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
    rejectDeadline(commerceTimeoutError());
  }, timeoutMs);

  try {
    if (abortSource === 'caller') return await deadline;

    const request = (async () => {
      const response = await requestImpl(input, { ...init, signal: controller.signal });

      // fetch() resolves when response headers arrive, not when its body has
      // finished. Drain a clone while the deadline is active so a stalled JSON
      // payload cannot strand a purchase or fulfillment surface. Callers still
      // receive the untouched original Response and can consume it normally.
      await response.clone().arrayBuffer();
      return response;
    })();

    return await Promise.race([request, deadline]);
  } catch (error) {
    if (abortSource === 'timeout') throw commerceTimeoutError();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    upstreamSignal?.removeEventListener?.('abort', forwardAbort);
  }
}

export default boundedCommerceFetch;
