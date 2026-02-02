/**
 * Training Level Configuration
 * ═══════════════════════════════════════════════════════════════════════════
 * 100 games × 25 questions × 10 levels
 * Pass threshold: 85% (Level 1) → 100% (Level 10)
 */

export const TRAINING_CONFIG = {
    questionsPerLevel: 25,
    totalLevels: 10,

    // Pass thresholds: +2% per level
    passThresholds: {
        1: 85,  // 21/25 correct
        2: 87,  // 22/25 correct
        3: 89,  // 22/25 correct (rounded)
        4: 91,  // 23/25 correct
        5: 93,  // 23/25 correct (rounded)
        6: 95,  // 24/25 correct
        7: 97,  // 24/25 correct (rounded)
        8: 98,  // 24/25 correct (rounded)
        9: 99,  // 25/25 correct (practically)
        10: 100, // 25/25 correct (perfect)
    },

    // XP rewards per level
    xpRewards: {
        1: 50,
        2: 75,
        3: 100,
        4: 150,
        5: 200,
        6: 275,
        7: 350,
        8: 450,
        9: 600,
        10: 1000, // Mastery bonus
    },

    // Engine types
    engines: {
        PIO: 'solver',      // 60 games - Supabase solver_templates
        CHART: 'chart',     // 19 games - JSON range charts
        SCENARIO: 'scenario', // 21 games - Mental game questions
    },
};

/**
 * Get required correct answers for a level
 */
export function getRequiredCorrect(level) {
    const threshold = TRAINING_CONFIG.passThresholds[level] || 85;
    return Math.ceil((threshold / 100) * TRAINING_CONFIG.questionsPerLevel);
}

/**
 * Check if user passed the level
 */
export function checkLevelPassed(level, correctAnswers) {
    return correctAnswers >= getRequiredCorrect(level);
}

/**
 * Get XP reward for completing a level
 */
export function getXPReward(level, correctAnswers, streakBonus = 0) {
    const baseXP = TRAINING_CONFIG.xpRewards[level] || 50;
    const accuracyBonus = Math.round(baseXP * (correctAnswers / TRAINING_CONFIG.questionsPerLevel));
    return baseXP + accuracyBonus + streakBonus;
}

export default TRAINING_CONFIG;
