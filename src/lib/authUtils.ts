/* ═══════════════════════════════════════════════════════════════════════════
   BULLETPROOF AUTH UTILITIES — Never call Supabase client getUser() directly
   ═══════════════════════════════════════════════════════════════════════════
   
   This utility provides safe auth methods that bypass the problematic Supabase
   JS client which can throw AbortError on getUser() and refreshSession() calls.
   
   USAGE:
   import { getAuthUser, getAuthToken } from '@/lib/authUtils';
   
   const user = await getAuthUser();
   if (user) { ... }
   
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';

// Storage key used by Supabase client (must match supabase.ts config)
const AUTH_STORAGE_KEY = 'smarter-poker-auth';

// ═══════════════════════════════════════════════════════════════════════════
// [2026-07-25] SUPABASE_URL / SUPABASE_ANON_KEY exports
// Multiple call sites do `import { SUPABASE_ANON_KEY } from '.../authUtils'`.
// next.config.js force-aliases src/lib/authUtils.js -> THIS file, so if these
// constants only live in authUtils.js every bundled import silently resolves
// to `undefined` (regression B-AUTH-EXPORTS-1, resurrected by the alias).
// .trim() is mandatory, not cosmetic: the Vercel prod env values carry a
// literal trailing "\n" that makes fetch() throw on the apikey header.
// ═══════════════════════════════════════════════════════════════════════════
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co').trim();
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo').trim();

/**
 * Get the current authenticated user from localStorage.
 * This bypasses the Supabase client entirely to avoid AbortError.
 * Returns null if not authenticated.
 */
export function getAuthUser() {
    if (typeof window === 'undefined') return null;

    try {
        // Check explicit storage key first
        const explicitAuth = localStorage.getItem(AUTH_STORAGE_KEY);
        if (explicitAuth) {
            const tokenData = JSON.parse(explicitAuth);
            return tokenData?.user || null;
        }

        // Fallback to legacy sb-* keys (for backwards compatibility)
        const sbKeys = Object.keys(localStorage || {}).filter(
            k => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        if (sbKeys.length > 0) {
            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
            return tokenData?.user || null;
        }

        return null;
    } catch (e) {
        console.warn('[authUtils] Error reading auth from localStorage:', e);
        return null;
    }
}

/**
 * Get the user ID synchronously from localStorage.
 * Returns null if not authenticated.
 */
export function getAuthUserId() {
    const user = getAuthUser();
    return user?.id || null;
}

/**
 * Get the access token for authenticated API calls.
 * Returns null if not authenticated.
 */
export function getAccessToken() {
    if (typeof window === 'undefined') return null;

    try {
        const authData = localStorage.getItem(AUTH_STORAGE_KEY);
        if (authData) {
            const tokenData = JSON.parse(authData);
            return tokenData?.access_token || null;
        }

        // Fallback to legacy sb-* keys
        const sbKeys = Object.keys(localStorage || {}).filter(
            k => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        if (sbKeys.length > 0) {
            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
            return tokenData?.access_token || null;
        }

        return null;
    } catch (e) {
        console.warn('[authUtils] Error reading token from localStorage:', e);
        return null;
    }
}

/**
 * Check if user is authenticated.
 * Returns true if logged in, false otherwise.
 */
export function isAuthenticated() {
    return getAuthUser() !== null;
}

/**
 * Get the refresh token for session refresh.
 * Returns null if not available.
 */
export function getRefreshToken() {
    if (typeof window === 'undefined') return null;

    try {
        const authData = localStorage.getItem(AUTH_STORAGE_KEY);
        if (authData) {
            const tokenData = JSON.parse(authData);
            return tokenData?.refresh_token || null;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ SESSION BACKUP / RESTORE — Last line of defense against accidental logout
// ═══════════════════════════════════════════════════════════════════════════
const AUTH_BACKUP_KEY = 'smarter-poker-auth-backup';
const BACKUP_TTL_MS = 30 * 60 * 1000; // 30 minutes — enough to recover from transient failures

/**
 * Backup the current session to a separate localStorage key.
 * Called automatically before clearAuth() so we can recover if needed.
 */
export function backupSession() {
    if (typeof window === 'undefined') return;
    try {
        const current = localStorage.getItem(AUTH_STORAGE_KEY);
        if (current) {
            localStorage.setItem(AUTH_BACKUP_KEY, JSON.stringify({
                session: current,
                timestamp: Date.now(),
            }));
        }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
}

/**
 * Attempt to restore the session from backup.
 * Returns true if restoration succeeded, false otherwise.
 */
export function restoreSessionBackup(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const backup = localStorage.getItem(AUTH_BACKUP_KEY);
        if (!backup) return false;

        const { session, timestamp } = JSON.parse(backup);
        // Only restore if backup is fresh (within TTL)
        if (Date.now() - timestamp > BACKUP_TTL_MS) {
            localStorage.removeItem(AUTH_BACKUP_KEY);
            return false;
        }

        if (session && !localStorage.getItem(AUTH_STORAGE_KEY)) {
            localStorage.setItem(AUTH_STORAGE_KEY, session);
            console.log('[authUtils] 🛡️ Session restored from backup');
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

/**
 * Check if a session backup exists and is still valid.
 */
export function hasSessionBackup(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const backup = localStorage.getItem(AUTH_BACKUP_KEY);
        if (!backup) return false;
        const { timestamp } = JSON.parse(backup);
        return (Date.now() - timestamp) < BACKUP_TTL_MS;
    } catch { return false; }
}

/**
 * Clear all auth data from localStorage.
 * HARDENED: Creates a backup before clearing so we can recover from accidental logouts.
 * Use force=true for sovereign (user-initiated) logout to skip backup.
 */
export function clearAuth(force = false) {
    if (typeof window === 'undefined') return;

    try {
        // Create backup BEFORE clearing (unless force=true sovereign logout)
        if (!force) {
            backupSession();
        } else {
            // Sovereign logout — also destroy the backup
            localStorage.removeItem(AUTH_BACKUP_KEY);
        }

        localStorage.removeItem(AUTH_STORAGE_KEY);
        // Also clear legacy sb-* keys
        const sbKeys = Object.keys(localStorage || {}).filter(
            k => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        sbKeys.forEach(k => localStorage.removeItem(k));
    } catch (e) {
        console.warn('[authUtils] Error clearing auth:', e);
    }
}

/**
 * Save auth session to localStorage (for when login succeeds).
 */
export function saveAuthSession(session: any) {
    if (typeof window === 'undefined' || !session) return;

    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
        console.warn('[authUtils] Error saving auth session:', e);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fresh-token helper for long-lived flows (e.g. live-stream end, large uploads)
// ═══════════════════════════════════════════════════════════════════════════
//
// Problem: getAccessToken() reads from localStorage. If the token has
// expired since the user last interacted (say, mid-way through a long
// stream), the server will 401 on subsequent API calls — exactly the
// "Streamer Unauthorized on Post" symptom Dan reported. supabase.auth
// .refreshSession() is blocked (safeSupabase) because it's prone to
// AbortError, so we refresh by direct fetch against the Supabase auth
// endpoint.
//
// Strategy:
//   1. Decode the current JWT's exp claim. If exp > now + 60s buffer,
//      return the existing token (no refresh needed).
//   2. Otherwise POST to /auth/v1/token?grant_type=refresh_token with
//      the stored refresh_token.
//   3. Save the new session to the same localStorage key the SDK reads
//      from. Subsequent getAccessToken() calls see the fresh token.
//   4. Return the new access_token. On refresh failure (refresh expired,
//      network down) returns null — caller decides what to do.
function decodeJwtExp(token: string): number | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(
            atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
        );
        return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
        return null;
    }
}

// BUG-HUNT-10: Coalesce concurrent refresh calls. Two parallel awaiters
// (e.g. uploadVideo + callEndStream firing in quick succession) would
// otherwise both POST to /auth/v1/token; the second sees a rotated
// refresh_token and 4xx's.
let inFlightRefresh: Promise<string | null> | null = null;

export async function getFreshAccessToken(): Promise<string | null> {
    if (typeof window === 'undefined') return null;

    const current = getAccessToken();
    if (!current) return null;

    // 60-second safety buffer so we don't hand out a token about to expire
    const exp = decodeJwtExp(current);
    if (exp && exp * 1000 > Date.now() + 60_000) {
        return current; // still valid
    }

    if (inFlightRefresh) return inFlightRefresh;

    inFlightRefresh = (async () => {
        const refreshToken = getRefreshToken();
        if (!refreshToken) return null;

        // Module-level SUPABASE_URL / SUPABASE_ANON_KEY are pre-trimmed.
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

        try {
            const resp = await fetch(
                `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
                {
                    method: 'POST',
                    headers: {
                        apikey: SUPABASE_ANON_KEY,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                }
            );
            if (!resp.ok) {
                console.warn('[authUtils] refresh failed:', resp.status);
                return null;
            }
            const session = await resp.json();
            if (!session?.access_token) return null;
            // Persist with the same shape the SDK uses
            saveAuthSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token || refreshToken,
                expires_at: session.expires_at,
                expires_in: session.expires_in,
                user: session.user,
                token_type: session.token_type || 'bearer',
            });
            return session.access_token;
        } catch (e) {
            console.warn('[authUtils] refresh threw:', (e as any)?.message || e);
            return null;
        } finally {
            inFlightRefresh = null;
        }
    })();

    return inFlightRefresh;
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARDS-COMPAT SHIMS
// These exports were removed during a refactor but are still imported by
// 20+ pages. Adding them back as thin aliases prevents webpack import errors.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * getSafeUser — alias for getAuthUser().
 * Returns the current authenticated user or null. Never throws.
 */
export function getSafeUser() {
    return getAuthUser();
}

/**
 * useRequireAuth — React hook for auth-gated pages.
 * Returns { user, checking } — checking is true while verifying auth.
 * Redirects to login with ?redirect= param when unauthenticated.
 * SSG-safe: all side-effects run in useEffect (client-only).
 */
export function useRequireAuth(redirectPath?: string): { user: any; checking: boolean } {
    const [user, setUser] = useState<any>(null);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const currentUser = getAuthUser();
        if (!currentUser && typeof window !== 'undefined') {
            const loginUrl = redirectPath
                ? `/auth/login?redirect=${encodeURIComponent(redirectPath)}`
                : '/auth/login';
            window.location.replace(loginUrl);
        } else {
            setUser(currentUser);
        }
        setChecking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { user, checking };
}

/**
 * ensureAuthReady — async shim for pages that await auth initialization.
 * Our localStorage-based auth is synchronous, so this resolves immediately.
 */
export async function ensureAuthReady(): Promise<void> {
    // localStorage auth is synchronous — no async init needed.
    return;
}

/**
 * authedFetch — convenience wrapper for authenticated API calls.
 * Automatically injects the Authorization header from getAccessToken().
 * Usage: const data = await authedFetch('/api/some-endpoint', { method: 'POST', body: ... });
 */
export async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getAccessToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const resp = await fetch(url, { ...options, headers });

    // [2026-07-25] MFA step-up wiring. middleware.ts answers admin write
    // requests without a fresh mfa_session cookie with
    // 403 { requiresMfa: true }. The original design referenced a global
    // fetch wrapper in src/lib/api.js that never existed, so users hit an
    // unexplained 403 with no path to the challenge page. Handle it here —
    // the one choke point most authed API calls already flow through.
    if (resp.status === 403 && typeof window !== 'undefined') {
        try {
            const peek = await resp.clone().json();
            if (peek && peek.requiresMfa === true) {
                const next = encodeURIComponent(window.location.pathname + window.location.search);
                window.location.assign(`/auth/mfa?stepup=1&next=${next}`);
            }
        } catch { /* non-JSON 403 — fall through to caller */ }
    }
    return resp;
}

/**
 * useAuthUser — React hook returning { user, loading }.
 * Matches the shape in authUtils.js. Cross-tab storage sync included.
 */
export function useAuthUser(): { user: any; loading: boolean } {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setUser(getAuthUser());
        setLoading(false);

        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'smarter-poker-auth' || (e.key?.startsWith('sb-') && e.key?.endsWith('-auth-token'))) {
                setUser(getAuthUser());
            }
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', handleStorage);
            return () => window.removeEventListener('storage', handleStorage);
        }
    }, []);

    return { user, loading };
}

/**
 * getSessionToken — alias for getAccessToken().
 * Used by training components and hooks to authenticate API calls.
 */
export function getSessionToken(): string | null {
    return getAccessToken();
}

/**
 * getAuthToken — alias for getAccessToken().
 * Legacy name referenced in doc comments and some older components.
 */
export function getAuthToken(): string | null {
    return getAccessToken();
}
