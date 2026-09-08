/* ═══════════════════════════════════════════════════════════════════════════
   📊 RANGE AND PRACTICE SCENARIO DATABASE - Progressive Difficulty
   Levels 1-7 use the preflop range catalog. Levels 8-10 are explicitly
   illustrative local postflop practice and are never solver authority.
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
// Now assembled as an authored local reference by SolverScenarioGenerator.js.
// Old hardcoded scenarios removed — LEVEL_1_SCENARIOS populated below
// from the solver generator alongside L2-7.
// ═══════════════════════════════════════════════════════════════════════════
// [REMOVED] ~340 lines of hand-typed Level 1 scenarios without mixed frequencies.
// Replaced by generated preflop range scenarios from solverRanges.js.

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
                                        { label: 'Bet 7BB (33%)', score: 75, feedback: 'Small sizing gets called often but leaves value on the table.' },
                                        { label: 'Bet 15BB (66%)', score: 100, feedback: 'Maximize value! Target KQ, KJ, KT.' },
                                        { label: 'All-In', score: 60, feedback: 'Too ambitious. Folds out everything you beat.' }
                                    ]
                                }
                            },
                            {
                                label: 'Bet 3BB (33%)',
                                score: 82,
                                feedback: 'A reasonable value size, though the turn supports a larger bet.',
                                next: null
                            },
                            {
                                label: 'Bet 11BB (125%)',
                                score: 45,
                                feedback: 'The overbet folds too much of the weaker range you want to keep in.',
                                next: null
                            }
                        ]
                    }
                },
                {
                    label: 'Bet 4BB (75%)',
                    score: 75,
                    feedback: 'A bit large for this dry board. Folds out hands you want to call.',
                    next: null
                },
                {
                    label: 'Bet 7BB (125%)',
                    score: 30,
                    feedback: 'The overbet is unnecessary on this dry board and isolates stronger hands.',
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
                                        { label: 'Bet 8BB (25%)', score: 88, feedback: 'A small blocker bet is reasonable but leaves some value behind.' },
                                        { label: 'Bet 10BB', score: 100, feedback: 'Thin value/blocker bet. Tries to get value from JJ/TT.' },
                                        { label: 'Bet 24BB (75%)', score: 45, feedback: 'The large sizing is called by too many Ax hands and folds out worse pairs.' }
                                    ]
                                }
                            },
                            {
                                label: 'Bet 16BB (50%)',
                                score: 40,
                                feedback: 'Dangerous. You act into the Ace which connects with their float range.'
                            },
                            {
                                label: 'Bet 8BB (25%)',
                                score: 65,
                                feedback: 'Small betting has some merit, but checking protects your range better.'
                            },
                            {
                                label: 'Bet 24BB (75%)',
                                score: 25,
                                feedback: 'The large barrel overplays an underpair on a card that favors the caller.'
                            }
                        ]
                    }
                },
                {
                    label: 'Bet 15BB (75%)',
                    score: 70,
                    feedback: 'Slightly too big. Isolates you against sets and better overpairs.'
                },
                {
                    label: 'Bet 25BB (125%)',
                    score: 25,
                    feedback: 'Overbetting isolates the strongest part of the Button range and folds worse hands.'
                }
            ]
        }
    }
];


// ═══════════════════════════════════════════════════════════════════════════
// AUTHORED LOCAL-REFERENCE SCENARIOS (Levels 1-7)
// ═══════════════════════════════════════════════════════════════════════════
// These preflop practice scenarios are assembled deterministically from the
// authored solverRanges.js reference. The source has no sealed solver artifact
// lineage, so it must never be presented as PioSOLVER or solver-exact output.
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

// Generate all local practice scenarios on first load (cached internally).
const _solverScenarios = generateAllSolverScenarios();

// ═══════════════════════════════════════════════════════════════════════════
// COMPATIBILITY EXPORTS — LEVEL_1 through LEVEL_10 for memory-games.js.
// Levels 8-10 retain the postflop generator's explicit local-practice
// provenance; do not alias them to a preflop level or a hand-written range.
// ═══════════════════════════════════════════════════════════════════════════
export const LEVEL_1_SCENARIOS = _solverScenarios[1] || [];
export const LEVEL_2_SCENARIOS = _solverScenarios[2] || [];
export const LEVEL_3_SCENARIOS = _solverScenarios[3] || [];
export const LEVEL_4_SCENARIOS = _solverScenarios[4] || [];
export const LEVEL_5_SCENARIOS = _solverScenarios[5] || [];
export const LEVEL_6_SCENARIOS = _solverScenarios[6] || [];
export const LEVEL_7_SCENARIOS = _solverScenarios[7] || [];
export const LEVEL_8_SCENARIOS = _solverScenarios[8] || [];
export const LEVEL_9_SCENARIOS = _solverScenarios[9] || [];
export const LEVEL_10_SCENARIOS = _solverScenarios[10] || [];

// ═══════════════════════════════════════════════════════════════════════════
// ALL SCENARIOS — Preflop range catalog + illustrative postflop practice
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_SCENARIOS = [
    ...(_solverScenarios[1] || []),
    ...(_solverScenarios[2] || []),
    ...(_solverScenarios[3] || []),
    ...(_solverScenarios[4] || []),
    ...(_solverScenarios[5] || []),
    ...(_solverScenarios[6] || []),
    ...(_solverScenarios[7] || []),
    ...LEVEL_8_SCENARIOS,
    ...LEVEL_9_SCENARIOS,
    ...LEVEL_10_SCENARIOS,
];

/**
 * Get scenarios for a specific level.
 * Levels 1-7 are preflop range scenarios. Levels 8-10 are illustrative local
 * postflop practice with explicit non-authoritative provenance.
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
    // Combined catalog: preflop ranges plus illustrative local postflop practice.
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
// PREFLOP RANGE ENRICHMENT BRIDGE
// Generated preflop scenarios already have enriched data built in. This bridge
// exists only for older binary preflop range objects; postflop local practice
// must keep its own non-authoritative provenance and is never enriched here.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map legacy scenario metadata to the best-matching authored reference spot.
 * Returns null if no authored reference matches (for example, postflop data or
 * a scenario that already carries its complete reference frequencies).
 */
function matchAuthoredRangeSpot(scenario) {
    // Current authored-reference scenarios already have enrichedSolution.
    if (scenario.authority === 'authored_local_reference' && scenario.enrichedSolution) return null;

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
        const keys = Object.keys(SOLVER_3BET || {});
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
        const keys = Object.keys(SOLVER_4BET || {});
        for (const key of keys) {
            if (key.toUpperCase().startsWith(pos)) return SOLVER_4BET[key];
        }
    }

    // Squeeze ranges
    if (title.includes('squeeze') || title.includes('sqz')) {
        const keys = Object.keys(SOLVER_SQZ || {});
        for (const key of keys) {
            if (key.toUpperCase().startsWith(pos)) return SOLVER_SQZ[key];
        }
    }

    // Cold call ranges
    if (title.includes('cold call') || title.includes('flat') || title.includes('cold-call')) {
        const keys = Object.keys(SOLVER_CC || {});
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
 * Enrich a legacy scenario's binary solution with authored-reference frequencies.
 * Current Levels 1-7 already have enrichedSolution built in, so this bridge is
 * retained only for older local preflop scenario shapes.
 */
export function enrichScenarioWithFrequencies(scenario) {
    if (!scenario || !scenario.solution) return scenario;

    // Current authored-reference scenarios already have full frequency data.
    if (scenario.authority === 'authored_local_reference' && scenario.enrichedSolution) {
        return scenario;
    }

    const referenceSpot = matchAuthoredRangeSpot(scenario);
    if (!referenceSpot) return scenario;

    const enrichedSolution = {};
    for (const [hand, action] of Object.entries(scenario.solution || {})) {
        const referenceFreqs = solverGetFreqs(referenceSpot, hand);
        enrichedSolution[hand] = {
            primaryAction: action,
            raise: referenceFreqs.raise,
            call: referenceFreqs.call,
            fold: referenceFreqs.fold,
        };
    }

    // Include hands in the authored reference but not in the binary solution.
    const allReferenceHands = Object.keys(referenceSpot || {});
    for (const hand of allReferenceHands) {
        if (!enrichedSolution[hand]) {
            const referenceFreqs = solverGetFreqs(referenceSpot, hand);
            if (referenceFreqs.raise > 0.05 || referenceFreqs.call > 0.05) {
                enrichedSolution[hand] = {
                    primaryAction: referenceFreqs.raise > referenceFreqs.fold ? 'raise' : 'fold',
                    raise: referenceFreqs.raise,
                    call: referenceFreqs.call,
                    fold: referenceFreqs.fold,
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
 * Get authored-reference-enriched scenarios for a level.
 */
export function getEnrichedScenariosByLevel(level) {
    return getScenariosByLevel(level).map(enrichScenarioWithFrequencies);
}

/**
 * Get a random authored-reference-enriched scenario for a level.
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
