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

export default fetchWithSignal;
