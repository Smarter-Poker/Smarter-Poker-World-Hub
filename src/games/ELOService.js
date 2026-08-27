/**
 * 🎯 Memory Matrix ELO Rating Service
 * 
 * Calculates and manages player ELO ratings for competitive ranking.
 * Based on standard ELO formula with K-factor adjustments for skill levels.
 */



import { authedFetch } from '../lib/authUtils';
import { calculateNewELO, DEFAULT_ELO, getRankTitle } from '../lib/memoryElo';

export { calculateNewELO, DEFAULT_ELO, getRankTitle } from '../lib/memoryElo';

/**
 * Update user's ELO in the database
 */
export async function updateUserELO(userId, newELO) {
    return { success: false, unsupported: true, userId, newELO };
}

/**
 * Get user's current ELO from the database
 */
export async function getUserELO(userId) {
    if (!userId) return DEFAULT_ELO;
    try {
        const response = await authedFetch('/api/memory/elo');
        const payload = await response.json().catch(() => null);
        return response.ok && Number.isFinite(payload?.elo) ? payload.elo : DEFAULT_ELO;
    } catch (err) {
        console.warn('[ELO] Get error:', err);
        return DEFAULT_ELO;
    }
}

/**
 * Process game result and update ELO
 */
export async function processGameResult(userId, level, accuracy, gamesPlayed) {
    if (!userId) return null;
    const response = await authedFetch('/api/memory/elo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, accuracy, gamesPlayed }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Unable to update ELO');
    }
    return payload.result;
}

export default {
    calculateNewELO,
    getRankTitle,
    getUserELO,
    updateUserELO,
    processGameResult,
    DEFAULT_ELO
};
