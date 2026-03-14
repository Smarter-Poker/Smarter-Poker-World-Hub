/**
 * Commander Fetch Wrapper
 * Centralized fetch with automatic auth headers & 401 redirect.
 *
 * Usage:
 *   import { commanderFetch, commanderFetchJSON } from '@/lib/commander/commanderFetch';
 *
 *   // Raw response (caller handles .json()):
 *   const res = await commanderFetch('/api/commander/tables?venue_id=xxx');
 *
 *   // Auto-parsed JSON with !ok error throwing:
 *   const data = await commanderFetchJSON('/api/commander/cashier', { method: 'POST', body: JSON.stringify(payload) });
 *
 * Features:
 * - Automatically injects Authorization + x-staff-session headers
 * - Auto-adds Content-Type: application/json on POST/PUT/PATCH (when body is present)
 * - Skips Authorization header if token is empty (PIN-based terminal staff)
 * - On 401 response, redirects to /commander/login with session-expired message
 * - Merges caller-provided headers (caller headers take precedence)
 * - Returns the raw Response object (caller handles .json())
 */
import { getToken, getStaffSession } from './clientAuth';

/**
 * Fetch wrapper that auto-injects Commander auth headers.
 * @param {string} url - API URL
 * @param {RequestInit} [opts] - Standard fetch options
 * @returns {Promise<Response>}
 */
export async function commanderFetch(url, opts = {}) {
  const token = getToken();
  const staffSession = getStaffSession();

  const mergedHeaders = {
    'x-staff-session': staffSession,
    ...opts.headers,
  };

  // Only add Authorization if we actually have a token (PIN staff won't)
  if (token) {
    mergedHeaders['Authorization'] = mergedHeaders['Authorization'] || `Bearer ${token}`;
  }

  // Auto-add Content-Type for mutation methods with body
  const method = (opts.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH'].includes(method) && opts.body && !mergedHeaders['Content-Type']) {
    mergedHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...opts, headers: mergedHeaders });

  // 401 = token expired or invalid → redirect to login
  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      // Store the current page so login can redirect back
      try { sessionStorage.setItem('commander_return_url', window.location.pathname); } catch {}
      window.location.href = '/commander/login?expired=1';
    }
    // Still throw so the caller's catch block fires
    throw new Error('Session expired — redirecting to login');
  }

  return response;
}

/**
 * Convenience: commanderFetch + auto-parse JSON + throw on !ok.
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<any>} parsed JSON
 */
export async function commanderFetchJSON(url, opts = {}) {
  const res = await commanderFetch(url, opts);
  if (!res.ok) {
    let errorMsg = `Request failed (${res.status})`;
    try { const body = await res.json(); errorMsg = body?.error?.message || body?.error || errorMsg; } catch {}
    throw new Error(errorMsg);
  }
  return res.json();
}
