/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * POSTFLOP SCENARIO GENERATOR — Builds L8-L10 Training Scenarios
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
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
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { DeckEngine, RANK_VALUES, handToCards } from './DeckEngine';
import { analyzeBoard } from './BoardTextureEngine';
import { classifyMadeHand, classifyDraws, evaluateHand } from './HandStrengthEngine';
import { positionContext } from './positionOrder';
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
import { lookupCheckRaiseStrategy } from '../config/postflopSolverData';

// ●● Scenario Templates ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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
 *
 * posContext is DERIVED from the pair of seats, never hand-written: position
 * is a property of the matchup, not of hero's seat. Hard-coding it is how
 * BB vs SB ended up tagged OOP — postflop the SB acts first and the BB acts
 * last, so the BB is IP in a blind-vs-blind pot, and the wrong tag sent every
 * solver lookup for that matchup to the wrong frequency table.
 */
const POSITION_MATCHUPS = [
    // PFR in position (most common and most important)
    { hero: 'BTN', villain: 'BB', context: 'Single Raised Pot — BTN vs BB', isPFR: true },
    { hero: 'CO', villain: 'BB', context: 'Single Raised Pot — CO vs BB', isPFR: true },
    { hero: 'BTN', villain: 'SB', context: 'Single Raised Pot — BTN vs SB', isPFR: true },
    // PFR out of position
    { hero: 'UTG', villain: 'BTN', context: 'Single Raised Pot — UTG vs BTN', isPFR: true },
    { hero: 'MP', villain: 'CO', context: 'Single Raised Pot — MP vs CO', isPFR: true },
    // Caller in position (facing c-bet)
    { hero: 'BTN', villain: 'CO', context: 'Caller IP — BTN cold-called CO open', isPFR: false },
    // Caller out of position (BB defense)
    { hero: 'BB', villain: 'BTN', context: 'BB Defense — called BTN open', isPFR: false },
    { hero: 'BB', villain: 'CO', context: 'BB Defense — called CO open', isPFR: false },
    { hero: 'BB', villain: 'SB', context: 'BB Defense — called SB open', isPFR: false },
    // 3-bet pots
    { hero: 'BB', villain: 'BTN', context: '3-Bet Pot — BB 3-bet vs BTN', isPFR: true },
    { hero: 'BTN', villain: 'BB', context: '3-Bet Pot — BTN called BB 3-bet', isPFR: false },
    { hero: 'SB', villain: 'BTN', context: '3-Bet Pot — SB 3-bet vs BTN', isPFR: true },
].map(m => ({ ...m, posContext: positionContext(m.hero, m.villain) }));

// ●● Board Generation ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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
function resolveHeroCards(handNotation, existingDeadCards = [], seed) {
    const combos = handToCards(handNotation);
    if (!combos || combos.length === 0) return null;

    // Filter combos that don't conflict with dead cards
    const dead = new Set(existingDeadCards);
    const valid = combos.filter(combo => !combo.some(c => dead.has(c)));
    if (valid.length === 0) return null;

    // Deterministic suit choice when a seed is provided (matches board seeding)
    const idx = Number.isFinite(seed)
        ? Math.abs(Math.floor(seed)) % valid.length
        : Math.floor(Math.random() * valid.length);
    return valid[idx];
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// LEVEL 8: FLOP DECISIONS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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
            const heroCards = resolveHeroCards(handNotation, [], seed);
            if (!heroCards) continue;

            const board = generateBoard(heroCards, 3, seed);
            const boardAnalysis = analyzeBoard(board);
            if (boardAnalysis.error) continue;

            const madeHand = classifyMadeHand(heroCards, board);
            const draws = classifyDraws(heroCards, board);
            // Enrich with hand class for granular training
            const handClass = classifyHandClass(heroCards, board);

            // Get GTO strategy — use ENHANCED solver-data lookup
            let strategy;
            if (matchup.isPFR) {
                strategy = getEnhancedCbetStrategy(board, matchup.posContext, heroCards);
            } else {
                // As defender, use the calibrated check-raise matrix so options
                // and correctAction come from the same solver source
                const textureKey = classifyBoardTexture(boardAnalysis);
                const xr = lookupCheckRaiseStrategy(textureKey, handClass);
                strategy = {
                    raiseFreq: xr.raise,
                    callFreq: xr.call,
                    foldFreq: xr.fold,
                    shouldRaise: xr.raise >= xr.call && xr.raise >= xr.fold,
                    raiseSizing: xr.raiseSizing,
                    boardTexture: textureKey,
                    reason: `${handClass} on ${textureKey} — XR ${Math.round(xr.raise * 100)}% / call ${Math.round(xr.call * 100)}% / fold ${Math.round(xr.fold * 100)}%`,
                    isEnhanced: true,
                };
            }

            // Build the options the player will see
            const options = buildFlopOptions(matchup, strategy, madeHand, draws, board, heroCards);

            // Determine the correct action (defender: argmax of the same matrix
            // frequencies buildFlopOptions uses, so the two always agree)
            let correctAction;
            if (matchup.isPFR) {
                correctAction = strategy.shouldBet ? 'bet' : 'check';
            } else {
                const raisePct = Math.round((strategy.raiseFreq || 0) * 100);
                const callPct = Math.round((strategy.callFreq || 0) * 100);
                const foldPct = Math.max(0, 100 - raisePct - callPct);
                const maxPct = Math.max(raisePct, callPct, foldPct);
                correctAction = raisePct === maxPct ? 'raise' : (callPct === maxPct ? 'call' : 'fold');
            }

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
 * Build MULTI-SIZING decision options for a flop scenario.
 * GTO Wizard-style: "Check / Bet 33% / Bet 75%" with separate frequencies per size.
 * Uses the sizeDistribution from enhanced solver data when available.
 */
function buildFlopOptions(matchup, strategy, madeHand, draws, board, heroCards) {
    if (matchup.isPFR) {
        const betFreq = strategy.frequency || 0;
        const checkFreq = Math.round((1 - betFreq) * 100);
        const betFreqPct = Math.round(betFreq * 100);

        // Check if we have multi-size distribution from solver data
        const sizeDist = strategy.sizeDistribution;

        if (sizeDist && Object.keys(sizeDist || {}).length > 1) {
            // ●●● MULTI-SIZING MODE (GTO Wizard-style) ●●●
            // Split the total bet frequency across multiple sizing options
            const sizeLabels = {
                s33: { label: 'Bet 33% Pot', fraction: 0.33 },
                s50: { label: 'Bet 50% Pot', fraction: 0.50 },
                s75: { label: 'Bet 75% Pot', fraction: 0.75 },
                s100: { label: 'Bet Pot', fraction: 1.0 },
                s150: { label: 'Overbet 150%', fraction: 1.5 },
            };

            const options = [
                {
                    label: 'Check',
                    action: 'check',
                    isCorrect: betFreq <= 0.50,
                    frequency: checkFreq,
                    feedback: betFreq <= 0.50
                        ? `Good check. ${strategy.reason}`
                        : `Checking is too passive. ${strategy.reason}`,
                    evDelta: betFreq <= 0.50 ? 0 : -0.5,
                },
            ];

            // Add each sizing option with its share of the total bet frequency
            const sortedSizes = Object.entries(sizeDist || {})
                .filter(([key, wt]) => wt > 0.05 && sizeLabels[key]) // Only show sizes with >5% weight
                .sort((a, b) => {
                    const fracA = sizeLabels[a[0]]?.fraction || 0;
                    const fracB = sizeLabels[b[0]]?.fraction || 0;
                    return fracA - fracB;
                });

            let bestSizeFreq = 0;
            let bestSizeKey = null;

            for (const [sizeKey, weight] of sortedSizes) {
                const sizeInfo = sizeLabels[sizeKey];
                const sizeFreqPct = Math.round(betFreqPct * weight);
                if (sizeFreqPct > bestSizeFreq) {
                    bestSizeFreq = sizeFreqPct;
                    bestSizeKey = sizeKey;
                }
            }

            for (const [sizeKey, weight] of sortedSizes) {
                const sizeInfo = sizeLabels[sizeKey];
                const sizeFreqPct = Math.round(betFreqPct * weight);
                const isBestSize = sizeKey === bestSizeKey;

                options.push({
                    label: sizeInfo.label,
                    action: 'bet',
                    sizing: sizeInfo.fraction,
                    isCorrect: strategy.shouldBet && isBestSize,
                    frequency: sizeFreqPct,
                    feedback: strategy.shouldBet
                        ? (isBestSize
                            ? `Correct sizing! ${sizeInfo.label} is the preferred size here. ${strategy.reason}`
                            : `Betting is right, but ${sizeLabels[bestSizeKey]?.label || 'a different size'} is preferred. ${strategy.reason}`)
                        : `Betting is too aggressive here. ${strategy.reason}`,
                    evDelta: strategy.shouldBet ? (isBestSize ? 0 : -0.15) : -0.5,
                });
            }

            // Normalize frequencies to sum to 100
            const totalFreq = options.reduce((s, o) => s + o.frequency, 0);
            if (totalFreq > 0 && totalFreq !== 100) {
                const scale = 100 / totalFreq;
                options.forEach(o => { o.frequency = Math.round(o.frequency * scale); });
            }

            return options;
        }

        // ●●● SINGLE-SIZE FALLBACK (original behavior) ●●●
        const betSize = strategy.sizing || BET_SIZES.MEDIUM;
        return [
            {
                label: 'Check',
                action: 'check',
                isCorrect: !strategy.shouldBet,
                frequency: checkFreq,
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
                frequency: betFreqPct,
                feedback: strategy.shouldBet
                    ? `Correct! ${strategy.reason}`
                    : `Overbet/bluff. ${strategy.reason}`,
                evDelta: strategy.shouldBet ? 0 : -0.3,
            },
        ];
    } else {
        // Defender options: Check-Raise, Call, Fold
        // Use enhanced XR data if available from solver tables
        const crInfo = strategy.checkRaiseInfo || strategy;
        const raiseFreq = crInfo.raiseFreq || crInfo.frequency || 0;
        const callFreq = crInfo.callFreq || Math.max(0, 1 - raiseFreq - (madeHand.strength < 0.15 && draws.outs < 4 ? 0.30 : 0.10));
        const foldFreq = crInfo.foldFreq || Math.max(0, 1 - raiseFreq - callFreq);

        const raiseFreqPct = Math.round(raiseFreq * 100);
        const callFreqPct = Math.round(callFreq * 100);
        const foldFreqPct = Math.max(0, 100 - raiseFreqPct - callFreqPct);

        // Determine correct action based on highest frequency
        const maxFreq = Math.max(raiseFreqPct, callFreqPct, foldFreqPct);
        const correctAction = raiseFreqPct === maxFreq ? 'raise' : (callFreqPct === maxFreq ? 'call' : 'fold');

        return [
            {
                label: 'Fold',
                action: 'fold',
                isCorrect: correctAction === 'fold',
                frequency: foldFreqPct,
                feedback: correctAction === 'fold'
                    ? `Correct fold. ${madeHand.description} with insufficient equity.`
                    : `Too tight! You have ${madeHand.description}${draws.outs > 0 ? ` + ${draws.description}` : ''}.`,
                evDelta: correctAction === 'fold' ? 0 : -1.0,
            },
            {
                label: 'Call',
                action: 'call',
                isCorrect: correctAction === 'call',
                frequency: callFreqPct,
                feedback: correctAction === 'call'
                    ? `Good call. ${madeHand.description}${draws.outs > 0 ? ` with ${draws.description}` : ''}.`
                    : (correctAction === 'raise' ? `Calling is OK but raising is better here.` : `Too loose. ${madeHand.description}.`),
                evDelta: correctAction === 'call' ? 0 : -0.3,
            },
            {
                label: 'Raise',
                action: 'raise',
                isCorrect: correctAction === 'raise',
                frequency: raiseFreqPct,
                feedback: correctAction === 'raise'
                    ? `Great check-raise! ${crInfo.reason || strategy.reason || ''}`
                    : `Check-raise is too aggressive here. ${crInfo.reason || strategy.reason || ''}`,
                evDelta: correctAction === 'raise' ? 0.5 : -1.5,
            },
        ];
    }
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// LEVEL 9: TURN DECISIONS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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
            const heroCards = resolveHeroCards(handNotation, [], seed);
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

            const options = buildMultiSizeOptions(strategy, 'turn');

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

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// LEVEL 10: RIVER DECISIONS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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
            const heroCards = resolveHeroCards(handNotation, [], seed);
            if (!heroCards) continue;

            const board = generateBoard(heroCards, 5, seed);
            const boardAnalysis = analyzeBoard(board);
            if (boardAnalysis.error) continue;

            const madeHand = classifyMadeHand(heroCards, board);

            // Mix of scenarios: some where hero was aggressor, some where hero checked.
            // Callers (non-PFR) never barreled, so their line is always check/call.
            const prevAction = matchup.isPFR ? (id % 3 === 0 ? 'check' : 'bet') : 'check';

            // Use ENHANCED solver-data lookup for river
            const strategy = getEnhancedRiverStrategy(heroCards, board, matchup.posContext, prevAction);
            const handClass = classifyHandClass(heroCards, board);

            const options = buildRiverOptions(strategy, madeHand, prevAction);

            // Narrative must match hero's role in the hand
            let lineNarrative;
            if (!matchup.isPFR) {
                lineNarrative = 'Hero called the flop and turn.';
            } else if (prevAction === 'bet') {
                lineNarrative = 'Hero bet flop+turn, villain called.';
            } else {
                lineNarrative = 'Both checked to river.';
            }
            let description = `${matchup.context}. ${lineNarrative} Board: ${board.join(' ')}.`;

            // Bluff catchers face a bet: correctAction must match the call/fold
            // option marked isCorrect in buildRiverOptions (strength >= 0.25 → call)
            let correctAction = strategy.action;
            if (strategy.category === 'bluff_catcher') {
                correctAction = madeHand.strength >= 0.25 ? 'call' : 'fold';
                description += ' Villain bets river.';
            }

            scenarios.push({
                id: `l10-river-${matchup.hero.toLowerCase()}-${matchup.villain.toLowerCase()}-${handIdx}`,
                level: 10,
                title: `River: ${handNotation} — ${matchup.context}`,
                description,
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
                correctAction,
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
 * Build multi-sizing options for turn/river bet-or-check scenarios.
 * Uses sizeDistribution from enhanced solver data when available.
 */
function buildMultiSizeOptions(strategy, street) {
    const betFreq = strategy.frequency || 0;
    const checkFreq = Math.round((1 - betFreq) * 100);
    const betFreqPct = Math.round(betFreq * 100);
    const sizeDist = strategy.sizeDistribution;
    const isBet = strategy.action === ACTIONS.BET;

    const sizeLabels = {
        s50: { label: 'Bet 50% Pot', fraction: 0.50 },
        s75: { label: 'Bet 75% Pot', fraction: 0.75 },
        s100: { label: 'Bet Pot', fraction: 1.0 },
        s150: { label: 'Overbet 150%', fraction: 1.5 },
    };

    const options = [
        {
            label: 'Check',
            action: 'check',
            isCorrect: !isBet,
            frequency: checkFreq,
            feedback: !isBet
                ? `Good pot control. ${strategy.reason}`
                : `Too passive — missed value or bluff. ${strategy.reason}`,
            evDelta: !isBet ? 0 : -0.5,
        },
    ];

    if (sizeDist && Object.keys(sizeDist || {}).length > 1) {
        const sortedSizes = Object.entries(sizeDist || {})
            .filter(([key, wt]) => wt > 0.05 && sizeLabels[key])
            .sort((a, b) => (sizeLabels[a[0]]?.fraction || 0) - (sizeLabels[b[0]]?.fraction || 0));

        let bestSizeFreq = 0, bestSizeKey = null;
        for (const [sk, wt] of sortedSizes) {
            const f = Math.round(betFreqPct * wt);
            if (f > bestSizeFreq) { bestSizeFreq = f; bestSizeKey = sk; }
        }

        for (const [sk, wt] of sortedSizes) {
            const si = sizeLabels[sk];
            const freqPct = Math.round(betFreqPct * wt);
            const isBest = sk === bestSizeKey;

            options.push({
                label: si.label,
                action: 'bet',
                sizing: si.fraction,
                isCorrect: isBet && isBest,
                frequency: freqPct,
                feedback: isBet
                    ? (isBest ? `Correct ${street} barrel! ${strategy.reason}` : `Betting is right but ${sizeLabels[bestSizeKey]?.label} is preferred.`)
                    : `This ${street} barrel is too thin. ${strategy.reason}`,
                evDelta: isBet ? (isBest ? 0 : -0.15) : -0.8,
            });
        }
    } else {
        // Single-size fallback
        const sizing = strategy.sizing || BET_SIZES.MEDIUM;
        options.push({
            label: `Bet ${sizing.label}`,
            action: 'bet',
            sizing: sizing.fraction,
            isCorrect: isBet,
            frequency: betFreqPct,
            feedback: isBet ? `Correct ${street} barrel! ${strategy.reason}` : `This barrel is too thin. ${strategy.reason}`,
            evDelta: isBet ? 0 : -0.8,
        });
    }

    // Normalize
    const total = options.reduce((s, o) => s + o.frequency, 0);
    if (total > 0 && total !== 100) {
        const scale = 100 / total;
        options.forEach(o => { o.frequency = Math.round(o.frequency * scale); });
    }

    return options;
}

/**
 * Build decision options for a river scenario — with multi-sizing and bluff-catcher support.
 */
function buildRiverOptions(strategy, madeHand, prevAction) {
    // For value hands and bluffs: multi-sizing bet or check
    if (strategy.category === 'value' || strategy.category === 'bluff') {
        return buildMultiSizeOptions(strategy, 'river');
    }

    // For bluff catchers facing a bet: call/fold
    if (strategy.category === 'bluff_catcher') {
        const callFreq = madeHand.strength >= 0.25 ? 60 : 30;
        const foldFreq = 100 - callFreq;
        return [
            {
                label: 'Call',
                action: 'call',
                isCorrect: madeHand.strength >= 0.25,
                frequency: callFreq,
                feedback: madeHand.strength >= 0.25
                    ? `Good call — ${madeHand.description} is strong enough to bluff-catch.`
                    : `Loose call — ${madeHand.description} is too weak here.`,
                evDelta: madeHand.strength >= 0.25 ? 0.2 : -0.8,
            },
            {
                label: 'Fold',
                action: 'fold',
                isCorrect: madeHand.strength < 0.25,
                frequency: foldFreq,
                feedback: madeHand.strength < 0.25
                    ? `Correct fold. ${madeHand.description} can't beat many value hands.`
                    : `Too tight! ${madeHand.description} is good enough to call.`,
                evDelta: madeHand.strength < 0.25 ? 0 : -0.5,
            },
        ];
    }

    // Default: check or bet
    return buildMultiSizeOptions(strategy, 'river');
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MASTER GENERATOR — All postflop levels
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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
 * GTO Wizard-style spot filtering: position, street, action type, board texture, hand class.
 *
 * @param {number} level - 8, 9, or 10
 * @param {Object} [filter] - Optional filters
 * @param {string} [filter.position] - Hero position (BTN, CO, BB, etc.)
 * @param {string} [filter.vsPosition] - Villain position
 * @param {string} [filter.spotType] - 'cbet', 'check_raise', 'turn_barrel', etc.
 * @param {string} [filter.boardTextureKey] - Solver texture key (e.g., 'dry_rainbow_high')
 * @param {string} [filter.handClass] - Solver hand class (e.g., 'overpair', 'flush_draw')
 * @param {boolean} [filter.isPFR] - Was hero the PFR?
 * @param {string} [filter.posContext] - 'IP' or 'OOP'
 * @param {string} [filter.correctAction] - Filter by GTO correct action
 * @param {string[]} [filter.excludeIds] - Scenario IDs to exclude (already seen)
 * @returns {Object|null} A matching scenario
 */
export function getFilteredPostflopScenario(level, filter = {}) {
    let scenarios = getPostflopScenariosForLevel(level);

    if (filter.position) {
        scenarios = scenarios.filter(s => s.position === filter.position);
    }
    if (filter.vsPosition) {
        scenarios = scenarios.filter(s => s.vsPosition === filter.vsPosition);
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
    if (filter.boardTextureKey) {
        scenarios = scenarios.filter(s => s.boardTextureKey === filter.boardTextureKey);
    }
    if (filter.handClass) {
        scenarios = scenarios.filter(s => s.handClass === filter.handClass);
    }
    if (filter.correctAction) {
        scenarios = scenarios.filter(s => s.correctAction === filter.correctAction);
    }
    if (filter.excludeIds && filter.excludeIds.length > 0) {
        const excludeSet = new Set(filter.excludeIds);
        scenarios = scenarios.filter(s => !excludeSet.has(s.id));
    }

    if (scenarios.length === 0) return null;
    return scenarios[Math.floor(Math.random() * scenarios.length)];
}

/**
 * Get available filter options for a level.
 * Returns what positions, spot types, board textures, etc. are available.
 * Useful for building filter UI dropdowns.
 */
export function getAvailableFilters(level) {
    const scenarios = getPostflopScenariosForLevel(level);

    const positions = new Set();
    const vsPositions = new Set();
    const spotTypes = new Set();
    const boardTextures = new Set();
    const handClasses = new Set();
    const correctActions = new Set();

    for (const s of scenarios) {
        if (s.position) positions.add(s.position);
        if (s.vsPosition) vsPositions.add(s.vsPosition);
        if (s.spotType) spotTypes.add(s.spotType);
        if (s.boardTextureKey) boardTextures.add(s.boardTextureKey);
        if (s.handClass) handClasses.add(s.handClass);
        if (s.correctAction) correctActions.add(s.correctAction);
    }

    return {
        positions: [...positions].sort(),
        vsPositions: [...vsPositions].sort(),
        spotTypes: [...spotTypes].sort(),
        boardTextures: [...boardTextures].sort(),
        handClasses: [...handClasses].sort(),
        correctActions: [...correctActions].sort(),
        totalScenarios: scenarios.length,
    };
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
