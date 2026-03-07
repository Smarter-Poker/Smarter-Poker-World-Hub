/**
 * Commander Client-Side Auth Helpers
 * Centralized helpers for reading auth tokens & staff session from localStorage.
 * Used by Commander page components for API calls.
 *
 * Previously these 3-line helpers were copy-pasted into 41+ pages.
 * Import from here instead of re-declaring them in every file.
 *
 * Usage:
 *   import { getToken, getStaffSession, getAuthHeaders } from '../lib/commander/clientAuth';
 */

/**
 * Get the current access token from localStorage.
 * Prefers the commander_token (PIN-based login), falls back to Supabase session token.
 */
export function getToken() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || null;
}

/**
 * Get the staff session JSON string from localStorage.
 * This is passed as the `x-staff-session` header for API calls requiring staff auth.
 */
export function getStaffSession() {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('commander_staff') || '';
}

/**
 * Get a complete headers object for authenticated Commander API calls.
 * Combines the Bearer token + staff session header.
 */
export function getAuthHeaders() {
    return {
        Authorization: `Bearer ${getToken()}`,
        'x-staff-session': getStaffSession(),
    };
}

/**
 * Get the parsed staff session object. Returns {} if not found or invalid.
 */
export function getStaffData() {
    try {
        return JSON.parse(getStaffSession() || '{}');
    } catch {
        return {};
    }
}

/**
 * Get the venue_id from the staff session.
 */
export function getVenueId() {
    return getStaffData().venue_id || null;
}
