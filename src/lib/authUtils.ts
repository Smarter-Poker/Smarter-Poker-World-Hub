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
import { resolveAnonKey, anonKeyWarning } from './supabaseKeys';
import {
    boundedTrainingFetch,
    isBoundedTrainingApiUrl,
    trainingDeadlineIsActive,
    TRAINING_REQUEST_TIMEOUT_MS,
} from './training/boundedTrainingFetch';

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
//
// [2026-08-03] The anon key has NO hardcoded fallback any more. The old
// literal was a committed secret AND the project signing key has since been
// rotated, so falling back to it produced "Invalid Compact JWS" style errors
// instead of one clear config error. This module is imported by browser code
// at module scope, so a missing env var must not throw here (that would white
// screen the whole app) — we export an empty string and log once, loudly.
//
// [2026-08-16] SUPERSEDES the 2026-08-03 note above. The env var itself held
// the REVOKED legacy anon JWT, and because NEXT_PUBLIC_* is inlined at build
// time that dead key was compiled straight into the client bundle (6 copies in
// the shipped JS); Supabase answered every request carrying it with
// 401 {"message":"Legacy API keys are disabled"}. Reading the env var raw here
// is what let it through, so the key is now resolved through ./supabaseKeys —
// resolveAnonKey() substitutes the publishable key whenever the configured
// value is legacy-format or empty, which means a legacy value in the
// environment can no longer reach the browser. (.trim() semantics are
// preserved: resolveAnonKey trims the configured value itself.)
// Note this file SHADOWS src/lib/authUtils.js under Next's module resolution
// (.ts is tried before .js), which is why the same fix applied to the .js
// never shipped. This is a guard, not the fix: NEXT_PUBLIC_SUPABASE_ANON_KEY
// still has to be corrected at source.
// ═══════════════════════════════════════════════════════════════════════════
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co').trim();
const _anonResolved = resolveAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const SUPABASE_ANON_KEY = _anonResolved.key;
const _anonWarning = anonKeyWarning(_anonResolved.source);
if (_anonWarning) {
    console.warn(_anonWarning);
}

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
 *
 * ONLY login flows may call this. It is NOT a refresh helper: writing a
 * partially-shaped session here (see the 2026-09-01 note on
 * getFreshAccessToken below) is what produced
 * `crypto: refresh token length is not valid` in production.
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
// "Streamer Unauthorized on Post" symptom Dan reported.
//
// ── 2026-09-01: THIS FUNCTION NO LONGER REFRESHES BY HAND. ────────────────
//
// It used to POST directly to
//     ${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token
// with the stored refresh_token, then write the response back into the shared
// 'smarter-poker-auth' key via saveAuthSession({ ...six fields... }).
//
// That was refresh path #2 of FIVE concurrent refreshers in this estate, and
// it was the worst of them, for two independent reasons:
//
//   1. IT BYPASSED THE WEB LOCK. The Supabase SDK serialises refreshes across
//      tabs and across the Hub/Club-Arena split with navigator.locks. A raw
//      fetch() acquires nothing. Supabase refresh tokens ROTATE — the stored
//      value dies the instant any refresh succeeds — so this POST regularly
//      presented a token another refresher had already spent, producing
//      `Invalid Refresh Token: Refresh Token Not Found` (4,016 in 24h).
//
//   2. IT PERSISTED A PARTIAL SESSION. The saveAuthSession() call reconstructed
//      the session object from six hand-picked fields and clobbered whatever
//      the SDK had written. Anything the SDK expected but this shape omitted
//      was silently dropped, and a truncated/absent refresh_token in the shared
//      key is the likely source of `crypto: refresh token length is not valid`
//      (1,040 in 24h).
//
// ALL REFRESHING NOW GOES THROUGH THE SDK. `supabase.auth.getSession()`
// refreshes when the token is near expiry, does it under the Web Lock, and
// persists the FULL session itself. Do not hand-roll this again — a second
// refresher sharing one rotating token is a race, not a fallback.
//
// Strategy retained:
//   1. Decode the current JWT's exp claim. If exp > now + 60s buffer,
//      return the existing token (no refresh, no network call at all).
//   2. Otherwise ask the SDK for the session and hand back its access_token.
//   3. Return null if the SDK cannot produce one — caller decides what to do.
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
// otherwise both drive a refresh; the second sees a rotated refresh_token
// and 4xx's. The SDK's Web Lock now serialises across tabs — this wrapper
// still collapses the in-tab burst before it ever reaches the lock.
let inFlightRefresh: Promise<string | null> | null = null;

export async function getFreshAccessToken(): Promise<string | null> {
    if (typeof window === 'undefined') return null;

    const current = getAccessToken();
    if (!current) return null;

    // 60-second safety buffer so we don't hand out a token about to expire
    const exp = decodeJwtExp(current);
    if (exp && exp * 1000 > Date.now() + 60_000) {
        return current; // still valid — no SDK call, no network
    }

    if (inFlightRefresh) return inFlightRefresh;

    inFlightRefresh = (async () => {
        try {
            // getSession() refreshes when near expiry, under the Web Lock, and
            // writes the complete session back to storage itself. This is the
            // ONLY sanctioned refresh path in this module.
            const { supabase: sb } = await import('./supabase');
            const { data } = await sb.auth.getSession();
            return data?.session?.access_token ?? null;
        } catch (e) {
            console.warn('[authUtils] getFreshAccessToken failed:', (e as any)?.message || e);
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
 *
 * ── 2026-09-01 ────────────────────────────────────────────────────────────
 * This hook used to do ONE synchronous getAuthUser() read and, if it came
 * back empty, immediately `window.location.replace()` to /auth/login.
 *
 * That single read races the SDK's token refresh. During a refresh the shared
 * 'smarter-poker-auth' key is briefly absent, so a page mounting in that
 * window saw "no user" for a perfectly valid session — and a hard
 * location.replace() is unrecoverable: it tears down the tab before the
 * session can settle, taking any in-progress UI state with it. With five
 * concurrent refreshers racing one rotating token, that window was open far
 * more often than it should have been, and every open tab bounced to
 * /auth/login?redirect= .
 *
 * It now goes through ensureAuthReady() (defined below in this same file),
 * which layers: immediate read -> supabase getSession() -> 300ms wait +
 * retry -> session-backup restore. We redirect ONLY when that whole chain
 * resolves null, i.e. when the user really is signed out.
 */
export function useRequireAuth(redirectPath?: string): { user: any; checking: boolean } {
    const [user, setUser] = useState<any>(null);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                // Pass the Supabase client so ensureAuthReady can use its
                // getSession() layer. A failed dynamic import must not crash
                // the guard — fall back to the synchronous-only layers.
                let resolved: any = null;
                try {
                    const { supabase: sb } = await import('./supabase');
                    resolved = await ensureAuthReady(sb);
                } catch (err: any) {
                    console.warn('[useRequireAuth] supabase import failed, degrading to local-only check:', err?.message || err);
                    resolved = await ensureAuthReady();
                }

                if (cancelled) return;

                if (resolved?.id) {
                    setUser(resolved);
                } else if (typeof window !== 'undefined') {
                    // Every recovery layer came back empty — genuinely signed out.
                    const loginUrl = redirectPath
                        ? `/auth/login?redirect=${encodeURIComponent(redirectPath)}`
                        : '/auth/login';
                    window.location.replace(loginUrl);
                }
            } finally {
                // `checking` stays true for the whole async check so consumers
                // keep showing their skeleton instead of flashing signed-out UI.
                if (!cancelled) setChecking(false);
            }
        })();

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { user, checking };
}

/**
 * ensureAuthReady — async shim for pages that await auth initialization.
 * Our localStorage-based auth is synchronous, so this resolves immediately.
 */
/**
 * RESILIENT AUTH GATE — wait for auth to stabilise before deciding to redirect.
 *
 * USE THIS for page-level auth guards. Unlike getAccessToken(), which is a
 * one-shot localStorage read that races with Supabase SDK token refresh, this
 * waits for the session to settle first.
 *
 *   const user = await ensureAuthReady(supabase);
 *   if (!user) router.push('/auth/login');
 *
 * ── 2026-08-12 audit, finding C-8 ────────────────────────────────────────
 * This function previously read, in its entirety:
 *
 *     export async function ensureAuthReady(): Promise<void> {
 *         // localStorage auth is synchronous — no async init needed.
 *         return;
 *     }
 *
 * It returned `undefined`. Meanwhile src/lib/authUtils.js carries the real
 * five-layer implementation and RETURNS THE USER, and next.config.js aliases
 * authUtils.js -> authUtils.ts (added so consumers could reach
 * getFreshAccessToken, which only exists here). So every caller resolved to
 * THIS stub.
 *
 * Six call sites branch directly on the return value:
 *   pages/hub/commander/home-games/index.js:163,240
 *   pages/hub/commander/home-games/create.js:128,368
 *   pages/hub/commander/tournaments/index.js:149
 *   pages/hub/messenger.js:583
 *   pages/hub/social-media/index.js:9097
 * Each did `const authUser = await ensureAuthReady(supabase); if (!authUser)`
 * and therefore treated every signed-in user as signed out — which is why
 * "Join by Code" and the Commander group cards bounced authenticated users
 * to /auth/login.
 *
 * The alias is correct and stays; the stub was the bug. This now mirrors the
 * authUtils.js contract so both files behave identically.
 *
 * @param supabaseClient optional Supabase client. Without it, only the
 *        synchronous localStorage layers run (still correct, just less
 *        resilient during a token refresh).
 * @returns the authenticated user object, or null.
 */
export async function ensureAuthReady(supabaseClient?: any): Promise<any | null> {
    // 1. Immediate localStorage check (instant, no network).
    const immediate = getAuthUser();
    if (immediate?.id) return immediate;

    // 2. Let the Supabase SDK resolve its session (handles refresh cycles).
    if (supabaseClient?.auth?.getSession) {
        try {
            const { data } = await supabaseClient.auth.getSession();
            if (data?.session?.user) return data.session.user;
        } catch (err: any) {
            console.warn('[authUtils] getSession failed:', err?.message || err);
        }
    }

    // 3. Brief wait then retry — the SDK may write to storage asynchronously
    //    after getSession() resolves.
    await new Promise((r) => setTimeout(r, 300));
    const retried = getAuthUser();
    if (retried?.id) return retried;

    // 4. Session backup recovery — restores if the primary entry was corrupted.
    try {
        if (restoreSessionBackup()) {
            const backupUser = getAuthUser();
            if (backupUser?.id) {
                console.debug('[authUtils] session recovered from backup');
                return backupUser;
            }
        }
    } catch (err: any) {
        console.warn('[authUtils] session backup restore failed:', err?.message || err);
    }

    return null;
}

/**
 * authedFetch — convenience wrapper for authenticated API calls.
 * Automatically injects the Authorization header from getAccessToken().
 * Usage: const data = await authedFetch('/api/some-endpoint', { method: 'POST', body: ... });
 */
async function performAuthedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getAccessToken();
    const headers = new Headers(options.headers || {});
    if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    let resp = await fetch(url, { ...options, headers });

    // Keep the TypeScript entry point in parity with authUtils.js. Training's
    // TS/TSX surfaces resolve this file, while JS surfaces resolve the sibling
    // module; without the same one-shot refresh behavior, a Level Selector or
    // analytics panel could fail with a stale token even though the arena
    // recovered successfully moments later.
    if (resp.status === 401 && token) {
        try {
            const { supabase: sb } = await import('./supabase');
            const { data } = await sb.auth.refreshSession();
            const refreshedToken = data?.session?.access_token;
            if (refreshedToken) {
                const retryHeaders = new Headers(options.headers || {});
                if (options.body && typeof options.body === 'string' && !retryHeaders.has('Content-Type')) {
                    retryHeaders.set('Content-Type', 'application/json');
                }
                retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
                resp = await fetch(url, { ...options, headers: retryHeaders });
            }
        } catch (error: any) {
            console.warn('[authedFetch] token refresh failed:', error?.message || error);
        }

        if (resp.status === 401 && typeof window !== 'undefined') {
            try { sessionStorage.removeItem('sp_auth_confirmed'); } catch { /* storage unavailable */ }
        }
    }

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

export async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!isBoundedTrainingApiUrl(url) || trainingDeadlineIsActive(options.signal)) {
        return performAuthedFetch(url, options);
    }

    return boundedTrainingFetch(
        url,
        options,
        TRAINING_REQUEST_TIMEOUT_MS,
        (_input: string, boundedOptions: RequestInit) => performAuthedFetch(url, boundedOptions),
    );
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
