/**
 * useOperatorFetch - the one authorized fetch for the /horses console.
 *
 * Wraps the pattern pages/horses/index.js has always used (bearer token from
 * getFreshAccessToken, JSON in and out, never call res.json() blind on an HTML
 * error page) and adds the two things it was missing:
 *
 *   1. An AbortController per call, all of them aborted on unmount. There was
 *      no cancellation anywhere in this console: switching tabs mid-flight
 *      landed a response into a panel that no longer existed.
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
    // getFreshAccessToken reads the token out of storage and only hits the
    // network when it is close to expiry. The argument-less client session
    // read is banned repo-wide (pre-commit CHECK C).
    const token = await getFreshAccessToken();
    if (!token) throw new Error('Session Expired. Please Sign In Again.');

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller) controllersRef.current.add(controller);

    try {
      const res = await fetch(url, {
        ...options,
        signal: options.signal || (controller ? controller.signal : undefined),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      const body = await readJsonBody(res);
      if (!res.ok) throw operatorError(body, res.status);
      if (body.success === false) throw operatorError(body, res.status);
      return body;
    } finally {
      if (controller) controllersRef.current.delete(controller);
    }
  }, []);
}
