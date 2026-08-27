/**
 * 💎 CLAIM REWARD UTILITY
 * ═══════════════════════════════════════════════════════════════════════════
 * Fire-and-forget reward claim with automatic DiamondToast notification.
 * All reward triggers should use this instead of raw fetch.
 *
 * Automatically attaches Supabase JWT for server-side auth validation.
 *
 * Usage:
 *   import { claimReward } from '../lib/claimReward';
 *   claimReward('/api/rewards/reaction', { userId, postId }, 'Liked a Post');
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { showDiamondToast } from '../components/diamonds/DiamondToast';
import { busEmit } from '../engine/EventBus';

/**
 * Extract the Supabase access token from localStorage.
 * Supabase stores session in localStorage under a key like:
 * sb-<project_ref>-auth-token
 */
/**
 * Extract the Supabase access token from localStorage.
 * Primary key: 'smarter-poker-auth' (set by supabase.ts storageKey config)
 * Fallback: legacy sb-<ref>-auth-token keys for backwards compatibility.
 */
function getAccessToken() {
    try {
        // Primary: smarter-poker-auth (set by supabase.ts storageKey config)
        const primary = localStorage.getItem('smarter-poker-auth');
        if (primary) {
            const parsed = JSON.parse(primary);
            if (parsed?.access_token) return parsed.access_token;
        }
        // Legacy fallback: sb-<ref>-auth-token
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    return parsed?.access_token || null;
                }
            }
        }
    } catch { /* noop */ }
    return null;
}


/**
 * Fire-and-forget reward claim with toast notification
 * @param {string} endpoint - API endpoint (e.g. '/api/rewards/reaction')
 * @param {object} body - Request body (must include userId)
 * @param {string} reasonLabel - Human-readable reason for toast (e.g. 'Liked a Post')
 */
export async function claimReward(endpoint, body, reasonLabel) {
    const headers = { 'Content-Type': 'application/json' };

    // Attach JWT for server-side auth validation
    const token = getAccessToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) {
            return { claimed: false, terminal: false, retryable: true, status: response.status };
        }
        if (data.claimed && data.diamondsAwarded > 0) {
            showDiamondToast(data.diamondsAwarded, reasonLabel);
            busEmit.diamondsEarned(data.diamondsAwarded, reasonLabel);
        }
        return {
            ...data,
            terminal: Boolean(data.claimed || data.alreadyClaimed),
            retryable: !data.claimed && !data.alreadyClaimed,
            status: response.status,
        };
    } catch (error) {
        console.warn('[App] Reward claim will be retried:', error?.message || error);
        return { claimed: false, terminal: false, retryable: true, status: 0 };
    }
}
