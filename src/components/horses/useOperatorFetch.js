/**
 * useOperatorFetch - the one authorized fetch for the /horses console.
 *
 * Wraps the pattern pages/horses/index.js has always used (bearer token from
 * getFreshAccessToken, JSON in and out, never call res.json() blind on an HTML
 * error page) and adds the two things it was missing:
 *
 *   1. An AbortController per call, all of them aborted on unmount, plus a
 *      deadline on every call. There was no cancellation and no bound anywhere
 *      in this console: switching tabs mid-flight landed a response into a panel
 *      that no longer existed, and a hung read left a panel spinning for ever
 *      with no error and no retry. See withRequestTimeout below.
 *   2. The operator envelope surfaced. Every /horses route now answers
 *      { success, error, code, requestId } (docs/horses/PHASE1-CONTRACTS.md),
 *      so a thrown Error carries `.code` and `.requestId` and the operator can
 *      quote the request id when something is wrong.
 *
 * The returned function has the same call signature the console already used,
 * so it is a drop-in for the old authFetch.
 */
import { useCallback, useEffect, useRef } from 'react';
import { getFreshAccessToken } from '../../lib/authUtils';

/** Read a JSON body without exploding on an HTML error page. */
export async function readJsonBody(res) {
  try { return await res.json(); } catch { return {}; }
}

/** Build the Error the console throws, carrying the envelope fields. */
export function operatorError(body, status) {
  const err = new Error(
    (body && body.error) || (status ? `Request Failed (${status})` : 'Request Failed')
  );
  if (body && body.code) err.code = body.code;
  if (body && body.requestId) err.requestId = body.requestId;
  if (status) err.status = status;
  return err;
}

/**
 * The default deadline for one operator request, in milliseconds.
 *
 * The slowest healthy read in this console is the integrity queue at roughly
 * three seconds against production data, and a hand search over a long history
 * sits in the same range, so a five second bound would abort work that is merely
 * slow and teach operators to distrust the warning. 30000 is an order of
 * magnitude above the slowest healthy read, so it never fires on real latency,
 * and it is still well under the point at which an operator gives up on a
 * spinner and reloads the page. A caller with a heavier read passes `timeoutMs`.
 */
export const OPERATOR_TIMEOUT_MS = 30000;

/** The error a blown deadline produces. A timeout is not a server answer. */
export function timeoutError(timeoutMs) {
  const ms = Number(timeoutMs);
  const seconds = Math.round(ms / 1000);
  const bound = ms >= 1000 ? `${seconds} Second${seconds === 1 ? '' : 's'}` : `${Math.round(ms)}ms`;
  const err = new Error(
    `No Answer Within ${bound}. This Console Cancelled The Request, The Server Did Not Refuse It, So Nothing Above Is Confirmed Either Way. Try Again.`
  );
  err.name = 'TimeoutError';
  err.code = 'CLIENT_TIMEOUT';
  err.timeout = true;
  err.timeoutMs = ms;
  return err;
}

/** The error a cancellation produces, shaped like the runtime's own. */
function cancelledError() {
  const err = new Error('The Request Was Cancelled');
  err.name = 'AbortError';
  return err;
}

/** True for a deadline, false for a server error and for an unmount cancel. */
export function isTimeoutError(err) {
  return Boolean(err && (err.timeout === true || err.code === 'CLIENT_TIMEOUT'));
}

/**
 * Run one request under a deadline that covers the WHOLE round trip.
 *
 * The obvious version of this has the right shape and the wrong extent: arm a
 * timer, call fetch, clear the timer in a finally around the fetch alone, then
 * read the body. That bounds only the response headers. A server that sends 200
 * and then stalls the body is not bounded by it at all, and the page hangs for
 * ever exactly as it did without a timer. Here `run` receives the signal and is
 * expected to read the body inside it, and the timer is cleared only in
 * `finally`, after `run` has fully settled, so a stalled body trips the same
 * deadline a stalled header does.
 *
 * `signals` are the caller's own controllers: the unmount set below, a page that
 * has been superseded, whatever the call site already had. They are forwarded
 * into the deadline's controller, so unmount cancellation keeps working exactly
 * as it did, and a cancelled request still surfaces as AbortError rather than
 * being mislabelled a timeout.
 */
export async function withRequestTimeout(run, { timeoutMs, signals = [] } = {}) {
  const requested = Number(timeoutMs);
  const ms = Number.isFinite(requested) && requested > 0 ? requested : OPERATOR_TIMEOUT_MS;
  const outer = (Array.isArray(signals) ? signals : [signals]).filter(Boolean);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;

  // No AbortController in this environment: run unbounded rather than pretend to
  // a bound that cannot be enforced.
  if (!controller) return run(outer.length ? outer[0] : undefined);

  // Already cancelled before this call began. Opening the request would only
  // reject with the same AbortError, so do not open it, and do not leave a
  // caller that never inspects its signal waiting on a request nobody wants.
  if (outer.some((signal) => signal.aborted === true)) throw cancelledError();

  let timedOut = false;
  const abort = () => { try { controller.abort(); } catch { /* already settled */ } };
  for (const signal of outer) {
    if (typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', abort, { once: true });
    }
  }

  const timer = setTimeout(() => { timedOut = true; abort(); }, ms);
  try {
    return await run(controller.signal);
  } catch (err) {
    // The deadline fired, so this AbortError is ours. Report it as a timeout,
    // which an operator can tell apart from a 500 and from their own navigation.
    if (timedOut) throw timeoutError(ms);
    throw err;
  } finally {
    clearTimeout(timer);
    for (const signal of outer) {
      if (typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', abort);
    }
  }
}

export default function useOperatorFetch() {
  const controllersRef = useRef(new Set());
  const aliveRef = useRef(true);

  useEffect(() => {
    const controllers = controllersRef.current;
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      for (const controller of controllers) {
        try { controller.abort(); } catch { /* already settled */ }
      }
      controllers.clear();
    };
  }, []);

  return useCallback(async (url, options = {}) => {
    const { isCurrent, timeoutMs, ...fetchOptions } = options;
    const checkScope = () => {
      if (isCurrent && isCurrent() !== true) throw new Error('The account or view changed. Refresh the original operation.');
    };
    checkScope();
    // getFreshAccessToken reads the token out of storage and only hits the
    // network when it is close to expiry. The argument-less client session
    // read is banned repo-wide (pre-commit CHECK C).
    const token = await getFreshAccessToken();
    checkScope();
    if (!token) throw new Error('Session Expired. Please Sign In Again.');

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller) controllersRef.current.add(controller);

    try {
      return await withRequestTimeout(async (signal) => {
        const res = await fetch(url, {
          ...fetchOptions,
          signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
          },
        });
        // Deliberately inside the armed window. Headers are not an answer, so
        // the deadline is not satisfied until the body has been read.
        const body = await readJsonBody(res);
        checkScope();
        if (!res.ok) throw operatorError(body, res.status);
        if (body.success === false) throw operatorError(body, res.status);
        return body;
      }, {
        timeoutMs,
        // The unmount controller and any signal the caller already had both keep
        // cancelling. The deadline is added to them, not put in their place.
        signals: [controller ? controller.signal : null, options.signal],
      });
    } finally {
      if (controller) controllersRef.current.delete(controller);
    }
  }, []);
}
