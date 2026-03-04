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
    } catch (e) { /* silently fail */ }
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
export function saveAuthSession(session: any) {
    if (typeof window === 'undefined' || !session) return;

    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
        console.warn('[authUtils] Error saving auth session:', e);
    }
}
