/**
 * 🎯 Memory Matrix ELO Rating Service
 * 
 * Calculates and manages player ELO ratings for competitive ranking.
 * Based on standard ELO formula with K-factor adjustments for skill levels.
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (client-side)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Constants
const DEFAULT_ELO = 1200;
const K_FACTOR_NEW = 40;      // Higher K for new players (first 10 games)
const K_FACTOR_NORMAL = 24;   // Standard K-factor
const K_FACTOR_EXPERT = 16;   // Lower K for established players (100+ games)

// Level difficulty ratings (theoretical ELO opponents)
const LEVEL_RATINGS = {
    1: 800,
    2: 900,
    3: 1000,
    4: 1100,
    5: 1200,
    6: 1300,
    7: 1400,
    8: 1500,
    9: 1600,
    10: 1700
};

/**
 * Calculate K-factor based on player experience
 */
function getKFactor(gamesPlayed) {
    if (gamesPlayed < 10) return K_FACTOR_NEW;
    if (gamesPlayed >= 100) return K_FACTOR_EXPERT;
    return K_FACTOR_NORMAL;
}

/**
 * Calculate expected score (probability of winning)
 */
function expectedScore(playerRating, opponentRating) {
    return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

/**
 * Calculate new ELO rating
 * @param {number} currentELO - Player's current ELO
 * @param {number} level - Game level (1-10)
 * @param {number} accuracy - Accuracy achieved (0-100)
 * @param {number} gamesPlayed - Total games played by player
 * @returns {Object} - New ELO and change details
 */
export function calculateNewELO(currentELO, level, accuracy, gamesPlayed) {
    const opponentRating = LEVEL_RATINGS[level] || 1200;
    const K = getKFactor(gamesPlayed);

    // Game outcome: accuracy percentage as score (1.0 = win, 0.0 = loss)
    // 90%+ accuracy = win, 70-90% = draw, <70% = loss
    let gameScore;
    if (accuracy >= 90) {
        gameScore = 1.0;
    } else if (accuracy >= 70) {
        // Linear interpolation between draw (0.5) and win (1.0)
        gameScore = 0.5 + ((accuracy - 70) / 40);
    } else if (accuracy >= 50) {
        // Linear interpolation between loss (0) and draw (0.5)
        gameScore = (accuracy - 50) / 40;
    } else {
        gameScore = 0;
    }

    const expected = expectedScore(currentELO, opponentRating);
    const change = Math.round(K * (gameScore - expected));
    const newELO = Math.max(100, currentELO + change); // Minimum ELO of 100

    return {
        previousELO: currentELO,
        newELO,
        change,
        level,
        accuracy,
        gameScore,
        expected,
        opponentRating
    };
}

/**
 * Get rank title based on ELO rating
 */
export function getRankTitle(elo) {
    if (elo >= 2000) return { title: 'GTO Master', icon: '👑', color: '#FFD700' };
    if (elo >= 1800) return { title: 'Diamond', icon: '💎', color: '#00D4FF' };
    if (elo >= 1600) return { title: 'Platinum', icon: '⚪', color: '#E5E4E2' };
    if (elo >= 1400) return { title: 'Gold', icon: '🥇', color: '#FFD700' };
    if (elo >= 1200) return { title: 'Silver', icon: '🥈', color: '#C0C0C0' };
    if (elo >= 1000) return { title: 'Bronze', icon: '🥉', color: '#CD7F32' };
    return { title: 'Novice', icon: '🎮', color: '#9CA3AF' };
}

/**
 * Update user's ELO in the database
 */
export async function updateUserELO(userId, newELO) {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ memory_elo: newELO })
            .eq('id', userId);

        if (error) {
            console.error('[ELO] Update error:', error);
            return { success: false, error };
        }

        return { success: true, newELO };
    } catch (err) {
        console.error('[ELO] Exception:', err);
        return { success: false, error: err };
    }
}

/**
 * Get user's current ELO from the database
 */
export async function getUserELO(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('memory_elo')
            .eq('id', userId)
            .single();

        if (error || !data) {
            return DEFAULT_ELO;
        }

        return data.memory_elo || DEFAULT_ELO;
    } catch (err) {
        console.error('[ELO] Get error:', err);
        return DEFAULT_ELO;
    }
}

/**
 * Process game result and update ELO
 */
export async function processGameResult(userId, level, accuracy, gamesPlayed) {
    // Get current ELO
    const currentELO = await getUserELO(userId);

    // Calculate new ELO
    const result = calculateNewELO(currentELO, level, accuracy, gamesPlayed);

    // Update in database
    await updateUserELO(userId, result.newELO);

    // Return full result for UI display
    return {
        ...result,
        rank: getRankTitle(result.newELO)
    };
}

export default {
    calculateNewELO,
    getRankTitle,
    getUserELO,
    updateUserELO,
    processGameResult,
    DEFAULT_ELO
};
