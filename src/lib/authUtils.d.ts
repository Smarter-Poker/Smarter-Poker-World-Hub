/**
 * Type declarations for authUtils.js
 * Provides TypeScript compatibility for the bulletproof auth utility functions
 */

export interface AuthUser {
    id: string;
    email?: string;
    user_metadata?: Record<string, any>;
    app_metadata?: Record<string, any>;
    [key: string]: any;
}

/**
 * Get user directly from localStorage (bypasses navigator.locks AbortError)
 */
export function getAuthUser(): AuthUser | null;

/**
 * Bulletproof 3-level auth fallback: getUser() → getSession() → localStorage
 * USE THIS INSTEAD OF supabase.auth.getUser() EVERYWHERE.
 */
export function getSafeUser(supabaseClient: any): Promise<AuthUser | null>;

/**
 * Get session token from localStorage
 */
export function getSessionToken(): string | null;

/**
 * Get access token from localStorage
 */
export function getAccessToken(): string | null;

/**
 * Get auth user ID from localStorage
 */
export function getAuthUserId(): string | null;

/**
 * Fetch with auth headers
 */
export function fetchWithAuth(url: string, options?: RequestInit): Promise<Response>;

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean;

/**
 * Clear auth data from localStorage
 */
export function clearAuth(): void;

declare const authUtils: {
    getAuthUser: typeof getAuthUser;
    getSafeUser: typeof getSafeUser;
    getSessionToken: typeof getSessionToken;
    getAccessToken: typeof getAccessToken;
    getAuthUserId: typeof getAuthUserId;
    fetchWithAuth: typeof fetchWithAuth;
    isAuthenticated: typeof isAuthenticated;
    clearAuth: typeof clearAuth;
};

export default authUtils;
