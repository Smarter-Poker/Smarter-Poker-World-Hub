/* ═══════════════════════════════════════════════════════════════════════════
   📊 GTO SCENARIO DATABASE - Progressive Difficulty System
   Each level builds on previous knowledge with increasing complexity
   ═══════════════════════════════════════════════════════════════════════════ */

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export function getHandName(row, col) {
    if (row === col) return RANKS[row] + RANKS[col];
    if (row < col) return RANKS[row] + RANKS[col] + 's';
    return RANKS[col] + RANKS[row] + 'o';
}

// ═══════════════════════════════════════════════════════════════════════════
// DIFFICULTY SETTINGS - Timer, complexity, and scoring adjustments
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_CONFIG = {
    1: { timer: 90, gridSize: 13, maxHands: 20, diamondMultiplier: 1.0 },
    2: { timer: 85, gridSize: 13, maxHands: 22, diamondMultiplier: 1.2 },
    3: { timer: 80, gridSize: 13, maxHands: 24, diamondMultiplier: 1.4 },
    4: { timer: 75, gridSize: 13, maxHands: 26, diamondMultiplier: 1.6 },
    5: { timer: 70, gridSize: 13, maxHands: 28, diamondMultiplier: 1.8 },
    6: { timer: 65, gridSize: 13, maxHands: 30, diamondMultiplier: 2.0 },
    7: { timer: 60, gridSize: 13, maxHands: 32, diamondMultiplier: 2.2 },
    8: { timer: 55, gridSize: 13, maxHands: 34, diamondMultiplier: 2.4 },
    9: { timer: 50, gridSize: 13, maxHands: 36, diamondMultiplier: 2.6 },
    10: { timer: 45, gridSize: 13, maxHands: 40, diamondMultiplier: 3.0 },
};

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 1: NEURAL BOOT — EP Opens (UTG, MP, HJ) + Stack Depth Variants
// NOW SOLVER-GENERATED from SolverScenarioGenerator.js generateLevel1()
// Old hardcoded scenarios removed — LEVEL_1_SCENARIOS populated below
// from the solver generator alongside L2-7.
// ═══════════════════════════════════════════════════════════════════════════
// [REMOVED] ~340 lines of hand-typed Level 1 scenarios without mixed frequencies.
// Replaced by solver-accurate scenarios generated from solverRanges.js.


export const LEVEL_10_SCENARIOS = [
    {
        id: 'l10-mixed-btn', level: 10, title: 'BTN Mixed Strategy', position: 'BTN', stackDepth: 100,
        description: 'Hands That Mix Raise/fold on the Button.',
        tip: 'These Borderline Hands Use Mixed Frequencies In GTO.',
        solution: {
            'K4o': 'raise', 'K3o': 'raise', 'K2o': 'raise',
            'Q5o': 'raise', 'Q4o': 'raise', 'J6o': 'raise', 'T6o': 'raise',
            '96o': 'raise', '85o': 'raise', '74o': 'raise', '63o': 'raise', '52o': 'raise',
        }
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// MIXED STRATEGY SCENARIOS (for Mixed Strategy Trainer)
// ═══════════════════════════════════════════════════════════════════════════
export const MIXED_SCENARIOS = [
    { id: 'mix-1', title: 'BTN Open vs SB 3bet', hand: 'A5s', context: 'You Are BTN Facing A 3bet From SB', frequencies: { call: 45, raise: 55, fold: 0 } },
    { id: 'mix-2', title: 'BB Defense vs BTN', hand: 'KJo', context: 'You Are BB Facing A 2.5x Open', frequencies: { call: 60, raise: 0, fold: 40 } },
    { id: 'mix-3', title: 'SB vs BB Limp', hand: 'Q9o', context: 'You Are SB, BB Checks', frequencies: { raise: 50, fold: 10, call: 40 } }, // Limp strategy mocked
    { id: 'mix-4', title: 'UTG vs MP 3bet', hand: 'QQ', context: 'You Are UTG Facing MP 3bet', frequencies: { call: 50, raise: 50, fold: 0 } },
    { id: 'mix-5', title: 'Flop C-Bet', hand: 'Bottom Set', context: 'As PFR On Wet Board', frequencies: { check: 30, bet: 70 } },
    { id: 'mix-6', title: 'River Bluff', hand: 'Missed Draw', context: 'Triple Barrel Spot', frequencies: { check: 25, bet: 75 } },
    { id: 'mix-7', title: 'Turn Probe', hand: 'Middle Pair', context: 'OOP vs IP Checkback', frequencies: { check: 60, bet: 40 } },
    { id: 'mix-8', title: 'BTN Open', hand: 'K6o', context: 'Opening Range Boundary', frequencies: { raise: 40, fold: 60 } },
    { id: 'mix-9', title: 'BB Defense vs UTG', hand: '76s', context: 'Facing 2.2x Open', frequencies: { call: 85, raise: 15, fold: 0 } },
    { id: 'mix-10', title: 'SB Steal', hand: 'Q3s', context: 'Folded To You In SB', frequencies: { raise: 70, fold: 0, call: 30 } },
];

// ═══════════════════════════════════════════════════════════════════════════
// SPOT TRAINER SCENARIOS (Tree-based hands)
// ═══════════════════════════════════════════════════════════════════════════
export const SPOT_SCENARIOS = [
    {
        id: 'spot-1',
        title: 'BTN vs BB - Single Raised Pot',
        heroHand: 'AsKd',
        heroPos: 'BTN',
        villainPos: 'BB',
        initialPot: 5.5,
        stackDepth: 100,
        blinds: '0.5/1',
        history: ['Hero (BTN) raises to 2.5BB', 'Villain (BB) calls 1.5BB'],
        tree: {
            id: 'root',
            street: 'flop',
            board: ['Ks', '7h', '2d'],
            villainAction: 'check',
            description: 'You Flop Top Pair Top Kicker on a Dry Board. BB Checks.',
            options: [
                {
                    label: 'Check',
                    score: 40,
                    feedback: 'Too passive. You miss value and let them realize equity.',
                    next: null // End of line for bad move in this trainer
                },
                {
                    label: 'Bet 1.8BB (33%)',
                    score: 100,
                    feedback: 'Perfect. Small sizing works well on this dry texture.',
                    next: {
                        id: 'turn-1',
                        street: 'turn',
                        card: '9s',
                        villainAction: 'call',
                        pot: 9.1,
                        description: 'Villain Calls. Turn is 9s. BB Checks.',
                        options: [
                            {
                                label: 'Check',
                                score: 70,
                                feedback: 'Acceptable pot control, but you can get more value.',
                                next: null
                            },
                            {
                                label: 'Bet 6.5BB (75%)',
                                score: 100,
                                feedback: 'Great. Charging draws and worse Kx.',
                                next: {
                                    id: 'river-1',
                                    street: 'river',
                                    card: '3h',
                                    villainAction: 'call',
                                    pot: 22.1,
                                    description: 'Villain Calls. River is 3h (Brick). BB Checks.',
                                    options: [
                                        { label: 'Check', score: 50, feedback: 'Missed value. Villain has many worse Kings.' },
                                        { label: 'Bet 15BB (66%)', score: 100, feedback: 'Maximize value! Target KQ, KJ, KT.' },
                                        { label: 'All-In', score: 60, feedback: 'Too ambitious. Folds out everything you beat.' }
                                    ]
                                }
                            }
                        ]
                    }
                },
                {
                    label: 'Bet 4BB (75%)',
                    score: 75,
                    feedback: 'A bit large for this dry board. Folds out hands you want to call.',
                    next: null
                }
            ]
        }
    },
    {
        id: 'spot-2',
        title: 'SB 3-Bet Pot vs BTN',
        heroHand: 'QhQs',
        heroPos: 'SB',
        villainPos: 'BTN',
        initialPot: 20,
        stackDepth: 100,
        blinds: '0.5/1',
        history: ['Villain (BTN) raises 2.5BB', 'Hero (SB) raises to 9BB', 'Villain calls'],
        tree: {
            id: 'root',
            street: 'flop',
            board: ['Jc', '8d', '4s'],
            villainAction: null, // Hero is first to act
            description: '3-Bet Pot. You Have an Overpair on a Disconnected Board.',
            options: [
                {
                    label: 'Check',
                    score: 60,
                    feedback: 'Not terrible, but betting is standard to deny equity.',
                    next: null
                },
                {
                    label: 'Bet 6BB (30%)',
                    score: 95,
                    feedback: 'Good size. Keeps their range wide.',
                    next: {
                        id: 'turn-2',
                        street: 'turn',
                        card: 'Ac',
                        villainAction: 'call',
                        pot: 32,
                        description: 'Villain Calls. Turn is the Ace of Clubs. You Act First.',
                        options: [
                            {
                                label: 'Check',
                                score: 100,
                                feedback: 'Correct. The Ace favors the caller (BTN). Pot control mode.',
                                next: {
                                    id: 'river-2',
                                    street: 'river',
                                    card: '2d',
                                    villainAction: 'check',
                                    pot: 32,
                                    description: 'Villain Checks Back. River is 2d. You Act First.',
                                    options: [
                                        { label: 'Check', score: 90, feedback: 'Good to check-call or check-fold depending on size.' },
                                        { label: 'Bet 10BB', score: 100, feedback: 'Thin value/blocker bet. Tries to get value from JJ/TT.' }
                                    ]
                                }
                            },
                            {
                                label: 'Bet 16BB (50%)',
                                score: 40,
                                feedback: 'Dangerous. You act into the Ace which connects with their float range.'
                            }
                        ]
                    }
                },
                {
                    label: 'Bet 15BB (75%)',
                    score: 70,
                    feedback: 'Slightly too big. Isolates you against sets and better overpairs.'
                }
            ]
        }
    }
];


// ═══════════════════════════════════════════════════════════════════════════
// SOLVER-GENERATED SCENARIOS (Levels 1-7)
// ═══════════════════════════════════════════════════════════════════════════
// All preflop training scenarios are now generated deterministically from
// PioSolver GTO data via SolverScenarioGenerator.js + solverRanges.js.
// Level 1 (EP opens) through Level 7 (squeeze) are fully solver-accurate.
// ═══════════════════════════════════════════════════════════════════════════

import {
    generateAllSolverScenarios,
    getSolverScenariosForLevel,
    getRandomSolverScenario,
    pickWeightedHandFromScenario,
} from './SolverScenarioGenerator';

import {
    RFI as SOLVER_RFI,
    THREE_BET as SOLVER_3BET,
    BB_DEFENSE as SOLVER_BB_DEF,
    FOUR_BET as SOLVER_4BET,
    SQUEEZE as SOLVER_SQZ,
    COLD_CALL as SOLVER_CC,
    getHandFrequencies as solverGetFreqs,
    getRFIByDepth,
} from '../config/solverRanges';

// Generate all solver scenarios on first load (cached internally)
const _solverScenarios = generateAllSolverScenarios();

// ═══════════════════════════════════════════════════════════════════════════
// COMPATIBILITY EXPORTS — LEVEL_1 through LEVEL_9 for memory-games.js
// All levels now map to solver-generated scenarios from solverRanges.js
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_1_SCENARIOS = _solverScenarios[1] || [];
export const LEVEL_2_SCENARIOS = _solverScenarios[2] || [];
export const LEVEL_3_SCENARIOS = _solverScenarios[3] || [];
export const LEVEL_4_SCENARIOS = _solverScenarios[4] || [];
export const LEVEL_5_SCENARIOS = _solverScenarios[5] || [];
export const LEVEL_6_SCENARIOS = _solverScenarios[6] || [];
export const LEVEL_7_SCENARIOS = _solverScenarios[7] || [];
export const LEVEL_8_SCENARIOS = _solverScenarios[7] || []; // L8 falls back to L7
export const LEVEL_9_SCENARIOS = _solverScenarios[7] || []; // L9 falls back to L7

// ═══════════════════════════════════════════════════════════════════════════
// ALL SCENARIOS — Solver-generated L1-7 + L10
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_SCENARIOS = [
    ...(_solverScenarios[1] || []),
    ...(_solverScenarios[2] || []),
    ...(_solverScenarios[3] || []),
    ...(_solverScenarios[4] || []),
    ...(_solverScenarios[5] || []),
    ...(_solverScenarios[6] || []),
    ...(_solverScenarios[7] || []),
    ...LEVEL_10_SCENARIOS,
];

/**
 * Get scenarios for a specific level.
 * Levels 1-10 come from the solver generator (L1-7 preflop, L8-10 postflop).
 */
export function getScenariosByLevel(level) {
    if (level >= 1 && level <= 10) {
        return getSolverScenariosForLevel(level);
    }
    return ALL_SCENARIOS.filter(s => s.level === level);
}

/**
 * Get a random scenario for a level.
 */
export function getRandomScenario(level) {
    // Solver-generated levels (1-10: L1-7 preflop, L8-10 postflop)
    if (level >= 1 && level <= 10) {
        return getRandomSolverScenario(level);
    }
    const scenarios = getScenariosByLevel(level);
    if (scenarios.length === 0) return null;
    return scenarios[Math.floor(Math.random() * scenarios.length)];
}

export function getLevelConfig(level) {
    return LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLVER-ENRICHED SCENARIO BRIDGE
// All solver-generated scenarios (L1-7) already have enriched data built in.
// This bridge exists for any legacy scenarios (L10) that may still use
// binary solutions without mixed frequencies.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map scenario metadata to the best-matching solver spot.
 * Returns null if no solver data matches (e.g., post-flop or solver-generated scenarios).
 */
function matchSolverSpot(scenario) {
    // Solver-generated scenarios already have enrichedSolution — skip
    if (scenario.solverGenerated) return null;

    const pos = scenario.position;
    const level = scenario.level;
    const title = (scenario.title || '').toLowerCase();

    // Level 1-2: RFI opens — use stack-depth-aware data
    if (level <= 2 && (title.includes('open') || title.includes('rfi'))) {
        const depth = scenario.stackDepth || 100;
        return getRFIByDepth(depth, pos) || SOLVER_RFI[pos] || null;
    }

    // BB Defense
    if (title.includes('bb defense') || title.includes('bb def')) {
        const vsMatch = title.match(/vs\s*(utg|mp|hj|co|btn|sb)/i);
        if (vsMatch) {
            const vsKey = `vs_${vsMatch[1].toUpperCase()}`;
            return SOLVER_BB_DEF[vsKey] || null;
        }
        if (scenario.vsPosition) {
            return SOLVER_BB_DEF[`vs_${scenario.vsPosition}`] || null;
        }
    }

    // 3-bet ranges
    if (title.includes('3-bet') || title.includes('3bet')) {
        const keys = Object.keys(SOLVER_3BET);
        // Try exact match with vsPosition
        if (scenario.vsPosition) {
            const exactKey = `${pos}_vs_${scenario.vsPosition}`;
            if (SOLVER_3BET[exactKey]) return SOLVER_3BET[exactKey];
        }
        for (const key of keys) {
            if (key.toUpperCase().startsWith(pos)) return SOLVER_3BET[key];
        }
    }

    // 4-bet ranges
    if (title.includes('4-bet') || title.includes('4bet')) {
        const keys = Object.keys(SOLVER_4BET);
        for (const key of keys) {
            if (key.toUpperCase().startsWith(pos)) return SOLVER_4BET[key];
        }
    }

    // Squeeze ranges
    if (title.includes('squeeze') || title.includes('sqz')) {
        const keys = Object.keys(SOLVER_SQZ);
        for (const key of keys) {
            if (key.toUpperCase().startsWith(pos)) return SOLVER_SQZ[key];
        }
    }

    // Cold call ranges
    if (title.includes('cold call') || title.includes('flat') || title.includes('cold-call')) {
        const keys = Object.keys(SOLVER_CC);
        if (scenario.vsPosition) {
            const exactKey = `${pos}_vs_${scenario.vsPosition}`;
            if (SOLVER_CC[exactKey]) return SOLVER_CC[exactKey];
        }
        for (const key of keys) {
            if (key.toUpperCase().startsWith(pos)) return SOLVER_CC[key];
        }
    }

    return null;
}

/**
 * Enrich a scenario's binary solution with solver frequencies.
 * Solver-generated scenarios (L2-7) already have enrichedSolution built in,
 * so this is mainly for Level 1 hand-curated scenarios.
 */
export function enrichScenarioWithFrequencies(scenario) {
    if (!scenario || !scenario.solution) return scenario;

    // Solver-generated scenarios already have full frequency data
    if (scenario.solverGenerated && scenario.enrichedSolution) {
        return scenario;
    }

    const solverSpot = matchSolverSpot(scenario);
    if (!solverSpot) return scenario;

    const enrichedSolution = {};
    for (const [hand, action] of Object.entries(scenario.solution)) {
        const solverFreqs = solverGetFreqs(solverSpot, hand);
        enrichedSolution[hand] = {
            primaryAction: action,
            raise: solverFreqs.raise,
            call: solverFreqs.call,
            fold: solverFreqs.fold,
        };
    }

    // Include hands in solver range but NOT in the binary solution
    const allSolverHands = Object.keys(solverSpot);
    for (const hand of allSolverHands) {
        if (!enrichedSolution[hand]) {
            const solverFreqs = solverGetFreqs(solverSpot, hand);
            if (solverFreqs.raise > 0.05 || solverFreqs.call > 0.05) {
                enrichedSolution[hand] = {
                    primaryAction: solverFreqs.raise > solverFreqs.fold ? 'raise' : 'fold',
                    raise: solverFreqs.raise,
                    call: solverFreqs.call,
                    fold: solverFreqs.fold,
                };
            }
        }
    }

    return {
        ...scenario,
        enrichedSolution,
        hasMixedFrequencies: true,
    };
}

/**
 * Get solver-enriched scenarios for a level.
 */
export function getEnrichedScenariosByLevel(level) {
    return getScenariosByLevel(level).map(enrichScenarioWithFrequencies);
}

/**
 * Get a random solver-enriched scenario for a level.
 */
export function getRandomEnrichedScenario(level) {
    const scenario = getRandomScenario(level);
    if (!scenario) return null;
    return enrichScenarioWithFrequencies(scenario);
}

// Re-export pickWeightedHandFromScenario for speed games
export { pickWeightedHandFromScenario };

export default {
    ALL_SCENARIOS,
    getScenariosByLevel,
    getRandomScenario,
    getLevelConfig,
    RANKS,
    getHandName,
    MIXED_SCENARIOS,
    SPOT_SCENARIOS,
    enrichScenarioWithFrequencies,
    getEnrichedScenariosByLevel,
    getRandomEnrichedScenario,
    pickWeightedHandFromScenario,
};
