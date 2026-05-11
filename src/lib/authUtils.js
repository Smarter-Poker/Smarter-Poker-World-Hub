/**
 * ════════════════════════════════════════════════════════════════════════
 *  Dan-fix/build-unblock: re-export real authUtils + back-compat shims
 * ════════════════════════════════════════════════════════════════════════
 *
 * Webpack resolves `.js` before `.ts` for ambiguous imports like
 *   `import { getSafeUser } from '../../src/lib/authUtils'`
 * so this `.js` is the file ~20 consumer pages actually load. The previous
 * 136-byte stub re-exported from `@smarter-poker/commander-shared/lib/authUtils`,
 * a path that no longer resolves cleanly AND doesn't export the symbols
 * the consumers need. Result: production was stuck on SHA 118e3fcff for hours
 * because every new build errored with:
 *   Attempted import error: 'getSafeUser' is not exported...
 *   Attempted import error: 'useRequireAuth' is not exported...
 *   Attempted import error: 'ensureAuthReady' is not exported...
 *
 * Fix: re-export the real primitives from authUtils.ts and provide thin
 * back-compat shims for the legacy names that consumers still import.
 * All shims are no-arg compatible with the original surface area.
 */

import { useEffect, useState } from 'react';
import {
  getAuthUser,
  getAuthUserId,
  getAccessToken,
  isAuthenticated,
  getRefreshToken,
  backupSession,
  restoreSessionBackup,
  hasSessionBackup,
  clearAuth,
  saveAuthSession,
  getFreshAccessToken,
} from './authUtils.ts';

export {
  getAuthUser,
  getAuthUserId,
  getAccessToken,
  isAuthenticated,
  getRefreshToken,
  backupSession,
  restoreSessionBackup,
  hasSessionBackup,
  clearAuth,
  saveAuthSession,
  getFreshAccessToken,
};

// Back-compat aliases — names still imported by ~20 pages and components.
export const getSafeUser = getAuthUser;
export const getSessionToken = getAccessToken;
export const getAuthToken = getAccessToken;

export function useAuthUser() {
  return getAuthUser();
}

export async function ensureAuthReady(_sbClient) {
  return getAuthUser();
}

export async function authedFetch(input, init = {}) {
  const token = getAccessToken();
  const headers = {
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(input, { ...init, headers });
}

export function useRequireAuth() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const u = getAuthUser();
    if (!u) {
      if (typeof window !== 'undefined') {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/auth/login?redirect=${redirect}`;
      }
      setChecking(false);
      return;
    }
    setUser(u);
    setChecking(false);
  }, []);
  return { user, checking };
}

const _default = {
  getAuthUser,
  getAuthUserId,
  getAccessToken,
  isAuthenticated,
  getRefreshToken,
  backupSession,
  restoreSessionBackup,
  hasSessionBackup,
  clearAuth,
  saveAuthSession,
  getFreshAccessToken,
  getSafeUser,
  useAuthUser,
  getSessionToken,
  getAuthToken,
  ensureAuthReady,
  authedFetch,
  useRequireAuth,
};
export default _default;
