/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LEVEL REGISTRY — 12-Level Difficulty Progression for Training Games
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Defines the complete level progression from Foundations through Boss Mode.
 * Each level is calibrated with:
 *   - EV tolerance thresholds
 *   - Time limits per decision
 *   - Scenario complexity scaling
 *   - Diamond reward multipliers
 *   - Visual theme (accent color, glow, unlock animation)
 *
 * Tier Mapping:
 *   Levels 1-2:  BEGINNER     (Foundations + Opening Ranges)
 *   Levels 3-4:  STANDARD     (C-Bet Logic + Defense)
 *   Levels 5-6:  INTERMEDIATE (Multi-Street + Board Texture)
 *   Levels 7-8:  ADVANCED     (Mixed Strategy + Exploit Recognition)
 *   Levels 9-10: ELITE        (ICM + Tournament Endgame)
 *   Level 11:    ELITE+       (Synthesis)
 *   Level 12:    BOSS MODE    (90% threshold, all scenario types)
 *
 * Migrated from: AI-Content-GTO-Engine/src/orbs/Training/LevelRegistry.ts
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// HARD LAW CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** 85% mastery threshold — IMMUTABLE */
export const MASTERY_THRESHOLD = 0.85 as const;

/** Minimum questions before mastery evaluation */
export const MIN_QUESTIONS_REQUIRED = 20 as const;

/** Boss Mode (Level 12) requires elevated threshold */
export const BOSS_MODE_THRESHOLD = 0.90 as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type DifficultyTier = 'BEGINNER' | 'STANDARD' | 'INTERMEDIATE' | 'ADVANCED' | 'ELITE' | 'BOSS';

export type ScenarioType =
    | 'PREFLOP_RANGES'
    | 'POSTFLOP_DECISION'
    | 'BOARD_TEXTURE'
    | 'SIZING_LOGIC'
    | 'POSITION_BATTLE'
    | 'ICM_PRESSURE'
    | 'MIXED_STRATEGY'
    | 'EXPLOIT_DEVIANCE'
    | 'MULTI_STREET'
    | 'TOURNAMENT_ENDGAME';

export interface LevelDefinition {
    id: number;
    name: string;
    tier: DifficultyTier;
    description: string;
    masteryThreshold: number;
    minQuestionsRequired: number;
    evToleranceBB: number;
    timeLimitSeconds: number;
    scenarioTypes: ScenarioType[];
    scenarioComplexity: number; // 1-10
    xpMultiplier: number;
    diamondMultiplier: number;
    accentColor: string;
    glowIntensity: number;
    unlockAnimation: string;
}

export interface DrillConfiguration {
    levelId: number;
    questionsPerSession: number;
    streakBonusEnabled: boolean;
    leakFocusEnabled: boolean;
    gtoBenchmarkEnabled: boolean;
    showAlternateLines: boolean;
    showEvExplanation: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE 12-LEVEL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const LEVEL_REGISTRY: Record<number, LevelDefinition> = {
    // BEGINNER (Levels 1-2)
    1: {
        id: 1, name: 'Foundations', tier: 'BEGINNER',
        description: 'Full solver-backed GTO training — all spot types and streets',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 20,
        evToleranceBB: 0.50, timeLimitSeconds: 30,
        scenarioTypes: ['PREFLOP_RANGES', 'POSTFLOP_DECISION', 'BOARD_TEXTURE', 'SIZING_LOGIC', 'POSITION_BATTLE'], scenarioComplexity: 1,
        xpMultiplier: 1.0, diamondMultiplier: 1.0,
        accentColor: '#4ADE80', glowIntensity: 0.3, unlockAnimation: 'fade_in',
    },
    2: {
        id: 2, name: 'Opening Ranges', tier: 'BEGINNER',
        description: 'Full solver-backed GTO training — all spot types and streets',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 20,
        evToleranceBB: 0.40, timeLimitSeconds: 25,
        scenarioTypes: ['PREFLOP_RANGES', 'POSTFLOP_DECISION', 'BOARD_TEXTURE', 'SIZING_LOGIC', 'POSITION_BATTLE'], scenarioComplexity: 2,
        xpMultiplier: 1.1, diamondMultiplier: 1.0,
        accentColor: '#34D399', glowIntensity: 0.35, unlockAnimation: 'slide_up',
    },

    // STANDARD (Levels 3-4)
    3: {
        id: 3, name: 'C-Bet Logic', tier: 'STANDARD',
        description: 'Master continuation betting frequency and sizing',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 20,
        evToleranceBB: 0.35, timeLimitSeconds: 22,
        scenarioTypes: ['POSTFLOP_DECISION', 'SIZING_LOGIC'], scenarioComplexity: 3,
        xpMultiplier: 1.2, diamondMultiplier: 1.0,
        accentColor: '#3B82F6', glowIntensity: 0.4, unlockAnimation: 'pulse_in',
    },
    4: {
        id: 4, name: 'Defense Fundamentals', tier: 'STANDARD',
        description: 'Learn minimum defense frequencies and calling ranges',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 20,
        evToleranceBB: 0.30, timeLimitSeconds: 20,
        scenarioTypes: ['POSTFLOP_DECISION', 'BOARD_TEXTURE'], scenarioComplexity: 4,
        xpMultiplier: 1.3, diamondMultiplier: 1.1,
        accentColor: '#60A5FA', glowIntensity: 0.45, unlockAnimation: 'shield_unlock',
    },

    // INTERMEDIATE (Levels 5-6)
    5: {
        id: 5, name: 'Multi-Street Play', tier: 'INTERMEDIATE',
        description: 'Navigate complex turn and river decisions',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 20,
        evToleranceBB: 0.25, timeLimitSeconds: 18,
        scenarioTypes: ['MULTI_STREET', 'SIZING_LOGIC', 'BOARD_TEXTURE'], scenarioComplexity: 5,
        xpMultiplier: 1.4, diamondMultiplier: 1.15,
        accentColor: '#FBBF24', glowIntensity: 0.5, unlockAnimation: 'cascade',
    },
    6: {
        id: 6, name: 'Board Texture', tier: 'INTERMEDIATE',
        description: 'Master board reading and texture-based adjustments',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 20,
        evToleranceBB: 0.22, timeLimitSeconds: 16,
        scenarioTypes: ['BOARD_TEXTURE', 'POSTFLOP_DECISION', 'SIZING_LOGIC'], scenarioComplexity: 6,
        xpMultiplier: 1.5, diamondMultiplier: 1.25,
        accentColor: '#F59E0B', glowIntensity: 0.55, unlockAnimation: 'texture_reveal',
    },

    // ADVANCED (Levels 7-8)
    7: {
        id: 7, name: 'Mixed Strategies', tier: 'ADVANCED',
        description: 'Execute solver-approved mixed frequencies',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 20,
        evToleranceBB: 0.18, timeLimitSeconds: 15,
        scenarioTypes: ['MIXED_STRATEGY', 'MULTI_STREET'], scenarioComplexity: 7,
        xpMultiplier: 1.7, diamondMultiplier: 1.35,
        accentColor: '#F97316', glowIntensity: 0.6, unlockAnimation: 'rng_spinner',
    },
    8: {
        id: 8, name: 'Exploit Recognition', tier: 'ADVANCED',
        description: 'Identify villain leaks and optimal exploitation',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 20,
        evToleranceBB: 0.15, timeLimitSeconds: 14,
        scenarioTypes: ['EXPLOIT_DEVIANCE', 'POSITION_BATTLE'], scenarioComplexity: 8,
        xpMultiplier: 1.9, diamondMultiplier: 1.4,
        accentColor: '#EA580C', glowIntensity: 0.65, unlockAnimation: 'villain_scan',
    },

    // ELITE (Levels 9-10)
    9: {
        id: 9, name: 'ICM Mastery', tier: 'ELITE',
        description: 'Master tournament equity and bubble dynamics',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 20,
        evToleranceBB: 0.12, timeLimitSeconds: 12,
        scenarioTypes: ['ICM_PRESSURE', 'TOURNAMENT_ENDGAME'], scenarioComplexity: 9,
        xpMultiplier: 2.2, diamondMultiplier: 1.5,
        accentColor: '#EF4444', glowIntensity: 0.7, unlockAnimation: 'icm_pulse',
    },
    10: {
        id: 10, name: 'Tournament Endgame', tier: 'ELITE',
        description: 'Dominate final table and heads-up dynamics',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 20,
        evToleranceBB: 0.10, timeLimitSeconds: 12,
        scenarioTypes: ['TOURNAMENT_ENDGAME', 'ICM_PRESSURE', 'EXPLOIT_DEVIANCE'], scenarioComplexity: 9,
        xpMultiplier: 2.3, diamondMultiplier: 1.6,
        accentColor: '#DC2626', glowIntensity: 0.75, unlockAnimation: 'final_table',
    },

    // ELITE+ (Level 11)
    11: {
        id: 11, name: 'Elite Synthesis', tier: 'ELITE',
        description: 'Combine all skills in solver-thin spots',
        masteryThreshold: MASTERY_THRESHOLD, minQuestionsRequired: 25,
        evToleranceBB: 0.08, timeLimitSeconds: 10,
        scenarioTypes: ['MIXED_STRATEGY', 'EXPLOIT_DEVIANCE', 'MULTI_STREET', 'ICM_PRESSURE'], scenarioComplexity: 10,
        xpMultiplier: 2.4, diamondMultiplier: 1.75,
        accentColor: '#8B5CF6', glowIntensity: 0.8, unlockAnimation: 'synthesis_cascade',
    },

    // BOSS MODE (Level 12) — 90% threshold
    12: {
        id: 12, name: 'BOSS MODE', tier: 'BOSS',
        description: 'THE ULTIMATE CHALLENGE — Random scenarios, max pressure',
        masteryThreshold: BOSS_MODE_THRESHOLD,
        minQuestionsRequired: 30,
        evToleranceBB: 0.05, timeLimitSeconds: 8,
        scenarioTypes: [
            'PREFLOP_RANGES', 'POSTFLOP_DECISION', 'BOARD_TEXTURE',
            'SIZING_LOGIC', 'POSITION_BATTLE', 'ICM_PRESSURE',
            'MIXED_STRATEGY', 'EXPLOIT_DEVIANCE', 'MULTI_STREET',
            'TOURNAMENT_ENDGAME',
        ],
        scenarioComplexity: 10,
        xpMultiplier: 2.5, diamondMultiplier: 2.0,
        accentColor: '#FFD700', glowIntensity: 1.0, unlockAnimation: 'boss_emergence',
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function getLevel(levelId: number): LevelDefinition | null {
    return LEVEL_REGISTRY[levelId] || null;
}

export function getAllLevels(): LevelDefinition[] {
    return Object.values(LEVEL_REGISTRY || {}).sort((a, b) => a.id - b.id);
}

export function getLevelsByTier(tier: DifficultyTier): LevelDefinition[] {
    return getAllLevels().filter(l => l.tier === tier);
}

export function isBossMode(levelId: number): boolean {
    return levelId === 12;
}

export function getDrillConfig(levelId: number): DrillConfiguration {
    const level = getLevel(levelId);
    if (!level) throw new Error(`Level ${levelId} not found in registry`);

    return {
        levelId,
        questionsPerSession: level.tier === 'BOSS' ? 30 : 20,
        streakBonusEnabled: levelId >= 3,
        leakFocusEnabled: levelId >= 4,
        gtoBenchmarkEnabled: levelId >= 5,
        showAlternateLines: true,
        showEvExplanation: levelId >= 2,
    };
}
