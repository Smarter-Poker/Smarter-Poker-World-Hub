/**
 * DETERMINISTIC GTO ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * Pure solver-driven question generation — NO Grok AI, NO randomness in data.
 * Uses solved_spots_gold (187k+ records) and memory_charts_gold for real PIO data.
 *
 * This engine replaces the Grok-AI-dependent question generation pipeline with
 * a deterministic, mathematically accurate GTO training system.
 *
 * Input:  { gameId, level, seenQuestionIds }
 * Output: { question with real frequencies, EVs, correct actions from solver }
 * ═══════════════════════════════════════════════════════════════════════════
 */



import { supabase } from '../lib/supabase';
import {
    RFI as SOLVER_RFI,
    THREE_BET as SOLVER_3BET,
    BB_DEFENSE as SOLVER_BB_DEF,
    FOUR_BET as SOLVER_4BET,
    COLD_CALL as SOLVER_CC,
    SQUEEZE as SOLVER_SQZ,
    ALL_HANDS as SOLVER_ALL_HANDS,
    getHandFrequencies as solverGetFreqs,
    getRFIByDepth,
} from '../config/solverRanges';

// ═══ POSTFLOP ENGINE INTEGRATION (L8-L10) ═══
import {
    getRandomPostflopScenario,
    getFilteredPostflopScenario,
    generateAllPostflopScenarios,
} from './PostflopScenarioGenerator';
import { calculateActionEVs } from './EVCalculator';
import { heroActsFirstPostflop as actsFirstPostflop, heroIsInPosition } from './positionOrder';

// ═══ SCENARIO/PSYCHOLOGY ENGINE (psy-001..psy-020, cash-020) ═══
import { getPsychologyQuestions } from '../data/psychologyQuestionBank';

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CODE → HUMAN-READABLE LABEL MAPPING
// ═══════════════════════════════════════════════════════════════════════════
const ACTION_LABELS = {
    'c': 'Check', 'x': 'Check', 'f': 'Fold',
    'b16': 'Bet 16%', 'b20': 'Bet 20%', 'b25': 'Bet 25%',
    'b33': 'Bet 33%', 'b40': 'Bet 40%', 'b45': 'Bet 45%',
    'b50': 'Bet 50%', 'b55': 'Bet 55%', 'b60': 'Bet 60%',
    'b66': 'Bet 67%', 'b75': 'Bet 75%', 'b80': 'Bet 80%',
    'b100': 'Bet Pot', 'b125': 'Bet 125%', 'b150': 'Overbet 150%',
    'b200': 'Overbet 200%', 'b300': 'Overbet 300%',
    'allin': 'All-In', 'r': 'Raise',
    'r50': 'Raise 50%', 'r75': 'Raise 75%', 'r100': 'Raise Pot',
    'r200': 'Raise 200%', 'r300': 'Raise 300%',
};

// ═══════════════════════════════════════════════════════════════════════════
// HAND-STRENGTH TOKEN VOCABULARY
// ═══════════════════════════════════════════════════════════════════════════
// GTOW parity #33. Two representations of "how strong is this hand" coexist in
// this engine: categorizeHand() returns free prose for display ("top pair, top
// kicker"), while the deeper coaching notes switch on snake_case tokens
// ("top_pair_top_kicker"). _getHandToken() is the bridge, but it was only ever
// applied at some call sites, so the rest silently never matched and their
// advice was dead code.
//
// This set is what makes _getHandToken() idempotent: handed a value that is
// ALREADY a token, it returns it untouched instead of running prose tests that
// all fail on the underscores and falling through to 'air'. That property is
// what lets the normaliser be applied everywhere without breaking the call
// sites that were already passing tokens.
//
// It deliberately includes names _getHandToken never emits (second_nuts, trips,
// third_pair, premium_pair, ...). Those are produced elsewhere and consumed by
// the comparison arrays below; they must pass through, not be reclassified.
const _HAND_TOKENS = new Set([
    'nuts', 'second_nuts', 'full_house', 'flush', 'straight', 'set', 'trips',
    'two_pair', 'overpair', 'premium_pair',
    'top_pair_top_kicker', 'top_pair', 'top_pair_weak_kicker',
    'middle_pair', 'second_pair', 'third_pair', 'bottom_pair', 'weak_pair', 'underpair',
    'combo_draw', 'flush_draw', 'backdoor_flush_draw', 'oesd', 'gutshot', 'overcards',
    'high_card', 'ace_high', 'missed_draw', 'air',
]);

// ═══════════════════════════════════════════════════════════════════════════
// POSITION & GAME CONTEXT
// ═══════════════════════════════════════════════════════════════════════════
const POSITIONS_9MAX = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const POSITIONS_6MAX = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const POSITIONS_3MAX = ['BTN', 'SB', 'BB'];

const VILLAIN_MAP = {
    'BTN': 'BB', 'SB': 'BB', 'BB': 'BTN', 'UTG': 'BB',
    'MP': 'BB', 'CO': 'BTN', 'HJ': 'CO', 'UTG+1': 'BB', 'MP+1': 'BB'
};

const POT_BY_STREET = {
    'preflop': 2.5, 'flop': 6, 'turn': 14, 'river': 30
};

// ═══════════════════════════════════════════════════════════════════════════
// CARD UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

/**
 * Parse a hand notation like "AKs" or "AA" into two card strings for display.
 * e.g., "AKs" → ["As", "Ks"], "AA" → ["Ah", "As"], "T9o" → ["Ts", "9h"]
 * IMP-2 FIX: Avoids card collisions with the board.
 */
function parseHandToCards(hand, boardCards = []) {
    if (!hand || hand.length < 2) return ['As', 'Ks'];

    const r1 = hand[0];
    const r2 = hand[1];
    const suffix = hand.length >= 3 ? hand[2] : '';
    const usedSuits = new Set(boardCards.map(c => (c && c.length >= 2) ? c[1].toLowerCase() : ''));

    // Find an available suit that doesn't collide with board cards of the same rank
    const findSafeSuit = (rank, preferredSuits) => {
        for (const s of preferredSuits) {
            const card = `${rank}${s}`.toLowerCase();
            if (!boardCards.some(bc => bc && bc.toLowerCase() === card)) return s;
        }
        return preferredSuits[0]; // fallback
    };

    if (r1 === r2) {
        // Pair: use two different suits, avoiding board collisions
        const s1 = findSafeSuit(r1, ['h', 's', 'd', 'c']);
        const s2 = findSafeSuit(r2, ['s', 'h', 'd', 'c'].filter(s => s !== s1));
        return [`${r1}${s1}`, `${r2}${s2}`];
    } else if (suffix === 's') {
        // Suited: same suit, pick one that doesn't collide
        const safeSuit = findSafeSuit(r1, ['s', 'h', 'd', 'c']);
        return [`${r1}${safeSuit}`, `${r2}${safeSuit}`];
    } else {
        // Offsuit: different suits
        const s1 = findSafeSuit(r1, ['s', 'd', 'h', 'c']);
        const s2 = findSafeSuit(r2, ['h', 'c', 'd', 's'].filter(s => s !== s1));
        return [`${r1}${s1}`, `${r2}${s2}`];
    }
}

/**
 * Parse board cards from scenario_hash
 * "hu_cash_BTN_100bb_3h7c7s" → ["3h", "7c", "7s"]
 */
function parseBoardFromHash(scenarioHash) {
    if (!scenarioHash) return [];
    const parts = scenarioHash.split('_');
    const boardStr = parts[parts.length - 1];
    if (!boardStr || boardStr.length < 4) return [];

    const cards = [];
    for (let i = 0; i < boardStr.length; i += 2) {
        if (i + 1 < boardStr.length) {
            const card = boardStr.substring(i, i + 2);
            if (/^[2-9TJQKA][shdc]$/i.test(card)) {
                cards.push(card);
            }
        }
    }
    return cards;
}

/**
 * Extract hero position from scenario_hash
 * "hu_cash_BTN_100bb_3h7c7s" → "BTN"
 */
/**
 * ═══ PHASE 19: Get average max frequency across hands in a strategy matrix ═══
 * Used for difficulty filtering — higher avg max freq = easier spot (clear best action).
 *
 * The strategy_matrix.frequencies structure is: { action → { hand → freq(0-1) } }
 * For each hand, find its highest-frequency action, then average those across all hands.
 * This gives a true measure of how "clear" the scenario's decisions are overall.
 *
 * BUG-B FIX: Old implementation found the single highest freq across ALL hands×actions,
 * which was always ~100% (some hand is always a pure action), making difficulty filtering a no-op.
 */
function getMaxFrequency(strategyMatrix) {
    if (!strategyMatrix) return 50;
    const frequencies = strategyMatrix.frequencies || {};
    const actions = strategyMatrix.actions || Object.keys(frequencies || {});

    if (actions.length === 0) return 50;

    // Build per-hand max frequency map
    const handMaxFreqs = {};

    for (const action of actions) {
        const handFreqs = frequencies[action];
        if (!handFreqs || typeof handFreqs !== 'object') continue;

        for (const [hand, freq] of Object.entries(handFreqs || {})) {
            if (typeof freq !== 'number') continue;
            // freq is 0.0-1.0, convert to percentage for comparison
            const pct = freq * 100;
            if (!handMaxFreqs[hand] || pct > handMaxFreqs[hand]) {
                handMaxFreqs[hand] = pct;
            }
        }
    }

    const maxFreqs = Object.values(handMaxFreqs || {});
    if (maxFreqs.length === 0) {
        // Flat frequencies fallback (action → freq, no per-hand data)
        let maxFreq = 0;
        for (const val of Object.values(frequencies || {})) {
            if (typeof val === 'number' && val * 100 > maxFreq) maxFreq = val * 100;
        }
        return maxFreq || 50;
    }

    // Return the AVERAGE max-frequency-per-hand
    // Scenarios where most hands have clear best actions → high avg (easy)
    // Scenarios where most hands have mixed strategies → low avg (hard)
    const avg = maxFreqs.reduce((sum, v) => sum + v, 0) / maxFreqs.length;
    return Math.round(avg);
}

function extractPositionFromHash(scenarioHash) {
    if (!scenarioHash) return 'BTN';
    const positionNames = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO', 'HJ'];
    const parts = scenarioHash.split('_');
    for (const part of parts) {
        if (positionNames.includes(part.toUpperCase())) {
            return part.toUpperCase();
        }
    }
    return 'BTN';
}

/**
 * Extract rich scenario context from scenario_hash.
 * Parses game format, positions, stack depth, action sequence from the hash.
 *
 * Hash examples:
 *   "hu_cash_BTN_100bb_3h7c7s"
 *   "6max_mtt_CO_40bb_flop_xr_Jh7s2d"  (CO facing check-raise)
 *   "3max_spin_SB_15bb_Kd9c4h"
 *
 * Returns enriched context with preflopAction and actionLine.
 */
function extractScenarioContext(scenarioHash, street, heroPosition, villainPosition) {
    if (!scenarioHash) return { preflopAction: '', actionLine: '', gameFormat: '', potType: 'SRP' };

    const parts = scenarioHash.toLowerCase().split('_');
    let gameFormat = '';
    let actionLine = '';
    let preflopAction = '';
    let potType = 'SRP'; // Default: single-raised pot

    // ═══ GAME FORMAT DETECTION ═══
    if (parts.includes('hu') || parts.includes('heads') || parts.includes('2max')) gameFormat = 'Heads Up';
    else if (parts.includes('6max') || parts.includes('6-max')) gameFormat = '6-Max';
    else if (parts.includes('9max') || parts.includes('9-max')) gameFormat = '9-Max';
    else if (parts.includes('3max') || parts.includes('spin') || parts.includes('spins')) gameFormat = 'Spins 3-Max';
    // Detect cash vs MTT from hash
    if (parts.includes('mtt') || parts.includes('tourney') || parts.includes('icm')) {
        gameFormat = gameFormat ? `${gameFormat} MTT` : 'MTT';
    } else if (parts.includes('cash')) {
        gameFormat = gameFormat ? `${gameFormat} Cash` : 'Cash';
    }

    // ═══ ACTION LINE DETECTION — Phase 30: Expanded token recognition ═══
    const actionTokens = parts.filter(p => /^(xr|cb|x|b|r|3b|4b|5b|limp|open|squeeze|donk|probe|delay|float|cbet|xc|xf)$/.test(p));

    if (actionTokens.length > 0) {
        const actionLabels = {
            'xr': 'check-raise',
            'cb': 'c-bet',
            'cbet': 'c-bet',
            'x': 'check',
            'b': 'bet',
            'r': 'raise',
            '3b': '3-bet',
            '4b': '4-bet',
            '5b': '5-bet',
            'limp': 'limp',
            'open': 'open',
            'squeeze': 'squeeze',
            'donk': 'donk bet',
            'probe': 'probe bet',
            'delay': 'delayed c-bet',
            'float': 'float bet',
            'xc': 'check-call',
            'xf': 'check-fold',
        };
        actionLine = actionTokens.map(t => actionLabels[t] || t).join(' → ');
    }

    // ═══ POT TYPE DETECTION — Phase 30 ═══
    // Identify whether this is a single-raised pot, 3-bet pot, 4-bet pot, etc.
    if (actionTokens.includes('4b') || actionTokens.includes('5b')) {
        potType = '4-Bet Pot';
    } else if (actionTokens.includes('3b')) {
        potType = '3-Bet Pot';
    } else if (actionTokens.includes('limp')) {
        potType = 'Limped Pot';
    } else if (actionTokens.includes('squeeze')) {
        potType = 'Squeeze Pot';
    }

    // ═══ PREFLOP ACTION DESCRIPTION — Phase 30: More accurate with pot type ═══
    if (street !== 'preflop') {
        const ipPositions = ['BTN', 'CO', 'HJ', 'MP', 'MP+1', 'UTG+1', 'UTG'];
        const blinds = ['SB', 'BB'];

        if (potType === '3-Bet Pot') {
            // In a 3-bet pot, one player opened and the other 3-bet
            if (ipPositions.includes(heroPosition) && blinds.includes(villainPosition)) {
                preflopAction = `${heroPosition} opens, ${villainPosition} 3-bets, ${heroPosition} calls`;
            } else if (blinds.includes(heroPosition) && ipPositions.includes(villainPosition)) {
                preflopAction = `${villainPosition} opens, ${heroPosition} 3-bets, ${villainPosition} calls`;
            } else {
                preflopAction = `3-bet pot: ${heroPosition} vs ${villainPosition}`;
            }
        } else if (potType === '4-Bet Pot') {
            preflopAction = `4-bet pot: ${heroPosition} vs ${villainPosition}`;
        } else if (potType === 'Limped Pot') {
            preflopAction = `Limped pot: ${heroPosition} vs ${villainPosition}`;
        } else {
            // Standard SRP
            if (ipPositions.includes(heroPosition) && blinds.includes(villainPosition)) {
                preflopAction = `${heroPosition} opens, ${villainPosition} calls`;
            } else if (blinds.includes(heroPosition) && ipPositions.includes(villainPosition)) {
                preflopAction = `${villainPosition} opens, ${heroPosition} calls`;
            } else if (heroPosition === 'SB' && villainPosition === 'BB') {
                preflopAction = 'SB completes, BB checks';
            } else {
                preflopAction = `${heroPosition} vs ${villainPosition}`;
            }
        }
    }

    return { preflopAction, actionLine, gameFormat, potType };
}

/**
 * Get a deterministic seed from string for reproducible randomness
 */
function hashSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

/**
 * Check if a hand notation (e.g., "AKs", "22") matches a specific Hand Class
 */
function matchesHandClass(hand, handClass) {
    if (!handClass || handClass === 'all') return true;
    if (!hand || hand.length < 2) return false;

    const r1 = hand[0];
    const r2 = hand[1];
    const isSuited = hand.length >= 3 && hand[2] === 's';

    const rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    const val1 = rankValues[r1];
    const val2 = rankValues[r2];

    switch (handClass) {
        case 'pocket_pairs':
            return r1 === r2;
        case 'suited_connectors':
            return isSuited && Math.abs(val1 - val2) === 1;
        case 'broadways':
            return val1 >= 10 && val2 >= 10 && r1 !== r2;
        case 'suited_aces':
            return isSuited && (r1 === 'A' || r2 === 'A') && r1 !== r2;
        default:
            return true;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════
export class DeterministicGTOEngine {

    constructor() {
        // Default: use the imported client-side supabase (works for SSR with anon key)
        // API routes should call setSupabaseClient() with a service-role client
        this._supabaseClient = null;
    }

    /**
     * Override the Supabase client used for queries.
     * Call this from API routes to inject the service-role client,
     * which bypasses RLS and ensures full access to solved_spots_gold.
     */
    setSupabaseClient(client) {
        this._supabaseClient = client;
    }

    /** Get the active Supabase client (injected server client or default) */
    get db() {
        return this._supabaseClient || supabase;
    }

    /**
     * Generate a single training question from REAL solver data.
     * No Grok AI involved. Pure math.
     *
     * @param {Object} params
     * @param {string} params.gameId - Game identifier (e.g., 'cash-001')
     * @param {number} params.level - Difficulty level (1-10)
     * @param {string[]} params.seenIds - IDs already seen this session
     * @param {Object} params.gameConfig - From PIOQueryService.getGameConfig()
     * @returns {Object|null} Formatted training question or null
     */
    async generateQuestion({ gameId, level, seenIds = [], gameConfig }) {
        if (!gameConfig) return null;

        const source = gameConfig.sourceOfTruth;

        // ═══ SCENARIO (psychology + table selection): deterministic question bank ═══
        if (source === 'SCENARIO' || gameConfig.engine === 'SCENARIO') {
            const batch = this.generateScenarioBatch({ gameId, level, count: 1, seenIds });
            return batch[0] || null;
        }

        // ═══ POSTFLOP L8+: Route to PostflopScenarioGenerator (non-ICM sources) ═══
        if (level >= 8 && source !== 'ICMIZER') {
            return this.generateFromPostflopEngine(gameConfig, level, seenIds);
        }

        if (source === 'PioSOLVER') {
            const question = await this.generateFromSolvedSpots(gameConfig, level, seenIds);
            // Fallback: if no PIO data and game is preflop-focused, use local solver ranges
            if (!question && gameConfig.pioStreet === 'preflop') {
                return this.generateFromLocalSolverRanges(gameConfig, level);
            }
            return question;
        } else if (source === 'ICMIZER') {
            return this.generateFromCharts(gameConfig, level, seenIds);
        }
        // SCENARIO games (psychology) — handled by solver data pool, no AI fallback
        return null;
    }

    /**
     * Generate a preflop question from local solverRanges.js data.
     * Used as fallback when PIO database has no preflop spots for this config.
     * Covers ALL spot types: RFI, 3-Bet, BB Defense, 4-Bet, Cold Call, Squeeze.
     * Higher levels get more complex spots (3bet, 4bet, squeeze).
     */

    // ═══════════════════════════════════════════════════════════════════════════
    // POSTFLOP ENGINE (L8-L10) — Routes to PostflopScenarioGenerator
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Generate a postflop training question from the PostflopScenarioGenerator.
     * Converts engine scenario format → standard training question format.
     */
    generateFromPostflopEngine(gameConfig, level, seenIds = [], presetScenario = null) {
        try {
            let scenario = presetScenario || getRandomPostflopScenario(level);
            if (!scenario) {
                console.warn(`[DeterministicEngine] No postflop scenario for L${level}`);
                return null;
            }

            // Build unique ID to avoid repeats
            let scenarioId = `postflop_L${level}_${scenario.heroCards.join('')}_${scenario.board.join('')}`;
            if (seenIds.includes(scenarioId)) {
                // Re-roll up to 10 times for an unseen scenario
                for (let attempt = 0; attempt < 10; attempt++) {
                    const altScenario = getRandomPostflopScenario(level);
                    if (!altScenario) break;
                    const altId = `postflop_L${level}_${altScenario.heroCards.join('')}_${altScenario.board.join('')}`;
                    if (!seenIds.includes(altId)) {
                        scenario = altScenario;
                        scenarioId = altId;
                        break;
                    }
                }
            }

            // Map scenario options to standard question format
            const options = scenario.options.map((opt, idx) => ({
                id: String.fromCharCode(97 + idx), // a, b, c, d
                text: opt.label || opt.action,
                action: opt.action,
                frequency: opt.frequency || 0,
                ...(opt.feedback !== undefined ? { feedback: opt.feedback } : {}),
            }));

            // Prefer the generator's flagged correct option; fall back to highest frequency
            const flaggedIdx = (scenario.options || []).findIndex(o => o.isCorrect);
            const correctOption = (flaggedIdx >= 0 && options[flaggedIdx])
                ? options[flaggedIdx]
                : options.reduce((best, opt) =>
                    opt.frequency > best.frequency ? opt : best, options[0]);

            // Build GTO frequencies map { "a": 45, "b": 30, "c": 25 }
            const gtoFrequencies = {};
            options.forEach(opt => { gtoFrequencies[opt.id] = opt.frequency; });

            // Build the street label
            const streetLabels = { flop: 'Flop', turn: 'Turn', river: 'River' };
            const streetLabel = streetLabels[scenario.street] || scenario.street;

            // Format board display
            const boardStr = scenario.board.map(c => c.toUpperCase()).join(' ');
            const heroStr = scenario.heroCards.map(c => c.toUpperCase()).join(' ');

            // Build question text
            // Scenario field contract: vsPosition (string), boardTexture/madeHand/draws
            // are objects with description fields, tip (string), stackDepth (number)
            const villainPos = scenario.vsPosition || scenario.villainPosition || 'Villain';
            const contextParts = [];
            if (scenario.lastAction) contextParts.push(scenario.lastAction);
            if (scenario.boardTexture?.description) contextParts.push(`Board: ${scenario.boardTexture.description}`);
            if (scenario.madeHand?.description) contextParts.push(`You have: ${scenario.madeHand.description}`);
            if (scenario.draws?.outs > 0) {
                contextParts.push(`Draws: ${scenario.draws.description || `${scenario.draws.outs} outs`}`);
            }

            const question = {
                id: scenarioId,
                type: 'PIO',
                source: 'POSTFLOP_ENGINE',
                question: `${streetLabel} Decision — ${scenario.position} vs ${villainPos}`,
                scenario: {
                    title: `${streetLabel} Play`,
                    context: contextParts.join(' | '),
                    heroPosition: scenario.position,
                    villainPosition: villainPos,
                    // scenario.potSize / effectiveStack are the street-correct
                    // numbers from PostflopScenarioGenerator.potGeometry. The old
                    // `|| 6` fallback drew every flop, turn and river node with a
                    // 6bb pot against a full 100bb stack, which put SPR 16.7 on
                    // the river and made the "% of pot" EV figure ~4x too big.
                    pot: scenario.potSize || 6,
                    heroStack: scenario.effectiveStack ?? scenario.stackDepth ?? scenario.stackSize ?? 100,
                    villainStack: scenario.effectiveStack ?? scenario.stackDepth ?? scenario.stackSize ?? 100,
                    street: scenario.street,
                    board: boardStr,
                    heroHand: heroStr,
                    // ═══ POSTFLOP-SPECIFIC FIELDS ═══
                    boardTexture: scenario.boardTexture?.description || null,
                    madeHand: scenario.madeHand?.description || null,
                    draws: scenario.draws || null,
                    isPFR: scenario.isPFR !== undefined ? scenario.isPFR : true,
                    spotType: scenario.spotType || null,
                },
                heroCards: scenario.heroCards,
                boardCards: scenario.board,
                options,
                correctAnswer: correctOption.id,
                correctAnswerText: correctOption.text,
                explanation: scenario.tip || scenario.strategy?.reason || scenario.explanation || `GTO ${correctOption.text} at ${correctOption.frequency}% frequency on this ${scenario.boardTexture?.description || ''} board.`,
                gtoFrequencies,
                level,
                // EV data from EVCalculator if available
                evData: scenario.evData || null,
            };

            return question;
        } catch (err) {
            console.warn('[DeterministicEngine] Postflop generation error:', err.message);
            return null;
        }
    }

    /**
     * Generate a batch of postflop questions for L8-L10.
     */
    generatePostflopBatch(level, count, targetPositions, targetStreet, difficulty, gameConfig = null) {
        const questions = [];
        const usedIds = new Set();

        // Generate more than needed to allow filtering
        const maxAttempts = count * 4;
        for (let i = 0; i < maxAttempts && questions.length < count; i++) {
            const filter = {};
            if (targetPositions && targetPositions.length > 0) {
                filter.position = targetPositions[i % targetPositions.length];
            }
            if (targetStreet) {
                // Map targetStreet to spotType
                const streetSpotMap = { flop: 'cbet', turn: 'turn_barrel', river: 'river_value' };
                filter.spotType = streetSpotMap[targetStreet] || undefined;
            }

            const scenario = Object.keys(filter || {}).length > 0
                ? getFilteredPostflopScenario(level, filter)
                : getRandomPostflopScenario(level);

            if (!scenario) continue;

            const q = this.generateFromPostflopEngine(gameConfig || { pioStackDepth: 100 }, level, [...usedIds], scenario);
            if (!q) continue;
            if (usedIds.has(q.id)) continue;

            usedIds.add(q.id);
            questions.push(q);
        }

        console.debug(`[DeterministicEngine] ✓ Generated ${questions.length} postflop questions for L${level}`);
        return questions;
    }

    generateFromLocalSolverRanges(gameConfig, level) {
        try {
            const stackDepth = gameConfig.pioStackDepth || 100;

            // ═══ ADAPTIVE DIFFICULTY ═══
            // All levels now get the full spot pool — no level-based content gating.
            // Progression is mastery-based (85%/90% threshold) not content-restricted.
            let effectiveLevel = level;

            // Build pool of available spots, weighted by difficulty level
            const spotPool = this._buildPreflopSpotPool(effectiveLevel, stackDepth);
            if (spotPool.length === 0) return null;

            // Pick random spot — bias toward harder spot types at higher effective levels
            const spot = this._pickAdaptiveSpot(spotPool, effectiveLevel);
            const { spotData, heroPos, villainPos, spotType, nodeType, actionLabels, contextText, questionText } = spot;

            // Pick a hand with intelligent weighting:
            // ~50% chance: hand from the range (raise/call > 5%) — tests inclusion knowledge
            // ~30% chance: boundary hand (any action 10-90%) — tests mixed strategy
            // ~20% chance: any hand — includes pure folds to test exclusion knowledge
            const hand = this._pickWeightedHand(spotData);
            const freqs = solverGetFreqs(spotData, hand);

            // Build action frequencies in engine format
            // actionLabels maps solver keys → engine action IDs: [{ solver: 'raise', id: 'r', label: 'Raise' }, ...]
            const actions = {};
            const gtoFrequencies = {};
            const options = [];
            let correctAction = null;
            let correctLabel = '';
            let maxFreq = 0;

            for (const { solver, id, label } of actionLabels) {
                const freq = freqs[solver] || 0;
                if (freq > 0.005) {
                    actions[id] = freq;
                    gtoFrequencies[id] = Math.round(freq * 100);
                }
                options.push({ id, label, frequency: Math.round(freq * 100) });
                if (freq > maxFreq) { maxFreq = freq; correctAction = id; correctLabel = label; }
            }

            // Build rawFrequencies for per-hand range grid rendering
            const rawFrequencies = {};
            for (const { solver, id } of actionLabels) rawFrequencies[id] = {};
            for (const h of SOLVER_ALL_HANDS) {
                const hf = solverGetFreqs(spotData, h);
                for (const { solver, id } of actionLabels) {
                    if ((hf[solver] || 0) > 0.01) rawFrequencies[id][h] = hf[solver];
                }
            }

            const heroCards = this._handNotationToCards(hand);
            const isMixed = actionLabels.some(a => {
                const f = freqs[a.solver] || 0;
                return f > 0.05 && f < 0.95;
            });

            // Build explanation with all action frequencies
            const freqParts = actionLabels
                .filter(a => (freqs[a.solver] || 0) > 0.01)
                .map(a => `${a.label} ${Math.round(freqs[a.solver] * 100)}%`);
            const explanation = `${contextText}: ${hand} — ${freqParts.join(', ')}.`;

            // ═══ EV LOSS ESTIMATION ═══
            // Approximate EV loss for each action based on frequency deviation.
            // The EV of a pure strategy action vs the mixed strategy optimal:
            // - Correct action (highest freq): 0 EV loss
            // - Suboptimal action: EV loss proportional to (optimalFreq - thisFreq) * potSize
            // This models "how much worse is taking this action vs optimal?"
            const potSize = spotType === 'rfi' ? 1.5 : spotType === 'squeeze' ? 8.5 : 4.5;
            const actionEVs = {};
            for (const { solver, id } of actionLabels) {
                const freq = freqs[solver] || 0;
                // EV approximation: correct action = 0 loss, wrong action = cost
                // proportional to frequency difference × pot
                const evLoss = (maxFreq - freq) * potSize;
                actionEVs[id] = -Math.round(evLoss * 100) / 100;
            }

            // Estimate pot for EV reporting
            const estimatedPot = potSize;

            return {
                id: `local_solver_${spotType}_${heroPos}_${hand}_${Date.now()}`,
                source: 'local_solver_ranges',
                heroHand: hand,
                heroCards,
                boardCards: [],
                scenario: {
                    street: 'preflop',
                    board: '',
                    boardCards: [],
                    pot: potSize,
                    heroPosition: heroPos,
                    villainPosition: villainPos,
                    heroStack: stackDepth,
                    villainStack: stackDepth,
                    stackDepth,
                    gameType: 'cash_6max',
                    nodeType,
                    context: contextText,
                    isMixedStrategy: isMixed,
                    spotType,
                },
                question: questionText(hand),
                options,
                correctAnswer: correctAction,
                correctAnswerText: correctLabel,
                frequencies: actions,
                gtoFrequencies,
                rawFrequencies,
                actionEVs,
                estimatedPot,
                evData: {
                    correctEV: 0,
                    worstEV: -Math.round(maxFreq * potSize * 100) / 100,
                    potSize: estimatedPot,
                    // GTOW parity #32: every UI consumer reads
                    // `question.evData.actionEVs` (see UniversalDynamicTable's
                    // action-vs-optimal panel and the per-button EV chips).
                    // This path only ever set the top-level `actionEVs`, so the
                    // whole EV surface was dark for local-solver preflop spots.
                    actionEVs,
                },
                explanation,
                difficulty: effectiveLevel,
                handCategory: this._classifyPreflopHand(hand),
            };
        } catch (err) {
            console.warn('[DeterministicEngine] Local solver ranges fallback error:', err.message);
            return null;
        }
    }

    /**
     * Build a pool of preflop spots appropriate for the difficulty level.
     * ALL LEVELS get ALL spot types — no content gating by level.
     * Level progression only affects mastery threshold (85%/90%).
     */
    _buildPreflopSpotPool(level, stackDepth) {
        const pool = [];
        const rfiPositions = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];

        // ─── RFI (all levels) ────────────────────────────────────────
        for (const pos of rfiPositions) {
            const spotData = getRFIByDepth(stackDepth, pos);
            if (!spotData) continue;
            pool.push({
                spotData,
                heroPos: pos,
                villainPos: 'BB',
                spotType: 'rfi',
                nodeType: 'preflop_open',
                actionLabels: [
                    { solver: 'raise', id: 'r', label: 'Raise' },
                    { solver: 'fold', id: 'f', label: 'Fold' },
                ],
                contextText: `${pos} RFI (${stackDepth}BB)`,
                questionText: (hand) => `You are in ${pos} with ${hand}. Action folds to you. What do you do?`,
            });
        }

        // All levels now get all spot types (no level gating)

        // ─── 3-Bet (all levels) ──────────────────────────────────────
        for (const [key, data] of Object.entries(SOLVER_3BET || {})) {
            const parts = key.split('_vs_');
            const pos = parts[0];
            const villain = parts[1] || 'opener';
            pool.push({
                spotData: data,
                heroPos: pos,
                villainPos: villain,
                spotType: '3bet',
                nodeType: 'preflop_3bet',
                actionLabels: [
                    { solver: 'raise', id: 'r', label: '3-Bet' },
                    { solver: 'call', id: 'c', label: 'Call' },
                    { solver: 'fold', id: 'f', label: 'Fold' },
                ],
                contextText: `${pos} 3-Bet vs ${villain}`,
                questionText: (hand) => `${villain} opens. You are in ${pos} with ${hand}. What do you do?`,
            });
        }

        // ─── BB Defense (all levels) ─────────────────────────────────
        for (const [key, data] of Object.entries(SOLVER_BB_DEF || {})) {
            const villain = key.replace('vs_', '');
            pool.push({
                spotData: data,
                heroPos: 'BB',
                villainPos: villain,
                spotType: 'bb_defense',
                nodeType: 'preflop_bb_defense',
                actionLabels: [
                    { solver: 'raise', id: 'r', label: '3-Bet' },
                    { solver: 'call', id: 'c', label: 'Call' },
                    { solver: 'fold', id: 'f', label: 'Fold' },
                ],
                contextText: `BB Defense vs ${villain}`,
                questionText: (hand) => `${villain} opens. You are in BB with ${hand}. What do you do?`,
            });
        }

        // ─── 4-Bet (all levels) ──────────────────────────────────────
        for (const [key, data] of Object.entries(SOLVER_4BET || {})) {
            const parts = key.split('_vs_');
            const pos = parts[0];
            pool.push({
                spotData: data,
                heroPos: pos,
                villainPos: '3bettor',
                spotType: '4bet',
                nodeType: 'preflop_4bet',
                actionLabels: [
                    { solver: 'raise', id: 'r', label: '4-Bet' },
                    { solver: 'call', id: 'c', label: 'Call' },
                    { solver: 'fold', id: 'f', label: 'Fold' },
                ],
                contextText: `${pos} vs 3-Bet (4-Bet decision)`,
                questionText: (hand) => `You opened from ${pos} with ${hand} and face a 3-Bet. What do you do?`,
            });
        }

        // ─── Cold Call (level 5+) ────────────────────────────────────
        for (const [key, data] of Object.entries(SOLVER_CC || {})) {
            const parts = key.split('_vs_');
            const pos = parts[0];
            const villain = parts[1] || 'opener';
            pool.push({
                spotData: data,
                heroPos: pos,
                villainPos: villain,
                spotType: 'cold_call',
                nodeType: 'preflop_cold_call',
                actionLabels: [
                    { solver: 'call', id: 'c', label: 'Call' },
                    { solver: 'fold', id: 'f', label: 'Fold' },
                ],
                contextText: `${pos} Cold Call vs ${villain}`,
                questionText: (hand) => `${villain} opens. You are in ${pos} with ${hand}. Call or fold?`,
            });
        }

        // ─── Squeeze (level 5+) ──────────────────────────────────────
        for (const [key, data] of Object.entries(SOLVER_SQZ || {})) {
            const readable = key.replace(/_/g, ' ').replace('vs', 'vs').replace('open', 'open,');
            const parts = key.split('_vs_');
            const pos = parts[0];
            pool.push({
                spotData: data,
                heroPos: pos,
                villainPos: 'multiway',
                spotType: 'squeeze',
                nodeType: 'preflop_squeeze',
                actionLabels: [
                    { solver: 'raise', id: 'r', label: 'Squeeze' },
                    { solver: 'fold', id: 'f', label: 'Fold' },
                ],
                contextText: `Squeeze: ${readable}`,
                questionText: (hand) => `There's an open and a call. You are in ${pos} with ${hand}. Squeeze or fold?`,
            });
        }

        return pool;
    }

    /**
     * Adaptively pick a spot from the pool.
     * At higher effective levels, bias toward more complex spot types.
     * Expert: 60% advanced spots (4bet/squeeze/cold_call), 40% standard
     * Standard: uniform random
     */
    _pickAdaptiveSpot(spotPool, effectiveLevel) {
        // All levels get uniform random selection across all spot types.
        // No level-based bias — every level plays the same solver content.
        return spotPool[Math.floor(Math.random() * spotPool.length)];
    }

    /**
     * Classify a preflop hand into a category for coaching/tracking.
     * Returns: 'premium_pair', 'medium_pair', 'small_pair', 'broadway_suited',
     *          'broadway_offsuit', 'suited_connector', 'suited_ace', 'offsuit_trash', etc.
     */
    _classifyPreflopHand(hand) {
        if (!hand) return 'unknown';
        const ranks = 'AKQJT98765432';

        if (hand.length === 2) {
            // Pair
            const idx = ranks.indexOf(hand[0]);
            if (idx <= 3) return 'premium_pair';      // AA-JJ
            if (idx <= 6) return 'medium_pair';        // TT-88
            return 'small_pair';                       // 77-22
        }

        const r1 = ranks.indexOf(hand[0]);
        const r2 = ranks.indexOf(hand[1]);
        const isSuited = hand.endsWith('s');
        const gap = r2 - r1;

        if (r1 <= 4 && r2 <= 4) {
            return isSuited ? 'broadway_suited' : 'broadway_offsuit';
        }
        if (hand[0] === 'A' && isSuited) return 'suited_ace';
        if (isSuited && gap <= 2 && r1 >= 5) return 'suited_connector';
        if (isSuited) return 'suited_gapper';
        if (hand[0] === 'A') return 'offsuit_ace';
        return 'offsuit_other';
    }

    /**
     * Pick a hand weighted toward interesting decisions.
     * Avoids the GTO Wizard anti-pattern of drilling 72o fold over and over.
     *
     * Distribution: ~50% in-range, ~30% boundary/mixed, ~20% any (including folds)
     */
    _pickWeightedHand(spotData) {
        const inRange = [];
        const boundary = [];

        for (const hand of SOLVER_ALL_HANDS) {
            const f = solverGetFreqs(spotData, hand);
            const totalAction = f.raise + f.call;
            if (totalAction > 0.05) {
                inRange.push(hand);
                // Boundary: hand with genuine mix (no single action dominates)
                if (totalAction > 0.10 && totalAction < 0.90) {
                    boundary.push(hand);
                } else if (f.raise > 0.05 && f.raise < 0.95 && f.call > 0.05) {
                    boundary.push(hand);
                }
            }
        }

        const roll = Math.random();
        if (roll < 0.50 && inRange.length > 0) {
            return inRange[Math.floor(Math.random() * inRange.length)];
        }
        if (roll < 0.80 && boundary.length > 0) {
            return boundary[Math.floor(Math.random() * boundary.length)];
        }
        // 20%: any hand (tests fold discipline too)
        return SOLVER_ALL_HANDS[Math.floor(Math.random() * SOLVER_ALL_HANDS.length)];
    }

    /**
     * Convert hand notation (e.g., "AKs", "TT", "Q9o") to card objects.
     */
    _handNotationToCards(hand) {
        if (!hand) return [];
        if (hand.length === 2) {
            return [{ rank: hand[0], suit: 'h' }, { rank: hand[1], suit: 's' }];
        }
        if (hand.length === 3) {
            const r1 = hand[0], r2 = hand[1], flag = hand[2];
            if (flag === 's') return [{ rank: r1, suit: 's' }, { rank: r2, suit: 's' }];
            return [{ rank: r1, suit: 'h' }, { rank: r2, suit: 'd' }];
        }
        return [{ rank: hand[0] || 'A', suit: 'h' }, { rank: hand[1] || 'K', suit: 's' }];
    }

    /**
     * Generate a batch of SCENARIO (psychology / table-selection) questions
     * from the deterministic psychology question bank. No DB, no AI, no
     * randomness — pure curated content scaled to level.
     */
    generateScenarioBatch({ gameId, level, count = 15, seenIds = [] }) {
        try {
            const questions = getPsychologyQuestions(gameId, level, count, seenIds);
            return questions || [];
        } catch (err) {
            console.warn('[DeterministicEngine] Scenario bank failed:', err?.message || err);
            return [];
        }
    }

    /**
     * Generate a batch of N questions from solver data
     * IMP-6 FIX: Strengthened dedup — rejects same heroHand+scenarioHash combos
     */
    async generateBatch({ gameId, level, count = 25, gameConfig, targetPositions, targetStreet, difficulty = 'standard', scenarioLevels, spotTypes, stackDepths, seenIds = [] }) {
        if (!gameConfig) return [];

        // ═══ SCENARIO (psychology + table selection): deterministic question bank ═══
        if (gameConfig.sourceOfTruth === 'SCENARIO' || gameConfig.engine === 'SCENARIO') {
            return this.generateScenarioBatch({ gameId, level, count, seenIds });
        }

        // ═══ POSTFLOP L8+: Route to PostflopScenarioGenerator (non-ICM sources) ═══
        if (level >= 8 && gameConfig.sourceOfTruth !== 'ICMIZER') {
            return this.generatePostflopBatch(level, count, targetPositions, targetStreet, difficulty, gameConfig);
        }

        // ═══ ICMIZER: Push/fold chart questions — the solver pool has no ICM spots ═══
        if (gameConfig.sourceOfTruth === 'ICMIZER') {
            const chartQuestions = [];
            const seenAccumulated = [];
            for (let i = 0; i < count; i++) {
                const q = await this.generateFromCharts(gameConfig, level, seenAccumulated);
                if (!q) break;
                chartQuestions.push(q);
                seenAccumulated.push(q.id);
            }
            return chartQuestions;
        }

        const questions = [];
        const usedQuestionIds = new Set();
        const usedHandScenarios = new Set(); // IMP-6: track heroHand+scenario combos

        // ═══ PHASE 15: Targeted practice — fetch pool with optional position/street filters ═══
        // ═══ PHASE 19: Fetch larger pool for difficulty filtering ═══
        // ═══ SOLVER SCENARIO MAP: Pass routing params to pool fetcher ═══
        const poolMultiplier = difficulty === 'standard' ? 3 : 5;
        const poolSize = Math.min(count * poolMultiplier, 125);
        const scenarios = await this.fetchSolverPool(gameConfig, level, poolSize, targetStreet, { stackDepths, spotTypes });

        if (!scenarios || scenarios.length === 0) return [];

        // ═══ PHASE 15: If target positions provided, prioritize those scenarios ═══
        let sortedScenarios = scenarios;
        if (targetPositions && targetPositions.length > 0) {
            const posSet = new Set(targetPositions.map(p => p.toUpperCase()));
            // Move target-position scenarios to the front
            const targeted = scenarios.filter(s => {
                const pos = extractPositionFromHash(s.scenario_hash);
                return posSet.has(pos);
            });
            const others = scenarios.filter(s => {
                const pos = extractPositionFromHash(s.scenario_hash);
                return !posSet.has(pos);
            });
            sortedScenarios = [...targeted, ...others];
            if (targeted.length > 0) {
                console.debug(`[DeterministicEngine] Targeted ${targeted.length}/${scenarios.length} scenarios for positions: ${targetPositions.join(',')}`);
            }
        }

        // ═══ PHASE 19 + PHASE 75: Adaptive difficulty filtering ═══
        // Beginner: prefer scenarios where best action is ≥60% (clear decisions)
        // Expert: prefer scenarios where best action is ≤50% (mixed strategy / close spots)
        // Standard: no filter
        // Phase 75: 'adaptive' mode — starts at standard, increases difficulty based on accuracy
        const effectiveDifficulty = difficulty === 'adaptive'
            ? this._getAdaptiveDifficulty(questions.length)
            : difficulty;

        if (effectiveDifficulty === 'beginner' || effectiveDifficulty === 'expert') {
            sortedScenarios.sort((a, b) => {
                const maxFreqA = getMaxFrequency(a.strategy_matrix);
                const maxFreqB = getMaxFrequency(b.strategy_matrix);
                if (effectiveDifficulty === 'beginner') {
                    // Higher max frequency = easier (clear best action)
                    return maxFreqB - maxFreqA;
                }
                // Expert: lower max frequency = harder (mixed strategy)
                return maxFreqA - maxFreqB;
            });
        }

        // Phase 75: Interleave difficulty — every 5th question should be a stretch
        // This prevents monotonous difficulty and keeps players engaged
        const shouldStretch = (qIdx) => qIdx > 0 && qIdx % 5 === 0;

        // IMP-6: Iterate through MORE combinations to reach target count
        const maxAttempts = Math.min(count * 4, sortedScenarios.length * 3);
        for (let i = 0; i < maxAttempts && questions.length < count; i++) {
            const scenario = sortedScenarios[i % sortedScenarios.length];

            // ═══ PHASE 19 + 75: Difficulty gate ═══
            const maxFreq = getMaxFrequency(scenario.strategy_matrix);
            if (effectiveDifficulty !== 'standard') {
                // Phase 75: Stretch questions override the filter
                const stretching = shouldStretch(questions.length);
                if (!stretching) {
                    if (effectiveDifficulty === 'beginner' && maxFreq < 40) continue;
                    if (effectiveDifficulty === 'expert' && maxFreq > 70) continue;
                } else {
                    // Stretch: beginner gets a mixed spot, expert gets a pure spot
                    if (effectiveDifficulty === 'beginner' && maxFreq > 60) continue;
                    if (effectiveDifficulty === 'expert' && maxFreq < 60) continue;
                }
            }

            // Pick a different hand for each question from same scenario
            const question = this.buildQuestionFromScenario(scenario, gameConfig, level, i);
            if (!question) continue;

            // IMP-6: Reject if same heroHand+scenario already used
            const dedupeKey = `${question.heroHand}_${scenario.scenario_hash}`;
            if (usedQuestionIds.has(question.id) || usedHandScenarios.has(dedupeKey)) continue;

            questions.push(question);
            usedQuestionIds.add(question.id);
            usedHandScenarios.add(dedupeKey);
        }

        return questions;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MULTI-STREET: Query next street solver data
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Query solver data for the next street (turn or river).
     * Called by MultiStreetHandManager after hero makes a decision.
     *
     * @param {Object} params
     * @param {Object} params.gameConfig - PIO game config
     * @param {string} params.heroHand - Hero's hand notation (e.g., 'AKs')
     * @param {string[]} params.boardCards - Current board cards (e.g., ['3h', '7c', '7s', '9d'])
     * @param {string} params.street - Street to query ('turn' or 'river')
     * @param {number} params.pot - Current pot in BB
     * @param {number} params.stackDepth - Stack depth in BB
     * @param {string} params.heroPosition - Hero's position
     * @param {string} params.villainPosition - Villain's position
     * @returns {Object|null} Question with real solver data, or null
     */
    async queryNextStreet({ gameConfig, heroHand, boardCards, street, pot, stackDepth, heroPosition, villainPosition }) {
        if (!gameConfig || !boardCards || boardCards.length < 3) return null;

        try {
            // Build the board suffix for hash matching
            const boardStr = boardCards.map(c => c.toLowerCase()).join('');

            // Try exact match first — scenario_hash contains the board
            const { data: exactMatches, error: exactErr } = await this.db
                .from('solved_spots_gold')
                .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
                .eq('game_type', gameConfig.pioGameType)
                .eq('stack_depth', gameConfig.pioStackDepth)
                .eq('street', street)
                .ilike('scenario_hash', `%${boardStr}%`)
                .limit(5);

            if (exactErr) {
                console.warn('[DeterministicEngine] queryNextStreet exact match error:', exactErr.message);
            }

            if (exactMatches && exactMatches.length > 0) {
                // Found an exact board match — use it
                const scenario = exactMatches[Math.floor(Math.random() * exactMatches.length)];
                const question = this.buildQuestionFromScenario(scenario, gameConfig, 5, 0);

                if (question) {
                    // Override generic scenario values with the actual hand state
                    this._applyNextStreetOverrides(question, { pot, heroPosition, villainPosition, stackDepth });
                    console.debug(`[DeterministicEngine] ✓ Multi-street: found ${street} data for board ${boardStr}`);
                    return question;
                }
            }

            // No exact match — try partial board match (flop portion only)
            const flopStr = boardCards.slice(0, 3).map(c => c.toLowerCase()).join('');
            const { data: partialMatches } = await this.db
                .from('solved_spots_gold')
                .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
                .eq('game_type', gameConfig.pioGameType)
                .eq('stack_depth', gameConfig.pioStackDepth)
                .eq('street', street)
                .ilike('scenario_hash', `%${flopStr}%`)
                .limit(50); // Increased limit for semantic distance pool

            if (partialMatches && partialMatches.length > 0) {
                // ═══ SEMANTIC DISTANCE CALCULATOR ═══
                // Find the closest board runout in terms of rank, suit, and texture
                const rankToVal = r => "23456789TJQKA".indexOf(r.toUpperCase()) + 2;
                
                let bestScenario = partialMatches[0];
                let minDistance = 999999;
                
                // Track requested texture features
                const getTexture = (cards) => {
                    const ranks = cards.map(c => c[0].toUpperCase());
                    const suits = cards.map(c => c[1].toLowerCase());
                    const hasPair = new Set(ranks).size < cards.length;
                    const maxSuitFreq = Math.max(...Object.values(suits.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {})));
                    const hasFlushDraw = maxSuitFreq >= 3;
                    const hasFlush = maxSuitFreq >= 5; // flush is possible
                    return { hasPair, hasFlushDraw, hasFlush };
                };
                
                const reqTexture = getTexture(boardCards);

                partialMatches.forEach(scenario => {
                    const scenarioBoard = parseBoardFromHash(scenario.scenario_hash);
                    let dist = 0;
                    
                    for (let i = 3; i < boardCards.length; i++) {
                        if (!scenarioBoard[i]) continue;
                        const reqCard = boardCards[i];
                        const dbCard = scenarioBoard[i];
                        
                        const rankDiff = Math.abs(rankToVal(reqCard[0]) - rankToVal(dbCard[0]));
                        const suitDiff = reqCard[1].toLowerCase() === dbCard[1].toLowerCase() ? 0 : 6;
                        dist += (rankDiff * 2) + suitDiff;
                    }
                    
                    // Texture penalty: massive penalty if board pairing/flush drawing changes
                    const dbTexture = getTexture(scenarioBoard);
                    if (reqTexture.hasPair !== dbTexture.hasPair) dist += 25;
                    if (reqTexture.hasFlushDraw !== dbTexture.hasFlushDraw) dist += 15;
                    
                    if (dist < minDistance) {
                        minDistance = dist;
                        bestScenario = scenario;
                    }
                });

                const scenario = bestScenario;
                const question = this.buildQuestionFromScenario(scenario, gameConfig, 5, 0);

                if (question) {
                    // Override board with our actual board (partial match may have different turn/river)
                    question.scenario.board = boardCards.join(' ');
                    question.boardCards = boardCards;
                    // Override generic scenario values with the actual hand state
                    this._applyNextStreetOverrides(question, { pot, heroPosition, villainPosition, stackDepth });
                    console.debug(`[DeterministicEngine] ✓ Multi-street: partial semantic match for ${street} (dist: ${minDistance})`);
                    return question;
                }
            }

            // BUG-G FIX: Removed 3rd-tier 'ANY scenario' fallback.
            // Grabbing solver data from a completely different board is misleading —
            // the frequencies don't apply to our board texture. Instead, end the hand cleanly.
            console.debug(`[DeterministicEngine] ✕ No ${street} solver data available for ${gameConfig.pioGameType} (no board match)`);
            return null;
        } catch (err) {
            console.warn('[DeterministicEngine] queryNextStreet error:', err.message);
            return null;
        }
    }

    /**
     * Apply the actual hand state (pot, positions, stacks) to a question built
     * from a matched solver scenario, which carries generic defaults.
     */
    _applyNextStreetOverrides(question, { pot, heroPosition, villainPosition, stackDepth } = {}) {
        if (!question || !question.scenario) return;
        if (pot != null) {
            question.scenario.pot = pot;
            question.estimatedPot = pot;
            // The prompt the player READS was built by buildQuestionText from the
            // matched solver scenario's generic pot, before this override ran. On
            // a multi-street hand that produced a table contradicting itself:
            // measured on production, the felt's POT pill said 6BB (the real
            // running pot of the hand) while the sentence above it said
            // "Pot: 14bb". Same money, two numbers. Rewrite the phrase to the
            // authoritative pot so the sentence and the felt agree.
            if (typeof question.question === 'string') {
                const potBB = typeof pot === 'number' ? pot.toFixed(1).replace(/\.0$/, '') : pot;
                question.question = question.question.replace(
                    /Pot: \d+(?:\.\d+)?bb/g,
                    `Pot: ${potBB}bb`
                );
            }
        }
        if (heroPosition) question.scenario.heroPosition = heroPosition;
        if (villainPosition) question.scenario.villainPosition = villainPosition;
        if (stackDepth != null) {
            question.scenario.stackDepth = stackDepth;
            question.scenario.heroStack = stackDepth;
            question.scenario.villainStack = stackDepth;
        }
    }


    async generateFromSolvedSpots(gameConfig, level, seenIds) {
        const scenarios = await this.fetchSolverPool(gameConfig, level, 25);
        if (!scenarios || scenarios.length === 0) return null;

        // IMP-1 FIX: Filter out scenarios that generated questions the user already saw
        const safeSeenIds = Array.isArray(seenIds) ? seenIds : [];
        let pool = scenarios;
// @@PUB_REGION_02@@
        // ═══ Phase 76: DYNAMIC EXPLANATION DEPTH ═══
        const explanationDepth = this._getExplanationDepth(street, handStrength, optimalAction, ctx.nodeType, ctx.spotType);
        const coachingNote = this._getDepthCoachingNote(explanationDepth, street, handStrength, optimalAction);
// @@PUB_REGION_03@@
                }
            }
        }
// @@PUB_REGION_04@@
            if (street === 'river') {
                if (texture.flushy || texture.monotone) return `At the bluff-catching threshold on a flushy river board. Missed flush draws are a large part of villain's bluffing range — calling just enough to prevent them from auto-profiting with bluffs.`;
                return `At the exact bluff-catching threshold on the river. Calling too much lets villain profit by over-bluffing; folding too much lets villain steal pots unchallenged. The solver calls just enough to keep villain indifferent.`;
// @@PUB_REGION_05@@
            parts.push('Turn cards to watch:');
        } else {
            parts.push('River cards to watch:');
// @@PUB_REGION_06@@
                accuracy: 1 - (v.mistakes / v.total),
            }))
            .sort((a, b) => b.mistakeRate - a.mistakeRate);
// @@PUB_REGION_07@@
    /**
     * Phase 110: Explain probe bets — when you bet into the PFR after they
     * checked the previous street.
// @@PUB_REGION_08@@
    /**
     * Phase 138: How well does each player's range interact with this board?
     */
// @@PUB_REGION_09@@
    /**
     * Phase 167: Explain the concept of node locking for exploitative play.
     */
// @@PUB_REGION_10@@
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 203: BOARD COVERAGE HEATMAP DATA
    // ═══════════════════════════════════════════════════════════════════════════
// @@PUB_REGION_11@@
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 232: BET/RAISE SIZING OPTIMIZER
    // ═══════════════════════════════════════════════════════════════════════════
// @@PUB_REGION_12@@
        // Category 4: Mixed strategy misread (both in strategy but wrong primary)
        if (selPct > 0 && selPct < 30) {
            return { type: 'MIX_MISREAD', label: 'Mixed Strategy Misread', description: 'Your action is in the solver\'s strategy but at low frequency. Study when the solver shifts to this action vs the primary.', severity: 'low' };
// @@PUB_REGION_13@@
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 283: MISTAKE CLUSTERING
    // ═══════════════════════════════════════════════════════════════════════════
// @@PUB_REGION_14@@
                else mediumBets++;
            }
        });
// @@PUB_REGION_15@@
    getGTOComplianceScore() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
// @@PUB_REGION_16@@
