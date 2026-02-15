/**
 * 💎 CLAIM REWARD UTILITY
 * ═══════════════════════════════════════════════════════════════════════════
 * Fire-and-forget reward claim with automatic DiamondToast notification.
 * All reward triggers should use this instead of raw fetch.
 *
 * Usage:
 *   import { claimReward } from '../../lib/claimReward';
 *   claimReward('/api/rewards/reaction', { userId, postId }, 'Liked a Post');
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { showDiamondToast } from '../components/diamonds/DiamondToast';

/**
 * Fire-and-forget reward claim with toast notification
 * @param {string} endpoint - API endpoint (e.g. '/api/rewards/reaction')
 * @param {object} body - Request body (must include userId)
 * @param {string} reasonLabel - Human-readable reason for toast (e.g. 'Liked a Post')
 */
export function claimReward(endpoint, body, reasonLabel) {
    fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
        .then(res => res.json())
        .then(data => {
            if (data?.claimed && data?.diamondsAwarded > 0) {
                showDiamondToast(data.diamondsAwarded, reasonLabel);
                // Refresh header diamond balance after toast auto-dismisses (3s)
                setTimeout(() => {
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('diamond-balance-refresh'));
                    }
                }, 3000);
            }
        })
        .catch(() => { }); // Non-blocking, silent fail
}
