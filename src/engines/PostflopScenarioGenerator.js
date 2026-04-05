/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POSTFLOP SCENARIO GENERATOR — Builds L8-L10 Training Scenarios
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Generates postflop training scenarios with GTO-correct solutions:
 *   Level 8:  Flop decisions (c-bet, check-raise, float)
 *   Level 9:  Turn decisions (barrel, give up, raise)
 *   Level 10: River decisions (value bet, bluff, hero call)
 *
 * Each scenario includes:
 *   - Realistic board, hero cards, and positional context
 *   - Multiple decision options with GTO frequencies
 *   - Board texture analysis
 *   - Hand strength classification
 *   - Correct action + EV reasoning
 *
 * Integrates with the existing SolverScenarioGenerator pipeline
 * so L8-10 work identically to L1-7 in the training UI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { DeckEngine, RANK_VALUES, handToCards } from './DeckEngine';
import { analyzeBoard } from './BoardTextureEngine';
import { classifyMadeHand, classifyDraws, evaluateHand } from './HandStrengthEngine';
import {
    getCbetStrategy,
    getCheckRaiseStrategy,
    getTurnStrategy,
    getRiverStrategy,
    getFacingBetStrategy,
    getPostflopStrategy,
    getEnhancedCbetStrategy,
    getEnhancedTurnStrategy,
    getEnhancedRiverStrategy,
    getEnhancedFacingBetStrategy,
    classifyHandClass,
    classifyBoardTexture,
    BET_SIZES,
    ACTIONS,
} from './PostflopStrategyEngine';

// ── Scenario Templates ───────────────────────────────────────────────────

/**
 * Curated starting hands for scenario generation.
 * Mix of premium, broadway, suited connectors, and speculative hands.
 */
const HERO_HANDS = [
    // Premium
    'AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs',
    // Strong broadway
    'KQs', 'KJs', 'KQo', 'QJs', 'ATs', 'AJo', 'KTs',
    // Medium pairs
    '99', '88', '77', '66', '55',
    // Suited connectors
    'JTs', 'T9s', '98s', '87s', '76s', '65s',
    // Suited aces
    'A5s', 'A4s', 'A3s', 'A2s', 'A9s', 'A8s',
    // Medium broadway
    'QTs', 'J9s', 'T8s', 'KJo', 'QJo',
    // Speculative
    '97s', '86s', '75s', '54s', 'K9s',
];

/**
 * Position matchups for postflop scenarios.
 * Format: { hero, villain, context, isPFR }
 */
const POSITION_MATCHUPS = [
    // PFR in position (most common and most important)
    { hero: 'BTN', villain: 'BB', context: 'Single Raised Pot — BTN vs BB', isPFR: true, posContext: 'IP' },
    { hero: 'CO', villain: 'BB', context: 'Single Raised Pot — CO vs BB', isPFR: true, posContext: 'IP' },
    { hero: 'BTN', villain: 'SB', context: 'Single Raised Pot — BTN vs SB', isPFR: true, posContext: 'IP' },
    // PFR out of position
    { hero: 'UTG', villain: 'BTN', context: 'Single Raised Pot — UTG vs BTN', isPFR: true, posContext: 'OOP' },
    { hero: 'MP', villain: 'CO', context: 'Single Raised Pot — MP vs CO', isPFR: true, posContext: 'OOP' },
    // Caller in position (facing c-bet)
    { hero: 'BTN', villain: 'CO', context: 'Caller IP — BTN cold-called CO open', isPFR: false, posContext: 'IP' },
    // Caller out of position (BB defense)
    { hero: 'BB', villain: 'BTN', context: 'BB Defense — called BTN open', isPFR: false, posContext: 'OOP' },
    { hero: 'BB', villain: 'CO', context: 'BB Defense — called CO open', isPFR: false, posContext: 'OOP' },
    { hero: 'BB', villain: 'SB', context: 'BB Defense — called SB open', isPFR: false, posContext: 'OOP' },
    // 3-bet pots
    { hero: 'BB', villain: 'BTN', context: '3-Bet Pot — BB 3-bet vs BTN', isPFR: true, posContext: 'OOP' },
    { hero: 'BTN', villain: 'BB', context: '3-Bet Pot — BTN called BB 3-bet', isPFR: false, posContext: 'IP' },
    { hero: 'SB', villain: 'BTN', context: '3-Bet Pot — SB 3-bet vs BTN', isPFR: true, posContext: 'OOP' },
];

// ── Board Generation ─────────────────────────────────────────────────────

/**
 * Generate a realistic board with specific texture characteristics.
 * Uses DeckEngine with dead cards (hero's hand removed).
 *
 * @param {string[]} heroCards - Hero's actual cards
 * @param {number} numCards - 3 (flop), 4 (turn), 5 (river)
 * @param {number} [seed] - Optional seed for reproducibility
 * @returns {string[]} Board cards
 */
function generateBoard(heroCards, numCards, seed) {
    const deck = new DeckEngine({ seed: seed || Date.now(), deadCards: heroCards });
    const flop = deck.dealFlop();
    if (numCards === 3) return flop;
    const turn = deck.dealTurn();
    if (numCards === 4) return [...flop, ...turn];
    const river = deck.dealRiver();
    return [...flop, ...turn, ...river];
}

/**
 * Convert hand notation (e.g., "AKs") to specific cards,
 * picking random suits that don't conflict with the board.
 */
function resolveHeroCards(handNotation, existingDeadCards = []) {
    const combos = handToCards(handNotation);
    if (!combos || combos.length === 0) return null;

    // Filter combos that don't conflict with dead cards
    const dead = new Set(existingDeadCards);
    const valid = combos.filter(combo => !combo.some(c => dead.has(c)));
    if (valid.length === 0) return null;

    return valid[Math.floor(Math.random() * valid.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 8: FLOP DECISIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate Level 8 scenarios — Flop play.
 * Covers: c-betting, check-raising, floating, folding to c-bet.
 */
export function generateLevel8() {
    const scenarios = [];
    let id = 0;

    for (const matchup of POSITION_MATCHUPS) {
        for (let handIdx = 0; handIdx < HERO_HANDS.length; handIdx++) {
            const handNotation = HERO_HANDS[handIdx];
            const seed = 8000 + id * 7 + handIdx * 13; // deterministic but varied
            const heroCards = resolveHeroCards(handNotation);
            if (!heroCards) continue;

            const board = generateBoard(heroCards, 3, seed);
            const boardAnalysis = analyzeBoard(board);
            if (boardAnalysis.error) continue;

            const madeHand = classifyMadeHand(heroCards, board);
            const draws = classifyDraws(heroCards, board);

            // Get GTO strategy — use ENHANCED solver-data lookup
            let strategy;
            if (matchup.isPFR) {
                strategy = getEnhancedCbetStrategy(board, matchup.posContext, heroCards);
            } else {
                // As defender, the primary decision is check-raise vs call vs fold
                strategy = getCheckRaiseStrategy(board, heroCards, 0.33);
            }
            // Enrich with hand class for granular training
            const handClass = classifyHandClass(heroCards, board);

            // Build the options the player will see
            const options = buildFlopOptions(matchup, strategy, madeHand, draws, board, heroCards);

            // Determine the correct action
            const correctAction = matchup.isPFR
                ? (strategy.shouldBet ? 'bet' : 'check')
                : (strategy.shouldRaise ? 'raise' : (madeHand.strength >= 0.15 || draws.outs >= 4 ? 'call' : 'fold'));

            scenarios.push({
                id: `l8-${matchup.hero.toLowerCase()}-${matchup.villain.toLowerCase()}-${handIdx}`,
                level: 8,
                title: `Flop: ${handNotation} — ${matchup.context}`,
                description: `${matchup.context}. Board: ${board.join(' ')} (${boardAnalysis.description}).`,
                tip: strategy.reason,
                heroCards,
                heroHand: handNotation,
                board,
                street: 'flop',
                position: matchup.hero,
                vsPosition: matchup.villain,
                posContext: matchup.posContext,
                isPFR: matchup.isPFR,
                stackDepth: 100,
                spotType: matchup.isPFR ? 'cbet' : 'check_raise',
                boardTexture: boardAnalysis,
                boardTextureKey: strategy.boardTexture || classifyBoardTexture(boardAnalysis),
                handClass,
                madeHand,
                draws,
                options,
                correctAction,
                strategy,
                sizeDistribution: strategy.sizeDistribution || null,
                solverGenerated: true,
                hasMixedFrequencies: true,
                isEnhanced: strategy.isEnhanced || false,
            });

            id++;
            // Cap scenarios per matchup to keep things manageable
            if (id % HERO_HANDS.length === 0 && scenarios.length > 500) break;
        }
        if (scenarios.length > 500) break;
    }

    return scenarios;
}

/**
 * Build the decision options for a flop scenario
 */
function buildFlopOptions(matchup, strategy, madeHand, draws, board, heroCards) {
    if (matchup.isPFR) {
        // PFR options: Bet (various sizes) or Check
        const betSize = strategy.sizing;
        return [
            {
                label: 'Check',
                action: 'check',
                isCorrect: !strategy.shouldBet,
                frequency: Math.round((1 - strategy.frequency) * 100),
                feedback: strategy.shouldBet
                    ? `Checking is too passive. ${strategy.reason}`
                    : `Good check. ${strategy.reason}`,
                evDelta: strategy.shouldBet ? -0.5 : 0,
            },
            {
                label: `Bet ${betSize.label}`,
                action: 'bet',
                sizing: betSize.fraction,
                isCorrect: strategy.shouldBet,
                frequency: Math.round(strategy.frequency * 100),
                feedback: strategy.shouldBet
                    ? `Correct! ${strategy.reason}`
                    : `Overbet/bluff. ${strategy.reason}`,
                evDelta: strategy.shouldBet ? 0 : -0.3,
            },
        ];
    } else {
        // Defender options: Check-Raise, Call, Fold
        const crStrategy = strategy;
        const callFreq = Math.max(0, 100 - Math.round(crStrategy.frequency * 100) - (madeHand.strength < 0.15 && draws.outs < 4 ? 30 : 10));

        return [
            {
                label: 'Fold',
                action: 'fold',
                isCorrect: madeHand.strength < 0.15 && draws.outs < 4,
                frequency: Math.max(0, 100 - callFreq - Math.round(crStrategy.frequency * 100)),
                feedback: madeHand.strength < 0.15 && draws.outs < 4
                    ? `Correct fold. ${madeHand.description} with no draws.`
                    : `Too tight! You have ${madeHand.description}${draws.outs > 0 ? ` + ${draws.description}` : ''}.`,
                evDelta: madeHand.strength < 0.15 && draws.outs < 4 ? 0 : -1.0,
            },
            {
                label: 'Call',
                action: 'call',
                isCorrect: !crStrategy.shouldRaise && (madeHand.strength >= 0.15 || draws.outs >= 4),
                frequency: callFreq,
                feedback: `Call. ${madeHand.description}${draws.outs > 0 ? ` with ${draws.description}` : ''}.`,
                evDelta: 0,
            },
            {
                label: 'Raise',
                action: 'raise',
                isCorrect: crStrategy.shouldRaise,
                frequency: Math.round(crStrategy.frequency * 100),
                feedback: crStrategy.shouldRaise
                    ? `Great check-raise! ${crStrategy.reason}`
                    : `Check-raise is too aggressive here. ${crStrategy.reason}`,
                evDelta: crStrategy.shouldRaise ? 0.5 : -1.5,
            },
        ];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 9: TURN DECISIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate Level 9 scenarios — Turn play.
 * Covers: barreling, giving up, turn raises, pot control.
 */
export function generateLevel9() {
    const scenarios = [];
    let id = 0;

    // Subset of matchups and hands for turn (since each has a flop + turn)
    const turnMatchups = POSITION_MATCHUPS.filter(m => m.isPFR).slice(0, 6);

    for (const matchup of turnMatchups) {
        for (let handIdx = 0; handIdx < HERO_HANDS.length; handIdx++) {
            const handNotation = HERO_HANDS[handIdx];
            const seed = 9000 + id * 11 + handIdx * 17;
            const heroCards = resolveHeroCards(handNotation);
            if (!heroCards) continue;

            const board = generateBoard(heroCards, 4, seed);
            const boardAnalysis = analyzeBoard(board);
            if (boardAnalysis.error) continue;

            const madeHand = classifyMadeHand(heroCards, board);
            const draws = classifyDraws(heroCards, board);

            // Assume hero c-bet flop (most common turn barrel scenario)
            // Use ENHANCED solver-data lookup for turn barrel
            const strategy = getEnhancedTurnStrategy(heroCards, board, 'bet', matchup.posContext);
            const handClass = classifyHandClass(heroCards, board);

            const options = [
                {
                    label: 'Check',
                    action: 'check',
                    isCorrect: strategy.action === ACTIONS.CHECK,
                    frequency: Math.round((1 - strategy.frequency) * 100),
                    feedback: strategy.action === ACTIONS.CHECK
                        ? `Good pot control. ${strategy.reason}`
                        : `Too passive — missed value or bluff opportunity. ${strategy.reason}`,
                    evDelta: strategy.action === ACTIONS.CHECK ? 0 : -0.5,
                },
                {
                    label: `Bet ${strategy.sizing.label}`,
                    action: 'bet',
                    sizing: strategy.sizing.fraction,
                    isCorrect: strategy.action === ACTIONS.BET,
                    frequency: Math.round(strategy.frequency * 100),
                    feedback: strategy.action === ACTIONS.BET
                        ? `Correct barrel! ${strategy.reason}`
                        : `This barrel is too thin. ${strategy.reason}`,
                    evDelta: strategy.action === ACTIONS.BET ? 0 : -0.8,
                },
            ];

            scenarios.push({
                id: `l9-turn-${matchup.hero.toLowerCase()}-${matchup.villain.toLowerCase()}-${handIdx}`,
                level: 9,
                title: `Turn: ${handNotation} — ${matchup.context}`,
                description: `${matchup.context}. Hero c-bet flop, villain called. Board: ${board.join(' ')} (${boardAnalysis.description}).`,
                tip: strategy.reason,
                heroCards,
                heroHand: handNotation,
                board,
                street: 'turn',
                position: matchup.hero,
                vsPosition: matchup.villain,
                posContext: matchup.posContext,
                isPFR: matchup.isPFR,
                stackDepth: 100,
                spotType: 'turn_barrel',
                boardTexture: boardAnalysis,
                handClass,
                madeHand,
                draws,
                options,
                correctAction: strategy.action,
                strategy,
                sizeDistribution: strategy.sizeDistribution || null,
                flopAction: 'bet',
                solverGenerated: true,
                hasMixedFrequencies: true,
                isEnhanced: strategy.isEnhanced || false,
            });

            id++;
            if (scenarios.length > 400) break;
        }
        if (scenarios.length > 400) break;
    }

    return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 10: RIVER DECISIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate Level 10 scenarios — River play.
 * Covers: value betting, bluffing, hero calls, thin value, river raises.
 */
export function generateLevel10() {
    const scenarios = [];
    let id = 0;

    const riverMatchups = POSITION_MATCHUPS.slice(0, 8);

    for (const matchup of riverMatchups) {
        for (let handIdx = 0; handIdx < HERO_HANDS.length; handIdx++) {
            const handNotation = HERO_HANDS[handIdx];
            const seed = 10000 + id * 13 + handIdx * 19;
            const heroCards = resolveHeroCards(handNotation);
            if (!heroCards) continue;

            const board = generateBoard(heroCards, 5, seed);
            const boardAnalysis = analyzeBoard(board);
            if (boardAnalysis.error) continue;

            const madeHand = classifyMadeHand(heroCards, board);

            // Mix of scenarios: some where hero was aggressor, some where hero checked
            const prevAction = id % 3 === 0 ? 'check' : 'bet';

            // Use ENHANCED solver-data lookup for river
            const strategy = getEnhancedRiverStrategy(heroCards, board, matchup.posContext, prevAction);
            const handClass = classifyHandClass(heroCards, board);

            const options = buildRiverOptions(strategy, madeHand, prevAction);

            scenarios.push({
                id: `l10-river-${matchup.hero.toLowerCase()}-${matchup.villain.toLowerCase()}-${handIdx}`,
                level: 10,
                title: `River: ${handNotation} — ${matchup.context}`,
                description: `${matchup.context}. ${prevAction === 'bet' ? 'Hero bet flop+turn, villain called.' : 'Both checked to river.'} Board: ${board.join(' ')}.`,
                tip: strategy.reason,
                heroCards,
                heroHand: handNotation,
                board,
                street: 'river',
                position: matchup.hero,
                vsPosition: matchup.villain,
                posContext: matchup.posContext,
                isPFR: matchup.isPFR,
                stackDepth: 100,
                spotType: `river_${strategy.category}`,
                boardTexture: boardAnalysis,
                boardState: strategy.boardState || null,
                handClass,
                madeHand,
                options,
                correctAction: strategy.action,
                strategy,
                sizeDistribution: strategy.sizeDistribution || null,
                prevAction,
                solverGenerated: true,
                hasMixedFrequencies: true,
                isEnhanced: strategy.isEnhanced || false,
            });

            id++;
            if (scenarios.length > 400) break;
        }
        if (scenarios.length > 400) break;
    }

    return scenarios;
}

/**
 * Build decision options for a river scenario
 */
function buildRiverOptions(strategy, madeHand, prevAction) {
    const options = [
        {
            label: 'Check',
            action: 'check',
            isCorrect: strategy.action === ACTIONS.CHECK,
            frequency: Math.round((1 - strategy.frequency) * 100),
            feedback: strategy.action === ACTIONS.CHECK
                ? `Correct. ${strategy.reason}`
                : `Missed value or bluff. ${strategy.reason}`,
            evDelta: strategy.action === ACTIONS.CHECK ? 0 : -0.5,
        },
    ];

    // Add bet options based on hand category
    if (strategy.category === 'value' || strategy.category === 'bluff') {
        options.push({
            label: `Bet ${strategy.sizing.label}`,
            action: 'bet',
            sizing: strategy.sizing.fraction,
            isCorrect: strategy.action === ACTIONS.BET,
            frequency: Math.round(strategy.frequency * 100),
            feedback: strategy.action === ACTIONS.BET
                ? `${strategy.category === 'value' ? 'Value bet' : 'Bluff'} — ${strategy.reason}`
                : `Bad ${strategy.category === 'value' ? 'value' : 'bluff'}. ${strategy.reason}`,
            evDelta: strategy.action === ACTIONS.BET ? 0.3 : -1.0,
        });
    }

    // For bluff catchers facing a bet, add call/fold
    if (strategy.category === 'bluff_catcher') {
        options.push(
            {
                label: 'Call',
                action: 'call',
                isCorrect: madeHand.strength >= 0.25,
                frequency: madeHand.strength >= 0.25 ? 60 : 30,
                feedback: madeHand.strength >= 0.25
                    ? `Good call — ${madeHand.description} is strong enough to bluff-catch.`
                    : `Loose call — ${madeHand.description} is too weak here.`,
                evDelta: madeHand.strength >= 0.25 ? 0.2 : -0.8,
            },
            {
                label: 'Fold',
                action: 'fold',
                isCorrect: madeHand.strength < 0.25,
                frequency: madeHand.strength < 0.25 ? 70 : 40,
                feedback: madeHand.strength < 0.25
                    ? `Correct fold. ${madeHand.description} can\'t beat many value hands.`
                    : `Too tight! ${madeHand.description} is good enough to call.`,
                evDelta: madeHand.strength < 0.25 ? 0 : -0.5,
            },
        );
    }

    return options;
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER GENERATOR — All postflop levels
// ═══════════════════════════════════════════════════════════════════════════

let _cachedPostflopScenarios = null;

/**
 * Generate all postflop scenarios for levels 8-10.
 * Results are cached after first call.
 *
 * @returns {{ 8: Array, 9: Array, 10: Array }}
 */
export function generateAllPostflopScenarios() {
    if (_cachedPostflopScenarios) return _cachedPostflopScenarios;

    _cachedPostflopScenarios = {
        8: generateLevel8(),
        9: generateLevel9(),
        10: generateLevel10(),
    };

    return _cachedPostflopScenarios;
}

/**
 * Get postflop scenarios for a specific level.
 */
export function getPostflopScenariosForLevel(level) {
    const all = generateAllPostflopScenarios();
    return all[level] || [];
}

/**
 * Get a random postflop scenario for a level.
 */
export function getRandomPostflopScenario(level) {
    const scenarios = getPostflopScenariosForLevel(level);
    if (scenarios.length === 0) return null;
    return scenarios[Math.floor(Math.random() * scenarios.length)];
}

/**
 * Get a postflop scenario filtered by criteria.
 *
 * @param {number} level - 8, 9, or 10
 * @param {Object} [filter] - Optional filters
 * @param {string} [filter.position] - Hero position
 * @param {string} [filter.spotType] - 'cbet', 'check_raise', 'turn_barrel', etc.
 * @param {string} [filter.boardTexture] - Board description match
 * @param {boolean} [filter.isPFR] - Was hero the PFR?
 * @returns {Object|null} A matching scenario
 */
export function getFilteredPostflopScenario(level, filter = {}) {
    let scenarios = getPostflopScenariosForLevel(level);

    if (filter.position) {
        scenarios = scenarios.filter(s => s.position === filter.position);
    }
    if (filter.spotType) {
        scenarios = scenarios.filter(s => s.spotType === filter.spotType);
    }
    if (filter.isPFR !== undefined) {
        scenarios = scenarios.filter(s => s.isPFR === filter.isPFR);
    }
    if (filter.posContext) {
        scenarios = scenarios.filter(s => s.posContext === filter.posContext);
    }

    if (scenarios.length === 0) return null;
    return scenarios[Math.floor(Math.random() * scenarios.length)];
}

/**
 * Clear the cached scenarios (useful if the strategy engine is updated).
 */
export function clearPostflopCache() {
    _cachedPostflopScenarios = null;
}

export default {
    generateLevel8,
    generateLevel9,
    generateLevel10,
    generateAllPostflopScenarios,
    getPostflopScenariosForLevel,
    getRandomPostflopScenario,
    getFilteredPostflopScenario,
    clearPostflopCache,
};
