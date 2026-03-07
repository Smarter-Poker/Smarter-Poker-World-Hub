/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GLOBAL AUTH UTILITY — Bulletproof Authentication for Smarter.Poker
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This utility provides consistent, AbortError-resistant auth methods for
 * all pages in the application. It uses localStorage for session retrieval
 * and native fetch for database queries to bypass Supabase JS client issues.
 * 
 * Usage:
 *   import { getAuthUser, fetchWithAuth, queryProfiles } from '@/lib/authUtils';
 *   
 *   // Get current user
 *   const user = getAuthUser();
 *   
 *   // Fetch data with auth
 *   const data = await fetchWithAuth('/rest/v1/profiles?id=eq.123');
 *   
 *   // Or use the typed query helpers
 *   const profile = await queryProfiles(userId);
 */

// Production Supabase credentials
const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

/**
 * Get the current authenticated user from localStorage
 * Uses explicit 'smarter-poker-auth' key (primary) with fallback to legacy sb-* keys
 */
export function getAuthUser() {
    if (typeof window === 'undefined') return null;

    try {
        // PRIMARY: Use explicit storage key (set in supabase.ts)
        const explicitAuth = localStorage.getItem('smarter-poker-auth');
        if (explicitAuth) {
            const tokenData = JSON.parse(explicitAuth);
            if (tokenData?.user) {
                return tokenData.user;
            }
        }

        // FALLBACK: Legacy sb-* keys (for backwards compatibility during migration)
        const sbKeys = Object.keys(localStorage).filter(
            k => k.startsWith('sb-') && k.endsWith('-auth-token')
        );

        if (sbKeys.length > 0) {
            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
            return tokenData?.user || null;
        }
    } catch (e) {
        console.error('[AuthUtils] Error reading auth:', e);
    }

    return null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BULLETPROOF USER RETRIEVAL — 3-Level Fallback Chain
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * USE THIS INSTEAD OF supabase.auth.getUser() EVERYWHERE.
 * 
 * Level 1: supabase.auth.getUser() — network call (can fail with AbortError)
 * Level 2: supabase.auth.getSession() — localStorage via Supabase (can fail with navigator.locks)
 * Level 3: getAuthUser() — direct localStorage read (ALWAYS works, immune to AbortError)
 * 
 * Usage:
 *   import { getSafeUser } from '@/lib/authUtils';
 *   const user = await getSafeUser(supabase);
 *   if (!user) { // truly not logged in }
 */
export async function getSafeUser(supabaseClient) {
    // Level 1: Try supabase.auth.getUser() (network call)
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) return user;
    } catch (_) { /* AbortError — fall through */ }

    // Level 2: Try supabase.auth.getSession() (localStorage via Supabase)
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) return session.user;
    } catch (_) { /* navigator.locks — fall through */ }

    // Level 3: Direct localStorage read (NEVER fails in browser)
    try {
        const localUser = getAuthUser();
        if (localUser?.id) return localUser;
    } catch (_) { /* impossible, but safe */ }

    return null; // Truly not logged in
}

/**
 * Get the current session token for authenticated requests
 * Uses explicit 'smarter-poker-auth' key (primary) with fallback to legacy sb-* keys
 */
export function getSessionToken() {
    if (typeof window === 'undefined') return null;

    try {
        // PRIMARY: Use explicit storage key
        const explicitAuth = localStorage.getItem('smarter-poker-auth');
        if (explicitAuth) {
            const tokenData = JSON.parse(explicitAuth);
            if (tokenData?.access_token) {
                return tokenData.access_token;
            }
        }

        // FALLBACK: Legacy sb-* keys
        const sbKeys = Object.keys(localStorage).filter(
            k => k.startsWith('sb-') && k.endsWith('-auth-token')
        );

        if (sbKeys.length > 0) {
            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
            return tokenData?.access_token || null;
        }
    } catch (e) {
        console.error('[AuthUtils] Error reading token:', e);
    }

    return null;
}

/**
 * Get the access token for authenticated API calls.
 * Alias for getSessionToken — matches the .ts file export name
 * Both files must export this for dynamic import() consistency.
 */
export function getAccessToken() {
    return getSessionToken();
}

/**
 * Fetch data from Supabase REST API with authentication
 * Bypasses supabase-js client to avoid AbortError
 */
export async function fetchWithAuth(endpoint, options = {}) {
    const sessionToken = getSessionToken();
    const authToken = sessionToken || SUPABASE_ANON_KEY;

    const url = endpoint.startsWith('http') ? endpoint : `${SUPABASE_URL}${endpoint}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Prefer': options.prefer || 'return=representation',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return response.json();
}

/**
 * Query profiles table
 */
export async function queryProfiles(userId, select = '*') {
    const data = await fetchWithAuth(
        `/rest/v1/profiles?id=eq.${userId}&select=${encodeURIComponent(select)}`
    );
    return data[0] || null;
}

/**
 * Query user diamond balance from user_diamond_balance table
 */
export async function queryDiamondBalance(userId) {
    try {
        const data = await fetchWithAuth(
            `/rest/v1/user_diamond_balance?user_id=eq.${userId}&select=balance`
        );
        return data[0]?.balance || 0;
    } catch (e) {
        console.error('[AuthUtils] Diamond balance fetch error:', e);
        return 0;
    }
}

/**
 * Query social posts with pagination
 */
export async function querySocialPosts(offset = 0, limit = 10) {
    const params = new URLSearchParams({
        select: 'id,content,content_type,media_urls,like_count,comment_count,share_count,created_at,author_id,link_url,link_title,link_description,link_image,link_site_name,metadata',
        or: '(visibility.eq.public,visibility.is.null)',
        order: 'created_at.desc',
        offset: offset.toString(),
        limit: limit.toString()
    });

    return fetchWithAuth(`/rest/v1/social_posts?${params}`);
}

/**
 * Query any table with flexible parameters
 */
export async function queryTable(table, params = {}) {
    const queryParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        queryParams.append(key, value.toString());
    }

    return fetchWithAuth(`/rest/v1/${table}?${queryParams}`);
}

/**
 * Insert data into a table
 */
export async function insertIntoTable(table, data) {
    return fetchWithAuth(`/rest/v1/${table}`, {
        method: 'POST',
        body: JSON.stringify(data),
        prefer: 'return=representation'
    });
}

/**
 * Update data in a table
 */
export async function updateTable(table, match, data) {
    const matchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(match)) {
        matchParams.append(key, `eq.${value}`);
    }

    return fetchWithAuth(`/rest/v1/${table}?${matchParams}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        prefer: 'return=representation'
    });
}

/**
 * React hook for getting current user with auto-refresh
 * Listens for cross-tab storage changes for session sync
 */
export function useAuthUser() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const authUser = getAuthUser();
        setUser(authUser);
        setLoading(false);

        // Listen for storage changes (cross-tab auth sync)
        const handleStorage = (e) => {
            // Listen for both explicit key and legacy keys
            if (e.key === 'smarter-poker-auth' ||
                (e.key?.startsWith('sb-') && e.key?.endsWith('-auth-token'))) {
                setUser(getAuthUser());
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    return { user, loading };
}

// Need to import these for the hook
import { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ SESSION BACKUP / RESTORE — Last line of defense against accidental logout
// ═══════════════════════════════════════════════════════════════════════════
const AUTH_STORAGE_KEY = 'smarter-poker-auth';
const AUTH_BACKUP_KEY = 'smarter-poker-auth-backup';
const BACKUP_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Backup the current session to a separate localStorage key.
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
export function restoreSessionBackup() {
    if (typeof window === 'undefined') return false;
    try {
        const backup = localStorage.getItem(AUTH_BACKUP_KEY);
        if (!backup) return false;

        const { session, timestamp } = JSON.parse(backup);
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
export function hasSessionBackup() {
    if (typeof window === 'undefined') return false;
    try {
        const backup = localStorage.getItem(AUTH_BACKUP_KEY);
        if (!backup) return false;
        const { timestamp } = JSON.parse(backup);
        return (Date.now() - timestamp) < BACKUP_TTL_MS;
    } catch (e) { return false; }
}

/**
 * Clear all auth data from localStorage.
 * HARDENED: Creates a backup before clearing so we can recover from accidental logouts.
 * Use force=true for sovereign (user-initiated) logout to skip backup.
 */
export function clearAuth(force = false) {
    if (typeof window === 'undefined') return;

    try {
        if (!force) {
            backupSession();
        } else {
            localStorage.removeItem(AUTH_BACKUP_KEY);
        }

        localStorage.removeItem(AUTH_STORAGE_KEY);
        const sbKeys = Object.keys(localStorage).filter(
            k => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        sbKeys.forEach(k => localStorage.removeItem(k));
    } catch (e) {
        console.warn('[authUtils] Error clearing auth:', e);
    }
}

export default {
    getAuthUser,
    getSafeUser,
    getSessionToken,
    getAccessToken,
    fetchWithAuth,
    queryProfiles,
    queryDiamondBalance,
    querySocialPosts,
    queryTable,
    insertIntoTable,
    updateTable,
    useAuthUser,
    backupSession,
    restoreSessionBackup,
    hasSessionBackup,
    clearAuth,
    SUPABASE_URL,
    SUPABASE_ANON_KEY
};
