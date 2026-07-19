/**
 * Training Level Configuration
 * ═══════════════════════════════════════════════════════════════════════════
 * 100 games × 25 questions × 12 levels (Foundations → Boss Mode)
 * Pass threshold: 85% (standard) / 90% (Boss Mode Level 12)
 *
 * SOURCE OF TRUTH: LevelRegistry.ts
 * This file is a JS bridge so existing .js components can import it.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { LEVEL_REGISTRY, MASTERY_THRESHOLD, BOSS_MODE_THRESHOLD, MIN_QUESTIONS_REQUIRED } from './LevelRegistry';

// Build pass thresholds from LevelRegistry
const passThresholds = {};
const diamondMultipliers = {};
for (const [levelNum, def] of Object.entries(LEVEL_REGISTRY || {})) {
    const lvl = parseInt(levelNum, 10);
    passThresholds[lvl] = Math.round(def.masteryThreshold * 100);
    diamondMultipliers[lvl] = def.diamondMultiplier;
}

export const TRAINING_CONFIG = {
    questionsPerLevel: MIN_QUESTIONS_REQUIRED, // 20 (from LevelRegistry)
    totalLevels: Object.keys(LEVEL_REGISTRY || {}).length, // 12

    // Pass thresholds derived from LevelRegistry (85% standard, 90% Boss Mode)
    passThresholds,

    // Diamond multipliers per level (replaces XP)
    diamondMultipliers,

    // Mastery constants
    masteryThreshold: MASTERY_THRESHOLD,       // 0.85
    bossModeThreshold: BOSS_MODE_THRESHOLD,    // 0.90

    // Engine types
    engines: {
        PIO: 'solver',        // 60 games - Supabase solver_templates
        CHART: 'chart',       // 19 games - JSON range charts
        SCENARIO: 'scenario', // 21 games - Mental game questions
    },
};

/**
 * Get required correct answers for a level.
 * 2026-07-19 AUDIT FIX: accepts the ACTUAL number of questions served.
 * useGTOTrainer caps effectiveQuestionsPerLevel to what the API returned
 * (can be < 20); computing the requirement against a fixed 20 made short
 * sessions mathematically unpassable (e.g. 10 questions needed 17 correct).
 */
export function getRequiredCorrect(level, totalQuestions = TRAINING_CONFIG.questionsPerLevel) {
    const threshold = TRAINING_CONFIG.passThresholds[level] || Math.round(MASTERY_THRESHOLD * 100);
    const total = Math.max(1, totalQuestions || TRAINING_CONFIG.questionsPerLevel);
    return Math.ceil((threshold / 100) * total);
}

/**
 * Check if user passed the level (against the actual question count served)
 */
export function checkLevelPassed(level, correctAnswers, totalQuestions = TRAINING_CONFIG.questionsPerLevel) {
    return correctAnswers >= getRequiredCorrect(level, totalQuestions);
}

/**
 * Get diamond reward for completing a level
 */
export function getDiamondReward(level, correctAnswers, streakBonus = 0) {
    const multiplier = TRAINING_CONFIG.diamondMultipliers[level] || 1.0;
    const accuracy = correctAnswers / TRAINING_CONFIG.questionsPerLevel;
    const baseDiamonds = 5;
    const accuracyBonus = accuracy >= 1.0 ? 10 : accuracy >= 0.9 ? 5 : accuracy >= 0.85 ? 3 : 0;
    return Math.round((baseDiamonds + accuracyBonus + streakBonus) * multiplier);
}

// XP system fully removed — diamonds are the only reward currency
// Legacy stub prevents import errors in any files still referencing getXPReward
export const getXPReward = getDiamondReward;

export default TRAINING_CONFIG;
