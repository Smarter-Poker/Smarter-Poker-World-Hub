/**
 * Centralized API Client for Club Arena
 * ═══════════════════════════════════════════════════════════════
 * Single source of truth for all authenticated API calls.
 * Bakes in X-Idempotency-Key header to prevent duplicate operations.
 * 
 * Usage:
 *   import { apiCall, apiGet, getAuthToken } from '../../src/lib/club-arena/apiClient';
 *   const result = await apiCall('/api/club-arena/create-table', { clubId, name, ... });
 *   const data = await apiGet('/api/club-arena/announcements?clubId=...');
 */

import { supabase } from '../supabase';

// ── Auth Token Resolution ────────────────────────────────────────────────
// Fast path: localStorage cache (if not expired) → Slow path: Supabase session refresh
export const getAuthToken = async () => {
    // 1. Fast path: read from localStorage cache (instant, no network round-trip)
    try {
        const cached = localStorage.getItem('smarter-poker-auth');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.access_token) {
                // Validate token expiry — skip stale tokens to trigger Supabase refresh
                const payload = JSON.parse(atob(parsed.access_token.split('.')[1]));
                const expiresAt = (payload.exp || 0) * 1000; // JWT exp is in seconds
                const BUFFER_MS = 60_000; // 60s buffer before expiry
                if (Date.now() < expiresAt - BUFFER_MS) {
                    return parsed.access_token; // Token is fresh — use it
                }
                // Token expired or expiring — fall through to refresh
            }
        }
    } catch (_) { /* localStorage unavailable, corrupted, or token parse failed */ }

    // 2. Slow path: ask Supabase (handles token refresh automatically)
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
    } catch (_) {
        return null;
    }
};

// ── Generate Idempotency Key ─────────────────────────────────────────────
// C-05: Unique per request — prevents double-submit on laggy connections
const generateIdempotencyKey = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// ── Authenticated POST ───────────────────────────────────────────────────
// All POST calls get an idempotency key automatically
export const apiCall = async (endpoint, body) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Idempotency-Key': generateIdempotencyKey(),
        },
        body: JSON.stringify(body),
    });
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('Server returned invalid response'); }
    if (!res.ok) throw new Error(data.error || 'API call failed');
    return data;
};

// ── Authenticated GET ────────────────────────────────────────────────────
// GET calls don't need idempotency (safe/idempotent by nature)
export const apiGet = async (url) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('Server returned invalid response'); }
    if (!res.ok) throw new Error(data.error || 'API call failed');
    return data;
};
