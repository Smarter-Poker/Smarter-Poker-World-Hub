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

// Storage key used by Supabase client (must match supabase.ts config)
const AUTH_STORAGE_KEY = 'smarter-poker-auth';

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
        const sbKeys = Object.keys(localStorage).filter(
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
        const sbKeys = Object.keys(localStorage).filter(
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

/**
 * Clear all auth data from localStorage.
 * Use this for logout.
 */
export function clearAuth() {
    if (typeof window === 'undefined') return;

    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        // Also clear legacy sb-* keys
        const sbKeys = Object.keys(localStorage).filter(
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
export function saveAuthSession(session) {
    if (typeof window === 'undefined' || !session) return;

    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
        console.warn('[authUtils] Error saving auth session:', e);
    }
}
