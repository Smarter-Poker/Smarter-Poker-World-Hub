/**
 * Commander Fetch Wrapper
 * Centralized fetch with automatic auth headers & 401 redirect.
 *
 * Usage:
 *   import { commanderFetch } from '@/lib/commander/commanderFetch';
 *   const json = await commanderFetch('/api/commander/tables?venue_id=xxx');
 *   const json = await commanderFetch('/api/commander/cashier', { method: 'POST', body: JSON.stringify(data) });
 *
 * Features:
 * - Automatically injects Authorization + x-staff-session headers
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
    Authorization: `Bearer ${token}`,
    'x-staff-session': staffSession,
    ...opts.headers,
  };

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
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}
