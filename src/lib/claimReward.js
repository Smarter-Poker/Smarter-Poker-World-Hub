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
export function claimReward(endpoint, body, reasonLabel) {
    const headers = { 'Content-Type': 'application/json' };

    // Attach JWT for server-side auth validation
    const token = getAccessToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    })
        .then(res => res.json())
        .then(data => {
            if (data?.claimed && data?.diamondsAwarded > 0) {
                showDiamondToast(data.diamondsAwarded, reasonLabel);
                // 🚌 BUS EVENT: Notify all listeners of diamond earnings
                busEmit.diamondsEarned(data.diamondsAwarded, reasonLabel);
            }
        })
        .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // Non-blocking, silent fail
}
