/* ═══════════════════════════════════════════════════════════════════════════
   API FETCH UTILITIES
   AbortController-aware fetch helpers that prevent state updates on
   unmounted components and eliminate "Can't perform a React state update
   on an unmounted component" warnings.

   Usage in useEffect:
     const { signal, cleanup } = createSignal();
     useEffect(() => {
       fetchWithSignal('/api/my-endpoint', { signal }).then(data => {
         if (!signal.aborted) setState(data);
       });
       return cleanup;
     }, [deps]);
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Creates an AbortController and returns signal + cleanup function.
 * Use the cleanup as the useEffect return value.
 */
export function createSignal() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    cleanup: () => controller.abort(),
  };
}

/**
 * Fetch wrapper that includes the abort signal and throws on non-OK responses.
 */
export async function fetchWithSignal(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = new Error(`API ${res.status}: ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Fetch with auth token included.
 * Pass the Supabase access token as the second argument.
 */
export async function fetchWithAuth(url, token, options = {}) {
  return fetchWithSignal(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

/**
 * [Phase 6.1.23] MFA-aware fetch wrapper.
 *
 * If the server responds 403 with { requiresMfa: true }, we route the user
 * to /auth/mfa?next=<current-path> before rejecting. Callers get a typed
 * Error back with `.requiresMfa = true` so they can avoid double-handling.
 *
 * Usage:
 *   try {
 *     const data = await fetchWithMfa('/api/admin/pause-table', token, {
 *       method: 'POST', body: JSON.stringify({ tableId }),
 *     });
 *   } catch (err) {
 *     if (err.requiresMfa) return; // redirect already in flight
 *     // handle other errors
 *   }
 */
export async function fetchWithMfa(url, token, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 403) {
    const json = await res.clone().json().catch(() => ({}));
    if (json && json.requiresMfa) {
      if (typeof window !== 'undefined') {
        const next = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        window.location.href = `/auth/mfa?next=${next}`;
      }
      const err = new Error('MFA challenge required');
      err.status = 403;
      err.requiresMfa = true;
      throw err;
    }
  }

  if (!res.ok) {
    const err = new Error(`API ${res.status}: ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export default fetchWithSignal;
