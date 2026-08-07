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

        if (safeSeenIds.length > 0) {
            const unseenScenarios = scenarios.filter(s => {
                const possibleId = `pio_${s.id}`;
                return !safeSeenIds.some(id => id.startsWith(possibleId));
            });
            // Use unseen pool if available, otherwise fall back to full pool
            if (unseenScenarios.length > 0) pool = unseenScenarios;
        }

        const scenario = pool[Math.floor(Math.random() * pool.length)];
        return this.buildQuestionFromScenario(scenario, gameConfig, level, 0);
    }

    async fetchSolverPool(gameConfig, level, limit = 25, targetStreet = null, routingParams = {}) {
        try {
            // ═══ PHASE 15: Allow street override for targeted practice ═══
            const street = targetStreet || this.getStreetForLevel(level);

            // ═══ SOLVER SCENARIO MAP: Use stackDepths from GameScenarioMap if provided ═══
            const { stackDepths, spotTypes } = routingParams;
            const effectiveStackDepths = (stackDepths && stackDepths.length > 0)
                ? stackDepths
                : [gameConfig.pioStackDepth];

            // ═══ PHASE 21: Randomized pool fetch for varied training spots ═══
            // Fetch a larger pool then shuffle client-side to avoid repetitive scenarios.
            // Supabase doesn't support ORDER BY random(), so we over-fetch and shuffle.
            const fetchLimit = Math.min(limit * 4, 500);

            // Query across all effective stack depths (multi-depth for MTT games)
            let allData = [];
            for (const depth of effectiveStackDepths) {
                let query = this.db
                    .from('solved_spots_gold')
                    .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
                    .eq('game_type', gameConfig.pioGameType)
                    .eq('stack_depth', depth);
                // Only filter by street when one is specified (null = all streets)
                if (street) {
                    query = query.eq('street', street);
                }
                const { data, error } = await query
                    .limit(Math.ceil(fetchLimit / effectiveStackDepths.length));

                if (!error && data && data.length > 0) {
                    allData = allData.concat(data);
                }
            }

            if (allData.length === 0) {
                console.debug(`[DeterministicEngine] No solved spots for ${gameConfig.pioGameType} ${street} depths=[${effectiveStackDepths.join(',')}]bb`);
                return null;
            }

            // ═══ SOLVER SCENARIO MAP: Filter by spotTypes if provided ═══
            // SpotTypes map to scenario_hash patterns (e.g., 'rfi' matches scenarios with RFI action)
            if (spotTypes && spotTypes.length > 0) {
                // Underscore-delimited hashes: \b never matches inside snake_case,
                // so anchor tokens with (^|_) ... (_|$) instead.
                const spotTypePatterns = {
                    'rfi': /(^|_)(rfi|open|raise_first)(_|$)/i,
                    'vs3bet': /(^|_)(vs_?3bet|facing_?3bet|3bet_def|3b)(_|$)/i,
                    'bb_defense': /(^|_)(bb_def|bb_vs|big_blind)(_|$)/i,
                    'cold_call': /(^|_)(cold_call|flat|overcall)(_|$)/i,
                    '4bet': /(^|_)(4bet|four_bet|4b)(_|$)/i,
                    'squeeze': /(^|_)(squeeze|sqz)(_|$)/i,
                    'cbet': /(^|_)(cbet|c_?bet|flop_bet)(_|$)/i,
                    'turn_barrel': /(^|_)(barrel|turn_bet|double_barrel)(_|$)/i,
                    'river_bluff': /(^|_)(river|bluff|triple_barrel)(_|$)/i,
                    'check_raise': /(^|_)(check_?raise|xr)(_|$)/i,
                    'turn_probe': /(^|_)(probe|turn_lead)(_|$)/i,
                    'river_value': /(^|_)(river_value|thin_value|value_bet)(_|$)/i,
                };
                const patterns = spotTypes
                    .map(st => spotTypePatterns[st])
                    .filter(Boolean);

                if (patterns.length > 0) {
                    const filtered = allData.filter(row => {
                        const hash = (row.scenario_hash || '').toLowerCase();
                        return patterns.some(p => p.test(hash));
                    });
                    // Only apply filter if it returns results; otherwise fall through with full pool
                    if (filtered.length > 0) {
                        allData = filtered;
                        console.debug(`[DeterministicEngine] SpotType filter: ${spotTypes.join(',')} → ${filtered.length} scenarios`);
                    } else {
                        console.debug(`[DeterministicEngine] SpotType filter: ${spotTypes.join(',')} matched 0 scenarios, falling through with full pool`);
                    }
                }
            }

            // Fisher-Yates shuffle for true randomization of training spots
            const shuffled = [...allData];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Return only the requested number of scenarios
            return shuffled.slice(0, limit);
        } catch (err) {
            console.warn('[DeterministicEngine] fetchSolverPool error:', err.message);
            return null;
        }
    }

    buildQuestionFromScenario(scenario, gameConfig, level, questionIndex) {
        const strategyMatrix = scenario.strategy_matrix || {};
        const actions = strategyMatrix.actions || [];
        const frequencies = strategyMatrix.frequencies || {};
        const handEVs = strategyMatrix.hand_evs || {};

        if (actions.length === 0) return null;

        // ═══ SELECT A HERO HAND ═══
        // Pick from the frequency data — these are the hands the solver analyzed
        const sampleAction = actions.find(a => frequencies[a]) || actions[0];
        const handFreqs = frequencies[sampleAction] || {};
        let allHands = Object.keys(handFreqs || {}).filter(h => h && h.length >= 2);

        // ═══ APPLY HAND CLASS FILTER ═══
        if (gameConfig.handClass && gameConfig.handClass !== 'all') {
            const filteredHands = allHands.filter(h => matchesHandClass(h, gameConfig.handClass));
            if (filteredHands.length > 0) {
                allHands = filteredHands;
            } else {
                // Return null to force custom-train.js to skip this scenario
                return null;
            }
        }

        if (allHands.length === 0) return null;

        // Use questionIndex to pick different hands from same scenario
        const seed = hashSeed(scenario.scenario_hash + '_' + questionIndex);
        const heroHand = allHands[seed % allHands.length];

        // ═══ COMPUTE PER-ACTION FREQUENCIES FOR THIS HAND ═══
        const handActions = {};
        let validActions = [];
        let optimalAction = null;
        let maxFreq = -1;

        actions.forEach(action => {
            const freq = frequencies[action]?.[heroHand];
            if (freq !== undefined && freq >= 0 && freq <= 1) {
                handActions[action] = freq;
                validActions.push(action);
                if (freq > maxFreq) {
                    maxFreq = freq;
                    optimalAction = action;
                }
            }
        });

        // ═══ FREQUENCY CLAMPING PROTOCOL (Ghost Hand Bug Fix) ═══
        // Filter out actions with < 1% frequency, unless doing so removes all options.
        const clampedActions = validActions.filter(action => handActions[action] >= 0.01);
        if (clampedActions.length > 0) {
            validActions = clampedActions;
            // Re-evaluate optimal action among clamped
            maxFreq = -1;
            validActions.forEach(action => {
                const freq = handActions[action];
                if (freq > maxFreq) {
                    maxFreq = freq;
                    optimalAction = action;
                }
            });
        }

        if (!optimalAction || validActions.length === 0) return null;

        // ═══ EXTRACT BOARD & POSITION DATA (needed for node type detection) ═══
        const board = parseBoardFromHash(scenario.scenario_hash);
        const heroPosition = extractPositionFromHash(scenario.scenario_hash);
        const villainPosition = VILLAIN_MAP[heroPosition] || 'BB';
        const estimatedPot = strategyMatrix.pot || POT_BY_STREET[scenario.street] || 6;

        // ═══ PHASE 22: CONTEXT-AWARE ACTION FILTERING — GTO WIZARD PARITY ═══
        // GTO Wizard NEVER shows Fold when hero is not facing a bet.
        // GTO Wizard NEVER shows Check/Bet when hero IS facing a bet.
        // This is fundamental poker logic that must be enforced regardless of solver data.
        const nodeType = this.detectNodeType(validActions, scenario.street);

        if (scenario.street !== 'preflop') {
            const preFilterCount = validActions.length;
            if (nodeType === 'hero_bets_or_checks') {
                // Hero acts first or IP after check: only Check and Bet sizes are valid
                // Remove: Fold, Call, Raise (these require facing a bet)
                validActions = validActions.filter(a => {
                    const al = a.toLowerCase();
                    if (al === 'f') return false;                    // Fold — invalid
                    if (al === 'call') return false;                  // Call — invalid
                    if (al.startsWith('r') && al !== 'r') return false; // Raise sizes — invalid
                    if (al === 'r') return false;                     // Generic raise — invalid
                    return true; // Keep: check (c/x), bet sizes (b33, b66, etc.), allin
                });
            } else if (nodeType === 'hero_faces_bet') {
                // Hero faces a bet: only Fold, Call, Raise are valid
                // IMPORTANT: In PioSolver, 'c' = "call" when facing a bet (not check!)
                // We remap 'c' → 'call' and remove actual check/bet actions.
                validActions = validActions.map(a => {
                    const al = a.toLowerCase();
                    // Remap 'c' to 'call' in facing-bet context (PIO uses 'c' for both)
                    if (al === 'c') return 'call';
                    return a;
                }).filter(a => {
                    const al = a.toLowerCase();
                    if (al === 'x') return false;                     // Check — invalid when facing bet
                    if (al.startsWith('b')) return false;              // Bet sizes — invalid when facing a bet
                    return true; // Keep: fold (f), call, raise sizes (r50, r100, etc.), allin
                });

                // Also remap handActions keys so frequencies carry over
                if (handActions['c'] !== undefined && handActions['call'] === undefined) {
                    handActions['call'] = handActions['c'];
                }
                // Remap optimal action if needed
                if (optimalAction === 'c') optimalAction = 'call';
            }

            // If filtering removed ALL actions, restore original (defensive fallback)
            if (validActions.length === 0) {
                console.warn(`[DeterministicEngine] Context filter removed all actions for ${scenario.scenario_hash} nodeType=${nodeType}, restoring originals`);
                validActions = clampedActions.length > 0 ? clampedActions : actions.filter(a => handActions[a] !== undefined);
            }

            // Re-evaluate optimal action after filtering
            if (!validActions.includes(optimalAction)) {
                maxFreq = -1;
                optimalAction = null;
                validActions.forEach(action => {
                    const freq = handActions[action] || 0;
                    if (freq > maxFreq) {
                        maxFreq = freq;
                        optimalAction = action;
                    }
                });
            }

            if (preFilterCount !== validActions.length) {
                console.debug(`[DeterministicEngine] Context filter: ${preFilterCount} → ${validActions.length} actions (nodeType=${nodeType}) for ${scenario.scenario_hash}`);
            }
        }

        // ═══ PREFLOP: 'c' always means CALL (never check) ═══
        if (scenario.street === 'preflop') {
            const hasCAction = validActions.includes('c');
            if (hasCAction) {
                validActions = validActions.map(a => a === 'c' ? 'call' : a);
                if (handActions['c'] !== undefined && handActions['call'] === undefined) {
                    handActions['call'] = handActions['c'];
                }
                if (optimalAction === 'c') optimalAction = 'call';
            }
            // Also remap 'r' to specific raise sizes for cleaner labels
            // PIO uses 'r' generically for open-raise preflop
        }

        // ═══ BUILD GTO FREQUENCIES (0-100 scale) ═══
        const gtoFrequencies = {};
        validActions.forEach(action => {
            gtoFrequencies[action] = Math.round((handActions[action] || 0) * 100);
        });

        // IMP-4: Frequency normalization — ensure frequencies sum to ~100%
        const freqSum = Object.values(gtoFrequencies || {}).reduce((s, v) => s + v, 0);
        if (freqSum > 0 && Math.abs(freqSum - 100) > 1) {
            const factor = 100 / freqSum;
            validActions.forEach(action => {
                gtoFrequencies[action] = Math.round(gtoFrequencies[action] * factor);
            });
            // Assign rounding residual to the highest-frequency action so the sum is exactly 100
            const newSum = validActions.reduce((s, a) => s + (gtoFrequencies[a] || 0), 0);
            const residual = 100 - newSum;
            if (residual !== 0 && validActions.length > 0) {
                const topAction = validActions.reduce((best, a) =>
                    (gtoFrequencies[a] || 0) > (gtoFrequencies[best] || 0) ? a : best, validActions[0]);
                gtoFrequencies[topAction] += residual;
            }
        }

        // ═══ COMPUTE EV DATA (Real solver values + per-action approximation) ═══
        const heroHandEV = handEVs[heroHand] || 0;
        const allEVs = Object.values(handEVs || {}).filter(v => typeof v === 'number');
        const maxHandEV = allEVs.length > 0 ? Math.max(...allEVs) : heroHandEV;

        // ═══ PER-ACTION EV APPROXIMATION ═══
        // At Nash equilibrium, any action in the mixed strategy yields the same EV.
        // Actions with 0% frequency are strictly dominated (lower EV).
        // Approximate: actionEV = heroHandEV for mixed actions,
        //              actionEV = heroHandEV - penalty for 0% actions.
        const actionEVs = {};
        const heroFreqForHand = handActions; // { action: freq 0.0-1.0 }
        validActions.forEach(action => {
            const freq = heroFreqForHand[action] || 0;
            if (freq > 0) {
                // In the mix — all mixed actions yield approximately equal EV
                actionEVs[action] = Math.round(heroHandEV * 100) / 100;
            } else {
                // Not in mix — estimate penalty proportional to pot and strategy purity
                // The more "pure" the solver is (high correctFreq), the worse 0% actions are
                const penalty = estimatedPot * 0.15 * (1 + (gtoFrequencies[optimalAction] || 50) / 100);
                actionEVs[action] = Math.round((heroHandEV - penalty) * 100) / 100;
            }
        });

        // ═══ BUILD OPTIONS — GTO WIZARD PARITY ═══
        // Show ALL real solver actions (context-filtered). Exact GTOW style:
        //   Check/Bet node: Check → Bet sizes ascending
        //   Facing-bet node: Fold → Call → Raise sizes ascending
        // GTO Wizard shows ONLY what the solver has — no fillers unless absolutely needed.
        const sortedActions = this.sortActionsGTOWStyle(validActions, nodeType);
        const options = sortedActions.slice(0, 9).map(action => ({
            id: action,
            text: this.getActionLabelGTOW(action, estimatedPot),
            frequency: gtoFrequencies[action],
        }));

        // ═══ MINIMAL FILLER LOGIC (only when solver gives < 2 actions) ═══
        // GTO Wizard always shows at least 2 options for a decision.
        // If solver only has 1 action, add the most contextually natural alternative.
        if (options.length < 2) {
            const existingIds = new Set(options.map(o => o.id));
            const contextFillers = this.getContextualFillers(nodeType, existingIds, estimatedPot);

            for (const filler of contextFillers) {
                if (options.length >= 3) break;
                if (!existingIds.has(filler.id)) {
                    options.push({
                        id: filler.id,
                        text: filler.text,
                        frequency: 0,
                    });
                    gtoFrequencies[filler.id] = 0;
                    existingIds.add(filler.id);
                }
            }
        }

        // ═══ BUILD EXPLANATION (deterministic, no AI) ═══
        // Derive game category for tournament-only notes (ICM / bubble factor)
        const catSource = `${gameConfig?.gameId || gameConfig?.id || ''} ${gameConfig?.category || ''} ${gameConfig?.pioGameType || ''}`.toUpperCase();
        const gameCategory = catSource.includes('MTT') ? 'MTT'
            : catSource.includes('SPIN') ? 'SPINS'
            : catSource.includes('CASH') ? 'CASH'
            : null;

        const explanation = this.buildExplanation(heroHand, board, scenario.street,
            optimalAction, handActions, heroHandEV, validActions,
            { nodeType, heroPosition, villainPosition, estimatedPot, stackDepth: scenario.stack_depth,
              potType: extractScenarioContext(scenario.scenario_hash, scenario.street, heroPosition, villainPosition).potType,
              actionEVs, gameCategory });

        // ═══ DETERMINE MIXED STRATEGY CORRECTNESS ═══
        // In GTO, if a hand checks 62% and bets 38%, BOTH are correct
        // The "correct" answer is the highest-frequency action, but partial credit applies
        const isMixedStrategy = maxFreq < 0.95 && validActions.filter(a => handActions[a] > 0.05).length > 1;

        return {
            id: `pio_${scenario.id}_${heroHand}_${questionIndex}`,
            type: 'PIO',
            source: 'DETERMINISTIC_SOLVER',
            scenario: {
                board: board.join(' '),
                street: scenario.street,
                stackDepth: scenario.stack_depth,
                gameType: scenario.game_type,
                scenarioHash: scenario.scenario_hash,
                heroHand,
                heroPosition,
                heroStack: scenario.stack_depth || 100,
                pot: estimatedPot,
                villainPosition,
                villainStack: scenario.stack_depth || 100,
                action: this.buildActionDescription(validActions, scenario.street, heroPosition, villainPosition),
                // roadmap #14 -- the chip badge in front of a seat is driven by
                // potMath.committedFor, which reads a NUMBER off the recorded
                // action. `action` above is prose and carries none of them
                // ("CO bets into BTN"), so committedFor returned 0 for every
                // seat on every postflop spot and the badge -- fully built,
                // positioned per DEALER_BUTTON_AND_CHIP_POSITIONS_LAW -- has
                // never once rendered. The size is not missing: buildQuestionText
                // already infers it from the scenario hash and PRINTS it to the
                // player ("CO bets 4bb (66% pot)"). It was simply never handed
                // to the felt. Same number, same source, now structured.
                villainBet: nodeType === 'hero_faces_bet'
                    ? this._villainBetBB(scenario, estimatedPot)
                    : 0,
                nodeType,  // Phase 22: use already-computed node type
                context: extractScenarioContext(scenario.scenario_hash, scenario.street, heroPosition, villainPosition),
                isMixedStrategy,
            },
            heroCards: parseHandToCards(heroHand, board),
            // SYS-002 FIX: Populate boardCards array for PNG card rendering
            boardCards: board.length > 0 ? board : [],
            question: this.buildQuestionText(heroHand, board, scenario.street, heroPosition, villainPosition, validActions, estimatedPot, scenario.scenario_hash, scenario.stack_depth),
            options,
            correctAnswer: optimalAction,
            correctAnswerText: this.getActionLabel(optimalAction, estimatedPot),
            // ═══ REAL SOLVER DATA ═══
            // Phase 22: Ensure rawFrequencies keys match remapped action IDs
            // (e.g., if 'c' was remapped to 'call' in facing-bet context)
            frequencies: handActions,         // Raw 0.0-1.0 per action (remapped)
            gtoFrequencies,                   // Percentage 0-100 per action for UI
            rawFrequencies: (() => {
                // If 'c' was remapped to 'call', add 'call' key to raw frequencies too
                if (nodeType === 'hero_faces_bet' && frequencies['c'] && !frequencies['call']) {
                    return { ...frequencies, call: frequencies['c'] };
                }
                return frequencies;
            })(),       // Full per-hand matrix
            evData: {
                heroHandEV,
                optimalEV: maxHandEV,
                handEVs,
                heroHand,
                actionEVs,  // Per-action EV for GTOW-style display on buttons
            },
            explanation,
            difficulty: level,
            heroHand,
            // Consumers read these at the top level (not just nested in evData)
            actionEVs,
            estimatedPot,
            // Phase 51: Hand categorization for replay display
            handCategory: this.categorizeHand(heroHand, board),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CHART ENGINE (Push/Fold)
    // ═══════════════════════════════════════════════════════════════════════

    async generateFromCharts(gameConfig, level, seenIds) {
        try {
            const { data: charts, error } = await this.db
                .from('memory_charts_gold')
                .select('*')
                .lte('stack_depth', (gameConfig.pioStackDepth || 15) + 5)
                .gte('stack_depth', Math.max(1, (gameConfig.pioStackDepth || 15) - 5))
                .limit(20);

            if (error || !charts || charts.length === 0) return null;

            // Honor seenIds: retry up to 8 times when the built question collides
            const safeSeen = Array.isArray(seenIds) ? seenIds : [];
            let lastQuestion = null;
            for (let attempt = 0; attempt < 8; attempt++) {
                const chart = charts[Math.floor(Math.random() * charts.length)];
                const q = this.buildChartQuestion(chart, level);
                if (!q) continue;
                lastQuestion = q;
                if (!safeSeen.includes(q.id)) return q;
            }
            return lastQuestion;
        } catch (err) {
            console.warn('[DeterministicEngine] Chart query error:', err.message);
            return null;
        }
    }

    buildChartQuestion(chart, level) {
        const handMatrix = chart.hand_matrix || {};
        const hands = Object.keys(handMatrix || {});
        if (hands.length === 0) return null;

        const heroHand = hands[Math.floor(Math.random() * hands.length)];
        const handData = handMatrix[heroHand];
        const pushFreq = handData?.push || handData?.shove || 0;
        const correctAction = pushFreq > 0.5 ? 'push' : 'fold';

        const gtoFrequencies = {
            push: Math.round(pushFreq * 100),
            fold: Math.round((1 - pushFreq) * 100),
        };

        return {
            id: `chart_${chart.id || chart.chart_id}_${heroHand}`,
            type: 'CHART',
            source: 'DETERMINISTIC_SOLVER',
            scenario: {
                stackDepth: chart.stack_depth,
                heroPosition: chart.hero_position || chart.position || 'BTN',
                heroStack: chart.stack_depth || 15,
                villainPosition: 'BB',
                villainStack: chart.stack_depth || 15,
                pot: 1.5,
                board: '',
                action: chart.villain_action || 'Folded to you',
                heroHand,
                isMixedStrategy: pushFreq > 0.1 && pushFreq < 0.9,
            },
            heroCards: parseHandToCards(heroHand),
            boardCards: [],  // Push/fold games are preflop — no board
            question: `${chart.hero_position || 'BTN'} with ${heroHand} at ${chart.stack_depth}BB. ${chart.villain_action || 'Folded to you'}. Push or Fold?`,
            options: [
                { id: 'push', text: 'Push All-In', frequency: gtoFrequencies.push },
                { id: 'fold', text: 'Fold', frequency: gtoFrequencies.fold },
            ],
            correctAnswer: correctAction,
            correctAnswerText: correctAction === 'push' ? 'Push All-In' : 'Fold',
            frequencies: { push: pushFreq, fold: 1 - pushFreq },
            gtoFrequencies,
            // Charts have no real EV data — zero out so the client falls back
            // to simulated EV loss instead of treating frequency as EV.
            evData: {
                heroHandEV: 0,
                optimalEV: 0,
                handEVs: null,
                heroHand,
            },
            explanation: this.buildChartExplanation(heroHand, chart, pushFreq, correctAction),
            difficulty: level,
            heroHand,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONTEXT-AWARE ACTION INTELLIGENCE — GTO Wizard Style
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Detect the decision node type from solver actions.
     * This determines what actions are valid in context.
     *
     * Node types:
     * - 'hero_bets_or_checks': Hero acts first (OOP) or IP after check.
     *    Valid: Check, Bet sizes. NOT valid: Call, Fold (no bet to face).
     * - 'hero_faces_bet': Hero is facing a bet/raise.
     *    Valid: Fold, Call, Raise sizes. NOT valid: Check, Bet.
     * - 'preflop_open': Hero has option to open-raise or fold.
     *    Valid: Fold, Raise sizes, Limp/Call.
     * - 'preflop_facing_raise': Hero faces a raise preflop.
     *    Valid: Fold, Call, 3-bet/raise sizes.
     */
    detectNodeType(solverActions, street) {
        const actionSet = new Set(solverActions.map(a => a.toLowerCase()));

        // If solver has both Check and Bet actions → hero acts first
        const hasCheck = actionSet.has('c') || actionSet.has('x');
        const hasBet = [...actionSet].some(a => a.startsWith('b') && a !== 'b'); // b + number = bet size
        const hasGenericBet = actionSet.has('b'); // Generic 'b' might be bet or might be call in some encodings
        const hasFold = actionSet.has('f');
        const hasCall = actionSet.has('call');
        const hasRaise = [...actionSet].some(a => a.startsWith('r'));
        const hasAllin = actionSet.has('allin');

        if (street === 'preflop') {
            // ═══ Phase 30: Better preflop node detection ═══
            // 'c' in preflop = call (except BB option check where 'x'/'check' is used)
            const hasCallPreflop = actionSet.has('c') || actionSet.has('call');

            // BB option check: solver gives Check + Raise (no fold) = BB facing limp/call
            // This is a special case: BB can check their option or raise
            if (hasCheck && hasRaise && !hasFold && !hasCallPreflop) {
                return 'preflop_bb_option'; // BB can check or raise
            }

            if (hasFold && hasCallPreflop && hasRaise) return 'preflop_facing_raise'; // F/C/R = facing raise
            if (hasFold && hasRaise && !hasCallPreflop) return 'preflop_open';         // F/R only = RFI
            if (hasFold && hasCallPreflop && !hasRaise) return 'preflop_facing_raise'; // F/C only = facing raise, no 3bet option
            // F/C/Allin = facing a jam
            if (hasFold && hasCallPreflop && hasAllin) return 'preflop_facing_raise';
            return 'preflop_open';
        }

        // ═══ POSTFLOP NODE DETECTION ═══
        // A fold option means hero is facing a bet — check this FIRST, since
        // 'c' means call (not check) whenever fold is present.
        if (hasFold && (hasCall || hasRaise || hasAllin)) return 'hero_faces_bet';
        if (hasFold && hasCheck && (hasBet || hasGenericBet)) return 'hero_faces_bet';

        // Check + Bet options → hero can bet or check (acting first or IP after villain checks)
        if (hasCheck && (hasBet || hasGenericBet)) return 'hero_bets_or_checks';
        if (hasCheck && !hasBet && !hasFold) return 'hero_bets_or_checks'; // Pure check node
        if (actionSet.has('x') && (hasBet || hasGenericBet)) return 'hero_bets_or_checks';

        if (hasFold && (hasBet || hasGenericBet)) return 'hero_faces_bet'; // Some solvers use 'b' for raise

        // ═══ Phase 30: Handle edge case where 'c' means call in postflop context ═══
        // If we see 'c' + fold + raise sizes, 'c' is definitely call (not check)
        if (hasFold && hasCheck && hasRaise) {
            // Ambiguous: 'c' could be call in this context since fold is present
            return 'hero_faces_bet';
        }

        // Fallback: infer from presence of check vs fold
        if (hasCheck || actionSet.has('x')) return 'hero_bets_or_checks';
        if (hasFold) return 'hero_faces_bet';

        return 'hero_bets_or_checks'; // Default assumption
    }

    /**
     * Get contextually valid filler actions based on the decision node type.
     * Only called when solver provides < 2 actions (very rare).
     *
     * GTO Wizard NEVER shows Call/Fold when hero acts first after a check.
     * GTO Wizard NEVER shows Check/Bet when hero faces a bet.
     */
    getContextualFillers(nodeType, existingIds, potSize) {
        const fillers = [];

        switch (nodeType) {
            case 'hero_bets_or_checks':
                // Hero acts first: valid actions are Check and Bet sizes
                if (!existingIds.has('c') && !existingIds.has('x')) {
                    fillers.push({ id: 'c', text: 'Check' });
                }
                if (![...existingIds].some(id => id.startsWith('b'))) {
                    fillers.push({ id: 'b33', text: 'Bet 33%' });
                    fillers.push({ id: 'b66', text: 'Bet 67%' });
                    fillers.push({ id: 'b100', text: 'Bet Pot' });
                }
                break;

            case 'hero_faces_bet':
                // Hero faces a bet: valid actions are Fold, Call, Raise sizes
                if (!existingIds.has('f')) {
                    fillers.push({ id: 'f', text: 'Fold' });
                }
                if (!existingIds.has('call')) {
                    fillers.push({ id: 'call', text: 'Call' });
                }
                if (![...existingIds].some(id => id.startsWith('r'))) {
                    fillers.push({ id: 'r', text: 'Raise' });
                }
                break;

            case 'preflop_open':
                if (!existingIds.has('f')) fillers.push({ id: 'f', text: 'Fold' });
                if (![...existingIds].some(id => id.startsWith('r'))) {
                    fillers.push({ id: 'r', text: 'Raise 2.5x' });
                }
                break;

            case 'preflop_facing_raise':
                if (!existingIds.has('f')) fillers.push({ id: 'f', text: 'Fold' });
                if (!existingIds.has('call')) fillers.push({ id: 'call', text: 'Call' });
                if (![...existingIds].some(id => id.startsWith('r'))) {
                    fillers.push({ id: 'r', text: '3-Bet' });
                }
                break;

            case 'preflop_bb_option':
                // BB option: check or raise (no fold needed — already invested)
                if (!existingIds.has('c') && !existingIds.has('x')) {
                    fillers.push({ id: 'x', text: 'Check' });
                }
                if (![...existingIds].some(id => id.startsWith('r'))) {
                    fillers.push({ id: 'r', text: 'Raise' });
                }
                break;

            default:
                // Minimal safe fillers
                if (!existingIds.has('c') && !existingIds.has('x')) {
                    fillers.push({ id: 'c', text: 'Check' });
                }
                if (!existingIds.has('f')) {
                    fillers.push({ id: 'f', text: 'Fold' });
                }
                break;
        }

        return fillers;
    }

    /**
     * Build a contextual action description based on solver data.
     * Phase 29: Richer descriptions with bet sizing context and action line awareness.
     */
    /**
     * Postflop acting order: the player closest to the button acts LAST.
     * SB acts first, BTN acts last. Hero is "in position" when hero acts after
     * villain, which is the only situation in which villain can already have
     * checked when hero is asked to decide.
     *
     * The order itself lives in src/engines/positionOrder.js so that every
     * consumer — this engine and the postflop scenario generator alike — reads
     * the same table. Unknown seats return false, keeping the old wording.
     */
    heroActsFirstPostflop(heroPosition, villainPosition) {
        return actsFirstPostflop(heroPosition, villainPosition);
    }

    buildActionDescription(solverActions, street, heroPosition, villainPosition) {
        const nodeType = this.detectNodeType(solverActions, street);

        if (street === 'preflop') {
            if (nodeType === 'preflop_open') return 'Folded to you';
            if (nodeType === 'preflop_facing_raise') return `${villainPosition} opens`;
            if (nodeType === 'preflop_bb_option') return `${villainPosition} limps — BB option`;
            return '';
        }

        // For postflop: extract what villain did from the action context
        switch (nodeType) {
            case 'hero_bets_or_checks':
                // This node means "hero may bet or check" -- which covers TWO
                // different spots: hero out of position acting FIRST, and hero
                // in position after villain checked. Reporting both as
                // "villain checks to hero" produced the impossible line
                // "BB vs BTN, villain checks" on the flop: the BTN acts LAST,
                // so a BTN villain cannot have checked before the BB decides.
                return this.heroActsFirstPostflop(heroPosition, villainPosition)
                    ? 'First to act'
                    : `${villainPosition} checks to ${heroPosition}`;
            case 'hero_faces_bet': {
                // Infer villain's bet type from what the solver offers as responses
                const raiseActions = solverActions.filter(a => a.toLowerCase().startsWith('r'));
                const hasAllin = solverActions.some(a => a.toLowerCase() === 'allin');
                const hasFold = solverActions.some(a => a.toLowerCase() === 'f');

                // If only fold/call (no raise), villain likely made a large bet
                if (raiseActions.length === 0 && hasAllin) {
                    return `${villainPosition} bets big into ${heroPosition}`;
                }
                if (raiseActions.length === 0 && !hasAllin) {
                    return `${villainPosition} jams into ${heroPosition}`;
                }
                return `${villainPosition} bets into ${heroPosition}`;
            }
            default:
                return this.heroActsFirstPostflop(heroPosition, villainPosition)
                    ? 'First to act'
                    : `${villainPosition} checks to ${heroPosition}`;
        }
    }

    /**
     * Build a rich, contextual question text — GTO Wizard style.
     * Full spot description: game format, stack depth, positions, preflop action,
     * board texture, street action, hand strength.
     */
    buildQuestionText(heroHand, board, street, heroPosition, villainPosition, solverActions, pot, scenarioHash, stackDepth) {
        const nodeType = this.detectNodeType(solverActions, street);
        const boardStr = board.length > 0 ? board.join(' ') : '';
        const context = extractScenarioContext(scenarioHash, street, heroPosition, villainPosition);
        const stackStr = stackDepth ? `${stackDepth}bb` : '';
        const formatStr = context.gameFormat ? `${context.gameFormat} ` : '';

        if (street === 'preflop') {
            // Phase 52: GTO Wizard-style preflop with pot type context
            const stackPart = stackStr ? ` ${stackStr}` : '';
            const prefix = formatStr ? `${formatStr}${stackPart} • ` : (stackPart ? `${stackPart} • ` : '');
            const potType = context.potType || '';

            if (nodeType === 'preflop_open') {
                return `${prefix}${heroPosition} — Folded to you. You hold ${heroHand}. Your action?`;
            } else if (nodeType === 'preflop_facing_raise') {
                // Differentiate facing open vs facing 3-bet vs facing 4-bet
                if (potType === '4-Bet' || potType === '4bet') {
                    return `${prefix}${heroPosition} — Facing a 4-bet from ${villainPosition}. You hold ${heroHand}. Your action?`;
                } else if (potType === '3-Bet' || potType === '3bet') {
                    return `${prefix}${heroPosition} — ${villainPosition} 3-bets. You hold ${heroHand}. Your action?`;
                }
                return `${prefix}${heroPosition} — ${villainPosition} opens. You hold ${heroHand}. Your action?`;
            } else if (nodeType === 'preflop_bb_option') {
                return `${prefix}BB — ${villainPosition} limps. You hold ${heroHand}. Check or raise?`;
            }
            return `${prefix}${heroPosition} — You hold ${heroHand}. Your action?`;
        }

        const handStrength = this.categorizeHand(heroHand, board);
        // Phase 30: Include pot type in preflop context when it's not a standard SRP
        const potTypeLabel = (context.potType && context.potType !== 'SRP') ? ` (${context.potType})` : '';
        const preflopLine = context.preflopAction ? `${context.preflopAction}${potTypeLabel}. ` : '';
        const streetLabel = street.charAt(0).toUpperCase() + street.slice(1);

        // ═══ Phase 29: Rich board texture description ═══
        const textureDesc = this.describeBoardTexture(board, street);
        const texturePart = textureDesc ? ` (${textureDesc})` : '';

        // ═══ Phase 29: Runout card with significance ═══
        let runoutPart = '';
        if (street === 'turn' && board.length >= 4) {
            const significance = this.describeRunoutSignificance(board, street);
            runoutPart = significance
                ? ` → ${board[3]} (${significance})`
                : ` → ${board[3]}`;
        } else if (street === 'river' && board.length >= 5) {
            const significance = this.describeRunoutSignificance(board, street);
            runoutPart = significance
                ? ` → ${board[4]} (${significance})`
                : ` → ${board[4]}`;
        }

        // SPR context — shows when stack-to-pot ratio is decision-critical
        let sprPart = '';
        if (stackDepth && pot) {
            const effectiveStack = stackDepth - (pot / 2);
            const spr = effectiveStack / pot;
            if (spr < 0.5) sprPart = ' [Committed — very short SPR]';
            else if (spr < 1) sprPart = ' [Short SPR]';
            else if (spr < 3 && street === 'river') sprPart = ' [Medium SPR]';
        }

        // ═══ Phase 29: Villain bet sizing context ═══
        // When facing a bet, extract what size villain might have used from solver actions
        let villainAction = '';
        if (nodeType === 'hero_faces_bet') {
            // Phase 52: Infer villain bet size from scenario hash and solver actions
            const betSizeFromHash = this._inferVillainBetSize(scenarioHash, solverActions, pot);
            villainAction = betSizeFromHash
                ? `${villainPosition} bets ${betSizeFromHash}`
                : `${villainPosition} bets`;
        } else {
            // Same conflated node as buildActionDescription: 'hero_bets_or_checks'
            // covers hero acting FIRST out of position as well as hero acting
            // after a check in position. Only the second one involves a villain
            // check. This is the sentence the player actually reads, so the
            // earlier fix to buildActionDescription alone left the impossible
            // "BTN checks to you" on screen in BB vs BTN.
            villainAction = this.heroActsFirstPostflop(heroPosition, villainPosition)
                ? 'you are first to act'
                : `${villainPosition} checks to you`;
        }

        // Phase 52: Pot size in BB for context
        let potPart = '';
        if (pot && pot > 0) {
            const potBB = typeof pot === 'number' ? pot.toFixed(1).replace(/\.0$/, '') : pot;
            potPart = ` Pot: ${potBB}bb.`;
        }

        // ═══ Phase 29: Action line context from scenario hash ═══
        const actionContext = context.actionLine ? ` [${context.actionLine} line]` : '';

        switch (nodeType) {
            case 'hero_bets_or_checks':
                return `${preflopLine}${streetLabel}: [${boardStr}]${texturePart}${runoutPart}.${actionContext} ${villainAction}.${potPart}${sprPart} You hold ${heroHand} (${handStrength}). Your action?`;
            case 'hero_faces_bet':
                return `${preflopLine}${streetLabel}: [${boardStr}]${texturePart}${runoutPart}.${actionContext} ${villainAction}.${potPart}${sprPart} You hold ${heroHand} (${handStrength}). Your action?`;
            default:
                return `${preflopLine}${streetLabel}: [${boardStr}]${texturePart}${runoutPart}.${actionContext}${potPart}${sprPart} You hold ${heroHand} (${handStrength}). Your action?`;
        }
    }

    /**
     * Phase 52: Infer villain bet size from scenario hash naming convention.
     * PIO scenario hashes often encode the bet sizes in the node path, e.g.:
     *   "BTN_vs_BB_SRP_Flop_b33_call_Turn_b66" → villain bet 66% pot on turn
     */
    /**
     * roadmap #14: the bet hero is facing, as a NUMBER, so the felt can draw
     * chips with it. The chip badge is driven by potMath.committedFor, which
     * reads `amount` off a recorded action and otherwise falls back to the
     * first number in the action TEXT -- and buildActionDescription only ever
     * writes prose ("CO bets into BTN"), so every seat committed 0 and the
     * badge could never render. This is the missing number.
     *
     * Deliberately narrow. Two sources, both the solver's own: the terminal
     * bet token of `strategy_matrix.node`, and a percent-of-pot token in the
     * scenario hash (the same token _inferVillainBetSize already renders as
     * prose to the player). Neither present -> 0, and the felt draws no chips,
     * which is the honest answer. Inventing a plausible-looking bet is exactly
     * the class of defect roadmap #16 was: a fabricated value is worse than an
     * absent one, because it looks like data.
     *
     * MEASURED 2026-08-07 against production `solved_spots_gold`: NO row
     * currently carries either token. Scenario hashes are shaped
     * `<street>_<gametype>_<pos>_<depth>bb_<board>` with no `_b##` segment, and
     * of the rows that do carry a `node` path, zero match `b[0-9]+$` -- the
     * harvester only stored nodes where hero acts first. So this returns 0 for
     * every row in production today and the badge stays dark on a facing-bet
     * spot. That is a CONTENT gap of the same shape as #16 and #18, not a felt
     * bug: the plumbing below is what makes the badge light up the moment a
     * re-solve stores facing-bet nodes.
     *
     * An all-in is not sized here either. The hash says "allin" without saying
     * how deep, and the stack the villain shoved is the villain's stack, not a
     * fraction of the pot -- that belongs to a caller that knows the depth.
     */
    _villainBetBB(scenario, pot) {
        if (!scenario || !pot || pot <= 0) return 0;

        // SOURCE 1 -- the solver's own node path. PioSOLVER writes the line that
        // reached this decision into strategy_matrix.node, e.g.
        // "r:0:c:b488:c:Qh:c". A trailing bet token means hero is looking at
        // that bet RIGHT NOW; a trailing "c" or a card means hero faces a check
        // and nobody has chips out. Anything other than a terminal bet is not a
        // bet hero faces, so only the terminal token counts. These amounts are
        // absolute chips in the solver's own units, which is the same unit the
        // matrix's own `pot` is written in -- so they are rebased onto the pot
        // the felt is actually showing rather than used raw.
        const sm = scenario.strategy_matrix || {};
        const node = typeof sm.node === 'string' ? sm.node : '';
        const tail = node.match(/b(\d+)$/);
        if (tail) {
            const chips = parseInt(tail[1], 10);
            const solverPot = Number(sm.pot);
            if (isFinite(chips) && chips > 0) {
                if (isFinite(solverPot) && solverPot > 0) {
                    return Math.round(((chips / solverPot) * pot) * 10) / 10;
                }
                return Math.round(chips * 10) / 10;
            }
        }

        // SOURCE 2 -- a percent-of-pot token in the scenario hash (`_b66`), the
        // same token _inferVillainBetSize already renders as prose to the player.
        const betPatterns = String(scenario.scenario_hash || '').toLowerCase().match(/[_.]b(\d+)/g);
        if (!betPatterns || betPatterns.length === 0) return 0;
        const pctMatch = betPatterns[betPatterns.length - 1].match(/b(\d+)/);
        if (!pctMatch) return 0;
        const pct = parseInt(pctMatch[1], 10);
        if (!isFinite(pct) || pct <= 0) return 0;
        return Math.round(((pct / 100) * pot) * 10) / 10;
    }

    _inferVillainBetSize(scenarioHash, solverActions, pot) {
        if (!scenarioHash) return null;
        const hash = scenarioHash.toLowerCase();

        // Look for the last bet size in the scenario hash path
        // Patterns: b33, b50, b66, b75, b100, b125, b150, b200, b300
        const betPatterns = hash.match(/[_.]b(\d+)/g);
        if (betPatterns && betPatterns.length > 0) {
            const lastBet = betPatterns[betPatterns.length - 1];
            const pctMatch = lastBet.match(/b(\d+)/);
            if (pctMatch) {
                const pct = parseInt(pctMatch[1]);
                // Convert percentage to BB if we have pot info
                if (pot && pot > 0) {
                    const betBB = ((pct / 100) * pot).toFixed(1).replace(/\.0$/, '');
                    return `${betBB}bb (${pct}% pot)`;
                }
                return `${pct}% pot`;
            }
        }

        // Check for all-in in hash
        if (hash.includes('allin') || hash.includes('jam') || hash.includes('shove')) {
            return 'all-in';
        }

        return null;
    }

    /**
     * Describe board texture in natural language — GTO Wizard style.
     * Returns rich descriptions like "Dry ace-high rainbow" or "Wet low monotone with straight draws"
     * instead of just tags. This reads like how a coach would describe the board.
     */
    describeBoardTexture(board, street) {
        if (!board || board.length < 3) return '';
        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);
        if (validBoard.length < 3) return '';

        const ranks = validBoard.map(c => c[0].toUpperCase());
        const suits = validBoard.map(c => c[1]?.toLowerCase());
        const rankVals = ranks.map(r => '23456789TJQKA'.indexOf(r));
        const RANK_NAMES = { 0: '2', 1: '3', 2: '4', 3: '5', 4: '6', 5: '7', 6: '8', 7: '9', 8: 'T', 9: 'J', 10: 'Q', 11: 'K', 12: 'A' };

        // ═══ SUIT ANALYSIS ═══
        const suitCounts = {};
        suits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const maxSuitCount = Math.max(...Object.values(suitCounts || {}));
        const isMonotone = maxSuitCount === validBoard.length && validBoard.length >= 3;
        const hasFlushDraw = maxSuitCount >= 2 && !isMonotone;
        const hasFlushComplete = maxSuitCount >= 3 && validBoard.length >= 4;
        const isRainbow = Object.values(suitCounts || {}).every(c => c === 1);

        // ═══ PAIRING ═══
        const rankCounts = {};
        ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
        const maxRankCount = Math.max(...Object.values(rankCounts || {}));
        const isPaired = maxRankCount === 2;
        const isTrips = maxRankCount >= 3;
        const pairedRank = isPaired ? Object.entries(rankCounts || {}).find(([r, c]) => c >= 2)?.[0] : null;

        // ═══ CONNECTIVITY ═══
        const sorted = [...new Set(rankVals)].sort((a, b) => a - b);
        let maxConnect = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
            const gap = sorted[i + 1] - sorted[i];
            if (gap <= 2) maxConnect++;
        }
        const isConnected = maxConnect >= 2; // 3+ cards within range
        const hasGutshot = maxConnect >= 1;
        const isStraightPossible = sorted.length >= 3 && (sorted[sorted.length - 1] - sorted[0]) <= 4;

        // ═══ HIGH CARD TEXTURE ═══
        const highCards = rankVals.filter(v => v >= 9).length; // T+ are high
        const highestRank = Math.max(...rankVals);
        const lowestRank = Math.min(...rankVals);
        const isAceHigh = highestRank === 12;
        const isKingHigh = highestRank === 11 && !isAceHigh;
        const isLow = highestRank <= 7; // 9-high or lower
        const isBroadwayHeavy = highCards >= 3;
        const isMidrange = !isLow && highCards <= 1;

        // ═══ WETNESS SCORE ═══
        let wetness = 0;
        if (isConnected) wetness += 2;
        else if (hasGutshot) wetness += 1;
        if (isMonotone) wetness += 3;
        else if (hasFlushDraw) wetness += 1;
        if (!isPaired && !isTrips) wetness += 0.5; // unpaired = more draws
        const isWet = wetness >= 2.5;
        const isDry = wetness <= 1;

        // ═══ BUILD NATURAL LANGUAGE ═══
        const parts = [];

        // Wetness descriptor
        if (isWet) parts.push('Wet');
        else if (isDry) parts.push('Dry');
        else parts.push('Semi-wet');

        // Height descriptor
        if (isAceHigh) parts.push('ace-high');
        else if (isKingHigh) parts.push('king-high');
        else if (isBroadwayHeavy) parts.push('broadway');
        else if (isLow) parts.push('low');
        else if (isMidrange) parts.push('mid-range');

        // Suit descriptor
        if (isMonotone) parts.push('monotone');
        else if (hasFlushComplete) parts.push('flush-completed');
        else if (isRainbow) parts.push('rainbow');
        else parts.push('two-tone');

        // Special descriptors
        const extras = [];
        if (isPaired) extras.push('paired board');
        if (isTrips) extras.push('trips on board');
        if (isConnected) extras.push('coordinated');
        if (isStraightPossible && !isConnected) extras.push('straight possible');

        let desc = parts.join(' ');
        if (extras.length > 0) desc += ` — ${extras.join(', ')}`;

        return desc;
    }

    /**
     * Phase 29: Describe significance of the turn/river card.
     * GTO Wizard contextualizes runout cards — "flush-completing river"
     * or "board pairs on the turn" changes decision-making dramatically.
     */
    describeRunoutSignificance(board, street) {
        if (!board || board.length < 4) return '';
        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);

        if (street === 'turn' && validBoard.length >= 4) {
            return this._describeCardImpact(validBoard.slice(0, 3), validBoard[3]);
        }
        if (street === 'river' && validBoard.length >= 5) {
            return this._describeCardImpact(validBoard.slice(0, 4), validBoard[4]);
        }
        return '';
    }

    /**
     * Phase 29: Analyze what a new card changes about the board.
     */
    _describeCardImpact(existingBoard, newCard) {
        if (!newCard || newCard.length < 2) return '';

        const newRank = newCard[0].toUpperCase();
        const newSuit = newCard[1]?.toLowerCase();
        const newVal = '23456789TJQKA'.indexOf(newRank);

        const existRanks = existingBoard.map(c => c[0].toUpperCase());
        const existSuits = existingBoard.map(c => c[1]?.toLowerCase());
        const existVals = existRanks.map(r => '23456789TJQKA'.indexOf(r));

        const impacts = [];

        // Check if new card pairs the board
        if (existRanks.includes(newRank)) {
            const RANK_DISPLAY = { 'T': 'ten', 'J': 'jack', 'Q': 'queen', 'K': 'king', 'A': 'ace' };
            const display = RANK_DISPLAY[newRank] || newRank;
            impacts.push(`pairs the ${display}`);
        }

        // Check if new card completes a flush
        const suitCounts = {};
        existSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const sameSuitOnBoard = suitCounts[newSuit] || 0;
        if (sameSuitOnBoard >= 2) {
            impacts.push('completes a possible flush');
        } else if (sameSuitOnBoard === 1) {
            impacts.push('adds a second flush card');
        }

        // Check if new card completes a straight
        const allVals = new Set([...existVals, newVal]);
        for (let start = 0; start <= 8; start++) {
            const window = [start, start + 1, start + 2, start + 3, start + 4];
            if (window.every(v => allVals.has(v))) {
                // Check that the new card is part of this straight
                if (window.includes(newVal)) {
                    impacts.push('completes a possible straight');
                    break;
                }
            }
        }
        // Wheel check
        const wheelVals = [12, 0, 1, 2, 3];
        if (wheelVals.every(v => allVals.has(v)) && wheelVals.includes(newVal)) {
            if (!impacts.includes('completes a possible straight')) {
                impacts.push('completes a wheel straight');
            }
        }

        // Check if it's an overcard
        const highestExist = Math.max(...existVals);
        if (newVal > highestExist) {
            const RANK_DISPLAY = { 'T': 'ten', 'J': 'jack', 'Q': 'queen', 'K': 'king', 'A': 'ace' };
            const display = RANK_DISPLAY[newRank] || newRank;
            impacts.push(`overcard (${display})`);
        }

        // Phase 57: Enhanced brick/scare card detection
        if (impacts.length === 0) {
            if (newVal <= 3) impacts.push('brick — deuce/trey changes nothing');
            else if (newVal <= 5) impacts.push('low brick — doesn\'t change the board dynamics');
            else if (newVal >= 9 && newVal <= 11) impacts.push('broadway card — could have connected with many hands');
            else impacts.push('relatively blank runout');
        }

        // Phase 57: Add strategic context based on combination of impacts
        if (impacts.length >= 2 && impacts.some(i => i.includes('flush')) && impacts.some(i => i.includes('straight'))) {
            impacts.push('double-draw completion — very dynamic card');
        }

        return impacts.join(', ');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 22: GTO WIZARD OPTION PARITY — SORTING & LABELING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Sort actions in GTO Wizard order:
     *
     * Check/Bet node:  Check → Bet sizes ascending (16%, 33%, 45%, 67%, 100%...) → All-In
     * Facing-bet node: Fold → Call → Raise sizes ascending → All-In
     * Preflop open:    Fold → Raise sizes ascending → All-In
     * Preflop facing:  Fold → Call → 3-Bet sizes ascending → All-In
     *
     * GTO Wizard always puts the passive option first, then aggressive options ascending.
     */
    sortActionsGTOWStyle(actions, nodeType) {
        const getActionSortKey = (action) => {
            const a = action.toLowerCase();
            if (a === 'c' || a === 'x') return 0;       // Check first
            if (a === 'f') return 0;                      // Fold first (facing bet)
            if (a === 'call') return 1;                   // Call second
            const betMatch = a.match(/^b(\d+)$/);
            if (betMatch) return 100 + parseInt(betMatch[1]);  // Bets ascending
            const raiseMatch = a.match(/^r(\d+)$/);
            if (raiseMatch) return 200 + parseInt(raiseMatch[1]); // Raises ascending
            if (a === 'b') return 150;
            if (a === 'r') return 250;
            if (a === 'allin') return 9999;               // All-In last
            return 500;
        };
        return [...actions].sort((a, b) => getActionSortKey(a) - getActionSortKey(b));
    }

    /**
     * GTO Wizard-style action labels — clean percentage, no BB amounts.
     *   "Check", "Bet 16%", "Bet 45%", "Bet 67%", "Bet Pot", "Overbet 150%"
     *   "Fold", "Call", "Raise 50%", "Raise Pot", "All-In"
     */
    getActionLabelGTOW(actionCode, potSize = 6) {
        const a = actionCode.toLowerCase();
        if (a === 'c' || a === 'x') return 'Check';
        if (a === 'f') return 'Fold';
        if (a === 'call') return 'Call';
        if (a === 'allin') return 'All-In';

        const betMatch = a.match(/^b(\d+)$/);
        if (betMatch) {
            const pct = parseInt(betMatch[1]);
            if (pct === 100) return 'Bet Pot';
            if (pct > 100) return `Overbet ${pct}%`;
            return `Bet ${pct}%`;
        }

        const raiseMatch = a.match(/^r(\d+)$/);
        if (raiseMatch) {
            const pct = parseInt(raiseMatch[1]);
            if (pct === 100) return 'Raise Pot';
            return `Raise ${pct}%`;
        }

        if (a === 'b') return 'Bet';
        if (a === 'r') return 'Raise';
        return actionCode.toUpperCase();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Get human-readable action label (delegates to GTOW-style)
     */
    getActionLabel(actionCode, potSize = 6) {
        return this.getActionLabelGTOW(actionCode, potSize);
    }

    /**
     * Build deterministic explanation from solver data — GTO Wizard style.
     * Phase 25: Rich strategic reasoning with sizing logic, position context,
     * board texture impact, and conceptual poker theory.
     */
    buildExplanation(heroHand, board, street, optimalAction, handActions, ev, validActions, ctx = {}) {
        if (!heroHand || !optimalAction) return '';
        const label = this.getActionLabelGTOW(optimalAction);
        const freq = handActions[optimalAction] || 0;
        const freqPct = (freq * 100).toFixed(0);
        const handStrength = this.categorizeHand(heroHand, board);
        const { nodeType, heroPosition, villainPosition, estimatedPot, stackDepth } = ctx;

        // ═══ PREFLOP-SPECIFIC EXPLANATIONS ═══
        if (street === 'preflop') {
            const baseExpl = this._buildPreflopExplanation(heroHand, optimalAction, handActions, freq, freqPct, label, validActions, nodeType, heroPosition, villainPosition, stackDepth, ctx.potType);
            // Phase 91: Append hand equity tier context
            const handTier = this._getPreflopHandTier(heroHand);
            const tierNote = handTier.equityVsRandom ? ` [~${handTier.equityVsRandom}% equity vs random — ${handTier.description}]` : '';
            return baseExpl + tierNote;
        }

        // ═══ STRATEGIC REASONING ENGINE ═══
        const a = optimalAction.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');

        // Extract bet sizing percentage
        const sizeMatch = a.match(/^[br](\d+)$/);
        const sizePct = sizeMatch ? parseInt(sizeMatch[1]) : (a === 'allin' ? 999 : 0);

        // Board texture for reasoning
        const texture = this._analyzeTexture(board);

        // ═══ SIZING REASONING — Why this specific size? ═══
        const sizingReason = this._getSizingReason(sizePct, handStrength, texture, street, isBet, isRaise);

        // ═══ STRATEGIC CONCEPT — What poker concept drives this? ═══
        const concept = this._getStrategicConcept(optimalAction, handStrength, texture, street, freq, validActions, handActions, nodeType, heroPosition, villainPosition);

        // ═══ Phase 60: BLOCKER AWARENESS ═══
        const blockerNote = this._getBlockerContext(heroHand, board, handStrength, optimalAction, street, texture);

        // ═══ Phase 61: RANGE ADVANTAGE CONTEXT ═══
        const rangeNote = this._getRangeAdvantageNote(board, street, optimalAction, texture, ctx.nodeType, ctx.heroPosition, ctx.villainPosition, handStrength);

        // ═══ Phase 62: MULTI-STREET PLANNING ═══
        const multiStreetNote = this._getMultiStreetPlan(street, optimalAction, sizePct, handStrength, texture, ctx.estimatedPot, ctx.stackDepth);

        // ═══ Phase 64: POT ODDS & EQUITY MATH ═══
        const potOddsNote = this._getPotOddsMath(optimalAction, handStrength, street, validActions, ctx.estimatedPot, ctx.nodeType);

        // ═══ Phase 69: SPR AWARENESS ═══
        const sprNote = this._getSPRContext(optimalAction, handStrength, street, ctx.estimatedPot, ctx.stackDepth);

        // ═══ Phase 73: VILLAIN TENDENCY CONTEXT ═══
        const villainNote = this._getVillainTendencyNote(optimalAction, handStrength, street, texture, ctx.nodeType, ctx.heroPosition, ctx.villainPosition, freq);

        // ═══ Phase 76: DYNAMIC EXPLANATION DEPTH ═══
        const explanationDepth = this._getExplanationDepth(street, handStrength, optimalAction, ctx.nodeType, ctx.spotType);
        const coachingNote = this._getDepthCoachingNote(explanationDepth, street, handStrength, optimalAction);

        // ═══ Phase 77: BOARD RUNOUT IMPACT ═══
        const runoutNote = this._getRunoutImpact(board, heroHand, handStrength, street, texture);

        // ═══ Phase 78: EQUITY REALIZATION CONTEXT ═══
        const eqRealizationNote = this._getEquityRealizationNote(optimalAction, handStrength, street, ctx.heroPosition, ctx.villainPosition, ctx.stackDepth, texture);

        // ═══ Phase 79: POSITION-AWARE STRATEGY ═══
        const positionNote = this._getPositionStrategyNote(optimalAction, handStrength, street, ctx.heroPosition, ctx.villainPosition, ctx.nodeType, texture, freq);

        // ═══ Phase 81: RANGE POLARIZATION CONTEXT ═══
        const polarizationNote = this._getRangePolarizationNote(optimalAction, handStrength, street, sizePct, ctx.nodeType, texture);

        // ═══ Phase 82: TRAP DETECTION ═══
        const trapNote = this._getTrapDetectionNote(optimalAction, handStrength, street, texture, ctx.nodeType, freq);

        // ═══ Phase 83: BOARD COVERAGE ═══
        const boardCoverageNote = this._getBoardCoverageNote(optimalAction, handStrength, street, sizePct, freq, texture, ctx.nodeType, ctx.heroPosition);

        // ═══ Phase 84: MULTI-STREET EV PROJECTION ═══
        const multiStreetEVNote = this._getMultiStreetEVNote(optimalAction, handStrength, street, sizePct, ctx.estimatedPot, ctx.stackDepth, texture);

        // ═══ Phase 85: KICKER STRENGTH ═══
        const kickerNote = this._getKickerNote(heroHand, handStrength, board, optimalAction, street);

        // ═══ Phase 86: NUT ADVANTAGE ═══
        const nutAdvNote = this._getNutAdvantageNote(board, ctx.heroPosition, ctx.villainPosition, street, texture, ctx.nodeType);

        // ═══ Phase 87: BACKDOOR EQUITY ═══
        const backdoorNote = this._getBackdoorEquityNote(heroHand, board, handStrength, street);

        // ═══ Phase 88: PROTECTION URGENCY ═══
        const protectionNote = this._getProtectionNote(optimalAction, handStrength, street, texture, ctx.heroPosition, ctx.villainPosition);

        // ═══ Phase 89: SHOWDOWN VALUE ═══
        const showdownNote = this._getShowdownValueNote(optimalAction, handStrength, street, ctx.nodeType);

        // ═══ Phase 92: EV COMPARISON ═══
        const evCompNote = this._getEVComparisonNote(optimalAction, ctx.actionEVs, ctx.estimatedPot);

        // ═══ Phase 93: CHECK-RAISE STRATEGY ═══
        const checkRaiseNote = this._getCheckRaiseNote(optimalAction, handStrength, street, ctx.nodeType, texture);

        // ═══ Phase 95: BOARD TEXTURE EVOLUTION ═══
        const textureEvoNote = this._getTextureEvolutionNote(board, street);

        // ═══ Phase 96: OVERBETTING CONTEXT ═══
        const overbetNote = this._getOverbetNote(optimalAction, handStrength, street, sizePct, texture);

        // ═══ Phase 97: THIN VALUE BET ═══
        const thinValueNote = this._getThinValueNote(optimalAction, handStrength, street, sizePct, freq);

        // ═══ Phase 98: GTO FRAMING ═══
        const gtoFrameNote = this._getGTOFramingNote(optimalAction, freq, handActions, handStrength);

        // ═══ Phases 106-123: ADVANCED THEORY NOTES ═══
        const cbetNote = this._getCBetTheory(optimalAction, handStrength, street, ctx.nodeType, texture, ctx.heroPosition, ctx.villainPosition);
        const barrelNote = this._getBarrelTheory(optimalAction, handStrength, street, texture, freq);
        const donkNote = this._getDonkBetTheory(optimalAction, handStrength, street, ctx.nodeType, texture, ctx.heroPosition, ctx.villainPosition);
        const mdfNote = this._getMDFContext(optimalAction, street, ctx.nodeType, ctx.estimatedPot);
        const probeNote = this._getProbeBetTheory(optimalAction, handStrength, street, ctx.nodeType, texture);
        const cappingNote = this._getRangeCappingNote(street, ctx.nodeType, texture);
        const reverseIONote = this._getReverseImpliedOddsNote(handStrength, street, texture);
        const cardRemovalNote = this._getCardRemovalNote(heroHand, board, handStrength, optimalAction);
        const impliedOddsNote = this._getImpliedOddsNote(handStrength, street, optimalAction, ctx.estimatedPot, ctx.stackDepth);
        const foldEquityNote = this._getFoldEquityNote(optimalAction, handStrength, street, ctx.nodeType, freq);
        const comboDrawNote = this._getCombDrawNote(handStrength);
        const boardPairNote = this._getBoardPairNote(handStrength, texture, street);
        const aceHighNote = this._getAceHighBoardNote(handStrength, texture, street, ctx.nodeType, ctx.heroPosition);
        const monotoneNote = this._getMonotoneBoardNote(handStrength, texture, street);
        const lowBoardNote = this._getLowBoardNote(handStrength, texture, street, ctx.heroPosition, ctx.nodeType);
        const riverBluffNote = this._getRiverBluffCriteria(heroHand, handStrength, board, optimalAction, street);
        const bluffCatchNote = this._getBluffCatcherNote(handStrength, optimalAction, street, ctx.nodeType);
        const rangeNarrowNote = this._getRangeNarrowingNote(street, ctx.nodeType);

        // ═══ Phase 126-133: Advanced postflop theory notes ═══
        const multiWayNote = this._getMultiWayNote(ctx.nodeType, ctx.potType, handStrength, optimalAction);
        const sizingTellNote = this._getBetSizingTellNote(ctx.nodeType, street, optimalAction);
        const checkBackNote = this._getCheckBackNote(optimalAction, handStrength, street, texture, ctx.heroPosition, ctx.villainPosition);
        const delayedCBetNote = this._getDelayedCBetNote(optimalAction, handStrength, street, ctx.nodeType, texture);
        const floatNote = this._getFloatPlayNote(optimalAction, handStrength, street, ctx.heroPosition, ctx.villainPosition);
        const raiseVsCallNote = this._getRaiseVsCallNote(optimalAction, handStrength, street, ctx.nodeType, texture);
        const turnCatNote = this._getTurnCardCategoryNote(board, street, handStrength, texture);
        const riverDecisionNote = this._getRiverDecisionNote(optimalAction, handStrength, street, ctx.nodeType);
        // Phase 134-139: SPR, stack depth, pot geometry, range/nut advantage, board interaction, equity distribution
        const sprMatrixNote = this._getSPRMatrixNote(ctx.estimatedPot, ctx.stackDepth, handStrength, street);
        const stackStratNote = this._getStackDepthStrategyNote(ctx.stackDepth, handStrength, street);
        const potGeoNote = this._getPotGeometryNote(ctx.estimatedPot, ctx.stackDepth, street, optimalAction);
        const rangeVsNutNote = this._getRangeVsNutAdvantageNote(ctx.heroPosition, ctx.villainPosition, texture, street, ctx.nodeType);
        const boardInterNote = this._getBoardInteractionNote(ctx.heroPosition, ctx.villainPosition, texture, ctx.nodeType, street);
        const eqDistNote = this._getEquityDistributionNote(handStrength, optimalAction, street, ctx.nodeType);
        const handReadNote = this._getHandReadingNote(street, ctx.nodeType, optimalAction);
        const exploitNote = this._getExploitativeSuggestion(handStrength, optimalAction, street, ctx.nodeType);

        // ═══ Phase 151-175 notes ═══
        const handRankNote = this._getHandRankingNote(handStrength, optimalAction, street);
        const nutBlockerNote = this._getNutBlockerBluffNote(heroHand, board, handStrength, optimalAction, street);
        const eqDenialNote = this._getEquityDenialNote(optimalAction, handStrength, street, texture);
        const potVsImpliedNote = this._getPotVsImpliedOddsNote(optimalAction, handStrength, street, ctx.estimatedPot, ctx.stackDepth);
        const fourBetNote = this._get4Bet5BetNote(ctx.nodeType, ctx.potType, optimalAction, handStrength, ctx.stackDepth);
        const multiBluffNote = this._getMultiStreetBluffNote(optimalAction, handStrength, street, texture);
        const xrSizingNote = this._getCheckRaiseSizingNote(optimalAction, street, ctx.nodeType, texture);
        const riverOBNote = this._getRiverOverbetNote(optimalAction, handStrength, street, ctx.stackDepth, ctx.estimatedPot);
        const valueThickNote = this._getValueThicknessNote(handStrength, optimalAction, street);
        const mergedPolarNote = this._getMergedVsPolarizedNote(optimalAction, handStrength, street, freq);
        const nodeLockNote = this._getNodeLockingNote(handStrength, optimalAction, street);
        const icmNote = this._getICMNote(ctx.stackDepth, handStrength, optimalAction, ctx.gameCategory || null);
        const blindVsBlindNote = this._getBlindVsBlindNote(ctx.heroPosition, ctx.villainPosition, ctx.nodeType, optimalAction);

        // ═══ Phase 176-200 notes ═══
        const mixedStratNote = this._getMixedStrategyNote(handActions, optimalAction, freq);
        const opponentModelNote = this._getOpponentModelNote(ctx.nodeType, street);
        const crossStreetNote = this._getCrossStreetConsistencyNote(street, ctx.nodeType, optimalAction, handStrength);
        const rangeThinkNote = this._getRangeThinkingNote(street, handStrength);
        const solverConfNote = this._getSolverApproximationNote(freq, handActions);

        // ═══ Phase 201-225 notes ═══
        const eqBucketNote = this._getEquityBucketNote(handStrength, optimalAction, handActions);
        const rangeMorphNote = this._getRangeMorphologyNote(street, ctx.nodeType, handStrength);
        const blockerMatrixNote = this._getBlockerMatrixNote(heroHand, board, handStrength, optimalAction);
        const potCommitNote = this._getPotCommitmentNote(ctx.estimatedPot, ctx.stackDepth, optimalAction);
        const checkCallFoldNote = this._getCheckCallFoldNote(optimalAction, handStrength, street, ctx.nodeType);
        const facingDonkNote = this._getFacingDonkNote(optimalAction, handStrength, street, ctx.nodeType);
        const slowPlayNote = this._getSlowPlayChecklistNote(optimalAction, handStrength, street, texture);
        const obChecklistNote = this._getOverbetChecklistNote(optimalAction, handStrength, street, texture, ctx.stackDepth, ctx.estimatedPot);
        const riverPolNote = this._getRiverPolarizationIndex(handActions, street);
        const evDecompNote = this._getEVDecompositionNote(street, optimalAction, handStrength, ctx.estimatedPot);
        const multiSizeNote = this._getMultiSizingNote(optimalAction, handActions, handStrength, street, texture);
        const solverLineNote = this._getSolverLineNote(street, optimalAction, ctx.nodeType, handStrength);

        // ═══ Phase 226-250 notes ═══
        const handCatDiveNote = this._getHandCategoryDeepDive(handStrength, street, optimalAction);
        const aggressionCoachNote = this._getAggressionCoachingNote(optimalAction, handStrength, street, ctx.nodeType, texture);
        const rangeAdvScoreNote = this._getRangeAdvantageScore(ctx.heroPosition, ctx.villainPosition, texture, ctx.nodeType, street);
        const villainNarrowNote = this._getVillainRangeNarrowNote(street, ctx.nodeType, optimalAction);
        const eqEstimateNote = this._getEquityEstimateNote(handStrength, street, ctx.nodeType, optimalAction);
        const tournamentNote = this._getTournamentAdjustmentNote(ctx.stackDepth);

        // ═══ Phase 42: RIVER-SPECIFIC ENHANCED REASONING ═══
        const riverEnhancement = (street === 'river') ? this._getRiverContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq) : '';

        // ═══ Phase 43: TURN-SPECIFIC ENHANCED REASONING ═══
        const turnEnhancement = (street === 'turn') ? this._getTurnContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq, sizePct) : '';

        // ═══ Phase 46: FLOP-SPECIFIC ENHANCED REASONING ═══
        const flopEnhancement = (street === 'flop') ? this._getFlopContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq, sizePct) : '';

        // ═══ BUILD FINAL EXPLANATION ═══
        // Street-specific enhancement
        const streetExtra = riverEnhancement || turnEnhancement || flopEnhancement;

        // Phase 76: Depth-aware extras assembly
        // Concise mode: only sizing reason + concept (skip secondary notes)
        // Verbose mode: all notes + coaching preamble (up to 5 most relevant)
        // Standard: top 3-4 most relevant notes
        // Phase 125: Relevance-scored note selection
        const allNotesRaw = [sizingReason, trapNote, checkRaiseNote, overbetNote, thinValueNote,
            cbetNote, barrelNote, donkNote, comboDrawNote, riverBluffNote, bluffCatchNote,
            blockerNote, cardRemovalNote, rangeNote, polarizationNote, nutAdvNote,
            protectionNote, showdownNote, foldEquityNote, kickerNote, backdoorNote,
            reverseIONote, impliedOddsNote, mdfNote, probeNote, cappingNote,
            boardPairNote, aceHighNote, monotoneNote, lowBoardNote,
            multiStreetNote, potOddsNote, sprNote, villainNote, runoutNote,
            eqRealizationNote, positionNote, boardCoverageNote, multiStreetEVNote,
            textureEvoNote, evCompNote, rangeNarrowNote, gtoFrameNote,
            // Phase 126-142 notes
            multiWayNote, sizingTellNote, checkBackNote, delayedCBetNote, floatNote,
            raiseVsCallNote, turnCatNote, riverDecisionNote,
            sprMatrixNote, stackStratNote, potGeoNote, rangeVsNutNote,
            boardInterNote, eqDistNote, handReadNote, exploitNote,
            // Phase 151-175 notes
            handRankNote, nutBlockerNote, eqDenialNote, potVsImpliedNote,
            fourBetNote, multiBluffNote, xrSizingNote, riverOBNote,
            valueThickNote, mergedPolarNote, nodeLockNote, icmNote, blindVsBlindNote,
            // Phase 176-200 notes
            mixedStratNote, opponentModelNote, crossStreetNote, rangeThinkNote, solverConfNote,
            // Phase 201-225 notes
            eqBucketNote, rangeMorphNote, blockerMatrixNote, potCommitNote, checkCallFoldNote,
            facingDonkNote, slowPlayNote, obChecklistNote, riverPolNote, evDecompNote,
            multiSizeNote, solverLineNote,
            // Phase 226-250 notes
            handCatDiveNote, aggressionCoachNote, rangeAdvScoreNote, villainNarrowNote,
            eqEstimateNote, tournamentNote].filter(Boolean);

        // Score and sort by relevance
        const scoredNotes = allNotesRaw.map(note => ({
            note,
            score: this._scoreNoteRelevance(note, handStrength, street, optimalAction),
        })).sort((a, b) => b.score - a.score);

        let extras;
        if (explanationDepth === 'concise') {
            extras = [sizingReason].filter(Boolean).map(s => ' ' + s).join('');
        } else if (explanationDepth === 'verbose') {
            extras = scoredNotes.slice(0, 5).map(s => ' ' + s.note).join('');
        } else {
            extras = scoredNotes.slice(0, 3).map(s => ' ' + s.note).join('');
        }

        // Phase 76: Coaching preamble for verbose mode
        const coachingPrefix = coachingNote ? coachingNote + ' ' : '';

        // Pure strategy — one dominant action
        if (freq >= 0.95) {
            return `${coachingPrefix}${heroHand} (${handStrength}): Pure ${label}. ${concept}${extras}${streetExtra ? ' ' + streetExtra : ''}`;
        }

        // Near-pure — one clear best action but some mixing
        if (freq >= 0.70) {
            const altActions = validActions
                .filter(a => a !== optimalAction && handActions[a] > 0.01)
                .sort((a, b) => handActions[b] - handActions[a])
                .slice(0, 2)
                .map(a => `${this.getActionLabelGTOW(a)} ${(handActions[a] * 100).toFixed(0)}%`);
            const mixNote = altActions.length > 0 ? ` Mixes with ${altActions.join(', ')}.` : '';
            return `${coachingPrefix}${heroHand} (${handStrength}): ${label} ${freqPct}%. ${concept}${extras}${streetExtra ? ' ' + streetExtra : ''}${mixNote}`;
        }

        // True mixed strategy — explain WHY the solver mixes
        const mixedParts = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a])
            .slice(0, 4)
            .map(a => `${this.getActionLabelGTOW(a)} ${(handActions[a] * 100).toFixed(0)}%`)
            .join(', ');

        const mixReason = this._getMixingReason(handStrength, texture, street, validActions, handActions);
        return `${coachingPrefix}${heroHand} (${handStrength}): Mixed — ${mixedParts}. ${mixReason}${extras}${streetExtra ? ' ' + streetExtra : ''}`;
    }

    /**
     * Phase 25: Analyze board texture for strategic reasoning.
     */
    _analyzeTexture(board) {
        const empty = { wet: false, highCard: false, paired: false, flushy: false, connected: false, monotone: false, straightPossible: false, straightDrawHeavy: false, connectedness: 'low', oesdCount: 0, gutshotCount: 0, threeToStraight: false, wheelDraw: false, broadwayDraw: false, gapSize: 'scattered' };
        if (!board || board.length < 3) return empty;
        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);
        if (validBoard.length < 3) return empty;

        const ranks = validBoard.map(c => c[0].toUpperCase());
        const suits = validBoard.map(c => c[1]?.toLowerCase());
        const rankVals = ranks.map(r => '23456789TJQKA'.indexOf(r));

        const suitCounts = {};
        suits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const suitVals = Object.values(suitCounts || {});
        const maxSuitCount = suitVals.length > 0 ? Math.max(...suitVals) : 0;

        const rankCounts = {};
        ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
        const rankValsArr = Object.values(rankCounts || {});
        const maxRankCount = rankValsArr.length > 0 ? Math.max(...rankValsArr) : 0;

        const sorted = [...new Set(rankVals)].sort((a, b) => a - b);
        // Phase 72: Enhanced connectivity — count adjacent pairs, gaps, and straight potential
        let adjacentPairs = 0;
        let oneGapPairs = 0;
        let twoGapPairs = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
            const gap = sorted[i + 1] - sorted[i];
            if (gap === 1) adjacentPairs++;
            else if (gap === 2) oneGapPairs++;
            else if (gap === 3) twoGapPairs++;
        }
        // Also check A-low wheel connectivity (A=12, 2=0, 3=1, 4=2, 5=3)
        const hasAce = sorted.includes(12);
        const wheelCards = sorted.filter(v => v <= 3).length; // 2,3,4,5
        const wheelDraw = hasAce && wheelCards >= 1;

        const connected = adjacentPairs > 0 || oneGapPairs > 0;

        // Connectedness level
        let connectedness = 'low';
        const totalConnections = adjacentPairs * 3 + oneGapPairs * 2 + twoGapPairs;
        if (totalConnections >= 5) connectedness = 'high';
        else if (totalConnections >= 3) connectedness = 'medium';

        // Gap characterization
        let gapSize = 'scattered';
        if (adjacentPairs >= 2) gapSize = 'rundown'; // e.g., 5-6-7
        else if (adjacentPairs === 1 && oneGapPairs >= 1) gapSize = 'gapped'; // e.g., 5-6-8
        else if (adjacentPairs === 1) gapSize = 'connected'; // e.g., 5-6-T
        else if (oneGapPairs >= 1) gapSize = 'one-gap'; // e.g., 5-7-T

        // Phase 72: Count OESD and gutshot possibilities using 5-card straight windows
        // A straight requires 5 consecutive ranks. Count how many windows the board contributes to.
        let oesdCount = 0;
        let gutshotCount = 0;
        // Check all possible 5-card straight windows (A-5 through T-A)
        const boardSet = new Set(sorted);
        // Include ace-low: window [-1,0,1,2,3] maps to [A,2,3,4,5]
        const windows = [];
        for (let low = -1; low <= 8; low++) { // -1=wheel(A2345), 0=23456, ..., 8=9TJQK, 9=TJQKA
            const w = [];
            for (let j = 0; j < 5; j++) {
                let v = low + j;
                if (v === -1) v = 12; // Ace low
                if (v === 13) v = 12; // Ace high (already 12)
                w.push(v);
            }
            if (w.every(v => v >= 0 && v <= 12)) windows.push(w);
        }
        for (const w of windows) {
            const wSet = new Set(w);
            const boardHits = sorted.filter(v => wSet.has(v)).length;
            const uniqueHits = new Set(sorted.filter(v => wSet.has(v))).size;
            if (uniqueHits >= 3) {
                const needed = 5 - uniqueHits;
                if (needed === 2) gutshotCount++; // board has 3 to a straight, 2 cards to complete
                // If uniqueHits >= 4, someone could already have a straight or OESD
            }
        }
        // OESD: 4 consecutive board+hand ranks in a window. Approximate from board connectivity.
        if (adjacentPairs >= 2) oesdCount = Math.max(2, oesdCount); // rundown boards enable many OESDs
        else if (adjacentPairs >= 1 && oneGapPairs >= 1) oesdCount = Math.max(1, oesdCount);

        const threeToStraight = gutshotCount >= 2; // multiple straight windows with 3 board cards
        const straightPossible = adjacentPairs >= 2 || (adjacentPairs >= 1 && sorted.length >= 4);
        const straightDrawHeavy = (adjacentPairs >= 2) || (threeToStraight && adjacentPairs >= 1);

        // Broadway draw detection (T,J,Q,K,A)
        const broadwayCards = sorted.filter(v => v >= 8).length; // T=8, J=9, Q=10, K=11, A=12
        const broadwayDraw = broadwayCards >= 3;

        const highCards = rankVals.filter(v => v >= 10).length;
        const highestRank = Math.max(...rankVals);
        const lowestRank = Math.min(...rankVals);
        const spread = highestRank - lowestRank;

        return {
            wet: (connected && maxSuitCount >= 2) || maxSuitCount >= 3 || straightDrawHeavy,
            dry: !connected && maxSuitCount < 2 && (maxRankCount >= 2 || spread > 6),
            highCard: highCards >= 2 || highestRank >= 12,
            lowBoard: highCards === 0,
            paired: maxRankCount >= 2,
            flushy: maxSuitCount >= 3,
            connected,
            monotone: maxSuitCount === validBoard.length && validBoard.length >= 3,
            aceHigh: highestRank === 12,
            broadwayHeavy: highCards >= 3,
            // Phase 72 new properties
            straightPossible,
            straightDrawHeavy,
            connectedness,
            oesdCount,
            gutshotCount,
            threeToStraight,
            wheelDraw,
            broadwayDraw,
            gapSize,
            spread,
            adjacentPairs,
            lowestRank,
        };
    }

    /**
     * Phase 34: Explain WHY the solver chose this specific sizing.
     * Hand-aware reasoning — references actual hand strength + board interaction.
     */
    _getSizingReason(sizePct, handStrength, texture, street, isBet, isRaise) {
        if (!isBet && !isRaise) return '';
        if (sizePct === 0) return '';
        const hs = handStrength.toLowerCase();
        const isNutted = hs.includes('set') || hs.includes('straight') || hs.includes('flush') || hs.includes('full house') || hs.includes('quads');
        const isTopPair = hs.includes('top pair');
        const isDraw = hs.includes('draw') || hs.includes('oesd') || hs.includes('gutshot');
        const isMonster = hs.includes('monster');
        const isCombo = hs.includes('combo');
        const isAir = hs.includes('air') || hs.includes('overcard') || hs.includes('no pair');
        const isOverpair = hs.includes('overpair');
        const isSecondPair = hs.includes('second pair');
        const isBottomPair = hs.includes('bottom pair');
        const isTwoPair = hs.includes('two pair');
        const isTrips = hs.includes('trips');

        // Phase 55: Raise-specific sizing reasoning
        if (isRaise) {
            if (sizePct <= 75) {
                if (isNutted || isTrips) return 'Min-raise with a monster — disguise hand strength while building the pot. Looks like a bluff.';
                if (isDraw || isMonster) return 'Small raise as a semi-bluff — building fold equity cheaply with backup equity if called.';
                return 'Small raise — polarized between value and bluffs, minimizing risk.';
            }
            if (sizePct <= 150) {
                if (isNutted) return 'Standard raise for value — building the pot while keeping villain\'s calling range wide.';
                if (isDraw) return 'Raise with a draw — leveraging fold equity plus implied odds if you hit.';
                if (isTopPair) return 'Raise for protection — charge draws and deny equity on a dynamic board.';
                return 'Standard raise size polarizes the range between value and bluffs.';
            }
            if (isNutted) return 'Large raise to extract maximum value — villain is committed with any reasonable holding.';
            if (isAir) return 'Large raise as a bluff — representing an extremely strong range with maximum pressure.';
            return 'Oversize raise applies extreme pressure — only the strongest hands can continue.';
        }

        // Small bets (16-33%) — merged/range betting strategy
        if (sizePct <= 33) {
            if (isNutted && texture.dry) return 'Small sizing with a nutted hand on a dry board — keeping villain\'s entire range in. The board runs out well for you.';
            if (isTopPair && texture.dry) return 'Small sizing with top pair on a dry board — range bet exploiting range advantage. Few draws threaten you.';
            if (isTwoPair && texture.dry) return 'Small sizing with two pair on a dry board — trapping, as villains can\'t put you on this exact hand.';
            if (isAir && street === 'flop') return 'Small c-bet bluff — range betting at minimum cost. Villain folds their weakest hands, you lose little when called.';
            if (isDraw && street === 'flop') return 'Small c-bet with a draw — cheap equity denial that sets up the turn. Low risk, high reward on favorable runouts.';
            if (texture.aceHigh) return 'Range bet sizing on ace-high board — IP player has range advantage. Small bets target the entire range.';
            if (texture.broadwayHeavy) return 'Small c-bet on a broadway-heavy board — PFR has significant range advantage with more premium broadway combos.';
            if (texture.lowBoard && !texture.connected) return 'Small sizing on a low disconnected board — neither range connects strongly, so a cheap range bet picks up dead money.';
            if (texture.dry && texture.paired) return 'Small sizing on paired dry texture — few combinations hit this board. Range bet denies equity.';
            if (street === 'flop') return 'Range c-bet sizing — on this texture, betting small with your entire range is more profitable than checking.';
            if (street === 'turn') return 'Small turn probe — testing villain\'s range after a checked flop. Minimal investment with fold equity.';
            return 'Small sizing minimizes risk while applying range-wide pressure.';
        }

        // Medium bets (40-66%) — value-heavy, protection-focused
        if (sizePct <= 66) {
            if (isNutted && texture.wet) return 'Medium sizing builds the pot with a monster while charging draws — the board is dynamic and you need to protect.';
            if (isNutted && street === 'turn') return 'Medium sizing on the turn sets up a geometric river shove — betting ~66% on turn leaves a pot-sized jam on river.';
            if (isTopPair && texture.connected) return 'Medium sizing with top pair on a connected board — charging straight and flush draws while extracting value.';
            if (isTopPair && texture.wet) return 'Medium protection bet with top pair — too many draws to give a free card. Price villain\'s draws incorrectly.';
            if (isDraw && texture.wet) return 'Semi-bluff sizing — enough fold equity to profit immediately, plus 30%+ equity when called.';
            if (isCombo || isMonster) return 'Medium sizing with a combo draw — fold equity + massive equity when called makes this highly profitable.';
            if (isOverpair) return 'Medium sizing with an overpair — extract value from top pair and worse while keeping the range balanced.';
            if (isTwoPair) return 'Medium sizing with two pair — building the pot against top pair and draws before the board changes.';
            if (isSecondPair && texture.dry) return 'Medium sizing with second pair for thin value — targeting bottom pair and ace-high hands.';
            if (street === 'turn') return 'Geometric turn sizing — 60-66% bets on turn set up a natural pot-sized river shove.';
            if (texture.wet || texture.connected) return 'Medium sizing on a coordinated board — polarized enough to deny equity, merged enough to get called.';
            return 'Medium sizing builds the pot while keeping villain\'s calling range wide.';
        }

        // Large bets (75-100%) — polarized strategy
        if (sizePct <= 100) {
            if (isNutted && street === 'river') return 'Pot-sized value bet on the river — villain\'s bluff-catchers are getting 2:1 odds. You need 33% bluffs to stay balanced.';
            if (isNutted) return 'Large sizing to build a big pot with a monster — villain is priced in with strong-but-second-best hands.';
            if (isDraw && street !== 'river') return 'Large semi-bluff — maximum fold equity with a draw. If villain calls, you still have outs to improve.';
            if (isAir && street === 'river') return 'Pot-sized river bluff — fully polarized. You\'re repping the nuts and villain must be strong to call.';
            if (isAir && street === 'turn') return 'Large turn barrel as a bluff — building a credible story. Villain must defend with strong hands.';
            if (isTopPair && texture.wet) return 'Large bet with top pair on a wet board — forced to go big for protection. Can\'t risk a cheap draw completion.';
            if (texture.flushy || texture.monotone) return 'Large sizing on a flush-possible board — polarized between flushes and bluffs. Medium hands check.';
            if (street === 'river') return 'Pot-sized river bet — polarized between value and bluffs. At this size, your range should be ~67% value, ~33% bluffs.';
            return 'Large sizing polarizes your range — only very strong hands and bluffs bet this big.';
        }

        // Overbets (125%+) / All-in
        if (sizePct >= 125 || sizePct === 999) {
            if (isNutted && street === 'river') return 'River overbet for max value — targeting villain\'s second-nut type hands that can\'t fold. This is the most +EV sizing with the nuts.';
            if (isNutted) return 'Overbet with a monster — puts villain\'s entire stack at risk. Strong hands can\'t fold, building a massive pot.';
            if (isAir && street === 'river') return 'Overbet bluff — representing a polarized nutted range. Villain needs extremely strong hands to call, creating profitable bluffs.';
            if ((isDraw || isCombo) && sizePct === 999) return 'All-in semi-bluff — maximum fold equity combined with draw equity. The math works: fold equity + equity when called = profitable.';
            if (isTopPair && sizePct === 999) return 'All-in for protection — with a short stack-to-pot ratio, shoving denies villain\'s equity realization.';
            return 'Overbet applies extreme pressure — exploiting range advantage. Only the strongest holdings continue.';
        }

        return '';
    }

    /**
     * Phase 25: Identify the core strategic concept behind the solver's action.
     */
    _getStrategicConcept(action, handStrength, texture, street, freq, validActions, handActions, nodeType, heroPosition, villainPosition) {
        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');

        // Phase 68: Position context — relative to villain, never hero's seat
        // alone. Hero is only "checking back in position" when hero actually
        // acts after THIS villain, so a CO with the BTN still to act is OOP
        // and a BB facing the SB is IP.
        const isIP = this._isInPosition(heroPosition, villainPosition);
        const isOOP = Boolean(heroPosition && villainPosition) && !isIP;
        const posTag = isIP ? ' (IP)' : isOOP ? ' (OOP)' : '';

        // ═══ CHECKING CONCEPTS (Phase 56: Enhanced depth, Phase 68: Position-aware) ═══
        if (isCheck) {
            if (handStrength.includes('top pair') && handStrength.includes('top kicker')) {
                if (isIP && texture.wet) return 'Checking back TPTK in position on a wet board — pot control while retaining the positional advantage to call or bet later streets.';
                if (isOOP && texture.wet) return 'Checking TPTK from OOP on a wet board — building a check-call or check-raise range. OOP checks carry more monsters for balance.';
                if (texture.wet) return 'Pot control with TPTK on a wet board — checking avoids getting raised off a strong but vulnerable hand. You can call bets profitably.';
                if (isIP) return 'Checking back TPTK in position — trapping with a hand that\'s strong enough to check-call or check-raise later.';
                return 'Checking back TPTK as a trap — your hand is strong enough to check-call or check-raise on later streets.';
            }
            if (handStrength.includes('top pair') || handStrength.includes('overpair')) {
                if (texture.straightDrawHeavy) return 'Checking a one-pair hand on a straight-heavy board — too many draws complete on the turn. Pot control avoids getting raised off your hand.';
                if (isIP && texture.wet) return 'Checking back in position for pot control — your pair is vulnerable but you maintain the positional advantage for future streets.';
                if (isOOP) return 'Checking OOP to build a strong check-call range — one-pair hands from OOP often check to control the pot and avoid being raised.';
                if (texture.wet) return 'Pot control — your pair is vulnerable on this wet board. Checking avoids facing a raise with a one-pair hand.';
                if (street === 'turn') return 'Checking the turn to control the pot — your hand has showdown value but doesn\'t want to face a raise.';
                return 'Pot control with a strong-but-vulnerable hand — checking keeps the pot manageable and avoids bloating it with a one-pair hand.';
            }
            if (handStrength.includes('set') || handStrength.includes('full house') || handStrength.includes('quads')) {
                if (street === 'flop') return 'Trapping with a monster — checking the flop to induce turn bets. Your hand is disguised.';
                return 'Slow-playing a monster — checking to let villain catch up or bluff into you on a later street.';
            }
            if (handStrength.includes('two pair')) {
                return 'Checking two pair as a trap — your hand is strong but disguised. Check-raising is an option if villain bets.';
            }
            if (handStrength.includes('monster draw') || handStrength.includes('combo draw')) {
                return 'Checking a big draw to realize equity cheaply — if villain bets, you can raise as a semi-bluff with massive equity.';
            }
            if (handStrength.includes('draw')) {
                if (street === 'turn') return 'Free card play on the turn — checking preserves your stack when the draw misses the river.';
                return 'Taking a free card with draw equity — checking preserves the option to realize equity without risk.';
            }
            if (handStrength.includes('air') || handStrength.includes('no pair') || handStrength.includes('overcard')) {
                if (isIP && street === 'flop') return 'Checking back air in position — preserving the option to bluff the turn if a good card comes, while taking a free card.';
                if (isOOP && street === 'flop') return 'Checking air from OOP — you lack position and equity. If villain bets, you can fold without losing more.';
                if (street === 'flop') return 'Checking back air — this hand has insufficient equity to c-bet and the board doesn\'t favor your range.';
                if (street === 'river') return 'Giving up with air on the river — no value target and villain\'s range is too strong to bluff.';
                return 'Giving up with air — no equity to bet for value and insufficient fold equity to profitably bluff.';
            }
            if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                return 'Checking a marginal made hand — your hand has showdown value but can\'t bet for value or bluff effectively. Play defense.';
            }
            return 'Checking to control the pot size and realize equity on future streets.';
        }

        // ═══ BETTING CONCEPTS (Phase 58: Enhanced board-hand interaction, Phase 68: Position-aware) ═══
        if (isBet) {
            const hs = handStrength.toLowerCase();
            // Position-specific donk bet note for OOP leading
            if (isOOP && nodeType === 'hero_bets_or_checks' && street !== 'preflop') {
                // OOP leading (donk bet) is rare in GTO — add a note when it happens
                if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard')) {
                    return 'Donk-betting OOP as a bluff — rare in GTO, but the board texture heavily favors your range over the preflop aggressor. This exploits range disadvantage.';
                }
            }
            // Nutted hands
            if (hs.includes('quads') || hs.includes('full house')) {
                if (street === 'river') return 'Value betting the nuts on the river — extracting maximum from second-best hands that can\'t fold.';
                return 'Building the pot with an unbeatable hand — bet to grow the pot for river value.';
            }
            if (hs.includes('nut flush') || hs.includes('nut straight')) {
                if (street === 'river') return 'Betting the nuts for max value — your hand is the best possible. Target strong second-best hands.';
                return 'Betting a nutted hand to build the pot — you want to get stacks in by the river.';
            }
            if (hs.includes('flush') && !hs.includes('draw')) {
                if (texture.connected) return 'Betting a flush on a connected board — protect against full house draws and extract from worse flushes.';
                return 'Betting a flush for value — target sets, two pair, and strong pairs.';
            }
            if (hs.includes('straight') && !hs.includes('draw')) {
                if (texture.flushy || texture.monotone) return 'Betting a straight on a flushy board — need to extract value before a flush card kills action.';
                if (texture.straightDrawHeavy) return 'Betting a straight on a connected board — higher straights are possible. Bet for value now before the board pairs or a higher card comes.';
                return 'Betting a straight for value — target two pair, sets, and strong one-pair hands.';
            }
            if (hs.includes('set')) {
                if (texture.straightDrawHeavy) return 'Betting a set on a straight-heavy board — multiple straight draws are out there. Charge them heavily or the board will get away from you.';
                if (texture.wet) return 'Betting a set on a wet board — charge draws heavily. Sets want big pots before the board gets scary.';
                if (texture.dry) return 'Betting a set on a dry board — slow-play is an option, but betting builds the pot for later streets.';
                return 'Value betting a set — targeting top pair and overpairs that can\'t fold.';
            }
            if (hs.includes('two pair')) {
                if (texture.straightDrawHeavy) return 'Betting two pair on a rundown board — straight draws are everywhere. Bet big to deny equity before the turn changes everything.';
                if (texture.connected) return 'Betting two pair on a connected board — charge straight draws and build the pot before the board changes.';
                return 'Betting two pair for value — strong enough to target one-pair hands and draws.';
            }
            if (hs.includes('top pair') && hs.includes('top kicker')) {
                if (texture.wet) return 'Betting TPTK for value and protection — too many draws to give free cards.';
                if (texture.dry) return 'Betting TPTK for thin value on a dry board — target weaker top pair and second pair.';
                return 'Betting top pair top kicker — the strongest one-pair hand. Extract from worse pairs.';
            }
            if (hs.includes('top pair') && hs.includes('strong kicker')) {
                return 'Betting top pair strong kicker for value — ahead of most of villain\'s calling range.';
            }
            if (hs.includes('top pair')) {
                if (texture.wet) return 'Betting for value and protection on a wet board — charge draws while your top pair is ahead.';
                if (hs.includes('weak kicker')) return 'Thin value bet with top pair weak kicker — targeting second pair and draws, but beware of domination.';
                return 'Betting top pair for value — targeting weaker pairs and high card hands.';
            }
            if (hs.includes('overpair')) {
                if (texture.wet) return 'Betting an overpair for protection on a wet board — too many draws to give a free card.';
                return 'Betting an overpair for value — stronger than any pair on the board.';
            }
            // Draw hands
            if (hs.includes('monster draw') || hs.includes('combo draw')) {
                if (street === 'river') return 'Bluffing the river with a busted monster draw — your hand has no showdown value but you can represent the nuts.';
                return 'Semi-bluffing with a monster draw — huge equity when called plus fold equity. This is one of the most +EV spots.';
            }
            if (hs.includes('nut flush draw')) {
                if (street === 'river') return 'Bluffing with a missed nut flush draw — you block the nut flush, making it harder for villain to have it.';
                return 'Semi-bluffing with the nut flush draw — 9 clean outs plus fold equity. Premium bluff candidate.';
            }
            if (hs.includes('flush draw')) {
                if (street === 'river') return 'Bluffing with a missed flush draw — converting busted equity into fold equity on the river.';
                return 'Semi-bluffing with a flush draw — betting now gives fold equity plus equity when called.';
            }
            if (hs.includes('oesd') || hs.includes('double gutshot')) {
                if (street === 'river') return 'Bluffing with a missed straight draw — converting busted equity into a river bluff.';
                if (texture.straightDrawHeavy) return 'Semi-bluffing with 8 straight outs on a rundown board — villain has draws too, so fold equity is lower but your equity is real. Bet to deny their draws.';
                return 'Semi-bluffing with 8 straight outs — enough equity to make betting very profitable.';
            }
            if (hs.includes('gutshot')) {
                if (street === 'river') return 'Bluffing the river with a busted gutshot — no showdown value, only fold equity.';
                if (texture.gapSize === 'one-gap' || texture.threeToStraight) return 'Semi-bluffing with a gutshot on a board with straight possibilities — your draw is hidden and the connected texture adds credibility to your bet.';
                return 'Semi-bluffing with a gutshot — 4 outs plus fold equity. A balanced bluff candidate.';
            }
            if (hs.includes('backdoor')) {
                return 'Betting with backdoor equity — preserving the option to hit a draw on the turn while picking up the pot now.';
            }
            // Air
            if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard') || hs.includes('high cards')) {
                if (street === 'river') return 'Pure bluff on the river — the only way to win with no made hand. You\'re repping a strong range.';
                if (street === 'flop') return 'C-bet bluff with air — attacking villain\'s capped range. Most opponents fold too much to flop c-bets.';
                return 'Bluffing as part of a balanced strategy — keeping the opponent indifferent about calling.';
            }
            // Marginal hands
            if (hs.includes('second pair')) {
                if (street === 'river') return 'Thin value bet with second pair — targeting weaker holdings, though this is close between betting and checking.';
                return 'Betting second pair for thin value and protection — charge draws and target bottom pair.';
            }
            if (hs.includes('bottom pair')) {
                return 'Thin value bet / protection bet with bottom pair — targeting ace-high and king-high hands.';
            }
            if (hs.includes('underpair')) {
                return 'Betting an underpair as a semi-bluff — some showdown value plus fold equity against overcards.';
            }
            return 'Betting for value and protection — extracting from worse hands while denying equity.';
        }

        // ═══ CALLING CONCEPTS (Phase 56: Enhanced depth, Phase 68: Position-aware) ═══
        if (isCall) {
            // Position-specific calling note
            if (isIP && street === 'river' && (handStrength.includes('second pair') || handStrength.includes('bottom pair'))) {
                return 'Bluff-catching in position on the river — being IP means you see villain\'s bet before deciding. Your positional advantage makes marginal calls more profitable.';
            }
            if (isOOP && street === 'river' && (handStrength.includes('top pair') || handStrength.includes('overpair'))) {
                return 'Calling down from OOP — strong enough to bluff-catch, but OOP calling ranges need to be tighter since you face more aggression.';
            }
            if (handStrength.includes('monster draw') || handStrength.includes('combo draw')) {
                return 'Calling with a monster draw — massive equity (15+ outs) makes this a clear continue. Raising is also viable as a semi-bluff.';
            }
            if (handStrength.includes('flush draw')) {
                if (handStrength.includes('nut')) return 'Calling with the nut flush draw — 9 clean outs plus implied odds when the flush hits.';
                return 'Calling with a flush draw — 9 outs (~19% turn equity) plus implied odds when completing.';
            }
            if (handStrength.includes('OESD') || handStrength.includes('double gutshot')) {
                return 'Calling with 8 straight outs — the pot odds are sufficient and implied odds boost the call.';
            }
            if (handStrength.includes('gutshot')) {
                if (handStrength.includes('overcard') || handStrength.includes('top pair')) return 'Calling with a gutshot plus extra equity — the additional outs make this profitable.';
                return 'Calling with a gutshot — 4 outs is marginal but implied odds and backdoor equity justify the call.';
            }
            if (handStrength.includes('draw')) {
                return 'Calling with draw equity — pot odds plus implied odds make continuing profitable.';
            }
            if (handStrength.includes('set') || handStrength.includes('two pair') || handStrength.includes('full house')) {
                return 'Flatting with a monster — keeping villain\'s bluffs and weaker value in the pot. Raising would fold out too many hands you beat.';
            }
            if (handStrength.includes('top pair') && handStrength.includes('top kicker')) {
                return 'Calling with TPTK — strong enough to continue but raising would only get action from better hands.';
            }
            if (handStrength.includes('top pair') || handStrength.includes('overpair')) {
                if (street === 'river') return 'Bluff-catching with a strong pair on the river — your hand beats all of villain\'s bluffs and some thin value.';
                return 'Calling with a strong pair — flatting keeps the pot controlled while you\'re ahead of most of villain\'s range.';
            }
            if (street === 'river') {
                if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                    return 'Bluff-catching on the river with a marginal pair — you need villain to be bluffing at the right frequency.';
                }
                return 'Bluff-catching on the river — calling at the right frequency to prevent villain from profiting with pure bluffs.';
            }
            if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                return 'Calling with a marginal made hand — your pair beats villain\'s bluffs and some of their value range.';
            }
            return 'Calling to see another card and realize equity.';
        }

        // ═══ RAISING CONCEPTS (Phase 58: Enhanced) ═══
        if (isRaise) {
            if (handStrength.includes('set')) {
                if (street === 'flop') return 'Check-raising a set on the flop — the strongest play. Build the pot and let aggressive opponents barrel into you.';
                return 'Raising a set for value — building a big pot with a hand that dominates two pair and overpairs.';
            }
            if (handStrength.includes('two pair')) {
                return 'Raising two pair for value — strong enough to raise for value against top pair and overpairs.';
            }
            if (handStrength.includes('straight') || handStrength.includes('flush') || handStrength.includes('full house')) {
                return 'Raising the nuts — building the pot with a monster hand. Get stacks in before the board changes.';
            }
            if (handStrength.includes('top pair') && handStrength.includes('top kicker')) {
                return 'Raising TPTK — in certain spots, raising for value targets worse top pair combos and avoids being outdrawn.';
            }
            if (handStrength.includes('monster draw') || handStrength.includes('combo draw')) {
                return 'Semi-bluff raise with a monster draw — huge fold equity plus 15+ outs if called. One of the best raising hands.';
            }
            if (handStrength.includes('flush draw')) {
                if (handStrength.includes('nut')) return 'Semi-bluff raise with the nut flush draw — premium bluff candidate that blocks villain\'s nutted range.';
                return 'Semi-bluff raise with a flush draw — leveraging fold equity plus 9 outs when called.';
            }
            if (handStrength.includes('OESD') || handStrength.includes('double gutshot')) {
                return 'Semi-bluff raise with 8 straight outs — enough equity to make this raise profitable even when called.';
            }
            if (handStrength.includes('gutshot')) {
                return 'Semi-bluff raise with a gutshot — 4 outs isn\'t many, but the fold equity makes this raising hand profitable.';
            }
            if (handStrength.includes('air') || handStrength.includes('overcard') || handStrength.includes('no pair')) {
                if (street === 'flop') return 'Check-raise bluff — attacking villain\'s c-bet with maximum aggression. Forces folds from better hands.';
                return 'Bluff raise — attacking villain\'s capped range with aggression. You need villain to fold frequently.';
            }
            return 'Raising to build the pot and apply pressure — balancing value raises with bluffs.';
        }

        // ═══ FOLDING CONCEPTS (Phase 56: Enhanced depth) ═══
        if (isFold) {
            if (handStrength.includes('flush draw') || handStrength.includes('nut flush draw')) {
                return 'Folding even with a flush draw — the bet size prices you out. You need ~4:1 odds for 9 outs, and the sizing is too large.';
            }
            if (handStrength.includes('OESD') || handStrength.includes('double gutshot')) {
                return 'Folding a straight draw — the bet sizing doesn\'t give you correct pot odds, and implied odds aren\'t sufficient.';
            }
            if (handStrength.includes('gutshot')) {
                return 'Folding a gutshot — only 4 outs (~8% equity) isn\'t enough against this bet size. You need ~11:1 odds to call.';
            }
            if (handStrength.includes('draw')) {
                return 'Folding a draw — the bet sizing prices out your draw. Calling would be a -EV play.';
            }
            if (handStrength.includes('top pair')) {
                return 'Folding top pair against heavy aggression — villain\'s range is polarized toward strong value hands that beat you.';
            }
            if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                if (street === 'river') return 'Folding a weak pair on the river — you\'re not getting the right price to bluff-catch against this sizing.';
                return 'Folding a marginal pair — facing too much aggression to continue. Your hand doesn\'t have enough equity vs villain\'s range.';
            }
            if (handStrength.includes('overpair')) {
                return 'Folding an overpair — even strong pairs must fold facing extreme aggression. Villain\'s range is heavily weighted toward sets and better.';
            }
            if (handStrength.includes('air') || handStrength.includes('no pair') || handStrength.includes('overcard')) {
                return 'Folding air — no made hand, insufficient draw equity. This hand is at the bottom of your range.';
            }
            return 'Folding — the hand lacks sufficient equity against villain\'s betting range to continue.';
        }

        return '';
    }

    /**
     * Phase 25: Explain WHY the solver uses a mixed strategy here.
     */
    /**
     * Phase 46: Flop-specific context enhancement.
     * Key concepts: c-bet logic, check-raise construction, range advantage,
     * board texture interaction, donk betting, backdoor equity.
     */
    _getFlopContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq, sizePct) {
        const a = optimalAction.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        let context = '';

        // C-bet reasoning (hero bets or checks on flop, typically as preflop aggressor)
        if (nodeType === 'hero_bets_or_checks') {
            if (isBet) {
                const isNutted = hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush');
                const hasDraw = hs.includes('draw') || hs.includes('backdoor');
                const isTopPair = hs.includes('top pair') || hs.includes('overpair');

                if (sizePct <= 33 && texture.dry) {
                    context = 'Small c-bet on a dry flop — range-betting strategy. On dry boards, the preflop aggressor c-bets small with most of their range because they have a range advantage.';
                } else if (sizePct <= 33 && !texture.dry) {
                    context = 'Small c-bet on a wet flop — probing for information while keeping the pot controlled. Smaller sizes risk less on coordinated boards.';
                } else if (sizePct >= 60 && isNutted) {
                    context = 'Large c-bet with a strong hand — polarizing on the flop to build the pot for later streets. This sizing allows for geometric bet-bet-shove lines.';
                } else if (sizePct >= 60 && hasDraw) {
                    context = 'Large c-bet semi-bluff — maximum fold equity with a draw. Two cards to come gives strong backup equity if called.';
                } else if (sizePct >= 60 && (hs.includes('air') || hs.includes('no pair'))) {
                    context = 'Large c-bet as a bluff on the flop — representing a strong range and putting villain in a tough spot with their entire range.';
                } else if (isTopPair && texture.wet) {
                    context = 'C-betting for value and protection — charging draws on a wet flop while your hand is currently best.';
                } else if (isTopPair && texture.dry) {
                    context = 'C-betting for thin value on a dry board — extracting from worse pairs and high-card hands.';
                }
            } else if (isCheck) {
                if (hs.includes('set') || hs.includes('two pair')) {
                    context = 'Checking back a strong hand on the flop — trapping to disguise strength and induce villain action on later streets.';
                } else if (hs.includes('draw') && hs.includes('backdoor')) {
                    context = 'Checking back with backdoor equity — preserving the option to improve on the turn without committing chips.';
                } else if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard')) {
                    context = 'Giving up the c-bet with air — the board doesn\'t favor the preflop aggressor\'s range enough to justify bluffing.';
                } else if (hs.includes('top pair') || hs.includes('overpair')) {
                    if (texture.wet) context = 'Checking back top pair on a wet board for pot control — a common GTO strategy to avoid being check-raised off a vulnerable hand.';
                    else context = 'Checking back for deception — protecting the checking range with strong hands so it isn\'t always weak.';
                }
            }
        }

        // Facing a c-bet (hero calls, raises, or folds)
        if (nodeType === 'hero_faces_bet') {
            if (isCall) {
                if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('oesd')) {
                    context = 'Floating the c-bet with a draw — calling with equity to improve on the turn. Two cards to come maximizes implied odds.';
                } else if (hs.includes('top pair') || hs.includes('overpair')) {
                    context = 'Calling the flop c-bet with a strong hand — keeping villain\'s bluffs in and not inflating the pot unnecessarily.';
                } else if (hs.includes('second pair') || hs.includes('middle pair')) {
                    context = 'Defending a medium-strength hand vs the c-bet — good enough to call but not strong enough to raise.';
                } else if (hs.includes('backdoor')) {
                    context = 'Floating with backdoor equity — calling the flop cheaply to see if the turn improves your draw potential.';
                }
            } else if (isRaise) {
                if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight')) {
                    context = 'Check-raising for value on the flop — the strongest play with a nutted hand, building a big pot early.';
                } else if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('oesd')) {
                    context = 'Check-raise semi-bluff — combining fold equity with draw equity. If called, you still have strong equity to improve.';
                } else if (hs.includes('air') || hs.includes('no pair')) {
                    context = 'Check-raise bluff on the flop — attacking the c-bettor\'s range with maximum aggression. This works because most c-bet ranges are wide and weak.';
                }
            } else if (isFold) {
                if (hs.includes('draw') && sizePct >= 60) {
                    context = 'Folding a draw to a large c-bet — the sizing prices out your draw equity. You need better pot odds to continue profitably.';
                } else if (hs.includes('no pair') || hs.includes('air')) {
                    context = 'Folding air to the c-bet — no equity and no backdoor draws make continuing unprofitable regardless of pot odds.';
                }
            }
        }

        return context;
    }

    /**
     * Phase 43: Turn-specific context enhancement.
     * Key concepts: geometric sizing (setting up river shove), turn card dynamics,
     * protection vs slowplay decisions, draw equity denial.
     */
    _getTurnContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq, sizePct) {
        if (!board || board.length < 3) return '';
        const a = optimalAction.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        // Turn card analysis
        const turnCard = board.length >= 4 ? board[3] : null;
        let turnImpact = '';
        if (turnCard && typeof turnCard === 'string' && turnCard.length >= 2) {
            const turnRank = turnCard[0].toUpperCase();
            const turnSuit = turnCard[1]?.toLowerCase();
            const rankVal = r => '23456789TJQKA'.indexOf(r);
            const tv = rankVal(turnRank);

            // Check flush draw completing on turn
            const boardSuits = board.slice(0, 4).filter(c => c && c.length >= 2).map(c => c[1]?.toLowerCase());
            const suitCounts = {};
            boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
            const threeFlush = Object.values(suitCounts || {}).some(c => c >= 3);

            if (threeFlush) {
                turnImpact = 'Turn puts three to a flush on board — flush draws now have one card to hit.';
            } else if (tv >= 12) {
                turnImpact = 'Ace on the turn shifts hand rankings — Ax hands improve significantly.';
            } else if (tv >= 10) {
                turnImpact = 'Broadway turn card — may complete straights or improve broadway draws.';
            }
        }

        let decisionContext = '';

        if (isBet) {
            const isNutted = hs.includes('straight') || hs.includes('flush') || hs.includes('full house') || hs.includes('quads') || hs.includes('set');
            const isDraw = hs.includes('draw') || hs.includes('oesd') || hs.includes('flush draw');
            const isVulnerable = hs.includes('top pair') || hs.includes('overpair');

            // Geometric sizing awareness
            if (sizePct >= 60 && sizePct <= 80 && isNutted) {
                decisionContext = 'Geometric sizing on the turn — this bet size sets up a comfortable pot-sized river shove to get all-in over two streets.';
            } else if (sizePct >= 60 && sizePct <= 80 && isDraw) {
                decisionContext = 'Large semi-bluff on the turn — one card to come, maximum fold equity now while retaining draw equity if called.';
            } else if (sizePct <= 40 && isVulnerable) {
                decisionContext = 'Small turn bet for protection — charge draws to see the river while controlling pot size with a vulnerable hand.';
            } else if (sizePct >= 100) {
                decisionContext = 'Overbet on the turn — polarizing between the nuts and bluffs. This sizing pressures the middle of villain\'s range.';
            } else if (isDraw) {
                decisionContext = 'Turn semi-bluff — with one card to come, betting applies pressure while preserving the chance to improve on the river.';
            } else if (isVulnerable && texture.wet) {
                decisionContext = 'Betting the turn for protection on a wet board — too many draws could improve to beat your hand on the river.';
            }
        } else if (isCheck) {
            const isNutted = hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush');
            if (isNutted) {
                decisionContext = 'Check-trapping the turn with a strong hand — inducing a bet on the river or setting up a check-raise.';
            } else if (hs.includes('draw')) {
                decisionContext = 'Taking a free card on the turn — preserving equity with a draw without investing more chips.';
            } else if (hs.includes('top pair') || hs.includes('overpair')) {
                decisionContext = 'Pot control on the turn — your hand has showdown value but the board is getting dangerous.';
            }
        } else if (isCall) {
            if (hs.includes('draw')) {
                decisionContext = 'Calling the turn with a draw — pot odds and implied odds on the river justify continuing.';
            } else if (hs.includes('top pair') || hs.includes('overpair')) {
                decisionContext = 'Calling the turn with a strong made hand — flatting to keep the pot controlled while villain may be semi-bluffing.';
            }
        } else if (isFold) {
            if (hs.includes('draw')) {
                decisionContext = 'Folding a draw on the turn — the bet sizing prices you out with only one card to come.';
            } else if (hs.includes('pair')) {
                decisionContext = 'Folding a marginal hand on the turn — facing too much aggression with the river still to come.';
            }
        } else if (isRaise) {
            if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush')) {
                decisionContext = 'Raising the turn for value — building a pot to set up a river shove with a strong hand.';
            } else if (hs.includes('draw')) {
                decisionContext = 'Semi-bluff raise on the turn — maximum fold equity now, plus equity to improve on the river.';
            }
        }

        const parts = [turnImpact, decisionContext].filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : '';
    }

    /**
     * Phase 42: River-specific context enhancement.
     * GTO Wizard provides detailed river reasoning about:
     * - Value vs bluff polarity
     * - Pot odds and bluff-catching math
     * - River card impact on ranges
     * - Blocker effects
     */
    _getRiverContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq) {
        if (!board || board.length < 3) return '';
        const a = optimalAction.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        // River card analysis
        const riverCard = board.length >= 5 ? board[4] : null;
        let riverImpact = '';
        if (riverCard && typeof riverCard === 'string' && riverCard.length >= 2) {
            const riverRank = riverCard[0].toUpperCase();
            const riverSuit = riverCard[1]?.toLowerCase();
            const rankVal = r => '23456789TJQKA'.indexOf(r);
            const rv = rankVal(riverRank);

            // Check if river completes flush
            const boardSuits = board.filter(c => c && c.length >= 2).map(c => c[1]?.toLowerCase());
            const suitCounts = {};
            boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
            const flushComplete = Object.values(suitCounts || {}).some(c => c >= 3);

            // Check if river pairs the board
            const boardRanks = board.filter(c => c && c.length >= 2).map(c => c[0].toUpperCase());
            const rankCounts = {};
            boardRanks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
            const riverPairsBoard = rankCounts[riverRank] >= 2;

            if (flushComplete && riverSuit) {
                riverImpact = 'The river completes a possible flush — ranges polarize heavily.';
            } else if (riverPairsBoard) {
                riverImpact = 'The river pairs the board — full houses now possible, changing the hand rankings.';
            } else if (rv >= 12) {
                riverImpact = 'Ace on the river is a significant scare card — Ax hands improved while bluffs gain credibility.';
            } else if (rv >= 10) {
                riverImpact = 'Broadway river card — may have completed straights or improved high-card hands.';
            } else if (rv <= 4) {
                riverImpact = 'Low river card — a relative brick that mostly preserves the turn dynamic.';
            }
        }

        // Decision-specific river context
        let decisionContext = '';
        if (isBet) {
            const isNutted = hs.includes('straight') || hs.includes('flush') || hs.includes('full house') || hs.includes('quads') || hs.includes('set');
            const isMissedDraw = hs.includes('no pair') || hs.includes('air') || (hs.includes('draw') && !hs.includes('pair'));
            const isThinValue = hs.includes('top pair') || hs.includes('overpair') || hs.includes('two pair');

            if (isNutted) {
                decisionContext = 'On the river, nutted hands always bet — no more cards to come means pure value extraction.';
            } else if (isMissedDraw) {
                decisionContext = 'Converting a missed draw into a bluff on the river. With no showdown value, betting is the only way to profit.';
            } else if (isThinValue) {
                decisionContext = 'Thin value bet — villain\'s calling range on the river includes enough worse hands to make this profitable.';
            }
        } else if (isCall) {
            const sizeMatch = a.match(/\d+/); // This won't match 'call', need to check what villain bet
            decisionContext = 'Bluff-catching on the river — you need to call enough to prevent villain from profiting with any two cards as a bluff.';
            if (hs.includes('top pair') || hs.includes('overpair')) {
                decisionContext = 'Your hand is strong enough to bluff-catch. On the river, calling with top pair is standard when villain could be bluffing missed draws.';
            } else if (hs.includes('second pair') || hs.includes('bottom pair')) {
                decisionContext = 'Marginal bluff-catch — your hand blocks some value combos and catches enough bluffs to justify calling.';
            }
        } else if (isFold) {
            if (hs.includes('pair')) {
                decisionContext = 'Folding a made hand on the river — facing too much aggression. Villain\'s river betting range is strong enough that your pair is losing more often than not.';
            } else if (hs.includes('draw')) {
                decisionContext = 'Draw missed on the river — no showdown value and facing a bet. Folding is the only option.';
            }
        } else if (isCheck) {
            if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush')) {
                decisionContext = 'Check-trapping on the river with a strong hand — inducing a bluff or delayed value bet from villain.';
            } else if (hs.includes('top pair') || hs.includes('overpair')) {
                decisionContext = 'Checking back on the river for pot control — your hand has showdown value but betting risks being raised off the best hand.';
            }
        } else if (isRaise) {
            if (hs.includes('straight') || hs.includes('flush') || hs.includes('full house') || hs.includes('quads')) {
                decisionContext = 'River raise for value with the nuts — villain\'s bet indicates strength, and you\'re raising to extract maximum.';
            } else if (hs.includes('air') || hs.includes('no pair')) {
                decisionContext = 'River bluff-raise — representing the nuts when you have nothing. This works because villain\'s betting range is often capped.';
            }
        }

        // Combine
        const parts = [riverImpact, decisionContext].filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : '';
    }

    /**
     * Phase 45: Enhanced mixed strategy reasoning — GTO Wizard-level depth.
     * Explains indifference points, range balance, and exploitability prevention.
     */
    /**
     * Phase 69: SPR (Stack-to-Pot Ratio) awareness — explains how the remaining
     * stack relative to the pot affects commitment thresholds.
     * SPR < 1: Committed with almost anything
     * SPR 1-3: Commit with top pair+
     * SPR 3-6: Need two pair+ to stack off
     * SPR 6+: Deep stacked, implied odds matter most
     */
    _getSPRContext(action, handStrength, street, pot, stackDepth) {
        if (!pot || !stackDepth || street === 'preflop') return '';

        const effectiveStack = stackDepth - (pot / 2);
        const spr = effectiveStack / pot;
        if (spr < 0 || spr > 20) return ''; // invalid or too deep to matter

        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        // Very low SPR (< 1) — pot-committed
        if (spr < 1) {
            if (isFold) {
                if (hs.includes('air') || hs.includes('no pair')) return `SPR is ${spr.toFixed(1)} — you're nearly committed, but with pure air, even low SPR doesn't justify putting in more chips.`;
                return `SPR is ${spr.toFixed(1)} — you're essentially pot-committed but the solver still folds this hand, indicating villain's range is extremely strong here.`;
            }
            if (isCall || isBet || isRaise) {
                return `SPR is ${spr.toFixed(1)} — you're pot-committed. With this stack-to-pot ratio, getting it in is automatic with almost any piece of the board.`;
            }
        }

        // Low SPR (1-3) — commit with strong pairs+
        if (spr < 3) {
            if (isBet || isRaise) {
                if (hs.includes('top pair') || hs.includes('overpair') || hs.includes('set') || hs.includes('two pair')) {
                    return `SPR ${spr.toFixed(1)} — low enough to commit with one pair or better. Stack-off thresholds widen at shallow SPR.`;
                }
                if (hs.includes('draw')) {
                    return `SPR ${spr.toFixed(1)} — with a short stack-to-pot ratio, semi-bluff shoving has maximum fold equity and you can't be blown off your equity.`;
                }
            }
            if (isFold && (hs.includes('top pair') || hs.includes('overpair'))) {
                return `Even at SPR ${spr.toFixed(1)}, villain's aggression indicates a range that beats top pair. Sometimes you must fold despite low SPR.`;
            }
        }

        // Medium SPR (3-6) — need two pair+ to comfortably stack off
        if (spr >= 3 && spr < 6) {
            if (a === 'allin' || isRaise) {
                if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush')) {
                    return `SPR ${spr.toFixed(1)} — medium SPR means two pair+ is needed to stack off comfortably. Your hand qualifies.`;
                }
                if (hs.includes('top pair')) {
                    return `SPR ${spr.toFixed(1)} — at medium SPR, stacking off with just top pair is marginal. The solver raises because your specific hand is strong enough.`;
                }
            }
        }

        // High SPR (6+) — deep stacked, implied odds matter
        if (spr >= 6 && street === 'flop') {
            if (isCall && (hs.includes('set') || hs.includes('flush draw'))) {
                return `SPR ${spr.toFixed(1)} — deep stack-to-pot ratio maximizes implied odds. When you hit, you can win a massive pot relative to your investment.`;
            }
            if (isFold && (hs.includes('top pair'))) {
                return `SPR ${spr.toFixed(1)} — deep SPR means one pair is vulnerable. You need to improve to stack off, and the pot-to-stack commitment isn't there yet.`;
            }
        }

        return '';
    }

    /**
     * Phase 73: Villain tendency modeling — describe what villain's range looks like
     * at this point in the hand, based on game tree node, position, and action history.
     * This helps players understand WHY the solver's response is correct.
     */
    _getVillainTendencyNote(action, handStrength, street, texture, nodeType, heroPosition, villainPosition, freq) {
        if (street === 'preflop') return '';
        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        // Villain position context
        const vPos = villainPosition || '';
        const villainIsIP = this._isInPosition(vPos, heroPosition);
        const villainIsOOP = this._isInPosition(heroPosition, vPos);
        const villainTag = vPos ? ` (${vPos})` : '';

        // ═══ FACING VILLAIN'S BET (hero_faces_bet) ═══
        if (nodeType === 'hero_faces_bet') {
            if (street === 'flop') {
                // Villain c-bet or donk-bet
                if (villainIsIP) {
                    if (isFold && (hs.includes('air') || hs.includes('no pair'))) return `Villain${villainTag} c-bets IP with a wide range (~60-70% on most textures) — but your hand has no equity to continue against even this wide range.`;
                    if (isCall && hs.includes('draw')) return `Villain${villainTag} c-bets IP with ~60-70% of their range. Your draw has enough equity to call since villain's wide c-bet range includes many weak hands.`;
                    if (isRaise) return `Villain${villainTag} c-bets IP with a wide range — check-raising exploits their many weak c-bets and puts their bluffs in a tough spot.`;
                }
                if (villainIsOOP) {
                    if (isBet || isRaise) return `Villain${villainTag} leads OOP (donk-bet) — this polarized line usually means strong made hands or draws. Villain's range is narrow but potent.`;
                    if (isCall) return `Villain${villainTag} leads OOP — a polarized action. Call to keep their bluffs in and evaluate the turn.`;
                }
                if (isCall && (hs.includes('top pair') || hs.includes('overpair'))) return `Villain's flop c-bet range is wide — your strong pair is ahead of most of it. Calling keeps their bluffs in.`;
            }

            if (street === 'turn') {
                // Turn barrel — villain's range has narrowed
                if (isFold) return `Villain barrels the turn — their range has narrowed significantly from the flop. Turn bets are more value-heavy, so folding weaker hands becomes correct.`;
                if (isCall && (hs.includes('top pair') || hs.includes('overpair'))) return `Villain's turn barrel narrows their range to strong value and committed draws. Your pair is still a bluff-catcher that must continue to prevent villain from profiting with air.`;
                if (isCall && hs.includes('draw')) return `Facing a turn barrel with a draw — villain's range is stronger than flop, but your outs are live and implied odds help when you hit the river.`;
                if (isRaise) return `Raising villain's turn barrel — a powerful line. Villain's range is face-up as value or draws. A raise puts maximum pressure on their medium-strength hands.`;
            }

            if (street === 'river') {
                // River bet — villain is polarized (nuts or air)
                if (isFold) return `Villain fires three streets — their river range is heavily polarized between the nuts and bluffs. Your hand falls below the call threshold against this polarized range.`;
                if (isCall) return `Villain's river bet is polarized between value and bluffs. You must call at the right frequency (~1-alpha) to keep villain indifferent about bluffing.`;
                if (isRaise) return `Raising the river against a polarized villain — only viable with the nuts or as a massive bluff. Villain's value range is capped by not raising earlier.`;
            }
        }

        // ═══ HERO ACTS FIRST (hero_bets_or_checks) ═══
        if (nodeType === 'hero_bets_or_checks') {
            if (street === 'flop') {
                if (isBet && texture.straightPossible) return `Villain's checking range contains straight draws and connected hands. Betting charges these draws before the turn completes them.`;
                if (isBet && texture.wet) return `Villain's checking range contains many draws that get a free card if you check. Betting charges these draws and denies their equity realization.`;
                if (isCheck && texture.dry && texture.spread > 6) return `Villain's range whiffs this spread-out dry board frequently. Checking lets them bluff the turn with hands that would fold to a flop bet.`;
                if (isCheck && texture.dry) return `Villain's range whiffs this dry board frequently. Checking lets them bluff the turn with hands that would fold to a flop bet.`;
                if (isBet && texture.dry && (hs.includes('air') || hs.includes('no pair'))) return `Villain likely missed this dry board — c-betting as a bluff targets the large portion of their range that can't continue.`;
            }
            if (street === 'turn') {
                if (isBet && (hs.includes('top pair') || hs.includes('set'))) return `After checking to hero on the turn, villain's range is capped — they would have bet strong hands. Bet to extract value from their medium-strength holdings.`;
                if (isCheck) return `Villain's turn checking range still contains traps and slow-plays. Checking back avoids walking into a check-raise with a vulnerable hand.`;
            }
            if (street === 'river') {
                if (isBet && (hs.includes('air') || hs.includes('no pair'))) return `Villain has checked to you on the river — their range is weak and capped. This is a prime spot to bluff since they can't have strong hands.`;
                if (isBet && (hs.includes('set') || hs.includes('two pair') || hs.includes('flush') || hs.includes('straight'))) return `Villain checks the river — their capped range means they can't beat your strong hand but may call with bluff-catchers. Value bet.`;
            }
        }

        // ═══ FACING RAISE (hero_faces_raise) ═══
        if (nodeType === 'hero_faces_raise') {
            if (isFold) return `Villain raises — a very strong line that narrows their range to premium hands and select bluffs. Folding is correct when your hand can't beat villain's tightened range.`;
            if (isCall) return `Villain's raise polarizes their range between monsters and bluffs. Calling traps their bluffs while keeping the pot manageable against their value.`;
        }

        return '';
    }

    /**
     * Phase 64: Pot odds and equity math — when facing a bet (call/fold decisions),
     * calculate and display the pot odds, required equity, and how they compare
     * to the hand's estimated equity.
     */
    _getPotOddsMath(action, handStrength, street, validActions, pot, nodeType) {
        const a = action.toLowerCase();
        const isCall = a === 'call';
        const isFold = a === 'f';
        if (!isCall && !isFold) return '';
        if (nodeType !== 'hero_faces_bet') return '';

        const hs = handStrength.toLowerCase();

        // Try to infer the bet size from available actions
        // If "call" is an action, there must be a bet to call
        // We can estimate bet size from the pot context
        // Common bet sizes in solver: 33%, 50%, 67%, 75%, 100%
        // Without exact bet size, we provide general pot odds guidance

        // Estimate hand equity based on hand strength category
        let estEquity = 0;
        if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush') || hs.includes('full house') || hs.includes('quads')) {
            estEquity = 75; // Monster
        } else if (hs.includes('top pair') && hs.includes('top kicker')) {
            estEquity = 60;
        } else if (hs.includes('top pair') || hs.includes('overpair')) {
            estEquity = 55;
        } else if (hs.includes('monster draw') || hs.includes('combo draw')) {
            estEquity = 45; // 15+ outs ≈ 45% with two cards, ~33% with one
            if (street === 'turn') estEquity = 33;
        } else if (hs.includes('flush draw') || hs.includes('nut flush draw')) {
            estEquity = 36; // 9 outs ≈ 36% with two cards, 19% with one
            if (street === 'turn') estEquity = 19;
        } else if (hs.includes('oesd') || hs.includes('double gutshot')) {
            estEquity = 32; // 8 outs ≈ 32% with two cards, 17% with one
            if (street === 'turn') estEquity = 17;
        } else if (hs.includes('gutshot')) {
            estEquity = 17; // 4 outs ≈ 17% with two cards, 8.5% with one
            if (street === 'turn') estEquity = 9;
        } else if (hs.includes('second pair') || hs.includes('middle pair')) {
            estEquity = 35;
        } else if (hs.includes('bottom pair')) {
            estEquity = 25;
        } else if (hs.includes('overcard') || hs.includes('high cards')) {
            estEquity = 15; // ~6 outs
        } else if (hs.includes('air') || hs.includes('no pair')) {
            estEquity = 8;
        }

        if (estEquity === 0) return '';

        // Common pot odds by bet size:
        // 33% pot bet → need 20% equity to call
        // 50% pot bet → need 25% equity to call
        // 67% pot bet → need 29% equity to call
        // 75% pot bet → need 30% equity to call
        // 100% pot bet → need 33% equity to call
        // 150% pot bet → need 38% equity to call

        if (isCall) {
            if (hs.includes('flush draw') || hs.includes('nut flush draw')) {
                if (street === 'flop') return `Pot odds math: 9 flush outs × 4 = ~36% equity (rule of 4). You need ~25-33% equity to call most bet sizes — this is a clear call.`;
                if (street === 'turn') return `Pot odds math: 9 flush outs × 2 = ~18% equity (rule of 2). Marginal on pot odds alone, but implied odds when the flush hits make this profitable.`;
            }
            if (hs.includes('oesd') || hs.includes('double gutshot')) {
                if (street === 'flop') return `Pot odds math: 8 straight outs × 4 = ~32% equity (rule of 4). Sufficient to call most standard bet sizes.`;
                if (street === 'turn') return `Pot odds math: 8 outs × 2 = ~16% equity (rule of 2). Needs implied odds to justify — when the straight completes, you should win a large pot.`;
            }
            if (hs.includes('gutshot')) {
                if (street === 'flop') return `Pot odds math: 4 gutshot outs × 4 = ~16% equity. Marginal call — needs implied odds and possibly backdoor equity to justify continuing.`;
                if (street === 'turn') return `Pot odds math: 4 outs × 2 = ~8% equity. Direct pot odds don't justify calling — but implied odds when the straight hits make this close.`;
            }
            if (hs.includes('monster draw') || hs.includes('combo draw')) {
                return `Pot odds math: 15+ outs give ${estEquity}% equity — you're essentially a coin flip. Calling is always correct, and raising is also viable.`;
            }
            if (hs.includes('top pair') || hs.includes('overpair')) {
                if (street === 'river') return `Equity estimate: ~${estEquity}% vs villain's river betting range. Against balanced opponents, you need to call enough to prevent auto-profit bluffs.`;
                return `Equity estimate: ~${estEquity}% against villain's range — comfortably above the pot odds threshold for most bet sizes.`;
            }
            if (hs.includes('second pair') || hs.includes('bottom pair')) {
                if (street === 'river') return `Equity estimate: ~${estEquity}% vs villain's river range — close to the bluff-catching threshold. Call if villain bluffs enough.`;
            }
        }

        if (isFold) {
            if (hs.includes('flush draw') && street === 'turn') {
                return `Pot odds math: 9 outs × 2 = ~18% equity. If the bet size requires more than 18% equity, folding is correct without sufficient implied odds.`;
            }
            if (hs.includes('gutshot')) {
                return `Pot odds math: 4 outs = only ~${estEquity}% equity. This is below the required equity for nearly any bet size — folding is mathematically correct.`;
            }
            if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard')) {
                return `Equity estimate: ~${estEquity}% — well below the required equity to call. No profitable continue.`;
            }
            if (hs.includes('overpair') || hs.includes('top pair')) {
                return `Despite holding a strong hand (~${estEquity}% in a vacuum), villain's aggression narrows their range to hands that beat you. Effective equity drops below the calling threshold.`;
            }
        }

        return '';
    }

    /**
     * Phase 62: Multi-street planning — explains how the current action fits
     * into a broader plan across remaining streets. Covers geometric sizing,
     * pot commitment thresholds, and value/bluff barrel plans.
     */
    _getMultiStreetPlan(street, action, sizePct, handStrength, texture, pot, stackDepth) {
        if (!street || street === 'preflop' || street === 'river') return '';

        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();
        const effectiveStack = stackDepth || 100;

        // ═══ FLOP: 2 streets remaining ═══
        if (street === 'flop') {
            if (isBet) {
                const isNutted = hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush') || hs.includes('full house');
                const hasDraw = hs.includes('draw') || hs.includes('oesd') || hs.includes('flush draw') || hs.includes('gutshot');
                const isTopPair = hs.includes('top pair') || hs.includes('overpair');

                if (sizePct >= 60 && isNutted) {
                    return 'Multi-street plan: Big flop bet → sets up a 60-75% turn barrel → pot-sized river shove. This geometric sizing path gets all the money in by the river.';
                }
                if (sizePct >= 60 && hasDraw) {
                    if (texture.connectedness === 'high') return 'Multi-street plan: Large semi-bluff on this highly connected board → many turn cards improve your hand. Barrel any card that completes a draw or scares villain.';
                    return 'Multi-street plan: Large semi-bluff now → if the draw hits, barrel for value; if it misses, you can either give up or triple-barrel bluff representing the nuts.';
                }
                if (sizePct <= 33 && isNutted) {
                    return 'Multi-street plan: Small flop bet builds the pot gradually — allows larger turn and river bets while keeping villain\'s entire range in.';
                }
                if (sizePct <= 33 && (hs.includes('air') || hs.includes('no pair'))) {
                    return 'Multi-street plan: Cheap flop c-bet → evaluate the turn card. Give up on bad runouts, barrel good turn cards that improve your equity or fold out villain\'s marginal hands.';
                }
                if (isTopPair && sizePct >= 40 && sizePct <= 70) {
                    return 'Multi-street plan: Medium flop bet with top pair → often check the turn to control the pot, then decide on the river based on villain\'s action.';
                }
            }
            if (isCheck) {
                const isStrong = hs.includes('set') || hs.includes('two pair') || hs.includes('overpair');
                if (isStrong) {
                    return 'Multi-street plan: Check the flop to trap → bet or raise the turn when villain barrels. Two remaining streets give time to build a big pot.';
                }
                if (hs.includes('draw')) {
                    return 'Multi-street plan: Check to see the turn for free → if the draw completes, start betting for value. If not, reassess with one card to come.';
                }
            }
            if (isCall) {
                if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('oesd')) {
                    return 'Multi-street plan: Call the flop with a draw → re-evaluate on the turn. If the draw completes, raise or bet for value. If not, decide based on pot odds.';
                }
                if (hs.includes('set') || hs.includes('two pair')) {
                    return 'Multi-street plan: Flatting the flop with a monster → raise the turn or river to build a big pot when villain continues barreling.';
                }
            }
        }

        // ═══ TURN: 1 street remaining ═══
        if (street === 'turn') {
            if (isBet) {
                const isNutted = hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush') || hs.includes('full house');
                const hasDraw = hs.includes('draw') || hs.includes('oesd') || hs.includes('flush draw');

                if (sizePct >= 60 && sizePct <= 75) {
                    if (isNutted) return 'Multi-street plan: 60-75% turn bet sets up a pot-sized river shove — geometric sizing to get stacks in by the river.';
                    if (hasDraw) return 'Multi-street plan: Large turn semi-bluff → if the river completes the draw, bet for value. If not, you\'ve already built fold equity for a river jam.';
                }
                if (sizePct >= 80) {
                    return 'Multi-street plan: Large turn bet commits a significant portion of your stack — be prepared to follow through with a river shove regardless of the card.';
                }
                if (sizePct <= 40) {
                    if (isNutted) return 'Multi-street plan: Small turn bet keeps villain\'s wide range in → overbet or pot-sized river bet for maximum extraction.';
                    if (hs.includes('top pair') || hs.includes('overpair')) return 'Multi-street plan: Medium turn bet for value/protection → check back or make a small river value bet depending on the runout.';
                }
                if (a === 'allin') {
                    if (hasDraw) return 'Multi-street plan: Shoving the turn as a semi-bluff — maximum fold equity with one card to come. If called, you still have draw outs.';
                    if (isNutted) return 'Going all-in on the turn for max value — the pot is large enough relative to stacks to get it in now.';
                }
            }
            if (isCheck) {
                if (hs.includes('top pair') || hs.includes('overpair')) {
                    return 'Multi-street plan: Checking the turn to control the pot → call a reasonable river bet or bet for thin value if checked to.';
                }
                if (hs.includes('set') || hs.includes('two pair')) {
                    return 'Multi-street plan: Check the turn to induce a river bluff or delayed bet — then raise for maximum value on the river.';
                }
                if (hs.includes('draw')) {
                    return 'Multi-street plan: Take a free card on the turn → if the draw completes on the river, bet for value. If not, check-fold or bluff based on runout.';
                }
            }
            if (isCall) {
                if (hs.includes('draw')) {
                    return 'Multi-street plan: Calling the turn with a draw → final card decides everything. If the draw hits, you win a big pot. If not, fold to a river bet.';
                }
                if (hs.includes('top pair') || hs.includes('overpair')) {
                    return 'Multi-street plan: Call turn → bluff-catch the river. One more bet to face — your hand should be good often enough to justify calling down.';
                }
            }
        }

        return '';
    }

    /**
     * Phase 61: Range advantage — explains which player has the range advantage
     * on this board and how it affects the optimal strategy.
     * Key concepts: nut advantage, equity advantage, IP vs OOP dynamics.
     */
    _getRangeAdvantageNote(board, street, action, texture, nodeType, heroPosition, villainPosition, handStrength) {
        if (!board || board.length < 3 || street === 'preflop') return '';

        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');
        const hs = handStrength.toLowerCase();

        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);
        const boardRanks = validBoard.map(c => c[0].toUpperCase());
        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const boardVals = boardRanks.map(r => rankVal(r));
        const boardHighVal = Math.max(...boardVals);
        const boardLowVal = Math.min(...boardVals);

        // Determine IP/OOP
        const posOrder = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
        const heroIdx = posOrder.indexOf(heroPosition);
        const villIdx = posOrder.indexOf(villainPosition);
        // Postflop: BTN is last to act (most IP), BB acts first (OOP)
        // SB/BB are OOP postflop; BTN/CO/HJ are IP
        const oopPositions = ['SB', 'BB'];
        const heroIsOOP = oopPositions.includes(heroPosition);
        const heroIsIP = !heroIsOOP && villainPosition && oopPositions.includes(villainPosition);

        // Board categorization for range advantage
        const isHighBoard = boardHighVal >= 10; // T+ high
        const isAceHighBoard = boardRanks.includes('A');
        const isLowBoard = boardHighVal <= 8; // 8-high or lower
        const isMidBoard = !isHighBoard && !isLowBoard;

        // Only add range advantage notes for flop (most impactful) and selectively for turn
        if (street === 'turn' || street === 'river') {
            // On later streets, only mention range advantage in specific scenarios
            if (street === 'river') return '';
            // Turn: only if it's a significant texture shift
            if (!texture.monotone && !texture.paired) return '';
        }

        // ═══ PREFLOP AGGRESSOR RANGE ADVANTAGE (c-bet spots) ═══
        if (nodeType === 'hero_bets_or_checks' && street === 'flop') {
            // Hero is the preflop aggressor (c-bet decision)
            if (isAceHighBoard) {
                if (isBet) return 'Range advantage: Ace-high boards heavily favor the preflop raiser — your range has more AA/AK/AQ combos than the caller.';
                if (isCheck) return 'Range advantage: Even though ace-high boards favor the raiser, checking balances your range and prevents being exploited by always c-betting.';
            }
            if (isHighBoard && boardRanks.includes('K')) {
                if (isBet) return 'Range advantage: King-high boards favor the preflop raiser — more KK/AK/KQ in your range than the caller\'s.';
            }
            if (texture.broadwayDraw) {
                if (isBet) return 'Range advantage: Broadway-draw board (3+ cards T-A) — the preflop raiser\'s range has more broadway combinations, giving significant range advantage.';
            }
            if (texture.highCard && !isAceHighBoard && !boardRanks.includes('K')) {
                if (isBet) return 'Range advantage: High board favors the preflop raiser — more premium hands in your range connect with these high cards.';
            }
            if (isLowBoard && texture.connected) {
                if (texture.gapSize === 'rundown') {
                    if (isCheck) return 'Range advantage: This low rundown board (3+ connected cards) massively favors the caller — they have straights, sets, two pair, and combo draws. Check frequently as the PFR.';
                    if (isBet) return 'Range note: Rundown low boards strongly favor the caller, but betting with your specific hand applies pressure to their capped portions.';
                }
                if (isCheck) return 'Range advantage: Low connected boards favor the caller\'s range — they have more sets, two pair, and straight combos. Checking is often correct as the PFR.';
                if (isBet && hs.includes('overpair')) return 'Range note: Low connected boards favor the caller, but your overpair still needs to bet for protection against the many draws and strong hands in their range.';
            }
            if (isLowBoard && !texture.connected) {
                if (isBet) return 'Range advantage: Low dry boards are close in range advantage — small c-bets with wide range work because neither player connects strongly.';
            }
            if (texture.straightDrawHeavy && !isLowBoard) {
                if (isCheck) return 'Range note: This connected board allows many straight draws — checking accounts for the caller\'s strong equity realization with connected hands.';
                if (isBet && (hs.includes('set') || hs.includes('two pair'))) return 'Range note: Connected board with many straight possibilities — bet to charge the numerous draws before the turn changes the landscape.';
            }
            if (texture.monotone) {
                if (isCheck) return 'Range note: Monotone boards reduce the preflop raiser\'s range advantage — the caller has more suited combos that hit flushes and flush draws.';
                if (isBet) return 'Range note: Despite the monotone texture reducing your range advantage, betting protects your equity and charges villain\'s draws.';
            }
            if (texture.paired) {
                if (isBet) return 'Range advantage: Paired boards strongly favor the preflop raiser — your range has more overpairs and big pairs while the caller rarely has trips.';
            }
        }

        // ═══ CALLER/OOP RANGE ADVANTAGE (facing c-bet) ═══
        if (nodeType === 'hero_faces_bet' && street === 'flop') {
            if (isLowBoard && texture.connected) {
                if (isRaise) return 'Range advantage: You (the caller) have the range advantage on this low connected board — more two pair, sets, and straights than the preflop raiser. Check-raising exploits this.';
                if (isCall) return 'Range advantage: Low connected boards favor the caller\'s range — you connect more often with sets and two pair here.';
            }
            if (isAceHighBoard && isFold) {
                return 'Range disadvantage: Ace-high boards favor the preflop raiser heavily. Without a strong hand, folding is correct because villain\'s range connects much more often here.';
            }
        }

        // ═══ IP vs OOP DYNAMICS ═══
        if (heroIsIP && isCheck && street === 'flop') {
            if (hs.includes('draw') || hs.includes('backdoor')) {
                return 'Position advantage: Being in position allows you to check back draws and realize equity freely — a key IP advantage.';
            }
        }
        if (heroIsOOP && isBet && street === 'flop') {
            if (hs.includes('air') || hs.includes('no pair')) {
                return 'Position note: Donk-betting OOP is uncommon in GTO — when the solver uses it, the board texture strongly favors the OOP player\'s range.';
            }
        }

        return '';
    }

    /**
     * Phase 60: Blocker awareness — explains how hero's hole cards block
     * or unblock villain's ranges, and why that matters for the chosen action.
     */
    _getBlockerContext(heroHand, board, handStrength, action, street, texture) {
        if (!heroHand || heroHand.length < 2 || street === 'preflop') return '';

        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isRaise = a.startsWith('r');
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isCheck = a === 'c' || a === 'x';
        const isAggressive = isBet || isRaise;
        const isPassive = isCall || isCheck;
        const hs = handStrength.toLowerCase();

        const r1 = heroHand[0], r2 = heroHand[1];
        const suffix = heroHand.length >= 3 ? heroHand[2] : '';
        const isSuited = suffix === 's';
        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const v1 = rankVal(r1), v2 = rankVal(r2);

        // Parse board
        const validBoard = (board || []).filter(c => c && typeof c === 'string' && c.length >= 2);
        const boardRanks = validBoard.map(c => c[0].toUpperCase());
        const boardSuits = validBoard.map(c => c[1]?.toLowerCase());
        const boardVals = boardRanks.map(r => rankVal(r));

        // Detect board flush potential
        const suitCounts = {};
        boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const flushSuit = Object.entries(suitCounts || {}).find(([s, c]) => c >= 3)?.[0] || null;
        const threeFlush = flushSuit && suitCounts[flushSuit] === 3;
        const fourFlush = flushSuit && suitCounts[flushSuit] >= 4;

        // Hero suit info
        const heroSuit1 = isSuited ? suffix : null; // for suited hands, both share the suit letter... but heroHand is like "AKs" not actual cards
        // We need to work with rank-level blockers since heroHand is notation (AKs) not specific cards (Ah Kh)

        const hasAce = r1 === 'A' || r2 === 'A';
        const hasKing = r1 === 'K' || r2 === 'K';
        const hasQueen = r1 === 'Q' || r2 === 'Q';
        const hasJack = r1 === 'J' || r2 === 'J';
        const hasTen = r1 === 'T' || r2 === 'T';
        const nonAceRank = r1 === 'A' ? r2 : r1;
        const isPair = r1 === r2;

        // Board top card
        const boardHighVal = Math.max(...boardVals);
        const boardHighRank = '23456789TJQKA'[boardHighVal] || '';

        // Detect straight-heavy boards
        const sortedBoardVals = [...boardVals].sort((a, b) => a - b);
        const boardSpread = sortedBoardVals.length >= 3 ? sortedBoardVals[sortedBoardVals.length - 1] - sortedBoardVals[0] : 99;
        const connectedBoard = boardSpread <= 4 && validBoard.length >= 3;

        // ═══ BLOCKER EFFECTS FOR AGGRESSIVE ACTIONS (bet/raise) ═══
        if (isAggressive) {
            // Bluffing with blockers — the most important blocker concept
            if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard') || hs.includes('busted') || hs.includes('missed')) {
                const blockers = [];

                // Ace blocks AA, AK, AQ — reduces villain's premium combos
                if (hasAce) blockers.push('Holding an A blocks villain\'s AA/AK/AQ combos');
                // King blocks KK, AK
                if (hasKing && !hasAce) blockers.push('The K blocks KK and AK combos');

                // Suited ace on flush board blocks nut flush
                if (hasAce && isSuited && (threeFlush || fourFlush)) {
                    blockers.push('Your suited A blocks villain\'s nut flush combos');
                }

                // Cards that block straights on connected boards
                if (connectedBoard || texture.straightDrawHeavy) {
                    const heroInRange = boardVals.some(bv => Math.abs(v1 - bv) <= 2 || Math.abs(v2 - bv) <= 2);
                    if (heroInRange) blockers.push('Your cards block key straight combos on this connected board');
                }

                // Broadway blockers on broadway-heavy boards
                if (texture.broadwayHeavy && (hasQueen || hasJack || hasTen)) {
                    blockers.push('Your broadway card blocks villain\'s strong broadway combos');
                }

                // Wheel blocker on low boards with wheel potential
                if (texture.wheelDraw && (v1 <= 3 || v2 <= 3)) {
                    blockers.push('Your low card blocks wheel straight combos');
                }

                if (blockers.length > 0) {
                    return `Blocker effect: ${blockers[0]}${blockers.length > 1 ? '; ' + blockers[1] : ''} — making this a premium bluff candidate.`;
                }
            }

            // Semi-bluffing with draw + blockers
            if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('oesd') || hs.includes('gutshot')) {
                if (hasAce && isSuited && (threeFlush || fourFlush)) {
                    return 'Blocker effect: Your suited ace blocks villain\'s nut flush — they\'re less likely to have the nuts, making your semi-bluff more effective.';
                }
                if (hasAce && (threeFlush || fourFlush)) {
                    return 'Blocker effect: Holding an A reduces the chance villain has the nut flush, supporting this aggression.';
                }
            }

            // Value betting — unblocking calling range is key
            if (hs.includes('set') || hs.includes('two pair') || hs.includes('full house') || hs.includes('straight') || hs.includes('flush')) {
                // Set on Axx board — you block AA but unblock AK/AQ
                if (isPair && boardRanks.includes(r1)) {
                    if (r1 === 'A') return 'Blocker note: Your set blocks AA (no combos left) but villain can still have AK/AQ — good targets for value.';
                    if (hasAce || boardRanks.includes('A')) return ''; // complex, skip
                }
                // Two pair on flushy board — no flush blocker is good
                if (hs.includes('two pair') && (threeFlush || fourFlush) && !isSuited) {
                    return 'Blocker note: Your offsuit hand doesn\'t block flush draws — villain\'s range has more missed draws that may call.';
                }
            }

            // Overbet with nut blocker
            if (isBet) {
                const sizeMatch = a.match(/^b(\d+)$/);
                const sizePct = sizeMatch ? parseInt(sizeMatch[1]) : 0;
                if (sizePct >= 125 && hasAce && (threeFlush || fourFlush)) {
                    return 'Blocker effect: Overbetting while holding the A on a flushy board — you block the nuts, making villain less likely to have a hand that can call.';
                }
            }
        }

        // ═══ BLOCKER EFFECTS FOR CALLING (bluff-catching) ═══
        if (isCall) {
            // Calling is better when you UNBLOCK bluffs and BLOCK value
            if (street === 'river') {
                const effects = [];

                // Blocking value: good for calling
                if (isPair && v1 >= 10) {
                    effects.push(`Your ${r1}${r1} blocks some of villain's value combos`);
                }
                if (hasAce && (threeFlush || fourFlush)) {
                    effects.push('Your A blocks the nut flush');
                }

                // Unblocking bluffs: also good for calling (absence of blockers to draws)
                if ((threeFlush || fourFlush) && !isSuited) {
                    effects.push('your offsuit hand doesn\'t block missed flush draws — villain has more bluff combos');
                }

                if (effects.length > 0) {
                    return `Blocker logic: ${effects.join('; ')} — supporting the call.`;
                }
            }
        }

        // ═══ BLOCKER EFFECTS FOR FOLDING ═══
        if (isFold) {
            // Folding is correct when you UNBLOCK value and BLOCK bluffs
            if (street === 'river' || street === 'turn') {
                if (isSuited && (threeFlush || fourFlush)) {
                    return 'Blocker consideration: Your suited cards block some of villain\'s missed flush draw bluffs — they have fewer bluffs, supporting the fold.';
                }
                if (connectedBoard && (Math.abs(v1 - boardVals[0]) <= 2 || Math.abs(v2 - boardVals[0]) <= 2)) {
                    return 'Your cards block some of villain\'s missed straight draws — fewer bluffs in their range supports folding.';
                }
            }
        }

        // ═══ BLOCKER EFFECTS FOR CHECKING ═══
        if (isCheck) {
            // Strong hands checking — sometimes because blockers reduce action
            if (hs.includes('top pair') || hs.includes('overpair')) {
                if (hasAce && boardRanks.includes('A')) {
                    return 'Blocker note: Holding an A on an ace-high board reduces villain\'s top pair combos — fewer hands can pay you off, supporting a check.';
                }
                if (hasKing && boardRanks.includes('K')) {
                    return 'Blocker note: Your K on a king-high board reduces villain\'s top pair combos — checking makes sense when value targets are scarce.';
                }
            }
        }

        return '';
    }

    _getMixingReason(handStrength, texture, street, validActions, handActions) {
        const sorted = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a]);

        if (sorted.length < 2) return 'Close decision — nearly pure.';

        const top = sorted[0].toLowerCase();
        const second = sorted[1].toLowerCase();
        const topFreq = (handActions[sorted[0]] * 100).toFixed(0);
        const secondFreq = (handActions[sorted[1]] * 100).toFixed(0);
        const topIsBet = top.startsWith('b') || top === 'allin';
        const topIsCheck = top === 'c' || top === 'x';
        const secondIsBet = second.startsWith('b') || second === 'allin';
        const secondIsCheck = second === 'c' || second === 'x';
        const hs = handStrength.toLowerCase();

        // Board texture tag for context
        const texTag = texture.monotone ? ' on this monotone board' : texture.straightDrawHeavy ? ' on this straight-heavy board' : texture.wet ? ' on this wet board' : texture.paired ? ' on this paired board' : texture.dry ? ' on this dry board' : '';

        // Check vs Bet mix — the most common mixed strategy
        if ((topIsCheck && secondIsBet) || (topIsBet && secondIsCheck)) {
            if (hs.includes('top pair') || hs.includes('overpair')) {
                if (texture.wet) return `This hand is at the indifference point between betting for value/protection and checking to control the pot. On a wet board, betting ${topIsBet ? topFreq : secondFreq}% protects against draws while checking preserves a balanced checking range.`;
                if (texture.dry) return `On a dry board, top pair is less vulnerable — the solver splits between betting for thin value and checking to trap. Neither line dominates.`;
                if (texture.paired) return `On a paired board, top pair is relatively strong. The solver mixes between betting thin and checking, since fewer draws exist and villain's range is more capped.`;
                return `At the boundary between value betting and pot control. If this hand always bet, the checking range would become too weak and exploitable. The solver splits to keep both ranges strong.`;
            }
            if (hs.includes('set') || hs.includes('two pair')) {
                if (texture.wet) return `Strong hand mixing bet/check on a wet board — betting protects against draws while checking traps aggressive opponents. Wet textures increase the mix frequency.`;
                if (texture.dry) return `Slow-playing a monster on a dry board — fewer draws mean less urgency to bet. Trapping is more viable when villain can't outdraw you easily.`;
                return `Strong hand that mixes between building the pot and trapping. Slow-playing some percentage disguises hand strength and protects the checking range with monsters.`;
            }
            if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('oesd')) {
                if (texture.wet) return `Draw at the indifference point on a wet board — semi-bluffing has more credibility when many draws exist, but checking also realizes equity well.`;
                return `Draw at the indifference point — sometimes semi-bluffing for fold equity, sometimes checking to realize equity freely. Both lines have approximately equal EV.`;
            }
            if (hs.includes('air') || hs.includes('no pair') || hs.includes('overcard')) {
                if (texture.dry) return `On a dry board, the solver bluffs less frequently — villain has fewer draws to fold out, so bluff profitability is lower. The mix keeps frequencies unpredictable.`;
                if (texture.wet) return `Wet board gives air more semi-bluff equity through backdoors. The solver bluffs enough to make villain indifferent between calling and folding.`;
                return `This hand sometimes bluffs and sometimes gives up. The solver bluffs just often enough to make villain indifferent between calling and folding — the foundation of GTO balance.`;
            }
            if (hs.includes('second pair') || hs.includes('bottom pair') || hs.includes('middle pair')) {
                if (texture.wet) return `Marginal hand on a wet board — betting risks getting raised, checking risks giving free cards. The solver mixes because neither option clearly dominates.`;
                return `Marginal made hand at the bet/check boundary. Betting extracts thin value from worse hands, but checking preserves the option to call a river bet with showdown value.`;
            }
            return `Indifferent between betting and checking${texTag} — at Nash equilibrium, both actions yield identical EV. The solver randomizes to prevent opponents from exploiting predictable patterns.`;
        }

        // Multiple bet sizes
        if (topIsBet && secondIsBet) {
            const topSize = parseInt(top.match(/\d+/)?.[0] || '0');
            const secSize = parseInt(second.match(/\d+/)?.[0] || '0');
            if (hs.includes('set') || hs.includes('straight') || hs.includes('flush') || hs.includes('full house')) {
                if (texture.wet) return `Multiple sizings with a strong hand on a wet board — smaller bets keep draws in, while larger bets charge them. The solver optimizes the value extraction mix.`;
                return `The solver uses multiple sizings with the nuts — smaller bets target thin calls from medium-strength hands, while larger bets maximize value from strong holdings.`;
            }
            if (hs.includes('draw')) {
                return `Different bluff sizings with a draw — smaller bets risk less when bluffing, while larger bets generate more fold equity. The solver optimizes the sizing mix${texTag}.`;
            }
            if (Math.abs(topSize - secSize) >= 40) {
                return `Wide sizing split (${topSize}% vs ${secSize}%)${texTag} — each size targets a different portion of villain's range. The larger size is polarized; the smaller is merged.`;
            }
            return `Multiple bet sizes at the indifference point. The solver splits sizings to target different parts of villain's range — each size attacks a different hand class optimally.`;
        }

        // Call vs Raise mix
        if ((top === 'call' && (second.startsWith('r') || second === 'allin')) ||
            ((top.startsWith('r') || top === 'allin') && second === 'call')) {
            if (hs.includes('set') || hs.includes('two pair') || hs.includes('straight') || hs.includes('flush')) {
                if (texture.wet) return `Strong hand mixing flat/raise on a wet board — raising denies equity but narrows villain's range. Flatting keeps bluffs in and maintains pot size for river extraction.`;
                return `Strong hand that mixes flat and raise. Raising always would cap the flatting range, making it exploitable. Slow-playing some percentage keeps both ranges balanced.`;
            }
            if (hs.includes('draw')) {
                if (texture.wet) return `Semi-bluff raise vs. float on a wet board — raising maximizes fold equity against villain's many vulnerable hands. Calling preserves implied odds.`;
                return `Semi-bluff raise vs. floating call — raising applies maximum pressure, calling preserves implied odds. Both lines are approximately +EV.`;
            }
            return `Mixing call/raise at the indifference point${texTag} — flatting traps bluffs, raising builds the pot. The solver balances both to stay unexploitable.`;
        }

        // Fold vs Call mix — critical bluff-catching theory
        if ((top === 'f' && second === 'call') || (top === 'call' && second === 'f')) {
            if (street === 'river') {
                if (texture.flushy || texture.monotone) return `At the bluff-catching threshold on a flushy river board. Missed flush draws are a large part of villain's bluffing range — calling just enough to prevent them from auto-profiting with bluffs.`;
                return `At the exact bluff-catching threshold on the river. Calling too much lets villain profit by over-bluffing; folding too much lets villain steal pots unchallenged. The solver calls just enough to keep villain indifferent.`;
            }
            if (texture.wet) return `At the minimum defense frequency on a wet board — many draws increase villain's semi-bluff frequency, but this hand is at the threshold of profitability.`;
            return `At the minimum defense frequency boundary — this hand is nearly indifferent between continuing and folding. Defending slightly more than breakeven prevents exploitation.`;
        }

        // Fold vs Call vs Raise three-way mix
        const hasFold = sorted.some(s => s.toLowerCase() === 'f');
        const hasCall = sorted.some(s => s.toLowerCase() === 'call');
        const hasRaise = sorted.some(s => s.toLowerCase().startsWith('r') || s.toLowerCase() === 'allin');
        if (hasFold && hasCall && hasRaise) {
            return `Three-way mix (fold/call/raise)${texTag} — this hand is at a complex indifference point where all three actions yield similar EV. The solver distributes across all lines to maintain perfect balance.`;
        }

        return `Multiple actions at the Nash equilibrium indifference point — all mixed-in actions yield identical EV. Deviating from these frequencies creates exploitable imbalances.`;
    }

    /**
     * Phase 26: Preflop-specific explanation with position awareness,
     * hand category reasoning, and open/3bet/call context.
     */
    _buildPreflopExplanation(heroHand, optimalAction, handActions, freq, freqPct, label, validActions, nodeType, heroPosition, villainPosition, stackDepth, potType) {
        const baseExpl = this._buildPreflopExplanationCore(heroHand, optimalAction, handActions, freq, freqPct, label, validActions, nodeType, heroPosition, villainPosition, stackDepth, potType);
        return this._appendPreflopContext(baseExpl, heroHand, heroPosition, villainPosition, optimalAction, nodeType, potType);
    }

    _buildPreflopExplanationCore(heroHand, optimalAction, handActions, freq, freqPct, label, validActions, nodeType, heroPosition, villainPosition, stackDepth, potType) {
        const r1 = heroHand[0], r2 = heroHand[1];
        const suffix = heroHand.length >= 3 ? heroHand[2] : '';
        const isPair = r1 === r2;
        const isSuited = suffix === 's';
        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const v1 = rankVal(r1), v2 = rankVal(r2);
        const isConnected = Math.abs(v1 - v2) <= 2 && !isPair;
        const isBroadway = v1 >= 8 && v2 >= 8; // T+ (T is index 8)
        const isPremium = isPair && v1 >= 10; // JJ+
        const isSuperPremium = isPair && v1 >= 11; // QQ+
        const isAx = r1 === 'A' || r2 === 'A';
        const isKx = (r1 === 'K' || r2 === 'K') && !isAx;

        const a = optimalAction.toLowerCase();
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r') || a === 'allin';

        // Position context
        const posName = heroPosition || 'Hero';
        const isEarlyPos = ['UTG', 'UTG+1'].includes(heroPosition);
        const isMiddlePos = ['MP', 'MP+1', 'HJ'].includes(heroPosition);
        const isLatePos = ['CO', 'BTN'].includes(heroPosition);
        const isBlind = ['SB', 'BB'].includes(heroPosition);

        // Hand description
        let handDesc = '';
        if (isSuperPremium) handDesc = 'a premium pair';
        else if (isPremium) handDesc = 'a strong pair';
        else if (isPair && v1 >= 6) handDesc = 'a medium pocket pair';
        else if (isPair) handDesc = 'a small pocket pair';
        else if (isAx && isSuited && v2 >= 9) handDesc = 'a strong suited ace';
        else if (isAx && isSuited) handDesc = 'a suited ace';
        else if (isAx && isBroadway) handDesc = 'a strong offsuit broadway';
        else if (isBroadway && isSuited) handDesc = 'suited broadway';
        else if (isBroadway) handDesc = 'offsuit broadway';
        else if (isKx && isSuited) handDesc = 'a suited king';
        else if (isConnected && isSuited) handDesc = 'a suited connector';
        else if (isConnected) handDesc = 'an offsuit connector';
        else if (isSuited) handDesc = 'a suited hand';
        else handDesc = 'an offsuit hand';

        // ═══ OPEN RAISE (RFI) ═══
        // Phase 41: Stack-depth-aware open raise explanations
        if (nodeType === 'preflop_open') {
            const stackNote = stackDepth ? (stackDepth <= 20 ? ` At ${stackDepth}BB, opening ranges tighten due to high SPR risk.` : stackDepth <= 40 ? '' : ` Deep-stacked — implied odds favor suited/connected hands.`) : '';
            if (isRaise) {
                if (freq >= 0.95) {
                    if (isPremium) return `${heroHand}: Always open ${handDesc} from ${posName}. ${this._positionOpenContext(heroPosition)}${stackNote}`;
                    if (isLatePos && isSuited && isConnected) return `${heroHand}: Pure open from ${posName}. ${handDesc} — ideal steal hand with playability, suitedness, and connectivity.${stackNote}`;
                    if (isLatePos) return `${heroHand}: Pure open from ${posName}. ${handDesc} — wide opening range in late position to steal blinds.${stackNote}`;
                    if (isEarlyPos) return `${heroHand}: Pure open from ${posName}. ${handDesc} strong enough to open even in early position against many opponents.${stackNote}`;
                    if (isBlind) return `${heroHand}: Pure open from ${posName}. ${handDesc} — stealing from the small blind with only BB to get through.${stackNote}`;
                    return `${heroHand}: Pure open from ${posName}. ${handDesc} is always in the opening range here.${stackNote}`;
                }
                const foldFreq = handActions['f'] ? (handActions['f'] * 100).toFixed(0) : null;
                if (foldFreq) {
                    return `${heroHand}: Open ${freqPct}%, fold ${foldFreq}% from ${posName}. ${handDesc} is at the boundary of the opening range — the solver mixes to stay balanced.${stackNote}`;
                }
                return `${heroHand}: Open ${freqPct}% from ${posName}. ${handDesc} — marginal open that the solver mixes.${stackNote}`;
            }
            if (isFold) {
                if (freq >= 0.95) {
                    if (isEarlyPos) {
                        if (!isPair && !isSuited && !isBroadway) return `${heroHand}: Pure fold from ${posName}. ${handDesc} — offsuit non-broadway hands are never in the ~13% EP opening range. Needs suitedness, connectivity, or high cards.${stackNote}`;
                        return `${heroHand}: Pure fold from ${posName}. ${handDesc} — too weak for the tight ~13% opening range with 5+ players behind.${stackNote}`;
                    }
                    if (isMiddlePos) return `${heroHand}: Pure fold from ${posName}. ${handDesc} falls outside the ~20% MP opening range — not enough playability to open profitably.${stackNote}`;
                    if (heroPosition === 'CO') return `${heroHand}: Fold from CO. ${handDesc} — falls just outside the ~30% CO opening range. Marginal hand that doesn't play well enough postflop.${stackNote}`;
                    if (heroPosition === 'BTN') return `${heroHand}: Fold from BTN. Even with the widest opening range (~45%), ${handDesc} doesn't have enough playability to open profitably.${stackNote}`;
                    if (isBlind) return `${heroHand}: Fold from ${posName}. ${handDesc} — even with the positional discount, this hand plays too poorly postflop out of position.${stackNote}`;
                    return `${heroHand}: Fold from ${posName}. ${handDesc} is outside the opening range.${stackNote}`;
                }
                if (isEarlyPos) return `${heroHand}: Fold ${freqPct}% from ${posName}. At the very edge of the ~13% EP opening range — the solver mostly folds this hand from early position.${stackNote}`;
                if (isLatePos) return `${heroHand}: Fold ${freqPct}% from ${posName}. Borderline hand at the bottom of the opening range — the solver sometimes folds to stay balanced.${stackNote}`;
                return `${heroHand}: Fold ${freqPct}% from ${posName}. Marginal hand at the edge of the opening range.${stackNote}`;
            }
        }

        // ═══ FACING A RAISE ═══
        // Phase 41: Pot-type-aware — differentiates facing open (3-bet decision) from facing 3-bet (4-bet decision)
        if (nodeType === 'preflop_facing_raise') {
            const vs = villainPosition || 'opponent';
            const isFacing3Bet = potType === '3-Bet Pot' || potType === '4-Bet Pot';
            const stackContext = stackDepth ? (stackDepth <= 25 ? ` At ${stackDepth}BB effective, stack-off thresholds are lower.` : stackDepth <= 50 ? ` At ${stackDepth}BB, you need to consider stack-to-pot ratio carefully.` : '') : '';

            if (isFacing3Bet) {
                // ═══ FACING A 3-BET (4-bet, call, or fold) ═══
                if (isRaise) {
                    if (freq >= 0.95) {
                        if (isSuperPremium) return `${heroHand}: Always 4-bet ${handDesc} vs ${vs}'s 3-bet. This is a mandatory value 4-bet — trap with AA/KK only at exploitative frequencies.${stackContext}`;
                        if (isPremium) return `${heroHand}: Pure 4-bet vs ${vs}'s 3-bet. ${handDesc} is too strong to flat — re-raising for value and pot control.${stackContext}`;
                        if (isAx && isSuited) return `${heroHand}: Pure 4-bet bluff vs ${vs}'s 3-bet. ${handDesc} blocks AA/AK in villain's value range (removing ~16 combos) and has nut potential if called.${stackContext}`;
                        if (isKx && isSuited) return `${heroHand}: Pure 4-bet bluff vs ${vs}'s 3-bet. ${handDesc} blocks KK and AK combos, reducing villain's premium holdings — a balanced 4-bet bluff.${stackContext}`;
                        return `${heroHand}: Pure 4-bet vs ${vs}'s 3-bet. Strong enough to continue aggressively in a 3-bet pot.${stackContext}`;
                    }
                    const callFreq = handActions['call'] ? (handActions['call'] * 100).toFixed(0) : null;
                    if (callFreq && parseInt(callFreq) > 5) {
                        return `${heroHand}: 4-bet ${freqPct}%, call ${callFreq}% vs ${vs}'s 3-bet. ${handDesc} — the solver mixes to keep its 4-bet and flatting ranges balanced.${stackContext}`;
                    }
                    return `${heroHand}: 4-bet ${freqPct}% vs ${vs}'s 3-bet. ${handDesc} at the boundary of the 4-bet range.${stackContext}`;
                }
                if (isCall) {
                    if (freq >= 0.95) {
                        if (isPair && v1 >= 8) return `${heroHand}: Flat the 3-bet with ${handDesc}. Set mining is very profitable in 3-bet pots — if you hit, villain's range is strong enough to pay off.${stackContext}`;
                        if (isBroadway && isSuited) return `${heroHand}: Call the 3-bet. ${handDesc} has enough equity and playability to continue in a 3-bet pot without bloating it further.${stackContext}`;
                        return `${heroHand}: Call vs ${vs}'s 3-bet. ${handDesc} is too good to fold but not strong enough to 4-bet — flatting to realize equity.${stackContext}`;
                    }
                    const fourBetFreq = validActions.filter(a2 => a2.startsWith('r')).map(a2 => handActions[a2] || 0).reduce((s, v) => s + v, 0);
                    if (fourBetFreq > 0.05) {
                        return `${heroHand}: Call ${freqPct}%, 4-bet ${(fourBetFreq * 100).toFixed(0)}% vs ${vs}'s 3-bet. Solver balances between defending flat and re-raising.${stackContext}`;
                    }
                    return `${heroHand}: Call ${freqPct}% vs ${vs}'s 3-bet. Borderline defend at the bottom of the flatting range.${stackContext}`;
                }
                if (isFold) {
                    if (freq >= 0.95) {
                        if (!isAx && !isKx) return `${heroHand}: Fold vs ${vs}'s 3-bet. ${handDesc} — not enough equity to continue, and no blockers to villain's premium range (AA/KK/AK).${stackContext}`;
                        return `${heroHand}: Fold vs ${vs}'s 3-bet. ${handDesc} — not enough equity to continue against a polarized 3-bet range. Pot odds don't justify calling.${stackContext}`;
                    }
                    const callFreq2 = handActions['call'] ? (handActions['call'] * 100).toFixed(0) : null;
                    if (callFreq2 && parseInt(callFreq2) > 5) {
                        return `${heroHand}: Fold ${freqPct}%, call ${callFreq2}% vs ${vs}'s 3-bet. The solver sometimes defends this hand but mostly folds facing aggression.${stackContext}`;
                    }
                    return `${heroHand}: Fold ${freqPct}% vs ${vs}'s 3-bet. ${handDesc} doesn't have enough equity or playability to continue.${stackContext}`;
                }
            } else {
                // ═══ FACING AN OPEN (3-bet, call, or fold) ═══
                if (isRaise) {
                    if (freq >= 0.95) {
                        if (isPremium) return `${heroHand}: Always 3-bet ${handDesc} vs ${vs}'s open. Too strong to just call — build the pot preflop.${stackContext}`;
                        if (isAx && isSuited) return `${heroHand}: Pure 3-bet vs ${vs}. ${handDesc} — premium 3-bet bluff because the A blocks AA/AK (removes ~16 combos), plus suitedness gives nut potential.${stackContext}`;
                        if (isKx && isSuited) return `${heroHand}: Pure 3-bet vs ${vs}. ${handDesc} — the K blocks KK and AK, reducing villain's continue range. Good 3-bet bluff with playability.${stackContext}`;
                        if (isBlind) return `${heroHand}: Pure 3-bet from the blinds vs ${vs}. ${handDesc} — 3-betting compensates for being out of position postflop.${stackContext}`;
                        return `${heroHand}: Pure 3-bet vs ${vs}'s open. Strong enough to re-raise for value and build the pot.${stackContext}`;
                    }
                    const callFreq = handActions['call'] ? (handActions['call'] * 100).toFixed(0) : null;
                    if (callFreq && parseInt(callFreq) > 5) {
                        return `${heroHand}: 3-bet ${freqPct}%, call ${callFreq}% vs ${vs}. ${handDesc} — the solver mixes between building the pot and keeping the range wide.${stackContext}`;
                    }
                    return `${heroHand}: 3-bet ${freqPct}% vs ${vs}. ${handDesc} at the boundary of the 3-bet range.${stackContext}`;
                }
                if (isCall) {
                    if (freq >= 0.95) {
                        if (isPair && v1 >= 8) return `${heroHand}: Call vs ${vs}. ${handDesc} has great set-mining equity and implied odds — 3-betting risks losing action.${stackContext}`;
                        if (isBroadway && isSuited) return `${heroHand}: Call vs ${vs}. ${handDesc} plays well postflop — good equity and playability without bloating the pot.${stackContext}`;
                        if (isConnected && isSuited) return `${heroHand}: Call vs ${vs}. ${handDesc} has strong implied odds — when it connects, it makes big hands.${stackContext}`;
                        if (isBlind) return `${heroHand}: Defend from the blind vs ${vs}. ${handDesc} has enough equity to defend at this price — closing the action with a discount.${stackContext}`;
                        return `${heroHand}: Call vs ${vs}. Good equity against the opening range — calling maintains position and pot control.${stackContext}`;
                    }
                    const threeBetFreq = validActions.filter(a2 => a2.startsWith('r')).map(a2 => handActions[a2] || 0).reduce((s, v) => s + v, 0);
                    if (threeBetFreq > 0.05) {
                        return `${heroHand}: Call ${freqPct}%, 3-bet ${(threeBetFreq * 100).toFixed(0)}% vs ${vs}. The solver polarizes — sometimes flatting, sometimes 3-betting for balance.${stackContext}`;
                    }
                    return `${heroHand}: Call ${freqPct}% vs ${vs}. Marginal call at the bottom of the defending range.${stackContext}`;
                }
                if (isFold) {
                    if (freq >= 0.95) {
                        if (isBlind) return `${heroHand}: Fold from the blind vs ${vs}'s open. ${handDesc} — even with the discount, you don't have enough equity to defend profitably.${stackContext}`;
                        return `${heroHand}: Fold vs ${vs}'s open. ${handDesc} lacks sufficient equity and playability to continue profitably.${stackContext}`;
                    }
                    const callFreq2 = handActions['call'] ? (handActions['call'] * 100).toFixed(0) : null;
                    if (callFreq2 && parseInt(callFreq2) > 5) {
                        return `${heroHand}: Fold ${freqPct}%, call ${callFreq2}% vs ${vs}. Borderline hand — sometimes the solver defends, but it's mostly a fold.${stackContext}`;
                    }
                    return `${heroHand}: Fold ${freqPct}% vs ${vs}. At the edge of the defending range.${stackContext}`;
                }
            }
        }

        // ═══ Phase 30: BB OPTION (check or raise vs limp) ═══
        if (nodeType === 'preflop_bb_option') {
            const vs = villainPosition || 'limper';
            if (isRaise) {
                if (freq >= 0.95) {
                    if (isPremium || isSuperPremium) return `${heroHand}: Always raise ${handDesc} vs a limper. Punish passive play and build the pot with a premium.`;
                    if (isAx && isSuited) return `${heroHand}: Pure raise vs ${vs}'s limp. ${handDesc} plays well as a value-iso — charge weaker hands to see a flop.`;
                    return `${heroHand}: Raise vs the limp. ${handDesc} is strong enough to iso-raise and take the initiative.`;
                }
                const checkFreq = (handActions['x'] || handActions['c'] || 0) * 100;
                if (checkFreq > 10) {
                    return `${heroHand}: Raise ${freqPct}%, check ${checkFreq.toFixed(0)}% from BB. ${handDesc} — sometimes iso-raising, sometimes trapping in the big blind.`;
                }
                return `${heroHand}: Raise ${freqPct}% from BB. ${handDesc} at the boundary of the iso-raise range.`;
            }
            // Checking the BB option
            if (freq >= 0.95) {
                if (handDesc.includes('air') || handDesc.includes('offsuit')) {
                    return `${heroHand}: Check from BB vs limp. ${handDesc} — see a free flop with a marginal hand.`;
                }
                return `${heroHand}: Check from BB. ${handDesc} prefers to see a flop in position rather than bloating the pot.`;
            }
            return `${heroHand}: Check ${freqPct}% from BB. ${handDesc} — mixed between trapping and raising.`;
        }

        // Fallback
        return `${heroHand} (${handDesc}): ${label} ${freqPct}% from ${posName}.`;
    }

    /**
     * Phase 101-105 integration: Append preflop context notes to any preflop explanation.
     * Gathers relevant preflop theory notes and appends the top 1-2 to the base explanation.
     */
    _appendPreflopContext(baseExplanation, heroHand, heroPosition, villainPosition, optimalAction, nodeType, potType) {
        const notes = [];
        try {
            // Phase 101: Open range context (for preflop_open)
            if (nodeType === 'preflop_open') {
                const openCtx = this._getOpenRangeContext(heroPosition, heroHand);
                if (openCtx) notes.push(openCtx);
            }
            // Phase 102: 3-bet range context (for facing raise)
            if (nodeType === 'preflop_facing_raise') {
                const threeBetCtx = this._get3BetRangeContext(heroHand, heroPosition, villainPosition);
                if (threeBetCtx) notes.push(threeBetCtx);
            }
            // Phase 103: Squeeze context
            const squeezeCtx = this._getSqueezeContext(heroHand, heroPosition, nodeType, potType);
            if (squeezeCtx) notes.push(squeezeCtx);
            // Phase 104: Blind defense context
            if (nodeType === 'preflop_facing_raise' || nodeType === 'preflop_bb_option') {
                const blindCtx = this._getBlindDefenseContext(heroPosition, optimalAction, heroHand, villainPosition);
                if (blindCtx) notes.push(blindCtx);
            }
            // Phase 105: Position EV context
            const posEVCtx = this._getPositionEVContext(heroPosition);
            if (posEVCtx) notes.push(posEVCtx);
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

        if (notes.length === 0) return baseExplanation;
        // Apply depth mode — pick top 1-2 notes
        const depth = this._getExplanationDepth ? this._getExplanationDepth('preflop', null, optimalAction, nodeType, null) : 'standard';
        const maxNotes = depth === 'verbose' ? 3 : depth === 'concise' ? 0 : 2;
        if (maxNotes === 0) return baseExplanation;
        const selected = notes.slice(0, maxNotes);
        return `${baseExplanation} ${selected.join(' ')}`;
    }

    /**
     * Phase 26: Position-specific opening context.
     */
    _positionOpenContext(position) {
        switch (position) {
            case 'UTG': return 'UTG opens ~12-15% of hands (pairs 22+, ATo+, ATs+, KQo, KJs+, suited connectors 78s+). Many players behind means tight range.';
            case 'UTG+1': return 'UTG+1 opens ~15-17% — slightly wider than UTG but still conservative with 5+ players behind.';
            case 'MP': return 'MP opens ~18-20% — adds hands like KJo, QJs, T9s, 67s to the range.';
            case 'MP+1': return 'MP+1 opens ~20-22% — wider than MP, starts including more suited connectors and one-gappers.';
            case 'HJ': return 'HJ opens ~22-26% — the range expands to include A8o+, K9s+, suited one-gappers, and more offsuit broadways.';
            case 'CO': return 'CO opens ~27-32% — wide range with only BTN and blinds behind. Includes most suited hands, A2o+, and weak broadways.';
            case 'BTN': return 'BTN opens ~40-50% — the widest RFI range. Nearly all suited hands, most offsuit broadways, all pairs. Guaranteed position postflop.';
            case 'SB': return 'SB opens ~35-45% into only the BB — wide range for stealing but plays OOP postflop. Include more hands but size up (3x+).';
            case 'BB': return 'BB checking option — you already have money invested and close the action.';
            default: return '';
        }
    }

    buildChartExplanation(heroHand, chart, pushFreq, correctAction) {
        const pct = (pushFreq * 100).toFixed(0);
        const pos = chart.hero_position || chart.position || 'BTN';
        const stack = chart.stack_depth || 15;

        // Hand type reasoning
        const r1 = heroHand[0], r2 = heroHand[1];
        const isPair = r1 === r2;
        const isSuited = heroHand.length >= 3 && heroHand[2] === 's';
        const isHighCard = ['A', 'K', 'Q'].includes(r1);

        if (correctAction === 'push') {
            let reason = '';
            if (isPair) reason = 'Pocket pairs have strong all-in equity against calling ranges.';
            else if (isHighCard && isSuited) reason = 'Suited broadway hands combine card removal, equity, and playability.';
            else if (isHighCard) reason = 'High card strength plus fold equity makes this a profitable shove.';
            else if (isSuited) reason = 'Suitedness adds ~3% equity, pushing this hand into shoving range.';
            else reason = 'Fold equity at this stack depth compensates for marginal hand strength.';

            if (stack <= 8) reason += ` At ${stack}BB, push-or-fold is optimal — no room for post-flop play.`;
            else if (stack <= 12) reason += ` At ${stack}BB, shoving preserves fold equity before the blinds eat further into your stack.`;

            return `ICM: ${heroHand} is a ${pct}% push from ${pos} at ${stack}BB. ${reason}`;
        }

        let foldReason = '';
        if (stack > 15) foldReason = `At ${stack}BB you have enough chips to wait for a better spot.`;
        else foldReason = `Even at ${stack}BB, this hand doesn't have enough equity against calling ranges to justify the risk.`;

        return `ICM: ${heroHand} is only a ${pct}% push from ${pos} at ${stack}BB. ${foldReason}`;
    }

    /**
     * Categorize hand strength relative to board (deterministic, no AI).
     * Phase 31: GTO Wizard-level precision — kicker quality, nut draw detection,
     * backdoor draws, board-relative strength labels.
     *
     * Detects: quads, full houses, flushes, straights, sets, trips, two pair,
     * overpairs, top pair (with kicker quality), second/bottom pair, underpairs,
     * nut/non-nut flush draws, OESD, gutshots, backdoor draws, overcards, air.
     */
    categorizeHand(heroHand, board) {
        if (!heroHand || heroHand.length < 2) return 'a hand';
        if (!board || board.length === 0) return 'a preflop hand';
        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);
        if (validBoard.length === 0) return 'a preflop hand';

        const r1 = heroHand[0].toUpperCase();
        const r2 = heroHand[1].toUpperCase();
        const isSuited = heroHand.length >= 3 && heroHand[2] === 's';
        const isPair = r1 === r2;
        const boardRanks = validBoard.map(c => c[0].toUpperCase());
        const boardSuits = validBoard.map(c => c[1]?.toLowerCase());

        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const RANK_DISPLAY = { 0:'2', 1:'3', 2:'4', 3:'5', 4:'6', 5:'7', 6:'8', 7:'9', 8:'T', 9:'J', 10:'Q', 11:'K', 12:'A' };
        const v1 = rankVal(r1);
        const v2 = rankVal(r2);
        const heroHigh = Math.max(v1, v2);
        const heroLow = Math.min(v1, v2);
        const boardVals = boardRanks.map(r => rankVal(r));
        const highestBoardVal = Math.max(...boardVals);
        const secondHighestBoardVal = [...boardVals].sort((a, b) => b - a)[1] ?? -1;
        const sortedBoardVals = [...boardVals].sort((a, b) => a - b);

        // ═══ FLUSH / FLUSH DRAW DETECTION ═══
        let hasFlushDraw = false;
        let hasFlush = false;
        let isNutFlushDraw = false;
        let hasBackdoorFlush = false;

        if (isSuited) {
            const suitCounts = {};
            boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
            const maxBoardSuit = Object.entries(suitCounts || {}).sort((a, b) => b[1] - a[1])[0];
            if (maxBoardSuit) {
                if (maxBoardSuit[1] >= 3) hasFlush = true;
                else if (maxBoardSuit[1] >= 2) hasFlushDraw = true;
                else if (maxBoardSuit[1] === 1 && validBoard.length === 3) hasBackdoorFlush = true;
            }
            // Nut flush draw: hero has the ace of the flush suit
            if (hasFlushDraw && (r1 === 'A' || r2 === 'A')) {
                isNutFlushDraw = true;
            }
        }

        // ═══ STRAIGHT DRAW DETECTION ═══
        const allValsSet = new Set([v1, v2, ...boardVals]);
        let straightOuts = 0;
        let hasMadeStraight = false;
        let isNutStraight = false;
        let hasOESD = false;
        let hasGutshot = false;
        let hasBackdoorStraight = false;

        // Check standard windows — track missing cards for double gutshot detection
        let bestStraightTop = -1;
        const straightMissingCards = []; // Track which cards complete each 4-of-5 window
        for (let start = 0; start <= 8; start++) {
            const window = [start, start + 1, start + 2, start + 3, start + 4];
            const have = window.filter(v => allValsSet.has(v)).length;
            const heroContributes = window.includes(v1) || window.includes(v2);
            if (have === 5 && heroContributes) {
                hasMadeStraight = true;
                if (start + 4 > bestStraightTop) bestStraightTop = start + 4;
            } else if (have === 4 && heroContributes) {
                straightOuts++;
                const missing = window.find(v => !allValsSet.has(v));
                if (missing !== undefined) straightMissingCards.push(missing);
            } else if (have === 3 && heroContributes && validBoard.length === 3 && !hasMadeStraight) {
                hasBackdoorStraight = true;
            }
        }

        // Wheel check
        const wheelRanks = [12, 0, 1, 2, 3];
        const wheelHave = wheelRanks.filter(v => allValsSet.has(v)).length;
        const wheelHeroContributes = wheelRanks.includes(v1) || wheelRanks.includes(v2);
        if (wheelHave === 5 && wheelHeroContributes) {
            hasMadeStraight = true;
            if (3 > bestStraightTop) bestStraightTop = 3; // 5-high straight
        } else if (wheelHave === 4 && wheelHeroContributes && !hasMadeStraight) {
            straightOuts++;
            const missing = wheelRanks.find(v => !allValsSet.has(v));
            if (missing !== undefined) straightMissingCards.push(missing);
        }

        // Double gutshot: 2+ straight windows but needing DIFFERENT cards (8 outs like OESD)
        let hasDoubleGutshot = false;
        if (!hasMadeStraight) {
            const uniqueMissing = new Set(straightMissingCards);
            if (straightOuts >= 2 && uniqueMissing.size >= 2) {
                // Two different cards complete straights = double gutshot or OESD
                // True OESD = consecutive cards needed; double gutshot = non-adjacent
                const sortedMissing = [...uniqueMissing].sort((a, b) => a - b);
                const isConsecutive = sortedMissing.length === 2 && Math.abs(sortedMissing[0] - sortedMissing[1]) === 1;
                if (!isConsecutive && uniqueMissing.size >= 2) {
                    hasDoubleGutshot = true;
                    hasOESD = false; // Double gutshot, not OESD
                } else {
                    hasOESD = true;
                }
            } else if (straightOuts >= 2) {
                hasOESD = true;
            } else if (straightOuts === 1) {
                hasGutshot = true;
            }
        }

        // Check if it's the nut straight (highest possible straight using the board)
        if (hasMadeStraight && bestStraightTop === 12) isNutStraight = true;

        // ═══ MADE HAND CLASSIFICATION ═══
        let madeHand = '';
        const r1BoardCount = boardRanks.filter(r => r === r1).length;
        const r2BoardCount = boardRanks.filter(r => r === r2).length;
        const boardRankCounts = {};
        boardRanks.forEach(r => { boardRankCounts[r] = (boardRankCounts[r] || 0) + 1; });

        // Phase 74: Board-paired flush vulnerability
        const boardPaired = Object.values(boardRankCounts || {}).some(c => c >= 2);

        // Flush first (beats straight in display priority for made hands)
        if (hasFlush) {
            // Check if it's the nut flush
            if (r1 === 'A' || r2 === 'A') {
                madeHand = boardPaired ? 'the nut flush (board paired — full house possible)' : 'the nut flush';
            } else if (heroHigh >= 11) {
                madeHand = boardPaired ? 'a strong flush (board paired — vulnerable)' : 'a strong flush';
            } else {
                madeHand = boardPaired ? 'a weak flush (board paired — vulnerable)' : 'a flush';
            }
        }
        // Straight — Phase 74: quality tiers
        else if (hasMadeStraight) {
            if (isNutStraight) {
                madeHand = boardPaired ? 'the nut straight (board paired — full house beats you)' : 'the nut straight';
            } else if (bestStraightTop <= 5) {
                madeHand = 'a baby straight (vulnerable to higher straights)';
            } else if (heroLow === Math.min(...boardVals) || heroHigh === Math.min(...boardVals)) {
                madeHand = 'the bottom-end straight (higher straights possible)';
            } else {
                madeHand = boardPaired ? 'a straight (board paired — full house beats you)' : 'a straight';
            }
        }
        // Pair-based hands
        else if (isPair) {
            if (boardRanks.includes(r1)) {
                if (r1BoardCount >= 2) madeHand = 'quads';
                else {
                    const boardHasOtherPair = Object.entries(boardRankCounts || {})
                        .some(([r, c]) => r !== r1 && c >= 2);
                    madeHand = boardHasOtherPair ? 'a full house' : 'a set';
                }
            } else {
                const boardHasTrips = Object.values(boardRankCounts || {}).some(c => c >= 3);
                if (boardHasTrips) {
                    madeHand = 'a full house';
                } else if (v1 > highestBoardVal) {
                    // Overpair quality
                    if (v1 >= 12) madeHand = 'aces (overpair)';
                    else if (v1 >= 11) madeHand = 'kings (overpair)';
                    else madeHand = 'an overpair';
                } else if (v1 >= highestBoardVal - 1) {
                    madeHand = 'second pair (pocket)';
                } else {
                    madeHand = 'an underpair';
                }
            }
        } else {
            // Non-pair hands
            const r1OnBoard = r1BoardCount > 0;
            const r2OnBoard = r2BoardCount > 0;

            if (r1OnBoard && r2OnBoard && (r1BoardCount >= 2 || r2BoardCount >= 2)) {
                madeHand = 'a full house';
            } else if (r1OnBoard && r1BoardCount >= 2) {
                madeHand = v2 >= 12 ? 'trips, top kicker' : 'trips';
            } else if (r2OnBoard && r2BoardCount >= 2) {
                madeHand = v1 >= 12 ? 'trips, top kicker' : 'trips';
            } else if (r1OnBoard && r2OnBoard) {
                // Two pair — specify which
                if (v1 === highestBoardVal || v2 === highestBoardVal) {
                    madeHand = 'top two pair';
                } else {
                    madeHand = 'two pair';
                }
            } else if (r1OnBoard) {
                // r1 hit the board — kicker is r2
                if (v1 === highestBoardVal) {
                    // Top pair — kicker quality matters
                    if (v2 >= 12) madeHand = 'top pair, top kicker';
                    else if (v2 >= 10) madeHand = 'top pair, strong kicker';
                    else if (v2 >= 7) madeHand = 'top pair, medium kicker';
                    else madeHand = 'top pair, weak kicker';
                } else if (v1 === secondHighestBoardVal) {
                    madeHand = v2 >= 12 ? 'second pair, top kicker' : 'second pair';
                } else {
                    madeHand = 'bottom pair';
                }
            } else if (r2OnBoard) {
                // r2 hit the board — kicker is r1
                if (v2 === highestBoardVal) {
                    if (v1 >= 12) madeHand = 'top pair, top kicker';
                    else if (v1 >= 10) madeHand = 'top pair, strong kicker';
                    else if (v1 >= 7) madeHand = 'top pair, medium kicker';
                    else madeHand = 'top pair, weak kicker';
                } else if (v2 === secondHighestBoardVal) {
                    madeHand = v1 >= 12 ? 'second pair, top kicker' : 'second pair';
                } else {
                    madeHand = 'bottom pair';
                }
            }
        }

        // ═══ FULL HOUSE DRAW DETECTION ═══
        let hasFHDraw = false;
        let fhDrawType = '';
        if (!hasFlush && !hasMadeStraight) {
            // Set with no full house yet → board pairing gives FH
            if (madeHand === 'a set' && validBoard.length >= 3) {
                hasFHDraw = true;
                fhDrawType = 'full house redraw';
            }
            // Two pair → any of our paired ranks gives FH
            if (madeHand && madeHand.includes('two pair') && validBoard.length >= 3) {
                hasFHDraw = true;
                fhDrawType = 'full house draw';
            }
            // Trips on board + our pair = already FH (handled above), but trips + unpaired hero card → FH draw
            if (madeHand === 'trips' || madeHand === 'trips, top kicker') {
                hasFHDraw = true;
                fhDrawType = 'full house draw';
            }
        }

        // ═══ COMBINE: Made hand + draw equity ═══
        const draws = [];
        if (hasFlush) {
            // Already classified as flush in madeHand — skip flush draw
        } else if (isNutFlushDraw) {
            draws.push('nut flush draw');
        } else if (hasFlushDraw) {
            // Phase 74: Flush draw quality tiers
            if (heroHigh >= 11) draws.push('strong flush draw (K-high)');
            else if (heroHigh >= 8) draws.push('flush draw');
            else draws.push('weak flush draw');
        }

        if (hasMadeStraight) {
            // Already classified
        } else if (hasDoubleGutshot) {
            draws.push('double gutshot (8 outs)');
        } else if (hasOESD) {
            // Phase 74: OESD quality — nut OESD vs non-nut
            // Nut OESD: completing the straight gives the highest possible straight
            const maxMissing = straightMissingCards.length > 0 ? Math.max(...straightMissingCards) : 0;
            const completesNuts = maxMissing >= 10; // completing with T+ gives strong straights
            if (completesNuts) draws.push('nut OESD');
            else draws.push('OESD');
        } else if (hasGutshot) {
            // Phase 74: Gutshot quality — top-end vs bottom-end
            if (straightMissingCards.length > 0) {
                const missingCard = straightMissingCards[0];
                const wouldBeTopEnd = missingCard > highestBoardVal;
                if (wouldBeTopEnd) draws.push('gutshot (top-end)');
                else if (missingCard <= sortedBoardVals[0]) draws.push('gutshot (bottom-end)');
                else draws.push('gutshot');
            } else {
                draws.push('gutshot');
            }
        }

        // Add FH draw for made hands with redraw equity
        if (hasFHDraw && madeHand) {
            draws.push(fhDrawType);
        }

        // Backdoor draws on flop — now shown with made hands too for playability context
        const bdDraws = [];
        if (validBoard.length === 3) {
            if (hasBackdoorFlush) bdDraws.push('backdoor flush');
            if (hasBackdoorStraight) bdDraws.push('backdoor straight');
        }

        // Overcard context for draws (OESD + two overcards = 14+ outs)
        const hasTwoOvers = heroHigh > highestBoardVal && heroLow > highestBoardVal;
        const hasOneOver = !hasTwoOvers && heroHigh > highestBoardVal;

        if (!madeHand && draws.length === 0 && bdDraws.length > 0) {
            // Pure backdoor equity — show with overcard context
            if (hasTwoOvers) return `two overcards + ${bdDraws.join(' + ')}`;
            if (hasOneOver) return `one overcard + ${bdDraws.join(' + ')}`;
            return bdDraws.join(' + ');
        }

        if (madeHand && draws.length > 0) {
            // Made hand + draws — add backdoor context on flop if present
            const allDraws = [...draws, ...bdDraws];
            return `${madeHand} + ${allDraws.join(' + ')}`;
        }
        if (madeHand) {
            // Made hand with only backdoor equity
            if (bdDraws.length > 0) return `${madeHand} + ${bdDraws.join(' + ')}`;
            return madeHand;
        }
        if (draws.length > 0) {
            // Draw-only hands — add overcard context and tier the combo draw label
            const overStr = hasTwoOvers ? ' + two overcards' : (hasOneOver ? ' + overcard' : '');
            const allDraws = [...draws, ...bdDraws];
            if (allDraws.length >= 2 || (allDraws.length === 1 && overStr)) {
                // Estimate outs for monster draw label
                let estOuts = 0;
                if (draws.some(d => d.includes('flush draw'))) estOuts += 9;
                if (draws.some(d => d === 'OESD' || d.includes('double gutshot'))) estOuts += 8;
                else if (draws.some(d => d === 'gutshot')) estOuts += 4;
                if (hasTwoOvers) estOuts += 6;
                else if (hasOneOver) estOuts += 3;

                if (estOuts >= 15) return `monster draw (${allDraws.join(' + ')}${overStr})`;
                if (allDraws.length >= 2) return `combo draw (${allDraws.join(' + ')}${overStr})`;
                return `${allDraws[0]}${overStr}`;
            }
            return allDraws[0];
        }

        // No made hand, no draw
        if (hasTwoOvers) return 'two overcards';
        if (hasOneOver) return 'one overcard';
        return heroHigh >= 9 ? 'high cards, no pair' : 'air';
    }

    /**
     * Phase 75: Adaptive difficulty — tracks session performance to adjust question difficulty.
     * Called during batch generation when difficulty='adaptive'.
     * Uses a simple sliding window of recent accuracy to decide difficulty tier.
     */
    _getAdaptiveDifficulty(questionsAnswered) {
        // Use session tracking data if available
        const stats = this._sessionStats || { correct: 0, total: 0, recentWindow: [] };
        this._sessionStats = stats;

        if (stats.total < 5) return 'standard'; // Not enough data yet

        // Calculate recent accuracy (last 10 questions)
        const recent = stats.recentWindow.slice(-10);
        const recentAcc = recent.length > 0 ? recent.filter(Boolean).length / recent.length : 0.5;
        const overallAcc = stats.total > 0 ? stats.correct / stats.total : 0.5;

        // Adaptive thresholds
        if (recentAcc >= 0.85) return 'expert';     // Crushing it — give harder spots
        if (recentAcc <= 0.35) return 'beginner';   // Struggling — ease up
        return 'standard';                            // In the zone — standard mix
    }

    /**
     * Phase 75: Update session stats after a question is answered.
     * Called externally by the training arena.
     */
    updateSessionDifficulty(isCorrect) {
        if (!this._sessionStats) {
            this._sessionStats = { correct: 0, total: 0, recentWindow: [] };
        }
        this._sessionStats.total++;
        if (isCorrect) this._sessionStats.correct++;
        this._sessionStats.recentWindow.push(isCorrect);
        // Keep window at max 20 entries
        if (this._sessionStats.recentWindow.length > 20) {
            this._sessionStats.recentWindow.shift();
        }
    }

    resetSessionDifficulty() {
        this._sessionStats = { correct: 0, total: 0, recentWindow: [] };
    }

    getStreetForLevel(level) {
        // All levels get all streets — no content gating by level
        // The solver pool contains flop, turn, and river spots for all levels
        return null; // null = all streets
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 76: DYNAMIC EXPLANATION DEPTH — MISTAKE-HISTORY-AWARE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 76: Record a mistake pattern for explanation depth tracking.
     * Called externally after each answered question with spot metadata.
     *
     * Tracks mistakes by 5 dimensions:
     *   - street (flop/turn/river)
     *   - handCategory (top pair, flush draw, air, etc.)
     *   - actionType (bet/check/fold/raise/call)
     *   - spotType (facing_cbet, 3bet_defense, etc.)
     *   - nodeType (hero_bets_or_checks, hero_faces_bet, hero_faces_raise)
     *
     * @param {Object} params
     * @param {boolean} params.isCorrect - Whether the answer was correct
     * @param {string} params.street - flop/turn/river
     * @param {string} params.handCategory - categorizeHand() output
     * @param {string} params.correctAction - The GTO correct action
     * @param {string} params.chosenAction - The player's chosen action
     * @param {string} params.spotType - Spot type from deriveSpotType
     * @param {string} params.nodeType - hero_bets_or_checks / hero_faces_bet / hero_faces_raise
     * @param {string} params.classification - BEST/CORRECT/INACCURACY/WRONG/BLUNDER
     */
    recordMistakePattern({ isCorrect, street, handCategory, correctAction, chosenAction, spotType, nodeType, classification }) {
        if (!this._mistakeTracker) {
            this._mistakeTracker = {};
        }

        // Normalize hand category into a bucket for tracking
        const handBucket = this._getHandBucket(handCategory);
        // Normalize action into a bucket
        const actionBucket = this._getActionBucket(correctAction);

        // Track along each dimension
        const dimensions = [
            `street:${street || 'unknown'}`,
            `hand:${handBucket}`,
            `action:${actionBucket}`,
            `spot:${spotType || 'general'}`,
            `node:${nodeType || 'unknown'}`,
            // Compound keys for fine-grained tracking
            `${street || 'unknown'}:${handBucket}`,
            `${street || 'unknown'}:${actionBucket}`,
            `${handBucket}:${actionBucket}`,
        ];

        const isMistake = ['INACCURACY', 'WRONG', 'BLUNDER'].includes(classification);

        for (const dim of dimensions) {
            if (!this._mistakeTracker[dim]) {
                this._mistakeTracker[dim] = { total: 0, mistakes: 0 };
            }
            this._mistakeTracker[dim].total++;
            if (isMistake) {
                this._mistakeTracker[dim].mistakes++;
            }
        }
    }

    /**
     * Phase 76: Normalize hand category into a tracking bucket.
     * Groups similar hand strengths together for meaningful sample sizes.
     */
    _getHandBucket(handCategory) {
        if (!handCategory) return 'unknown';
        const hc = handCategory.toLowerCase();

        // Made hands
        if (hc.includes('full house') || hc.includes('quads') || hc.includes('straight flush')) return 'nuts';
        if (hc.includes('flush') && !hc.includes('draw')) return 'flush';
        if (hc.includes('straight') && !hc.includes('draw')) return 'straight';
        if (hc.includes('trips') || hc.includes('three of a kind') || hc.includes('set')) return 'trips_set';
        if (hc.includes('two pair')) return 'two_pair';
        if (hc.includes('overpair')) return 'overpair';
        if (hc.includes('top pair')) return 'top_pair';
        if (hc.includes('middle pair') || hc.includes('second pair')) return 'middle_pair';
        if (hc.includes('bottom pair') || hc.includes('low pair') || hc.includes('weak pair')) return 'bottom_pair';

        // Draws
        if (hc.includes('combo draw') || hc.includes('monster draw')) return 'combo_draw';
        if (hc.includes('flush draw')) return 'flush_draw';
        if (hc.includes('oesd') || hc.includes('open-ended') || hc.includes('straight draw')) return 'straight_draw';
        if (hc.includes('gutshot')) return 'gutshot';

        // Weak / air
        if (hc.includes('overcard')) return 'overcards';
        if (hc.includes('air') || hc.includes('no pair')) return 'air';

        return 'other';
    }

    /**
     * Phase 76: Normalize action into a tracking bucket.
     */
    _getActionBucket(action) {
        if (!action) return 'unknown';
        const a = action.toLowerCase();
        if (a === 'f') return 'fold';
        if (a === 'c' || a === 'x') return 'check';
        if (a === 'call') return 'call';
        if (a.startsWith('b')) return 'bet';
        if (a.startsWith('r')) return 'raise';
        if (a === 'allin') return 'allin';
        return 'other';
    }

    /**
     * Phase 76: Determine explanation depth for the current spot.
     * Returns 'verbose' | 'standard' | 'concise' based on the player's
     * mistake history in spots similar to this one.
     *
     * Logic:
     *   - If player has ≥3 samples in this spot type and mistake rate ≥50%: verbose
     *   - If player has ≥5 samples and mistake rate ≤15%: concise (they've mastered it)
     *   - Otherwise: standard
     *
     * Checks multiple dimensions and picks the most informative signal.
     */
    _getExplanationDepth(street, handCategory, correctAction, nodeType, spotType) {
        if (!this._mistakeTracker) return 'standard';

        const handBucket = this._getHandBucket(handCategory);
        const actionBucket = this._getActionBucket(correctAction);

        // Check compound keys first (more specific), then single dimensions
        const keysToCheck = [
            `${street || 'unknown'}:${handBucket}`,        // e.g., "river:flush_draw"
            `${street || 'unknown'}:${actionBucket}`,      // e.g., "turn:fold"
            `${handBucket}:${actionBucket}`,               // e.g., "top_pair:bet"
            `street:${street || 'unknown'}`,
            `hand:${handBucket}`,
            `action:${actionBucket}`,
            `node:${nodeType || 'unknown'}`,
            `spot:${spotType || 'general'}`,
        ];

        let bestSignal = null;
        let bestSampleSize = 0;

        for (const key of keysToCheck) {
            const tracker = this._mistakeTracker[key];
            if (!tracker || tracker.total < 3) continue;

            const mistakeRate = tracker.mistakes / tracker.total;
            // Prefer compound keys (listed first) and larger sample sizes
            if (tracker.total > bestSampleSize) {
                bestSampleSize = tracker.total;
                bestSignal = { mistakeRate, total: tracker.total, key };
            }
        }

        if (!bestSignal) return 'standard';

        // High mistake rate → verbose explanations to help the player learn
        if (bestSignal.mistakeRate >= 0.50 && bestSignal.total >= 3) return 'verbose';
        // Very high mistake rate with large sample → definitely verbose
        if (bestSignal.mistakeRate >= 0.40 && bestSignal.total >= 6) return 'verbose';
        // Low mistake rate with good sample → concise (player has mastered this)
        if (bestSignal.mistakeRate <= 0.15 && bestSignal.total >= 5) return 'concise';

        return 'standard';
    }

    /**
     * Phase 76: Get a depth-aware coaching preamble for weak spots.
     * When verbose, adds a targeted coaching tip based on the specific weakness.
     */
    _getDepthCoachingNote(depth, street, handCategory, correctAction) {
        if (depth !== 'verbose') return '';

        const handBucket = this._getHandBucket(handCategory);
        const actionBucket = this._getActionBucket(correctAction);

        // Street + action coaching tips
        if (street === 'river' && actionBucket === 'fold') {
            return '▲ You tend to over-fold rivers — remember that bluff-catchers need to call enough to keep villain honest.';
        }
        if (street === 'river' && actionBucket === 'bet') {
            return '▲ River betting is a common leak area for you — focus on whether your hand is polarized (value or bluff) vs. a check-back.';
        }
        if (street === 'turn' && actionBucket === 'check') {
            return '▲ Turn checking decisions have been tricky — consider whether you\'re pot-controlling with medium strength or giving up too cheaply.';
        }
        if (street === 'flop' && actionBucket === 'bet') {
            return '▲ Flop bet sizing has been a pattern — focus on whether the board favors range bets (small) or polarized bets (large).';
        }

        // Hand category coaching tips
        if (handBucket === 'flush_draw' || handBucket === 'straight_draw') {
            return '▲ Draw decisions are a leak area — evaluate pot odds, implied odds, and whether you have fold equity with a semi-bluff.';
        }
        if (handBucket === 'top_pair' || handBucket === 'overpair') {
            return '▲ Playing strong-but-vulnerable hands is tricky for you — think about protection vs. pot control based on board texture.';
        }
        if (handBucket === 'air' || handBucket === 'overcards') {
            return '▲ Bluffing spots have been challenging — look for hands with blockers and backdoor equity rather than pure air.';
        }
        if (handBucket === 'middle_pair' || handBucket === 'bottom_pair') {
            return '▲ Medium-strength hand decisions are a weak spot — these are often check-call candidates, not bets.';
        }

        return '▲ This is a spot type where you\'ve been making frequent mistakes — pay close attention to the reasoning below.';
    }

    /**
     * Phase 76: Reset mistake tracker (e.g., on new session).
     */
    resetMistakeTracker() {
        this._mistakeTracker = {};
    }

    /**
     * Phase 76: Get current mistake tracker data for UI consumption.
     */
    getMistakeTrackerData() {
        if (!this._mistakeTracker) return {};
        const result = {};
        for (const [key, val] of Object.entries(this._mistakeTracker || {})) {
            if (val.total >= 2) {
                result[key] = {
                    ...val,
                    mistakeRate: Math.round((val.mistakes / val.total) * 100),
                };
            }
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 77: BOARD RUNOUT IMPACT PREDICTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 77: Predict which turn/river cards would significantly change the situation.
     * Identifies key cards that:
     *   - Complete draws (flush, straight)
     *   - Pair the board (reducing flush/straight value, enabling full houses)
     *   - Bring overcards that shift range advantage
     *   - Are blanks that change nothing
     *
     * @param {string[]} board - Current board cards
     * @param {string} heroHand - Hero's hand notation (e.g., "AKs")
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street (flop/turn)
     * @param {Object} texture - _analyzeTexture() output
     * @returns {string} Runout impact note for explanation
     */
    _getRunoutImpact(board, heroHand, handStrength, street, texture) {
        // Only relevant on flop and turn (river has no runout)
        if (!board || board.length < 3 || street === 'river' || street === 'preflop') return '';
        if (!heroHand || heroHand.length < 2) return '';

        const boardRanks = board.map(c => c[0].toUpperCase());
        const boardSuits = board.map(c => c[1]?.toLowerCase());
        const boardVals = boardRanks.map(r => '23456789TJQKA'.indexOf(r));
        const heroR1 = heroHand[0].toUpperCase();
        const heroR2 = heroHand[1].toUpperCase();
        const heroV1 = '23456789TJQKA'.indexOf(heroR1);
        const heroV2 = '23456789TJQKA'.indexOf(heroR2);
        const isSuited = heroHand.length >= 3 && heroHand[2] === 's';
        const hc = handStrength.toLowerCase();

        const scaryCards = [];
        const goodCards = [];
        const blanks = [];

        // ─── FLUSH COMPLETING CARDS ───
        const suitCounts = {};
        boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const flushDrawSuit = Object.entries(suitCounts || {}).find(([_, c]) => c === 2)?.[0];
        const threeFlushSuit = Object.entries(suitCounts || {}).find(([_, c]) => c >= 3)?.[0];

        if (flushDrawSuit && !threeFlushSuit) {
            // Two-flush on board — a third of that suit completes flush draws
            const heroHasFlushDraw = isSuited && (hc.includes('flush draw'));
            if (heroHasFlushDraw) {
                goodCards.push(`a ${flushDrawSuit === 'h' ? '♥' : flushDrawSuit === 'd' ? '♦' : flushDrawSuit === 'c' ? '♣' : '♠'} completes your flush draw`);
            } else if (!hc.includes('flush')) {
                scaryCards.push('third flush card');
            }
        }
        if (threeFlushSuit && street === 'turn') {
            // Three-flush already — fourth completes backdoor or makes board 4-flush
            if (!hc.includes('flush')) {
                scaryCards.push('fourth flush card (4-flush board)');
            }
        }

        // ─── STRAIGHT COMPLETING CARDS ───
        const sortedUnique = [...new Set(boardVals)].sort((a, b) => a - b);
        if (texture.connectedness === 'high' || texture.straightDrawHeavy) {
            if (hc.includes('straight draw') || hc.includes('oesd') || hc.includes('gutshot')) {
                goodCards.push('straight-completing card');
            } else if (!hc.includes('straight') || hc.includes('bottom-end')) {
                scaryCards.push('straight-completing card');
            }
        }

        // ─── BOARD PAIRING CARDS ───
        if (!texture.paired) {
            // An unpatched board pairing helps sets/two-pair and hurts flushes/straights
            if (hc.includes('set') || hc.includes('trips') || hc.includes('two pair')) {
                goodCards.push('board pairs (full house potential)');
            } else if (hc.includes('flush') || hc.includes('straight')) {
                scaryCards.push('board pairs (full house beats you)');
            }
        }

        // ─── OVERCARD ARRIVALS ───
        const highestBoard = Math.max(...boardVals);
        if (hc.includes('top pair') || hc.includes('overpair')) {
            // Cards above the current board could create overcards that shift equity
            if (highestBoard < 12) { // Not ace-high board
                const overcardRanks = [];
                if (highestBoard < 12) overcardRanks.push('A');
                if (highestBoard < 11) overcardRanks.push('K');
                if (overcardRanks.length > 0 && !boardRanks.includes('A') && !boardRanks.includes('K')) {
                    // Only scary if we don't hold these overcards
                    const heroHoldsOvercard = heroV1 >= highestBoard + 1 || heroV2 >= highestBoard + 1;
                    if (!heroHoldsOvercard) {
                        scaryCards.push(`overcard (${overcardRanks.join('/')}) shifts range advantage`);
                    }
                }
            }
        }

        // ─── HERO'S DRAW COMPLETION ───
        if (hc.includes('overcards') || hc.includes('overcard')) {
            // Hero would love to hit a pair
            const heroRanks = [heroR1, heroR2].filter(r => !boardRanks.includes(r));
            if (heroRanks.length > 0) {
                goodCards.push(`hitting ${heroRanks.join('/')} gives you top pair`);
            }
        }

        // ─── BLANKS ───
        // Low cards that don't complete any draws are blanks
        if (sortedUnique[0] >= 4 && !texture.wheelDraw) {
            blanks.push('low cards (2-4) are blanks');
        }

        // Build the runout note
        if (scaryCards.length === 0 && goodCards.length === 0) return '';

        const parts = [];
        if (street === 'flop') {
            parts.push('Turn cards to watch:');
        } else {
            parts.push('River cards to watch:');
        }

        if (goodCards.length > 0) {
            parts.push(`Good for you: ${goodCards.slice(0, 2).join('; ')}.`);
        }
        if (scaryCards.length > 0) {
            parts.push(`Scary: ${scaryCards.slice(0, 2).join('; ')}.`);
        }
        if (blanks.length > 0 && goodCards.length + scaryCards.length < 3) {
            parts.push(blanks[0] + '.');
        }

        return parts.join(' ');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 78: EQUITY REALIZATION CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 78: Explain equity realization — why position, hand type, and stack depth
     * affect how much of your raw equity you can actually capture.
     *
     * Key concepts:
     *   - IP (in position) realizes more equity than OOP (out of position)
     *   - Nutted hands realize close to 100% regardless of position
     *   - Draws with poor position realize less (can't control pot, face tough decisions)
     *   - Short stacks reduce the equity realization gap (less postflop play)
     *   - Dominated hands (e.g., KJo vs AK) realize poorly even with decent raw equity
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {string} heroPosition - Hero's position
     * @param {string} villainPosition - Villain's position
     * @param {number} stackDepth - Stack depth in BB
     * @param {Object} texture - Board texture
     * @returns {string} Equity realization context note
     */
    _getEquityRealizationNote(optimalAction, handStrength, street, heroPosition, villainPosition, stackDepth, texture) {
        if (!handStrength || street === 'preflop') return '';

        const hc = handStrength.toLowerCase();
        const a = (optimalAction || '').toLowerCase();
        const isIP = this._isInPosition(heroPosition, villainPosition);
        const spr = stackDepth && stackDepth > 0 ? stackDepth / (POT_BY_STREET[street] || 6) : 10;

        // Short stack SPR — equity realization matters less
        if (spr < 2) return '';

        const notes = [];

        // ─── POSITION-BASED EQUITY REALIZATION ───
        if (isIP) {
            // IP advantages
            if (hc.includes('draw') || hc.includes('gutshot') || hc.includes('oesd')) {
                notes.push('Being IP lets you control pot size with draws — you can take free cards when checked to or bet when equity is high.');
            } else if (hc.includes('middle pair') || hc.includes('bottom pair') || hc.includes('weak pair')) {
                notes.push('IP with medium-strength hands lets you pot-control effectively — check back to realize equity cheaply.');
            }
        } else {
            // OOP disadvantages
            if (hc.includes('draw') || hc.includes('gutshot') || hc.includes('oesd')) {
                if (a === 'c' || a === 'x') {
                    notes.push('OOP draws realize less equity — you can\'t take free cards, and villain\'s IP bet will force tough fold-or-call decisions.');
                } else if (a.startsWith('b') || a.startsWith('r')) {
                    notes.push('Semi-bluffing OOP with draws is important because you can\'t rely on free cards — building the pot with equity gives you fold equity now.');
                }
            } else if (hc.includes('top pair') && !hc.includes('top kicker')) {
                if (a === 'c' || a === 'x') {
                    notes.push('OOP top pair without a great kicker struggles to realize full equity — villain can put you in tough spots with raises and barrels.');
                }
            } else if (hc.includes('middle pair') || hc.includes('bottom pair')) {
                notes.push('Medium-strength hands OOP realize equity poorly — you face difficult decisions on every street without position.');
            }
        }

        // ─── HAND TYPE EQUITY REALIZATION ───
        if (hc.includes('nut') || hc.includes('full house') || hc.includes('quads') || hc.includes('set')) {
            // Nutted hands realize well regardless
            if (notes.length === 0 && spr > 4) {
                notes.push('Strong made hands realize close to 100% of their equity — focus on maximizing value across streets.');
            }
        }

        // ─── DOMINATION EFFECTS ───
        if (hc.includes('air') || hc.includes('no pair')) {
            if (!isIP && (a === 'c' || a === 'x')) {
                notes.push('With no made hand or draw, your equity realization is near zero — without fold equity or draw equity, checking and giving up is often correct.');
            }
        }

        // ─── STACK DEPTH EFFECTS ───
        if (spr > 8 && !isIP && (hc.includes('pair') || hc.includes('draw'))) {
            if (notes.length > 0) {
                notes.push(`Deep stacks (SPR ${spr.toFixed(0)}) amplify the positional disadvantage — more streets of play means more decisions OOP.`);
            }
        } else if (spr >= 2 && spr <= 4 && notes.length > 0) {
            notes.push(`Shorter effective stacks (SPR ${spr.toFixed(0)}) reduce the equity realization gap — fewer remaining decisions.`);
        }

        // ─── WET BOARD EQUITY REALIZATION ───
        if (texture && texture.wet && !isIP && hc.includes('pair') && !hc.includes('two pair') && !hc.includes('overpair')) {
            if (notes.length === 0) {
                notes.push('On wet boards OOP, one-pair hands struggle to realize equity — many turn and river cards can complete villain\'s draws.');
            }
        }

        if (notes.length === 0) return '';
        return 'Equity realization: ' + notes.slice(0, 2).join(' ');
    }

    /**
     * Phase 78: Determine if hero is in position relative to villain.
     * Same table as heroActsFirstPostflop() — see src/engines/positionOrder.js.
     */
    _isInPosition(heroPos, villainPos) {
        return heroIsInPosition(heroPos, villainPos);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 79: POSITION-AWARE STRATEGY ADJUSTMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 79: Explain how position shapes the optimal strategy for this spot.
     * Goes beyond Phase 78's equity realization to cover:
     *   - IP c-bet frequency and sizing tendencies
     *   - OOP check-raise construction and donk-bet spots
     *   - Blind defense vs steal dynamics
     *   - BTN vs blind postflop range asymmetry
     *   - HJ/CO dynamics in multiway considerations
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {string} heroPosition - Hero's position
     * @param {string} villainPosition - Villain's position
     * @param {string} nodeType - hero_bets_or_checks / hero_faces_bet / hero_faces_raise
     * @param {Object} texture - Board texture
     * @param {number} freq - Frequency of optimal action
     * @returns {string} Position strategy note
     */
    _getPositionStrategyNote(optimalAction, handStrength, street, heroPosition, villainPosition, nodeType, texture, freq) {
        if (!heroPosition || !villainPosition || street === 'preflop') return '';

        const a = (optimalAction || '').toLowerCase();
        const hc = handStrength.toLowerCase();
        const isIP = this._isInPosition(heroPosition, villainPosition);
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isRaise = a.startsWith('r');
        const isFold = a === 'f';

        // ─── BTN vs BB (most common postflop dynamic) ───
        if (heroPosition === 'BTN' && villainPosition === 'BB') {
            if (street === 'flop' && nodeType === 'hero_bets_or_checks') {
                if (isBet && texture && texture.dry) {
                    return 'BTN vs BB on dry boards: IP aggressor c-bets at high frequency with small sizing — BB\'s wide defense range misses these boards often.';
                }
                if (isBet && texture && texture.wet) {
                    return 'BTN vs BB on wet boards: IP c-bet frequency drops — BB connects more with suited/connected hands, so be selective with your bets.';
                }
                if (isCheck) {
                    return 'BTN checking back: even as IP aggressor, some hands prefer a free card — you can bet later streets when your equity improves or bluff when draws miss.';
                }
            }
            if (street === 'turn' && isBet) {
                return 'BTN double-barreling: the IP aggressor narrows to value + draws on the turn — be honest about whether your hand improved or if this is a profitable bluff card.';
            }
        }

        // ─── BB vs BTN (defending OOP) ───
        if (heroPosition === 'BB' && villainPosition === 'BTN') {
            if (street === 'flop' && nodeType === 'hero_faces_bet') {
                if (isRaise) {
                    return 'BB check-raising vs BTN c-bet: OOP needs to build a check-raise range with both value (sets, two pair) and semi-bluffs (draws) to prevent BTN from c-betting with impunity.';
                }
                if (isFold && freq > 0.5) {
                    return 'BB folding to BTN c-bet: even though you defend wide preflop, you must fold your weakest holdings — defending too wide here costs more than it saves.';
                }
            }
            if (nodeType === 'hero_bets_or_checks' && isBet) {
                return 'BB leading (donk bet) into BTN: solvers use donk bets on specific textures where BB\'s range advantage justifies taking the initiative despite being OOP.';
            }
        }

        // ─── SB dynamics ───
        if (heroPosition === 'SB') {
            if (street === 'flop' && isBet && nodeType === 'hero_bets_or_checks') {
                return 'SB as preflop raiser: playing a raised pot OOP, SB tends to c-bet at moderate frequency — your range is narrower but stronger than a cold-caller.';
            }
        }

        // ─── CO/HJ vs blinds ───
        if ((heroPosition === 'CO' || heroPosition === 'HJ') && (villainPosition === 'BB' || villainPosition === 'SB')) {
            if (street === 'flop' && isBet && nodeType === 'hero_bets_or_checks') {
                return `${heroPosition} vs ${villainPosition}: similar to BTN vs blind dynamics but with a tighter opening range — your range advantage on most boards supports c-betting.`;
            }
        }

        // ─── Generic IP vs OOP ───
        if (isIP && isCheck && street !== 'river') {
            if (hc.includes('pair') && !hc.includes('overpair') && !hc.includes('top pair')) {
                return 'IP with medium strength: checking behind controls the pot and lets you realize equity — no need to build a big pot with a marginal hand.';
            }
        }
        if (!isIP && nodeType === 'hero_faces_bet') {
            if (hc.includes('draw') && !isFold) {
                return 'Defending draws OOP vs IP bet: calling keeps your range balanced, but be prepared for tough river decisions if the draw misses.';
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 80: SOLVER FREQUENCY DEVIATION WARNINGS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 80: Generate a frequency deviation explanation when the player's
     * chosen action is in the solver mix but at a significantly lower frequency
     * than the optimal action.
     *
     * This helps players understand:
     *   - Why their action isn't "wrong" but isn't the primary choice
     *   - What distinguishes the optimal action from their chosen action
     *   - How to think about mixed strategies and when to deviate
     *
     * @param {string} chosenAction - Player's chosen action
     * @param {string} optimalAction - Solver's highest-frequency action
     * @param {Object} handActions - Map of action → frequency (0.0-1.0)
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {Object} texture - Board texture
     * @param {string} nodeType - Node type
     * @returns {string} Frequency deviation explanation
     */
    getFrequencyDeviationNote(chosenAction, optimalAction, handActions, handStrength, street, texture, nodeType) {
        if (!chosenAction || !optimalAction || chosenAction === optimalAction) return '';
        if (!handActions) return '';

        const chosenFreq = handActions[chosenAction] || 0;
        const optimalFreq = handActions[optimalAction] || 0;

        // Not in the mix at all — this is a mistake, not a deviation
        if (chosenFreq <= 0.01) return '';

        const chosenPct = (chosenFreq * 100).toFixed(0);
        const optimalPct = (optimalFreq * 100).toFixed(0);
        const gapPct = ((optimalFreq - chosenFreq) * 100).toFixed(0);

        const chosenLabel = this.getActionLabelGTOW(chosenAction);
        const optimalLabel = this.getActionLabelGTOW(optimalAction);

        const hc = (handStrength || '').toLowerCase();
        const ca = chosenAction.toLowerCase();
        const oa = optimalAction.toLowerCase();

        // ─── Determine the strategic reason for the preference ───
        let reason = '';

        // Chose check when solver prefers bet
        if ((ca === 'c' || ca === 'x') && (oa.startsWith('b') || oa === 'allin')) {
            if (hc.includes('draw') || hc.includes('gutshot') || hc.includes('oesd')) {
                reason = 'The solver prefers betting as a semi-bluff — you have equity when called and fold equity to win immediately. Checking surrenders your fold equity advantage.';
            } else if (hc.includes('top pair') || hc.includes('overpair') || hc.includes('set')) {
                reason = 'The solver prefers betting for value + protection — strong hands need to build the pot and deny equity to draws. Checking lets villain see cheap cards.';
            } else if (hc.includes('air') || hc.includes('no pair') || hc.includes('overcard')) {
                reason = 'The solver prefers bluffing here — your hand has no showdown value, so betting generates fold equity. Checking gives up because you can\'t win at showdown.';
            } else {
                reason = `The solver prefers ${optimalLabel} at ${optimalPct}% — building the pot or exerting pressure is higher EV than checking in this spot.`;
            }
        }

        // Chose bet when solver prefers check
        if ((oa === 'c' || oa === 'x') && (ca.startsWith('b') || ca === 'allin')) {
            if (hc.includes('middle pair') || hc.includes('bottom pair') || hc.includes('weak')) {
                reason = 'The solver prefers checking — medium-strength hands do better as check-calls, protecting your checking range while avoiding bloating the pot in a marginal spot.';
            } else if (hc.includes('draw')) {
                reason = 'The solver prefers checking here — this specific draw does better passively, perhaps because it has decent showdown potential or the board favors free cards.';
            } else {
                reason = `The solver prefers ${optimalLabel} at ${optimalPct}% — your hand benefits more from pot control or deception than from betting.`;
            }
        }

        // Chose fold when solver prefers call/check
        if (ca === 'f' && oa !== 'f') {
            reason = `The solver prefers ${optimalLabel} at ${optimalPct}% — your hand has enough equity or pot odds to continue. Folding is too tight and lets villain profit by over-bluffing.`;
        }

        // Chose call when solver prefers raise
        if ((ca === 'call') && (oa.startsWith('r') || oa === 'allin')) {
            reason = `The solver prefers raising — your hand is strong enough to raise for value or as a semi-bluff. Just calling misses out on building the pot and applying maximum pressure.`;
        }

        // Chose smaller bet when solver prefers larger
        if (ca.startsWith('b') && oa.startsWith('b')) {
            const chosenSize = parseInt(ca.replace('b', '')) || 0;
            const optimalSize = parseInt(oa.replace('b', '')) || 0;
            if (optimalSize > chosenSize) {
                reason = `The solver prefers a larger sizing (${optimalLabel}) — your hand's value or fold equity is maximized with a bigger bet. The smaller size doesn't apply enough pressure.`;
            } else {
                reason = `The solver prefers a smaller sizing (${optimalLabel}) — a smaller bet is higher EV here because it gets called by more hands you beat or maintains a balanced range.`;
            }
        }

        // Fallback
        if (!reason) {
            reason = `The solver prefers ${optimalLabel} at ${optimalPct}% over your ${chosenLabel} at ${chosenPct}%.`;
        }

        // Frequency context
        let freqContext = '';
        if (chosenFreq >= 0.30) {
            freqContext = `Your ${chosenLabel} is a legitimate secondary action (${chosenPct}% in the solver mix) — this is a close spot where both actions have merit.`;
        } else if (chosenFreq >= 0.10) {
            freqContext = `Your ${chosenLabel} is in the solver mix but only at ${chosenPct}% — it's not wrong per se, but it's significantly lower EV than the primary action.`;
        } else {
            freqContext = `Your ${chosenLabel} appears in the mix at just ${chosenPct}% — this is an edge-case action that the solver rarely uses. The ${gapPct}% frequency gap suggests a meaningful EV difference.`;
        }

        return `${reason} ${freqContext}`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 81: RANGE POLARIZATION CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 81: Explain whether hero's betting/raising range is polarized or merged/linear.
     * Polarized = nuts + bluffs (no medium strength). Used for large sizings.
     * Linear/merged = value-heavy with some medium strength. Used for small sizings.
     *
     * This helps players understand WHY specific sizings pair with specific hand types.
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {number} sizePct - Bet sizing as percentage of pot
     * @param {string} nodeType - Node type
     * @param {Object} texture - Board texture
     * @returns {string} Polarization context note
     */
    _getRangePolarizationNote(optimalAction, handStrength, street, sizePct, nodeType, texture) {
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isRaise = a.startsWith('r');
        if (!isBet && !isRaise) return ''; // Only relevant for aggressive actions

        const hc = (handStrength || '').toLowerCase();

        // Determine if hand is at the top, middle, or bottom of the range
        const isNuts = hc.includes('nut') || hc.includes('full house') || hc.includes('quads') || hc.includes('straight flush') || hc.includes('set') || hc.includes('flush');
        const isStrong = isNuts || hc.includes('overpair') || hc.includes('top pair, top kicker') || hc.includes('two pair');
        const isAir = hc.includes('air') || hc.includes('no pair') || hc.includes('overcard');
        const isDraw = hc.includes('draw') || hc.includes('gutshot') || hc.includes('oesd');
        const isMedium = !isStrong && !isAir && !isDraw;

        // Large sizing = polarized range
        if (sizePct >= 75 || a === 'allin') {
            if (isNuts || isStrong) {
                return `Range context: large sizing indicates a polarized range. Your strong hand is at the top of this range — you\'re betting big for value, knowing villain must call with their bluff-catchers.`;
            }
            if (isAir) {
                return `Range context: large sizing indicates a polarized range. Your hand is at the bluffing end — you have no showdown value, so you\'re maximizing fold equity with a large bet.`;
            }
            if (isDraw) {
                return `Range context: large sizing with a draw is a semi-bluff in a polarized range — you either win the pot now or have equity to improve when called.`;
            }
            if (isMedium) {
                return `Range context: interesting — medium-strength hands occasionally appear in large sizing ranges as thin value bets or as range balance. This is a solver nuance that prevents exploitation.`;
            }
        }

        // Small sizing = merged/linear range
        if (sizePct > 0 && sizePct <= 40) {
            if (isStrong) {
                return `Range context: small sizing with a strong hand suggests a merged/linear betting range — you\'re betting frequently with many hand types, using a small size to get called by a wide range.`;
            }
            if (isMedium) {
                return `Range context: small sizing fits naturally with medium-strength hands — a merged betting range includes thin value, letting you extract from worse while not overcommitting.`;
            }
            if (isAir) {
                return `Range context: small-sizing bluffs are cheap to execute — in a merged range, small bets risk less with air while maintaining pressure across your entire betting range.`;
            }
        }

        // Mid sizing
        if (sizePct > 40 && sizePct < 75) {
            if (street === 'river') {
                return `Range context: medium river sizing often indicates a somewhat polarized range — stronger than merged but not fully polarized. This sizing targets villain\'s medium-strength calling range.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 82: TRAP DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 82: Detect when checking a strong hand is a trapping play.
     * Explains the strategic rationale for slow-playing:
     *   - Checking range protection (preventing range reads)
     *   - Inducing bluffs from aggressive opponents
     *   - Board texture where strong hands are safe to slow-play
     *   - When trapping is bad (wet boards, multiway)
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {Object} texture - Board texture
     * @param {string} nodeType - Node type
     * @param {number} freq - Frequency of optimal action
     * @returns {string} Trap detection note
     */
    _getTrapDetectionNote(optimalAction, handStrength, street, texture, nodeType, freq) {
        const a = (optimalAction || '').toLowerCase();
        const isCheck = a === 'c' || a === 'x';
        const isCall = a === 'call';
        if (!isCheck && !isCall) return ''; // Trapping only applies to passive actions

        const hc = (handStrength || '').toLowerCase();
        const isVeryStrong = hc.includes('set') || hc.includes('full house') || hc.includes('quads') || hc.includes('nut flush') || hc.includes('nut straight') || hc.includes('two pair');
        const isStrong = isVeryStrong || hc.includes('overpair') || hc.includes('top pair, top kicker') || hc.includes('flush') || hc.includes('straight');

        if (!isStrong) return ''; // Only trapping with strong hands

        // Checking strong hands = trapping
        if (isCheck && isStrong) {
            if (texture && texture.dry) {
                if (isVeryStrong) {
                    return `Trapping play: checking ${handStrength} on a dry board is a classic slow-play — few draws can outdraw you, and checking induces bluffs or lighter bets from villain on later streets.`;
                }
                return `Slow-play: checking with strong hands on dry boards protects your checking range — if you always bet your best hands, villain can exploit your checks by over-bluffing.`;
            }

            if (texture && texture.wet) {
                if (freq >= 0.5) {
                    return `Trap on a wet board: the solver still prefers checking even on a draw-heavy board — this may protect your checking range or set up a check-raise if villain bets.`;
                }
                return `▲ Careful slow-play: checking strong hands on wet boards is risky since draws can get there. The solver mixes here — sometimes you need to protect your equity by betting.`;
            }

            if (nodeType === 'hero_faces_bet' || isCall) {
                return ''; // Calling a bet isn\'t really trapping
            }

            // Generic trap
            if (isVeryStrong && street !== 'river') {
                return `Trap: checking a monster on ${street} builds the pot on later streets when villain bets or lets you check-raise for maximum value.`;
            }
            if (isVeryStrong && street === 'river') {
                return `River check with a monster: this could be a trap hoping villain bluffs, or the solver recognizes that betting won\'t get called by worse hands often enough.`;
            }
        }

        // Flat-calling with a strong hand (when facing a bet)
        if (isCall && isStrong && nodeType === 'hero_faces_bet') {
            if (isVeryStrong) {
                return `Flat-calling with a monster: just calling instead of raising disguises your hand strength — this lets villain continue bluffing or value-betting thinner on later streets.`;
            }
        }

        return '';
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 83: BOARD COVERAGE — RANGE BET VS. POLAR BET STRATEGY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 83: Explain when the solver uses a range bet vs. polar bet strategy.
     * Range bet = small sizing with most of your range (33% pot with 70%+ frequency).
     * Polar bet = larger sizing with a selected subset (value + bluffs only).
     *
     * This is board-texture-dependent:
     *   - Dry A-high boards: range bet (PFR has massive range advantage)
     *   - Wet connected boards: more selective/polar (both ranges connect)
     *   - Paired boards: range bet with small sizing (hard for either range to have it)
     *   - Low boards: polar (caller's range connects more)
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {number} sizePct - Bet sizing percentage
     * @param {number} freq - Frequency of the optimal action (0.0-1.0)
     * @param {Object} texture - Board texture
     * @param {string} nodeType - Node type
     * @param {string} heroPosition - Hero's position
     * @returns {string} Board coverage strategy note
     */
    _getBoardCoverageNote(optimalAction, handStrength, street, sizePct, freq, texture, nodeType, heroPosition) {
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        if (!isBet || street !== 'flop' || !texture) return ''; // Most relevant on flop c-bets

        const isAggressor = nodeType === 'hero_bets_or_checks';
        if (!isAggressor) return ''; // Range/polar concepts apply to aggressor strategy

        // Detect range bet pattern: small sizing + high frequency
        const isRangeBet = sizePct <= 40 && freq >= 0.60;
        // Detect polar bet pattern: large sizing + lower frequency
        const isPolarBet = sizePct >= 60 && freq <= 0.50;

        if (isRangeBet) {
            if (texture.aceHigh && texture.dry) {
                return `Board coverage: this is a range bet spot — the A-high dry board heavily favors the preflop raiser\'s range. Bet small and frequently because villain\'s range rarely connects.`;
            }
            if (texture.paired && !texture.wet) {
                return `Board coverage: paired dry boards favor range betting — neither range hits trips often, but the aggressor\'s wider range of overcards and draws benefits from frequent small pressure.`;
            }
            if (texture.dry && !texture.lowBoard) {
                return `Board coverage: dry board = range bet. Bet small with most hands because the board doesn\'t help either range much, and small bets are efficient at winning dead money.`;
            }
            return `Board coverage: the solver is using a range-bet approach here — small sizing with high frequency across many hand types to put consistent pressure.`;
        }

        if (isPolarBet) {
            if (texture.wet) {
                return `Board coverage: wet board = polar betting. The solver bets selectively with strong made hands and draws, skipping medium holdings that prefer pot control.`;
            }
            if (texture.lowBoard) {
                return `Board coverage: low boards favor the caller\'s range — the aggressor can\'t range bet profitably, so they go polar with strong value hands and select bluffs.`;
            }
            if (texture.connected && texture.straightDrawHeavy) {
                return `Board coverage: highly connected board = polar strategy. Both ranges connect, so only strong hands and draws with equity justify building the pot.`;
            }
            return `Board coverage: polar betting spot — the solver is selective about which hands to bet, using a larger size with fewer hands for maximum leverage.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 84: MULTI-STREET EV PROJECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 84: Project how the current action affects future street EV.
     * Explains the multi-street implications:
     *   - Building the pot for value hands (geometric sizing)
     *   - Preserving fold equity for bluffs across streets
     *   - The concept of "pot geometry" — sizing to get stacks in by river
     *   - Why checking now can set up bigger future bets
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {number} sizePct - Bet sizing percentage
     * @param {number} estimatedPot - Current pot size
     * @param {number} stackDepth - Stack depth in BB
     * @param {Object} texture - Board texture
     * @returns {string} Multi-street EV projection note
     */
    _getMultiStreetEVNote(optimalAction, handStrength, street, sizePct, estimatedPot, stackDepth, texture) {
        if (!estimatedPot || !stackDepth || street === 'river') return '';
        const a = (optimalAction || '').toLowerCase();
        const hc = (handStrength || '').toLowerCase();
        const spr = stackDepth / estimatedPot;

        // ─── Geometric sizing for value ───
        if (a.startsWith('b') && spr > 2 && street === 'flop') {
            const isValue = hc.includes('overpair') || hc.includes('top pair') || hc.includes('set') || hc.includes('two pair') || hc.includes('flush') || hc.includes('straight');
            if (isValue) {
                // Calculate geometric pot growth to get stacks in by river
                // 3 streets remaining from flop: need pot to grow by spr factor over 3 bets
                const streetsLeft = street === 'flop' ? 3 : 2;
                const geoSize = Math.round((Math.pow(1 + spr, 1 / streetsLeft) - 1) * 100);
                if (geoSize > 20 && geoSize < 200) {
                    return `Multi-street plan: with ${streetsLeft} streets left and SPR ${spr.toFixed(1)}, geometric sizing of ~${geoSize}% pot per street gets all the money in by the river. This bet sets up the ideal pot trajectory for your value hand.`;
                }
            }
        }

        // ─── Check-to-bet lines ───
        if ((a === 'c' || a === 'x') && street === 'flop') {
            const isDrawy = hc.includes('draw') || hc.includes('gutshot') || hc.includes('oesd');
            if (isDrawy) {
                return `Multi-street plan: checking the flop with a draw preserves your stack for when you hit — on the turn, you can either bet with a made hand or check again for a free river.`;
            }
            const isStrong = hc.includes('set') || hc.includes('two pair') || hc.includes('overpair');
            if (isStrong && spr > 4) {
                return `Multi-street plan: checking a strong hand on the flop can set up bigger turn and river bets — if villain bets, you can check-raise; if they check, you can overbet later streets.`;
            }
        }

        // ─── Turn barrel implications ───
        if (a.startsWith('b') && street === 'turn') {
            const streetsLeft = 1; // Only river remains
            const newPot = estimatedPot * (1 + sizePct / 50); // Rough pot after bet+call
            const remainingStack = stackDepth - (estimatedPot * sizePct / 100);
            if (remainingStack > 0 && newPot > 0) {
                const riverSPR = remainingStack / newPot;
                if (riverSPR < 1) {
                    return `Multi-street plan: this turn bet sets up a river all-in — after bet and call, the remaining stack-to-pot ratio will be under 1, committing you on the river.`;
                }
                if (riverSPR >= 1 && riverSPR <= 2) {
                    return `Multi-street plan: this turn sizing leaves a pot-sized river bet — clean pot geometry that maximizes value or fold equity on the final street.`;
                }
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 85: KICKER STRENGTH AWARENESS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 85: Explain how kicker strength affects the decision.
     * Players often undervalue kicker differences:
     *   - Top pair top kicker (TPTK) is much stronger than top pair weak kicker (TPWK)
     *   - Kicker matters most in heads-up pots and on dry boards
     *   - Dominated kickers (KJ vs KQ) have very low equity
     *
     * @param {string} heroHand - Hero's hand notation
     * @param {string} handStrength - categorizeHand() output
     * @param {string[]} board - Board cards
     * @param {string} optimalAction - GTO correct action
     * @param {string} street - Current street
     * @returns {string} Kicker context note
     */
    _getKickerNote(heroHand, handStrength, board, optimalAction, street) {
        if (!heroHand || heroHand.length < 2 || !board || board.length < 3) return '';
        const hc = (handStrength || '').toLowerCase();

        // Only relevant for one-pair hands (top pair, middle pair, overpair)
        if (!hc.includes('pair') || hc.includes('two pair') || hc.includes('set') || hc.includes('trips')) return '';

        const r1 = heroHand[0].toUpperCase();
        const r2 = heroHand[1].toUpperCase();
        const rankOrder = '23456789TJQKA';
        const v1 = rankOrder.indexOf(r1);
        const v2 = rankOrder.indexOf(r2);
        const boardRanks = board.map(c => c[0].toUpperCase());
        const boardVals = boardRanks.map(r => rankOrder.indexOf(r));

        // Find which card is the pair and which is the kicker
        let pairCard, kickerVal;
        if (boardRanks.includes(r1)) {
            pairCard = r1;
            kickerVal = v2;
        } else if (boardRanks.includes(r2)) {
            pairCard = r2;
            kickerVal = v1;
        } else if (v1 === v2) {
            // Pocket pair — kicker is irrelevant for pair vs pair
            return '';
        } else {
            return ''; // Neither card pairs the board — overpair or something else
        }

        const a = (optimalAction || '').toLowerCase();
        const kickerRank = rankOrder[kickerVal];

        // Top pair analysis
        if (hc.includes('top pair')) {
            if (kickerVal >= 12) { // A kicker
                return `Kicker context: TPTK (top pair, top kicker) — your A kicker is the best possible. This hand can confidently bet for value across streets.`;
            }
            if (kickerVal >= 11) { // K kicker
                return `Kicker context: top pair with K kicker — very strong. Only Ax hands have a better kicker, and those are a small portion of villain's range.`;
            }
            if (kickerVal >= 9) { // Q-J kicker
                return `Kicker context: top pair with ${kickerRank} kicker — solid but not premium. Be cautious against raises, as better kickers (A/K) are possible.`;
            }
            if (kickerVal <= 6) { // 8 or lower
                if (a === 'c' || a === 'x' || a === 'f') {
                    return `Kicker context: top pair weak kicker (${kickerRank}) — your hand is vulnerable to domination. Many hands in villain's range have the same pair with a better kicker, making this a check/call at best.`;
                }
                return `Kicker context: top pair weak kicker (${kickerRank}) — be careful. Your hand can be dominated by the same pair with A/K/Q/J kicker.`;
            }
        }

        // Middle/bottom pair kicker
        if (hc.includes('middle pair') || hc.includes('bottom pair') || hc.includes('second pair')) {
            if (kickerVal >= 12) {
                return `Kicker context: ${hc} with A kicker — the best possible kicker elevates this medium-strength hand. Worth calling lighter than with a weak kicker.`;
            }
            if (kickerVal <= 7) {
                return `Kicker context: ${hc} with weak kicker (${kickerRank}) — this hand is at the bottom of the calling range. Folding to significant pressure is often correct.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 86: NUT ADVANTAGE DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 86: Detect which player has the nut advantage on this board texture.
     * Nut advantage = who is more likely to have the strongest hands.
     * This drives sizing, bluffing frequency, and checking strategy.
     *
     * @param {string[]} board - Board cards
     * @param {string} heroPosition - Hero's position
     * @param {string} villainPosition - Villain's position
     * @param {string} street - Current street
     * @param {Object} texture - Board texture
     * @param {string} nodeType - Node type
     * @returns {string} Nut advantage context note
     */
    _getNutAdvantageNote(board, heroPosition, villainPosition, street, texture, nodeType) {
        if (!board || board.length < 3 || !heroPosition || !villainPosition || street === 'preflop') return '';

        const boardRanks = board.map(c => c[0].toUpperCase());
        const boardVals = boardRanks.map(r => '23456789TJQKA'.indexOf(r));
        const highestBoard = Math.max(...boardVals);
        const isPFR = nodeType === 'hero_bets_or_checks'; // Simplified: aggressor = PFR

        // Determine if hero was likely the preflop raiser
        const earlyPositions = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ'];
        const latePositions = ['CO', 'BTN'];
        const blinds = ['SB', 'BB'];

        const heroIsPFR = !blinds.includes(heroPosition); // Simplified: non-blind = likely raiser
        const villainIsBB = villainPosition === 'BB';

        // ─── A-high boards ───
        if (highestBoard === 12) { // Ace on board
            if (heroIsPFR) {
                return 'Nut advantage: PFR has the nut advantage on A-high boards — more Ax combos in the raising range than the caller\'s range. This supports aggressive play.';
            }
            return 'Nut advantage: the raiser has more Ax combos on this A-high board. As the caller, be cautious — your range is capped more than villain\'s.';
        }

        // ─── K-high boards ───
        if (highestBoard === 11 && !boardRanks.includes('A')) {
            if (heroIsPFR) {
                return 'Nut advantage: PFR has a significant nut advantage on K-high boards — more KK/AK combos vs. caller\'s wider but weaker range.';
            }
        }

        // ─── Low/medium boards (7-high and below) ───
        if (highestBoard <= 5) {
            if (villainIsBB && heroIsPFR) {
                return 'Nut advantage: low boards favor the BB defender — their wider preflop range (small pairs, suited connectors) connects heavily here. PFR\'s range advantage is reduced.';
            }
        }

        // ─── Monotone boards ───
        if (texture && texture.monotone) {
            if (villainIsBB) {
                return 'Nut advantage: monotone boards shift nut advantage toward the caller — suited hands are more common in BB\'s wide defense range than in PFR\'s tighter range.';
            }
            if (heroIsPFR) {
                return 'Nut advantage: on monotone boards, be cautious — the caller often has more suited combos. Your nut advantage is reduced unless you hold the nut flush draw.';
            }
        }

        // ─── Paired boards ───
        if (texture && texture.paired) {
            if (heroIsPFR) {
                return 'Nut advantage: paired boards generally favor the PFR — trips and full houses come from pocket pairs, which the raiser has more of.';
            }
        }

        // ─── Connected low-mid boards ───
        if (texture && texture.connected && highestBoard <= 8) {
            if (villainIsBB) {
                return 'Nut advantage: connected middle/low boards favor the caller\'s range — suited connectors and small pairs hit these boards hard.';
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 87: BACKDOOR EQUITY AWARENESS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 87: Detect backdoor flush and straight draws that add equity.
     * Backdoor draws are hugely important in GTO play because they:
     *   - Add ~4-5% equity on the flop (2 cards to come)
     *   - Turn weak hands into semi-bluff candidates
     *   - Provide additional outs when combined with other draws
     *
     * @param {string} heroHand - Hero's hand notation
     * @param {string[]} board - Board cards
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @returns {string} Backdoor equity note
     */
    _getBackdoorEquityNote(heroHand, board, handStrength, street) {
        if (!heroHand || !board || board.length < 3 || street !== 'flop') return ''; // Only relevant on flop
        if (heroHand.length < 2) return '';

        const hc = (handStrength || '').toLowerCase();
        // Skip if already has a direct draw (the draw itself is more important)
        if (hc.includes('flush draw') || hc.includes('oesd') || hc.includes('combo draw') || hc.includes('monster draw')) return '';

        const r1 = heroHand[0].toUpperCase();
        const r2 = heroHand[1].toUpperCase();
        const isSuited = heroHand.length >= 3 && heroHand[2] === 's';

        const boardSuits = board.map(c => c[1]?.toLowerCase());
        const boardRanks = board.map(c => c[0].toUpperCase());
        const boardVals = boardRanks.map(r => '23456789TJQKA'.indexOf(r));
        const heroV1 = '23456789TJQKA'.indexOf(r1);
        const heroV2 = '23456789TJQKA'.indexOf(r2);

        const backdoors = [];

        // ─── Backdoor flush draw ───
        if (isSuited) {
            // Check if one board card matches hero's suit
            // Since hero is suited, both hero cards share a suit
            // We need 1 board card of that suit to have a backdoor flush draw (need 2 more of same suit)
            const suitCounts = {};
            boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
            // Hero needs a suit with exactly 1 board card (so 2 hero + 1 board = 3, need 2 more = backdoor)
            // Actually: backdoor flush = 2 cards of same suit on the flop (hero has 2). 1 board card of that suit = 3 total.
            // We need 2 more of that suit to come on turn+river.
            // The condition: hero suited + at least 1 board card of same suit but NOT 2 (that would be a direct flush draw)
            const heroSuit = isSuited ? 's' : ''; // We don't know the actual suit but can infer
            // Simpler check: if suited hand and board has 1 card of any single suit matching, it's a backdoor
            // Since we generated hero's cards to match suit in parseHandToCards, check if any suit appears exactly once
            const hasPotentialBackdoor = Object.values(suitCounts || {}).some(c => c === 1);
            if (hasPotentialBackdoor && !Object.values(suitCounts || {}).some(c => c >= 2)) {
                const highCard = Math.max(heroV1, heroV2);
                if (highCard >= 12) {
                    backdoors.push('nut backdoor flush draw (suited with A)');
                } else if (highCard >= 11) {
                    backdoors.push('strong backdoor flush draw (suited with K)');
                } else {
                    backdoors.push('backdoor flush draw');
                }
            }
        }

        // ─── Backdoor straight draw ───
        // Check if hero's cards connect with 1-2 board cards to create a 3-card straight base
        const allVals = [...new Set([...boardVals, heroV1, heroV2])].sort((a, b) => a - b);
        // Count 5-card windows where hero contributes at least 1 card and total >= 3
        let hasBackdoorStraight = false;
        for (let low = -1; low <= 8; low++) {
            const window = [];
            for (let j = 0; j < 5; j++) {
                let v = low + j;
                if (v === -1) v = 12; // Ace-low
                window.push(v);
            }
            const windowSet = new Set(window);
            const heroInWindow = windowSet.has(heroV1) || windowSet.has(heroV2);
            const boardInWindow = boardVals.filter(v => windowSet.has(v)).length;
            const totalInWindow = allVals.filter(v => windowSet.has(v)).length;

            // Backdoor straight: 3 cards in a 5-card window, hero contributes, need 2 more
            if (heroInWindow && totalInWindow === 3 && boardInWindow >= 1 && boardInWindow <= 2) {
                hasBackdoorStraight = true;
                break;
            }
        }
        if (hasBackdoorStraight && !hc.includes('gutshot') && !hc.includes('straight')) {
            backdoors.push('backdoor straight draw');
        }

        if (backdoors.length === 0) return '';

        const bdList = backdoors.join(' + ');
        if (hc.includes('pair')) {
            return `Backdoor equity: your ${bdList} adds ~4-5% equity on top of your made hand — this makes your hand significantly more playable across streets.`;
        }
        if (hc.includes('air') || hc.includes('no pair') || hc.includes('overcard')) {
            return `Backdoor equity: your ${bdList} is critical for this hand — without it, this would be pure air. The backdoor potential makes this a viable semi-bluff candidate.`;
        }
        return `Backdoor equity: ${bdList} — adds hidden equity that improves your hand's playability on future streets.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 88: PROTECTION URGENCY CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 88: Explain whether protection betting is urgent or unnecessary.
     * Protection = betting to deny equity to drawing hands.
     *
     * Urgency depends on:
     *   - Board wetness (more draws = more urgency)
     *   - Hand vulnerability (top pair < set in terms of needing protection)
     *   - Position (OOP has more urgency to protect than IP)
     *   - Stack depth (deeper = more implied odds for draws = more protection needed)
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {Object} texture - Board texture
     * @param {string} heroPosition - Hero's position
     * @param {string} villainPosition - Villain's position
     * @returns {string} Protection urgency note
     */
    _getProtectionNote(optimalAction, handStrength, street, texture, heroPosition, villainPosition) {
        if (!handStrength || street === 'preflop' || street === 'river') return '';
        const a = (optimalAction || '').toLowerCase();
        const hc = handStrength.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isIP = this._isInPosition(heroPosition, villainPosition);

        // Protection only matters for vulnerable made hands
        const isVulnerable = hc.includes('pair') && !hc.includes('two pair') && !hc.includes('set') && !hc.includes('full house');
        const isInvulnerable = hc.includes('set') || hc.includes('full house') || hc.includes('quads') || hc.includes('nut flush') || hc.includes('nut straight');

        if (!isVulnerable && !isInvulnerable) return '';

        if (isVulnerable && isBet) {
            if (texture && texture.wet) {
                return `Protection: betting is urgent — the wet board gives villain many drawing combinations. Checking lets them realize equity cheaply against your vulnerable ${hc}.`;
            }
            if (texture && texture.straightDrawHeavy) {
                return `Protection: straight draw heavy board requires a protection bet — many hands in villain\'s range have straight draws that erode your equity significantly.`;
            }
            if (!isIP && texture && !texture.dry) {
                return `Protection: betting OOP for protection is important here — if you check, villain gets a free card IP and can bet you off your hand on scary runouts.`;
            }
        }

        if (isVulnerable && isCheck) {
            if (texture && texture.dry) {
                return `No protection needed: the dry board has few draws that threaten your hand. Checking is fine — you can call future bets or bet later streets.`;
            }
            if (isIP) {
                return `Protection not urgent IP: you can control the pot by checking back. If a scary card comes, you save money; if a blank comes, you can bet for value later.`;
            }
        }

        if (isInvulnerable && isCheck) {
            return `No protection needed: your hand is nearly invulnerable — very few runouts hurt you. Slow-playing is viable to extract maximum value.`;
        }

        if (isInvulnerable && isBet && texture && texture.wet) {
            return `Strong but bet anyway: even with a near-invulnerable hand, the wet board means villain has many draws. Betting denies equity AND extracts value from draws.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 89: SHOWDOWN VALUE VS. BLUFF DICHOTOMY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 89: Clarify whether a hand should try to reach showdown cheaply
     * (showdown value) or should be used as a bluff (no showdown value).
     *
     * This is one of the most fundamental GTO concepts:
     *   - Hands with showdown value (pairs, overcards) should usually check/call
     *   - Hands without showdown value (air, weak draws) should bet as bluffs
     *   - Medium-strength hands are the toughest — sometimes both strategies apply
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {string} nodeType - Node type
     * @returns {string} Showdown value context note
     */
    _getShowdownValueNote(optimalAction, handStrength, street, nodeType) {
        if (!handStrength) return '';
        const a = (optimalAction || '').toLowerCase();
        const hc = handStrength.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';

        // ─── No showdown value → bluff candidate ───
        const noShowdown = hc.includes('air') || hc.includes('no pair') || (hc.includes('overcard') && !hc.includes('draw'));

        if (noShowdown && isBet) {
            if (street === 'river') {
                return 'Showdown value: zero — your hand can\'t win at showdown, so betting as a bluff is the only way to profit. Choose bluffs with good blockers to nutted hands.';
            }
            return 'Showdown value: very low — your hand needs to bet to win the pot since it can\'t win at showdown. This is a profitable bluff spot when you have fold equity.';
        }
        if (noShowdown && isCheck) {
            return 'Showdown value: none — checking here gives up on the pot. Sometimes this is correct to keep your checking range balanced, but you\'re surrendering equity.';
        }
        if (noShowdown && isFold) {
            return 'Showdown value: none — folding is correct because you have no equity, no draw, and no fold equity if you bet.';
        }

        // ─── Strong showdown value → protect it ───
        const strongShowdown = hc.includes('overpair') || hc.includes('top pair') || hc.includes('set') || hc.includes('two pair') || hc.includes('flush') || hc.includes('straight');

        if (strongShowdown && isCheck && street === 'river') {
            return 'Showdown value: high — your hand is strong enough to win at showdown. Checking aims to induce bluffs or because villain\'s calling range is too strong to value bet against.';
        }

        // ─── Medium showdown value → the decision is nuanced ───
        const mediumShowdown = hc.includes('middle pair') || hc.includes('bottom pair') || hc.includes('second pair') || hc.includes('weak pair');

        if (mediumShowdown && isCheck) {
            return 'Showdown value: medium — your hand has some showdown value but isn\'t strong enough to bet for value. Check-call to realize your equity without bloating the pot.';
        }
        if (mediumShowdown && isBet) {
            return 'Showdown value: medium but betting anyway — this could be thin value against worse hands or a merge-bet that uses your equity edge. Be aware your hand is vulnerable if raised.';
        }
        if (mediumShowdown && isCall && nodeType === 'hero_faces_bet') {
            return 'Showdown value: medium — calling is correct because you beat bluffs and some thin value bets. Folding would over-fold your range in this spot.';
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 90: SESSION WEAKNESS SUMMARY GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 90: Generate a comprehensive session weakness summary.
     * Analyzes mistake tracker data to produce an actionable summary of:
     *   - Top 3 weakness categories
     *   - Specific patterns (e.g., "folding too much on rivers")
     *   - Improvement suggestions
     *
     * Called externally after session ends or at checkpoints.
     *
     * @param {number} minSamples - Minimum samples for a pattern to be reported
     * @returns {Object} { summary: string, weaknesses: Array, strengths: Array, totalQuestions: number }
     */
    generateSessionSummary(minSamples = 3) {
        if (!this._mistakeTracker) return { summary: 'Not enough data yet.', weaknesses: [], strengths: [], totalQuestions: 0 };

        const entries = Object.entries(this._mistakeTracker || {})
            .filter(([_, v]) => v.total >= minSamples)
            .map(([key, v]) => ({
                key,
                total: v.total,
                mistakes: v.mistakes,
                mistakeRate: v.mistakes / v.total,
                accuracy: 1 - (v.mistakes / v.total),
            }))
            .sort((a, b) => b.mistakeRate - a.mistakeRate);

        if (entries.length === 0) return { summary: 'Not enough data to generate a summary.', weaknesses: [], strengths: [], totalQuestions: 0 };

        // Separate weaknesses and strengths
        const weaknesses = entries.filter(e => e.mistakeRate >= 0.35).slice(0, 5);
        const strengths = entries.filter(e => e.mistakeRate <= 0.15 && e.total >= 5).slice(0, 3);

        // Total questions from session stats
        const totalQuestions = this._sessionStats?.total || 0;

        // Build human-readable descriptions
        const describeKey = (key) => {
            const [type, value] = key.includes(':') ? key.split(':') : [key, ''];
            if (type === 'street') return `${value} decisions`;
            if (type === 'hand') return `playing ${value.replace(/_/g, ' ')} hands`;
            if (type === 'action') return `${value} decisions`;
            if (type === 'node') return value === 'hero_faces_bet' ? 'facing bets' : value === 'hero_bets_or_checks' ? 'bet/check decisions' : 'facing raises';
            if (type === 'spot') return `${value.replace(/_/g, ' ')} spots`;
            // Compound keys
            if (key.includes(':')) {
                const parts = key.split(':');
                return `${parts[0].replace(/_/g, ' ')} + ${parts[1].replace(/_/g, ' ')}`;
            }
            return key;
        };

        const weaknessDescriptions = weaknesses.map(w => ({
            ...w,
            description: describeKey(w.key),
            accuracyPct: Math.round(w.accuracy * 100),
            mistakeRatePct: Math.round(w.mistakeRate * 100),
        }));

        const strengthDescriptions = strengths.map(s => ({
            ...s,
            description: describeKey(s.key),
            accuracyPct: Math.round(s.accuracy * 100),
        }));

        // Build summary text
        const summaryParts = [];
        if (totalQuestions > 0) {
            const overallAcc = this._sessionStats ? Math.round((this._sessionStats.correct / this._sessionStats.total) * 100) : 0;
            summaryParts.push(`Session: ${totalQuestions} questions, ${overallAcc}% overall accuracy.`);
        }

        if (weaknessDescriptions.length > 0) {
            summaryParts.push('Areas to improve:');
            weaknessDescriptions.forEach((w, i) => {
                summaryParts.push(`${i + 1}. ${w.description} — ${w.mistakeRatePct}% mistake rate (${w.total} samples)`);
            });
        }

        if (strengthDescriptions.length > 0) {
            summaryParts.push('Strengths:');
            strengthDescriptions.forEach(s => {
                summaryParts.push(`✓ ${s.description} — ${s.accuracyPct}% accuracy`);
            });
        }

        // Improvement suggestions based on top weakness
        if (weaknessDescriptions.length > 0) {
            const topWeak = weaknessDescriptions[0];
            let suggestion = '';
            if (topWeak.key.includes('fold')) suggestion = 'Focus on pot odds calculations — you may be folding too often in spots where calling is profitable.';
            else if (topWeak.key.includes('river')) suggestion = 'River play is your biggest leak — study polarization (value vs. bluff) and bluff-catching frequencies.';
            else if (topWeak.key.includes('turn')) suggestion = 'Turn decisions need work — focus on when to continue barreling vs. pot-controlling with medium hands.';
            else if (topWeak.key.includes('draw') || topWeak.key.includes('flush_draw')) suggestion = 'Draw play is a weakness — practice pot odds, implied odds, and semi-bluff sizing decisions.';
            else if (topWeak.key.includes('air') || topWeak.key.includes('bluff')) suggestion = 'Bluffing decisions need refinement — look for hands with blockers and no showdown value for optimal bluffs.';
            else if (topWeak.key.includes('top_pair')) suggestion = 'Top pair play needs work — focus on kicker strength, board texture, and when to slow down vs. bet for value.';
            else suggestion = `Focus on ${topWeak.description} — review the solver explanations in these spots and look for patterns in your mistakes.`;

            summaryParts.push(`Suggestion: ${suggestion}`);
        }

        return {
            summary: summaryParts.join('\n'),
            weaknesses: weaknessDescriptions,
            strengths: strengthDescriptions,
            totalQuestions,
        };
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 91: PREFLOP HAND EQUITY TIERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 91: Classify preflop hands into equity tiers for explanation context.
     * Provides approximate all-in equity vs. typical ranges to help players
     * understand WHY certain hands are opens/3bets/folds.
     *
     * @param {string} heroHand - Hand notation (e.g., "AKs")
     * @returns {Object} { tier: string, equityVsRandom: number, description: string }
     */
    _getPreflopHandTier(heroHand) {
        if (!heroHand || heroHand.length < 2) return { tier: 'unknown', equityVsRandom: 50, description: '' };

        const r1 = heroHand[0].toUpperCase();
        const r2 = heroHand[1].toUpperCase();
        const suffix = heroHand.length >= 3 ? heroHand[2] : '';
        const isPair = r1 === r2;
        const isSuited = suffix === 's';
        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const v1 = rankVal(r1), v2 = rankVal(r2);
        const highVal = Math.max(v1, v2);
        const lowVal = Math.min(v1, v2);

        // Approximate equity vs random hand (simplified)
        let eq;
        if (isPair) {
            // Pairs: AA~85%, KK~82%, QQ~80%, JJ~77%, TT~75%, 99~72%, 88~69%, 77~66%, etc.
            eq = 50 + (v1 * 2.7);
        } else if (isSuited) {
            // Suited: AKs~67%, AQs~66%, KQs~63%, T9s~56%, 76s~52%
            eq = 46 + (highVal * 1.0) + (lowVal * 0.5) + 2;
        } else {
            // Offsuit: AKo~65%, AQo~64%, KQo~61%, T9o~54%, 76o~50%
            eq = 44 + (highVal * 1.0) + (lowVal * 0.5);
        }

        // Clamp
        eq = Math.min(87, Math.max(33, eq));

        // Tier classification
        let tier, description;
        if (eq >= 78) { tier = 'premium'; description = 'top-tier hand — always play aggressively'; }
        else if (eq >= 66) { tier = 'strong'; description = 'strong hand with high raw equity'; }
        else if (eq >= 58) { tier = 'playable'; description = 'solid playable hand with good equity'; }
        else if (eq >= 52) { tier = 'marginal'; description = 'marginal hand — position and context matter most'; }
        else { tier = 'speculative'; description = 'speculative hand — needs suitedness/connectivity to justify playing'; }

        return { tier, equityVsRandom: Math.round(eq), description };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 92: EV COMPARISON IN EXPLANATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 92: When EV data is available, add EV comparison context to explanations.
     * Shows the EV difference between the optimal action and alternatives.
     *
     * @param {string} optimalAction - Best action
     * @param {Object} actionEVs - Map of action → EV
     * @param {number} estimatedPot - Pot size
     * @returns {string} EV comparison note
     */
    _getEVComparisonNote(optimalAction, actionEVs, estimatedPot) {
        if (!actionEVs || !optimalAction) return '';
        const optEV = actionEVs[optimalAction];
        if (optEV === undefined || optEV === null) return '';

        // Find the second-best action for comparison
        const sorted = Object.entries(actionEVs || {})
            .filter(([a, _]) => a !== optimalAction)
            .sort(([_, ev1], [__, ev2]) => ev2 - ev1);

        if (sorted.length === 0) return '';
        const [secondAction, secondEV] = sorted[0];
        const evDiff = optEV - secondEV;

        if (evDiff <= 0) return ''; // No meaningful EV advantage

        const secondLabel = this.getActionLabelGTOW(secondAction);

        // Express EV diff relative to pot
        if (estimatedPot && estimatedPot > 0) {
            const diffAsPct = ((evDiff / estimatedPot) * 100).toFixed(1);
            if (evDiff >= estimatedPot * 0.15) {
                return `EV context: this action is significantly higher EV — ${diffAsPct}% of pot better than ${secondLabel}. Clear best play.`;
            }
            if (evDiff >= estimatedPot * 0.05) {
                return `EV context: ${diffAsPct}% pot EV edge over ${secondLabel}. Meaningful but not huge — a close spot where execution matters.`;
            }
            if (evDiff < estimatedPot * 0.02) {
                return `EV context: essentially break-even between top actions (${diffAsPct}% pot difference). Both are viable in practice.`;
            }
        }

        // Absolute EV diff
        if (evDiff >= 2.0) {
            return `EV context: ${evDiff.toFixed(1)}bb better than ${secondLabel}. Clear best action.`;
        }
        if (evDiff >= 0.5) {
            return `EV context: ${evDiff.toFixed(1)}bb edge over ${secondLabel}. Meaningful EV difference.`;
        }
        if (evDiff < 0.2) {
            return `EV context: only ${evDiff.toFixed(2)}bb separates the top actions — razor-thin margin. Mixed strategy is natural here.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 93: CHECK-RAISE STRATEGY CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 93: Explain check-raise strategy when hero faces a bet and raises.
     * Check-raises are complex because they serve multiple purposes:
     *   - Value: extracting maximum with strong hands
     *   - Semi-bluff: using fold equity with draws
     *   - Range balance: preventing villain from betting with impunity
     *   - Pot building: getting more money in OOP with strong hands
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {string} nodeType - Node type
     * @param {Object} texture - Board texture
     * @returns {string} Check-raise context note
     */
    _getCheckRaiseNote(optimalAction, handStrength, street, nodeType, texture) {
        const a = (optimalAction || '').toLowerCase();
        const isRaise = a.startsWith('r') || a === 'allin';
        if (!isRaise || nodeType !== 'hero_faces_bet') return '';

        const hc = (handStrength || '').toLowerCase();

        // ─── Value check-raises ───
        if (hc.includes('set') || hc.includes('two pair') || hc.includes('full house') || hc.includes('quads')) {
            if (street === 'flop') {
                return 'Check-raise for value: you have a monster that plays best by trapping then raising. This builds a big pot early while disguising your hand strength.';
            }
            if (street === 'turn') {
                return 'Turn check-raise for value: building the pot with a strong hand. After check-raising the turn, you can comfortably bet or shove the river.';
            }
            if (street === 'river') {
                return 'River check-raise for value: the ultimate extraction play — you checked hoping villain would bet, then raise for maximum value. Only do this with hands that beat villain\'s betting range.';
            }
        }

        // ─── Semi-bluff check-raises ───
        if (hc.includes('draw') || hc.includes('oesd') || hc.includes('gutshot') || hc.includes('combo draw')) {
            if (texture && texture.wet) {
                return 'Semi-bluff check-raise: raising with a draw on a wet board gives you two ways to win — villain folds now (instant profit) or you hit your draw when called. This is a key OOP play.';
            }
            return 'Semi-bluff check-raise: using your drawing equity plus fold equity. Even if called, you have outs to improve. This balances your check-raise range with value hands.';
        }

        // ─── Bluff check-raises ───
        if (hc.includes('air') || hc.includes('no pair') || hc.includes('overcard')) {
            return 'Bluff check-raise: raising with a weak hand to deny villain\'s equity and generate fold equity. This works because your range also contains strong hands — villain can\'t tell.';
        }

        // ─── Overpair/top pair check-raises ───
        if (hc.includes('overpair') || hc.includes('top pair')) {
            return 'Check-raise with a strong one-pair hand: raising for value and protection. On this texture, your hand is vulnerable enough that building the pot now is better than pot-controlling.';
        }

        return 'Check-raise: raising after checking builds a larger pot and applies maximum pressure. Your range should include both value hands and bluffs for balance.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 94: SESSION MILESTONE COACHING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 94: Generate coaching messages at session milestones.
     * Provides encouragement and targeted advice at key points:
     *   - Every 10 questions: quick progress check
     *   - Every 25 questions: deeper analysis
     *   - End of session: comprehensive review
     *
     * @param {number} questionNumber - Current question number
     * @returns {string|null} Coaching message or null if not a milestone
     */
    getMilestoneCoaching(questionNumber) {
        if (!this._sessionStats || this._sessionStats.total === 0) return null;

        const stats = this._sessionStats;
        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        const recentWindow = stats.recentWindow.slice(-10);
        const recentAcc = recentWindow.length > 0 ? Math.round((recentWindow.filter(Boolean).length / recentWindow.length) * 100) : 0;

        // Every 10 questions
        if (questionNumber % 10 === 0 && questionNumber > 0) {
            if (recentAcc >= 80) {
                return `▲ ${questionNumber} questions in! Last 10: ${recentAcc}% accuracy. You're in the zone — the solver would be proud.`;
            }
            if (recentAcc >= 60) {
                return `${questionNumber} questions in! Last 10: ${recentAcc}% accuracy. Solid progress — keep focusing on the explanations for spots you miss.`;
            }
            if (recentAcc >= 40) {
                return `${questionNumber} questions in! Last 10: ${recentAcc}% accuracy. Room to improve — try reading each explanation carefully and look for patterns in your mistakes.`;
            }
            return `${questionNumber} questions in! Last 10: ${recentAcc}% accuracy. Consider dropping down a level to build confidence, then come back stronger.`;
        }

        // Every 25 questions — deeper analysis
        if (questionNumber % 25 === 0 && questionNumber > 0) {
            const tracker = this._mistakeTracker || {};
            const weakest = Object.entries(tracker || {})
                .filter(([_, v]) => v.total >= 3 && v.mistakes / v.total >= 0.4)
                .sort(([_, a], [__, b]) => (b.mistakes / b.total) - (a.mistakes / a.total))
                .slice(0, 1);

            if (weakest.length > 0) {
                const [key, data] = weakest[0];
                const mistakeRate = Math.round((data.mistakes / data.total) * 100);
                return `${questionNumber}-question checkpoint! Overall: ${accuracy}%. Your biggest leak: "${key.replace(/_/g, '')}"(${mistakeRate}% mistake rate, ${data.total} samples). Focus on this area to see the biggest improvement.`;
            }
            return `${questionNumber}-question checkpoint! Overall accuracy: ${accuracy}%. ${accuracy >= 70 ? 'Great session — you\'re building strong GTO fundamentals.': 'Keep grinding — consistency is key to improving.'}`;
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 95: BOARD TEXTURE EVOLUTION TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 95: Describe how the board texture changed from previous street.
     * On turn and river, explains what changed and why it matters:
     *   - "Turn completed the flush draw"
     *   - "River bricked — all draws missed"
     *   - "Board paired, enabling full houses"
     *
     * @param {string[]} board - Full board cards (4 for turn, 5 for river)
     * @param {string} street - Current street (turn/river)
     * @returns {string} Texture evolution note
     */
    _getTextureEvolutionNote(board, street) {
        if (!board || street === 'flop' || street === 'preflop') return '';

        if (street === 'turn' && board.length >= 4) {
            const flopCards = board.slice(0, 3);
            const turnCard = board[3];
            return this._describeCardImpactV2(flopCards, turnCard, 'turn');
        }

        if (street === 'river' && board.length >= 5) {
            const turnBoard = board.slice(0, 4);
            const riverCard = board[4];
            return this._describeCardImpactV2(turnBoard, riverCard, 'river');
        }

        return '';
    }

    /**
     * Phase 95: Describe the impact of a new card on the existing board.
     */
    _describeCardImpactV2(existingBoard, newCard, streetName) {
        if (!newCard || !existingBoard || existingBoard.length < 3) return '';

        const newRank = newCard[0]?.toUpperCase();
        const newSuit = newCard[1]?.toLowerCase();
        const newVal = '23456789TJQKA'.indexOf(newRank);

        const boardRanks = existingBoard.map(c => c[0].toUpperCase());
        const boardSuits = existingBoard.map(c => c[1]?.toLowerCase());
        const boardVals = boardRanks.map(r => '23456789TJQKA'.indexOf(r));

        const impacts = [];

        // Check if the new card completes a flush
        const suitCounts = {};
        boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        if (newSuit && suitCounts[newSuit] >= 2) {
            const totalOfSuit = (suitCounts[newSuit] || 0) + 1;
            if (totalOfSuit >= 3 && existingBoard.length === 3) {
                impacts.push('puts a third flush card out — flush draws now have direct draws');
            } else if (totalOfSuit >= 4) {
                impacts.push('fourth flush card — flushes are now very likely');
            }
        }

        // Check if the new card pairs the board
        if (boardRanks.includes(newRank)) {
            impacts.push('pairs the board — full houses now possible');
        }

        // Check if the new card is an overcard to previous board
        const highestExisting = Math.max(...boardVals);
        if (newVal > highestExisting) {
            const overcardName = newRank;
            impacts.push(`${overcardName} is an overcard — shifts range advantage`);
        }

        // Check if the new card completes straight possibilities
        const allVals = [...boardVals, newVal].sort((a, b) => a - b);
        const uniqueVals = [...new Set(allVals)];
        // Check for 4-in-a-row
        for (let i = 0; i < uniqueVals.length - 3; i++) {
            if (uniqueVals[i + 3] - uniqueVals[i] === 3) {
                impacts.push('connects the board — many straights now possible');
                break;
            }
        }

        // Low card on a high board = blank
        if (impacts.length === 0 && newVal <= 5 && highestExisting >= 8) {
            impacts.push('low card on a high board — likely a blank that changes nothing');
        }

        // High card on a low board = dynamic
        if (impacts.length === 0 && newVal >= 9 && highestExisting <= 7) {
            impacts.push('overcard to the board — changes the equity landscape significantly');
        }

        if (impacts.length === 0) return '';
        return `${streetName.charAt(0).toUpperCase() + streetName.slice(1)} card impact: ${impacts.slice(0, 2).join('; ')}.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 96: OVERBETTING CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 96: Explain when and why overbetting (>100% pot) is the solver's choice.
     * Overbets are used when:
     *   - Hero has a strong nut advantage (range has many more nutted hands)
     *   - Villain's range is capped (can't have the nuts)
     *   - Board changed in a way that heavily favors hero's range
     *   - Maximizing value from the top of a polarized range
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {number} sizePct - Bet sizing percentage
     * @param {Object} texture - Board texture
     * @returns {string} Overbet context note
     */
    _getOverbetNote(optimalAction, handStrength, street, sizePct, texture) {
        if (sizePct < 100) return ''; // Only for overbets

        const hc = (handStrength || '').toLowerCase();
        const isNutted = hc.includes('nut') || hc.includes('full house') || hc.includes('quads') || hc.includes('set') || hc.includes('flush') || hc.includes('straight');
        const isAir = hc.includes('air') || hc.includes('no pair') || hc.includes('overcard');

        if (isNutted) {
            if (street === 'river') {
                return `Overbet for value: your nutted hand maximizes extraction by overbetting — villain's bluff-catchers face maximum pressure. They must call with their entire defend-vs-overbet range or let you profit.`;
            }
            return `Overbet for value: your strong hand leverages a nut advantage to overbet. This builds the maximum pot for when you have the goods and sets up large future bets.`;
        }

        if (isAir) {
            if (street === 'river') {
                return `Overbet bluff: with no showdown value, overbetting applies maximum fold pressure. Villain must defend narrowly against overbets — even strong one-pair hands often fold.`;
            }
            return `Overbet bluff: your hand has no showdown value. The overbet generates maximum fold equity — few hands in villain's range can profitably continue against this sizing.`;
        }

        if (hc.includes('draw')) {
            return `Overbet semi-bluff: massive sizing with a draw applies extreme fold pressure. If villain folds, you win immediately; if called, you have outs to improve.`;
        }

        return `Overbetting: the solver uses a size above pot to maximize leverage. This is a polarized play — your range here should be nutted hands for value and select bluffs.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 97: THIN VALUE BET RECOGNITION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 97: Identify when a bet is thin value — betting a hand that's only
     * marginally ahead of the calling range.
     *
     * Thin value is critical for GTO play because:
     *   - It extracts extra BB from spots most players check
     *   - It balances your betting range (not just nuts and bluffs)
     *   - Missing thin value is one of the biggest leaks for intermediate players
     *
     * @param {string} optimalAction - GTO correct action
     * @param {string} handStrength - categorizeHand() output
     * @param {string} street - Current street
     * @param {number} sizePct - Bet sizing percentage
     * @param {number} freq - Frequency of optimal action
     * @returns {string} Thin value note
     */
    _getThinValueNote(optimalAction, handStrength, street, sizePct, freq) {
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b');
        if (!isBet) return '';

        const hc = (handStrength || '').toLowerCase();

        // Thin value indicators: medium-strength hand + small-to-medium sizing + not pure
        const isMedium = hc.includes('middle pair') || hc.includes('bottom pair') || hc.includes('second pair') ||
                         hc.includes('weak pair') || (hc.includes('top pair') && !hc.includes('top kicker') && !hc.includes('good kicker'));

        if (isMedium && sizePct <= 50 && freq < 0.85) {
            if (street === 'river') {
                return `Thin value: betting ${handStrength} for thin value on the river. You beat bluff-catchers and some weaker pairs — missing this bet is a common leak. Only bet if you expect to be called by worse more than half the time.`;
            }
            if (street === 'turn') {
                return `Thin value: betting a medium-strength hand for value. This is thinly profitable — you beat some of villain's calling range, but be prepared to check the river if called.`;
            }
            return `Thin value: the solver bets this medium hand for a small amount, targeting worse hands that will call. Most players would check here — extracting thin value is what separates good from great.`;
        }

        // Top pair bad kicker thin value
        if (hc.includes('top pair') && !hc.includes('top kicker') && street === 'river' && sizePct <= 40) {
            return `Thin value: top pair without a premium kicker — betting small on the river targets second pair and other worse one-pair hands. This is a thin but profitable bet.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 98: GTO vs EXPLOITATIVE FRAMING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 98: Frame the explanation in terms of GTO principles vs. exploitative adjustments.
     * Helps players understand when they're at a "pure GTO" spot vs. a spot where
     * exploitative play differs significantly from GTO.
     *
     * @param {string} optimalAction - GTO correct action
     * @param {number} freq - Frequency of the action
     * @param {Object} handActions - All action frequencies
     * @param {string} handStrength - categorizeHand() output
     * @returns {string} GTO framing note
     */
    _getGTOFramingNote(optimalAction, freq, handActions, handStrength) {
        if (!handActions) return '';

        const mixedActions = Object.entries(handActions || {}).filter(([_, f]) => f > 0.05).length;

        // Pure strategy — GTO has one clear answer
        if (freq >= 0.95) {
            return 'GTO note: this is a pure strategy spot — the solver always takes this action. Exploitatively, this doesn\'t change unless villain deviates significantly.';
        }

        // Heavily mixed — GTO and exploitative diverge most here
        if (mixedActions >= 3 && freq < 0.50) {
            return `GTO note: highly mixed spot with ${mixedActions} actions. In practice, you should pick the highest-frequency action and deviate exploitatively based on villain tendencies.`;
        }

        // Close spot — both actions are correct
        if (mixedActions === 2 && freq < 0.65 && freq > 0.35) {
            return 'GTO note: close decision — the solver mixes nearly 50/50. Against unknown opponents, either action is fine. Against specific tendencies, exploit accordingly.';
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 99-100: ENGINE STATISTICS & VERSION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 99-100: Return comprehensive engine statistics.
     * Used for debugging, analytics, and understanding the system's capabilities.
     */
    getEngineStats() {
        return {
            version: '4.2.0-phase350',
            phasesImplemented: 350,
            explanationModules: {
                core: ['strategicConcept', 'sizingReason', 'mixingReason'],
                phase25_34: ['boardTexture', 'sizingReason'],
                phase42_46: ['riverContext', 'turnContext', 'flopContext'],
                phase60_62: ['blockerAwareness', 'rangeAdvantage', 'multiStreetPlan'],
                phase64_69: ['potOddsMath', 'sprContext'],
                phase72_73: ['enhancedTexture', 'villainTendency'],
                phase74_75: ['drawClassification', 'adaptiveDifficulty'],
                phase76_80: ['dynamicDepth', 'runoutImpact', 'equityRealization', 'positionStrategy', 'frequencyDeviation'],
                phase81_85: ['rangePolarization', 'trapDetection', 'boardCoverage', 'multiStreetEV', 'kickerStrength'],
                phase86_90: ['nutAdvantage', 'backdoorEquity', 'protectionUrgency', 'showdownValue', 'sessionSummary'],
                phase91_94: ['preflopEquityTiers', 'evComparison', 'checkRaiseStrategy', 'milestoneCoaching'],
                phase95_100: ['textureEvolution', 'overbetting', 'thinValue', 'gtoFraming', 'engineStats'],
                phase101_105: ['openRangeContext', '3betRangeContext', 'squeezeContext', 'blindDefenseTheory', 'positionEV'],
                phase106_110: ['cbetTheory', 'barrelTheory', 'donkBetTheory', 'mdfContext', 'probeBetTheory'],
                phase111_115: ['rangeCapping', 'reverseImpliedOdds', 'cardRemoval', 'impliedOdds', 'foldEquity'],
                phase116_120: ['combDraws', 'boardPairStrategy', 'aceHighBoards', 'monotoneBoards', 'lowBoards'],
                phase121_125: ['riverBluffCriteria', 'bluffCatching', 'rangeNarrowing', 'performanceTrend', 'relevanceScoring'],
                phase126_133: ['multiWayPots', 'betSizingTells', 'checkBackStrategy', 'delayedCBet', 'floatPlay', 'raiseVsCall', 'turnCardCategory', 'riverDecisionTree'],
                phase134_139: ['sprMatrix', 'stackDepthStrategy', 'potGeometry', 'rangeVsNutAdvantage', 'boardInteraction', 'equityDistribution'],
                phase140_142: ['gtoDeviationDetection', 'exploitativeSuggestions', 'handReadingNarration'],
                phase143_146: ['autoDifficulty', 'conceptMastery', 'weaknessTargeting', 'spacedRepetition'],
                phase147_150: ['evLossQuantification', 'optimalPlayComparison', 'detailedSessionReport', 'adaptiveCoaching'],
                phase151_155: ['rangeVisualization', 'actionHeatmap', 'evGraph', 'handRanking', 'nutBlockerBluffs'],
                phase156_160: ['equityDenial', 'potVsImplied', 'aggressionTracking', 'vpipPfr', 'positionalAwareness'],
                phase161_165: ['4bet5betTheory', 'multiStreetBluffs', 'checkRaiseSizing', 'riverOverbets', 'valueThickness'],
                phase166_170: ['mergedVsPolarized', 'nodeLocking', 'icmPressure', 'bubbleFactor', 'pushFold'],
                phase171_175: ['anteAdjustment', 'limpRaise', 'coldCalling', 'isoRaise', 'blindVsBlind'],
                phase176_180: ['difficultyScoring', 'mistakeMagnitude', 'streakMotivation', 'bestTracking', 'typeDiversity'],
                phase181_185: ['textureQuiz', 'rangeQuiz', 'potOddsQuiz', 'mixedStrategy', 'freqComparison'],
                phase186_190: ['opponentModeling', 'leakFinder', 'sessionPacing', 'confidenceCalibration', 'handReplay'],
                phase191_195: ['customDrills', 'progressiveComplexity', 'crossStreetConsistency', 'rangeThinking', 'solverTransparency'],
                phase196_200: ['thoughtPrompts', 'postHandAnalysis', 'mentalGame', 'bankrollNotes', 'engineOptimization'],
                phase201_207: ['equityBuckets', 'rangeMorphology', 'boardCoverageHeatmap', 'nutComboCounting', 'blockerMatrix', 'potCommitment', 'checkCallFold'],
                phase208_212: ['facingDonk', 'slowPlayChecklist', 'overbetChecklist', 'riverPolarizationIndex', 'evDecomposition'],
                phase213_218: ['actionClustering', 'scenarioTagging', 'adaptiveHints', 'explanationQuality', 'multiSizing', 'frequencyWeightedScoring'],
                phase219_225: ['challengeMode', 'achievements', 'conceptDependency', 'drillRecommendation', 'solverLineComparison', 'expectedFrequency', 'smartRecap'],
                phase226_232: ['rangeEquityCalc', 'deviationCostTracker', 'handCategoryDeepDive', 'runoutSimulation', '3betDefenseMatrix', 'aggressionCoaching', 'sizingOptimizer'],
                phase233_239: ['rangeAdvantageScore', 'villainRangeNarrowing', 'handEquityEstimate', 'drawEquityCalc', 'foldEquityCalc', 'evCalculator', 'bluffValueRatio'],
                phase240_245: ['sessionLeaderboard', 'trainingCalendar', 'conceptFlashcards', 'quickFireDrills', 'textureClassification12', 'actionTreeViz'],
                phase246_250: ['rangeVsRange', 'tournamentAdjustments', 'multiTableTips', 'tiltDetection', 'trainingDashboard'],
                phase251_255: ['structuredExplanations', 'leakReport', 'keyTakeaways', 'conceptSurface', 'patternRecognition'],
                phase256_260: ['sessionGrading', 'improvementVelocity', 'spotDifficulty', 'mistakeClassification', 'drillPrescription'],
                phase261_265: ['principleTeaching', 'positionReminders', 'textureStrategy', 'sprGuidance', 'rangeNarrowExplain'],
                phase266_270: ['multiStreetPlanning', 'freqSelfCorrect', 'tiltRecovery', 'sessionPacing', 'granularDifficulty'],
                phase271_275: ['handStrengthClassifier', 'equityVsRange', 'actionEVComparison', 'solverLineComparison', 'conceptMastery'],
                phase276_280: ['adaptiveHints', 'runoutImpactPreview', 'mixedFreqDrills', 'handCategoryBreakdown', 'sessionComparison'],
                phase281_285: ['preDecisionPreview', 'runningFreqTracker', 'mistakeClustering', 'boardCoverage', 'bluffValueRatio'],
                phase286_290: ['evLossHeatmap', 'quickFireReview', 'freqQuiz', 'positionLeaderboard', 'coachingSummary'],
                phase291_295: ['streakAnalysis', 'timePressure', 'rangeConstruction', 'exploitativeAdjust', 'icmPressure'],
                phase296_300: ['multiGameType', 'bettingSizeAnalysis', 'handReadingDrill', 'varianceSimulator', 'performanceTrend'],
                phase301_305: ['optimalLineNarration', 'streetTransition', 'defenseFrequency', 'polarizationIndex', 'mistakeRecovery'],
                phase306_310: ['conceptQuiz', 'sessionMilestones', 'adaptiveDrillRec', 'criticalHandHighlights', 'comprehensiveReport'],
                phase311_315: ['nodeTypeBreakdown', 'actionTimeline', 'streetSpecificLeaks', 'overbetAnalysis', 'checkRaiseAnalysis'],
                phase316_320: ['cbetAnalysis', 'positionPairAnalysis', 'freqConvergence', 'smartSessionLength', 'trainingPlan'],
                phase321_325: ['handStrengthDist', 'aggressionProfile', 'winRateByHand', 'tightLooseProfile', 'bluffSpotAnalysis'],
                phase326_330: ['valueBetAnalysis', 'sessionSummaryCard', 'difficultyProgression', 'weaknessHeatmap', 'gtoComplianceScore'],
                phase331_335: ['rangeBalance', 'checkBackAnalysis', 'donkBetAnalysis', 'multiWayPots', 'thinValueFreq'],
                phase336_340: ['protectionBets', 'showdownAnalysis', 'riverDecisionQuality', 'preFlopLeaks', 'sessionProgressChart'],
                phase341_345: ['equityRealization', 'potControl', 'boardTextureQuiz', 'stackDepthStrategy', 'mixedStrategyAccuracy'],
                phase346_350: ['endgameReport', 'playstyleEvolution', 'conceptReminders', 'nextSessionPrep', 'ultimatePlayerRating'],
            },
            totalExplanationNotes: 95, // Number of notes in allNotes pipeline
            smartNoteSelection: { concise: 1, standard: 3, verbose: 5, method: 'relevance-scored' },
            trackers: {
                sessionStats: !!this._sessionStats,
                mistakeTracker: !!this._mistakeTracker,
                mistakeTrackerDimensions: this._mistakeTracker ? Object.keys(this._mistakeTracker || {}).length : 0,
            },
            features: [
                'Deterministic solver-driven question generation',
                'Real PIO solver data (187k+ records)',
                'Adaptive difficulty (beginner/standard/expert)',
                'Dynamic explanation depth (concise/standard/verbose)',
                'Mistake pattern tracking across 8 dimensions',
                'Session weakness summary generation',
                'Milestone coaching messages',
                'Board runout impact predictions',
                'Equity realization context',
                'Position-aware strategy explanations',
                'Range polarization detection',
                'Trap/slow-play detection',
                'Nut advantage analysis',
                'Backdoor equity awareness',
                'Protection urgency assessment',
                'Showdown value vs bluff classification',
                'Solver frequency deviation warnings',
                'EV comparison in explanations',
                'Check-raise strategy context',
                'Board texture evolution tracking',
                'Overbet strategy explanations',
                'Thin value bet recognition',
                'GTO vs exploitative framing',
                'Kicker strength awareness',
                'Board coverage (range bet vs polar bet)',
                'Multi-street EV projection',
                'Preflop hand equity tier classification',
                'Open range context by position',
                '3-bet range theory (value vs bluff)',
                'Squeeze play dynamics',
                'Blind defense theory with MDF',
                'Position EV quantification',
                'C-bet theory (IP/OOP × wet/dry)',
                'Double/triple barrel strategy',
                'Donk bet theory',
                'MDF calculation context',
                'Probe bet theory',
                'Range capping detection',
                'Reverse implied odds warnings',
                'Card removal effects',
                'Implied odds calculation',
                'Fold equity analysis',
                'Combo draw recognition',
                'Paired board strategy',
                'Ace-high board dynamics',
                'Monotone board strategy',
                'Low board dynamics',
                'River bluff selection criteria',
                'Bluff-catcher identification',
                'Range narrowing across streets',
                'Performance trend tracking',
                'Relevance-scored note selection',
            ],
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 101: PREFLOP OPEN RANGE PERCENTAGES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 101: Provide approximate GTO open-raise range percentages by position.
     * Helps players understand where their hand falls in the opening range.
     */
    _getOpenRangeContext(heroPosition, heroHand) {
        if (!heroPosition || !heroHand) return '';
        const ranges = {
            'UTG': { pct: 13, desc: 'tight ~13%' }, 'UTG+1': { pct: 15, desc: '~15%' },
            'MP': { pct: 18, desc: '~18%' }, 'MP+1': { pct: 20, desc: '~20%' },
            'HJ': { pct: 23, desc: '~23%' }, 'CO': { pct: 30, desc: '~30%' },
            'BTN': { pct: 45, desc: '~45%' }, 'SB': { pct: 40, desc: '~40% (steal)' },
        };
        const r = ranges[heroPosition];
        if (!r) return '';
        const tier = this._getPreflopHandTier(heroHand);
        if (tier.tier === 'premium' || tier.tier === 'strong') {
            return `This hand is comfortably inside ${heroPosition}'s ${r.desc} opening range.`;
        }
        if (tier.tier === 'marginal' || tier.tier === 'speculative') {
            return `${heroPosition} opens ${r.desc} of hands — your hand is at or near the boundary. Position matters most for marginal opens.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 102: 3-BET RANGE CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 102: Explain 3-bet range construction — value vs bluff 3-bets.
     * GTO 3-bet ranges are polarized: premiums for value + suited Ax/Kx for bluffs.
     */
    _get3BetRangeContext(heroHand, heroPosition, villainPosition) {
        if (!heroHand || heroHand.length < 2) return '';
        const r1 = heroHand[0], r2 = heroHand[1];
        const suffix = heroHand.length >= 3 ? heroHand[2] : '';
        const isPair = r1 === r2;
        const isSuited = suffix === 's';
        const v1 = '23456789TJQKA'.indexOf(r1), v2 = '23456789TJQKA'.indexOf(r2);
        const isAx = r1 === 'A' || r2 === 'A';
        const isKx = (r1 === 'K' || r2 === 'K') && !isAx;

        // Value 3-bets
        if (isPair && v1 >= 9) { // JJ+ (J is index 9)
            return `3-bet for value: ${heroHand} is always in the value 3-bet range — too strong to flat and risk multiway pots.`;
        }
        if (isAx && (Math.min(v1, v2) >= 11 || (isSuited && Math.min(v1, v2) >= 10))) { // AK, AQs+
            return `3-bet for value: ${heroHand} — strong enough to 3-bet vs most positions. Building the pot preflop with a premium hand.`;
        }

        // Bluff 3-bets
        if (isAx && isSuited && Math.min(v1, v2) <= 5) { // A2s-A5s
            return `3-bet as a bluff: ${heroHand} — suited Ax blocks AA/AK in villain's range (removes ~16 combos) while having nut flush potential if called. Ideal 3-bet bluff.`;
        }
        if (isKx && isSuited && Math.min(v1, v2) <= 6) {
            return `3-bet as a bluff: ${heroHand} — suited Kx blocks KK/AK, removing key combos from villain's 4-bet/continue range. Good candidate for a polarized 3-bet.`;
        }

        // Flatting hands
        if (isPair && v1 >= 5 && v1 <= 8) { // 77-TT
            return `Medium pairs typically flat a raise rather than 3-bet — set mining value is highest when you see a flop, and 3-betting builds an awkward pot with a hand that's often behind.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 103: SQUEEZE PLAY CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 103: Explain squeeze play dynamics (3-bet over a raise + cold caller).
     */
    _getSqueezeContext(heroHand, heroPosition, nodeType, potType) {
        if (!potType || !potType.includes('squeeze') && !potType.includes('Squeeze')) return '';
        const tier = this._getPreflopHandTier(heroHand);
        if (tier.tier === 'premium' || tier.tier === 'strong') {
            return `Squeeze for value: with a strong hand against a raiser + cold caller, squeezing builds a large pot against two opponents who often have capped ranges.`;
        }
        if (tier.tier === 'marginal') {
            return `Squeeze as a semi-bluff: the cold caller often has a medium-strength hand that folds to a 3-bet. Squeezing picks up dead money from both opponents.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 104: BLIND DEFENSE THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 104: Explain BB defense theory — MDF and pot odds in blinds.
     * BB gets the best pot odds to defend (already invested 1bb).
     */
    _getBlindDefenseContext(heroPosition, optimalAction, heroHand, villainPosition) {
        if (heroPosition !== 'BB' && heroPosition !== 'SB') return '';
        const a = (optimalAction || '').toLowerCase();

        if (heroPosition === 'BB') {
            if (a === 'call') {
                return `BB defense: you're getting excellent pot odds (typically 2:1 or better) to call. The BB defends wide (~55-65% vs BTN open) because of the price — even marginal hands are profitable calls.`;
            }
            if (a === 'f') {
                return `BB fold: even though you have good pot odds, some hands are too weak to defend profitably — they play too poorly postflop OOP to justify the call.`;
            }
            if (a.startsWith('r')) {
                const tier = this._getPreflopHandTier(heroHand);
                if (tier.tier === 'premium') {
                    return `BB 3-bet for value: raising strong hands from the BB builds the pot while you're guaranteed to see a flop.`;
                }
                return `BB 3-bet: mixing raises into your BB defense range prevents villain from auto-profiting with steal attempts. Balance value raises with bluff 3-bets.`;
            }
        }

        if (heroPosition === 'SB') {
            if (a === 'call') {
                return `SB flat: SB flatting is generally discouraged in GTO — you'll be OOP postflop with the BB still to act. Consider 3-betting or folding instead.`;
            }
            if (a.startsWith('r')) {
                return `SB 3-bet: the preferred way to play from the SB is either fold or 3-bet — flatting creates a multiway pot where you're OOP, which is the worst outcome.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 105: PREFLOP POSITION ADVANTAGE QUANTIFIED
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 105: Quantify the positional advantage in BB/hand.
     * Research shows BTN is the most profitable seat (~10bb/100),
     * while SB is the most unprofitable (~-7bb/100).
     */
    _getPositionEVContext(heroPosition) {
        const posEV = {
            'BTN': '+10bb/100 — most profitable seat. IP postflop with widest stealing range.',
            'CO': '+5bb/100 — strong seat with IP advantage in most pots.',
            'HJ': '+2bb/100 — moderately profitable, narrower range but still favorable.',
            'MP': '~0bb/100 — break-even position, tight range required.',
            'UTG': '-1bb/100 — tightest range, often OOP postflop.',
            'SB': '-7bb/100 — most unprofitable seat. Always OOP postflop.',
            'BB': '-3bb/100 — forced investment, but best pot odds to defend.',
        };
        return posEV[heroPosition] ? `Position EV: ${heroPosition} averages ${posEV[heroPosition]}` : '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 106: CONTINUATION BET THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 106: Explain c-bet theory — when to c-bet, when to check.
     * Continuation bets are one of the most important postflop concepts.
     */
    _getCBetTheory(optimalAction, handStrength, street, nodeType, texture, heroPosition, villainPosition) {
        if (street !== 'flop' || nodeType !== 'hero_bets_or_checks') return '';
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b');
        const isCheck = a === 'c' || a === 'x';
        const isIP = this._isInPosition(heroPosition, villainPosition);
        const hc = (handStrength || '').toLowerCase();

        if (isBet) {
            if (isIP && texture && texture.dry) {
                return `C-bet theory: IP on a dry board — c-bet frequency should be high (70%+). Your range advantage is significant and villain rarely connects. Small sizing is most efficient.`;
            }
            if (isIP && texture && texture.wet) {
                return `C-bet theory: IP on a wet board — be selective. C-bet with strong hands, draws with equity, and give up weak holdings. Frequency drops to ~40-50%.`;
            }
            if (!isIP && texture && texture.dry) {
                return `C-bet theory: OOP on a dry board — c-betting is still effective but use a smaller size. Your range advantage as PFR still applies, but you lack position for future streets.`;
            }
            if (!isIP && texture && texture.wet) {
                return `C-bet theory: OOP on a wet board — the lowest c-bet frequency spot. Check more often to build a strong checking range. Only c-bet with strong hands and draws.`;
            }
        }

        if (isCheck) {
            if (isIP) {
                return `Checking IP as PFR: protecting your checking range by including some strong and medium hands. This prevents villain from probe-betting with impunity on the turn.`;
            }
            return `Checking OOP as PFR: building a strong checking range. On this board texture, checking allows you to check-raise with your strongest hands and check-call with draws.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 107: DOUBLE AND TRIPLE BARREL THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 107: Explain multi-street barreling — when to keep betting
     * and when to give up.
     */
    _getBarrelTheory(optimalAction, handStrength, street, texture, freq) {
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const hc = (handStrength || '').toLowerCase();

        if (street === 'turn' && isBet) {
            const isValue = hc.includes('overpair') || hc.includes('top pair') || hc.includes('set') || hc.includes('two pair') || hc.includes('flush') || hc.includes('straight');
            if (isValue) {
                return `Double barrel for value: continuing to bet strong hands on the turn builds the pot. Villain's flop calling range is now defined — extract from it.`;
            }
            if (hc.includes('draw') || hc.includes('oesd') || hc.includes('gutshot')) {
                return `Double barrel semi-bluff: barreling the turn with a draw maintains pressure. You have equity when called and fold equity against villain's weaker continuing range.`;
            }
            if (hc.includes('air') || hc.includes('no pair')) {
                return `Double barrel bluff: continuing the story on the turn. The turn card either helped your perceived range or you're targeting specific hands in villain's range that fold to continued pressure.`;
            }
        }

        if (street === 'turn' && isCheck) {
            if (hc.includes('air') || hc.includes('no pair') || hc.includes('overcard')) {
                return `Giving up on the turn: after c-betting the flop, not every hand should continue. Checking and giving up with air preserves your stack for better spots.`;
            }
        }

        if (street === 'river' && isBet) {
            if (hc.includes('air') || hc.includes('no pair')) {
                return `Triple barrel bluff: the ultimate test — betting all three streets with nothing. This only works against a range that can fold. Choose bluffs with good blockers to villain's calling range.`;
            }
            if (hc.includes('overpair') || hc.includes('top pair') || hc.includes('set') || hc.includes('flush') || hc.includes('straight')) {
                return `Triple barrel for value: betting all three streets with a strong hand maximizes extraction. Your sizing should target the specific hands villain calls with on the river.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 108: DONK BET THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 108: Explain donk betting — when the caller leads into the PFR.
     * Historically considered bad, but solvers use donk bets on specific textures.
     */
    _getDonkBetTheory(optimalAction, handStrength, street, nodeType, texture, heroPosition, villainPosition) {
        if (nodeType !== 'hero_bets_or_checks') return '';
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b');
        if (!isBet) return '';

        // Donk bet = caller leads into PFR
        const isPFR = !['SB', 'BB'].includes(heroPosition);
        if (isPFR) return ''; // PFR betting is a c-bet, not a donk

        const hc = (handStrength || '').toLowerCase();

        if (texture && texture.lowBoard) {
            return `Donk bet: leading into the PFR on a low board. Solver donk-bets here because the caller's range connects heavily with low/medium boards, giving you the range advantage.`;
        }
        if (texture && texture.paired) {
            return `Donk bet: leading on a paired board. The PFR's range misses trips as often as yours, so the informational disadvantage of donking is minimal while you seize the initiative.`;
        }
        if (hc.includes('set') || hc.includes('two pair')) {
            return `Donk bet with a monster: leading with a strong hand disguises your hand strength. Many players don't expect donk bets to be value-heavy, which gets you more action.`;
        }

        return `Donk bet: leading into the preflop raiser. Modern solvers use donk bets on specific board textures where the caller's range advantage justifies taking the betting lead.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 109: MINIMUM DEFENSE FREQUENCY (MDF)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 109: Calculate and explain MDF — the minimum percentage of range
     * that must defend to prevent villain from auto-profiting with bluffs.
     * MDF = 1 - (bet size / (pot + bet size))
     */
    _getMDFContext(optimalAction, street, nodeType, estimatedPot) {
        if (nodeType !== 'hero_faces_bet' || !estimatedPot) return '';
        const a = (optimalAction || '').toLowerCase();

        // Estimate bet size from the solver action
        const betMatch = a.match(/^[br](\d+)$/);
        const isCall = a === 'call';
        const isFold = a === 'f';

        if (!isFold && !isCall) return '';

        // We need the bet size villain used — estimate from common sizing
        // In facing-bet spots, the bet size is typically in the scenario
        // Use a reasonable default
        const commonBetPct = 67; // approximate
        const betSize = estimatedPot * (commonBetPct / 100);
        const totalPot = estimatedPot + betSize;
        const mdf = 1 - (betSize / totalPot);
        const mdfPct = Math.round(mdf * 100);

        if (isFold) {
            return `MDF note: against a ~${commonBetPct}% pot bet, you need to defend ~${mdfPct}% of your range to prevent villain from auto-profiting with bluffs. Folding here is fine — this hand is below your defense threshold.`;
        }
        if (isCall) {
            return `MDF note: against a ~${commonBetPct}% pot bet, MDF is ~${mdfPct}%. Calling keeps your defense frequency honest and prevents villain from exploiting with excessive bluffs.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 110: PROBE BET THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 110: Explain probe bets — when you bet into the PFR after they
     * checked the previous street.
     */
    _getProbeBetTheory(optimalAction, handStrength, street, nodeType, texture) {
        if (street === 'flop' || nodeType !== 'hero_bets_or_checks') return '';
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b');
        if (!isBet) return '';

        const hc = (handStrength || '').toLowerCase();

        // Probe bet = betting when PFR checked previous street (indicating weakness)
        if (street === 'turn') {
            if (hc.includes('air') || hc.includes('no pair') || hc.includes('overcard')) {
                return `Probe bet: betting the turn after PFR checked flop. Their check signals a capped range — they would have c-bet with strong hands. Exploit this weakness with a probe bet.`;
            }
            if (hc.includes('pair') || hc.includes('draw')) {
                return `Probe bet for thin value: PFR's flop check caps their range. You can bet thinner for value here because their range is weaker than if they had c-bet.`;
            }
        }

        if (street === 'river') {
            return `River probe: villain has checked two streets, heavily capping their range. A well-timed river bet exploits their passivity — they rarely have strong hands after checking twice.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 111: OPPONENT RANGE CAPPING DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 111: Detect when villain's range is capped (limited to non-nutted hands).
     * Capped ranges allow hero to apply more pressure.
     */
    _getRangeCappingNote(street, nodeType, texture) {
        if (street === 'preflop') return '';

        // Villain's range is capped when they've made passive actions
        if (nodeType === 'hero_bets_or_checks') {
            // If we're the one to act, villain checked to us
            if (street === 'turn') {
                return 'Range capping: villain checked to you on the turn. If they c-bet the flop and checked the turn, their range is capped — they likely don\'t have strong value hands, which they would have bet. Increase your bluffing frequency.';
            }
            if (street === 'river') {
                return 'Range capping: two checks from villain suggests a heavily capped range. Strong hands would have bet for value on at least one street. You can bluff more aggressively here.';
            }
        }

        if (nodeType === 'hero_faces_bet' && street === 'river') {
            if (texture && texture.wet) {
                return 'Villain betting river on a wet board: if draws completed, villain\'s bet could be a made flush/straight. If draws missed, their range is polarized — they either have it or they\'re bluffing.';
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 112: REVERSE IMPLIED ODDS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 112: Explain reverse implied odds — when making your hand
     * will lose you even more money.
     */
    _getReverseImpliedOddsNote(handStrength, street, texture) {
        if (street === 'preflop' || street === 'river') return '';
        const hc = (handStrength || '').toLowerCase();

        // Non-nut flush draws
        if (hc.includes('flush draw') && !hc.includes('nut') && !hc.includes('strong')) {
            return `Reverse implied odds: your non-nut flush draw is dangerous — if you hit, a higher flush could cost you your entire stack. Proceed with caution.`;
        }

        // Bottom-end straight draws
        if (hc.includes('bottom-end') || hc.includes('baby straight')) {
            return `Reverse implied odds: completing a bottom-end straight means higher straights are also possible. You might make your hand and still lose a big pot.`;
        }

        // Dominated top pair
        if (hc.includes('top pair') && (hc.includes('weak kicker') || hc.includes('bad kicker'))) {
            if (texture && texture.wet) {
                return `Reverse implied odds: top pair with a weak kicker on a wet board is dangerous. You might pay off better top pairs or two pairs/sets.`;
            }
        }

        // Second pair facing aggression
        if ((hc.includes('middle pair') || hc.includes('second pair') || hc.includes('bottom pair'))) {
            return `Reverse implied odds: medium/small pairs have significant reverse implied odds — when villain has a better hand, you'll often lose more than you gain from catching bluffs.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 113: CARD REMOVAL EFFECTS (COMBINATORICS)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 113: Explain card removal (blocker) effects quantitatively.
     * When hero holds certain cards, it changes the number of combos
     * villain can have of specific hands.
     */
    _getCardRemovalNote(heroHand, board, handStrength, optimalAction) {
        if (!heroHand || heroHand.length < 2) return '';
        const r1 = heroHand[0].toUpperCase(), r2 = heroHand[1].toUpperCase();
        const a = (optimalAction || '').toLowerCase();
        const hc = (handStrength || '').toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isFold = a === 'f';

        // Ace blocker effects
        if (r1 === 'A' || r2 === 'A') {
            if (isBet && (hc.includes('air') || hc.includes('no pair'))) {
                return `Card removal: holding an Ace removes 3 combos of AA, 4 combos of AK, and blocks villain's strongest holdings. This makes your bluff more effective — villain is less likely to have the nuts.`;
            }
            if (isFold) {
                return `Card removal: your Ace blocks AA/AK combos, reducing the chance villain has premiums. However, other factors outweigh this blocker effect in this spot.`;
            }
        }

        // King blocker
        if (r1 === 'K' || r2 === 'K') {
            if (isBet && (hc.includes('air') || hc.includes('no pair'))) {
                return `Card removal: holding a King blocks KK (3 combos) and AK (8 combos). This is a good bluffing blocker — villain is less likely to have a hand that can comfortably call.`;
            }
        }

        // Flush blocker
        if (board && board.length >= 3) {
            const boardSuits = board.map(c => c[1]?.toLowerCase());
            const suitCounts = {};
            boardSuits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
            const flushSuit = Object.entries(suitCounts || {}).find(([_, c]) => c >= 3)?.[0];
            if (flushSuit && !hc.includes('flush')) {
                // Hero's cards that block the flush suit
                const heroSuits = [];
                // We don't know exact suits but can note the concept
                if (isBet) {
                    return `Card removal on a flush board: if you block the nut flush suit, villain has fewer flush combos. Blocking the A or K of the flush suit is a powerful bluffing factor.`;
                }
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 114: IMPLIED ODDS CALCULATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 114: Calculate and explain implied odds for drawing hands.
     * Implied odds = how much you expect to win on future streets if you hit.
     */
    _getImpliedOddsNote(handStrength, street, optimalAction, estimatedPot, stackDepth) {
        if (!estimatedPot || !stackDepth || street === 'river' || street === 'preflop') return '';
        const hc = (handStrength || '').toLowerCase();
        const a = (optimalAction || '').toLowerCase();
        const isCall = a === 'call';
        if (!isCall) return '';

        const isDraw = hc.includes('draw') || hc.includes('oesd') || hc.includes('gutshot');
        if (!isDraw) return '';

        const remainingStack = stackDepth - estimatedPot;
        if (remainingStack <= 0) return '';

        const impliedOddsRatio = remainingStack / estimatedPot;

        if (impliedOddsRatio >= 5) {
            return `Implied odds: excellent (${impliedOddsRatio.toFixed(1)}x pot behind). When you hit your draw, villain's stack provides massive implied odds. Even marginal draws become profitable calls.`;
        }
        if (impliedOddsRatio >= 2) {
            return `Implied odds: good (${impliedOddsRatio.toFixed(1)}x pot behind). Enough stack depth to profit when your draw completes. Focus on draws that make the nuts.`;
        }
        if (impliedOddsRatio < 1) {
            return `Implied odds: poor — not much stack left behind (${impliedOddsRatio.toFixed(1)}x pot). You need direct pot odds to justify calling, as there's little extra money to win.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 115: FOLD EQUITY ESTIMATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 115: Estimate fold equity and explain when it matters.
     * Fold equity = the chance villain folds to your bet/raise.
     */
    _getFoldEquityNote(optimalAction, handStrength, street, nodeType, freq) {
        const a = (optimalAction || '').toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isRaise = a.startsWith('r');
        if (!isBet && !isRaise) return '';

        const hc = (handStrength || '').toLowerCase();
        const hasShowdownValue = hc.includes('pair') || hc.includes('flush') || hc.includes('straight') || hc.includes('set');
        const noShowdownValue = hc.includes('air') || hc.includes('no pair') || hc.includes('overcard');
        const isDraw = hc.includes('draw') || hc.includes('oesd') || hc.includes('gutshot');

        if (noShowdownValue) {
            if (street === 'river') {
                return `Fold equity is everything: with no showdown value, your entire profit comes from villain folding. Your bluff needs to work often enough to compensate for the times you're caught.`;
            }
            return `Fold equity driven: your hand can't win at showdown, so betting relies entirely on fold equity. The more polarized your range looks, the more fold equity you generate.`;
        }

        if (isDraw) {
            return `Combined equity: your semi-bluff has both fold equity (villain folds now) and draw equity (you improve when called). This dual equity makes aggressive play with draws highly profitable.`;
        }

        if (hasShowdownValue && isRaise && street === 'river') {
            return `Value raise with fold equity bonus: you're raising for value, but some of villain's calling range also folds, adding fold equity to your already-profitable raise.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 116: COMBO DRAW POWER RANKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 116: Quantify combo draw strength — total outs and equity.
     */
    _getCombDrawNote(handStrength) {
        const hc = (handStrength || '').toLowerCase();
        if (!hc.includes('combo draw') && !hc.includes('monster draw')) return '';

        let outs = 0;
        const parts = [];
        if (hc.includes('flush draw')) { outs += 9; parts.push('9 flush outs'); }
        if (hc.includes('oesd') || hc.includes('open-ended')) { outs += 8; parts.push('8 straight outs'); }
        else if (hc.includes('gutshot')) { outs += 4; parts.push('4 gutshot outs'); }
        if (hc.includes('overcard')) { outs += 6; parts.push('~6 overcard outs'); }

        // Remove double-counted outs (typically ~2 overlap between flush and straight)
        if (parts.length >= 2) outs = Math.max(outs - 2, outs * 0.85);

        const equityFlop = Math.min(outs * 4, 70); // Rule of 4 (capped)
        const equityTurn = Math.min(outs * 2, 45); // Rule of 2

        if (outs >= 12) {
            return `Monster draw: ~${Math.round(outs)} outs (${parts.join(' + ')}). Approximately ${Math.round(equityFlop)}% equity on the flop — you're actually a mathematical favorite vs most one-pair hands. Play aggressively.`;
        }
        return `Combo draw: ~${Math.round(outs)} outs (${parts.join(' + ')}). ~${Math.round(equityFlop)}% equity on flop. Strong enough to semi-bluff aggressively.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 117: BOARD PAIR IMPLICATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 117: Explain strategic implications of a paired board.
     */
    _getBoardPairNote(handStrength, texture, street) {
        if (!texture || !texture.paired || street === 'preflop') return '';
        const hc = (handStrength || '').toLowerCase();

        if (hc.includes('full house') || hc.includes('quads')) {
            return `Paired board: you have the nuts or near it. Paired boards reduce the number of strong hands in villain's range, making your monster even more disguised.`;
        }
        if (hc.includes('trips') || hc.includes('three of a kind')) {
            return `Paired board: you have trips — strong but vulnerable to full houses. Villain's pocket pairs could be full houses, so be cautious if raised.`;
        }
        if (hc.includes('flush') || hc.includes('straight')) {
            return `Paired board warning: your flush/straight is vulnerable to full houses. Paired boards allow trips and full houses that beat you. Size for value but be ready to fold to raises.`;
        }
        if (hc.includes('pair') && !hc.includes('two pair')) {
            return `Paired board: one-pair hands play cautiously on paired boards. The pair on the board means fewer combinations of strong hands exist, but any trip or full house has you crushed.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 118: ACE-HIGH BOARD DYNAMICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 118: Specific strategy for ace-high boards (most common board type).
     */
    _getAceHighBoardNote(handStrength, texture, street, nodeType, heroPosition) {
        if (!texture || !texture.aceHigh || street === 'preflop') return '';
        const hc = (handStrength || '').toLowerCase();

        if (hc.includes('top pair') && hc.includes('ace')) {
            return `Ace-high board with top pair: you have the nuts in terms of one-pair hands. The PFR's range heavily favors Ax, so you can bet confidently for value.`;
        }
        if (hc.includes('pair') && !hc.includes('ace') && !hc.includes('top pair')) {
            return `Ace-high board without an ace: your pair is dominated by all the Ax combos in villain's range. Play cautiously — you're often behind.`;
        }
        if (hc.includes('air') || hc.includes('no pair')) {
            if (nodeType === 'hero_bets_or_checks') {
                return `Ace-high board with air: the Ace on the board is great for bluffing as PFR — your range is perceived to have many Ax hands. Villain will fold pairs below top pair.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 119: MONOTONE BOARD STRATEGY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 119: Strategy for monotone (3+ cards same suit) boards.
     */
    _getMonotoneBoardNote(handStrength, texture, street) {
        if (!texture || !texture.monotone || street === 'preflop') return '';
        const hc = (handStrength || '').toLowerCase();

        if (hc.includes('nut flush')) {
            return `Monotone board with nut flush: you have the nuts. Bet for value — anyone with a lower flush or a pair will often pay you off.`;
        }
        if (hc.includes('flush') && !hc.includes('nut')) {
            return `Monotone board with a non-nut flush: be cautious. The board having 3+ of a suit means anyone with a higher card of that suit beats you. Size for thin value but don't overcommit.`;
        }
        if (hc.includes('flush draw') && !hc.includes('nut')) {
            return `Monotone board with a flush draw: dangerous situation. Even if you hit, you might not have the best flush. Nut draws are valuable; non-nut draws have significant reverse implied odds.`;
        }
        if (!hc.includes('flush') && !hc.includes('flush draw')) {
            return `Monotone board without flush equity: play defensively. Anyone with a single card of the flush suit has a draw, and made flushes are common. One-pair hands are significantly devalued.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 120: LOW BOARD DYNAMICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 120: Strategy for low boards (highest card ≤ 8).
     */
    _getLowBoardNote(handStrength, texture, street, heroPosition, nodeType) {
        if (!texture || !texture.lowBoard || street === 'preflop') return '';
        const hc = (handStrength || '').toLowerCase();

        if (hc.includes('overpair')) {
            return `Low board with overpair: your hand is very strong but vulnerable to sets and two pairs. Villain's BB defense range connects heavily with low cards — bet for value and protection.`;
        }
        if (hc.includes('air') || hc.includes('no pair')) {
            if (nodeType === 'hero_bets_or_checks') {
                return `Low board with overcards: your range advantage as PFR is reduced on low boards. Villain's wide calling range hits these boards often. Be selective with bluffs.`;
            }
        }
        if (hc.includes('set') || hc.includes('two pair')) {
            return `Low board with a strong made hand: excellent spot. Low boards heavily favor the caller's range, so when you have a monster, villain's strong hands (two pairs, straights) will often pay you off.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 121: RIVER BLUFF SELECTION CRITERIA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 121: Explain what makes a good river bluff candidate.
     */
    _getRiverBluffCriteria(heroHand, handStrength, board, optimalAction, street) {
        if (street !== 'river') return '';
        const a = (optimalAction || '').toLowerCase();
        if (!a.startsWith('b') && a !== 'allin') return '';
        const hc = (handStrength || '').toLowerCase();
        if (!hc.includes('air') && !hc.includes('no pair') && !hc.includes('overcard') && !hc.includes('missed')) return '';

        const r1 = heroHand?.[0]?.toUpperCase(), r2 = heroHand?.[1]?.toUpperCase();
        const criteria = [];

        // Blockers to calling range
        if (r1 === 'A' || r2 === 'A') criteria.push('blocks top pair/overpairs');
        if (r1 === 'K' || r2 === 'K') criteria.push('blocks second-best holdings');

        // Missed draws are good bluff candidates
        if (hc.includes('missed') || hc.includes('draw')) criteria.push('missed draw — naturally arrives at river without a made hand');

        // No showdown value
        criteria.push('zero showdown value — can only win by betting');

        if (criteria.length > 0) {
            return `River bluff selection: your hand qualifies because: ${criteria.join('; ')}. Ideal river bluffs combine blocker effects with no showdown equity.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 122: RIVER BLUFF-CATCHING CRITERIA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 122: Explain what makes a hand a good bluff-catcher on the river.
     */
    _getBluffCatcherNote(handStrength, optimalAction, street, nodeType) {
        if (street !== 'river' || nodeType !== 'hero_faces_bet') return '';
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'call') return '';
        const hc = (handStrength || '').toLowerCase();

        const isBluffCatcher = hc.includes('pair') && !hc.includes('two pair') && !hc.includes('set') && !hc.includes('overpair');

        if (isBluffCatcher) {
            return `Bluff-catching: your one-pair hand beats bluffs but loses to value bets. The decision comes down to: does villain bluff enough in this spot? If villain's bluff-to-value ratio exceeds your pot odds, calling is correct.`;
        }

        if (hc.includes('overpair') || hc.includes('top pair')) {
            return `Strong bluff-catcher: your hand is near the top of the bluff-catching range. Calling is correct because folding would let villain profit by bluffing with impunity in this spot.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 123: STREET-BY-STREET RANGE NARROWING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 123: Explain how ranges narrow across streets.
     */
    _getRangeNarrowingNote(street, nodeType) {
        if (street === 'preflop' || street === 'flop') return '';

        if (street === 'turn') {
            if (nodeType === 'hero_faces_bet') {
                return `Range narrowing: by the turn, both ranges have narrowed significantly from the flop. Villain's betting range is now weighted toward strong made hands and draws — medium hands would have checked.`;
            }
            return `Range narrowing: the turn is where ranges start to crystallize. Hands that continued from the flop either improved, had draws, or were strong enough to keep investing.`;
        }

        if (street === 'river') {
            if (nodeType === 'hero_faces_bet') {
                return `Range narrowing: villain's river betting range is highly polarized — they either have a strong hand (value) or nothing (bluff). Medium-strength hands check the river for showdown. Use this to calibrate your calling decision.`;
            }
            return `Range narrowing: by the river, ranges are at their narrowest. Decisions are binary: bet for value/bluff or check for showdown. Every hand in your range should have a clear purpose.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 124: SESSION PERFORMANCE TREND TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 124: Track performance trends within a session — are you improving
     * or declining as the session progresses?
     */
    getPerformanceTrend() {
        if (!this._sessionStats || this._sessionStats.total < 10) return null;

        const window = this._sessionStats.recentWindow;
        if (window.length < 10) return null;

        const firstHalf = window.slice(0, Math.floor(window.length / 2));
        const secondHalf = window.slice(Math.floor(window.length / 2));

        const firstAcc = firstHalf.filter(Boolean).length / firstHalf.length;
        const secondAcc = secondHalf.filter(Boolean).length / secondHalf.length;
        const diff = secondAcc - firstAcc;

        if (diff > 0.15) {
            return { trend: 'improving', diff: Math.round(diff * 100), message: `Your accuracy is improving! Up ${Math.round(diff * 100)}% in the second half of your session. You're warming up and making better decisions.` };
        }
        if (diff < -0.15) {
            return { trend: 'declining', diff: Math.round(diff * 100), message: `Your accuracy is declining (${Math.round(Math.abs(diff) * 100)}% drop). Consider taking a break — decision fatigue is real in poker training.` };
        }
        return { trend: 'stable', diff: Math.round(diff * 100), message: `Consistent performance throughout the session. You're maintaining focus well.` };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 125: COMPREHENSIVE EXPLANATION RELEVANCE SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 125: Score explanation notes for relevance to the specific hand.
     * Instead of just taking the first N notes, score each note and pick
     * the most relevant ones for this specific situation.
     *
     * Scoring factors:
     *   - Specificity (hand-specific > generic)
     *   - Actionability (teaches something concrete > abstract)
     *   - Street relevance (river notes on river > generic notes)
     *   - Player weakness (notes in weak areas score higher)
     */
    _scoreNoteRelevance(note, handStrength, street, optimalAction) {
        if (!note) return 0;
        let score = 1.0;
        const n = note.toLowerCase();
        const hc = (handStrength || '').toLowerCase();

        // Specificity bonus — notes that mention the specific hand type
        if (hc.includes('flush draw') && n.includes('flush')) score += 2;
        if (hc.includes('set') && (n.includes('set') || n.includes('trap'))) score += 2;
        if (hc.includes('top pair') && n.includes('top pair')) score += 1.5;
        if (hc.includes('air') && (n.includes('bluff') || n.includes('fold equity') || n.includes('showdown'))) score += 2;
        if (hc.includes('overbet') && n.includes('overbet')) score += 3;

        // Actionability bonus — concrete advice
        if (n.includes('bet') || n.includes('check') || n.includes('fold') || n.includes('call') || n.includes('raise')) score += 0.5;

        // Street relevance
        if (street === 'river' && n.includes('river')) score += 1;
        if (street === 'turn' && n.includes('turn')) score += 1;
        if (street === 'flop' && (n.includes('c-bet') || n.includes('flop'))) score += 1;

        // Warning/coaching markers
        if (n.includes('▲') || n.includes('') || n.includes('warning') || n.includes('caution')) score += 1;

        // Numeric/quantitative notes (EV, percentage, outs)
        if (n.includes('%') || n.includes('bb') || n.includes('outs') || n.includes('equity')) score += 0.5;

        // Check if this relates to a tracked weakness
        if (this._mistakeTracker) {
            const handBucket = this._getHandBucket(handStrength);
            const streetKey = `street:${street}`;
            const handKey = `hand:${handBucket}`;
            if (this._mistakeTracker[streetKey]?.mistakes > 0) score += 1;
            if (this._mistakeTracker[handKey]?.mistakes > 0) score += 1.5;
        }

        return score;
    }

    /**
     * Normalize categorizeHand() free-text output into a snake_case token
     * so the Phase 126+ helpers can compare against their enum values.
     */
    _getHandToken(handStrength) {
        const hc = (handStrength || '').toLowerCase();
        // GTOW parity #33 — this normaliser converts categorizeHand()'s free
        // prose ("top pair, top kicker") into the snake_case token the coaching
        // notes switch on. It was NOT idempotent: handed a token that already
        // matched, every `includes('top pair')` test failed on the underscore
        // and the function returned 'air'. That mattered the moment the raw
        // enum comparisons below were routed through here, because some of
        // their callers already pass tokens. Passing a known token straight
        // back makes the function safe to apply to either representation, which
        // is what lets one normaliser serve every consumer.
        if (_HAND_TOKENS.has(hc)) return hc;
        if (hc.includes('straight flush') || hc.includes('quads') || hc.includes('four of a kind')) return 'nuts';
        if (hc.includes('full house')) return 'full_house';
        if (hc.includes('flush') && !hc.includes('draw')) return 'flush';
        if (hc.includes('straight') && !hc.includes('draw')) return 'straight';
        if (hc.includes('set') || hc.includes('trips') || hc.includes('three of a kind')) return 'set';
        if (hc.includes('two pair')) return 'two_pair';
        if (hc.includes('overpair')) return 'overpair';
        if (hc.includes('top pair, top kicker') || hc.includes('top pair top kicker')) return 'top_pair_top_kicker';
        if (hc.includes('top pair')) return 'top_pair';
        if (hc.includes('middle pair') || hc.includes('second pair')) return 'middle_pair';
        if (hc.includes('bottom pair') || hc.includes('weak pair') || hc.includes('underpair') || hc.includes('pocket pair')) return 'weak_pair';
        if (hc.includes('combo draw')) return 'combo_draw';
        if (hc.includes('flush draw')) return 'flush_draw';
        if (hc.includes('oesd') || hc.includes('open-ended')) return 'oesd';
        if (hc.includes('gutshot')) return 'gutshot';
        if (hc.includes('overcard')) return 'overcards';
        return 'air';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 126: MULTI-WAY POT ADJUSTMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 126: Explain how multi-way dynamics change strategy.
     * In multi-way pots, bluffing frequency drops, value range tightens.
     */
    _getMultiWayNote(nodeType, potType, handStrength, optimalAction) {
        if (!potType || !potType.toLowerCase().includes('multi')) return '';
        const a = (optimalAction || '').toLowerCase();
        const handToken = this._getHandToken(handStrength);
        const isStrong = ['nuts', 'second_nuts', 'overpair', 'top_pair_top_kicker', 'top_pair', 'two_pair', 'set', 'trips', 'straight', 'flush', 'full_house'].includes(handToken);
        const isMedium = ['middle_pair', 'top_pair_weak_kicker', 'second_pair', 'third_pair', 'weak_pair'].includes(handToken);

        if (a === 'f' && isMedium) {
            return 'Multi-way pot: medium-strength hands lose significant value with multiple opponents — more players means someone likely has you beat. Folding marginal hands is correct.';
        }
        if (this._isAggressiveAction(a) && isStrong) {
            return 'Multi-way pot: with a strong hand, bet for value against multiple opponents who may each have some equity. Thin value goes up when facing wide ranges.';
        }
        if (a === 'call' || a === 'x') {
            return 'Multi-way pot: bluffing frequency drops dramatically — more players means more chance someone has a calling hand. Play honestly and wait for strong holdings.';
        }
        return 'Multi-way pot: tighten your range significantly. Bluff less, value bet more, and be cautious with medium-strength hands.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 127: BET SIZING TELLS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 127: What different bet sizes signal about villain's range.
     * Small bets = merged/wide range, large bets = polarized range.
     */
    _getBetSizingTellNote(nodeType, street, optimalAction) {
        if (!optimalAction) return '';
        const a = optimalAction.toLowerCase();
        // Extract sizing from action like 'r50', 'b33', or 'r125'
        const sizePct = this._actionSizePct(a);
        if (sizePct == null) return '';

        if (sizePct <= 33) {
            return `Small bet (${sizePct}% pot): signals a merged/depolarized range. Villain bets this size with both value and marginal hands — your bluff-catching threshold is lower. Defend wider.`;
        }
        if (sizePct <= 50) {
            return `Medium-small bet (${sizePct}% pot): common for range bets where villain c-bets their entire range. Indicates board favors their range but they're not committing heavily.`;
        }
        if (sizePct <= 75) {
            return `Standard sizing (${sizePct}% pot): balanced between value and bluffs. Villain's range is somewhat polarized — they have both strong hands and bluffs at this size.`;
        }
        if (sizePct <= 100) {
            return `Large bet (${sizePct}% pot): polarized range — villain has either a strong value hand or a bluff. Middle-strength hands rarely use this sizing. Bluff-catch or fold.`;
        }
        return `Overbet (${sizePct}% pot): maximally polarized. Villain is either nutted or bluffing — no medium-strength hands. Call with top of range, fold everything else.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 128: CHECK-BACK STRATEGY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 128: When to check back in position — pot control, deception, thin value.
     */
    _getCheckBackNote(optimalAction, handStrength, street, texture, heroPosition, villainPosition) {
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'x' && a !== 'check') return '';
        const isIP = this._isInPosition(heroPosition, villainPosition);
        if (!isIP) return ''; // Check-back only applies IP

        const handToken = this._getHandToken(handStrength);
        const isMedium = ['middle_pair', 'top_pair_weak_kicker', 'second_pair', 'third_pair'].includes(handToken);
        const isStrong = ['overpair', 'top_pair_top_kicker', 'top_pair', 'two_pair', 'set'].includes(handToken);
        const isWeak = ['high_card', 'ace_high', 'underpair', 'weak_pair', 'overcards', 'air'].includes(handToken);
        const isDry = texture && (texture.dry || !(texture.flushy || texture.monotone));

        if (isMedium && street === 'flop') {
            return 'Check-back for pot control: medium-strength hands benefit from seeing another card cheaply. Betting risks getting raised off the best hand or building a pot you can\'t win.';
        }
        if (isStrong && isDry && street === 'flop') {
            return 'Check-back to trap: on a dry board, villain has few draws. Checking back a strong hand disguises your strength and may induce bluffs on later streets.';
        }
        if (isWeak && street === 'turn') {
            return 'Check-back with air: give up on the bluff when villain has shown interest. Saving your stack for better spots is a key part of GTO play.';
        }
        if (street === 'river') {
            return 'Check-back on river: your hand has showdown value but isn\'t strong enough to bet for value — betting only gets called by better and folds out worse.';
        }
        return 'Check-back: controlling the pot and realizing equity. Not every hand needs to bet — sometimes checking maximizes EV by keeping the pot manageable.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 129: DELAYED C-BET THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 129: Delayed c-bet — checking flop, betting turn.
     * Common on boards that favor the caller's range.
     */
    _getDelayedCBetNote(optimalAction, handStrength, street, nodeType, texture) {
        const handToken = this._getHandToken(handStrength);
        if (street !== 'turn') return '';
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';
        // This is relevant when the PFR checked flop and now bets turn
        if (nodeType !== 'delayed_cbet' && nodeType !== 'probe') return '';

        const isDrawy = texture && (texture.wet || texture.flushy || texture.monotone);
        const isMedium = ['middle_pair', 'top_pair_weak_kicker', 'second_pair'].includes(handToken);

        if (isDrawy) {
            return 'Delayed c-bet: by checking the flop and betting the turn, you represent a hand that improved or was trapping. On draw-heavy boards, this pressures opponents who floated with draws that missed.';
        }
        if (isMedium) {
            return 'Delayed c-bet with a medium hand: checking the flop kept the pot small, and now you can value bet the turn against hands that would have check-raised you on the flop.';
        }
        return 'Delayed c-bet: checking the flop and betting the turn is a powerful line that keeps your range strong. Villain may have given up on bluffs, making this a profitable spot.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 130: FLOAT PLAY THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 130: Float play — calling in position with the plan to take the pot away later.
     */
    _getFloatPlayNote(optimalAction, handStrength, street, heroPosition, villainPosition) {
        if (street !== 'flop') return '';
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'call') return '';
        const isIP = this._isInPosition(heroPosition, villainPosition);
        if (!isIP) return '';

        const handToken = this._getHandToken(handStrength);
        const isWeak = ['high_card', 'ace_high', 'underpair', 'gutshot', 'backdoor_flush_draw', 'weak_pair', 'overcards', 'air'].includes(handToken);
        const hasDraw = ['gutshot', 'oesd', 'flush_draw', 'backdoor_flush_draw', 'combo_draw'].includes(handToken);

        if (isWeak) {
            return 'Float play: calling the flop bet in position with a weak hand, planning to take the pot when villain checks the turn. IP advantage means you get to act last — if villain shows weakness by checking, you can bluff profitably.';
        }
        if (hasDraw) {
            return 'Float with a draw: calling IP to see another card. If you hit, you can extract value. If villain checks the turn, you can semi-bluff with your draw or take a free card.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 131: RAISE VS CALL DECISION FRAMEWORK
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 131: Framework for deciding between raising and calling postflop.
     */
    _getRaiseVsCallNote(optimalAction, handStrength, street, nodeType, texture) {
        const a = (optimalAction || '').toLowerCase();
        const isRaise = this._isAggressiveAction(a);
        const isCall = a === 'call';
        if (!isRaise && !isCall) return '';

        const handToken = this._getHandToken(handStrength);
        const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'straight', 'flush'].includes(handToken);
        const isDraw = ['oesd', 'flush_draw', 'combo_draw'].includes(handToken);
        const isMedium = ['overpair', 'top_pair_top_kicker', 'top_pair'].includes(handToken);
        const isWet = texture && (texture.wet || texture.flushy || texture.monotone);

        if (isRaise && isStrong && isWet) {
            return 'Raise for value + protection: on a wet board, strong hands should raise to deny equity to draws. Calling lets villain realize their equity cheaply.';
        }
        if (isRaise && isDraw && isWet) {
            return 'Raise as a semi-bluff: your draw gives you equity when called, and raising may win the pot immediately. The combination of fold equity + draw equity makes this profitable.';
        }
        if (isCall && isMedium) {
            return 'Call rather than raise: medium-strength hands prefer to keep the pot controlled. Raising only gets action from better hands while folding out worse — the classic "raising turns your hand into a bluff" problem.';
        }
        if (isCall && isStrong && street === 'flop') {
            return 'Flat call with a monster: slow-playing on the flop to keep villain\'s bluffs in and allow them to catch up slightly. Raising may fold out everything but the nuts.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 132: TURN CARD CATEGORIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 132: Categorize turn cards — how they change the board dynamic.
     */
    _getTurnCardCategoryNote(board, street, handStrength, texture) {
        if (street !== 'turn' || !board || board.length < 4) return '';
        const turnCard = board[3];
        if (!turnCard || turnCard.length < 2) return '';
        const turnRank = turnCard[0];
        const turnSuit = turnCard[1];
        const flopCards = board.slice(0, 3);
        const flopSuits = flopCards.map(c => c[1]);
        const flopRanks = flopCards.map(c => '23456789TJQKA'.indexOf(c[0]));
        const turnRankVal = '23456789TJQKA'.indexOf(turnRank);

        // Flush completing
        const suitCounts = {};
        flopSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const flushDrawSuit = Object.entries(suitCounts || {}).find(([_, ct]) => ct >= 2);
        if (flushDrawSuit && turnSuit === flushDrawSuit[0]) {
            return `▲ Turn ${turnCard} completes the flush draw (three ${flushDrawSuit[0]} on the flop). This dramatically changes the board dynamic — flush draws got there, and hands without a flush need to proceed cautiously.`;
        }

        // Overcard
        const maxFlopRank = Math.max(...flopRanks);
        if (turnRankVal > maxFlopRank && turnRankVal >= 10) { // T+
            const rankNames = { 10: 'Jack', 11: 'Queen', 12: 'King', 13: 'Ace' };
            return `Turn ${turnCard} is an overcard to the flop — ${rankNames[turnRankVal] || turnRank} changes the dynamic. Top pairs from the flop may now be second pair. Ranges with big cards improve.`;
        }

        // Board pairing
        if (flopRanks.includes(turnRankVal)) {
            return `Turn ${turnCard} pairs the board. This is generally better for the preflop aggressor (sets/trips become possible) and reduces straight/flush draw equity.`;
        }

        // Brick/blank
        if (turnRankVal <= 5 && !flopRanks.includes(turnRankVal)) {
            return `Turn ${turnCard} is a relative blank — low card that doesn't complete obvious draws. The board dynamic stays similar to the flop. Continue with your flop plan.`;
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 133: RIVER DECISION TREE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 133: River decision tree — value/bluff/check flowchart.
     */
    _getRiverDecisionNote(optimalAction, handStrength, street, nodeType) {
        if (street !== 'river') return '';
        const a = (optimalAction || '').toLowerCase();
        const handToken = this._getHandToken(handStrength);
        const isStrong = ['nuts', 'second_nuts', 'full_house', 'flush', 'straight', 'set', 'trips'].includes(handToken);
        const isMedium = ['two_pair', 'overpair', 'top_pair_top_kicker', 'top_pair'].includes(handToken);
        const isWeak = ['high_card', 'ace_high', 'underpair', 'bottom_pair', 'missed_draw', 'weak_pair', 'overcards', 'air'].includes(handToken);

        if (this._isAggressiveAction(a)) {
            if (isStrong) return 'River value bet: with a strong hand, bet for maximum value. Choose a size that gets called by enough worse hands — balance between frequency and size.';
            if (isWeak) return 'River bluff: with a weak hand, betting turns your hand into a bluff. The key question: does villain fold enough to make this profitable? Target their bluff-catching range.';
            if (isMedium) return 'River thin value: a medium-strength bet targeting worse hands that might call. Be careful — if villain only calls with better, this is a losing bet.';
        }
        if (a === 'call') {
            if (isMedium) return 'River bluff-catch: calling with a medium-strength hand to catch villain\'s bluffs. The decision: does villain bluff enough to justify calling? Compare to pot odds.';
            if (isStrong) return 'River snap-call: your hand beats most of villain\'s value range. An easy call.';
        }
        if (a === 'x' || a === 'check') {
            if (isMedium) return 'River check: your hand has showdown value but can\'t bet for value (only better hands call, only worse hands fold). Checking captures the equity you have.';
            if (isWeak) return 'River give-up: no showdown value and bluffing isn\'t profitable enough. Sometimes giving up is the highest-EV play.';
        }
        if (a === 'f') {
            return 'River fold: your hand can\'t beat villain\'s value range, and you\'re not getting the right odds to bluff-catch. Discipline to fold rivers saves significant EV long-term.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 134: SPR DECISION MATRIX
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 134: Stack-to-pot ratio matrix for strategic decisions.
     * Low SPR (≤3): commit with top pair+, high SPR (13+): speculative hands shine.
     */
    _getSPRMatrixNote(estimatedPot, stackDepth, handStrength, street) {
        const handToken = this._getHandToken(handStrength);
        if (!estimatedPot || !stackDepth || street === 'preflop') return '';
        const spr = stackDepth / (estimatedPot || 1);

        if (spr <= 2) {
            const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'overpair', 'top_pair_top_kicker', 'top_pair', 'straight', 'flush', 'full_house'].includes(handToken);
            if (isStrong) return `SPR ≈ ${spr.toFixed(1)} (very low): with a strong hand at this SPR, you should be looking to get all-in. The pot is too large relative to stacks to slow-play.`;
            return `SPR ≈ ${spr.toFixed(1)} (very low): shallow SPR means commitment decisions are simplified. Top pair+ is often strong enough to stack off. Draws lose implied odds.`;
        }
        if (spr <= 5) {
            return `SPR ≈ ${spr.toFixed(1)} (low): one-pair hands are often strong enough to go with. Sets and two-pair are monsters. Draws need to be strong to continue.`;
        }
        if (spr <= 10) {
            return `SPR ≈ ${spr.toFixed(1)} (medium): top pair is good but not stack-off worthy. Sets are ideal stacking hands. Drawing hands have reasonable implied odds.`;
        }
        return `SPR ≈ ${spr.toFixed(1)} (high): deep stacks favor implied-odds hands (suited connectors, small pairs). Top pair alone is rarely worth stacking off — play cautiously without a monster.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 135: EFFECTIVE STACK DEPTH ADJUSTMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 135: How effective stack depth changes strategy.
     */
    _getStackDepthStrategyNote(stackDepth, handStrength, street) {
        if (!stackDepth || street === 'preflop') return '';

        if (stackDepth <= 20) {
            return `Short-stacked (${stackDepth}BB): simplified strategy — push/fold dynamics dominate. Implied odds are minimal, so speculative hands lose value. Premium hands gain value.`;
        }
        if (stackDepth <= 40) {
            return `Medium stack (${stackDepth}BB): standard play applies. Top pair is often a stacking hand. Draws need decent equity to continue.`;
        }
        if (stackDepth <= 100) {
            return `Standard depth (${stackDepth}BB): full range of plays available. Balance between value, bluffs, and pot control.`;
        }
        return `Deep-stacked (${stackDepth}BB): implied odds are maximized — suited connectors, small pairs become more valuable. Be cautious with one-pair hands; the risk of stacking off is too high relative to hand strength.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 136: POT GEOMETRY — OPTIMAL SIZING TO GET STACKS IN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 136: Calculate geometric bet sizing to get stacks in by the river.
     */
    _getPotGeometryNote(estimatedPot, stackDepth, street, optimalAction) {
        if (!estimatedPot || !stackDepth || street === 'preflop') return '';
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';

        const remainingBets = street === 'flop' ? 3 : street === 'turn' ? 2 : 1;
        if (remainingBets <= 0) return '';

        const effectiveStack = stackDepth;
        const ratio = effectiveStack / estimatedPot;

        if (remainingBets === 3 && ratio > 2) {
            // Need 3 streets to get stacks in
            const perStreetMultiplier = Math.pow(ratio + 1, 1 / 3) - 1;
            const sizePct = (perStreetMultiplier * 100).toFixed(0);
            return `Pot geometry: to get ${effectiveStack}BB in over 3 streets with a ${estimatedPot.toFixed(0)}BB pot, bet ~${sizePct}% pot each street (geometric sizing). This builds the pot exponentially.`;
        }
        if (remainingBets === 2 && ratio > 1.5) {
            const perStreetMultiplier = Math.pow(ratio + 1, 1 / 2) - 1;
            const sizePct = (perStreetMultiplier * 100).toFixed(0);
            return `Pot geometry: ${effectiveStack}BB remaining over 2 streets — bet ~${sizePct}% pot per street to stack off naturally by the river.`;
        }
        if (remainingBets === 1) {
            const sizePct = ((effectiveStack / estimatedPot) * 100).toFixed(0);
            if (effectiveStack <= estimatedPot * 1.5) {
                return `River sizing: ${effectiveStack}BB into ${estimatedPot.toFixed(0)}BB pot — a ${sizePct}% pot jam gets all the money in.`;
            }
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 137: RANGE ADVANTAGE VS NUT ADVANTAGE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 137: Distinguish between range advantage (more equity overall)
     * and nut advantage (more very strong hands).
     */
    _getRangeVsNutAdvantageNote(heroPosition, villainPosition, texture, street, nodeType) {
        if (street === 'preflop' || !texture) return '';
        const isIP = this._isInPosition(heroPosition, villainPosition);
        const isPFR = nodeType === 'hero_bets_or_checks';
        // texture.highCard is a boolean — derive the actual high rank from lowestRank + spread
        const boardHighRank = (typeof texture.lowestRank === 'number' && typeof texture.spread === 'number')
            ? texture.lowestRank + texture.spread
            : (texture.highCard ? 11 : 0);

        // High boards favor PFR (Ace/King high)
        if (boardHighRank >= 11 && isPFR) { // K+ high
            return 'Range advantage + nut advantage: as the preflop raiser on a high board, you have both more strong hands (AA, AK, KQ) and more overall equity. This lets you c-bet at high frequency with a small size.';
        }
        // Low boards favor caller
        if (boardHighRank <= 7 && !isPFR) {
            return 'Nut advantage shifts to you: on low boards, the caller has more sets (22-77) and two pairs (45, 67) than the PFR. You can lead or check-raise more aggressively.';
        }
        // Medium boards — split advantage
        if (boardHighRank >= 8 && boardHighRank <= 10) {
            return 'Split advantage: on medium boards (8-T high), neither player has a clear nut advantage. This leads to more checking and smaller bets from both sides.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 138: BOARD INTERACTION ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 138: How well does each player's range interact with this board?
     */
    _getBoardInteractionNote(heroPosition, villainPosition, texture, nodeType, street) {
        if (street === 'preflop' || !texture) return '';
        const isPFR = nodeType === 'hero_bets_or_checks';
        const isCaller = !isPFR;
        const isMonotone = texture.monotone;
        const isPaired = texture.paired;
        const isConnected = texture.connected;

        if (isMonotone && isCaller) {
            return 'Board interaction: monotone boards favor the caller\'s range — callers have more suited hands in their range, giving them more flush draws and made flushes.';
        }
        if (isPaired && isPFR) {
            return 'Board interaction: paired boards favor the PFR — the preflop raiser has more big pairs and overcards that use the board pair for trips. Callers rarely have trips.';
        }
        if (isConnected && isCaller) {
            return 'Board interaction: connected boards (like 7-8-9) favor the caller\'s range — callers have more suited connectors and middling hands that hit these boards hard.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 139: EQUITY DISTRIBUTION NOTES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 139: Notes about how equity is distributed between ranges.
     */
    _getEquityDistributionNote(handStrength, optimalAction, street, nodeType) {
        if (street === 'preflop') return '';
        const a = (optimalAction || '').toLowerCase();
        const handToken = this._getHandToken(handStrength);
        const isNutted = ['nuts', 'second_nuts', 'full_house', 'flush', 'straight'].includes(handToken);
        const isAir = ['high_card', 'ace_high', 'missed_draw', 'overcards', 'air'].includes(handToken);
        const isMedium = ['top_pair', 'overpair', 'middle_pair', 'second_pair', 'top_pair_weak_kicker'].includes(handToken);

        if (isNutted && (a.startsWith('r') || a === 'allin')) {
            return 'Equity distribution: you\'re at the top of your range. Your hand beats nearly everything villain can have. Size for maximum value — go big against their calling range.';
        }
        if (isAir && (a.startsWith('r') || a === 'allin')) {
            return 'Equity distribution: you\'re at the bottom of your range with no showdown value. This makes your hand a natural bluff candidate — you have nothing to lose by betting.';
        }
        if (isMedium && (a === 'x' || a === 'call')) {
            return 'Equity distribution: your hand is in the middle of your range — beating bluffs but losing to value. These hands are natural check/calls that keep villain\'s bluffing range honest.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 140: GTO DEVIATION DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 140: Detect when user's play deviates from GTO patterns.
     * Track cumulative deviations to identify tendencies.
     */
    detectGTODeviation(chosenAction, correctAction, freq, street, handStrength) {
        if (!this._deviationTracker) this._deviationTracker = { overFold: 0, overCall: 0, overRaise: 0, totalSpots: 0 };
        this._deviationTracker.totalSpots++;

        const chosen = (chosenAction || '').toLowerCase();
        const correct = (correctAction || '').toLowerCase();
        if (chosen === correct) return null;

        // Track deviation direction
        const actionStrength = { 'f': 0, 'x': 1, 'call': 2, 'check': 1 };
        const chosenStr = this._isAggressiveAction(chosen) ? 3 : (actionStrength[chosen] ?? 1);
        const correctStr = this._isAggressiveAction(correct) ? 3 : (actionStrength[correct] ?? 1);

        if (chosenStr < correctStr) {
            if (chosen === 'f') {
                this._deviationTracker.overFold++;
                return `▲ Deviation: folding when GTO says ${correct === 'call'? 'call': 'raise'}. You may be over-folding — this leak gives villain free equity when they bet.`;
            }
            this._deviationTracker.overCall++;
            return `Deviation: calling when GTO says raise. Passive play lets villain control the pot size and realize equity cheaply.`;
        }
        if (chosenStr > correctStr) {
            if (correct === 'f') {
                this._deviationTracker.overCall++;
                return `▲ Deviation: calling/raising when GTO says fold. You may be defending too wide — losing money in spots where your equity is too low.`;
            }
            this._deviationTracker.overRaise++;
            return `Deviation: raising when GTO says ${correct}. Over-aggression bloats pots with hands that don't have enough equity.`;
        }
        return null;
    }

    getDeviationSummary() {
        if (!this._deviationTracker || this._deviationTracker.totalSpots < 5) return null;
        const t = this._deviationTracker;
        const total = t.totalSpots;
        const foldRate = ((t.overFold / total) * 100).toFixed(0);
        const callRate = ((t.overCall / total) * 100).toFixed(0);
        const raiseRate = ((t.overRaise / total) * 100).toFixed(0);

        const biggest = Math.max(t.overFold, t.overCall, t.overRaise);
        let tendency = 'balanced';
        if (biggest === t.overFold && t.overFold > total * 0.15) tendency = 'too tight (over-folding)';
        else if (biggest === t.overCall && t.overCall > total * 0.15) tendency = 'too loose-passive (over-calling)';
        else if (biggest === t.overRaise && t.overRaise > total * 0.15) tendency = 'too aggressive (over-raising)';

        return { tendency, overFoldPct: foldRate, overCallPct: callRate, overRaisePct: raiseRate, totalSpots: total };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 141: EXPLOITATIVE ADJUSTMENT SUGGESTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 141: Suggest exploitative deviations from GTO based on opponent tendencies.
     */
    _getExploitativeSuggestion(handStrength, optimalAction, street, nodeType) {
        const handToken = this._getHandToken(handStrength);
        // Only show when user is performing well (indicating they understand GTO)
        if (!this._sessionStats || !this._sessionStats.total || this._sessionStats.total < 10) return '';
        const accuracy = this._sessionStats.correct / this._sessionStats.total;
        if (accuracy < 0.6) return ''; // Only suggest exploits when user knows GTO

        const a = (optimalAction || '').toLowerCase();
        const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'overpair', 'top_pair_top_kicker'].includes(handToken);
        const isMedium = ['top_pair', 'middle_pair', 'second_pair'].includes(handToken);

        // Only offer exploit tips occasionally (every ~5th question when applicable)
        if (this._sessionStats.total % 5 !== 0) return '';

        if (a.startsWith('r') && isStrong) {
            return 'Exploit tip: vs opponents who call too much, increase your value bet sizing. GTO uses balanced sizes, but exploitatively you can size up against calling stations.';
        }
        if (a === 'f' && isMedium) {
            return 'Exploit tip: GTO folds here, but vs opponents who bluff too much, consider calling. Adjust your defense frequency upward against overly aggressive players.';
        }
        if (a.startsWith('r') && !isStrong) {
            return 'Exploit tip: vs opponents who over-fold, increase your bluffing frequency. GTO balances bluffs and value, but exploitatively you can bluff more against tight players.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 142: HAND READING NARRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 142: Narrate what villain's actions tell us about their range.
     */
    _getHandReadingNote(street, nodeType, optimalAction) {
        if (street === 'preflop') return '';
        const node = (nodeType || '').toLowerCase();

        if (street === 'flop') {
            if (node.includes('cbet')) {
                return 'Hand reading: villain\'s c-bet tells us little — most PFRs c-bet the flop at high frequency. Their range is still wide.';
            }
            if (node.includes('check')) {
                return 'Hand reading: villain checked. This caps their range — they probably don\'t have the nuts or a strong overpair. Their range is weighted toward medium hands and draws.';
            }
            if (node.includes('raise') || node.includes('xr')) {
                return 'Hand reading: villain\'s check-raise on the flop is polarized — they have either a very strong hand (set, two pair) or a draw/bluff. Medium-strength hands just call.';
            }
        }
        if (street === 'turn') {
            if (node.includes('barrel') || node.includes('bet')) {
                return 'Hand reading: villain betting again on the turn narrows their range. They\'re representing real strength or a committed bluff. Floaters and medium hands often give up here.';
            }
            if (node.includes('check')) {
                return 'Hand reading: villain checking the turn after betting the flop signals weakness. Their range is capped — strong hands almost always continue betting.';
            }
        }
        if (street === 'river') {
            if (node.includes('bet') || node.includes('barrel')) {
                return 'Hand reading: triple-barreling on the river is the most polarized action. Villain has either the nuts or air — very few medium hands take this line.';
            }
            if (node.includes('check')) {
                return 'Hand reading: villain checking the river means they\'re giving up on bluffs or have a medium hand looking to get to showdown. Consider a thin value bet.';
            }
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 143: SESSION DIFFICULTY AUTO-ADJUSTMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 143: Automatically adjust difficulty based on rolling performance.
     * Tracks last 10 answers and adjusts difficulty target.
     */
    getAutoAdjustedDifficulty() {
        if (!this._recentResults) this._recentResults = [];
        const recent = this._recentResults.slice(-10);
        if (recent.length < 5) return 'standard'; // Not enough data

        const recentAccuracy = recent.filter(r => r).length / recent.length;

        if (recentAccuracy >= 0.85) return 'expert'; // Crushing it — make it harder
        if (recentAccuracy >= 0.55) return 'standard'; // Doing well — maintain
        return 'beginner'; // Struggling — ease up
    }

    recordRecentResult(isCorrect) {
        if (!this._recentResults) this._recentResults = [];
        this._recentResults.push(isCorrect);
        if (this._recentResults.length > 20) this._recentResults.shift();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 144: CONCEPT MASTERY TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 144: Track mastery of individual GTO concepts.
     * e.g., "c-betting", "3-betting", "river bluffing", "pot odds".
     */
    recordConceptExposure(concept, isCorrect) {
        if (!this._conceptMastery) this._conceptMastery = {};
        if (!concept) return;
        if (!this._conceptMastery[concept]) this._conceptMastery[concept] = { total: 0, correct: 0 };
        this._conceptMastery[concept].total++;
        if (isCorrect) this._conceptMastery[concept].correct++;
    }

    getConceptMastery() {
        if (!this._conceptMastery) return {};
        const result = {};
        for (const [concept, data] of Object.entries(this._conceptMastery || {})) {
            if (data.total < 2) continue;
            const rate = data.correct / data.total;
            result[concept] = {
                accuracy: (rate * 100).toFixed(0) + '%',
                total: data.total,
                mastery: rate >= 0.8 ? 'mastered' : rate >= 0.5 ? 'learning' : 'needs_work',
            };
        }
        return result;
    }

    /**
     * Phase 144: Derive concept from question context.
     */
    deriveConceptFromContext(nodeType, street, optimalAction, handStrength) {
        const a = (optimalAction || '').toLowerCase();
        const node = (nodeType || '').toLowerCase();
        if (street === 'preflop') {
            if (node.includes('open')) return 'opening_ranges';
            if (node.includes('facing') && a.startsWith('r')) return '3betting';
            if (node.includes('facing') && a === 'call') return 'preflop_defense';
            if (node.includes('facing') && a === 'f') return 'preflop_folding';
            return 'preflop_general';
        }
        if (node.includes('cbet')) return 'cbetting';
        if (node.includes('xr') || node.includes('check_raise')) return 'check_raising';
        if (a === 'f') return `${street}_folding`;
        if (a === 'call') return `${street}_calling`;
        if (a.startsWith('r') || a === 'allin') return `${street}_betting`;
        return `${street}_general`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 145: WEAKNESS-TARGETED QUESTION GENERATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 145: Bias question generation toward weak spots.
     * Returns a filter preference for question selection.
     */
    getWeaknessTargets() {
        if (!this._mistakeTracker) return null;
        const weakSpots = [];
        for (const [dim, data] of Object.entries(this._mistakeTracker || {})) {
            if (data.total < 3) continue;
            const rate = data.mistakes / data.total;
            if (rate >= 0.4) {
                weakSpots.push({ dimension: dim, mistakeRate: rate, samples: data.total });
            }
        }
        if (weakSpots.length === 0) return null;
        weakSpots.sort((a, b) => b.mistakeRate - a.mistakeRate);
        return weakSpots.slice(0, 5); // Top 5 weakest areas
    }

    /**
     * Phase 145: Score a potential question against user's weakness targets.
     * Higher score = more likely to be selected.
     */
    scoreQuestionForWeakness(scenario) {
        const targets = this.getWeaknessTargets();
        if (!targets || targets.length === 0) return 0;
        let score = 0;
        for (const target of targets) {
            const dim = target.dimension;
            if (dim.startsWith('street:') && scenario.street === dim.split(':')[1]) score += target.mistakeRate * 2;
            if (dim.startsWith('action:') && scenario.correctAction && scenario.correctAction.toLowerCase().startsWith(dim.split(':')[1])) score += target.mistakeRate * 2;
            if (dim.startsWith('spot:') && scenario.spotType === dim.split(':')[1]) score += target.mistakeRate * 3;
        }
        return score;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 146: SPACED REPETITION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 146: Spaced repetition — re-present missed scenarios at increasing intervals.
     */
    recordMissedScenario(scenario, classification) {
        if (!this._spacedRepetition) this._spacedRepetition = [];
        const severity = classification === 'BLUNDER' ? 3 : classification === 'WRONG' ? 2 : 1;
        this._spacedRepetition.push({
            scenario: { street: scenario.street, nodeType: scenario.nodeType, spotType: scenario.spotType, stack_depth: scenario.stack_depth },
            severity,
            nextReview: this._getSessionQuestionCount() + Math.max(3, Math.floor(5 / severity)),
            reviewCount: 0,
        });
    }

    _getSessionQuestionCount() {
        return this._sessionStats?.total || 0;
    }

    getSpacedRepetitionDue() {
        if (!this._spacedRepetition || this._spacedRepetition.length === 0) return null;
        const currentQ = this._getSessionQuestionCount();
        const due = this._spacedRepetition.filter(sr => sr.nextReview <= currentQ);
        if (due.length === 0) return null;
        // Return highest severity first
        due.sort((a, b) => b.severity - a.severity);
        return due[0];
    }

    markSpacedRepetitionReviewed(index) {
        if (!this._spacedRepetition || !this._spacedRepetition[index]) return;
        const sr = this._spacedRepetition[index];
        sr.reviewCount++;
        sr.nextReview = this._getSessionQuestionCount() + Math.min(20, 5 * sr.reviewCount); // Increasing intervals
        if (sr.reviewCount >= 3) {
            this._spacedRepetition.splice(index, 1); // Mastered after 3 successful reviews
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 147: EV LOSS QUANTIFICATION PER MISTAKE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 147: Estimate EV loss for each mistake in bb.
     */
    estimateEVLoss(chosenAction, correctAction, actionEVs, estimatedPot) {
        if (!actionEVs || !chosenAction || !correctAction) return null;
        const correctEV = actionEVs[correctAction];
        const chosenEV = actionEVs[chosenAction];
        if (correctEV == null || chosenEV == null) return null;

        const evDiff = correctEV - chosenEV;
        if (evDiff <= 0) return null; // No loss

        // actionEVs are already bb-scaled — evDiff IS the bb loss (no pot re-scaling)
        const pot = estimatedPot || 1;
        const evLossBB = evDiff;
        const evLossPct = ((evDiff / (Math.abs(correctEV) || 1)) * 100).toFixed(1);

        let severity = 'minor';
        if (evLossBB > 3) severity = 'major';
        else if (evLossBB > 1) severity = 'significant';

        return {
            evLossBB: evLossBB.toFixed(1),
            evLossPctPot: pot > 0 ? ((evDiff / pot) * 100).toFixed(1) + '% of pot' : '0% of pot',
            severity,
            message: `EV loss: ~${evLossBB.toFixed(1)}bb (${evLossPct}% of optimal EV). ${severity === 'major' ? 'This is a costly mistake — focus on this spot.' : severity === 'significant' ? 'Moderate leak that adds up over time.' : 'Small loss, but fixing it improves your win rate.'}`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 148: COMPARISON TO OPTIMAL PLAY STATISTICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 148: Compare user's session stats against optimal play benchmarks.
     */
    getOptimalPlayComparison() {
        if (!this._sessionStats || this._sessionStats.total < 10) return null;
        const accuracy = this._sessionStats.correct / this._sessionStats.total;
        const total = this._sessionStats.total;

        // GTO Wizard benchmarks (approximate): top 10% score ~75%, average ~55%
        const benchmarks = [
            { label: 'GTO Master (top 1%)', threshold: 0.85 },
            { label: 'Advanced (top 10%)', threshold: 0.75 },
            { label: 'Intermediate (top 25%)', threshold: 0.65 },
            { label: 'Learning (top 50%)', threshold: 0.55 },
            { label: 'Beginner (bottom 50%)', threshold: 0 },
        ];

        let userLevel = benchmarks[benchmarks.length - 1];
        for (const b of benchmarks) {
            if (accuracy >= b.threshold) { userLevel = b; break; }
        }

        // Per-street breakdown
        const streetBreakdown = {};
        if (this._mistakeTracker) {
            for (const street of ['flop', 'turn', 'river', 'preflop']) {
                const key = `street:${street}`;
                const data = this._mistakeTracker[key];
                if (data && data.total >= 3) {
                    streetBreakdown[street] = {
                        accuracy: (((data.total - data.mistakes) / data.total) * 100).toFixed(0) + '%',
                        total: data.total,
                    };
                }
            }
        }

        return {
            overall: { accuracy: (accuracy * 100).toFixed(1) + '%', total, level: userLevel.label },
            streetBreakdown,
            vsOptimal: `Your accuracy: ${(accuracy * 100).toFixed(1)}%. ${userLevel.label}. ${accuracy >= 0.75 ? 'Excellent — you\'re playing at an advanced GTO level!' : accuracy >= 0.55 ? 'Solid foundation — focus on your weak spots to level up.' : 'Keep studying — every session builds your GTO intuition.'}`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 149: END-OF-SESSION DETAILED BREAKDOWN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 149: Comprehensive session report with improvement suggestions.
     */
    generateDetailedSessionReport() {
        const summary = this.generateSessionSummary();
        const comparison = this.getOptimalPlayComparison();
        const conceptMastery = this.getConceptMastery();
        const deviations = this.getDeviationSummary();
        const trend = this.getPerformanceTrend();
        const weaknesses = this.getWeaknessTargets();

        const report = {
            summary,
            comparison,
            conceptMastery,
            deviations,
            trend,
            weaknesses: weaknesses ? weaknesses.map(w => ({
                area: w.dimension,
                mistakeRate: (w.mistakeRate * 100).toFixed(0) + '%',
                priority: w.mistakeRate >= 0.6 ? 'HIGH' : 'MEDIUM',
            })) : [],
            improvementPlan: [],
        };

        // Generate improvement suggestions
        if (deviations) {
            if (deviations.tendency.includes('over-folding')) {
                report.improvementPlan.push('Defend more against bets — study pot odds and MDF (Minimum Defense Frequency) to find calls you\'re missing.');
            }
            if (deviations.tendency.includes('over-calling')) {
                report.improvementPlan.push('Tighten your calling range — learn when to fold marginal hands, especially on the river.');
            }
            if (deviations.tendency.includes('over-raising')) {
                report.improvementPlan.push('Reduce aggression with medium hands — learn when calling or checking is more profitable than raising.');
            }
        }

        if (weaknesses) {
            for (const w of weaknesses.slice(0, 3)) {
                if (w.dimension.includes('river')) report.improvementPlan.push('Focus on river play — practice value betting, bluff-catching, and knowing when to give up.');
                if (w.dimension.includes('turn')) report.improvementPlan.push('Work on turn strategy — this is where ranges narrow and decisions get complex.');
                if (w.dimension.includes('hand:weak')) report.improvementPlan.push('Practice playing weak hands — know when to bluff and when to fold.');
                if (w.dimension.includes('action:raise')) report.improvementPlan.push('Study raising strategy — when to raise for value vs as a bluff.');
            }
        }

        // Deduplicate improvement suggestions
        report.improvementPlan = [...new Set(report.improvementPlan)].slice(0, 5);

        return report;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 150: ADAPTIVE COACHING PERSONALITY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 150: Adjust coaching tone based on user's performance and emotional state.
     * Encouraging when struggling, challenging when excelling, neutral otherwise.
     */
    getCoachingTone() {
        if (!this._sessionStats || this._sessionStats.total < 5) return 'encouraging';
        const accuracy = this._sessionStats.correct / this._sessionStats.total;
        const trend = this.getPerformanceTrend();

        if (accuracy >= 0.8 && trend && trend.trend === 'improving') return 'challenging'; // Push them
        if (accuracy < 0.4) return 'supportive'; // They're struggling
        if (trend && trend.trend === 'declining') return 'encouraging'; // Boost morale
        return 'neutral';
    }

    /**
     * Phase 150: Generate a coaching message based on tone and context.
     */
    getCoachingMessage(classification, questionNumber) {
        const tone = this.getCoachingTone();
        const isCorrect = classification === 'CORRECT' || classification === 'GOOD';

        if (tone === 'challenging') {
            if (isCorrect) return questionNumber % 3 === 0 ? '✓ Solid play. Can you explain WHY this is correct without looking at the explanation?': null;
            return '✕ You should know this one. Study the explanation carefully and don\'t repeat this mistake.';
        }
        if (tone === 'supportive') {
            if (isCorrect) return 'Great job! You got this one right — you\'re building strong GTO instincts!';
            return 'Don\'t worry about this one — every top player made these mistakes while learning. Focus on the concept.';
        }
        if (tone === 'encouraging') {
            if (isCorrect) return questionNumber % 5 === 0 ? 'Keep it up! Your understanding is growing with every question.': null;
            return 'Close! Review the explanation — these spots get easier with practice.';
        }
        // neutral
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 151: RANGE VISUALIZATION DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 151: Generate range grid data for visualization.
     * Returns a 13x13 grid with action frequencies for each hand combo.
     */
    generateRangeGridData(handActions, nodeType) {
        const ranks = 'AKQJT98765432'.split('');
        const grid = [];
        for (let i = 0; i < 13; i++) {
            const row = [];
            for (let j = 0; j < 13; j++) {
                let hand;
                if (i === j) hand = ranks[i] + ranks[j]; // Pairs
                else if (i < j) hand = ranks[i] + ranks[j] + 's'; // Suited (above diagonal)
                else hand = ranks[j] + ranks[i] + 'o'; // Offsuit (below diagonal)

                const actions = handActions?.[hand] || {};
                const raiseFreq = Object.entries(actions || {}).filter(([k]) => k.startsWith('r') || k === 'allin').reduce((s, [, v]) => s + v, 0);
                const callFreq = actions['call'] || 0;
                const foldFreq = actions['f'] || 0;
                const checkFreq = actions['x'] || actions['check'] || 0;

                row.push({
                    hand,
                    raise: raiseFreq,
                    call: callFreq,
                    fold: foldFreq,
                    check: checkFreq,
                    isPair: i === j,
                    isSuited: i < j,
                });
            }
            grid.push(row);
        }
        return grid;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 152: ACTION FREQUENCY HEATMAP DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 152: Generate action frequency data for heatmap display.
     */
    generateActionHeatmap(nodeType, street) {
        if (!this._mistakeTracker) return null;
        const actions = ['fold', 'call', 'raise', 'check', 'bet'];
        const streets = ['preflop', 'flop', 'turn', 'river'];
        const heatmap = {};

        for (const s of streets) {
            heatmap[s] = {};
            for (const a of actions) {
                // Tracker compound keys use full-word action buckets (see _getActionBucket)
                const key = `${s}:${a}`;
                const data = this._mistakeTracker[key];
                heatmap[s][a] = data ? {
                    total: data.total,
                    mistakes: data.mistakes,
                    accuracy: data.total > 0 ? ((data.total - data.mistakes) / data.total * 100).toFixed(0) + '%' : 'N/A',
                } : { total: 0, mistakes: 0, accuracy: 'N/A' };
            }
        }
        return heatmap;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 153: EV GRAPH DATA GENERATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 153: Track EV data across the session for graphing.
     */
    recordEVDataPoint(questionNumber, isCorrect, evLoss, street) {
        if (!this._evGraphData) this._evGraphData = [];
        const cumulativeEV = this._evGraphData.length > 0
            ? this._evGraphData[this._evGraphData.length - 1].cumulativeEV
            : 0;

        this._evGraphData.push({
            question: questionNumber,
            correct: isCorrect,
            evLoss: evLoss || 0,
            cumulativeEV: cumulativeEV + (isCorrect ? 0 : -(evLoss || 0)),
            street,
        });
    }

    getEVGraphData() {
        return this._evGraphData || [];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 154: HAND STRENGTH RANKING IN RANGE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 154: Where does this hand rank in the player's range?
     * Top 10%, top 25%, middle, bottom — helps contextualize decisions.
     */
    _getHandRankingNote(handStrength, optimalAction, street) {
        if (street === 'preflop') return '';
        const strengthOrder = [
            'nuts', 'second_nuts', 'full_house', 'flush', 'straight', 'set', 'trips',
            'two_pair', 'overpair', 'top_pair_top_kicker', 'top_pair', 'top_pair_weak_kicker',
            'middle_pair', 'second_pair', 'third_pair', 'bottom_pair', 'weak_pair', 'underpair',
            'ace_high', 'high_card', 'overcards', 'missed_draw', 'air',
            'combo_draw', 'oesd', 'flush_draw', 'gutshot', 'backdoor_flush_draw',
        ];
        const idx = strengthOrder.indexOf(this._getHandToken(handStrength));
        if (idx < 0) return '';

        const totalCategories = strengthOrder.length;
        const percentile = ((idx / totalCategories) * 100).toFixed(0);

        if (idx <= 3) return `Range ranking: your hand is in the top ~5% of possible holdings — a premium hand you should be looking to get value from.`;
        if (idx <= 7) return `Range ranking: your hand is in the top ~25% — a strong hand that can bet for value on most board textures.`;
        if (idx <= 12) return `Range ranking: your hand is in the middle of your range — decent but vulnerable. These hands need careful pot control.`;
        if (idx <= 18) return `Range ranking: your hand is in the bottom ~30% of made hands — marginal showdown value at best. Consider whether checking or folding is better than betting.`;
        return `Range ranking: your hand is a draw/air — no current showdown value. Play for equity realization or as a bluff.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 155: NUT BLOCKER EFFECTS ON BLUFFING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 155: Specific nut blocker logic for bluff selection.
     * Blocking the nuts makes your bluffs more profitable.
     */
    _getNutBlockerBluffNote(heroHand, board, handStrength, optimalAction, street) {
        if (street === 'preflop' || !board || board.length < 3) return '';
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';
        const handToken = this._getHandToken(handStrength);
        const isWeak = ['high_card', 'ace_high', 'missed_draw', 'underpair', 'bottom_pair', 'weak_pair', 'overcards', 'air'].includes(handToken);
        if (!isWeak) return ''; // Only relevant for bluffs

        const boardSuits = board.map(c => c[1]);
        const boardRanks = board.map(c => c[0]);
        const heroRanks = [heroHand[0], heroHand.length >= 3 ? heroHand[1] : ''];
        const heroSuit1 = heroHand.length >= 4 ? heroHand[3] : '';

        // Flush blocker
        const suitCounts = {};
        boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const flushSuit = Object.entries(suitCounts || {}).find(([_, ct]) => ct >= 3);
        if (flushSuit) {
            const hasNutFlushBlocker = heroRanks[0] === 'A' || heroRanks[1] === 'A';
            if (hasNutFlushBlocker) {
                return `Nut flush blocker: your Ace blocks the nut flush, making villain less likely to have the nuts. This makes your bluff more effective — they can\'t confidently call with non-nut hands.`;
            }
        }

        // Straight blocker on connected boards
        const rankVals = boardRanks.map(r => '23456789TJQKA'.indexOf(r)).sort((a, b) => a - b);
        const isConnected = rankVals.length >= 3 && (rankVals[2] - rankVals[0]) <= 4;
        if (isConnected) {
            const highRank = Math.max(...rankVals);
            const heroVal = Math.max('23456789TJQKA'.indexOf(heroRanks[0]), '23456789TJQKA'.indexOf(heroRanks[1]));
            if (heroVal === highRank + 1 || heroVal === highRank + 2) {
                return `Straight blocker: your high card blocks key straight combos on this connected board. Villain is less likely to have the nuts, improving your bluff\'s success rate.`;
            }
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 156: EQUITY DENIAL CONCEPT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 156: Equity denial — betting to prevent villain from realizing their equity.
     */
    _getEquityDenialNote(optimalAction, handStrength, street, texture) {
        const handToken = this._getHandToken(handStrength);
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';
        if (street === 'preflop' || street === 'river') return ''; // No equity denial on river

        const isWet = texture && (texture.wet || texture.flushy || texture.monotone);
        const isMedium = ['overpair', 'top_pair_top_kicker', 'top_pair', 'top_pair_weak_kicker'].includes(handToken);

        if (isMedium && isWet) {
            return 'Equity denial: betting forces draws to pay to continue or fold. If you check, villain gets a free card and can realize their equity for free — costing you money long-term.';
        }
        if (isMedium && !isWet) {
            return 'Equity denial: even on dry boards, villain\'s overcards have equity against your pair. Betting makes them fold hands with 3-6 outs they would otherwise see for free.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 157: POT ODDS VS IMPLIED ODDS COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 157: Compare pot odds vs implied odds to explain calling decisions.
     */
    _getPotVsImpliedOddsNote(optimalAction, handStrength, street, estimatedPot, stackDepth) {
        const handToken = this._getHandToken(handStrength);
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'call') return '';
        if (street === 'preflop') return '';
        const isDraw = ['oesd', 'flush_draw', 'combo_draw', 'gutshot'].includes(handToken);
        if (!isDraw) return '';

        const outs = handToken === 'combo_draw' ? 15 : handToken === 'flush_draw' ? 9 : handToken === 'oesd' ? 8 : 4;
        const equity = street === 'flop' ? (outs * 4) : (outs * 2); // Rule of 4/2
        // Assume a ~2/3 pot bet: required equity = bet / (pot + 2 * bet)
        const bet = (estimatedPot || 10) * 0.67;
        const potOddsNeeded = ((bet / ((estimatedPot || 10) + 2 * bet)) * 100).toFixed(0);

        if (equity >= parseInt(potOddsNeeded)) {
            return `Pot odds justify the call: ${outs} outs = ~${equity}% equity. You need ~${potOddsNeeded}% to call profitably. Direct pot odds are sufficient.`;
        }
        if (stackDepth && stackDepth > estimatedPot * 3) {
            return `Implied odds justify the call: ${outs} outs = ~${equity}% equity, but pot odds alone don't cover it (~${potOddsNeeded}% needed). With ${stackDepth}BB behind, the potential to win a big pot when you hit makes this profitable.`;
        }
        return `Drawing decision: ${outs} outs = ~${equity}% equity. Need ~${potOddsNeeded}% to call — check if implied odds make up the difference.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 158: AGGRESSION FACTOR TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * True when the action is a bet ('b33'), raise ('r50'), or all-in.
     * Solver action ids use both 'b' and 'r' prefixes for aggressive actions.
     */
    _isAggressiveAction(a) { a = (a || '').toLowerCase(); return a.startsWith('b') || a.startsWith('r') || a === 'allin'; }

    /**
     * Extract the bet/raise size (% of pot) from a 'b<n>' or 'r<n>' action id.
     */
    _actionSizePct(a) { const m = (a || '').toLowerCase().match(/^[br](\d+)$/); return m ? parseInt(m[1], 10) : null; }

    /**
     * Phase 158: Track user's aggression factor per street.
     * AF = (bets + raises) / calls. Optimal ~2-3.
     */
    recordAggressionAction(action, street) {
        if (!this._aggressionTracker) this._aggressionTracker = {};
        if (!this._aggressionTracker[street]) this._aggressionTracker[street] = { betsRaises: 0, calls: 0, total: 0 };
        const a = (action || '').toLowerCase();
        this._aggressionTracker[street].total++;
        if (this._isAggressiveAction(a)) this._aggressionTracker[street].betsRaises++;
        else if (a === 'call') this._aggressionTracker[street].calls++;
    }

    getAggressionFactors() {
        if (!this._aggressionTracker) return {};
        const result = {};
        for (const [street, data] of Object.entries(this._aggressionTracker || {})) {
            const af = data.calls > 0 ? (data.betsRaises / data.calls).toFixed(1) : data.betsRaises > 0 ? 'Inf' : '0';
            result[street] = {
                af,
                betsRaises: data.betsRaises,
                calls: data.calls,
                assessment: parseFloat(af) >= 4 ? 'too aggressive' : parseFloat(af) >= 2 ? 'good' : parseFloat(af) >= 1 ? 'slightly passive' : 'too passive',
            };
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 159: VPIP/PFR EQUIVALENT TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 159: Track VPIP and PFR equivalents in training.
     */
    recordPreflopAction(action, nodeType) {
        if (!this._preflopStats) this._preflopStats = { hands: 0, vpip: 0, pfr: 0 };
        this._preflopStats.hands++;
        const a = (action || '').toLowerCase();
        if (a !== 'f') this._preflopStats.vpip++; // Voluntarily put money in pot
        if (this._isAggressiveAction(a)) this._preflopStats.pfr++; // Preflop raise
    }

    getPreflopStats() {
        if (!this._preflopStats || this._preflopStats.hands < 5) return null;
        const vpipPct = ((this._preflopStats.vpip / this._preflopStats.hands) * 100).toFixed(1);
        const pfrPct = ((this._preflopStats.pfr / this._preflopStats.hands) * 100).toFixed(1);
        const gap = (vpipPct - pfrPct).toFixed(1);

        return {
            vpip: vpipPct + '%',
            pfr: pfrPct + '%',
            gap: gap + '%',
            hands: this._preflopStats.hands,
            assessment: parseFloat(gap) > 15 ? 'Too much cold-calling — tighten your flatting range or raise more.' :
                parseFloat(vpipPct) > 35 ? 'Playing too many hands preflop — tighten your opening range.' :
                parseFloat(vpipPct) < 18 ? 'Playing too tight — you\'re missing profitable spots.' :
                'Solid preflop stats.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 160: POSITIONAL AWARENESS SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 160: Score how well user adjusts play by position.
     */
    recordPositionalDecision(heroPosition, isCorrect) {
        if (!this._positionalAwareness) this._positionalAwareness = {};
        if (!heroPosition) return;
        if (!this._positionalAwareness[heroPosition]) this._positionalAwareness[heroPosition] = { total: 0, correct: 0 };
        this._positionalAwareness[heroPosition].total++;
        if (isCorrect) this._positionalAwareness[heroPosition].correct++;
    }

    getPositionalAwarenessScore() {
        if (!this._positionalAwareness) return null;
        const result = {};
        let totalScore = 0, totalWeight = 0;
        for (const [pos, data] of Object.entries(this._positionalAwareness || {})) {
            if (data.total < 2) continue;
            const accuracy = data.correct / data.total;
            result[pos] = { accuracy: (accuracy * 100).toFixed(0) + '%', total: data.total };
            totalScore += accuracy * data.total;
            totalWeight += data.total;
        }
        const overall = totalWeight > 0 ? ((totalScore / totalWeight) * 100).toFixed(0) : 'N/A';
        return { positions: result, overallScore: overall + '%' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 161: 4-BET/5-BET POT THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 161: Explain 4-bet and 5-bet pot dynamics.
     */
    _get4Bet5BetNote(nodeType, potType, optimalAction, handStrength, stackDepth) {
        if (!potType) return '';
        const is4Bet = potType.includes('4-Bet') || potType.includes('4bet');
        const is5Bet = potType.includes('5-Bet') || potType.includes('5bet');
        if (!is4Bet && !is5Bet) return '';
        const a = (optimalAction || '').toLowerCase();

        if (is5Bet) {
            return '5-bet pot: ranges are extremely narrow — typically AA/KK for value, possibly AKs. At this point, SPR is so low that you\'re committed with any hand you continue with.';
        }

        if (is4Bet) {
            if (a.startsWith('r') || a === 'allin') {
                if (stackDepth && stackDepth <= 40) return '4-bet pot with short stacks: you\'re pot-committed. Any continuation is essentially an all-in decision.';
                return '4-bet pot: the raise here narrows ranges significantly. Value 4-bets are typically AA-QQ, AKs. Bluff 4-bets use blockers (A5s, A4s) to remove key combos from villain\'s range.';
            }
            if (a === 'call') {
                return '4-bet pot flat call: flatting keeps villain\'s bluffs in and disguises hand strength. Be ready to play a large pot postflop with a narrow range.';
            }
            if (a === 'f') {
                return '4-bet pot fold: facing a 4-bet, most hands are folds. Only continue with the top of your range — the pot is already very large relative to remaining stacks.';
            }
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 162: MULTI-STREET BLUFF PLANNING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 162: Multi-street bluff commitment — plan the whole line.
     */
    _getMultiStreetBluffNote(optimalAction, handStrength, street, texture) {
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';
        const handToken = this._getHandToken(handStrength);
        const isWeak = ['high_card', 'ace_high', 'missed_draw', 'underpair', 'weak_pair', 'overcards', 'air'].includes(handToken);
        const hasDraw = ['oesd', 'flush_draw', 'combo_draw', 'gutshot'].includes(handToken);

        if (street === 'flop' && (isWeak || hasDraw)) {
            return 'Multi-street planning: when you start bluffing the flop, have a plan for turn and river. Which turn cards do you barrel? Which do you give up? Good bluffs have clear barrel-or-give-up criteria.';
        }
        if (street === 'turn' && isWeak) {
            return 'Turn barrel commitment: you\'ve bet the flop and now the turn. If you plan to bluff the river too (triple barrel), you need to commit ~65% of your stack total. Make sure the story is consistent.';
        }
        if (street === 'turn' && hasDraw) {
            return 'Turn semi-bluff: your draw gives you a safety net — if called, you can still hit. If you miss the river, you can give up or fire the third barrel as a pure bluff.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 163: CHECK-RAISE SIZING THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 163: Optimal check-raise sizing by context.
     */
    _getCheckRaiseSizingNote(optimalAction, street, nodeType, texture) {
        const node = (nodeType || '').toLowerCase();
        if (!node.includes('xr') && !node.includes('check_raise')) return '';
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';

        const sizePct = this._actionSizePct(a) ?? 0;

        if (street === 'flop') {
            if (sizePct <= 250) return `Check-raise to ${sizePct}%: standard sizing on the flop. A 3x check-raise puts villain in a tough spot — they need a strong hand to continue.`;
            return `Large check-raise to ${sizePct}%: oversized check-raise commits a large portion of your stack. This polarized sizing screams "I have a monster or nothing."`;
        }
        if (street === 'turn') {
            return `Turn check-raise: a very strong play. By the turn, check-raising is heavily weighted toward value. Villain\'s range is narrowed from the flop action — target their medium-strength continuing range.`;
        }
        if (street === 'river') {
            return `River check-raise: the strongest possible line. This is almost always the nuts or a big bluff — villain needs a very strong hand to call a river check-raise.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 164: OVERBETTING RIVER THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 164: Deep river overbet theory — maximizing polarization.
     */
    _getRiverOverbetNote(optimalAction, handStrength, street, stackDepth, estimatedPot) {
        if (street !== 'river') return '';
        const a = (optimalAction || '').toLowerCase();
        const sizePct = this._actionSizePct(a);
        if (sizePct == null) return '';
        if (sizePct <= 100) return ''; // Not an overbet

        const handToken = this._getHandToken(handStrength);
        const isNuts = ['nuts', 'second_nuts', 'full_house'].includes(handToken);
        const isAir = ['high_card', 'ace_high', 'missed_draw', 'overcards', 'air'].includes(handToken);

        if (isNuts) {
            return `River overbet for value (${sizePct}% pot): with the nuts, overbetting extracts maximum value. Villain's calling range narrows but each call pays more. This is optimal when you have a hand that beats everything but the absolute nuts.`;
        }
        if (isAir) {
            return `River overbet bluff (${sizePct}% pot): a maximally polarized bluff. The large size means villain needs to be right a high percentage of the time to call — even strong one-pair hands might fold. You need this to work ~${(sizePct / (100 + sizePct) * 100).toFixed(0)}% of the time.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 165: THIN VALUE VS THICK VALUE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 165: Distinguish thin value from thick value bets.
     */
    _getValueThicknessNote(handStrength, optimalAction, street) {
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';

        const handToken = this._getHandToken(handStrength);
        const isThickValue = ['nuts', 'second_nuts', 'full_house', 'flush', 'straight', 'set', 'trips'].includes(handToken);
        const isThinValue = ['two_pair', 'overpair', 'top_pair_top_kicker'].includes(handToken);
        const isVeryThin = ['top_pair', 'top_pair_weak_kicker', 'middle_pair'].includes(handToken);

        if (isThickValue) {
            return 'Thick value: your hand beats a large portion of villain\'s range. Size bigger to extract maximum value — you can afford to be called by worse hands frequently.';
        }
        if (isThinValue && street === 'river') {
            return 'Thin value bet: your hand beats some of villain\'s calling range but loses to some too. Size smaller to get called by more worse hands while minimizing losses against better.';
        }
        if (isVeryThin && street === 'river') {
            return '▲ Very thin value: this bet targets a narrow slice of villain\'s range that is worse but might call. The risk: getting raised means you\'re almost always behind. Consider check-calling instead.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 166: MERGED VS POLARIZED RANGE DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 166: Detect whether the current betting line is merged or polarized.
     */
    _getMergedVsPolarizedNote(optimalAction, handStrength, street, freq) {
        const a = (optimalAction || '').toLowerCase();
        if (!this._isAggressiveAction(a)) return '';
        const sizePct = this._actionSizePct(a) ?? 50;

        const handToken = this._getHandToken(handStrength);
        const isMedium = ['overpair', 'top_pair_top_kicker', 'top_pair', 'top_pair_weak_kicker', 'middle_pair'].includes(handToken);
        const isStrong = ['nuts', 'second_nuts', 'flush', 'straight', 'set'].includes(handToken);
        const isWeak = ['high_card', 'ace_high', 'missed_draw', 'underpair', 'weak_pair', 'overcards', 'air'].includes(handToken);

        if (sizePct <= 33 && freq >= 0.6) {
            if (isMedium) return 'Merged betting range: small sizing + high frequency = a merged/depolarized range. You\'re betting both value hands and medium hands at this size. Villain should defend wide.';
            return 'Range bet: small sizing used across your entire range to put pressure. This strategy works on boards that favor your range.';
        }
        if (sizePct >= 75) {
            if (isStrong || isWeak) return 'Polarized betting range: large sizing signals a polarized range — you either have the nuts or nothing. Medium hands check or use smaller sizes.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 167: NODE LOCKING CONCEPT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 167: Explain the concept of node locking for exploitative play.
     */
    _getNodeLockingNote(handStrength, optimalAction, street) {
        // Only show occasionally as an educational note
        if (!this._sessionStats || this._sessionStats.total % 15 !== 0) return '';
        if (this._sessionStats.total < 15) return '';

        return 'GTO concept — Node Locking: in real solvers, you can "lock"villain\'s strategy at a node (e.g., force them to always fold) and re-solve to find the best exploit. This is how pros find maximum deviation from GTO against specific player types.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 168: ICM PRESSURE CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 168: ICM (Independent Chip Model) pressure explanation.
     */
    _getICMNote(stackDepth, handStrength, optimalAction, category = null) {
        // ICM only applies in tournament formats — never emit for cash games
        if (category !== 'MTT' && category !== 'SPINS') return '';
        // ICM notes shown for tournament-like stack depths
        if (!stackDepth || stackDepth > 60) return ''; // Only relevant at shorter stacks
        if (!this._sessionStats || this._sessionStats.total % 12 !== 0) return '';

        const a = (optimalAction || '').toLowerCase();
        if (a === 'f') {
            return 'Tournament concept — ICM: in tournaments, chips lost are worth more than chips won (diminishing marginal utility). This means folding borderline spots is more correct than in cash games. Survival is paramount near pay jumps.';
        }
        if (a.startsWith('r') || a === 'allin') {
            return 'Tournament concept — ICM pressure: raising and going all-in applies ICM pressure to opponents who can\'t afford to bust. Players with medium stacks near the bubble fold more than GTO dictates.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 169: BUBBLE FACTOR EXPLANATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 169: Explain bubble factor for tournament contexts.
     */
    _getBubbleFactorNote(stackDepth, category = null) {
        // Bubble factor only applies in tournament formats — never emit for cash games
        if (category !== 'MTT' && category !== 'SPINS') return '';
        if (!stackDepth || stackDepth > 50) return '';
        if (!this._sessionStats || this._sessionStats.total % 18 !== 0) return '';

        return 'Bubble Factor: the ratio of chip value when losing vs winning. On the bubble, losing your stack costs much more (in $ EV) than doubling up gains. A bubble factor of 2.0 means you need 2x the chip equity to call compared to a cash game. Tighten your calling range near the bubble.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 170: SHORT-STACK PUSH/FOLD
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 170: Push/fold ranges for short stacks.
     */
    _getPushFoldNote(stackDepth, heroHand, heroPosition, optimalAction) {
        if (!stackDepth || stackDepth > 15) return '';
        const a = (optimalAction || '').toLowerCase();

        if (stackDepth <= 8) {
            if (a.startsWith('r') || a === 'allin') {
                return `Push/fold mode (${stackDepth}BB): at this stack depth, open-raising is an all-in. Your fold equity + hand equity combined determines profitability. Push ranges are significantly wider from late position.`;
            }
            if (a === 'f') {
                return `Push/fold fold (${stackDepth}BB): even at short stacks, some hands are too weak to shove. Wait for a better spot — your fold equity decreases as your stack shrinks further.`;
            }
        }
        if (stackDepth <= 15) {
            if (a.startsWith('r') || a === 'allin') {
                return `Short-stack play (${stackDepth}BB): raise-folding becomes awkward at this depth. Consider whether your hand is strong enough to call a shove if 3-bet — if not, shoving preflop may be better.`;
            }
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 171: ANTE-ADJUSTED OPENING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 171: How antes change opening ranges.
     */
    _getAnteNote(potType) {
        if (!potType || !potType.toLowerCase().includes('ante')) return '';
        return 'Ante pot: antes increase the dead money in the pot, making steals more profitable. Open wider from all positions — the extra dead money shifts marginal folds into profitable opens.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 172: LIMP-RAISE TRAPPING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 172: Limp-raise trapping theory.
     */
    _getLimpRaiseNote(nodeType, optimalAction, handStrength) {
        const handToken = this._getHandToken(handStrength);
        if (!nodeType || !nodeType.includes('limp')) return '';
        const a = (optimalAction || '').toLowerCase();
        const isPremium = ['nuts', 'second_nuts'].includes(handToken) || handToken === 'premium_pair';

        if (a.startsWith('r') && isPremium) {
            return 'Limp-raise trap: limping in first with a premium hand, then raising over an isolator. This is an exploitative play that works against aggressive opponents who iso-raise frequently. In GTO, limping is generally avoided.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 173: COLD-CALLING RANGE THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 173: Cold-calling range construction.
     */
    _getColdCallNote(nodeType, optimalAction, heroPosition, villainPosition) {
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'call' || !nodeType || !nodeType.includes('facing_raise')) return '';

        const isIP = this._isInPosition(heroPosition, villainPosition);
        if (isIP) {
            return 'Cold-calling in position: your flatting range should be hands that play well postflop — suited broadways, medium pairs, suited connectors. These hands have implied odds and realize equity well IP.';
        }
        return 'Cold-calling out of position: be selective. Only call with hands that have strong postflop playability or can hit hard. Suited connectors and medium pairs are better than offsuit broadways OOP.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 174: ISOLATION RAISE THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 174: Isolation raise vs limpers.
     */
    _getIsoRaiseNote(nodeType, optimalAction, heroPosition, handStrength) {
        if (!nodeType || !nodeType.includes('bb_option') && !nodeType.includes('iso')) return '';
        const a = (optimalAction || '').toLowerCase();
        if (!a.startsWith('r')) return '';

        const isLatePos = ['CO', 'BTN', 'SB'].includes(heroPosition);
        if (isLatePos) {
            return 'Iso-raise from late position: isolating a limper with a wide range exploits their weak, passive range. Size 3-4x the big blind to ensure you go heads-up with position.';
        }
        return 'Iso-raise: raising over a limper to play heads-up with initiative. Your range should be tighter than a standard open since the limper has already shown interest.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 175: BLIND VS BLIND DYNAMICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 175: Special SB vs BB (blind vs blind) dynamics.
     */
    _getBlindVsBlindNote(heroPosition, villainPosition, nodeType, optimalAction) {
        const isBvB = (heroPosition === 'SB' && villainPosition === 'BB') || (heroPosition === 'BB' && villainPosition === 'SB');
        if (!isBvB) return '';
        const a = (optimalAction || '').toLowerCase();

        if (heroPosition === 'SB') {
            if (a.startsWith('r')) return 'SB vs BB: the most contested pot in poker. SB should open very wide (~65-80%) since only one opponent remains. Size 2.5x to steal efficiently.';
            if (a === 'f') return 'SB fold: even in BvB where ranges are wide, some hands are unprofitable to play OOP. This hand doesn\'t have enough playability to overcome the positional disadvantage.';
        }
        if (heroPosition === 'BB') {
            if (a === 'call') return 'BB defense vs SB: defend very wide here — the SB opens with a huge range, so your calling range should be equally wide. You\'re getting good pot odds with position postflop.';
            if (a.startsWith('r')) return 'BB 3-bet vs SB: 3-betting from the BB is highly effective against the SB\'s wide stealing range. Many of their hands can\'t continue vs a 3-bet.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 176: SCENARIO DIFFICULTY SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 176: Rate each question's difficulty 1-10 based on spot complexity.
     */
    scoreScenarioDifficulty(scenario, handActions) {
        let difficulty = 5; // Base difficulty

        // Mixed frequency increases difficulty
        const freqs = Object.values(handActions || {});
        const maxFreq = Math.max(...freqs, 0);
        if (maxFreq < 0.6) difficulty += 2; // Heavily mixed = harder
        else if (maxFreq < 0.8) difficulty += 1; // Somewhat mixed

        // Multi-way harder than HU
        if (scenario.potType && scenario.potType.toLowerCase().includes('multi')) difficulty += 1;

        // Later streets slightly harder
        if (scenario.street === 'turn') difficulty += 0.5;
        if (scenario.street === 'river') difficulty += 1;

        // 3-bet/4-bet pots harder
        if (scenario.potType && (scenario.potType.includes('3-Bet') || scenario.potType.includes('4-Bet'))) difficulty += 1;

        // Deep stacks add complexity
        if (scenario.stack_depth && scenario.stack_depth > 150) difficulty += 1;

        return Math.min(10, Math.max(1, Math.round(difficulty)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 177: MISTAKE CLASSIFICATION REFINEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 177: Refine mistake classification with EV-based magnitude.
     */
    classifyMistakeMagnitude(chosenAction, correctAction, handActions, actionEVs, estimatedPot = 0) {
        const chosenFreq = handActions?.[chosenAction] || 0;
        const correctFreq = handActions?.[correctAction] || 1;

        // Check if EV data available
        if (actionEVs && actionEVs[chosenAction] != null && actionEVs[correctAction] != null) {
            const evGap = actionEVs[correctAction] - actionEVs[chosenAction];
            // actionEVs are bb-scaled — convert the gap to a pot fraction before
            // comparing against the pot-fraction thresholds below
            const pot = estimatedPot || 0;
            const gapPctPot = pot > 0 ? evGap / pot : evGap;
            if (gapPctPot <= 0.02) return { classification: 'TRIVIAL', desc: 'Negligible EV difference — both plays are essentially equal.' };
            if (gapPctPot <= 0.10) return { classification: 'INACCURACY', desc: 'Small EV loss — acceptable in real-time play.' };
            if (gapPctPot <= 0.30) return { classification: 'MISTAKE', desc: 'Moderate EV loss — worth studying this spot.' };
            return { classification: 'BLUNDER', desc: 'Significant EV loss — this is a major leak to fix.' };
        }

        // Fallback to frequency-based
        if (chosenFreq >= 0.3) return { classification: 'INACCURACY', desc: 'Your action is a valid part of the mixed strategy, just not the most frequent.' };
        if (chosenFreq >= 0.1) return { classification: 'MISTAKE', desc: 'Your action exists in the solver\'s strategy but at low frequency.' };
        if (chosenFreq > 0) return { classification: 'MISTAKE', desc: 'Rarely taken action — the solver almost never plays this way.' };
        return { classification: 'BLUNDER', desc: 'This action is never in the solver\'s strategy — significant deviation from GTO.' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 178: STREAK-BASED MOTIVATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 178: Streak-based motivation messages.
     */
    getStreakMessage(currentStreak) {
        if (!currentStreak || currentStreak < 3) return null;
        if (currentStreak === 3) return '▲ 3 in a row! You\'re warming up!';
        if (currentStreak === 5) return '▲▲ 5-streak! Your GTO instincts are sharp!';
        if (currentStreak === 10) return '▲▲▲ 10 in a row! You\'re in the zone — GTO machine!';
        if (currentStreak === 15) return '15 streak! You\'re playing at an elite level!';
        if (currentStreak === 20) return '20 in a row! Solver-level accuracy — incredible!';
        if (currentStreak >= 25 && currentStreak % 5 === 0) return `${currentStreak} streak! You might be the best player in this training session ever!`;
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 179: HISTORICAL BEST TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 179: Track session bests for motivation.
     */
    recordSessionBest(metric, value) {
        if (!this._sessionBests) this._sessionBests = {};
        if (!this._sessionBests[metric] || value > this._sessionBests[metric]) {
            this._sessionBests[metric] = value;
            return true; // New record!
        }
        return false;
    }

    getSessionBests() {
        return this._sessionBests || {};
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 180: QUESTION TYPE DIVERSITY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 180: Track question type distribution to ensure variety.
     */
    recordQuestionType(type) {
        if (!this._questionTypeTracker) this._questionTypeTracker = {};
        this._questionTypeTracker[type] = (this._questionTypeTracker[type] || 0) + 1;
    }

    getUnderrepresentedTypes() {
        if (!this._questionTypeTracker) return [];
        const types = Object.entries(this._questionTypeTracker || {});
        if (types.length < 3) return [];
        const avg = types.reduce((s, [, ct]) => s + ct, 0) / types.length;
        return types.filter(([, ct]) => ct < avg * 0.5).map(([type]) => type);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 181: BOARD TEXTURE QUIZ DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 181: Generate board texture quiz — identify texture characteristics.
     */
    generateTextureQuiz(board) {
        if (!board || board.length < 3) return null;
        const texture = this._analyzeTexture(board);
        if (!texture) return null;

        const questions = [];
        questions.push({ q: 'Is this board wet or dry?', a: texture.wet ? 'Wet' : 'Dry', explain: texture.flushy || texture.monotone ? 'Flush draws present' : texture.straightDrawHeavy || texture.straightPossible ? 'Straight draws present' : 'No obvious draws' });
        questions.push({ q: 'Is a flush draw possible?', a: (texture.flushy || texture.monotone) ? 'Yes' : 'No', explain: texture.monotone ? 'Monotone board — flush already possible' : texture.flushy ? 'Three of one suit on board' : 'Not enough of one suit for a flush' });
        questions.push({ q: 'Is the board paired?', a: texture.paired ? 'Yes' : 'No', explain: texture.paired ? 'Board has a pair — full houses and trips possible' : 'No pair on board' });

        return questions;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 182: PREFLOP RANGE QUIZ DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 182: Generate preflop range quiz — is this hand in the opening range?
     */
    generateRangeQuiz(position) {
        const ranges = {
            'UTG': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs'],
            'HJ': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'KQs', 'KQo', 'KJs', 'QJs', 'JTs'],
            'CO': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'A9s', 'KQs', 'KQo', 'KJs', 'QJs', 'JTs', 'T9s'],
            'SB': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'A9s', 'KQs', 'KQo', 'KJs', 'QJs', 'JTs', 'T9s'],
            'BTN': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s', 'KQs', 'KQo', 'KJs', 'KJo', 'KTs', 'K9s', 'QJs', 'QJo', 'QTs', 'Q9s', 'JTs', 'J9s', 'T9s', 'T8s', '98s', '87s', '76s', '65s'],
        };
        const range = ranges[position] || ranges['CO'];

        // Generate 5 random quiz hands
        const allHands = ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
            'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'AJo', 'ATs', 'ATo', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
            'KQs', 'KQo', 'KJs', 'KJo', 'KTs', 'K9s', 'K8s', 'QJs', 'QJo', 'QTs', 'Q9s',
            'JTs', 'J9s', 'T9s', 'T8s', '98s', '97s', '87s', '76s', '65s', '54s',
            'J8o', 'T7o', '96o', '85o', '74o', '63o', '52o'];

        const quizHands = [];
        const used = new Set();
        while (quizHands.length < 5 && quizHands.length < allHands.length) {
            const idx = Math.floor(Math.random() * allHands.length);
            if (used.has(idx)) continue;
            used.add(idx);
            const hand = allHands[idx];
            quizHands.push({ hand, inRange: range.includes(hand), position });
        }
        return quizHands;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 183: POT ODDS QUIZ DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 183: Generate pot odds quiz scenarios.
     */
    generatePotOddsQuiz() {
        const scenarios = [
            { pot: 10, bet: 5, outs: 9, street: 'turn', answer: 'Call', explain: '9 outs × 2 = 18% equity. Need 5/(10+5+5) = 25%. Close but implied odds make it a call.' },
            { pot: 20, bet: 10, outs: 8, street: 'flop', answer: 'Call', explain: '8 outs × 4 = 32% equity (2 streets). Need 10/(20+10+10) = 25%. Easy call.' },
            { pot: 15, bet: 15, outs: 4, street: 'turn', answer: 'Fold', explain: '4 outs × 2 = 8% equity. Need 15/(15+15+15) = 33%. Way too expensive.' },
            { pot: 30, bet: 10, outs: 15, street: 'flop', answer: 'Raise', explain: '15 outs × 4 = 60% equity. You\'re a favorite — raise for value!' },
            { pot: 8, bet: 8, outs: 6, street: 'turn', answer: 'Fold', explain: '6 outs × 2 = 12% equity. Need 8/(8+8+8) = 33%. Not enough equity to call.' },
        ];
        return scenarios[Math.floor(Math.random() * scenarios.length)];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 184: MIXED STRATEGY EXPLANATION ENHANCEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 184: Enhanced explanation for mixed strategy spots.
     */
    _getMixedStrategyNote(handActions, optimalAction, freq) {
        if (!handActions || freq >= 0.9) return ''; // Pure strategy — no mixing
        const actions = Object.entries(handActions || {}).filter(([, f]) => f > 0.05);
        if (actions.length < 2) return '';

        const sorted = actions.sort((a, b) => b[1] - a[1]);
        if (sorted.length === 2) {
            const [a1, f1] = sorted[0];
            const [a2, f2] = sorted[1];
            const label1 = this._actionLabel(a1);
            const label2 = this._actionLabel(a2);
            if (Math.abs(f1 - f2) < 0.15) {
                return `Nearly even split: solver uses ${label1} ${(f1 * 100).toFixed(0)}% and ${label2} ${(f2 * 100).toFixed(0)}%. Both plays are close in EV — in practice, either is acceptable. The mix exists for balance.`;
            }
            return `Mixed strategy: ${label1} ${(f1 * 100).toFixed(0)}% is preferred over ${label2} ${(f2 * 100).toFixed(0)}%. The less frequent action keeps your range balanced but isn't required for most players.`;
        }
        if (sorted.length >= 3) {
            return `Complex mixed spot: solver splits between ${sorted.length} actions. The primary play (${this._actionLabel(sorted[0][0])} ${(sorted[0][1] * 100).toFixed(0)}%) is a safe default. Mixing is mainly for GTO balance at high levels.`;
        }
        return '';
    }

    _actionLabel(action) {
        if (!action) return 'unknown';
        const a = action.toLowerCase();
        if (a === 'f') return 'fold';
        if (a === 'call') return 'call';
        if (a === 'x' || a === 'check') return 'check';
        if (a === 'allin') return 'all-in';
        if (a.startsWith('r')) return `raise ${a.slice(1)}%`;
        return action;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 185: USER VS SOLVER FREQUENCY COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 185: Track user's action frequencies vs solver's.
     */
    recordUserAction(action, solverAction, street, nodeType) {
        if (!this._freqComparison) this._freqComparison = {};
        const key = `${street}:${nodeType || 'general'}`;
        if (!this._freqComparison[key]) this._freqComparison[key] = { userActions: {}, solverActions: {} };

        const ua = this._normalizeAction(action);
        const sa = this._normalizeAction(solverAction);
        this._freqComparison[key].userActions[ua] = (this._freqComparison[key].userActions[ua] || 0) + 1;
        this._freqComparison[key].solverActions[sa] = (this._freqComparison[key].solverActions[sa] || 0) + 1;
    }

    _normalizeAction(action) {
        if (!action) return 'unknown';
        const a = action.toLowerCase();
        if (a === 'f') return 'fold';
        if (a === 'call') return 'call';
        if (a === 'x' || a === 'check') return 'check';
        if (this._isAggressiveAction(a)) return 'raise';
        return a;
    }

    getFrequencyComparison() {
        if (!this._freqComparison) return null;
        const result = {};
        for (const [key, data] of Object.entries(this._freqComparison || {})) {
            const userTotal = Object.values(data.userActions || {}).reduce((s, v) => s + v, 0);
            const solverTotal = Object.values(data.solverActions || {}).reduce((s, v) => s + v, 0);
            if (userTotal < 3) continue;
            result[key] = {
                user: Object.fromEntries(Object.entries(data.userActions || {}).map(([a, ct]) => [a, ((ct / userTotal) * 100).toFixed(0) + '%'])),
                solver: Object.fromEntries(Object.entries(data.solverActions || {}).map(([a, ct]) => [a, ((ct / solverTotal) * 100).toFixed(0) + '%'])),
            };
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 186: OPPONENT MODELING BASICS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 186: Basic opponent type identification note.
     */
    _getOpponentModelNote(nodeType, street) {
        if (!this._sessionStats || this._sessionStats.total % 20 !== 0) return '';
        if (this._sessionStats.total < 20) return '';

        return 'Opponent modeling: in real games, categorize opponents. TAG (Tight-Aggressive): plays few hands, bets strong — respect their bets. LAG (Loose-Aggressive): plays many hands aggressively — widen your calling range. Nit: folds too much — bluff more. Fish: calls too much — value bet wider, bluff less.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 187: LEAK FINDER REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 187: Generate a detailed leak finder report.
     */
    generateLeakFinderReport() {
        const deviations = this.getDeviationSummary();
        const aggression = this.getAggressionFactors();
        const preflopStats = this.getPreflopStats();
        const positional = this.getPositionalAwarenessScore();
        const concepts = this.getConceptMastery();

        const leaks = [];

        // Check deviations
        if (deviations) {
            if (parseInt(deviations.overFoldPct) > 20) leaks.push({ leak: 'Over-folding', severity: 'HIGH', fix: 'Study pot odds and MDF. You\'re folding too many hands that have enough equity to continue.' });
            if (parseInt(deviations.overCallPct) > 20) leaks.push({ leak: 'Over-calling', severity: 'HIGH', fix: 'Tighten calling ranges, especially on the river. Learn to let go of medium-strength hands.' });
            if (parseInt(deviations.overRaisePct) > 20) leaks.push({ leak: 'Over-raising', severity: 'MEDIUM', fix: 'Sometimes calling or checking is better than raising. Not every hand needs to be played aggressively.' });
        }

        // Check aggression
        for (const [street, data] of Object.entries(aggression || {})) {
            if (data.assessment === 'too passive') leaks.push({ leak: `Too passive on ${street}`, severity: 'MEDIUM', fix: `Increase your betting and raising frequency on the ${street}. Passive play lets opponents realize equity for free.` });
            if (data.assessment === 'too aggressive') leaks.push({ leak: `Over-aggressive on ${street}`, severity: 'MEDIUM', fix: `Dial back aggression on the ${street}. Not every hand should be bet — some are better as checks/calls.` });
        }

        // Check preflop stats
        if (preflopStats) {
            if (parseFloat(preflopStats.vpip) > 35) leaks.push({ leak: 'Playing too many hands preflop', severity: 'HIGH', fix: 'Tighten your preflop range. Focus on quality hands and position.' });
            if (parseFloat(preflopStats.gap) > 15) leaks.push({ leak: 'Large VPIP/PFR gap (too much cold-calling)', severity: 'MEDIUM', fix: 'Instead of flat-calling, consider 3-betting or folding. Cold-calling creates dominated spots.' });
        }

        // Check concept mastery
        for (const [concept, data] of Object.entries(concepts || {})) {
            if (data.mastery === 'needs_work') leaks.push({ leak: `Weak at: ${concept.replace(/_/g, ' ')}`, severity: 'MEDIUM', fix: `Focus study on ${concept.replace(/_/g, ' ')} spots. Review solver solutions for this category.` });
        }

        return { leaks: leaks.slice(0, 8), totalLeaksFound: leaks.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 188: SESSION PACING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 188: Track time per question for pacing analysis.
     */
    recordQuestionTiming(questionNumber, timeMs) {
        if (!this._timingData) this._timingData = [];
        this._timingData.push({ question: questionNumber, timeMs, timestamp: Date.now() });
    }

    getTimingAnalysis() {
        if (!this._timingData || this._timingData.length < 5) return null;
        const times = this._timingData.map(t => t.timeMs);
        const avg = times.reduce((s, v) => s + v, 0) / times.length;
        const fastest = Math.min(...times);
        const slowest = Math.max(...times);
        const recent5 = times.slice(-5);
        const recentAvg = recent5.reduce((s, v) => s + v, 0) / recent5.length;

        return {
            avgTimeMs: Math.round(avg),
            avgTimeSec: (avg / 1000).toFixed(1) + 's',
            fastest: (fastest / 1000).toFixed(1) + 's',
            slowest: (slowest / 1000).toFixed(1) + 's',
            recentAvg: (recentAvg / 1000).toFixed(1) + 's',
            trend: recentAvg < avg * 0.8 ? 'speeding_up' : recentAvg > avg * 1.2 ? 'slowing_down' : 'consistent',
            assessment: avg < 5000 ? 'Quick decisions — make sure you\'re thinking it through, not just guessing.' :
                avg < 15000 ? 'Good pace — taking enough time to think but not overthinking.' :
                'Taking a while — try to identify the key factors faster. Pattern recognition will come with practice.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 189: CONFIDENCE CALIBRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 189: Track user confidence vs actual correctness.
     */
    recordConfidence(questionNumber, confidenceLevel, isCorrect) {
        if (!this._confidenceData) this._confidenceData = [];
        this._confidenceData.push({ question: questionNumber, confidence: confidenceLevel, correct: isCorrect });
    }

    getConfidenceCalibration() {
        if (!this._confidenceData || this._confidenceData.length < 10) return null;
        const byConfidence = {};
        for (const d of this._confidenceData) {
            const bucket = d.confidence >= 80 ? 'high' : d.confidence >= 50 ? 'medium' : 'low';
            if (!byConfidence[bucket]) byConfidence[bucket] = { total: 0, correct: 0 };
            byConfidence[bucket].total++;
            if (d.correct) byConfidence[bucket].correct++;
        }

        const result = {};
        for (const [bucket, data] of Object.entries(byConfidence || {})) {
            const accuracy = (data.correct / data.total * 100).toFixed(0);
            result[bucket] = {
                accuracy: accuracy + '%',
                total: data.total,
                calibrated: bucket === 'high' ? parseInt(accuracy) >= 70 : bucket === 'low' ? parseInt(accuracy) <= 40 : true,
            };
        }

        const overconfident = result.high && !result.high.calibrated;
        const underconfident = result.low && !result.low.calibrated && parseInt(result.low.accuracy) > 50;

        return {
            buckets: result,
            assessment: overconfident ? 'Overconfident: you\'re confident on questions you\'re getting wrong. Slow down and double-check.' :
                underconfident ? 'Underconfident: you\'re second-guessing yourself on questions you know. Trust your instincts more.' :
                'Well-calibrated: your confidence matches your accuracy.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 190: HAND HISTORY REPLAY DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 190: Generate hand history replay format for review.
     */
    recordHandForReplay(scenario, heroHand, board, chosenAction, correctAction, explanation) {
        if (!this._handHistory) this._handHistory = [];
        this._handHistory.push({
            id: this._handHistory.length + 1,
            timestamp: Date.now(),
            street: scenario.street,
            heroHand,
            board: board ? [...board] : [],
            heroPosition: scenario.heroPosition,
            villainPosition: scenario.villainPosition,
            nodeType: scenario.nodeType,
            potType: scenario.potType,
            chosenAction,
            correctAction,
            isCorrect: chosenAction === correctAction,
            explanation: explanation || '',
        });
    }

    getHandHistory() { return this._handHistory || []; }

    getFilteredHandHistory(filter) {
        const history = this._handHistory || [];
        if (!filter) return history;
        return history.filter(h => {
            if (filter.street && h.street !== filter.street) return false;
            if (filter.correctOnly && !h.isCorrect) return false;
            if (filter.mistakesOnly && h.isCorrect) return false;
            if (filter.position && h.heroPosition !== filter.position) return false;
            return true;
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 191: CUSTOM DRILL CREATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 191: Allow users to create custom drills for specific spots.
     */
    createCustomDrill(config) {
        if (!this._customDrills) this._customDrills = [];
        const drill = {
            id: this._customDrills.length + 1,
            name: config.name || `Drill ${this._customDrills.length + 1}`,
            filters: {
                streets: config.streets || ['flop', 'turn', 'river'],
                positions: config.positions || null,
                nodeTypes: config.nodeTypes || null,
                handStrengths: config.handStrengths || null,
                difficulty: config.difficulty || null,
            },
            questionsPerSession: config.questionsPerSession || 20,
            created: Date.now(),
        };
        this._customDrills.push(drill);
        return drill;
    }

    getCustomDrills() { return this._customDrills || []; }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 192: PROGRESSIVE COMPLEXITY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 192: Progressive complexity system — start simple, build up.
     */
    getProgressiveLevel() {
        if (!this._sessionStats) return 1;
        const total = this._sessionStats.total || 0;
        const accuracy = total > 0 ? this._sessionStats.correct / total : 0;

        if (total < 10) return 1; // Beginner: pure strategy spots
        if (total < 25 && accuracy >= 0.6) return 2; // Intermediate: some mixed
        if (total < 50 && accuracy >= 0.65) return 3; // Advanced: mixed + multi-street
        if (accuracy >= 0.7) return 4; // Expert: all spot types
        return Math.max(1, Math.min(4, Math.floor(accuracy * 5)));
    }

    getProgressiveLevelDescription() {
        const level = this.getProgressiveLevel();
        const descs = {
            1: { name: 'Foundation', desc: 'Pure strategy spots — clear correct answers. Building basic GTO instincts.' },
            2: { name: 'Developing', desc: 'Introducing mixed strategies and positional play. Learning when the solver splits actions.' },
            3: { name: 'Advanced', desc: 'Complex multi-street scenarios, multi-way pots, and tight mixed spots.' },
            4: { name: 'Expert', desc: 'Full solver complexity — close EV spots, complex board interactions, multi-street planning.' },
        };
        return descs[level] || descs[1];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 193: CROSS-STREET CONSISTENCY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 193: Check if user's line makes sense across streets.
     */
    _getCrossStreetConsistencyNote(street, nodeType, optimalAction, handStrength) {
        if (street === 'preflop' || street === 'flop') return '';
        // On turn/river, comment on whether the line is consistent
        const a = (optimalAction || '').toLowerCase();
        const node = (nodeType || '').toLowerCase();

        if (street === 'turn' && a.startsWith('r') && node.includes('check')) {
            return 'Line consistency: checking the flop then betting the turn is a well-known "delayed c-bet" line. It tells a consistent story — you checked to trap or control the pot, then bet when the turn changed things.';
        }
        if (street === 'river' && a.startsWith('r')) {
            return 'Cross-street consistency: triple-barreling (betting all three streets) is a polarized line. Make sure your story is consistent — did each card justify continued aggression?';
        }
        if (street === 'river' && a === 'x' && node.includes('bet')) {
            return 'Line change: betting earlier then checking the river can mean your hand has showdown value but can\'t bet for value (only better calls, worse folds). This is a natural endpoint for many medium-strength hands.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 194: RANGE VS SPECIFIC HAND THINKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 194: Encourage range-based thinking over hand-based thinking.
     */
    _getRangeThinkingNote(street, handStrength) {
        if (!this._sessionStats || this._sessionStats.total % 10 !== 0) return '';
        if (this._sessionStats.total < 10) return '';

        return 'Think in ranges, not hands: instead of asking "what does villain have?", ask "what does villain\'s RANGE look like?". GTO strategy is about balancing your range — not reading a specific hand. Every decision should consider how your entire range plays, not just this one hand.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 195: SOLVER APPROXIMATION TRANSPARENCY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 195: Note how close our answer is to a real solver.
     */
    _getSolverApproximationNote(freq, handActions) {
        if (!handActions) return '';
        const actions = Object.entries(handActions || {}).filter(([, f]) => f > 0.01);
        if (actions.length <= 1) return ''; // Pure strategy — high confidence

        const maxFreq = Math.max(...actions.map(([, f]) => f));
        if (maxFreq >= 0.9) return 'Solver confidence: HIGH — this is a near-pure strategy. The solver almost always takes this action.';
        if (maxFreq >= 0.7) return 'Solver confidence: MEDIUM — this is the preferred action but alternatives exist. In-game, defaulting to the highest-frequency action is correct.';
        return 'Solver confidence: LOW — this is a heavily mixed spot. Multiple actions have similar EV. Don\'t stress about getting the "right" answer in mixed spots.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 196: PRE-ACTION THOUGHT PROMPTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 196: Generate thought prompts for players to consider before deciding.
     */
    generateThoughtPrompts(scenario, heroHand, board) {
        const prompts = [];
        const street = scenario.street || 'flop';

        if (street === 'preflop') {
            prompts.push('What position am I in?');
            prompts.push('What is the action behind me?');
            prompts.push('Is my hand in my range for this action?');
        } else {
            prompts.push('What is the board texture?');
            prompts.push('Am I in position or out of position?');
            prompts.push('What is the stack-to-pot ratio?');
            if (street === 'flop') prompts.push('Who has the range advantage on this board?');
            if (street === 'turn') prompts.push('How did the turn card change the board dynamic?');
            if (street === 'river') prompts.push('Is my hand good enough to bet for value? Or should I check?');
            prompts.push('What would my range look like here? Am I balanced?');
        }
        return prompts;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 197: POST-HAND ANALYSIS FRAMEWORK
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 197: Framework for analyzing a hand after it's played.
     */
    generatePostHandAnalysis(scenario, heroHand, board, chosenAction, correctAction, handActions) {
        const analysis = {
            decision: chosenAction === correctAction ? 'Correct' : 'Incorrect',
            solverFrequency: handActions?.[correctAction] ? (handActions[correctAction] * 100).toFixed(0) + '%' : 'N/A',
            chosenFrequency: handActions?.[chosenAction] ? (handActions[chosenAction] * 100).toFixed(0) + '%' : '0%',
            keyFactors: [],
            alternativeLines: [],
        };

        // Key factors
        if (scenario.street !== 'preflop') {
            analysis.keyFactors.push('Board texture');
            analysis.keyFactors.push('Position');
            analysis.keyFactors.push('Stack depth / SPR');
        }
        analysis.keyFactors.push('Hand strength relative to range');
        analysis.keyFactors.push('Villain\'s likely range given the action');

        // Alternative lines
        const alts = Object.entries(handActions || {}).filter(([a, f]) => f > 0.1 && a !== correctAction).sort((a, b) => b[1] - a[1]);
        for (const [a, f] of alts.slice(0, 2)) {
            analysis.alternativeLines.push({ action: this._actionLabel(a), frequency: (f * 100).toFixed(0) + '%' });
        }

        return analysis;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 198: MENTAL GAME COACHING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 198: Mental game coaching notes — tilt control, focus, etc.
     */
    getMentalGameNote() {
        if (!this._sessionStats || this._sessionStats.total < 10) return null;
        const recent = (this._recentResults || []).slice(-5);
        const recentWrong = recent.filter(r => !r).length;

        if (recentWrong >= 4) {
            return 'Mental game check: 4 of your last 5 answers were incorrect. This might be tilt creeping in — take a deep breath, refocus on the fundamentals. Quality of study matters more than quantity.';
        }
        if (recentWrong >= 3) {
            return 'Tough stretch — don\'t let frustration affect your next decision. Each question is independent. Reset and focus on the current hand only.';
        }

        // Periodic mental game tips
        const total = this._sessionStats.total;
        if (total === 30) return '30 questions in! Stay focused — fatigue can creep in. Take a short break if you need it.';
        if (total === 50) return '50 questions! Great session length. Studies show GTO training is most effective in 30-60 minute sessions.';
        if (total === 75) return 'Long session! Your concentration may be waning. Consider wrapping up and reviewing your session report.';

        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 199: BANKROLL MANAGEMENT NOTES
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 199: Bankroll management integration.
     */
    getBankrollNote() {
        if (!this._sessionStats || this._sessionStats.total % 25 !== 0) return null;
        if (this._sessionStats.total < 25) return null;

        const accuracy = this._sessionStats.correct / this._sessionStats.total;
        if (accuracy >= 0.75) {
            return 'Bankroll tip: with your accuracy level, you should be profitable at the tables. The standard recommendation is 20-30 buy-ins for cash games and 100+ for tournaments.';
        }
        if (accuracy >= 0.55) {
            return 'Bankroll tip: you\'re developing solid fundamentals. Focus on building a bankroll of 30+ buy-ins before moving up in stakes. Proper bankroll management prevents going broke during downswings.';
        }
        return 'Bankroll tip: while you\'re still building your GTO knowledge, play at stakes where losses won\'t affect your bankroll significantly. Study is more important than playing right now.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 200: FINAL ENGINE OPTIMIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 200: Engine summary and optimization utilities.
     * - Clear session data for fresh starts
     * - Engine health check
     * - Version info
     */
    resetSession() {
        this._sessionStats = { total: 0, correct: 0 };
        this._mistakeTracker = {};
        this._recentResults = [];
        this._deviationTracker = null;
        this._conceptMastery = {};
        this._spacedRepetition = [];
        this._evGraphData = [];
        this._aggressionTracker = {};
        this._preflopStats = { hands: 0, vpip: 0, pfr: 0 };
        this._positionalAwareness = {};
        this._questionTypeTracker = {};
        this._timingData = [];
        this._confidenceData = [];
        this._handHistory = [];
        this._sessionBests = {};
        this._freqComparison = {};
        this._challengeMode = null;
        this._achievements = new Set();
        this._trainingCalendar = {};
        this._cumulativeDeviationCost = null;
        this._explanationRatings = [];
        this._customDrills = [];
        this._scenarioTags = {};
    }

    getEngineHealth() {
        const statsCount = this._sessionStats?.total || 0;
        const trackerDims = this._mistakeTracker ? Object.keys(this._mistakeTracker || {}).length : 0;
        const concepts = this._conceptMastery ? Object.keys(this._conceptMastery || {}).length : 0;
        const historySize = (this._handHistory || []).length;

        return {
            status: 'healthy',
            version: '4.2.0-phase350',
            questionsAnswered: statsCount,
            mistakeTrackerDimensions: trackerDims,
            conceptsTracked: concepts,
            handHistorySize: historySize,
            memoryEstimate: `~${Math.round((historySize * 200 + trackerDims * 50 + concepts * 30) / 1024)}KB`,
            features: 350,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 201: EQUITY BUCKET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 201: Analyze how equity distributes across action choices.
     * Helps understand why solver splits between actions.
     */
    _getEquityBucketNote(handStrength, optimalAction, handActions) {
        if (!handActions) return '';
        const actions = Object.entries(handActions || {}).filter(([, f]) => f > 0.05);
        if (actions.length < 2) return '';

        const strengthOrder = {
            'nuts': 95, 'second_nuts': 90, 'full_house': 88, 'flush': 82, 'straight': 78,
            'set': 75, 'trips': 72, 'two_pair': 65, 'overpair': 60, 'top_pair_top_kicker': 55,
            'top_pair': 50, 'top_pair_weak_kicker': 45, 'middle_pair': 35, 'second_pair': 30,
            'third_pair': 25, 'bottom_pair': 20, 'weak_pair': 20, 'underpair': 18, 'ace_high': 15,
            'overcards': 15, 'high_card': 10, 'air': 10,
            'combo_draw': 55, 'oesd': 40, 'flush_draw': 38, 'gutshot': 20, 'missed_draw': 5,
        };
        const equity = strengthOrder[this._getHandToken(handStrength)] ?? 30;

        if (equity >= 70) return 'Equity bucket: TOP — your hand is in the strongest portion of your range. This equity bucket almost always bets for value. The question is sizing, not whether to bet.';
        if (equity >= 45) return 'Equity bucket: MIDDLE — your hand has decent equity but isn\'t a clear value bet or fold. These hands often check for pot control or bet small as a merge.';
        if (equity >= 25) return 'Equity bucket: BOTTOM of made hands — marginal showdown value. In GTO, these are natural check/calls on most streets or bluff candidates on the river.';
        return 'Equity bucket: AIR — no real showdown value. This is the bluff portion of your range. The solver uses these hands as bluffs to balance the value bets.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 202: RANGE MORPHOLOGY TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 202: Track how ranges change shape street by street.
     */
    _getRangeMorphologyNote(street, nodeType, handStrength) {
        const handToken = this._getHandToken(handStrength);
        if (street === 'preflop') return '';

        if (street === 'flop') {
            return 'Range shape (flop): both ranges are still wide. The PFR has an overpair/big card advantage, the caller has more suited connectors and medium pairs. Ranges begin to narrow based on the flop texture.';
        }
        if (street === 'turn') {
            const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'flush', 'straight'].includes(handToken);
            if (isStrong) return 'Range shape (turn): ranges have narrowed significantly. Weak hands have folded, and remaining ranges are polarized — strong hands and draws vs medium hands and bluffs.';
            return 'Range shape (turn): by the turn, ranges are much narrower. Players who continued from the flop have shown interest — expect stronger average hand strength from both sides.';
        }
        if (street === 'river') {
            return 'Range shape (river): maximally narrowed. Draws have either hit or missed. Remaining ranges are highly polarized — the nuts/strong value vs bluff-catchers vs bluffs. No more drawing equity to consider.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 203: BOARD COVERAGE HEATMAP DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 203: Generate board coverage data — which ranks/suits does hero's range cover?
     */
    generateBoardCoverageData(board, heroPosition, isPFR) {
        if (!board || board.length < 3) return null;
        const ranks = 'AKQJT98765432'.split('');
        const boardRanks = board.map(c => c[0]);
        const boardSuits = board.map(c => c[1]);

        const coverage = {};
        for (const rank of ranks) {
            const onBoard = boardRanks.includes(rank);
            const rankVal = '23456789TJQKA'.indexOf(rank);
            coverage[rank] = {
                onBoard,
                pfrHits: isPFR ? (rankVal >= 9 ? 'high' : rankVal >= 5 ? 'medium' : 'low') : null,
                callerHits: !isPFR ? (rankVal <= 8 && rankVal >= 3 ? 'high' : 'medium') : null,
                sets: onBoard ? 'possible' : 'impossible',
            };
        }
        return coverage;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 204: NUT COMBO COUNTING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 204: Count exact combos for nutted hands on this board.
     */
    countNutCombos(board) {
        if (!board || board.length < 3) return null;
        const boardRanks = board.map(c => '23456789TJQKA'.indexOf(c[0]));
        const boardSuits = board.map(c => c[1]);
        const combos = {};

        // Sets: 3 combos each (4C2 = 6, minus the one card on board × remaining = 3)
        const uniqueRanks = [...new Set(boardRanks)];
        for (const r of uniqueRanks) {
            const count = boardRanks.filter(br => br === r).length;
            if (count === 1) combos[`set_of_${'23456789TJQKA'[r]}s`] = 3;
            if (count === 2) combos[`quads_${'23456789TJQKA'[r]}s`] = 1;
        }

        // Two-pair combos (rough count)
        if (uniqueRanks.length >= 2) {
            const pairCombos = uniqueRanks.length * (uniqueRanks.length - 1) / 2;
            combos['two_pair_total'] = pairCombos * 9; // ~9 combos per two-pair type
        }

        // Flush draws (if 2+ of same suit)
        const suitCounts = {};
        boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
        for (const [suit, ct] of Object.entries(suitCounts || {})) {
            if (ct >= 2 && ct < board.length) {
                const remainingOfSuit = 13 - ct;
                combos[`flush_draw_${suit}`] = Math.floor(remainingOfSuit * (remainingOfSuit - 1) / 2);
            }
            if (ct >= 3) {
                const remainingOfSuit = 13 - ct;
                combos[`made_flush_${suit}`] = Math.floor(remainingOfSuit * (remainingOfSuit - 1) / 2);
            }
        }

        return combos;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 205: BLOCKER INTERACTION MATRIX
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 205: Show which blockers affect which combos.
     */
    _getBlockerMatrixNote(heroHand, board, handStrength, optimalAction) {
        const handToken = this._getHandToken(handStrength);
        if (!heroHand || heroHand.length < 2 || !board || board.length < 3) return '';
        const a = (optimalAction || '').toLowerCase();
        const r1 = heroHand[0], r2 = heroHand.length >= 3 ? heroHand[1] : heroHand[1];

        // Specific blocker effects
        const effects = [];
        if (r1 === 'A' || r2 === 'A') {
            effects.push('Ace blocks: removes 3 AA combos, 4 AK combos, and reduces nut flush combos');
        }
        if (r1 === 'K' || r2 === 'K') {
            effects.push('King blocks: removes 3 KK combos, 4 AK combos');
        }
        const boardRanks = board.map(c => c[0]);
        if (boardRanks.includes(r1) || boardRanks.includes(r2)) {
            effects.push('Board interaction: your card matches a board card, reducing villain\'s set/trips combos');
        }

        if (effects.length === 0) return '';
        if (a.startsWith('r') && ['high_card', 'ace_high', 'missed_draw', 'underpair'].includes(handToken)) {
            return `Blocker advantage for bluffing: ${effects[0]}. This makes your bluff more effective — villain has fewer nutted hands.`;
        }
        if (a === 'call') {
            return `Blocker effect when calling: ${effects[0]}. This slightly improves your call since villain is less likely to have the nuts.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 206: POT COMMITMENT THRESHOLD
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 206: Calculate pot commitment threshold.
     * When you've invested X% of your stack, folding becomes -EV.
     */
    _getPotCommitmentNote(estimatedPot, stackDepth, optimalAction) {
        if (!estimatedPot || !stackDepth) return '';
        const invested = estimatedPot / 2; // Rough hero investment
        const investedPct = (invested / stackDepth * 100).toFixed(0);
        const a = (optimalAction || '').toLowerCase();

        if (parseInt(investedPct) >= 33 && a === 'f') {
            return `▲ Pot commitment: you've invested ~${investedPct}% of your stack. At this point, folding is expensive. The threshold for pot commitment is typically 30-33% — once past that, you often need a very strong reason to fold.`;
        }
        if (parseInt(investedPct) >= 50) {
            return `Pot committed (~${investedPct}% of stack invested): you're essentially committed to this pot. Getting all-in is almost always correct — the remaining stack is too small relative to the pot.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 207: CHECK-CALL VS CHECK-FOLD FRAMEWORK
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 207: Decision framework for check-calling vs check-folding.
     */
    _getCheckCallFoldNote(optimalAction, handStrength, street, nodeType) {
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'call' && a !== 'f') return '';
        const node = (nodeType || '').toLowerCase();
        if (!node.includes('facing') && !node.includes('bet')) return '';

        const handToken = this._getHandToken(handStrength);
        const isMedium = ['top_pair', 'top_pair_weak_kicker', 'middle_pair', 'second_pair', 'overpair'].includes(handToken);
        const isWeak = ['bottom_pair', 'underpair', 'ace_high', 'high_card', 'weak_pair', 'overcards', 'air'].includes(handToken);

        if (a === 'call' && isMedium) {
            return 'Check-call: your hand beats bluffs but loses to value. Calling keeps villain\'s bluffs in your range. Key question: does villain bluff enough to justify calling?';
        }
        if (a === 'call' && isWeak && street === 'river') {
            return 'Bluff-catching: calling with a weak hand to catch bluffs. This only works if villain bluffs frequently enough. Calculate: you need to be right > pot odds % of the time.';
        }
        if (a === 'f' && isMedium) {
            return 'Check-fold with a medium hand: GTO says fold here. Villain\'s betting range is too strong — your hand doesn\'t beat enough of their value bets, and they\'re not bluffing enough to justify calling.';
        }
        if (a === 'f' && isWeak) {
            return 'Check-fold: no showdown value and not enough equity to justify calling. Save your chips for a better spot.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 208: FACING DONK BET THEORY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 208: How to react when facing a donk bet (OOP leads into PFR).
     */
    _getFacingDonkNote(optimalAction, handStrength, street, nodeType) {
        const node = (nodeType || '').toLowerCase();
        if (!node.includes('donk') && !node.includes('facing_lead')) return '';
        const a = (optimalAction || '').toLowerCase();

        if (this._isAggressiveAction(a)) {
            return 'Facing donk bet — raise: donk bets are often polarized or merged-weak. Raising puts maximum pressure. Your raising range should include strong value hands and semi-bluffs with good equity.';
        }
        if (a === 'call') {
            return 'Facing donk bet — call: flatting keeps the pot controlled and lets you see how villain plays on later streets. Many donk bettors give up on the turn if called.';
        }
        if (a === 'f') {
            return 'Facing donk bet — fold: even though donk bets are often weak, your hand doesn\'t have enough equity to continue. Respect the action when your hand is at the bottom of your range.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 209: SLOW-PLAY CRITERIA CHECKLIST
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 209: When is slow-playing correct? Checklist approach.
     */
    _getSlowPlayChecklistNote(optimalAction, handStrength, street, texture) {
        const a = (optimalAction || '').toLowerCase();
        if (a !== 'x' && a !== 'check' && a !== 'call') return '';
        const isMonster = ['nuts', 'second_nuts', 'full_house', 'set', 'flush', 'straight'].includes(this._getHandToken(handStrength));
        if (!isMonster) return '';

        const isDry = texture && texture.dry && !(texture.flushy || texture.monotone);
        const criteria = [];
        if (isDry) criteria.push('✓ Dry board (villain has few draws)');
        else criteria.push('✕ Wet board (draws can outdraw you — prefer betting)');

        if (street === 'flop') criteria.push('✓ Early street (time to trap on later streets)');
        if (street === 'river') criteria.push('✕ River (no more streets to extract value)');

        if (criteria.some(c => c.startsWith('✕'))) {
            return `Slow-play analysis: ${criteria.join('. ')}. Consider whether slow-playing is optimal — wet boards and late streets often favor fast-playing strong hands.`;
        }
        return `Slow-play checklist: ${criteria.join('. ')}. Conditions favor a trap — villain can't outdraw you and has room to bluff on later streets.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 210: OVERBETTING CRITERIA CHECKLIST
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 210: When to overbet — structured checklist.
     */
    _getOverbetChecklistNote(optimalAction, handStrength, street, texture, stackDepth, estimatedPot) {
        const handToken = this._getHandToken(handStrength);
        const a = (optimalAction || '').toLowerCase();
        const sizePct = this._actionSizePct(a);
        if (sizePct == null || sizePct <= 100) return '';

        const criteria = [];
        const isNuts = ['nuts', 'second_nuts', 'full_house'].includes(handToken);
        const isAir = ['high_card', 'ace_high', 'missed_draw'].includes(handToken);

        if (isNuts) criteria.push('✓ Nutted hand — overbet for max value');
        if (isAir) criteria.push('✓ Air — overbet as a bluff to maximize fold equity');
        if (street === 'river') criteria.push('✓ River — maximum polarization');
        if (stackDepth && estimatedPot && stackDepth > estimatedPot * 2) criteria.push('✓ Deep enough stacks for overbet');
        if (texture && texture.dry) criteria.push('✓ Dry/static board — ranges are clearer');

        if (criteria.length >= 3) {
            return `Overbet criteria (${sizePct}% pot): ${criteria.join('. ')}. Multiple conditions met — overbet is well-justified.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 211: RIVER POLARIZATION INDEX
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 211: Quantify how polarized the river action is.
     */
    _getRiverPolarizationIndex(handActions, street) {
        if (street !== 'river' || !handActions) return '';
        const raiseFreq = Object.entries(handActions || {}).filter(([k]) => k.startsWith('r') || k === 'allin').reduce((s, [, v]) => s + v, 0);
        const foldFreq = handActions['f'] || 0;
        const callFreq = handActions['call'] || 0;
        const checkFreq = handActions['x'] || handActions['check'] || 0;

        const polarizationScore = (raiseFreq + foldFreq) / (raiseFreq + foldFreq + callFreq + checkFreq + 0.001);

        if (polarizationScore > 0.8) return 'Polarization index: VERY HIGH — this river spot is extremely polarized. Ranges consist of the nuts and bluffs with almost no medium hands.';
        if (polarizationScore > 0.6) return 'Polarization index: HIGH — river ranges are fairly polarized. Most hands are clearly value or clearly bluffs.';
        if (polarizationScore > 0.4) return 'Polarization index: MODERATE — some medium-strength hands exist in the range. Not fully polarized.';
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 212: STREET-BY-STREET EV DECOMPOSITION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 212: Break down EV contribution by street.
     */
    _getEVDecompositionNote(street, optimalAction, handStrength, estimatedPot) {
        const handToken = this._getHandToken(handStrength);
        if (!estimatedPot || street === 'preflop') return '';
        const a = (optimalAction || '').toLowerCase();
        const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'overpair', 'flush', 'straight', 'full_house'].includes(handToken);

        if (street === 'flop') {
            if (isStrong && this._isAggressiveAction(a)) return `EV source (flop): ~30% of your total hand EV comes from flop betting. Building the pot early with strong hands sets up larger bets on later streets.`;
            return '';
        }
        if (street === 'turn') {
            if (isStrong && this._isAggressiveAction(a)) return `EV source (turn): the turn is where the most EV is generated in a hand. Pot is larger, ranges are narrower, and strong hands extract significant value.`;
            return '';
        }
        if (street === 'river') {
            if (this._isAggressiveAction(a) && isStrong) return `EV source (river): river value bets capture the final portion of the hand's EV. Sizing correctly here — not too big to fold out everything, not too small to leave money behind.`;
            if (a === 'call') return `EV source (river): river calls with bluff-catchers generate EV by catching villain's bluffs. The value comes from correct bluff-catching frequency.`;
            return '';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 213: ACTION CLUSTERING FOR PATTERN RECOGNITION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 213: Cluster similar spots together for pattern recognition.
     */
    getActionClusters() {
        if (!this._handHistory || this._handHistory.length < 10) return null;
        const clusters = {};

        for (const hand of this._handHistory) {
            const key = `${hand.street}|${hand.nodeType || 'general'}|${hand.correctAction?.toLowerCase().startsWith('r') ? 'raise' : hand.correctAction}`;
            if (!clusters[key]) clusters[key] = { total: 0, correct: 0, hands: [] };
            clusters[key].total++;
            if (hand.isCorrect) clusters[key].correct++;
            if (clusters[key].hands.length < 3) clusters[key].hands.push(hand.id);
        }

        // Return clusters sorted by most common
        return Object.entries(clusters || {})
            .filter(([, d]) => d.total >= 3)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([key, data]) => ({
                pattern: key,
                total: data.total,
                accuracy: ((data.correct / data.total) * 100).toFixed(0) + '%',
                exampleHands: data.hands,
            }));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 214: SCENARIO TAGGING SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 214: Tag scenarios for later review.
     */
    tagScenario(handId, tag) {
        if (!this._scenarioTags) this._scenarioTags = {};
        if (!this._scenarioTags[handId]) this._scenarioTags[handId] = [];
        if (!this._scenarioTags[handId].includes(tag)) {
            this._scenarioTags[handId].push(tag);
        }
    }

    getTaggedScenarios(tag) {
        if (!this._scenarioTags) return [];
        if (tag) {
            return Object.entries(this._scenarioTags || {})
                .filter(([, tags]) => tags.includes(tag))
                .map(([id]) => parseInt(id));
        }
        return this._scenarioTags;
    }

    getAllTags() {
        if (!this._scenarioTags) return [];
        const allTags = new Set();
        for (const tags of Object.values(this._scenarioTags || {})) {
            tags.forEach(t => allTags.add(t));
        }
        return [...allTags];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 215: ADAPTIVE HINT SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 215: Progressive hints before revealing the answer.
     * Hint 1: vague, Hint 2: more specific, Hint 3: almost reveals.
     */
    _legacyGenerateHints(scenario, heroHand, board, handActions, correctAction) {
        const hints = [];
        const a = (correctAction || '').toLowerCase();
        const street = scenario.street || 'flop';

        // Hint 1: General direction
        if (a === 'f') hints.push('Think about whether your hand has enough equity to continue here.');
        else if (a === 'call') hints.push('Consider whether this hand has showdown value worth protecting.');
        else if (a.startsWith('r') || a === 'allin') hints.push('Think about what you want to accomplish — are you building the pot or applying pressure?');
        else hints.push('Consider the pot size and your position before deciding.');

        // Hint 2: More specific
        if (a === 'f') hints.push(`On the ${street}, look at pot odds. Does your hand have enough equity against villain's likely range?`);
        else if (a === 'call') hints.push(`Your hand has some value but maybe not enough to raise. Is there a reason to keep the pot small?`);
        else if (a.startsWith('r')) {
            const match = a.match(/r(\d+)/);
            hints.push(match ? `Consider the sizing — what does a ${parseInt(match[1]) > 75 ? 'large' : 'small-to-medium'} bet accomplish here?` : 'Think about why raising is better than calling.');
        }

        // Hint 3: Almost reveals
        const freq = handActions?.[correctAction] || 0;
        if (freq >= 0.9) hints.push(`This is a near-pure strategy spot — the solver almost always takes one specific action here. What's the clearest play?`);
        else hints.push(`This is a mixed spot — but the most frequent action (${(freq * 100).toFixed(0)}%) should guide your default.`);

        return hints;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 216: EXPLANATION QUALITY SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 216: Rate explanation quality for continuous improvement.
     */
    rateExplanation(handId, rating, feedback) {
        if (!this._explanationRatings) this._explanationRatings = [];
        this._explanationRatings.push({ handId, rating, feedback, timestamp: Date.now() });
    }

    getExplanationQualityStats() {
        if (!this._explanationRatings || this._explanationRatings.length < 3) return null;
        const ratings = this._explanationRatings.map(r => r.rating);
        const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
        return {
            averageRating: avg.toFixed(1),
            totalRatings: ratings.length,
            lowRated: this._explanationRatings.filter(r => r.rating <= 2).length,
            highRated: this._explanationRatings.filter(r => r.rating >= 4).length,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 217: MULTI-SIZING EXPLANATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 217: Explain why solver uses size X instead of size Y.
     */
    _getMultiSizingNote(optimalAction, handActions, handStrength, street, texture) {
        const handToken = this._getHandToken(handStrength);
        if (!handActions) return '';
        const raises = Object.entries(handActions || {}).filter(([k, f]) => k.startsWith('r') && f > 0.05);
        if (raises.length < 2) return '';

        const sizes = raises.map(([k, f]) => ({ size: parseInt(k.slice(1)) || 0, freq: f })).sort((a, b) => b.freq - a.freq);
        const primary = sizes[0];
        const secondary = sizes[1];

        if (!primary || !secondary || primary.size === 0) return '';

        if (primary.size > secondary.size) {
            return `Multi-sizing: solver prefers ${primary.size}% pot (${(primary.freq * 100).toFixed(0)}%) over ${secondary.size}% (${(secondary.freq * 100).toFixed(0)}%). The larger size is used with ${['nuts', 'second_nuts', 'flush', 'straight', 'set'].includes(handToken) ? 'strong value hands and big bluffs (polarized)' : 'a polarized range to maximize fold equity'}.`;
        }
        return `Multi-sizing: solver splits between ${primary.size}% (${(primary.freq * 100).toFixed(0)}%) and ${secondary.size}% (${(secondary.freq * 100).toFixed(0)}%). Different sizes target different parts of villain's range.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 218: FREQUENCY-WEIGHTED SCORING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 218: Partial credit scoring for mixed strategy spots.
     * If solver plays action at 40%, choosing it isn't a full mistake.
     */
    calculateFrequencyWeightedScore(chosenAction, handActions) {
        if (!handActions) return { score: 0, maxScore: 1, details: 'No data' };
        const chosenFreq = handActions[chosenAction] || 0;
        const maxFreq = Math.max(...Object.values(handActions || {}));
        const optimalAction = Object.entries(handActions || {}).sort((a, b) => b[1] - a[1])[0]?.[0];

        if (chosenAction === optimalAction) return { score: 1.0, maxScore: 1.0, details: 'Perfect — you chose the most frequent action.' };
        if (chosenFreq >= 0.4) return { score: 0.8, maxScore: 1.0, details: `Good — your action is played ${(chosenFreq * 100).toFixed(0)}% of the time. Very close to optimal.` };
        if (chosenFreq >= 0.2) return { score: 0.5, maxScore: 1.0, details: `Acceptable — your action is in the solver's strategy at ${(chosenFreq * 100).toFixed(0)}%, but not the primary action.` };
        if (chosenFreq > 0) return { score: 0.2, maxScore: 1.0, details: `Marginal — your action exists at ${(chosenFreq * 100).toFixed(0)}%, but it's rarely used. The primary action is much more frequent.` };
        return { score: 0, maxScore: 1.0, details: 'This action is never in the solver\'s strategy — 0% frequency.' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 219: CHALLENGE MODE DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 219: Challenge mode — timed questions with streak multipliers.
     */
    initChallengeMode(config) {
        this._challengeMode = {
            active: true,
            timeLimit: config?.timeLimit || 15000, // 15s default
            streakMultiplier: 1.0,
            currentStreak: 0,
            score: 0,
            questionsAnswered: 0,
            startTime: Date.now(),
        };
        return this._challengeMode;
    }

    recordChallengeAnswer(isCorrect, timeMs) {
        if (!this._challengeMode?.active) return null;
        this._challengeMode.questionsAnswered++;

        if (isCorrect) {
            this._challengeMode.currentStreak++;
            this._challengeMode.maxStreak = Math.max(this._challengeMode.maxStreak || 0, this._challengeMode.currentStreak);
            this._challengeMode.streakMultiplier = 1 + (this._challengeMode.currentStreak * 0.25);
            const timeBonus = timeMs < 5000 ? 1.5 : timeMs < 10000 ? 1.2 : 1.0;
            const points = Math.round(100 * this._challengeMode.streakMultiplier * timeBonus);
            this._challengeMode.score += points;
            return { points, streak: this._challengeMode.currentStreak, multiplier: this._challengeMode.streakMultiplier.toFixed(2), total: this._challengeMode.score };
        }

        this._challengeMode.currentStreak = 0;
        this._challengeMode.streakMultiplier = 1.0;
        return { points: 0, streak: 0, multiplier: '1.00', total: this._challengeMode.score };
    }

    getChallengeResults() {
        if (!this._challengeMode) return null;
        const elapsed = (Date.now() - this._challengeMode.startTime) / 1000;
        return {
            score: this._challengeMode.score,
            questionsAnswered: this._challengeMode.questionsAnswered,
            elapsed: elapsed.toFixed(0) + 's',
            avgPointsPerQuestion: this._challengeMode.questionsAnswered > 0 ? (this._challengeMode.score / this._challengeMode.questionsAnswered).toFixed(0) : 0,
            bestStreak: this._challengeMode.maxStreak || this._challengeMode.currentStreak || 0,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 220: ACHIEVEMENT/BADGE SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 220: Award badges for milestones and achievements.
     */
    checkAchievements() {
        if (!this._achievements) this._achievements = new Set();
        const newBadges = [];

        const total = this._sessionStats?.total || 0;
        const correct = this._sessionStats?.correct || 0;
        const accuracy = total > 0 ? correct / total : 0;

        // Question count badges
        if (total >= 10 && !this._achievements.has('first_10')) { this._achievements.add('first_10'); newBadges.push({ id: 'first_10', name: 'Getting Started', desc: 'Answered 10 questions'}); }
        if (total >= 50 && !this._achievements.has('fifty_club')) { this._achievements.add('fifty_club'); newBadges.push({ id: 'fifty_club', name: 'Fifty Club', desc: 'Answered 50 questions in one session'}); }
        if (total >= 100 && !this._achievements.has('century')) { this._achievements.add('century'); newBadges.push({ id: 'century', name: 'Century', desc: '100 questions in one session!'}); }

        // Accuracy badges
        if (total >= 20 && accuracy >= 0.8 && !this._achievements.has('sharpshooter')) { this._achievements.add('sharpshooter'); newBadges.push({ id: 'sharpshooter', name: 'Sharpshooter', desc: '80%+ accuracy over 20+ questions'}); }
        if (total >= 30 && accuracy >= 0.9 && !this._achievements.has('gto_master')) { this._achievements.add('gto_master'); newBadges.push({ id: 'gto_master', name: 'GTO Master', desc: '90%+ accuracy over 30+ questions'}); }

        // Streak badges
        const streak = this._sessionBests?.streak || 0;
        if (streak >= 10 && !this._achievements.has('hot_streak')) { this._achievements.add('hot_streak'); newBadges.push({ id: 'hot_streak', name: '▲ Hot Streak', desc: '10 correct answers in a row'}); }
        if (streak >= 20 && !this._achievements.has('unstoppable')) { this._achievements.add('unstoppable'); newBadges.push({ id: 'unstoppable', name: 'Unstoppable', desc: '20 correct answers in a row'}); }

        // Concept badges
        const concepts = this.getConceptMastery();
        const mastered = Object.values(concepts || {}).filter(c => c.mastery === 'mastered').length;
        if (mastered >= 3 && !this._achievements.has('well_rounded')) { this._achievements.add('well_rounded'); newBadges.push({ id: 'well_rounded', name: 'Well-Rounded', desc: 'Mastered 3+ GTO concepts'}); }
        if (mastered >= 8 && !this._achievements.has('gto_scholar')) { this._achievements.add('gto_scholar'); newBadges.push({ id: 'gto_scholar', name: 'GTO Scholar', desc: 'Mastered 8+ GTO concepts'}); }

        return { newBadges, totalBadges: this._achievements.size, allBadges: [...this._achievements] };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 221: CONCEPT DEPENDENCY TREE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 221: Define prerequisites for GTO concepts.
     * Learn fundamentals before advanced topics.
     */
    getConceptDependencyTree() {
        return {
            'opening_ranges': { prereqs: [], level: 1, desc: 'Which hands to open from each position' },
            'preflop_defense': { prereqs: ['opening_ranges'], level: 1, desc: 'How to defend against opens' },
            '3betting': { prereqs: ['opening_ranges', 'preflop_defense'], level: 2, desc: '3-bet ranges and sizing' },
            'cbetting': { prereqs: ['opening_ranges'], level: 2, desc: 'Continuation betting strategy' },
            'pot_odds': { prereqs: [], level: 1, desc: 'Basic pot odds calculation' },
            'implied_odds': { prereqs: ['pot_odds'], level: 2, desc: 'Implied odds for drawing hands' },
            'flop_betting': { prereqs: ['cbetting'], level: 2, desc: 'Flop betting strategy' },
            'turn_betting': { prereqs: ['flop_betting'], level: 3, desc: 'Turn barrel strategy' },
            'river_betting': { prereqs: ['turn_betting'], level: 3, desc: 'River value/bluff decisions' },
            'check_raising': { prereqs: ['flop_betting'], level: 3, desc: 'Check-raise strategy' },
            'bluff_catching': { prereqs: ['pot_odds', 'river_betting'], level: 3, desc: 'River bluff-catching' },
            'range_advantage': { prereqs: ['cbetting', 'opening_ranges'], level: 3, desc: 'Range vs nut advantage' },
            'board_texture': { prereqs: ['flop_betting'], level: 2, desc: 'Board texture analysis' },
            'multi_street_planning': { prereqs: ['turn_betting', 'river_betting'], level: 4, desc: 'Planning across all streets' },
            'exploitative_play': { prereqs: ['range_advantage', 'bluff_catching'], level: 4, desc: 'Deviating from GTO' },
            'mixed_strategies': { prereqs: ['multi_street_planning'], level: 4, desc: 'Understanding solver mixing' },
            'overbetting': { prereqs: ['river_betting', 'range_advantage'], level: 4, desc: 'Overbet strategy' },
            'icm': { prereqs: ['preflop_defense', '3betting'], level: 4, desc: 'Tournament ICM pressure' },
        };
    }

    getRecommendedConcept() {
        const tree = this.getConceptDependencyTree();
        const mastery = this.getConceptMastery();

        // Find concepts where all prereqs are mastered but this isn't
        for (const [concept, info] of Object.entries(tree || {})) {
            const isMastered = mastery[concept]?.mastery === 'mastered';
            if (isMastered) continue;
            const prereqsMet = info.prereqs.every(p => mastery[p]?.mastery === 'mastered' || !mastery[p]);
            if (prereqsMet) return { concept, ...info };
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 222: DRILL RECOMMENDATION ENGINE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 222: Recommend drills based on weaknesses and concept mastery.
     */
    getRecommendedDrills() {
        const weaknesses = this.getWeaknessTargets();
        const concepts = this.getConceptMastery();
        const recommendations = [];

        // Weakness-based drills
        if (weaknesses) {
            for (const w of weaknesses.slice(0, 3)) {
                const dim = w.dimension;
                if (dim.startsWith('street:')) {
                    const street = dim.split(':')[1];
                    recommendations.push({
                        name: `${street.charAt(0).toUpperCase() + street.slice(1)} Practice`,
                        desc: `Focus on ${street} decisions — your mistake rate is ${(w.mistakeRate * 100).toFixed(0)}%`,
                        filters: { streets: [street] },
                        priority: 'HIGH',
                    });
                }
                if (dim.startsWith('action:')) {
                    const action = dim.split(':')[1];
                    recommendations.push({
                        name: `${action.charAt(0).toUpperCase() + action.slice(1)} Situations`,
                        desc: `Practice spots where ${action} is correct — ${(w.mistakeRate * 100).toFixed(0)}% mistake rate`,
                        filters: { nodeTypes: [action] },
                        priority: 'HIGH',
                    });
                }
            }
        }

        // Concept-based drills
        for (const [concept, data] of Object.entries(concepts || {})) {
            if (data.mastery === 'needs_work') {
                recommendations.push({
                    name: `Master: ${concept.replace(/_/g, ' ')}`,
                    desc: `Only ${data.accuracy} accuracy — needs focused practice`,
                    filters: { nodeTypes: [concept] },
                    priority: 'MEDIUM',
                });
            }
        }

        // General recommended drill if few weaknesses
        if (recommendations.length === 0) {
            const nextConcept = this.getRecommendedConcept();
            if (nextConcept) {
                recommendations.push({
                    name: `New concept: ${nextConcept.desc}`,
                    desc: `Ready to learn ${nextConcept.concept.replace(/_/g, ' ')}`,
                    filters: { nodeTypes: [nextConcept.concept] },
                    priority: 'NORMAL',
                });
            }
        }

        return recommendations.slice(0, 5);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 223: SOLVER LINE COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 223: Show what solver does across the full hand.
     */
    _getSolverLineNote(street, optimalAction, nodeType, handStrength) {
        const a = (optimalAction || '').toLowerCase();
        const node = (nodeType || '').toLowerCase();
        const handToken = this._getHandToken(handStrength);
        const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'flush', 'straight', 'full_house'].includes(handToken);
        const isMedium = ['overpair', 'top_pair_top_kicker', 'top_pair'].includes(handToken);

        if (street === 'flop' && isStrong) {
            if (a.startsWith('r')) return 'Solver line: strong hands typically bet flop → bet turn → bet/check river (depending on runout). Fast-playing builds the pot for a big river bet.';
            if (a === 'x' || a === 'call') return 'Solver line: slow-playing the flop to trap. The typical continuation is bet turn → bet river, or check-raise if villain bets.';
        }
        if (street === 'flop' && isMedium) {
            return 'Solver line: medium hands often bet flop → check turn (for pot control) → check/call or thin value bet river.';
        }
        if (street === 'turn' && a.startsWith('r') && isStrong) {
            return 'Solver line: betting turn with a strong hand after flop action. Typical continuation is a value bet on the river sized to get stacks in.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 224: EXPECTED FREQUENCY TRACKER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 224: Track if user's overall action frequencies match GTO.
     * Over many hands, you should fold ~35%, call ~30%, raise ~35% (approx).
     */
    getExpectedFrequencyBalance() {
        if (!this._freqComparison) return null;

        const userTotals = { fold: 0, call: 0, raise: 0, check: 0, total: 0 };
        for (const data of Object.values(this._freqComparison || {})) {
            for (const [action, ct] of Object.entries(data.userActions || {})) {
                userTotals[action] = (userTotals[action] || 0) + ct;
                userTotals.total += ct;
            }
        }

        if (userTotals.total < 15) return null;

        const freqs = {
            fold: ((userTotals.fold / userTotals.total) * 100).toFixed(0),
            call: ((userTotals.call / userTotals.total) * 100).toFixed(0),
            raise: ((userTotals.raise / userTotals.total) * 100).toFixed(0),
            check: ((userTotals.check / userTotals.total) * 100).toFixed(0),
        };

        // Rough GTO benchmarks (varies heavily by spot)
        const assessment = [];
        if (parseInt(freqs.fold) > 45) assessment.push('Folding more than expected — you may be too tight');
        if (parseInt(freqs.fold) < 20) assessment.push('Folding less than expected — you may be too loose');
        if (parseInt(freqs.raise) > 50) assessment.push('Raising very aggressively — make sure you have value to back it up');
        if (parseInt(freqs.raise) < 20) assessment.push('Raising infrequently — you may be too passive');

        return { frequencies: freqs, total: userTotals.total, assessment: assessment.length > 0 ? assessment : ['Well-balanced overall action frequencies'] };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 225: SMART RECAP SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 225: Periodic concept recaps — summarize key learnings.
     */
    generateSmartRecap(questionNumber) {
        if (questionNumber % 25 !== 0 || questionNumber === 0) return null;

        const recap = { questionNumber, sections: [] };

        // Recent performance
        const recent = (this._recentResults || []).slice(-10);
        const recentAcc = recent.length > 0 ? (recent.filter(r => r).length / recent.length * 100).toFixed(0) : 'N/A';
        recap.sections.push({ title: 'Recent Performance', content: `Last 10 questions: ${recentAcc}% accuracy` });

        // Key concepts practiced
        const concepts = this.getConceptMastery();
        const recentConcepts = Object.entries(concepts || {}).filter(([, d]) => d.total >= 2).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
        if (recentConcepts.length > 0) {
            recap.sections.push({
                title: 'Concepts Practiced',
                content: recentConcepts.map(([c, d]) => `${c.replace(/_/g, ' ')}: ${d.accuracy} (${d.mastery})`).join(', '),
            });
        }

        // Weakest areas
        const weaknesses = this.getWeaknessTargets();
        if (weaknesses && weaknesses.length > 0) {
            recap.sections.push({
                title: 'Focus Areas',
                content: weaknesses.slice(0, 3).map(w => `${w.dimension}: ${(w.mistakeRate * 100).toFixed(0)}% mistake rate`).join(', '),
            });
        }

        // Improvement tips
        const deviations = this.getDeviationSummary();
        if (deviations && deviations.tendency !== 'balanced') {
            recap.sections.push({ title: 'Key Adjustment', content: `Your tendency: ${deviations.tendency}. Focus on correcting this in the next set of questions.` });
        }

        // Next recommended focus
        const nextConcept = this.getRecommendedConcept();
        if (nextConcept) {
            recap.sections.push({ title: 'Next Up', content: `Ready to work on: ${nextConcept.desc}` });
        }

        return recap;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 226: RANGE EQUITY CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 226: Approximate equity vs villain's range based on hand strength.
     * Uses pre-computed equity tables for common matchups.
     */
    _legacyEstimateEquityVsRange(handStrength, street, villainRangeType) {
        // Pre-computed approximate equities for common matchups
        const equities = {
            'nuts': { wide: 95, medium: 92, tight: 85 },
            'second_nuts': { wide: 90, medium: 87, tight: 80 },
            'full_house': { wide: 92, medium: 88, tight: 82 },
            'flush': { wide: 85, medium: 80, tight: 70 },
            'straight': { wide: 82, medium: 76, tight: 65 },
            'set': { wide: 80, medium: 75, tight: 65 },
            'trips': { wide: 75, medium: 70, tight: 58 },
            'two_pair': { wide: 72, medium: 65, tight: 55 },
            'overpair': { wide: 65, medium: 58, tight: 45 },
            'top_pair_top_kicker': { wide: 62, medium: 55, tight: 42 },
            'top_pair': { wide: 58, medium: 50, tight: 38 },
            'top_pair_weak_kicker': { wide: 52, medium: 45, tight: 33 },
            'middle_pair': { wide: 42, medium: 35, tight: 25 },
            'second_pair': { wide: 38, medium: 30, tight: 22 },
            'bottom_pair': { wide: 32, medium: 25, tight: 18 },
            'underpair': { wide: 28, medium: 22, tight: 15 },
            'ace_high': { wide: 25, medium: 18, tight: 12 },
            'high_card': { wide: 18, medium: 12, tight: 8 },
            'combo_draw': { wide: 48, medium: 45, tight: 42 },
            'flush_draw': { wide: 36, medium: 34, tight: 32 },
            'oesd': { wide: 32, medium: 30, tight: 28 },
            'gutshot': { wide: 18, medium: 16, tight: 14 },
            'missed_draw': { wide: 8, medium: 5, tight: 3 },
        };

        const rangeType = villainRangeType || 'medium';
        const eq = equities[handStrength];
        if (!eq) return null;

        const equity = eq[rangeType] || eq.medium;
        return {
            equity: equity + '%',
            vsRange: rangeType,
            assessment: equity >= 70 ? 'Strong favorite — bet for value' :
                equity >= 50 ? 'Slight favorite — thin value or pot control' :
                equity >= 30 ? 'Underdog — need pot odds or implied odds to continue' :
                'Significant underdog — fold unless getting excellent price',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 227: GTO DEVIATION COST TRACKER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 227: Track cumulative EV cost of all deviations from GTO.
     */
    recordDeviationCost(evLossBB) {
        if (!this._cumulativeDeviationCost) this._cumulativeDeviationCost = { total: 0, count: 0, history: [] };
        if (evLossBB > 0) {
            this._cumulativeDeviationCost.total += evLossBB;
            this._cumulativeDeviationCost.count++;
            this._cumulativeDeviationCost.history.push({ loss: evLossBB, question: this._getSessionQuestionCount() });
        }
    }

    getCumulativeDeviationCost() {
        if (!this._cumulativeDeviationCost) return null;
        const c = this._cumulativeDeviationCost;
        return {
            totalEVLost: c.total.toFixed(1) + 'bb',
            mistakes: c.count,
            avgLossPerMistake: c.count > 0 ? (c.total / c.count).toFixed(1) + 'bb' : '0bb',
            costPerHundred: this._sessionStats?.total > 0 ? ((c.total / this._sessionStats.total) * 100).toFixed(1) + 'bb/100' : 'N/A',
            message: c.total > 50 ? '▲ Significant EV leakage — focus on your biggest mistake categories.':
                c.total > 20 ? 'Moderate leaks — fixing your top 3 mistakes would save most of this.' :
                'Small leaks — you\'re playing close to GTO. Fine-tuning will get you even closer.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 228: HAND CATEGORY DEEP-DIVE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 228: Detailed explanation notes for specific hand categories.
     */
    _getHandCategoryDeepDive(handStrength, street, optimalAction) {
        if (street === 'preflop') return '';
        const a = (optimalAction || '').toLowerCase();

        const deepDives = {
            'set': `Sets are the strongest hidden hands in hold'em. With a set, you hold 3-of-a-kind with a pocket pair, making it nearly invisible to opponents. On most boards, fast-play your set to build the pot — slow-playing risks being outdrawn.`,
            'two_pair': `Two pair is strong but vulnerable. On wet boards, straights and flushes can overtake you. The key: bet for value on the flop/turn to deny equity, but be cautious if the board gets scarier on later streets.`,
            'overpair': `Overpairs (pair higher than all board cards) are strong on dry boards but can be tricky on wet boards. The danger: opponents may have flopped sets, two pair, or draws. Play your overpair aggressively on favorable boards.`,
            'flush_draw': `Flush draws have ~35% equity on the flop (2 streets) and ~19% on the turn (1 street). Rule of 4/2: multiply outs by 4 on flop, by 2 on turn. With 9 outs, that's 36% on flop, 18% on turn. Always consider whether you're drawing to the nut flush.`,
            'combo_draw': `Combo draws (flush draw + straight draw) are monsters with 12-15 outs. That's 48-60% equity on the flop — you're often a favorite! Play these aggressively: raise and re-raise to build the pot or win it outright.`,
            'top_pair': `Top pair is the backbone of postflop play. Its value depends heavily on your kicker. TPTK (top pair top kicker) is much stronger than TPWK (weak kicker). On wet boards, bet for protection. On dry boards, pot control may be optimal.`,
        };

        return deepDives[this._getHandToken(handStrength)] || '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 229: BOARD RUNOUT SIMULATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 229: Simulate possible runouts and their strategic implications.
     */
    simulateRunouts(board, handStrength, street) {
        if (!board || board.length < 3 || street === 'river') return null;
        const boardSuits = board.map(c => c[1]);
        const boardRanks = board.map(c => '23456789TJQKA'.indexOf(c[0]));
        const suitCounts = {};
        boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });

        const scenarios = [];

        // Flush-completing card
        const flushSuit = Object.entries(suitCounts || {}).find(([, ct]) => ct >= 2);
        if (flushSuit && flushSuit[1] < 3) {
            scenarios.push({ type: 'flush_completing', desc: `A ${flushSuit[0]} card completes the flush draw`, impact: 'bad_for_non_flush', strategy: 'Check or slow down without a flush — villain\'s draw got there.' });
        }

        // Overcard (Ace or King)
        const maxRank = Math.max(...boardRanks);
        if (maxRank < 12) { // No Ace on board
            scenarios.push({ type: 'ace_comes', desc: 'An Ace hits the turn/river', impact: 'changes_dynamics', strategy: 'Ace is the most impactful overcard — it helps Ax hands in both ranges but especially favors the preflop raiser.' });
        }
        if (maxRank < 11) { // No King on board
            scenarios.push({ type: 'king_comes', desc: 'A King hits', impact: 'overcard', strategy: 'King improves KQ/KJ type hands. Reassess — your top pair may now be second pair.' });
        }

        // Board pairing
        scenarios.push({ type: 'board_pairs', desc: 'The board pairs', impact: 'favors_pfr', strategy: 'Paired boards reduce straight/flush equity and favor the preflop raiser who has more big-card hands.' });

        // Brick
        scenarios.push({ type: 'brick', desc: 'A low unconnected card (2-5)', impact: 'neutral', strategy: 'Bricks maintain the status quo. Continue with your flop plan.' });

        // Straight completing
        const sorted = [...new Set(boardRanks)].sort((a, b) => a - b);
        if (sorted.length >= 2 && sorted[sorted.length - 1] - sorted[0] <= 4) {
            scenarios.push({ type: 'straight_completing', desc: 'A card that completes a straight', impact: 'bad_for_one_pair', strategy: 'Connected cards getting there is dangerous for one-pair hands. Consider checking or folding to aggression.' });
        }

        return scenarios;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 230: 3-BET DEFENSE MATRIX BY POSITION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 230: Pre-computed 3-bet defense frequencies by position pair.
     */
    get3BetDefenseMatrix() {
        return {
            'UTG_vs_BB': { fold: 55, call: 20, fourBet: 25, desc: 'UTG opens tight, BB 3-bets polarized. UTG folds a lot but 4-bets AA/KK/AKs.' },
            'UTG_vs_BTN': { fold: 50, call: 25, fourBet: 25, desc: 'BTN 3-bets wider. UTG still defends tight but has more calling hands IP.' },
            'MP_vs_BB': { fold: 50, call: 25, fourBet: 25, desc: 'MP range is wider. Defend with medium pairs and suited broadways.' },
            'CO_vs_BB': { fold: 40, call: 30, fourBet: 30, desc: 'CO opens wide, more incentive to defend. Mix 4-bets with value and bluffs.' },
            'CO_vs_BTN': { fold: 35, call: 35, fourBet: 30, desc: 'CO vs BTN is a key battleground. Defend wider with position.' },
            'BTN_vs_BB': { fold: 30, call: 40, fourBet: 30, desc: 'BTN opens widest, defends wide vs BB 3-bet. IP advantage lets you flat more.' },
            'BTN_vs_SB': { fold: 25, call: 40, fourBet: 35, desc: 'SB 3-bets tighter. BTN can defend very wide with IP postflop.' },
            'SB_vs_BB': { fold: 40, call: 15, fourBet: 45, desc: 'SB vs BB: SB opens wide, often 4-bets or folds vs 3-bet. Flatting OOP is bad.' },
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 231: POSTFLOP AGGRESSION COACHING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 231: Optimal aggression level by spot type.
     */
    _getAggressionCoachingNote(optimalAction, handStrength, street, nodeType, texture) {
        const handToken = this._getHandToken(handStrength);
        const a = (optimalAction || '').toLowerCase();
        const node = (nodeType || '').toLowerCase();

        // Only show coaching for betting/raising decisions
        if (!this._isAggressiveAction(a)) return '';

        const isIP = node.includes('ip') || node.includes('btn') || node.includes('co');
        const isWet = texture && (texture.wet || texture.flushy || texture.monotone);
        const isStrong = ['nuts', 'second_nuts', 'set', 'two_pair', 'flush', 'straight', 'full_house'].includes(handToken);

        if (isIP && isWet && isStrong) {
            return 'Aggression coaching: IP on a wet board with a strong hand — maximum aggression. Bet/raise for value AND protection. Villain has draws that you need to charge.';
        }
        if (!isIP && isStrong) {
            return 'Aggression coaching: OOP with a strong hand — lead out or check-raise. Being OOP means you need to build the pot before villain can take a free card.';
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 232: BET/RAISE SIZING OPTIMIZER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 232: Recommend optimal sizing based on hand strength and context.
     */
    recommendBetSizing(handStrength, street, texture, estimatedPot, stackDepth) {
        const handToken = this._getHandToken(handStrength);
        if (!estimatedPot) return null;
        const isWet = texture && (texture.wet || texture.flushy || texture.monotone);
        const isNuts = ['nuts', 'second_nuts', 'full_house'].includes(handToken);
        const isStrong = ['flush', 'straight', 'set', 'two_pair', 'overpair'].includes(handToken);
        const isMedium = ['top_pair_top_kicker', 'top_pair'].includes(handToken);
        const isBluff = ['high_card', 'ace_high', 'missed_draw'].includes(handToken);

        let sizePct, reasoning;

        if (street === 'flop') {
            if (isWet && isStrong) { sizePct = 66; reasoning = 'Wet board + strong hand: size up to deny draw equity.'; }
            else if (!isWet && isStrong) { sizePct = 33; reasoning = 'Dry board + strong hand: small bet to keep villain in. No draws to charge.'; }
            else if (isMedium) { sizePct = 33; reasoning = 'Medium hand: small sizing for thin value and pot control.'; }
            else if (isBluff) { sizePct = 33; reasoning = 'Bluff: use the same small sizing as your value bets for balance.'; }
            else { sizePct = 50; reasoning = 'Standard sizing — balanced between value and protection.'; }
        } else if (street === 'turn') {
            if (isNuts) { sizePct = 75; reasoning = 'Nutted hand on turn: size up to build the pot for a big river bet.'; }
            else if (isStrong) { sizePct = 66; reasoning = 'Strong hand: maintain pressure and charge draws for one more card.'; }
            else { sizePct = 50; reasoning = 'Standard turn sizing — pot is growing, keep it manageable.'; }
        } else {
            if (isNuts) { sizePct = stackDepth && estimatedPot && stackDepth > estimatedPot * 1.5 ? 125 : 80; reasoning = isNuts ? 'Max value: size to get called by the widest range of worse hands.' : 'Value bet'; }
            else if (isBluff) { sizePct = 75; reasoning = 'Bluff: size to make villain fold their bluff-catchers. ~75% pot gives you good fold equity.'; }
            else { sizePct = 50; reasoning = 'Thin value: smaller size to get called by worse hands.'; }
        }

        return { recommendedSize: sizePct + '% pot', bbAmount: ((sizePct / 100) * estimatedPot).toFixed(1) + 'bb', reasoning };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 233: RANGE ADVANTAGE QUANTIFIER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 233: Numerical range advantage score.
     */
    _getRangeAdvantageScore(heroPosition, villainPosition, texture, nodeType, street) {
        if (street === 'preflop' || !texture) return '';
        let score = 50; // Neutral baseline

        const isPFR = nodeType === 'hero_bets_or_checks';
        // texture.highCard is a boolean — derive the actual high rank from lowestRank + spread
        const highCard = (typeof texture.lowestRank === 'number' && typeof texture.spread === 'number')
            ? texture.lowestRank + texture.spread
            : (texture.highCard ? 11 : 0);
        const isMonotone = texture.monotone;
        const isPaired = texture.paired;

        // PFR advantages
        if (isPFR) {
            if (highCard >= 11) score += 15; // A/K high boards favor PFR
            if (highCard >= 9 && highCard <= 10) score += 5; // T/J high slight PFR edge
            if (isPaired) score += 10; // Paired boards favor PFR
        } else {
            if (highCard <= 7) score += 15; // Low boards favor caller
            if (isMonotone) score += 10; // Monotone boards favor caller
        }

        // Position adjustment
        const isIP = this._isInPosition(heroPosition, villainPosition);
        if (isIP) score += 5;

        score = Math.min(85, Math.max(15, score));

        if (score >= 65) return `Range advantage: ${score}/100 — your range significantly outperforms villain's on this board. Bet at higher frequency.`;
        if (score >= 55) return `Range advantage: ${score}/100 — slight edge. Standard betting frequency applies.`;
        if (score <= 35) return `Range advantage: ${score}/100 — villain's range hits this board better. Check more frequently and be cautious.`;
        if (score <= 45) return `Range advantage: ${score}/100 — slight disadvantage. Mix checks and small bets.`;
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 234: VILLAIN RANGE NARROWING TRACKER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 234: Track how villain's range narrows across the hand.
     */
    _getVillainRangeNarrowNote(street, nodeType, optimalAction) {
        if (street === 'preflop') return '';
        const node = (nodeType || '').toLowerCase();

        const rangeNotes = {
            'flop:cbet': 'Villain c-bet: range is still wide (~60-80% of preflop range). They c-bet with value, draws, and air.',
            'flop:check': 'Villain checked flop: range is CAPPED — no strong overpairs or top pair. Weighted toward medium hands and gives up.',
            'flop:raise': 'Villain raised flop: range is POLARIZED — strong value (sets, two pair) or semi-bluffs (draws). Medium hands just call.',
            'turn:bet': 'Villain bet turn: range narrowed significantly. They continued with real equity — value hands and committed draws. Bluffs have mostly given up.',
            'turn:check': 'Villain checked turn after flop bet: major weakness signal. Range is capped — strong hands almost always continue. Exploit with bets.',
            'river:bet': 'Villain bet all three streets: MAXIMALLY POLARIZED — either the nuts or a bluff. Very few medium hands take this line.',
            'river:check': 'Villain checked river: giving up on bluffs or has medium showdown value. Consider a thin value bet.',
        };

        for (const [key, note] of Object.entries(rangeNotes || {})) {
            const [s, action] = key.split(':');
            if (s === street && node.includes(action)) return note;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 235: HAND EQUITY VS RANGE ESTIMATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 235: Quick equity estimate for hero's hand vs estimated villain range.
     */
    _getEquityEstimateNote(handStrength, street, nodeType, optimalAction) {
        const eq = this.estimateEquityVsRange(handStrength, street, nodeType || '');
        if (!eq) return '';
        const equity = parseInt(eq.equity);
        const a = (optimalAction || '').toLowerCase();

        if (a.startsWith('r') && equity < 40) {
            return `Equity estimate: ~${equity}% vs villain's range. You're an underdog, but betting works as a bluff — fold equity + hand equity combined make this profitable.`;
        }
        if (a === 'call' && equity >= 30 && equity <= 50) {
            return `Equity estimate: ~${equity}% vs villain's range. Borderline spot — pot odds determine if calling is correct. Getting ~${equity}% is close to breakeven.`;
        }
        if (a.startsWith('r') && equity >= 60) {
            return `Equity estimate: ~${equity}% vs villain's range. Solid favorite — bet for value to extract chips from weaker holdings.`;
        }
        return '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 236: DRAW EQUITY CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 236: Calculate draw equity with detailed outs counting.
     */
    calculateDrawEquity(handStrength, street) {
        const drawData = {
            'combo_draw': { outs: 15, name: 'Combo draw (flush + straight)', note: 'Monster draw — often a favorite vs one pair.' },
            'flush_draw': { outs: 9, name: 'Flush draw', note: '9 clean outs to the flush.' },
            'oesd': { outs: 8, name: 'Open-ended straight draw', note: '8 outs to the straight.' },
            'gutshot': { outs: 4, name: 'Gutshot straight draw', note: '4 outs — need good implied odds.' },
            'backdoor_flush_draw': { outs: 1.5, name: 'Backdoor flush draw', note: '~1.5 effective outs (need runner-runner).' },
        };

        const data = drawData[handStrength];
        if (!data) return null;

        const streetsRemaining = street === 'flop' ? 2 : 1;
        const equity = streetsRemaining === 2 ? Math.min(data.outs * 4, 90) : Math.min(data.outs * 2, 45);

        return {
            outs: data.outs,
            name: data.name,
            equity: equity + '%',
            method: streetsRemaining === 2 ? `Rule of 4: ${data.outs} × 4 = ${data.outs * 4}%` : `Rule of 2: ${data.outs} × 2 = ${data.outs * 2}%`,
            note: data.note,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 237: FOLD EQUITY CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 237: Calculate fold equity and breakeven bluffing frequency.
     */
    calculateFoldEquity(betSize, potSize) {
        if (!betSize || !potSize) return null;
        const risk = betSize;
        const reward = potSize;
        const breakeven = (risk / (risk + reward) * 100).toFixed(1);

        return {
            breakeven: breakeven + '%',
            risk: betSize.toFixed(1) + 'bb',
            reward: potSize.toFixed(1) + 'bb',
            message: `Your bluff needs to work ${breakeven}% of the time to break even. If villain folds more than ${breakeven}%, bluffing is profitable regardless of your hand.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 238: EXPECTED VALUE CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 238: Calculate EV for a specific action.
     */
    calculateActionEV(action, equity, potSize, betSize, foldEquity) {
        if (equity == null || !potSize) return null;

        const eq = equity / 100;
        if (action === 'call') {
            const ev = eq * (potSize + betSize) - (1 - eq) * betSize;
            return { ev: ev.toFixed(2) + 'bb', profitable: ev > 0, breakdown: `EV = ${(eq * 100).toFixed(0)}% × ${(potSize + betSize).toFixed(0)}bb - ${((1 - eq) * 100).toFixed(0)}% × ${betSize.toFixed(0)}bb = ${ev.toFixed(2)}bb` };
        }
        if (action === 'bet' || action === 'raise') {
            const fe = (foldEquity || 30) / 100;
            const ev = fe * potSize + (1 - fe) * (eq * (potSize + 2 * betSize) - betSize);
            return { ev: ev.toFixed(2) + 'bb', profitable: ev > 0, breakdown: `EV = ${(fe * 100).toFixed(0)}% fold × ${potSize.toFixed(0)}bb + ${((1 - fe) * 100).toFixed(0)}% called × equity calc = ${ev.toFixed(2)}bb` };
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 239: BLUFF-TO-VALUE RATIO CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 239: Calculate optimal bluff-to-value ratio for a given bet size.
     * GTO: bluffs/(value + bluffs) = betSize/(pot + betSize).
     */
    calculateOptimalBluffRatio(betSizePctPot) {
        if (!betSizePctPot) return null;
        // Bluff fraction = b / (pot + 2b): the caller risks b to win pot + b
        const ratio = betSizePctPot / (100 + 2 * betSizePctPot);
        const bluffPct = (ratio * 100).toFixed(0);
        const valuePct = (100 - ratio * 100).toFixed(0);

        return {
            bluffFrequency: bluffPct + '%',
            valueFrequency: valuePct + '%',
            ratio: `${valuePct}:${bluffPct} (value:bluff)`,
            betSize: betSizePctPot + '% pot',
            message: `At ${betSizePctPot}% pot, the GTO bluff frequency is ${bluffPct}%. For every ${valuePct} value combos, include ${bluffPct} bluff combos. Villain should then be indifferent to calling.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 240: SESSION LEADERBOARD DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 240: Generate leaderboard data for session tracking.
     */
    getLeaderboardEntry() {
        if (!this._sessionStats || this._sessionStats.total < 10) return null;
        const accuracy = (this._sessionStats.correct / this._sessionStats.total * 100).toFixed(1);
        const streak = this._sessionBests?.streak || 0;
        const challengeScore = this._challengeMode?.score || 0;

        return {
            accuracy: accuracy + '%',
            totalQuestions: this._sessionStats.total,
            bestStreak: streak,
            challengeScore,
            eloEstimate: Math.round(1200 + (parseFloat(accuracy) - 50) * 20 + streak * 5),
            timestamp: Date.now(),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 241: TRAINING CALENDAR/STREAK DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 241: Track daily training for calendar view.
     */
    recordDailyTraining() {
        if (!this._trainingCalendar) this._trainingCalendar = {};
        const today = new Date().toISOString().split('T')[0];
        if (!this._trainingCalendar[today]) {
            this._trainingCalendar[today] = { questions: 0, accuracy: 0, sessions: 0 };
        }
        this._trainingCalendar[today].questions = this._sessionStats?.total || 0;
        this._trainingCalendar[today].accuracy = this._sessionStats?.total > 0
            ? ((this._sessionStats.correct / this._sessionStats.total) * 100).toFixed(1)
            : '0';
        this._trainingCalendar[today].sessions++;
    }

    getTrainingCalendar() {
        return this._trainingCalendar || {};
    }

    getTrainingStreak() {
        const calendar = this._trainingCalendar || {};
        const dates = Object.keys(calendar || {}).sort().reverse();
        if (dates.length === 0) return 0;

        let streak = 0;
        const today = new Date().toISOString().split('T')[0];
        let checkDate = new Date(today);

        while (true) {
            const dateStr = checkDate.toISOString().split('T')[0];
            if (calendar[dateStr]) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        return streak;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 242: CONCEPT FLASHCARD GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 242: Generate flashcards for GTO concepts.
     */
    generateFlashcards(category) {
        const allCards = {
            pot_odds: [
                { front: 'What are pot odds?', back: 'The ratio of the current pot to the cost of calling. If pot is $10 and you must call $5, pot odds are 10:5 or 2:1 (33%).' },
                { front: 'How to calculate pot odds %?', back: 'Call amount / (pot + call amount). For a $5 call into a $15 pot: 5/20 = 25%.' },
                { front: 'When should you call with a draw?', back: 'When your draw equity exceeds the pot odds. If you need 25% and have 32% equity, call.' },
                { front: 'What are implied odds?', back: 'The additional money you expect to win on future streets if you hit your draw. They justify calling even when pot odds are slightly against you.' },
                { front: 'Pot odds vs a half-pot bet?', back: 'You need 25% equity to call a half-pot bet. The pot is 1.5x the bet, so you risk 1 to win 2.5 total (1/3.5 = ~28.6%, but accounting for the dead pot: 1/(1+1.5+1) = 25%).' },
                { front: 'Pot odds vs a pot-sized bet?', back: 'You need 33% equity. Risk 1 to win 3 total (pot + villain bet + your call). So 1/3 = 33%.' },
                { front: 'What is break-even %?', back: 'The minimum fold frequency needed for a bluff to be profitable: Bet size / (Bet + Pot). A pot-sized bluff needs to work 50% of the time.' },
                { front: 'What are reverse implied odds?', back: 'When hitting your draw still loses to a better hand. Example: calling with a small flush draw when a bigger flush draw is possible.' },
                { front: 'Pot odds vs 2x pot overbet?', back: 'You need 40% equity to call a 2x pot bet. Risk 2 to win 5 total (1 pot + 2 bet + 2 call). 2/5 = 40%.' },
                { front: 'How do pot odds change multiway?', back: 'Pot odds improve (need less equity) because there is more dead money, but your hand needs to beat multiple opponents so actual equity decreases.' },
            ],
            position: [
                { front: 'Why is position important?', back: 'Acting last gives you information about opponents\' actions before you decide. IP players win more money long-term.' },
                { front: 'Which position is most profitable?', back: 'The Button (BTN) — always acts last postflop, averages +10bb/100 in 6-max.' },
                { front: 'Why is SB the worst position?', back: 'SB is always OOP postflop (except vs BB) and must invest 0.5bb before seeing cards. Averages -7bb/100.' },
                { front: '6-max positions in order?', back: 'UTG (Under the Gun), HJ (Hijack/MP), CO (Cutoff), BTN (Button), SB (Small Blind), BB (Big Blind). BTN is most profitable, SB is least.' },
                { front: 'What is a steal attempt?', back: 'Opening (raising first) from late position (CO, BTN, SB) to win the blinds. GTO open ranges from BTN are ~45-50% of hands.' },
                { front: 'Why open tighter from UTG?', back: 'UTG has 5 players left to act who could wake up with a strong hand. You also play the entire hand OOP except against the blinds.' },
                { front: 'What is positional advantage postflop?', back: 'Being IP lets you: control pot size, realize equity more efficiently, bluff more effectively, and value bet thinner because you see opponent actions first.' },
                { front: 'CO vs BTN opening range?', back: 'CO opens ~27-30% of hands, BTN opens ~45-50%. BTN gets to open wider because only 2 players remain (SB/BB) and they always have position.' },
                { front: 'What is the blinds\' disadvantage?', back: 'Blinds post forced bets, act first postflop (OOP), and defend wide ranges. BB loses -20 to -30bb/100, SB loses -40 to -70bb/100 at equilibrium.' },
                { front: 'What is a squeeze play?', back: 'A 3-bet from the blinds (or late position) after an open and one or more calls. Squeezes are powerful because callers have capped ranges.' },
            ],
            betting: [
                { front: 'What is a polarized range?', back: 'A range consisting of very strong hands (value) and very weak hands (bluffs), with no medium-strength hands.' },
                { front: 'What is a merged/linear range?', back: 'A range that includes all hand strengths — strong, medium, and weak. Used with small bet sizes.' },
                { front: 'What is MDF (Minimum Defense Frequency)?', back: 'MDF = 1 - bet/(pot+bet). Tells you how often to defend vs a bet to prevent villain from profiting with any two cards.' },
                { front: 'When to use small bet sizes?', back: 'On dry/static boards where you have a range advantage. Small bets let you bet with a wide, merged range (value + medium hands).' },
                { front: 'When to use large bet sizes?', back: 'On dynamic boards or when your range is polarized (nuts or air). Large bets maximize value from strong hands and maximize fold equity with bluffs.' },
                { front: 'What is a blocker?', back: 'A card in your hand that reduces the number of combos an opponent can have. Example: having A♠ blocks opponent from having AA and some AK combos.' },
                { front: 'What is an overbet?', back: 'Betting more than the pot size. Used with extremely polarized ranges on later streets. GTO uses overbets of 125-200% pot on rivers with nutted hands.' },
                { front: 'Value-to-bluff ratio for pot bet?', back: 'For a pot-sized bet, optimal bluff frequency is 33% bluffs, 67% value (a 2:1 value-to-bluff ratio). This makes opponent indifferent to calling.' },
                { front: 'What is a donk bet?', back: 'Betting into the previous street\'s aggressor (out of position, before they can continuation bet). GTO uses donk bets ~5-10% on specific board textures.' },
                { front: 'Why does solver use multiple bet sizes?', back: 'Different hand strengths prefer different bet sizes. Thin value hands prefer smaller bets, nutted hands prefer larger bets, and each size creates a different bluff-to-value ratio.' },
            ],
            draws: [
                { front: 'Rule of 4 and 2?', back: 'Multiply outs by 4 on the flop (2 cards to come) or by 2 on the turn (1 card to come) to estimate equity %.' },
                { front: 'How many outs does a flush draw have?', back: '9 outs — 13 cards of the suit minus 4 you can see (2 in hand, 2 on board).' },
                { front: 'What is a combo draw?', back: 'A draw with both flush and straight potential — typically 12-15 outs, often a favorite vs one pair.' },
                { front: 'Open-ended straight draw outs?', back: '8 outs — 4 cards on each end complete the straight. Example: 89 on a 67x board has 8 outs (four 5s + four Ts).' },
                { front: 'Gutshot straight draw outs?', back: '4 outs — only one rank completes the straight. Example: 89 on a 6Tx board needs a 7 (four 7s in deck).' },
                { front: 'When are draws playable OOP?', back: 'When you have good implied odds, the draw is to the nuts (not 2nd best), and you can semi-bluff effectively by representing a made hand.' },
                { front: 'What is a semi-bluff?', back: 'Betting or raising with a draw that can improve on later streets. It wins if opponent folds now OR if the draw hits. Combines fold equity + draw equity.' },
                { front: 'Flush draw equity vs top pair?', back: 'A flush draw has ~35% equity vs top pair on the flop (9 outs x 4 = 36% minus slight overcount). On the turn it drops to ~18% (9 outs x 2).' },
                { front: 'What is a backdoor draw?', back: 'A draw needing two cards to complete (e.g., two more suited cards for a flush). Adds ~4% equity. Backdoor flush + backdoor straight adds ~8%.' },
                { front: 'How to play a made hand vs a draw?', back: 'Bet large enough to deny correct odds. If opponent has 35% equity (flush draw), bet at least 75% pot to make calling -EV.' },
            ],
            preflop: [
                { front: 'What is a 3-bet?', back: 'The third raise preflop. First raise = open, second raise = 3-bet. In position, 3-bet to ~3x the open. Out of position, 3-bet to ~3.5-4x.' },
                { front: 'What hands should you 3-bet for value?', back: 'QQ+, AKs, AKo are almost always 3-bet for value. KK and AA never flat. JJ and TT are sometimes 3-bet, sometimes called depending on position.' },
                { front: 'What is a 3-bet bluff?', back: 'A 3-bet with a hand too weak to call but with some playability/blockers. Good candidates: A5s, A4s (blocks AA/AK), suited connectors, small pairs.' },
                { front: 'Standard open raise size?', back: '2.0-2.5x BB from most positions. Some players use 3x from early position. Online tends to be 2.0-2.3x, live is often 3x+.' },
                { front: 'What is a cold call?', back: 'Calling a raise (or 3-bet) without having put any money in the pot yet. Avoid cold-calling 3-bets without strong hands or being IP.' },
                { front: 'Why do we raise preflop?', back: 'Raising isolates opponents (play vs fewer players), builds the pot with strong hands, denies equity to weak hands, and establishes initiative.' },
                { front: 'When to limp preflop?', back: 'Almost never in a competitive game. Exception: SB completing vs BB in certain structures. Open-limping is a significant leak because it forfeits initiative.' },
                { front: 'How to handle a 4-bet?', back: 'Fold most of your 3-bet bluffs. 5-bet jam with QQ+, AKs. Call some 4-bets IP with hands like JJ, TT, AQs, AKo depending on stack depth.' },
                { front: 'What is SPR (Stack-to-Pot Ratio)?', back: 'Effective stack / pot after preflop. SPR < 4 favors big hands (top pair+). SPR > 10 favors speculative hands (suited connectors, small pairs).' },
                { front: 'Preflop hand categories?', back: 'Premium: AA-QQ, AKs. Strong: JJ-TT, AKo, AQs. Playable: 99-22, suited connectors, suited aces, broadways. Marginal: offsuit connectors, weak aces.' },
            ],
            board_texture: [
                { front: 'What is a dry board?', back: 'A board with no flush/straight draws and disconnected ranks. Example: K72 rainbow. Ranges are less likely to connect, favoring c-bets with wide ranges.' },
                { front: 'What is a wet/dynamic board?', back: 'A board with many draws possible (flush draws, straight draws, or both). Example: Jh Th 8c. Ranges connect heavily, requiring larger bets for protection.' },
                { front: 'What is a monotone board?', back: 'All three flop cards are the same suit (e.g., Ah 8h 3h). Strongly favors the caller because they have more suited hands that connected.' },
                { front: 'Range advantage vs nut advantage?', back: 'Range advantage: your overall range has more equity. Nut advantage: you have more of the strongest possible hands. You can have one without the other.' },
                { front: 'Who has range advantage on A-high flops?', back: 'The preflop raiser has more Ax hands in range. They should c-bet frequently with small sizes since their whole range benefits.' },
                { front: 'Who has range advantage on low boards?', back: 'On boards like 6-4-2, the caller often has more two-pair/set combos. The raiser should check more frequently and use polar bet sizes when betting.' },
                { front: 'How does a paired board affect strategy?', back: 'Paired boards reduce the number of possible made hands. The PFR usually has range advantage and can c-bet with high frequency at small sizes.' },
                { front: 'What is a connected board?', back: 'A board where cards are close in rank (e.g., 9-8-6). Creates many straight draws. Both players connect, so bet sizing tends to be larger (protection).' },
                { front: 'How do turns change board texture?', back: 'Turns that complete draws (flush cards, straight cards) shift advantage. An offsuit low card on a dry flop changes little. A third suited card changes everything.' },
                { front: 'What is board coverage?', back: 'Having hands that interact with every type of board texture. GTO ranges are constructed so you can credibly represent strength on any flop.' },
            ],
            river_play: [
                { front: 'Why is river play the most important street?', back: 'The pot is largest on the river, so mistakes are most expensive. EV loss from a single bad river call can exceed all other street mistakes combined.' },
                { front: 'What is a bluff-catcher?', back: 'A hand that beats all bluffs but loses to all value bets. On the river, you must decide if opponent is value-betting or bluffing.' },
                { front: 'How often should you bluff-catch?', back: 'Based on MDF. Vs a pot-sized bet, defend ~50% of your range. Vs half-pot, defend ~67%. This prevents opponent from profiting with pure bluffs.' },
                { front: 'What is a thin value bet?', back: 'Betting a hand that is only slightly ahead of opponent\'s calling range. If you expect to be called by worse >50% of the time, it is a value bet.' },
                { front: 'River check-raise frequency?', back: 'GTO check-raises rivers rarely (~5-10%) but with extreme polarity — the nuts or bluffs with zero showdown value. Never check-raise medium hands.' },
                { front: 'When to give up on a river bluff?', back: 'When your bluff candidate has showdown value (can win at showdown), when opponent\'s range is very strong (4-bet pot), or when you have no blockers to opponent\'s folds.' },
                { front: 'What are good river bluff candidates?', back: 'Hands that: (1) block opponent\'s value range, (2) unblock their folding range, (3) have zero showdown value, (4) are busted draws that bricked.' },
                { front: 'River probe bet strategy?', back: 'When the PFR checks back the turn, OOP player can probe (donk-bet) the river with a polar range. Good spots: scare cards, completed draws, or when PFR capped their range by checking.' },
            ],
            gto_theory: [
                { front: 'What is Nash Equilibrium?', back: 'A strategy pair where neither player can improve their EV by unilaterally changing strategy. GTO poker seeks this equilibrium — unexploitable play.' },
                { front: 'What is a mixed strategy?', back: 'When GTO says to take different actions with the same hand at certain frequencies. Example: check AQ 60%, bet 33% 30%, bet 75% 10%.' },
                { front: 'Why use mixed strategies?', back: 'To remain unpredictable (balanced). If you always bet strong hands and check weak ones, opponents can exploit your pattern. Mixing prevents this.' },
                { front: 'What is EV (Expected Value)?', back: 'The average profit/loss of a decision over infinite repetitions. A call is +EV if you win more than you lose over time. GTO maximizes EV vs perfect opponents.' },
                { front: 'GTO vs Exploitative play?', back: 'GTO: unexploitable, best vs strong opponents. Exploitative: deviates from GTO to target opponent leaks, more profitable vs weak opponents but vulnerable to counter-exploitation.' },
                { front: 'What is indifference?', back: 'When GTO makes an opponent indifferent between calling and folding with their bluff-catchers. If you bluff at exactly the right frequency, calling and folding have equal EV for them.' },
                { front: 'What is range vs range equity?', back: 'How one player\'s entire range performs against another player\'s entire range. The PFR has ~53-55% range equity on most flops, which is why c-betting is profitable.' },
                { front: 'What is a capped range?', back: 'A range that does not contain very strong hands. Example: after checking back the flop, your range is capped (you would have bet nutted hands).' },
                { front: 'What is equity denial?', back: 'Betting to prevent opponent from realizing their equity for free. A hand with 30% equity that gets to see free cards will eventually win 30% of the pot.' },
                { front: 'What is ICM?', back: 'Independent Chip Model — converts tournament chips to monetary value. Near the bubble, chip survival matters more than chip accumulation, changing optimal strategy significantly.' },
            ],
        };

        if (category && allCards[category]) return allCards[category];
        // Return random category
        const categories = Object.keys(allCards || {});
        const randomCat = categories[Math.floor(Math.random() * categories.length)];
        return { category: randomCat, cards: allCards[randomCat] };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 243: QUICK-FIRE DRILL MODE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 243: Rapid yes/no decision drill data.
     * Simplified questions for fast pattern recognition training.
     */
    generateQuickFireQuestion(scenario, heroHand, correctAction) {
        const a = (correctAction || '').toLowerCase();
        const street = scenario.street || 'flop';
        const heroPos = scenario.heroPosition || 'BTN';
        const villPos = scenario.villainPosition || 'BB';
        const nodeType = scenario.nodeType || '';
        const board = scenario.board || '';

        // Build diverse question pool, then pick randomly
        const questions = [];

        if (street === 'preflop') {
            const shouldPlay = a.startsWith('r') || a === 'call';
            questions.push({ q: `Should you open ${heroHand} from ${heroPos}?`, a: shouldPlay ? 'YES' : 'NO' });
            questions.push({ q: `Is ${heroHand} a fold from ${heroPos}?`, a: shouldPlay ? 'NO' : 'YES' });
            if (nodeType.includes('3bet') || nodeType.includes('vs_raise')) {
                questions.push({ q: `Should you 3-bet ${heroHand} here?`, a: a.startsWith('r') ? 'YES' : 'NO' });
                questions.push({ q: `Is ${heroHand} a call vs the raise from ${heroPos}?`, a: a === 'call' || a === 'c' ? 'YES' : 'NO' });
            }
            if (heroPos === 'SB' || heroPos === 'BB') {
                questions.push({ q: `Should you defend ${heroHand} from the ${heroPos}?`, a: shouldPlay ? 'YES' : 'NO' });
            }
        } else {
            // Postflop — many question templates
            const isBet = a.startsWith('b') || a.startsWith('r') || a === 'allin';
            const isFold = a === 'f' || a === 'simple_fold';
            const isCheck = a === 'c' || a === 'x' || a === 'check';

            // Core decision questions
            if (isBet) {
                questions.push({ q: `Should you bet ${heroHand} on this ${street}?`, a: 'YES' });
                questions.push({ q: `Is checking better than betting here with ${heroHand}?`, a: 'NO' });
            }
            if (isFold) {
                questions.push({ q: `Should you continue with ${heroHand} here?`, a: 'NO' });
                questions.push({ q: `Is folding ${heroHand} correct on this ${street}?`, a: 'YES' });
            }
            if (isCheck) {
                questions.push({ q: `Is this a checking spot with ${heroHand}?`, a: 'YES' });
                questions.push({ q: `Should you bet for value with ${heroHand} here?`, a: 'NO' });
            }

            // Bet sizing questions
            const betMatch = a.match(/^b(\d+)$/);
            if (betMatch) {
                const pct = parseInt(betMatch[1]);
                questions.push({ q: `Is a ${pct <= 40 ? 'small' : pct <= 75 ? 'medium' : 'large'} bet correct with ${heroHand}?`, a: 'YES' });
                if (pct <= 40) questions.push({ q: `Should you use a large bet (75%+) here?`, a: 'NO' });
                if (pct >= 75) questions.push({ q: `Is a small bet (33%) sufficient here?`, a: 'NO' });
            }

            // Position awareness
            if (heroPos === 'BTN' || heroPos === 'CO') {
                questions.push({ q: `Does your position favor aggression with ${heroHand}?`, a: isBet ? 'YES' : 'NO' });
            }

            // Street-specific questions
            if (street === 'river') {
                if (isBet) questions.push({ q: `Is ${heroHand} a value bet on this river?`, a: 'YES' });
                if (isFold) questions.push({ q: `Should you bluff-catch with ${heroHand}?`, a: 'NO' });
            }
            if (street === 'turn') {
                if (isBet) questions.push({ q: `Should you barrel the turn with ${heroHand}?`, a: 'YES' });
            }
        }

        // Standalone concept questions (no scenario needed)
        const conceptQs = [
            { q: 'Is position more important than card strength?', a: 'YES' },
            { q: 'Should you always c-bet the flop as PFR?', a: 'NO' },
            { q: 'Is a pot-sized bet ever used in GTO?', a: 'YES' },
            { q: 'Should you limp-call preflop with small pairs?', a: 'NO' },
            { q: 'Does checking always mean weakness?', a: 'NO' },
            { q: 'Is defending your blind with any two cards correct?', a: 'NO' },
            { q: 'Should you 3-bet light more from the BTN?', a: 'YES' },
            { q: 'Is slow-playing always best with the nuts?', a: 'NO' },
            { q: 'Can a fold ever be the highest-EV play?', a: 'YES' },
            { q: 'Should you always bet when you have the nut advantage?', a: 'NO' },
        ];

        // Add some concept questions to the pool
        const conceptSample = conceptQs[Math.floor(Math.random() * conceptQs.length)];
        questions.push(conceptSample);

        // Return a random question from the pool
        return questions[Math.floor(Math.random() * questions.length)] || null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 244: BOARD TEXTURE CLASSIFICATION (12 TYPES)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 244: Classify board texture into one of 12 strategic categories.
     */
    classifyBoardTexture(board) {
        if (!board || board.length < 3) return null;
        const texture = this._analyzeTexture ? this._analyzeTexture(board) : null;
        const boardRanks = board.map(c => '23456789TJQKA'.indexOf(c[0]));
        const boardSuits = board.map(c => c[1]);
        const maxRank = Math.max(...boardRanks);
        const minRank = Math.min(...boardRanks);
        const spread = maxRank - minRank;
        const uniqueSuits = new Set(boardSuits).size;
        const isPaired = new Set(boardRanks).size < boardRanks.length;

        // Classify
        if (uniqueSuits === 1) return { type: 'MONOTONE', desc: 'All one suit — flush is already possible', strategy: 'Favor the caller. PFR should check more. Only bet with a flush or strong draw.' };
        if (isPaired && maxRank >= 11) return { type: 'PAIRED_HIGH', desc: 'Paired board with high cards', strategy: 'Favors PFR — more trips/full house combos. Bet frequently with small sizing.' };
        if (isPaired && maxRank <= 8) return { type: 'PAIRED_LOW', desc: 'Paired board with low cards', strategy: 'Split advantage — PFR has overpairs, caller may have trips. Proceed cautiously.' };
        if (maxRank >= 12 && spread <= 4) return { type: 'ACE_HIGH_CONNECTED', desc: 'Ace-high connected board', strategy: 'Strongly favors PFR range. C-bet at high frequency with small sizing.' };
        if (maxRank >= 12 && spread > 6) return { type: 'ACE_HIGH_RAINBOW_DRY', desc: 'Ace-high dry rainbow', strategy: 'PFR has big range advantage. Can range bet 33% pot at very high frequency.' };
        if (maxRank >= 9 && maxRank <= 11 && spread <= 3) return { type: 'BROADWAY_WET', desc: 'Broadway-connected wet board', strategy: 'Both ranges hit well. Mixed strategy — check and bet at moderate frequency.' };
        if (maxRank <= 8 && spread <= 3) return { type: 'LOW_CONNECTED', desc: 'Low connected board', strategy: 'Favors caller heavily — more two-pairs, sets, straights. PFR should check frequently.' };
        if (maxRank <= 8 && spread > 5) return { type: 'LOW_DISCONNECTED', desc: 'Low disconnected dry board', strategy: 'Slightly favors PFR (overpairs), but caller has set potential. Standard c-bet with medium sizing.' };
        if (uniqueSuits === 2 && spread <= 4) return { type: 'TWO_TONE_CONNECTED', desc: 'Two-tone connected — many draws', strategy: 'Very wet board. Bet larger to charge draws. Both ranges have many possibilities.' };
        if (uniqueSuits === 2 && spread > 5) return { type: 'TWO_TONE_DISCONNECTED', desc: 'Two-tone but disconnected', strategy: 'Flush draws present but fewer straight draws. Medium wetness — standard sizing.' };
        if (uniqueSuits === 3 && spread > 6) return { type: 'RAINBOW_DRY', desc: 'Rainbow dry board', strategy: 'No flush draws, few straight draws. PFR can c-bet at high frequency with small sizing.' };
        return { type: 'STANDARD', desc: 'Standard mixed texture', strategy: 'Balanced approach — use position and hand strength to guide decisions.' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 245: ACTION TREE VISUALIZATION DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 245: Generate action tree data for visualization.
     */
    generateActionTree(handActions, heroHand) {
        if (!handActions) return null;
        const tree = { hand: heroHand, children: [] };

        for (const [action, freq] of Object.entries(handActions || {})) {
            if (freq < 0.01) continue;
            tree.children.push({
                action: this._actionLabel(action),
                rawAction: action,
                frequency: (freq * 100).toFixed(1) + '%',
                freqValue: freq,
                isOptimal: freq === Math.max(...Object.values(handActions || {})),
                color: action.startsWith('r') || action === 'allin' ? '#ef4444' : action === 'call' ? '#22c55e' : action === 'f' ? '#6b7280' : '#3b82f6',
            });
        }

        tree.children.sort((a, b) => b.freqValue - a.freqValue);
        return tree;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 246: RANGE VS RANGE EQUITY MATCHUP
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 246: Pre-computed range vs range equities for common matchups.
     */
    getRangeVsRangeEquity(heroRangeType, villainRangeType, boardType) {
        // Approximate range vs range equities
        const matchups = {
            'pfr_vs_caller:high_board': { pfr: 55, caller: 45, note: 'PFR has slight equity edge on high boards.' },
            'pfr_vs_caller:low_board': { pfr: 45, caller: 55, note: 'Caller has equity edge on low boards.' },
            'pfr_vs_caller:medium_board': { pfr: 50, caller: 50, note: 'Roughly even equity on medium boards.' },
            'pfr_vs_3bettor:any': { pfr: 45, caller: 55, note: '3-bettor has tighter, stronger range.' },
            'btn_vs_bb:dry': { pfr: 55, caller: 45, note: 'BTN range advantage on dry boards.' },
            'btn_vs_bb:wet': { pfr: 48, caller: 52, note: 'BB closes the equity gap on wet boards.' },
        };

        const key = `${heroRangeType}_vs_${villainRangeType}:${boardType}`;
        return matchups[key] || null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 247: TOURNAMENT VS CASH GAME ADJUSTMENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 247: Note differences between tournament and cash game strategy.
     */
    _getTournamentAdjustmentNote(stackDepth) {
        if (!this._sessionStats || this._sessionStats.total % 30 !== 0) return '';
        if (this._sessionStats.total < 30) return '';

        if (stackDepth && stackDepth <= 30) {
            return 'Tournament adjustment: at short stacks in tournaments, ICM makes survival more important than chip accumulation. Fold more marginal spots, especially near pay jumps. Push/fold charts become essential under 15BB.';
        }
        return 'Tournament vs cash: key differences — (1) ICM pressure means chips lost > chips won, (2) No rebuying means survival matters, (3) Antes increase steal profitability, (4) Bubble dynamics create exploitable spots against medium stacks.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 248: MULTI-TABLE CONSIDERATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 248: Tips for multi-tabling and volume play.
     */
    getMultiTableTips() {
        if (!this._sessionStats || this._sessionStats.total % 40 !== 0) return null;
        if (this._sessionStats.total < 40) return null;

        const accuracy = this._sessionStats.correct / this._sessionStats.total;
        if (accuracy >= 0.7) {
            return 'Multi-table ready: your accuracy is strong enough to consider playing multiple tables. Start with 2 tables and add more as your speed improves. Focus on making quick, correct decisions rather than perfect ones.';
        }
        return 'Multi-table advice: focus on single-tabling until your accuracy reaches 70%+. Quality decisions at one table build better habits than hasty decisions at many.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 249: TILT DETECTION AND INTERVENTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 249: Detect tilt patterns and intervene with coaching.
     */
    detectTilt() {
        if (!this._recentResults || this._recentResults.length < 8) return null;
        const last8 = this._recentResults.slice(-8);
        const wrongCount = last8.filter(r => !r).length;

        // Pattern detection: sudden accuracy drop
        const first4 = last8.slice(0, 4).filter(r => r).length;
        const last4 = last8.slice(4).filter(r => r).length;
        const suddenDrop = first4 >= 3 && last4 <= 1;

        if (wrongCount >= 7) {
            return {
                level: 'SEVERE',
                message: 'Tilt alert: 7+ wrong in the last 8 questions. Your decision-making may be compromised. Take a 5-minute break, breathe deeply, and reset. Coming back fresh will save you EV.',
                action: 'SUGGEST_BREAK',
            };
        }
        if (wrongCount >= 5 || suddenDrop) {
            return {
                level: 'MODERATE',
                message: '▲ Tilt warning: accuracy dropping. You may be rushing or letting frustration guide decisions. Slow down — take an extra 5 seconds per question.',
                action: 'SUGGEST_SLOWDOWN',
            };
        }
        if (wrongCount >= 4) {
            return {
                level: 'MILD',
                message: 'Rough patch — 4+ wrong in the last 8. Stay process-oriented: focus on HOW you decide, not the results.',
                action: 'COACH',
            };
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 251: STRUCTURED EXPLANATION OBJECTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 251: Generate a structured explanation object instead of a flat string.
     * Returns sections that the UI can render with visual hierarchy.
     * @param {string} selectedAction - Action the user chose
     * @param {string} correctAction - GTO-optimal action
     * @param {Object} frequencies - Action frequency map
     * @param {string} handCategory - Hand classification (e.g., 'top pair')
     * @param {string} street - Current street
     * @param {string} nodeType - Node type context
     * @param {Object} scenario - Full scenario data
     * @param {string} baseExplanation - Engine-generated base explanation
     * @returns {Object} Structured explanation with labeled sections
     */
    generateStructuredExplanation(selectedAction, correctAction, frequencies, handCategory, street, nodeType, scenario, baseExplanation) {
        const isCorrect = selectedAction === correctAction;
        const selectedFreq = frequencies?.[selectedAction] || 0;
        const correctFreq = frequencies?.[correctAction] || 0;

        // Derive concept tag
        const concept = this.deriveConceptFromContext(nodeType || '', street || 'flop', correctAction, handCategory || '');

        // Key takeaway — one sentence the player should remember
        const takeaway = this._generateKeyTakeaway(selectedAction, correctAction, frequencies, handCategory, street, nodeType, isCorrect);

        // Mistake classification for wrong answers
        let mistakeType = null;
        if (!isCorrect) {
            mistakeType = this._classifyMistakeType(selectedAction, correctAction, frequencies, street, nodeType, handCategory);
        }

        // Pattern match — connect to previous mistakes
        const patternMatch = this._findMistakePattern(street, nodeType, selectedAction, correctAction);

        // Actionable fix — specific drill or focus area
        const actionableFix = !isCorrect ? this._generateActionableFix(mistakeType, street, nodeType, handCategory) : null;

        return {
            // Primary feedback line (already computed by UI)
            primary: baseExplanation || '',
            // Concept being tested (e.g., 'C-Bet Frequency', 'River Bluff Catching')
            concept: concept || 'General Strategy',
            // One-sentence key takeaway
            takeaway: takeaway,
            // Mistake classification (null if correct)
            mistakeType: mistakeType,
            // Pattern detection result
            pattern: patternMatch,
            // Actionable fix instruction
            fix: actionableFix,
            // Whether this was correct
            isCorrect: isCorrect,
            // Frequencies for context
            selectedFreq: Math.round(selectedFreq * (selectedFreq <= 1 ? 100 : 1)),
            correctFreq: Math.round(correctFreq * (correctFreq <= 1 ? 100 : 1)),
            // Street and spot type
            street: street,
            spotType: nodeType || 'general',
        };
    }

    /**
     * Phase 251: Generate a single-sentence key takeaway.
     */
    _generateKeyTakeaway(selectedAction, correctAction, frequencies, handCategory, street, nodeType, isCorrect) {
        const correctLabel = this.getActionLabelGTOW(correctAction);
        const correctFreq = frequencies?.[correctAction] || 0;
        const freqPct = correctFreq <= 1 ? Math.round(correctFreq * 100) : Math.round(correctFreq);
        const hc = (handCategory || '').toLowerCase();

        if (isCorrect) {
            if (freqPct >= 95) return `${correctLabel} is the only play here — remember this as a pure strategy spot.`;
            if (freqPct >= 70) return `${correctLabel} is strongly preferred. In practice, always take this action with ${handCategory || 'this hand'}.`;
            return `Good read on a mixed spot — ${correctLabel} at ${freqPct}% is the solver's top choice.`;
        }

        // Wrong answer takeaways — teach the principle
        const selectedLabel = this.getActionLabelGTOW(selectedAction);
        const selFreq = frequencies?.[selectedAction] || 0;
        const selPct = selFreq <= 1 ? Math.round(selFreq * 100) : Math.round(selFreq);

        if (selPct === 0) {
            // Action not in solver strategy at all
            if (street === 'river') {
                if (selectedAction === 'f' || selectedAction === 'fold') return `On the river, ${handCategory || 'this hand'} has enough showdown value to continue. Folding here over-folds your range.`;
                if ((selectedAction || '').match(/^(b|bet|allin|r|raise)/i)) return `${handCategory || 'This hand'} doesn't have the right properties to bet/raise here. Focus on which hands in your range want to put money in.`;
            }
            if (street === 'preflop') {
                return `${handCategory || 'This hand'} isn't strong enough for ${selectedLabel} in this position. Review your preflop ranges for this spot.`;
            }
            return `${selectedLabel} is never used here by the solver. Ask yourself: what is ${selectedLabel} trying to accomplish that ${correctLabel} doesn't do better?`;
        }

        if (selPct > 0 && selPct < 15) return `${selectedLabel} is only used ${selPct}% — it's a rare mix, not a primary action. Default to ${correctLabel} (${freqPct}%).`;
        if (selPct >= 15 && selPct < correctFreq) return `Both actions are in the mix, but ${correctLabel} at ${freqPct}% is preferred over ${selectedLabel} at ${selPct}%. The EV difference matters over volume.`;

        return `${correctLabel} at ${freqPct}% is the solver's primary choice. Study what makes ${handCategory || 'this hand'} prefer ${correctLabel} over ${selectedLabel} in this spot.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 252: MISTAKE TYPE CLASSIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 252: Classify the TYPE of mistake into one of several categories.
     * This helps users understand their thinking error, not just that they were wrong.
     */
    _classifyMistakeType(selectedAction, correctAction, frequencies, street, nodeType, handCategory) {
        const sel = (selectedAction || '').toLowerCase();
        const cor = (correctAction || '').toLowerCase();
        const selFreq = frequencies?.[selectedAction] || 0;
        const selPct = selFreq <= 1 ? Math.round(selFreq * 100) : Math.round(selFreq);

        // Category 1: Playing too passively (should bet/raise, chose check/call/fold)
        const corIsAggressive = cor.match(/^(b|bet|r|raise|allin)/i);
        const selIsPassive = sel === 'x' || sel === 'c' || sel === 'check' || sel === 'call' || sel === 'f' || sel === 'fold';
        if (corIsAggressive && selIsPassive) {
            if (sel === 'f' || sel === 'fold') return { type: 'OVER_FOLD', label: 'Over-Folding', description: 'You folded a hand that has enough equity to continue. This shrinks your range too much and makes you exploitable.', severity: 'high' };
            return { type: 'TOO_PASSIVE', label: 'Too Passive', description: 'The solver wants to apply pressure here. Playing passively misses value or fails to deny equity.', severity: 'medium' };
        }

        // Category 2: Playing too aggressively (should check/call/fold, chose bet/raise)
        const selIsAggressive = sel.match(/^(b|bet|r|raise|allin)/i);
        const corIsPassive = cor === 'x' || cor === 'c' || cor === 'check' || cor === 'call' || cor === 'f' || cor === 'fold';
        if (selIsAggressive && corIsPassive) {
            if (cor === 'f' || cor === 'fold') return { type: 'HERO_CALL', label: 'Bad Bluff/Value', description: 'This hand should be given up. Betting or raising here turns a made hand into a bluff or overvalues your holding.', severity: 'high' };
            return { type: 'TOO_AGGRESSIVE', label: 'Too Aggressive', description: 'The solver prefers a more controlled approach here. Over-aggression can bloat the pot with a hand that doesn\'t benefit from it.', severity: 'medium' };
        }

        // Category 3: Right aggression, wrong sizing (both bet but different sizes)
        const selIsBet = sel.match(/^(b|bet)/i);
        const corIsBet = cor.match(/^(b|bet)/i);
        if (selIsBet && corIsBet && sel !== cor) {
            return { type: 'SIZING_ERROR', label: 'Sizing Mistake', description: 'You had the right idea to bet, but the size matters. Different sizings target different parts of villain\'s range.', severity: 'low' };
        }

        // Category 4: Mixed strategy misread (both in strategy but wrong primary)
        if (selPct > 0 && selPct < 30) {
            return { type: 'MIX_MISREAD', label: 'Mixed Strategy Misread', description: 'Your action is in the solver\'s strategy but at low frequency. Study when the solver shifts to this action vs the primary.', severity: 'low' };
        }

        // Category 5: Fold vs call decision (defensive error)
        if ((sel === 'f' || sel === 'fold') && (cor === 'call' || cor === 'c')) {
            return { type: 'OVER_FOLD', label: 'Over-Folding', description: 'Your hand has enough equity vs villain\'s range to continue. Folding too much lets villain profit with any two cards.', severity: 'high' };
        }
        if ((sel === 'call' || sel === 'c') && (cor === 'f' || cor === 'fold')) {
            return { type: 'OVER_CALL', label: 'Over-Calling', description: 'This hand doesn\'t have enough equity against villain\'s betting range. Calling here is burning money.', severity: 'high' };
        }

        // Default
        return { type: 'STRATEGY_ERROR', label: 'Strategy Error', description: 'The solver sees a better play here. Review the spot\'s fundamentals.', severity: 'medium' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 253: PATTERN DETECTION ACROSS SESSION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 253: Find if the current mistake matches a pattern from earlier in the session.
     */
    _findMistakePattern(street, nodeType, selectedAction, correctAction) {
        if (!this._mistakeTracker) return null;
        const key = `${street}:${nodeType || 'general'}`;
        const mistakes = this._mistakeTracker[key];
        if (!mistakes || mistakes < 2) return null;

        // Check if user repeatedly makes the same type of error in the same spot
        const totalForSpot = mistakes;
        if (totalForSpot >= 3) {
            return {
                isRecurring: true,
                count: totalForSpot,
                message: `This is the ${totalForSpot}${totalForSpot === 3 ? 'rd' : 'th'} time you've missed a ${street} ${nodeType || ''} spot this session. This is a systematic leak — add it to your study list.`,
                spotType: key,
            };
        }
        if (totalForSpot === 2) {
            return {
                isRecurring: true,
                count: 2,
                message: `You missed a similar ${street} spot earlier. Pay extra attention to ${street} strategy in ${nodeType || 'this configuration'}.`,
                spotType: key,
            };
        }
        return null;
    }

    /**
     * Phase 253: Generate an actionable fix instruction based on mistake type.
     */
    _generateActionableFix(mistakeType, street, nodeType, handCategory) {
        if (!mistakeType) return null;
        const mt = mistakeType.type;

        if (mt === 'OVER_FOLD') {
            if (street === 'river') return 'Practice: Estimate your bluff-catching frequency. You need to call enough to make villain indifferent to bluffing.';
            if (street === 'flop') return 'Practice: Check if your hand has enough equity (draws, backdoors, overcards) to continue. Folding too early forfeits equity.';
            return 'Drill: Review pot odds math. Calculate the minimum equity needed to call and compare it to your hand\'s equity.';
        }
        if (mt === 'TOO_PASSIVE') {
            if (street === 'flop' && (nodeType || '').includes('ip')) return 'Practice: IP on the flop with initiative, you should be c-betting frequently. Ask: does betting deny equity or extract value?';
            if (street === 'turn') return 'Practice: When you bet the flop, plan your turn action in advance. Checking the turn after a flop bet often signals weakness.';
            return 'Drill: For each hand you want to check, ask: would betting accomplish more (deny equity, charge draws, build pot)?';
        }
        if (mt === 'TOO_AGGRESSIVE') {
            if (street === 'river') return 'Practice: On the river, only bet for value (can you get called by worse?) or as a bluff (can you fold out better?). If neither, check.';
            return 'Drill: Before betting, identify your hand\'s goal — value, protection, or bluff. If none apply clearly, checking is usually correct.';
        }
        if (mt === 'SIZING_ERROR') return 'Practice: Small bets target inelastic calls; large bets polarize. Match your sizing to your range, not just your hand.';
        if (mt === 'MIX_MISREAD') return 'Practice: In mixed strategy spots, default to the highest-frequency action. Only deviate when you have a strong exploitative reason.';
        if (mt === 'OVER_CALL') return 'Drill: Calculate minimum defense frequency vs the bet size. Some hands must fold even if they look decent — that\'s how ranges work.';
        if (mt === 'HERO_CALL') return 'Practice: Before calling a big bet, ask: what value hands does villain bet that I beat? If the answer is few or none, fold.';

        return 'Review this spot type in your next study session. Focus on understanding the solver\'s reasoning, not memorizing the action.';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 254: POST-SESSION LEAK REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 254: Analyze session data and generate a ranked leak report.
     * Returns top 3 specific leaks with fix instructions.
     */
    generateLeakReport() {
        const total = this._sessionStats?.total || 0;
        if (total < 5) return { leaks: [], summary: 'Play at least 5 hands to generate a leak report.' };

        const leaks = [];
        const accuracy = total > 0 ? (this._sessionStats.correct / total) * 100 : 0;

        // Leak 1: Positional weaknesses
        if (this._positionalAwareness) {
            const posEntries = Object.entries(this._positionalAwareness || {});
            for (const [pos, data] of posEntries) {
                if (data.total >= 2) {
                    const posAcc = (data.correct / data.total) * 100;
                    if (posAcc < 50) {
                        leaks.push({
                            type: 'POSITIONAL',
                            severity: posAcc < 30 ? 'critical' : 'high',
                            title: `Weak from ${pos}`,
                            detail: `${Math.round(posAcc)}% accuracy from ${pos} (${data.correct}/${data.total}). Your overall is ${Math.round(accuracy)}%.`,
                            fix: `Focus your next session on ${pos}-specific spots. Review opening ranges and postflop strategy when playing from ${pos}.`,
                            score: (accuracy - posAcc) * data.total, // Higher = worse leak
                        });
                    }
                }
            }
        }

        // Leak 2: Street-specific weaknesses from question type tracker
        if (this._questionTypeTracker) {
            const streetStats = {};
            for (const [key, count] of Object.entries(this._questionTypeTracker || {})) {
                const street = key.split(':')[0];
                if (!streetStats[street]) streetStats[street] = { total: 0, wrong: 0 };
                streetStats[street].total += count;
            }
            // Cross-reference with mistakes
            if (this._mistakeTracker) {
                for (const [key, count] of Object.entries(this._mistakeTracker || {})) {
                    const street = key.split(':')[0];
                    if (streetStats[street]) streetStats[street].wrong += count;
                }
            }
            for (const [street, data] of Object.entries(streetStats || {})) {
                if (data.total >= 3 && data.wrong > 0) {
                    const streetAcc = ((data.total - data.wrong) / data.total) * 100;
                    if (streetAcc < 50) {
                        leaks.push({
                            type: 'STREET',
                            severity: streetAcc < 30 ? 'critical' : 'high',
                            title: `${street.charAt(0).toUpperCase() + street.slice(1)} play needs work`,
                            detail: `${Math.round(streetAcc)}% accuracy on the ${street} (${data.wrong} mistakes in ${data.total} hands).`,
                            fix: street === 'river' ? 'River play requires precise ranging. Practice identifying villain\'s value and bluff combos before deciding.'
                                : street === 'turn' ? 'The turn is where ranges narrow. Practice turn barreling theory and check-raise spots.'
                                : street === 'flop' ? 'Flop play is about range vs range. Practice c-bet frequency decisions based on board texture.'
                                : 'Review preflop ranges for your position and stack depth.',
                            score: (accuracy - streetAcc) * data.total,
                        });
                    }
                }
            }
        }

        // Leak 3: Aggression imbalance
        if (this._aggressionTracker) {
            let totalBets = 0;
            let totalChecks = 0;
            for (const [street, actions] of Object.entries(this._aggressionTracker || {})) {
                for (const [action, count] of Object.entries(actions || {})) {
                    const a = action.toLowerCase();
                    if (a.match(/^(b|bet|r|raise|allin)/)) totalBets += count;
                    else if (a === 'x' || a === 'check' || a === 'c' || a === 'call' || a === 'f' || a === 'fold') totalChecks += count;
                }
            }
            const totalActions = totalBets + totalChecks;
            if (totalActions >= 5) {
                const aggPct = (totalBets / totalActions) * 100;
                if (aggPct > 75) {
                    leaks.push({
                        type: 'AGGRESSION',
                        severity: 'medium',
                        title: 'Over-aggressive tendencies',
                        detail: `You bet/raise ${Math.round(aggPct)}% of the time. The solver typically bets 40-60% depending on the spot.`,
                        fix: 'Not every hand benefits from aggression. Practice identifying check-back and check-call spots where pot control is optimal.',
                        score: Math.abs(aggPct - 55) * 2,
                    });
                } else if (aggPct < 30) {
                    leaks.push({
                        type: 'AGGRESSION',
                        severity: 'medium',
                        title: 'Too passive — not betting enough',
                        detail: `You only bet/raise ${Math.round(aggPct)}% of the time. You\'re likely missing value bets and failing to deny equity.`,
                        fix: 'Focus on spots where betting is clearly +EV: thin value bets, equity denial on wet boards, and balanced bluffs.',
                        score: Math.abs(aggPct - 55) * 2,
                    });
                }
            }
        }

        // Leak 4: Concept mastery gaps
        if (this._conceptMastery) {
            for (const [concept, data] of Object.entries(this._conceptMastery || {})) {
                if (data.total >= 3) {
                    const conceptAcc = (data.correct / data.total) * 100;
                    if (conceptAcc < 40) {
                        leaks.push({
                            type: 'CONCEPT',
                            severity: conceptAcc < 20 ? 'critical' : 'high',
                            title: `Weak concept: ${concept}`,
                            detail: `Only ${Math.round(conceptAcc)}% accuracy on ${concept} spots (${data.correct}/${data.total}).`,
                            fix: `Dedicate a study session to ${concept}. Review solver outputs for 10+ examples of this spot type and note the patterns.`,
                            score: (100 - conceptAcc) * data.total,
                        });
                    }
                }
            }
        }

        // Sort by severity score (highest = worst leak)
        leaks.sort((a, b) => b.score - a.score);

        // Generate summary
        const topLeaks = leaks.slice(0, 3);
        let summary = '';
        if (topLeaks.length === 0) {
            if (accuracy >= 80) summary = 'Excellent session. No significant leaks detected. Keep pushing to higher difficulty levels.';
            else if (accuracy >= 60) summary = 'Solid session. Minor areas for improvement but no glaring leaks. Focus on consistency.';
            else summary = 'Tough session, but the data is limited. Play more hands to get meaningful leak detection.';
        } else {
            const criticalCount = topLeaks.filter(l => l.severity === 'critical').length;
            if (criticalCount > 0) summary = `Found ${criticalCount} critical leak${criticalCount > 1 ? 's' : ''}. Prioritize fixing ${topLeaks[0].title.toLowerCase()} before moving to harder levels.`;
            else summary = `Found ${topLeaks.length} area${topLeaks.length > 1 ? 's' : ''} for improvement. Your biggest opportunity is: ${topLeaks[0].title.toLowerCase()}.`;
        }

        return { leaks: topLeaks, summary, totalHands: total, accuracy: Math.round(accuracy) };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 255: SESSION GRADING SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 255: Grade the overall session performance (A+ through F).
     */
    getSessionGrade() {
        const total = this._sessionStats?.total || 0;
        if (total < 3) return { grade: '-', label: 'Too few hands', color: '#64748b' };

        const accuracy = (this._sessionStats.correct / total) * 100;
        const streak = this._sessionBests?.streak || 0;
        const tilt = this.detectTilt();
        const tiltPenalty = tilt?.level === 'CRITICAL' ? 10 : tilt?.level === 'WARNING' ? 5 : 0;

        // Weighted score: accuracy (70%) + streak bonus (15%) + consistency bonus (15%) - tilt penalty
        const streakBonus = Math.min(15, (streak / total) * 30);
        // Consistency: std deviation of recent results (lower = more consistent = better)
        const recent = (this._recentResults || []).slice(-10);
        let consistencyBonus = 10;
        if (recent.length >= 5) {
            const recentAcc = recent.filter(Boolean).length / recent.length;
            consistencyBonus = recentAcc >= 0.7 ? 15 : recentAcc >= 0.5 ? 10 : 5;
        }

        const rawScore = (accuracy * 0.7) + streakBonus + consistencyBonus - tiltPenalty;
        const score = Math.max(0, Math.min(100, rawScore));

        if (score >= 95) return { grade: 'A+', label: 'Exceptional', color: '#22c55e', score: Math.round(score) };
        if (score >= 88) return { grade: 'A', label: 'Excellent', color: '#22c55e', score: Math.round(score) };
        if (score >= 82) return { grade: 'A-', label: 'Very Good', color: '#4ade80', score: Math.round(score) };
        if (score >= 76) return { grade: 'B+', label: 'Good', color: '#86efac', score: Math.round(score) };
        if (score >= 70) return { grade: 'B', label: 'Above Average', color: '#fbbf24', score: Math.round(score) };
        if (score >= 64) return { grade: 'B-', label: 'Decent', color: '#fbbf24', score: Math.round(score) };
        if (score >= 56) return { grade: 'C+', label: 'Needs Work', color: '#f97316', score: Math.round(score) };
        if (score >= 48) return { grade: 'C', label: 'Below Average', color: '#f97316', score: Math.round(score) };
        if (score >= 40) return { grade: 'C-', label: 'Struggling', color: '#ef4444', score: Math.round(score) };
        if (score >= 30) return { grade: 'D', label: 'Poor', color: '#ef4444', score: Math.round(score) };
        return { grade: 'F', label: 'Review Fundamentals', color: '#dc2626', score: Math.round(score) };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 256: SPOT DIFFICULTY ESTIMATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 256: Estimate how hard a given spot is (1-10 difficulty).
     * Uses frequency distribution, street, and stack depth.
     */
    estimateSpotDifficulty(frequencies, street, stackDepth, nodeType) {
        let difficulty = 3; // baseline

        // Mixed strategy spots are harder
        if (frequencies) {
            const freqs = Object.values(frequencies || {}).filter(f => f > 0.01);
            const entropy = freqs.reduce((sum, f) => sum - (f > 0 ? f * Math.log2(f) : 0), 0);
            difficulty += Math.min(3, entropy * 2); // Max +3 from mixing
        }

        // Later streets are harder
        if (street === 'turn') difficulty += 1;
        if (street === 'river') difficulty += 2;

        // Deeper stacks add complexity
        if (stackDepth && stackDepth > 100) difficulty += 1;
        if (stackDepth && stackDepth > 200) difficulty += 1;

        // Complex node types are harder
        if (nodeType && (nodeType.includes('3bet') || nodeType.includes('4bet'))) difficulty += 1;
        if (nodeType && nodeType.includes('squeeze')) difficulty += 1;

        return {
            difficulty: Math.max(1, Math.min(10, Math.round(difficulty))),
            label: difficulty >= 8 ? 'Expert' : difficulty >= 6 ? 'Advanced' : difficulty >= 4 ? 'Intermediate' : 'Beginner',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 257: IMPROVEMENT VELOCITY TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 257: Track improvement velocity — are you getting better or worse over the session?
     */
    getImprovementVelocity() {
        const recent = this._recentResults || [];
        if (recent.length < 10) return { velocity: 0, trend: 'INSUFFICIENT_DATA', message: 'Play more hands to see your improvement trend.' };

        // Compare first half vs second half of the session
        const midpoint = Math.floor(recent.length / 2);
        const firstHalf = recent.slice(0, midpoint);
        const secondHalf = recent.slice(midpoint);

        const firstAcc = firstHalf.filter(Boolean).length / firstHalf.length;
        const secondAcc = secondHalf.filter(Boolean).length / secondHalf.length;
        const delta = secondAcc - firstAcc;

        // Also check rolling 5-hand windows for micro-trends
        let improving = 0;
        let declining = 0;
        for (let i = 5; i < recent.length; i++) {
            const prev = recent.slice(i - 5, i - 2).filter(Boolean).length / 3;
            const curr = recent.slice(i - 2, i + 1).filter(Boolean).length / 3;
            if (curr > prev) improving++;
            else if (curr < prev) declining++;
        }

        if (delta > 0.15) return { velocity: delta, trend: 'STRONG_IMPROVEMENT', message: `Strong upward trend. Your accuracy improved by ${Math.round(delta * 100)}% from the first to the second half.` };
        if (delta > 0.05) return { velocity: delta, trend: 'IMPROVING', message: `Positive trend. You\'re getting sharper as the session progresses (+${Math.round(delta * 100)}%).` };
        if (delta < -0.15) return { velocity: delta, trend: 'DECLINING', message: `Accuracy dropped ${Math.round(Math.abs(delta) * 100)}% in the second half. Consider taking a break or lowering difficulty.` };
        if (delta < -0.05) return { velocity: delta, trend: 'SLIGHT_DECLINE', message: `Slight dip in the second half (-${Math.round(Math.abs(delta) * 100)}%). Could be fatigue or harder spots.` };
        return { velocity: delta, trend: 'STABLE', message: 'Consistent performance throughout the session. Good focus and discipline.' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 258: DRILL PRESCRIPTION ENGINE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 258: Based on session performance, prescribe specific drills.
     */
    prescribeDrills() {
        const leakReport = this.generateLeakReport();
        const drills = [];

        for (const leak of (leakReport.leaks || [])) {
            if (leak.type === 'POSITIONAL') {
                drills.push({
                    name: `${leak.title} Bootcamp`,
                    description: `Play 25 hands exclusively from ${leak.title.replace('Weak from ', '')}. Focus on range construction and postflop fundamentals.`,
                    type: 'position',
                    duration: '15 min',
                    priority: leak.severity === 'critical' ? 1 : 2,
                });
            }
            if (leak.type === 'STREET') {
                const street = leak.title.split(' ')[0].toLowerCase();
                drills.push({
                    name: `${leak.title.split(' ')[0]} Accuracy Drill`,
                    description: `Focus session on ${street}-only decisions. Review solver frequencies before each hand.`,
                    type: 'street',
                    duration: '20 min',
                    priority: leak.severity === 'critical' ? 1 : 2,
                });
            }
            if (leak.type === 'AGGRESSION') {
                drills.push({
                    name: 'Aggression Calibration',
                    description: leak.title.includes('passive')
                        ? 'Practice identifying thin value bets and equity denial spots. For each check, ask: should I bet?'
                        : 'Practice pot control and check-back spots. For each bet, ask: am I getting called by worse or folding out better?',
                    type: 'aggression',
                    duration: '15 min',
                    priority: 2,
                });
            }
            if (leak.type === 'CONCEPT') {
                drills.push({
                    name: `${leak.title.replace('Weak concept: ', '')} Deep Dive`,
                    description: `Study 10 solver examples of ${leak.title.replace('Weak concept: ', '')} spots. Note the common patterns.`,
                    type: 'concept',
                    duration: '10 min',
                    priority: leak.severity === 'critical' ? 1 : 3,
                });
            }
        }

        // Always suggest a warmup drill
        if (drills.length === 0) {
            drills.push({
                name: 'Maintain Your Edge',
                description: 'No specific leaks detected. Continue at current difficulty and try a challenge mode session.',
                type: 'general',
                duration: '10 min',
                priority: 3,
            });
        }

        return drills.sort((a, b) => a.priority - b.priority).slice(0, 3);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 259: FREQUENCY MASTERY SCORE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 259: Score how well the user matches solver frequencies over the session.
     * This is the ultimate measure — not just right/wrong but frequency alignment.
     */
    getFrequencyMasteryScore() {
        if (!this._freqComparison) return { score: 0, label: 'No data', details: [] };

        let totalDeviation = 0;
        let totalDataPoints = 0;
        const details = [];

        for (const [street, nodes] of Object.entries(this._freqComparison || {})) {
            for (const [nodeType, actions] of Object.entries(nodes || {})) {
                for (const [action, data] of Object.entries(actions || {})) {
                    if (data.count >= 2) {
                        const userFreq = data.count > 0 ? data.userCount / data.count : 0;
                        const solverFreq = data.solverAvg || 0;
                        const deviation = Math.abs(userFreq - solverFreq);
                        totalDeviation += deviation;
                        totalDataPoints++;

                        if (deviation > 0.2) {
                            details.push({
                                spot: `${street} ${nodeType}`,
                                action: action,
                                userFreq: Math.round(userFreq * 100),
                                solverFreq: Math.round(solverFreq * 100),
                                deviation: Math.round(deviation * 100),
                            });
                        }
                    }
                }
            }
        }

        if (totalDataPoints === 0) return { score: 0, label: 'Insufficient data', details: [] };

        const avgDeviation = totalDeviation / totalDataPoints;
        const score = Math.max(0, Math.round((1 - avgDeviation) * 100));

        const label = score >= 90 ? 'Solver-Level Play' : score >= 75 ? 'Strong Frequency Alignment' : score >= 60 ? 'Decent Balance' : score >= 40 ? 'Frequency Imbalance' : 'Major Frequency Leaks';

        return {
            score,
            label,
            avgDeviation: Math.round(avgDeviation * 100),
            dataPoints: totalDataPoints,
            details: details.sort((a, b) => b.deviation - a.deviation).slice(0, 5),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 260: ENHANCED SESSION SUMMARY REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 260: Generate a comprehensive end-of-session report object
     * that includes grading, leaks, drills, frequency mastery, and improvement velocity.
     */
    generateSessionReport() {
        return {
            grade: this.getSessionGrade(),
            leakReport: this.generateLeakReport(),
            drills: this.prescribeDrills(),
            frequencyMastery: this.getFrequencyMasteryScore(),
            velocity: this.getImprovementVelocity(),
            dashboard: this.getTrainingDashboard(),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 250: COMPREHENSIVE TRAINING DASHBOARD DATA
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 250: Generate all data needed for a comprehensive training dashboard.
     */
    getTrainingDashboard() {
        return {
            // Core stats
            session: {
                total: this._sessionStats?.total || 0,
                correct: this._sessionStats?.correct || 0,
                accuracy: this._sessionStats?.total > 0 ? ((this._sessionStats.correct / this._sessionStats.total) * 100).toFixed(1) + '%' : 'N/A',
            },
            // Performance
            trend: this.getPerformanceTrend(),
            comparison: this.getOptimalPlayComparison(),
            deviations: this.getDeviationSummary(),
            // Analytics
            aggression: this.getAggressionFactors(),
            preflopStats: this.getPreflopStats(),
            positional: this.getPositionalAwarenessScore(),
            frequencyBalance: this.getExpectedFrequencyBalance(),
            // Learning
            conceptMastery: this.getConceptMastery(),
            weaknesses: this.getWeaknessTargets(),
            recommendedDrills: this.getRecommendedDrills(),
            progressiveLevel: this.getProgressiveLevelDescription(),
            // Engagement
            achievements: this.checkAchievements(),
            challengeResults: this.getChallengeResults(),
            streak: this._sessionBests?.streak || 0,
            tiltStatus: this.detectTilt(),
            // Session
            timing: this.getTimingAnalysis(),
            evGraph: this.getEVGraphData(),
            cumulativeCost: this.getCumulativeDeviationCost(),
            // Meta
            engineHealth: this.getEngineHealth(),
            autodifficulty: this.getAutoAdjustedDifficulty(),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 271: HAND STRENGTH CLASSIFICATION DISPLAY
    // ═══════════════════════════════════════════════════════════════════════════

    classifyHandStrength(handCategory, boardTexture, street) {
        const cat = (handCategory || '').toLowerCase();
        const tiers = {
            premium: { tier: 'premium', label: 'Premium', color: '#22c55e', icon: '★★★', playabilityScore: 95 },
            strong: { tier: 'strong', label: 'Strong', color: '#4ade80', icon: '★★☆', playabilityScore: 80 },
            medium: { tier: 'medium', label: 'Marginal', color: '#fbbf24', icon: '★☆☆', playabilityScore: 55 },
            weak: { tier: 'weak', label: 'Weak', color: '#f97316', icon: '☆☆☆', playabilityScore: 30 },
            trash: { tier: 'trash', label: 'Air', color: '#ef4444', icon: '✕', playabilityScore: 10 },
            draw: { tier: 'draw', label: 'Draw', color: '#3b82f6', icon: '♦', playabilityScore: 50 },
        };
        let tier = 'medium';
        let description = 'Medium-strength hand with thin value or marginal showdown equity.';
        if (cat.includes('nut') || cat.includes('full house') || cat.includes('straight flush') || cat.includes('quads') || cat.includes('set') || cat.includes('top two')) {
            tier = 'premium'; description = 'Monster hand — focus on building the pot and extracting maximum value.';
        } else if (cat.includes('overpair') || cat.includes('top pair top kicker') || cat.includes('tptk') || cat.includes('two pair')) {
            tier = 'strong'; description = 'Strong made hand — generally betting for value but watch for board texture changes.';
        } else if (cat.includes('flush draw') || cat.includes('open ended') || cat.includes('combo draw') || cat.includes('oesd')) {
            tier = 'draw'; description = 'Drawing hand — equity comes from completing the draw; consider semi-bluff aggression.';
        } else if (cat.includes('middle pair') || cat.includes('second pair') || cat.includes('weak top pair') || cat.includes('top pair weak kicker')) {
            tier = 'medium'; description = 'Marginal showdown value — pot control, careful with sizing, avoid bloating the pot.';
        } else if (cat.includes('bottom pair') || cat.includes('ace high') || cat.includes('king high') || cat.includes('underpair')) {
            tier = 'weak'; description = 'Weak holding — limited showdown value, consider if bluff-catching is profitable.';
        } else if (cat.includes('air') || cat.includes('no pair') || cat.includes('missed') || cat.includes('gutshot')) {
            tier = 'trash'; description = 'No showdown value — only profitable as a bluff with good blockers or fold equity.';
        }
        if (street === 'river' && tier === 'draw') { tier = 'trash'; description = 'Missed draw on the river — no equity improvement possible, bluff or give up.'; }
        return { ...tiers[tier], description };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 272: EQUITY VS RANGE ESTIMATE
    // ═══════════════════════════════════════════════════════════════════════════

    estimateEquityVsRange(handCategory, street, nodeType, heroPosition, villainPosition) {
        const cat = (handCategory || '').toLowerCase();
        const st = (street || 'flop').toLowerCase();
        const node = (nodeType || '').toLowerCase();
        let equity = 50;
        if (cat.includes('nut') || cat.includes('full house') || cat.includes('quads')) equity = 92;
        else if (cat.includes('set') || cat.includes('top two')) equity = 85;
        else if (cat.includes('overpair') || cat.includes('tptk')) equity = 72;
        else if (cat.includes('two pair')) equity = 68;
        else if (cat.includes('top pair')) equity = 60;
        else if (cat.includes('flush draw') && cat.includes('combo')) equity = 52;
        else if (cat.includes('flush draw') || cat.includes('oesd') || cat.includes('open ended')) equity = 38;
        else if (cat.includes('middle pair') || cat.includes('second pair')) equity = 42;
        else if (cat.includes('gutshot')) equity = 22;
        else if (cat.includes('ace high') || cat.includes('overcards')) equity = 28;
        else if (cat.includes('bottom pair')) equity = 35;
        else if (cat.includes('air') || cat.includes('no pair')) equity = 15;
        if (st === 'turn') equity = equity > 50 ? equity + 3 : equity - 3;
        if (st === 'river') equity = equity > 50 ? equity + 5 : equity - 5;
        if (node.includes('facing') && node.includes('raise')) equity -= 8;
        if (node.includes('facing') && node.includes('3bet')) equity -= 12;
        if (node.includes('facing') && node.includes('bet')) equity -= 4;
        equity = Math.max(2, Math.min(98, Math.round(equity)));
        let equityBucket = 'medium', rangeDesc = 'Villain likely has a mixed range of value and bluffs.';
        if (equity >= 75) { equityBucket = 'dominating'; rangeDesc = 'You dominate villain\'s range — strong value region.'; }
        else if (equity >= 60) { equityBucket = 'ahead'; rangeDesc = 'Ahead of most of villain\'s range but vulnerable to draws and stronger hands.'; }
        else if (equity >= 45) { equityBucket = 'coin-flip'; rangeDesc = 'Roughly even against villain\'s range — marginal spot.'; }
        else if (equity >= 30) { equityBucket = 'behind'; rangeDesc = 'Behind most of villain\'s range — need improvement or fold equity.'; }
        else { equityBucket = 'crushed'; rangeDesc = 'Very low equity vs range — only continue as a bluff.'; }
        return { equity, confidence: 'estimated', rangeDescription: rangeDesc, equityBucket };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 273: ACTION EV COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    getActionEVComparison(frequencies, correctAction, selectedAction) {
        if (!frequencies || Object.keys(frequencies || {}).length === 0) return null;
        const actions = [];
        let maxFreq = 0, bestKey = '';
        Object.entries(frequencies || {}).forEach(([key, freq]) => { if (freq > maxFreq) { maxFreq = freq; bestKey = key; } });
        const totalFreq = Object.values(frequencies || {}).reduce((s, v) => s + v, 0) || 1;
        Object.entries(frequencies || {}).forEach(([key, freq]) => {
            const evFromOptimal = maxFreq > 0 ? ((freq - maxFreq) / totalFreq) * 2 : 0;
            actions.push({ action: key, frequency: freq, ev: Math.round(evFromOptimal * 100) / 100, evDiff: Math.round((freq - maxFreq) * 2) / 100, isOptimal: key === bestKey, isSelected: key === selectedAction });
        });
        actions.sort((a, b) => b.frequency - a.frequency);
        return { actions, bestAction: bestKey, worstAction: actions[actions.length - 1]?.action || '' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 274: SOLVER LINE COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    getSolverLineComparison(selectedAction, correctAction, frequencies, street, nodeType) {
        const selected = (selectedAction || '').toLowerCase();
        const correct = (correctAction || '').toLowerCase();
        if (!selected || !correct) return null;
        const isMatch = selected === correct || (selected.includes('check') && correct.includes('check')) || (selected.includes('fold') && correct.includes('fold')) || (selected.includes('call') && correct.includes('call')) || (selected.includes('raise') && correct.includes('raise')) || (selected.includes('bet') && correct.includes('bet'));
        const correctFreq = frequencies?.[correctAction] || 0;
        const selectedFreq = frequencies?.[selectedAction] || 0;
        let solverPreference = 'mixed';
        if (correctFreq > 80) solverPreference = 'strong';
        else if (correctFreq > 60) solverPreference = 'moderate';
        else if (correctFreq > 40) solverPreference = 'slight';
        let alignment = 'aligned', summary = '';
        if (isMatch) {
            if (solverPreference === 'strong') { alignment = 'perfect'; summary = `Perfect play — solver strongly prefers this action (${correctFreq}% of the time).`; }
            else if (solverPreference === 'mixed') { alignment = 'acceptable'; summary = `Acceptable — this is part of a mixed strategy (solver plays this ${selectedFreq}%).`; }
            else { alignment = 'aligned'; summary = 'Good — you matched the solver\'s preferred action.'; }
        } else {
            const freqDiff = correctFreq - selectedFreq;
            if (freqDiff > 50) { alignment = 'major_deviation'; summary = `Major deviation — solver prefers ${correctAction} (${correctFreq}%) over your ${selectedAction} (${selectedFreq}%).`; }
            else if (freqDiff > 20) { alignment = 'moderate_deviation'; summary = `Moderate deviation — solver slightly prefers ${correctAction} but your choice isn't terrible.`; }
            else { alignment = 'minor_deviation'; summary = 'Minor deviation — both actions are close in the solver\'s strategy.'; }
        }
        return { solverLine: correctAction, userLine: selectedAction, solverFrequency: correctFreq, userFrequency: selectedFreq, alignment, solverPreference, summary };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 275: CONCEPT MASTERY TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    getConceptMasteryReport() {
        if (!this._sessionStats || this._sessionStats.total < 3) return { concepts: [], overallMastery: 0, message: 'Need more hands for mastery data.' };
        const conceptTracker = {};
        const history = this._sessionStats?.history || [];
        history.forEach(h => {
            const concepts = this._identifyHandConcepts(h);
            concepts.forEach(concept => {
                if (!conceptTracker[concept]) conceptTracker[concept] = { correct: 0, total: 0 };
                conceptTracker[concept].total++;
                if (h.correct) conceptTracker[concept].correct++;
            });
        });
        const concepts = Object.entries(conceptTracker || {}).map(([name, data]) => ({
            name, accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0, total: data.total, correct: data.correct,
            mastered: data.total >= 3 && (data.correct / data.total) >= 0.75, struggling: data.total >= 3 && (data.correct / data.total) < 0.5,
        }));
        concepts.sort((a, b) => a.accuracy - b.accuracy);
        const masteredCount = concepts.filter(c => c.mastered).length;
        return { concepts, overallMastery: concepts.length > 0 ? Math.round((masteredCount / concepts.length) * 100) : 0, masteredCount, totalConcepts: concepts.length, weakestConcept: concepts[0] || null, strongestConcept: concepts[concepts.length - 1] || null };
    }

    _identifyHandConcepts(handRecord) {
        const concepts = [];
        const street = (handRecord.street || '').toLowerCase();
        const nodeType = (handRecord.nodeType || '').toLowerCase();
        const action = (handRecord.correctAction || handRecord.action || '').toLowerCase();
        const cat = (handRecord.handCategory || '').toLowerCase();
        if (nodeType.includes('cbet') || nodeType.includes('c-bet')) concepts.push('C-Bet');
        if (nodeType.includes('3bet') || nodeType.includes('3-bet')) concepts.push('3-Bet Pots');
        if (nodeType.includes('check-raise') || nodeType.includes('xr')) concepts.push('Check-Raise');
        if (action.includes('fold') && (nodeType.includes('facing') || nodeType.includes('vs'))) concepts.push('Fold Discipline');
        if (action.includes('call') && street === 'river') concepts.push('River Calling');
        if (action.includes('bet') && street === 'river') concepts.push('River Value');
        if (action.includes('raise')) concepts.push('Aggression');
        if (cat.includes('draw') || cat.includes('flush') || cat.includes('oesd')) concepts.push('Draw Play');
        if (cat.includes('top pair') || cat.includes('overpair')) concepts.push('Strong Made Hands');
        if (cat.includes('air') || cat.includes('no pair')) concepts.push('Bluffing');
        if (street === 'preflop') concepts.push('Preflop Strategy');
        if (nodeType.includes('blind')) concepts.push('Blind Defense');
        if (nodeType.includes('multi') || nodeType.includes('3way')) concepts.push('Multiway Pots');
        return concepts.length > 0 ? concepts : ['General Strategy'];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 276: ADAPTIVE HINT SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    generateHints(frequencies, street, nodeType, handCategory, heroPosition, texture) {
        const hints = [];
        const pos = (heroPosition || '').toUpperCase();
        const cat = (handCategory || '').toLowerCase();
        if (pos === 'BTN' || pos === 'CO') hints.push('You\'re in a late position — this gives you an information advantage.');
        else if (pos === 'SB' || pos === 'BB') hints.push('Playing from the blinds means you\'ll be OOP on every street. Tighten up.');
        else hints.push('Think about your position relative to the remaining players.');
        if (cat.includes('draw')) hints.push('You have a drawing hand. Consider your outs, pot odds, and fold equity.');
        else if (cat.includes('top pair') || cat.includes('overpair')) hints.push('You have a strong made hand. Think about sizing for value while protecting against draws.');
        else if (cat.includes('air') || cat.includes('no pair')) hints.push('You have no made hand. Do you have any fold equity or blockers?');
        else hints.push('Evaluate your hand\'s strength relative to the board texture.');
        if (frequencies) {
            const entries = Object.entries(frequencies || {}).sort((a, b) => b[1] - a[1]);
            if (entries.length > 0) {
                const topFreq = entries[0][1];
                if (topFreq > 80) hints.push('The solver has a very strong preference here (>80% for one action).');
                else if (topFreq > 50) hints.push('The solver slightly favors one action, but there\'s a mix.');
                else hints.push('This is a mixed spot — multiple actions are viable.');
                const topAction = entries[0][0];
                const actionType = topAction.includes('bet') || topAction.includes('raise') ? 'aggressive' : topAction.includes('check') ? 'passive' : topAction.includes('fold') ? 'defensive' : 'standard';
                hints.push(`The solver leans toward a ${actionType} approach in this spot.`);
            }
        }
        return { hints, currentLevel: 0, maxLevel: hints.length - 1 };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 277: BOARD RUNOUT IMPACT PREVIEW
    // ═══════════════════════════════════════════════════════════════════════════

    getRunoutImpactPreview(handCategory, street, correctAction, boardTexture) {
        if (street === 'river') return null;
        const cat = (handCategory || '').toLowerCase();
        const runouts = [];
        if (street === 'flop' || street === 'turn') {
            runouts.push({ type: 'Flush Card', card: '♠♣♥♦', impact: cat.includes('flush draw') ? 'positive' : cat.includes('set') || cat.includes('two pair') ? 'negative' : 'neutral',
                strategyChange: cat.includes('flush draw') ? 'Your draw completes — shift to value betting.' : 'Board gets wetter — check more, bet less.' });
            runouts.push({ type: 'Connected Card', card: '5-9', impact: cat.includes('oesd') || cat.includes('open ended') ? 'positive' : 'negative',
                strategyChange: cat.includes('oesd') ? 'Draw completes — value bet your straight.' : 'More straights possible — tighten your range.' });
            runouts.push({ type: 'Overcard (A/K)', card: 'A♠/K♠', impact: cat.includes('overpair') ? 'neutral' : cat.includes('top pair') ? 'negative' : 'varies',
                strategyChange: cat.includes('top pair') ? 'An overcard hits — your top pair is no longer top pair. Check more.' : 'New high card changes range dynamics — re-evaluate.' });
            runouts.push({ type: 'Board Pairs', card: 'Paired', impact: cat.includes('trips') || cat.includes('set') ? 'positive' : 'neutral',
                strategyChange: 'Board pairing favors the pre-flop aggressor. Full houses now possible.' });
            runouts.push({ type: 'Brick (Low Card)', card: '2♣/3♦', impact: cat.includes('pair') ? 'positive' : 'neutral',
                strategyChange: 'Low brick changes little — ranges remain similar. Continue your plan.' });
        }
        return { runouts, street, nextStreet: street === 'flop' ? 'Turn' : 'River' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 278: FREQUENCY PRACTICE MODE DATA
    // ═══════════════════════════════════════════════════════════════════════════

    getMixedFrequencyDrillData() {
        if (!this._sessionStats || !this._sessionStats.history) return { mixedSpots: [], needsPractice: false };
        const freqTracker = {};
        (this._sessionStats.history || []).forEach(h => {
            if (!h.frequencies) return;
            const entries = Object.entries(h.frequencies || {});
            const maxFreq = Math.max(...entries.map(([_, f]) => f));
            if (maxFreq < 80 && maxFreq > 20) {
                const key = `${h.street || 'flop'}_${h.nodeType || 'general'}`;
                if (!freqTracker[key]) freqTracker[key] = { targetFreqs: {}, userActions: [], total: 0 };
                freqTracker[key].total++;
                freqTracker[key].userActions.push((h.action || h.selectedAction || '').toLowerCase());
                entries.forEach(([act, freq]) => {
                    if (!freqTracker[key].targetFreqs[act]) freqTracker[key].targetFreqs[act] = [];
                    freqTracker[key].targetFreqs[act].push(freq);
                });
            }
        });
        const mixedSpots = [];
        Object.entries(freqTracker || {}).forEach(([key, data]) => {
            if (data.total < 2) return;
            Object.entries(data.targetFreqs || {}).forEach(([action, freqs]) => {
                const avgTarget = freqs.reduce((s, v) => s + v, 0) / freqs.length;
                const userCount = data.userActions.filter(a => a.includes(action.toLowerCase())).length;
                const userFreq = (userCount / data.total) * 100;
                const deviation = Math.abs(userFreq - avgTarget);
                if (deviation > 10) mixedSpots.push({ spot: key, action, targetFreq: Math.round(avgTarget), userFreq: Math.round(userFreq), deviation: Math.round(deviation), sampleSize: data.total });
            });
        });
        mixedSpots.sort((a, b) => b.deviation - a.deviation);
        return { mixedSpots: mixedSpots.slice(0, 10), needsPractice: mixedSpots.length > 3, totalMixedSpots: Object.keys(freqTracker || {}).length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 279: HAND CATEGORY PERFORMANCE BREAKDOWN
    // ═══════════════════════════════════════════════════════════════════════════

    getHandCategoryBreakdown() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 3) return { categories: [], message: 'Need more hands for category breakdown.' };
        const categoryMap = {};
        this._sessionStats.history.forEach(h => {
            const rawCat = (h.handCategory || h.category || 'Unknown').toLowerCase();
            let normCat = 'Other';
            if (rawCat.includes('premium') || rawCat.includes('nut') || rawCat.includes('set') || rawCat.includes('full house')) normCat = 'Premium Hands';
            else if (rawCat.includes('overpair') || rawCat.includes('top pair')) normCat = 'Top Pair+';
            else if (rawCat.includes('middle pair') || rawCat.includes('second pair') || rawCat.includes('underpair')) normCat = 'Medium Pairs';
            else if (rawCat.includes('draw') || rawCat.includes('flush') || rawCat.includes('oesd') || rawCat.includes('straight draw')) normCat = 'Draws';
            else if (rawCat.includes('air') || rawCat.includes('no pair') || rawCat.includes('overcards') || rawCat.includes('high card')) normCat = 'Air/Bluffs';
            else if (rawCat.includes('pair')) normCat = 'Small Pairs';
            if (!categoryMap[normCat]) categoryMap[normCat] = { correct: 0, total: 0, evLoss: 0 };
            categoryMap[normCat].total++;
            if (h.correct) categoryMap[normCat].correct++;
            categoryMap[normCat].evLoss += (h.evLoss || 0);
        });
        const categories = Object.entries(categoryMap || {}).map(([name, data]) => ({
            name, total: data.total, correct: data.correct, accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0, evLoss: Math.round(data.evLoss * 100) / 100,
        }));
        categories.sort((a, b) => a.accuracy - b.accuracy);
        return { categories, weakestCategory: categories[0] || null, strongestCategory: categories[categories.length - 1] || null };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 280: SESSION COMPARISON
    // ═══════════════════════════════════════════════════════════════════════════

    getSessionComparison(previousSessionData = null) {
        const current = {
            accuracy: this._sessionStats?.total > 0 ? Math.round((this._sessionStats.correct / this._sessionStats.total) * 100) : 0,
            total: this._sessionStats?.total || 0, correct: this._sessionStats?.correct || 0,
            streak: this._sessionBests?.streak || 0, evLoss: 0,
        };
        if (this._sessionStats?.history) { current.evLoss = Math.round(this._sessionStats.history.reduce((sum, h) => sum + (h.evLoss || 0), 0) * 100) / 100; }
        const baseline = previousSessionData || { accuracy: 60, total: 25, correct: 15, streak: 3, evLoss: 8.5, label: 'Average Player' };
        const improvements = [], regressions = [];
        if (current.accuracy > baseline.accuracy) improvements.push({ metric: 'Accuracy', current: current.accuracy + '%', baseline: baseline.accuracy + '%', delta: '+' + (current.accuracy - baseline.accuracy) + '%' });
        else if (current.accuracy < baseline.accuracy) regressions.push({ metric: 'Accuracy', current: current.accuracy + '%', baseline: baseline.accuracy + '%', delta: (current.accuracy - baseline.accuracy) + '%' });
        if (current.streak > baseline.streak) improvements.push({ metric: 'Best Streak', current: current.streak, baseline: baseline.streak, delta: '+' + (current.streak - baseline.streak) });
        if (current.total > 0 && current.evLoss / current.total < baseline.evLoss / baseline.total) improvements.push({ metric: 'EV Loss/Hand', current: (current.evLoss / current.total).toFixed(2) + ' BB', baseline: (baseline.evLoss / baseline.total).toFixed(2) + ' BB', delta: 'Better' });
        else if (current.total > 0) regressions.push({ metric: 'EV Loss/Hand', current: (current.evLoss / current.total).toFixed(2) + ' BB', baseline: (baseline.evLoss / baseline.total).toFixed(2) + ' BB', delta: 'Worse' });
        return { current, baseline, improvements, regressions };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 281: PRE-DECISION HAND PREVIEW
    // ═══════════════════════════════════════════════════════════════════════════

    getPreDecisionPreview(handCategory, street, nodeType, heroPosition, frequencies) {
        const strength = this.classifyHandStrength(handCategory, null, street);
        const equity = this.estimateEquityVsRange(handCategory, street, nodeType, heroPosition, '');
        let spotType = 'standard';
        if (frequencies) {
            const vals = Object.values(frequencies || {});
            const maxF = Math.max(...vals);
            if (maxF > 80) spotType = 'clear';
            else if (maxF < 40) spotType = 'complex_mix';
            else spotType = 'moderate_mix';
        }
        return { handStrength: strength, equity, spotType, spotTypeLabel: spotType === 'clear' ? 'Clear Decision' : spotType === 'complex_mix' ? 'Complex Mixed Spot' : 'Moderate Mix' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 282: RUNNING ACTION FREQUENCY TRACKER
    // ═══════════════════════════════════════════════════════════════════════════

    getRunningActionFrequencies() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 2) return null;
        const actionCounts = {};
        const solverCounts = {};
        let total = 0;
        this._sessionStats.history.forEach(h => {
            const userAct = this._normalizeActionCategory(h.action || h.selectedAction || '');
            const solverAct = this._normalizeActionCategory(h.correctAction || '');
            if (!userAct) return;
            total++;
            actionCounts[userAct] = (actionCounts[userAct] || 0) + 1;
            if (solverAct) solverCounts[solverAct] = (solverCounts[solverAct] || 0) + 1;
        });
        if (total < 2) return null;
        const allActions = [...new Set([...Object.keys(actionCounts || {}), ...Object.keys(solverCounts || {})])];
        const frequencies = allActions.map(action => ({
            action, userFreq: Math.round(((actionCounts[action] || 0) / total) * 100), solverFreq: Math.round(((solverCounts[action] || 0) / total) * 100),
            deviation: Math.round(((actionCounts[action] || 0) / total - (solverCounts[action] || 0) / total) * 100),
        }));
        frequencies.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
        return { frequencies, totalHands: total, biggestLeak: frequencies[0] || null };
    }

    _normalizeActionCategory(action) {
        const a = (action || '').toLowerCase();
        if (a.includes('fold')) return 'Fold';
        if (a.includes('check')) return 'Check';
        if (a.includes('call')) return 'Call';
        if (a.includes('raise') || a.includes('3-bet') || a.includes('4-bet')) return 'Raise';
        if (a.includes('bet') || a.includes('pot') || a.includes('overbet')) return 'Bet';
        if (a.includes('all-in') || a.includes('push') || a.includes('allin')) return 'All-In';
        return a ? 'Other' : '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 283: MISTAKE CLUSTERING
    // ═══════════════════════════════════════════════════════════════════════════

    getMistakeClusters() {
        if (!this._sessionStats?.history) return { clusters: [], totalMistakes: 0 };
        const mistakes = this._sessionStats.history.filter(h => !h.correct);
        if (mistakes.length < 2) return { clusters: [], totalMistakes: mistakes.length };
        const clusterMap = {};
        mistakes.forEach(m => {
            const street = (m.street || 'unknown').toLowerCase();
            const node = (m.nodeType || 'general').toLowerCase();
            const userAct = this._normalizeActionCategory(m.action || m.selectedAction || '');
            const solverAct = this._normalizeActionCategory(m.correctAction || '');
            const key = `${street}_${userAct}_instead_of_${solverAct}`;
            if (!clusterMap[key]) clusterMap[key] = { street, userAction: userAct, solverAction: solverAct, count: 0, nodeTypes: [], evLoss: 0 };
            clusterMap[key].count++;
            clusterMap[key].evLoss += (m.evLoss || 0);
            if (!clusterMap[key].nodeTypes.includes(node)) clusterMap[key].nodeTypes.push(node);
        });
        const clusters = Object.values(clusterMap || {}).map(c => ({
            ...c, evLoss: Math.round(c.evLoss * 100) / 100,
            description: `${c.street}: You ${c.userAction.toLowerCase()} instead of ${c.solverAction.toLowerCase()} (${c.count}x, -${c.evLoss.toFixed(2)} BB)`,
            severity: c.count >= 3 ? 'critical' : c.count >= 2 ? 'high' : 'medium',
        }));
        clusters.sort((a, b) => b.count - a.count);
        return { clusters: clusters.slice(0, 8), totalMistakes: mistakes.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 284: BOARD COVERAGE ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getBoardCoverageAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const textureMap = { dry: { total: 0, correct: 0 }, wet: { total: 0, correct: 0 }, monotone: { total: 0, correct: 0 }, paired: { total: 0, correct: 0 }, disconnected: { total: 0, correct: 0 }, connected: { total: 0, correct: 0 } };
        this._sessionStats.history.forEach(h => {
            const tex = (h.texture || h.boardTexture || '').toLowerCase();
            if (tex.includes('dry') || tex.includes('rainbow')) { textureMap.dry.total++; if (h.correct) textureMap.dry.correct++; }
            if (tex.includes('wet') || tex.includes('draw')) { textureMap.wet.total++; if (h.correct) textureMap.wet.correct++; }
            if (tex.includes('monotone') || tex.includes('flush')) { textureMap.monotone.total++; if (h.correct) textureMap.monotone.correct++; }
            if (tex.includes('paired') || tex.includes('pair')) { textureMap.paired.total++; if (h.correct) textureMap.paired.correct++; }
            if (tex.includes('connected') || tex.includes('straight')) { textureMap.connected.total++; if (h.correct) textureMap.connected.correct++; }
            if (tex.includes('disconnected') || tex.includes('rainbow')) { textureMap.disconnected.total++; if (h.correct) textureMap.disconnected.correct++; }
        });
        const textures = Object.entries(textureMap || {}).filter(([_, d]) => d.total > 0).map(([name, data]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1), total: data.total, correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        }));
        textures.sort((a, b) => a.accuracy - b.accuracy);
        return { textures, weakestTexture: textures[0] || null, strongestTexture: textures[textures.length - 1] || null };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 285: BLUFF-TO-VALUE RATIO
    // ═══════════════════════════════════════════════════════════════════════════

    getBluffToValueRatio() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        let userBluffs = 0, userValue = 0, solverBluffs = 0, solverValue = 0;
        this._sessionStats.history.forEach(h => {
            const cat = (h.handCategory || '').toLowerCase();
            const userAct = (h.action || h.selectedAction || '').toLowerCase();
            const solverAct = (h.correctAction || '').toLowerCase();
            const isAggressive = a => a.includes('bet') || a.includes('raise') || a.includes('all-in');
            const isBluffHand = cat.includes('air') || cat.includes('no pair') || cat.includes('missed') || cat.includes('gutshot') || cat.includes('backdoor');
            if (isAggressive(userAct)) { if (isBluffHand) userBluffs++; else userValue++; }
            if (isAggressive(solverAct)) { if (isBluffHand) solverBluffs++; else solverValue++; }
        });
        const userTotal = userBluffs + userValue;
        const solverTotal = solverBluffs + solverValue;
        const userRatio = userTotal > 0 ? Math.round((userBluffs / userTotal) * 100) : 0;
        const solverRatio = solverTotal > 0 ? Math.round((solverBluffs / solverTotal) * 100) : 0;
        let assessment = 'balanced';
        if (userRatio > solverRatio + 15) assessment = 'over_bluffing';
        else if (userRatio < solverRatio - 15) assessment = 'under_bluffing';
        return { userBluffPct: userRatio, solverBluffPct: solverRatio, userBluffs, userValue, solverBluffs, solverValue, assessment,
            message: assessment === 'over_bluffing' ? 'You\'re bluffing too often — tighten your aggression range.' : assessment === 'under_bluffing' ? 'You\'re not bluffing enough — add more semi-bluffs to stay balanced.' : 'Your bluff-to-value ratio is well-balanced.' };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 286: EV LOSS HEATMAP DATA
    // ═══════════════════════════════════════════════════════════════════════════

    getEVLossHeatmap() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 3) return null;
        const grid = {};
        const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
        const streets = ['preflop', 'flop', 'turn', 'river'];
        positions.forEach(p => { grid[p] = {}; streets.forEach(s => { grid[p][s] = { evLoss: 0, hands: 0 }; }); });
        this._sessionStats.history.forEach(h => {
            const pos = (h.heroPosition || h.position || 'MP').toUpperCase();
            const st = (h.street || 'flop').toLowerCase();
            const normPos = positions.includes(pos) ? pos : 'MP';
            const normSt = streets.includes(st) ? st : 'flop';
            grid[normPos][normSt].evLoss += (h.evLoss || 0);
            grid[normPos][normSt].hands++;
        });
        const cells = [];
        let maxLoss = 0;
        positions.forEach(p => { streets.forEach(s => {
            const cell = grid[p][s];
            const avg = cell.hands > 0 ? cell.evLoss / cell.hands : 0;
            if (avg > maxLoss) maxLoss = avg;
            cells.push({ position: p, street: s, totalEVLoss: Math.round(cell.evLoss * 100) / 100, hands: cell.hands, avgEVLoss: Math.round(avg * 100) / 100 });
        }); });
        cells.forEach(c => { c.intensity = maxLoss > 0 ? Math.min(1, c.avgEVLoss / maxLoss) : 0; });
        return { cells, positions, streets, maxLoss: Math.round(maxLoss * 100) / 100 };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 287: QUICK-FIRE REVIEW MODE
    // ═══════════════════════════════════════════════════════════════════════════

    getQuickFireReviewCards() {
        if (!this._sessionStats?.history) return [];
        const mistakes = this._sessionStats.history.filter(h => !h.correct);
        return mistakes.map((m, i) => ({
            index: i + 1,
            street: m.street || 'flop',
            position: m.heroPosition || m.position || '?',
            handCategory: m.handCategory || 'Unknown',
            userAction: m.action || m.selectedAction || '?',
            solverAction: m.correctAction || '?',
            evLoss: Math.round((m.evLoss || 0) * 100) / 100,
            keyTakeaway: m.takeaway || `Should have ${(m.correctAction || '').toLowerCase()} instead of ${(m.action || m.selectedAction || '').toLowerCase()}.`,
            nodeType: m.nodeType || '',
        }));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 288: SOLVER FREQUENCY QUIZ DATA
    // ═══════════════════════════════════════════════════════════════════════════

    generateFrequencyQuizQuestion() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const handsWithFreqs = this._sessionStats.history.filter(h => h.frequencies && Object.keys(h.frequencies || {}).length >= 2);
        if (handsWithFreqs.length === 0) return null;
        const hand = handsWithFreqs[Math.floor(Math.random() * handsWithFreqs.length)];
        const entries = Object.entries(hand.frequencies || {}).sort((a, b) => b[1] - a[1]);
        const topAction = entries[0][0];
        const topFreq = entries[0][1];
        return {
            question: `In this ${(hand.street || 'flop')} spot (${hand.nodeType || 'standard'}), what % does the solver ${topAction}?`,
            correctAnswer: Math.round(topFreq),
            tolerance: 10,
            handCategory: hand.handCategory || 'Unknown',
            street: hand.street || 'flop',
            allFrequencies: hand.frequencies,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 289: POSITION LEADERBOARD
    // ═══════════════════════════════════════════════════════════════════════════

    getPositionLeaderboard() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 3) return null;
        const posMap = {};
        this._sessionStats.history.forEach(h => {
            const pos = (h.heroPosition || h.position || 'MP').toUpperCase();
            if (!posMap[pos]) posMap[pos] = { correct: 0, total: 0, evLoss: 0 };
            posMap[pos].total++;
            if (h.correct) posMap[pos].correct++;
            posMap[pos].evLoss += (h.evLoss || 0);
        });
        const leaderboard = Object.entries(posMap || {}).map(([pos, data]) => ({
            position: pos, total: data.total, correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            evLoss: Math.round(data.evLoss * 100) / 100,
            grade: data.total >= 3 && data.correct / data.total >= 0.8 ? 'A' : data.correct / data.total >= 0.6 ? 'B' : data.correct / data.total >= 0.4 ? 'C' : 'D',
        }));
        leaderboard.sort((a, b) => b.accuracy - a.accuracy);
        return { leaderboard, bestPosition: leaderboard[0] || null, worstPosition: leaderboard[leaderboard.length - 1] || null };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 290: COACHING SUMMARY GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    generateCoachingSummary() {
        const stats = this._sessionStats;
        if (!stats || stats.total < 5) return { summary: 'Complete more hands for a coaching summary.', tips: [] };
        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        const tips = [];
        const parts = [];
        // Overall assessment
        if (accuracy >= 80) parts.push(`Excellent session — ${accuracy}% accuracy shows strong GTO understanding.`);
        else if (accuracy >= 65) parts.push(`Solid session at ${accuracy}% accuracy. A few key spots to review.`);
        else if (accuracy >= 50) parts.push(`Average session at ${accuracy}% accuracy. Multiple areas need work.`);
        else parts.push(`Tough session at ${accuracy}% accuracy. Focus on fundamentals.`);
        // Leak analysis
        try {
            const leaks = this.generateLeakReport();
            if (leaks?.leaks?.length > 0) {
                const topLeak = leaks.leaks[0];
                parts.push(`Biggest leak: ${topLeak.title} (${topLeak.severity}).`);
                tips.push(topLeak.fix);
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        // Position insight
        try {
            const posLB = this.getPositionLeaderboard();
            if (posLB?.worstPosition && posLB.worstPosition.accuracy < 50) {
                parts.push(`Weakest position: ${posLB.worstPosition.position} at ${posLB.worstPosition.accuracy}%.`);
                tips.push(`Focus on ${posLB.worstPosition.position} strategy — study solver ranges for this seat.`);
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        // Bluff ratio
        try {
            const bvr = this.getBluffToValueRatio();
            if (bvr && bvr.assessment !== 'balanced') {
                parts.push(bvr.message);
                if (bvr.assessment === 'over_bluffing') tips.push('Cut marginal bluffs — focus on hands with good blockers.');
                else tips.push('Add more semi-bluffs with draws and backdoor equity.');
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        // Improvement velocity
        try {
            const vel = this.getImprovementVelocity();
            if (vel && vel.trend !== 'INSUFFICIENT_DATA') {
                if (vel.trend.includes('IMPROV')) parts.push('Your accuracy improved as the session went on — good mental stamina.');
                else if (vel.trend.includes('DECLIN')) { parts.push('Accuracy declined later in the session — consider shorter sessions.'); tips.push('Try 15-hand sessions to stay sharp.'); }
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        return { summary: parts.join(' '), tips: tips.slice(0, 5), accuracy, totalHands: stats.total };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 291: STREAK PATTERN ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getStreakAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        let currentStreak = 0;
        let currentStreakType = null;
        let longestWin = 0;
        let longestLoss = 0;
        let tempStreak = 0;
        let tempType = null;
        const streakBreakers = { afterWinStreak: [], afterLossStreak: [] };

        for (let i = 0; i < history.length; i++) {
            const isCorrect = history[i].correct;
            if (tempType === null) {
                tempType = isCorrect ? 'win' : 'loss';
                tempStreak = 1;
            } else if ((isCorrect && tempType === 'win') || (!isCorrect && tempType === 'loss')) {
                tempStreak++;
            } else {
                // Streak broke
                if (tempType === 'win' && tempStreak >= 3) {
                    longestWin = Math.max(longestWin, tempStreak);
                    streakBreakers.afterWinStreak.push({
                        street: history[i].street || 'unknown',
                        position: history[i].heroPosition || history[i].position || 'unknown',
                        action: history[i].selectedAction || 'unknown',
                    });
                } else if (tempType === 'loss' && tempStreak >= 3) {
                    longestLoss = Math.max(longestLoss, tempStreak);
                    streakBreakers.afterLossStreak.push({
                        street: history[i].street || 'unknown',
                        position: history[i].heroPosition || history[i].position || 'unknown',
                    });
                }
                tempType = isCorrect ? 'win' : 'loss';
                tempStreak = 1;
            }
        }
        // Final streak
        if (tempType === 'win') longestWin = Math.max(longestWin, tempStreak);
        else if (tempType === 'loss') longestLoss = Math.max(longestLoss, tempStreak);

        const lastResult = history[history.length - 1]?.correct;
        currentStreakType = lastResult ? 'win' : 'loss';
        currentStreak = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].correct === lastResult) currentStreak++;
            else break;
        }

        // Pattern: do mistakes cluster after certain events?
        let tiltAfterMistake = 0;
        let recoveryAfterMistake = 0;
        for (let i = 1; i < history.length; i++) {
            if (!history[i - 1].correct) {
                if (!history[i].correct) tiltAfterMistake++;
                else recoveryAfterMistake++;
            }
        }
        const tiltResistance = (tiltAfterMistake + recoveryAfterMistake) > 0
            ? Math.round((recoveryAfterMistake / (tiltAfterMistake + recoveryAfterMistake)) * 100)
            : 100;

        return {
            currentStreak,
            currentStreakType,
            longestWinStreak: longestWin,
            longestLossStreak: longestLoss,
            tiltResistance,
            tiltAfterMistake,
            recoveryAfterMistake,
            streakBreakers,
            insight: tiltResistance >= 70
                ? 'Strong mental game — you recover well after mistakes.'
                : tiltResistance >= 50
                    ? 'Moderate tilt resistance — some cascade errors after mistakes.'
                    : 'Watch for tilt — mistakes tend to cluster. Take a breath after errors.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 292: DECISION SPEED ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getTimePressureAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        // Simulate time via hand index proximity (we don't track real time)
        // Instead, analyze if accuracy degrades over session length (fatigue proxy)
        const totalHands = history.length;
        const firstThird = history.slice(0, Math.floor(totalHands / 3));
        const middleThird = history.slice(Math.floor(totalHands / 3), Math.floor(2 * totalHands / 3));
        const lastThird = history.slice(Math.floor(2 * totalHands / 3));

        const calcAcc = (arr) => arr.length > 0 ? Math.round((arr.filter(h => h.correct).length / arr.length) * 100) : 0;

        const earlyAcc = calcAcc(firstThird);
        const midAcc = calcAcc(middleThird);
        const lateAcc = calcAcc(lastThird);

        const fatigueDropoff = earlyAcc - lateAcc;
        let staminaRating;
        if (fatigueDropoff <= 5) staminaRating = 'Excellent';
        else if (fatigueDropoff <= 15) staminaRating = 'Good';
        else if (fatigueDropoff <= 25) staminaRating = 'Fair';
        else staminaRating = 'Poor';

        // Check if complex spots (multi-street, 3bet pots) have worse accuracy
        const complexSpots = history.filter(h => {
            const node = (h.nodeType || '').toLowerCase();
            return node.includes('3bet') || node.includes('4bet') || node.includes('squeeze');
        });
        const simpleSpots = history.filter(h => {
            const node = (h.nodeType || '').toLowerCase();
            return !node.includes('3bet') && !node.includes('4bet') && !node.includes('squeeze');
        });

        return {
            earlyAccuracy: earlyAcc,
            midAccuracy: midAcc,
            lateAccuracy: lateAcc,
            fatigueDropoff,
            staminaRating,
            complexSpotAccuracy: calcAcc(complexSpots),
            simpleSpotAccuracy: calcAcc(simpleSpots),
            totalHands,
            recommendation: fatigueDropoff > 20
                ? 'Your accuracy drops significantly later in sessions. Consider 15-20 hand sessions.'
                : fatigueDropoff > 10
                    ? 'Mild fatigue detected. A short break every 20 hands could help.'
                    : 'Great mental stamina — your accuracy holds well throughout the session.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 293: RANGE CONSTRUCTION DRILL
    // ═══════════════════════════════════════════════════════════════════════════

    getRangeConstructionDrill(heroPosition = 'CO', nodeType = 'open') {
        const OPEN_RANGES = {
            UTG: { hands: 15, top: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo', 'AJs', 'KQs'], description: 'UTG opens ~15% — premium pairs + strong broadways' },
            MP: { hands: 18, top: ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', 'AKs', 'AQs', 'AJs', 'AKo', 'KQs', 'AQo'], description: 'MP opens ~18% — add 99, more broadways' },
            CO: { hands: 27, top: ['AA-77', 'AKs-A2s', 'KQs-KTs', 'QJs-QTs', 'JTs', 'AKo-ATo', 'KQo', 'KJo'], description: 'CO opens ~27% — wide but structured' },
            BTN: { hands: 42, top: ['AA-22', 'AKs-A2s', 'KQs-K5s', 'QJs-Q8s', 'JTs-J8s', 'T9s-T8s', 'AKo-A7o', 'KQo-KTo', 'QJo-QTo'], description: 'BTN opens ~42% — very wide, all pairs + suited connectors' },
            SB: { hands: 36, top: ['AA-22', 'AKs-A2s', 'KQs-K7s', 'QJs-Q9s', 'JTs-J9s', 'T9s', 'AKo-A8o', 'KQo-KJo'], description: 'SB opens ~36% vs BB only' },
        };

        const _3BET_RANGES = {
            'vs_UTG': { hands: 6, top: ['AA', 'KK', 'QQ', 'AKs', 'AKo'], description: '3-Bet vs UTG: ~6% — only premiums' },
            'vs_MP': { hands: 8, top: ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo', 'AQs'], description: '3-Bet vs MP: ~8% — add JJ, AQs' },
            'vs_CO': { hands: 11, top: ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo', 'A5s-A4s', 'KQs'], description: '3-Bet vs CO: ~11% — value + blockers' },
            'vs_BTN': { hands: 14, top: ['AA-88', 'AKs-ATs', 'AKo-AJo', 'KQs', 'A5s-A2s'], description: '3-Bet from blinds vs BTN: ~14% — wider value + bluffs' },
        };

        const rangeSet = nodeType === 'open' ? OPEN_RANGES : _3BET_RANGES;
        const key = nodeType === 'open' ? heroPosition.toUpperCase() : `vs_${heroPosition.toUpperCase()}`;
        const range = rangeSet[key] || rangeSet[Object.keys(rangeSet || {})[0]];

        // Generate a quiz-style question
        const allHands = ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A5s', 'A4s', 'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', 'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'KQo', 'KJo', 'QJo', '98s', '87s', '76s', '65s'];
        const testHand = allHands[Math.floor(this._deterministicSeed() * allHands.length) % allHands.length];
        const isInRange = range.top.some(h => {
            if (h.includes('-')) return true; // Simplified — range notation
            return h === testHand;
        });

        return {
            position: heroPosition,
            nodeType,
            rangeSize: range.hands,
            description: range.description,
            keyHands: range.top,
            quizHand: testHand,
            quizAnswer: isInRange ? 'in_range' : 'borderline',
            tip: `The solver ${nodeType === 'open' ? 'opens' : '3-bets'} about ${range.hands}% of hands from ${heroPosition}. Memorize the top of this range first, then expand.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 294: EXPLOITATIVE ADJUSTMENT SUGGESTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    getExploitativeAdjustments() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;
        const adjustments = [];

        // Analyze user tendencies to suggest exploitative counter-adjustments
        let foldCount = 0, callCount = 0, raiseCount = 0, totalActions = 0;
        history.forEach(h => {
            const action = (h.selectedAction || '').toLowerCase();
            totalActions++;
            if (action.includes('fold')) foldCount++;
            else if (action.includes('call')) callCount++;
            else if (action.includes('raise') || action.includes('bet') || action.includes('all')) raiseCount++;
        });

        const foldPct = Math.round((foldCount / totalActions) * 100);
        const callPct = Math.round((callCount / totalActions) * 100);
        const raisePct = Math.round((raiseCount / totalActions) * 100);

        // Over-folding exploit
        if (foldPct > 40) {
            adjustments.push({
                type: 'exploit_overfold',
                title: 'You fold too much',
                description: `Folding ${foldPct}% of the time. Villains should bluff you more.`,
                fix: 'Defend wider — call with more marginal hands, especially in position.',
                severity: foldPct > 55 ? 'critical' : 'moderate',
            });
        }

        // Over-calling exploit
        if (callPct > 45) {
            adjustments.push({
                type: 'exploit_overcall',
                title: 'You call too much',
                description: `Calling ${callPct}% of the time. Villains should value-bet thinner against you.`,
                fix: 'Convert some calls to raises (for value or as bluffs). Fold more weak draws.',
                severity: callPct > 55 ? 'critical' : 'moderate',
            });
        }

        // Under-aggressing exploit
        if (raisePct < 25) {
            adjustments.push({
                type: 'exploit_passive',
                title: 'Not aggressive enough',
                description: `Only raising/betting ${raisePct}% — too passive.`,
                fix: 'Add more semi-bluff raises with draws. Bet for value more thinly.',
                severity: raisePct < 15 ? 'critical' : 'moderate',
            });
        }

        // Over-aggressing exploit
        if (raisePct > 55) {
            adjustments.push({
                type: 'exploit_overaggro',
                title: 'Over-aggressive',
                description: `Raising/betting ${raisePct}% — too aggressive for balanced play.`,
                fix: 'Include more checks and calls. Not every hand needs aggression.',
                severity: raisePct > 65 ? 'critical' : 'moderate',
            });
        }

        // Street-specific: check if river accuracy is notably worse
        const riverHands = history.filter(h => (h.street || '').toLowerCase() === 'river');
        const nonRiverHands = history.filter(h => (h.street || '').toLowerCase() !== 'river');
        if (riverHands.length >= 3 && nonRiverHands.length >= 3) {
            const riverAcc = Math.round((riverHands.filter(h => h.correct).length / riverHands.length) * 100);
            const nonRiverAcc = Math.round((nonRiverHands.filter(h => h.correct).length / nonRiverHands.length) * 100);
            if (nonRiverAcc - riverAcc > 20) {
                adjustments.push({
                    type: 'exploit_river_weak',
                    title: 'River play is a leak',
                    description: `River accuracy ${riverAcc}% vs ${nonRiverAcc}% on other streets.`,
                    fix: 'Practice river-specific scenarios. Focus on value betting and bluff-catching frequencies.',
                    severity: 'moderate',
                });
            }
        }

        return {
            adjustments,
            actionProfile: { foldPct, callPct, raisePct },
            totalActions,
            isBalanced: adjustments.length === 0,
            summary: adjustments.length === 0
                ? 'Your action frequencies look balanced — keep it up!'
                : `Found ${adjustments.length} exploitable tendenc${adjustments.length === 1 ? 'y' : 'ies'} in your play.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 295: ICM PRESSURE ANALYSIS (MTT-specific)
    // ═══════════════════════════════════════════════════════════════════════════

    getICMPressureAnalysis(stackSize = 30, avgStack = 30, playersLeft = 9, payoutSpots = 3) {
        const stackRatio = stackSize / avgStack;
        let icmPressure;
        let adjustments = [];

        if (playersLeft <= payoutSpots + 2) {
            // Bubble zone
            icmPressure = 'bubble';
            if (stackRatio > 1.5) {
                adjustments.push({ action: 'Apply pressure', detail: 'You are a big stack near the bubble. Raise wider to exploit ICM pressure on medium stacks.' });
                adjustments.push({ action: 'Target medium stacks', detail: 'Medium stacks (15-25bb) must fold wider near the bubble — attack them.' });
            } else if (stackRatio < 0.7) {
                adjustments.push({ action: 'Tighten up', detail: 'Short stack near the bubble. Only shove premium hands unless forced.' });
                adjustments.push({ action: 'Avoid marginal spots', detail: 'Every chip lost is worth more than every chip won in ICM terms.' });
            } else {
                adjustments.push({ action: 'Play cautiously', detail: 'Medium stack near the bubble — avoid coinflips. Let short stacks bust.' });
            }
        } else if (playersLeft <= payoutSpots * 2) {
            icmPressure = 'approaching_money';
            if (stackRatio < 0.5) {
                adjustments.push({ action: 'Find a spot', detail: 'Short stack — look for a shove spot with any ace, pair, or suited broadway.' });
            } else {
                adjustments.push({ action: 'Standard play', detail: 'Not yet on the bubble. Play close to chip-EV but be aware of stack dynamics.' });
            }
        } else {
            icmPressure = 'early_stage';
            adjustments.push({ action: 'Chip accumulation', detail: 'Far from the money — play for chip EV. Accumulate chips for a deep run.' });
        }

        // Push/fold ranges at various stack depths
        let pushFoldNote = null;
        if (stackSize <= 10) {
            pushFoldNote = 'At 10bb or less, you should be push/fold only. Open-shove or fold — no limping, no min-raising.';
        } else if (stackSize <= 15) {
            pushFoldNote = 'At 11-15bb, your strategy simplifies. Open-shove or raise/fold. Avoid calling 3-bets unless you have a premium.';
        } else if (stackSize <= 25) {
            pushFoldNote = 'At 16-25bb, you can still open-raise, but your 3-bet range should be shove-or-fold.';
        }

        return {
            icmPressure,
            stackRatio: Math.round(stackRatio * 100) / 100,
            stackSize,
            avgStack,
            playersLeft,
            payoutSpots,
            adjustments,
            pushFoldNote,
            summary: `${icmPressure.replace(/_/g, ' ').toUpperCase()} — Stack: ${stackSize}bb (${Math.round(stackRatio * 100)}% of average). ${adjustments[0]?.detail || ''}`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 296: CROSS-GAME-TYPE PERFORMANCE
    // ═══════════════════════════════════════════════════════════════════════════

    getMultiGameTypeStats() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const gameTypes = {};

        history.forEach(h => {
            const nodeType = (h.nodeType || 'unknown').toLowerCase();
            let category;
            if (nodeType.includes('3bet') || nodeType.includes('4bet') || nodeType.includes('squeeze')) category = '3Bet+ Pots';
            else if (nodeType.includes('srp') || nodeType.includes('single')) category = 'Single Raised Pots';
            else if (nodeType.includes('limp')) category = 'Limped Pots';
            else if (nodeType.includes('blind')) category = 'Blind vs Blind';
            else category = 'Other';

            if (!gameTypes[category]) gameTypes[category] = { correct: 0, total: 0, evLoss: 0 };
            gameTypes[category].total++;
            if (h.correct) gameTypes[category].correct++;
            gameTypes[category].evLoss += (h.evLoss || 0);
        });

        const stats = Object.entries(gameTypes || {}).map(([type, data]) => ({
            type,
            total: data.total,
            correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            avgEVLoss: data.total > 0 ? Math.round((data.evLoss / data.total) * 100) / 100 : 0,
        }));
        stats.sort((a, b) => b.total - a.total);

        const weakest = stats.filter(s => s.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0] || null;
        const strongest = stats.filter(s => s.total >= 2).sort((a, b) => b.accuracy - a.accuracy)[0] || null;

        return {
            stats,
            weakestGameType: weakest,
            strongestGameType: strongest,
            totalGameTypes: stats.length,
            recommendation: weakest && weakest.accuracy < 50
                ? `Focus on ${weakest.type} — your ${weakest.accuracy}% accuracy suggests a gap in understanding.`
                : 'Your performance across pot types looks solid.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 297: BET SIZING ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getBettingSizeAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const sizingData = { small: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, large: { correct: 0, total: 0 }, overbet: { correct: 0, total: 0 } };

        history.forEach(h => {
            const action = (h.selectedAction || h.correctAction || '').toLowerCase();
            let sizeCategory = null;
            if (action.includes('25%') || action.includes('33%') || action.includes('1/3') || action.includes('small')) sizeCategory = 'small';
            else if (action.includes('50%') || action.includes('half') || action.includes('1/2') || action.includes('medium')) sizeCategory = 'medium';
            else if (action.includes('66%') || action.includes('75%') || action.includes('2/3') || action.includes('3/4') || action.includes('pot') || action.includes('large')) sizeCategory = 'large';
            else if (action.includes('overbet') || action.includes('150%') || action.includes('200%') || action.includes('all-in') || action.includes('allin') || action.includes('all in')) sizeCategory = 'overbet';

            if (sizeCategory) {
                sizingData[sizeCategory].total++;
                if (h.correct) sizingData[sizeCategory].correct++;
            }
        });

        const analysis = Object.entries(sizingData || {}).map(([size, data]) => ({
            size: size.charAt(0).toUpperCase() + size.slice(1),
            total: data.total,
            correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        })).filter(a => a.total > 0);

        const weakestSize = analysis.sort((a, b) => a.accuracy - b.accuracy)[0] || null;

        return {
            analysis,
            weakestSize,
            tip: weakestSize && weakestSize.accuracy < 60
                ? `Your ${weakestSize.size} sizing spots are at ${weakestSize.accuracy}% accuracy. Review when to use ${weakestSize.size.toLowerCase()} bets.`
                : 'Your sizing accuracy looks solid across all bet sizes.',
            generalTips: [
                'Small bets (25-33%): Use on dry boards with range advantage.',
                'Medium bets (50%): Default on most textures.',
                'Large bets (66-75%): Use on wet/connected boards to deny equity.',
                'Overbets (100%+): Use when your range is polarized and villain\'s is capped.',
            ],
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 298: HAND READING DRILL
    // ═══════════════════════════════════════════════════════════════════════════

    getHandReadingDrill(street = 'flop', villainActions = []) {
        const RANGE_NARROWING = {
            preflop_open: { range: '~20-30%', description: 'Villain opens from middle/late position', combos: '~250-400 combos' },
            preflop_3bet: { range: '~8-12%', description: 'Villain 3-bets', combos: '~100-160 combos' },
            flop_cbet: { range: '~60-70% of pfr range', description: 'Villain c-bets on the flop', removes: 'Weakest air hands that give up' },
            flop_check: { range: '~30-40% of pfr range', description: 'Villain checks back the flop', removes: 'Strong value and best bluffs', keeps: 'Marginal hands, showdown value, traps' },
            turn_barrel: { range: '~40-50% of cbet range', description: 'Villain double-barrels the turn', removes: 'Weak one-and-done bluffs, marginal hands' },
            turn_check: { range: '~50-60% of cbet range', description: 'Villain checks the turn after c-betting', removes: 'Strong value, most bluffs', keeps: 'Medium strength, pot control, traps' },
            river_bet: { range: 'Polarized', description: 'Villain bets the river', composition: 'Strong value hands + bluffs, very few medium hands' },
            river_check: { range: 'Bluff-catchers', description: 'Villain checks the river', composition: 'Medium strength hands that want to see showdown' },
        };

        const actions = villainActions.length > 0
            ? villainActions
            : ['preflop_open', `${street}_cbet`];

        const steps = actions.map(a => RANGE_NARROWING[a] || { range: 'Unknown', description: a });

        return {
            street,
            steps,
            villainActions: actions,
            keyPrinciple: 'Each action a villain takes either widens or narrows their range. Track their range across streets.',
            exercise: `After villain ${actions.map(a => a.replace(/_/g, ' ')).join(', then ')}: What hands are in their range? What hands are NOT?`,
            tips: [
                'Bets remove medium-strength hands from range (polarization)',
                'Checks add medium-strength hands, remove strongest value + bluffs',
                'Multiple barrels = very narrow, strong range',
                'Check-raise = polarized (strong value + draws/bluffs)',
            ],
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 299: VARIANCE SIMULATOR
    // ═══════════════════════════════════════════════════════════════════════════

    getVarianceSimulator(winRate = 65, sampleSize = 100) {
        // Simulate binomial variance for given accuracy rate
        const p = winRate / 100;
        const n = sampleSize;
        const mean = n * p;
        const variance = n * p * (1 - p);
        const stdDev = Math.sqrt(variance);

        // 1 std dev range (68% confidence)
        const low1sd = Math.max(0, Math.round(mean - stdDev));
        const high1sd = Math.min(n, Math.round(mean + stdDev));

        // 2 std dev range (95% confidence)
        const low2sd = Math.max(0, Math.round(mean - 2 * stdDev));
        const high2sd = Math.min(n, Math.round(mean + 2 * stdDev));

        // Simulate 5 "runs" of n hands
        const simulations = [];
        for (let sim = 0; sim < 5; sim++) {
            let correct = 0;
            for (let i = 0; i < n; i++) {
                // Use deterministic seed-based random
                const seed = ((sim * 1000 + i * 7 + 13) * 2654435761) >>> 0;
                if ((seed / 4294967296) < p) correct++;
            }
            simulations.push({
                run: sim + 1,
                correct,
                accuracy: Math.round((correct / n) * 100),
            });
        }

        return {
            trueWinRate: winRate,
            sampleSize: n,
            expectedCorrect: Math.round(mean),
            standardDeviation: Math.round(stdDev * 10) / 10,
            confidence68: { low: low1sd, high: high1sd, lowPct: Math.round(low1sd / n * 100), highPct: Math.round(high1sd / n * 100) },
            confidence95: { low: low2sd, high: high2sd, lowPct: Math.round(low2sd / n * 100), highPct: Math.round(high2sd / n * 100) },
            simulations,
            insight: `With a true ${winRate}% win rate over ${n} hands, you'll see results between ${Math.round(low2sd / n * 100)}% and ${Math.round(high2sd / n * 100)}% roughly 95% of the time. Don't over-react to short-term swings.`,
            keyTakeaway: n < 50
                ? 'Small sample size — results can vary wildly. Don\'t draw conclusions from under 50 hands.'
                : n < 200
                    ? 'Moderate sample — trends are starting to emerge but variance is still significant.'
                    : 'Large sample — your results are becoming statistically meaningful.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 300: PERFORMANCE TREND ANALYSIS (COMPREHENSIVE)
    // ═══════════════════════════════════════════════════════════════════════════

    getPerformanceTrendAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 10) return null;
        const history = this._sessionStats.history;
        const windowSize = Math.max(3, Math.floor(history.length / 5));

        // Rolling accuracy windows
        const windows = [];
        for (let i = 0; i <= history.length - windowSize; i++) {
            const window = history.slice(i, i + windowSize);
            const acc = Math.round((window.filter(h => h.correct).length / window.length) * 100);
            const avgEV = window.reduce((sum, h) => sum + (h.evLoss || 0), 0) / window.length;
            windows.push({
                startIndex: i,
                endIndex: i + windowSize - 1,
                accuracy: acc,
                avgEVLoss: Math.round(avgEV * 100) / 100,
            });
        }

        // Calculate linear trend (simple least squares)
        const n = windows.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        windows.forEach((w, i) => {
            sumX += i;
            sumY += w.accuracy;
            sumXY += i * w.accuracy;
            sumX2 += i * i;
        });
        const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;
        const intercept = n > 0 ? (sumY - slope * sumX) / n : 0;

        // Determine trend
        let trend;
        if (slope > 0.5) trend = 'strongly_improving';
        else if (slope > 0.1) trend = 'slightly_improving';
        else if (slope < -0.5) trend = 'strongly_declining';
        else if (slope < -0.1) trend = 'slightly_declining';
        else trend = 'stable';

        // Peak and trough
        const peakWindow = windows.reduce((best, w) => w.accuracy > best.accuracy ? w : best, windows[0]);
        const troughWindow = windows.reduce((worst, w) => w.accuracy < worst.accuracy ? w : worst, windows[0]);

        // Consistency score (lower std dev = more consistent)
        const avgAcc = sumY / n;
        const varianceAcc = windows.reduce((sum, w) => sum + Math.pow(w.accuracy - avgAcc, 2), 0) / n;
        const consistencyScore = Math.max(0, Math.round(100 - Math.sqrt(varianceAcc)));

        return {
            windows: windows.map((w, i) => ({ ...w, trendLine: Math.round(intercept + slope * i) })),
            trend,
            slope: Math.round(slope * 100) / 100,
            averageAccuracy: Math.round(avgAcc),
            consistencyScore,
            peakAccuracy: peakWindow.accuracy,
            peakAt: `Hands ${peakWindow.startIndex + 1}-${peakWindow.endIndex + 1}`,
            troughAccuracy: troughWindow.accuracy,
            troughAt: `Hands ${troughWindow.startIndex + 1}-${troughWindow.endIndex + 1}`,
            totalHands: history.length,
            windowSize,
            insight: trend === 'strongly_improving'
                ? 'Excellent improvement trend! Your accuracy is climbing steadily.'
                : trend === 'slightly_improving'
                    ? 'Positive trend — you are getting better as the session continues.'
                    : trend === 'stable'
                        ? 'Stable performance — consistency is good. Push for improvement with targeted drills.'
                        : trend === 'slightly_declining'
                            ? 'Mild decline detected — possible fatigue. Consider a break.'
                            : 'Significant accuracy drop — take a break and review your recent mistakes.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 301: OPTIMAL LINE NARRATION
    // ═══════════════════════════════════════════════════════════════════════════

    getOptimalLineNarration(correctAction, frequencies, street, nodeType, heroPosition, handCategory) {
        const freqEntries = frequencies ? Object.entries(frequencies || {}).sort((a, b) => b[1] - a[1]) : [];
        const topAction = freqEntries[0] || [correctAction, 100];
        const secondAction = freqEntries[1] || null;
        const isMixed = secondAction && secondAction[1] >= 15;

        const streetName = (street || 'flop').charAt(0).toUpperCase() + (street || 'flop').slice(1);
        const posLabel = (heroPosition || 'IP').toUpperCase();

        let narration = '';
        if (isMixed) {
            narration = `On the ${streetName} from ${posLabel}, the solver mixes between ${topAction[0]} (${topAction[1]}%) and ${secondAction[0]} (${secondAction[1]}%). `;
            narration += `This mixing occurs because both actions have similar EV. `;
            if (topAction[0].toLowerCase().includes('bet') || topAction[0].toLowerCase().includes('raise')) {
                narration += `The aggressive option builds the pot when you have equity advantage, while the passive option controls pot size.`;
            } else {
                narration += `The passive option protects your checking range, while the aggressive option extracts value or denies equity.`;
            }
        } else {
            narration = `The solver strongly prefers ${correctAction} here (${topAction[1]}%). `;
            const action = correctAction.toLowerCase();
            if (action.includes('fold')) narration += `Your hand doesn't have enough equity to continue profitably in this spot.`;
            else if (action.includes('check') || action.includes('call')) narration += `This is a spot to control the pot and realize equity rather than inflate it.`;
            else if (action.includes('bet') || action.includes('raise')) narration += `You have enough equity and fold equity to justify aggression here.`;
            else if (action.includes('all')) narration += `Stack depth and pot odds make committing all chips the highest-EV play.`;
        }

        return {
            narration,
            correctAction,
            isMixed,
            topActions: freqEntries.slice(0, 3).map(([a, f]) => ({ action: a, frequency: f })),
            street: streetName,
            position: posLabel,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 302: STREET TRANSITION ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getStreetTransitionAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;
        const transitions = { 'flop_to_turn': { correct: 0, total: 0 }, 'turn_to_river': { correct: 0, total: 0 }, 'preflop_to_flop': { correct: 0, total: 0 } };

        // Group hands by their multi-street sequences
        const streetOrder = { preflop: 0, flop: 1, turn: 2, river: 3 };
        let prevStreet = null;
        let prevCorrect = null;

        history.forEach(h => {
            const street = (h.street || 'flop').toLowerCase();
            if (prevStreet !== null) {
                const key = `${prevStreet}_to_${street}`;
                if (transitions[key]) {
                    transitions[key].total++;
                    if (h.correct) transitions[key].correct++;
                }
            }
            prevStreet = street;
            prevCorrect = h.correct;
        });

        const analysis = Object.entries(transitions || {})
            .filter(([_, data]) => data.total >= 2)
            .map(([transition, data]) => ({
                transition: transition.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                total: data.total,
                correct: data.correct,
                accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            }));

        // Check if accuracy drops on later streets
        const streetAcc = {};
        history.forEach(h => {
            const st = (h.street || 'flop').toLowerCase();
            if (!streetAcc[st]) streetAcc[st] = { correct: 0, total: 0 };
            streetAcc[st].total++;
            if (h.correct) streetAcc[st].correct++;
        });

        const streetResults = Object.entries(streetAcc || {}).map(([st, data]) => ({
            street: st.charAt(0).toUpperCase() + st.slice(1),
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            total: data.total,
        })).sort((a, b) => (streetOrder[a.street.toLowerCase()] || 0) - (streetOrder[b.street.toLowerCase()] || 0));

        const weakestStreet = streetResults.filter(s => s.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0] || null;

        return {
            transitions: analysis,
            streetAccuracy: streetResults,
            weakestStreet,
            recommendation: weakestStreet && weakestStreet.accuracy < 50
                ? `Your ${weakestStreet.street} play needs work (${weakestStreet.accuracy}%). Focus on ${weakestStreet.street.toLowerCase()}-specific strategy.`
                : 'Your accuracy across streets is reasonably balanced.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 303: DEFENSE FREQUENCY CHECK
    // ═══════════════════════════════════════════════════════════════════════════

    getDefenseFrequencyCheck() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // When facing bets, how often do we defend (call + raise) vs fold?
        let facingBet = { defend: 0, fold: 0, total: 0 };
        let facingRaise = { defend: 0, fold: 0, total: 0 };

        history.forEach(h => {
            const node = (h.nodeType || '').toLowerCase();
            const action = (h.selectedAction || '').toLowerCase();
            const isFacingAggression = node.includes('facing') || node.includes('vs_bet') || node.includes('vs_raise') ||
                node.includes('check_raise') || action.includes('fold') || action.includes('call');

            if (isFacingAggression) {
                const isFacingRaise = node.includes('raise') || node.includes('3bet') || node.includes('4bet');
                const target = isFacingRaise ? facingRaise : facingBet;
                target.total++;
                if (action.includes('fold')) target.fold++;
                else target.defend++;
            }
        });

        // MDF (Minimum Defense Frequency) is typically ~60-67% vs pot-sized bets
        const betDefendPct = facingBet.total > 0 ? Math.round((facingBet.defend / facingBet.total) * 100) : null;
        const raiseDefendPct = facingRaise.total > 0 ? Math.round((facingRaise.defend / facingRaise.total) * 100) : null;

        const assessments = [];
        if (betDefendPct !== null) {
            if (betDefendPct < 50) assessments.push({ type: 'overfolding_vs_bets', message: `Defending only ${betDefendPct}% vs bets — you are exploitably tight. MDF suggests ~60%+.`, severity: 'critical' });
            else if (betDefendPct < 60) assessments.push({ type: 'slightly_tight_vs_bets', message: `Defending ${betDefendPct}% vs bets — slightly below MDF. Consider widening.`, severity: 'moderate' });
            else if (betDefendPct > 80) assessments.push({ type: 'overdefending_vs_bets', message: `Defending ${betDefendPct}% vs bets — too loose. You can fold more weak hands.`, severity: 'moderate' });
            else assessments.push({ type: 'balanced_vs_bets', message: `Defending ${betDefendPct}% vs bets — well balanced.`, severity: 'good' });
        }

        return {
            facingBet: { ...facingBet, defendPct: betDefendPct },
            facingRaise: { ...facingRaise, defendPct: raiseDefendPct },
            assessments,
            mdfReference: 'MDF = 1 - (bet / (pot + bet)). Vs a pot-sized bet, defend ~50%. Vs 2/3 pot, defend ~60%. Vs 1/3 pot, defend ~75%.',
            isBalanced: assessments.every(a => a.severity === 'good'),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 304: POLARIZATION INDEX
    // ═══════════════════════════════════════════════════════════════════════════

    getPolarizationIndex() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Analyze bet sizing patterns: polarized = big bets/checks, merged = medium bets
        let bigBets = 0, smallBets = 0, checks = 0, mediumBets = 0, totalAggressive = 0;

        history.forEach(h => {
            const action = (h.selectedAction || '').toLowerCase();
            if (action.includes('check') || action.includes('fold')) { checks++; return; }
            if (action.includes('bet') || action.includes('raise') || action.includes('all')) {
                totalAggressive++;
                if (action.includes('all') || action.includes('overbet') || action.includes('150') || action.includes('200') || action.includes('pot') || action.includes('75%')) bigBets++;
                else if (action.includes('25%') || action.includes('33%') || action.includes('1/3') || action.includes('small')) smallBets++;
                else mediumBets++;
            }
        });

        // Polarization = ratio of (big bets + checks) to total actions
        // Highly polarized ranges use big bets or check, rarely medium
        const totalActions = history.length;
        const polarizationScore = totalActions > 0
            ? Math.round(((bigBets + checks) / totalActions) * 100)
            : 50;

        let style, description;
        if (polarizationScore >= 70) {
            style = 'polarized';
            description = 'Your range is highly polarized — you tend to use big bets or check. This is optimal on many board textures.';
        } else if (polarizationScore >= 50) {
            style = 'semi-polarized';
            description = 'Mix of polarized and merged strategies. Generally solid approach.';
        } else {
            style = 'merged';
            description = 'Your range is merged — lots of medium bets. Consider polarizing more on favorable textures.';
        }

        return {
            polarizationScore,
            style,
            description,
            breakdown: { bigBets, mediumBets, smallBets, checks, totalAggressive },
            tip: style === 'merged'
                ? 'On dry boards where you have range advantage, use a polarized strategy: bet big with strong hands and bluffs, check medium hands.'
                : 'Good polarization awareness. Keep adjusting your strategy based on board texture.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 305: MISTAKE RECOVERY RATE
    // ═══════════════════════════════════════════════════════════════════════════

    getMistakeRecoveryRate() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;

        // After each mistake, how many hands to get back to a correct answer?
        const recoveryTimes = [];
        let inMistakeStreak = false;
        let streakLength = 0;

        for (let i = 0; i < history.length; i++) {
            if (!history[i].correct) {
                if (!inMistakeStreak) inMistakeStreak = true;
                streakLength++;
            } else {
                if (inMistakeStreak) {
                    recoveryTimes.push(streakLength);
                    inMistakeStreak = false;
                    streakLength = 0;
                }
            }
        }
        if (inMistakeStreak) recoveryTimes.push(streakLength);

        const avgRecovery = recoveryTimes.length > 0
            ? Math.round((recoveryTimes.reduce((s, v) => s + v, 0) / recoveryTimes.length) * 10) / 10
            : 0;
        const maxRecovery = recoveryTimes.length > 0 ? Math.max(...recoveryTimes) : 0;
        const quickRecoveries = recoveryTimes.filter(r => r === 1).length;
        const prolongedTilts = recoveryTimes.filter(r => r >= 3).length;

        let grade;
        if (avgRecovery <= 1.2) grade = 'A';
        else if (avgRecovery <= 1.8) grade = 'B';
        else if (avgRecovery <= 2.5) grade = 'C';
        else grade = 'D';

        return {
            avgRecoveryTime: avgRecovery,
            maxMistakeStreak: maxRecovery,
            totalMistakeStreaks: recoveryTimes.length,
            quickRecoveries,
            prolongedTilts,
            grade,
            insight: grade === 'A' ? 'Excellent mental recovery — you bounce back quickly after mistakes.'
                : grade === 'B' ? 'Good recovery — occasional short mistake streaks but you reset well.'
                : grade === 'C' ? 'Average recovery — mistakes sometimes cascade. Practice resetting between hands.'
                : 'Tilt-prone — mistakes cluster together. Work on mental game fundamentals.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 306: CONCEPT QUIZ GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    getConceptQuiz() {
        const quizzes = [
            {
                concept: 'Minimum Defense Frequency',
                question: 'Villain bets 2/3 pot. What % of your range should you continue with?',
                answer: '60%',
                explanation: 'MDF = 1 - (bet / (pot + bet)) = 1 - (0.67 / 1.67) = ~60%. You must defend at least 60% to prevent villain from profiting with any two cards.',
            },
            {
                concept: 'Pot Odds',
                question: 'You face a pot-sized bet. What odds are you getting to call?',
                answer: '2:1 (33%)',
                explanation: 'Pot is X, villain bets X. You call X to win 2X+X = 3X. You need X/3X = 33% equity to call profitably.',
            },
            {
                concept: 'Position',
                question: 'Which position has the highest win-rate in 6-max?',
                answer: 'Button (BTN)',
                explanation: 'The Button acts last on every postflop street, giving maximum information advantage. Solvers open widest from BTN (~42%).',
            },
            {
                concept: 'SPR',
                question: 'With 15bb effective stacks and a 6bb pot, what is the SPR?',
                answer: '2.5',
                explanation: 'SPR = Effective Stack / Pot = 15 / 6 = 2.5. Low SPR (<4) means you should be more willing to commit with top pair.',
            },
            {
                concept: 'Blockers',
                question: 'You hold A♠ on a board with 3 spades. Why is this a good bluff blocker?',
                answer: 'You block the nut flush',
                explanation: 'Holding A♠ means villain cannot have the nut flush (A-high flush). This increases the chance they fold to aggression since more of their range is weaker.',
            },
            {
                concept: 'Range Polarization',
                question: 'What does it mean when a range is "polarized"?',
                answer: 'It contains strong value hands and bluffs, but few medium hands',
                explanation: 'A polarized range bets big because it either has the nuts or nothing. Medium hands prefer to check since they have showdown value.',
            },
            {
                concept: 'Equity Denial',
                question: 'Why do you bet with medium-strength hands on wet boards?',
                answer: 'To deny free cards that could improve villain',
                explanation: 'On wet, connected boards, free cards are dangerous. Betting denies villain the free equity they would gain from seeing another card.',
            },
            {
                concept: 'ICM',
                question: 'In a tournament, why is a chip won worth less than a chip lost?',
                answer: 'Due to ICM — your tournament equity diminishes as your stack grows',
                explanation: 'The Independent Chip Model shows that doubling your stack does not double your tournament equity because of the prize structure.',
            },
        ];

        // Pick based on session history for relevance
        const idx = this._sessionStats?.total
            ? (this._sessionStats.total * 7 + 13) % quizzes.length
            : Math.floor(Math.random() * quizzes.length);

        return quizzes[idx];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 307: SESSION MILESTONES
    // ═══════════════════════════════════════════════════════════════════════════

    getSessionMilestones() {
        if (!this._sessionStats) return [];
        const stats = this._sessionStats;
        const milestones = [];

        if (stats.total >= 5) milestones.push({ id: 'warmup', label: 'Warm Up', description: '5 hands completed', achieved: true, icon: '▲'});
        if (stats.total >= 10) milestones.push({ id: 'focused', label: 'Focused', description: '10 hands completed', achieved: true, icon: ''});
        if (stats.total >= 25) milestones.push({ id: 'grinder', label: 'Grinder', description: '25 hands completed', achieved: true, icon: ''});
        if (stats.total >= 50) milestones.push({ id: 'marathon', label: 'Marathon', description: '50 hands completed', achieved: true, icon: ''});

        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        if (accuracy >= 90 && stats.total >= 10) milestones.push({ id: 'precision', label: 'Precision', description: '90%+ accuracy (10+ hands)', achieved: true, icon: ''});
        if (accuracy >= 80 && stats.total >= 20) milestones.push({ id: 'consistent', label: 'Consistent', description: '80%+ accuracy (20+ hands)', achieved: true, icon: '★'});

        // Streak-based
        const streak = stats.currentStreak || 0;
        if (streak >= 5) milestones.push({ id: 'hot_streak', label: 'Hot Streak', description: '5+ correct in a row', achieved: true, icon: '▲'});
        if (streak >= 10) milestones.push({ id: 'unstoppable', label: 'Unstoppable', description: '10+ correct in a row', achieved: true, icon: ''});

        // Recovery milestone
        try {
            const recovery = this.getMistakeRecoveryRate();
            if (recovery && recovery.grade === 'A' && stats.total >= 10) {
                milestones.push({ id: 'resilient', label: 'Resilient', description: 'Grade A mistake recovery', achieved: true, icon: ''});
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        return milestones;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 308: ADAPTIVE DRILL RECOMMENDATION
    // ═══════════════════════════════════════════════════════════════════════════

    getAdaptiveDrillRecommendation() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const recommendations = [];

        // Check street weakness
        const streetAcc = {};
        history.forEach(h => {
            const st = (h.street || 'flop').toLowerCase();
            if (!streetAcc[st]) streetAcc[st] = { c: 0, t: 0 };
            streetAcc[st].t++;
            if (h.correct) streetAcc[st].c++;
        });
        const weakStreet = Object.entries(streetAcc || {}).filter(([_, d]) => d.t >= 3).sort((a, b) => (a[1].c / a[1].t) - (b[1].c / b[1].t))[0];
        if (weakStreet && (weakStreet[1].c / weakStreet[1].t) < 0.5) {
            recommendations.push({
                drill: `${weakStreet[0].charAt(0).toUpperCase() + weakStreet[0].slice(1)} Mastery`,
                reason: `${Math.round((weakStreet[1].c / weakStreet[1].t) * 100)}% accuracy on the ${weakStreet[0]}`,
                type: 'street_focus',
                priority: 'high',
            });
        }

        // Check position weakness
        const posAcc = {};
        history.forEach(h => {
            const pos = (h.heroPosition || h.position || 'MP').toUpperCase();
            if (!posAcc[pos]) posAcc[pos] = { c: 0, t: 0 };
            posAcc[pos].t++;
            if (h.correct) posAcc[pos].c++;
        });
        const weakPos = Object.entries(posAcc || {}).filter(([_, d]) => d.t >= 3).sort((a, b) => (a[1].c / a[1].t) - (b[1].c / b[1].t))[0];
        if (weakPos && (weakPos[1].c / weakPos[1].t) < 0.5) {
            recommendations.push({
                drill: `${weakPos[0]} Position Drill`,
                reason: `${Math.round((weakPos[1].c / weakPos[1].t) * 100)}% accuracy from ${weakPos[0]}`,
                type: 'position_focus',
                priority: 'high',
            });
        }

        // Check exploitative tendencies
        try {
            const ea = this.getExploitativeAdjustments();
            if (ea && ea.adjustments.length > 0) {
                const topAdj = ea.adjustments[0];
                recommendations.push({
                    drill: `Balance Training: ${topAdj.title}`,
                    reason: topAdj.description,
                    type: 'balance',
                    priority: topAdj.severity === 'critical' ? 'high' : 'medium',
                });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Check defense frequency
        try {
            const df = this.getDefenseFrequencyCheck();
            if (df && !df.isBalanced) {
                const issue = df.assessments.find(a => a.severity !== 'good');
                if (issue) {
                    recommendations.push({
                        drill: 'Defense Frequency Drill',
                        reason: issue.message,
                        type: 'defense',
                        priority: issue.severity === 'critical' ? 'high' : 'medium',
                    });
                }
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        recommendations.sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1));

        return {
            recommendations: recommendations.slice(0, 5),
            topRecommendation: recommendations[0] || null,
            totalWeaknesses: recommendations.length,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 309: CRITICAL HAND HIGHLIGHTS
    // ═══════════════════════════════════════════════════════════════════════════

    getCriticalHandHighlights() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Find the most impactful hands (highest EV loss + most important correct decisions)
        const sorted = [...history].map((h, i) => ({ ...h, index: i + 1 }));

        // Biggest mistakes
        const biggestMistakes = sorted
            .filter(h => !h.correct && (h.evLoss || 0) > 0)
            .sort((a, b) => (b.evLoss || 0) - (a.evLoss || 0))
            .slice(0, 3)
            .map(h => ({
                handNumber: h.index,
                type: 'mistake',
                evLoss: Math.round((h.evLoss || 0) * 100) / 100,
                street: h.street || 'unknown',
                position: h.heroPosition || h.position || 'unknown',
                userAction: h.selectedAction || 'unknown',
                correctAction: h.correctAction || 'unknown',
                description: `Hand #${h.index}: ${h.selectedAction || 'unknown'} instead of ${h.correctAction || 'unknown'} on the ${h.street || 'unknown'} (${Math.round((h.evLoss || 0) * 100) / 100} EV loss)`,
            }));

        // Best decisions (correct on hard spots)
        const bestDecisions = sorted
            .filter(h => h.correct)
            .sort((a, b) => {
                // Prioritize correct answers on mixed frequency spots
                const aScore = a.correctFreq ? (100 - a.correctFreq) : 0;
                const bScore = b.correctFreq ? (100 - b.correctFreq) : 0;
                return bScore - aScore;
            })
            .slice(0, 2)
            .map(h => ({
                handNumber: h.index,
                type: 'great_play',
                street: h.street || 'unknown',
                position: h.heroPosition || h.position || 'unknown',
                action: h.selectedAction || 'unknown',
                description: `Hand #${h.index}: Correct ${h.selectedAction || 'unknown'} on the ${h.street || 'unknown'} — well played!`,
            }));

        return {
            biggestMistakes,
            bestDecisions,
            totalHighlights: biggestMistakes.length + bestDecisions.length,
            summaryEVLost: Math.round(biggestMistakes.reduce((sum, m) => sum + (m.evLoss || 0), 0) * 100) / 100,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 310: COMPREHENSIVE SESSION REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    getComprehensiveSessionReport() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const stats = this._sessionStats;
        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

        // Aggregate all sub-analyses
        const report = {
            overview: {
                totalHands: stats.total,
                correct: stats.correct,
                accuracy,
                totalEVLoss: Math.round((stats.evLoss || 0) * 100) / 100,
                avgEVLoss: stats.total > 0 ? Math.round((stats.evLoss || 0) / stats.total * 100) / 100 : 0,
            },
            grade: accuracy >= 85 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 55 ? 'C' : accuracy >= 40 ? 'D' : 'F',
            sections: [],
        };

        // Streak analysis
        try {
            const sa = this.getStreakAnalysis();
            if (sa) report.sections.push({ title: 'Mental Game', data: { tiltResistance: sa.tiltResistance, longestWinStreak: sa.longestWinStreak, insight: sa.insight } });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Performance trend
        try {
            const pt = this.getPerformanceTrendAnalysis();
            if (pt) report.sections.push({ title: 'Trend', data: { trend: pt.trend, consistency: pt.consistencyScore, insight: pt.insight } });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Exploitable tendencies
        try {
            const ea = this.getExploitativeAdjustments();
            if (ea) report.sections.push({ title: 'Balance', data: { profile: ea.actionProfile, adjustments: ea.adjustments.length, summary: ea.summary } });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Critical hands
        try {
            const ch = this.getCriticalHandHighlights();
            if (ch) report.sections.push({ title: 'Key Hands', data: { mistakes: ch.biggestMistakes.length, greatPlays: ch.bestDecisions.length, evLost: ch.summaryEVLost } });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Drill recommendation
        try {
            const dr = this.getAdaptiveDrillRecommendation();
            if (dr && dr.topRecommendation) report.sections.push({ title: 'Next Focus', data: { drill: dr.topRecommendation.drill, reason: dr.topRecommendation.reason } });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Milestones
        try {
            const ms = this.getSessionMilestones();
            if (ms.length > 0) report.milestones = ms;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Coaching summary
        try {
            const cs = this.generateCoachingSummary();
            if (cs) report.coachingSummary = cs.summary;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        return report;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 311: NODE TYPE BREAKDOWN
    // ═══════════════════════════════════════════════════════════════════════════

    getNodeTypeBreakdown() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const nodeMap = {};

        history.forEach(h => {
            const node = (h.nodeType || 'SRP').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            if (!nodeMap[node]) nodeMap[node] = { correct: 0, total: 0, evLoss: 0 };
            nodeMap[node].total++;
            if (h.correct) nodeMap[node].correct++;
            nodeMap[node].evLoss += (h.evLoss || 0);
        });

        const breakdown = Object.entries(nodeMap || {}).map(([node, data]) => ({
            nodeType: node,
            total: data.total,
            correct: data.correct,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            avgEVLoss: data.total > 0 ? Math.round((data.evLoss / data.total) * 100) / 100 : 0,
        })).sort((a, b) => b.total - a.total);

        const weakest = breakdown.filter(n => n.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0] || null;

        return { breakdown, weakestNodeType: weakest, totalNodeTypes: breakdown.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 312: ACTION TIMELINE
    // ═══════════════════════════════════════════════════════════════════════════

    getActionTimeline() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 3) return null;
        const history = this._sessionStats.history;

        return history.map((h, i) => ({
            hand: i + 1,
            correct: h.correct,
            action: h.selectedAction || 'unknown',
            correctAction: h.correctAction || 'unknown',
            street: h.street || 'unknown',
            position: h.heroPosition || h.position || 'unknown',
            evLoss: Math.round((h.evLoss || 0) * 100) / 100,
            classification: h.classification || null,
        }));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 313: STREET-SPECIFIC LEAKS
    // ═══════════════════════════════════════════════════════════════════════════

    getStreetSpecificLeaks() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;
        const leaks = {};

        history.forEach(h => {
            if (h.correct) return;
            const street = (h.street || 'flop').toLowerCase();
            const userAction = this._normalizeActionCategory(h.selectedAction || '');
            const correctAction = this._normalizeActionCategory(h.correctAction || '');
            const key = `${street}_${userAction}_should_${correctAction}`;

            if (!leaks[key]) leaks[key] = { street, userAction, correctAction, count: 0, totalEVLoss: 0 };
            leaks[key].count++;
            leaks[key].totalEVLoss += (h.evLoss || 0);
        });

        const sorted = Object.values(leaks || {})
            .sort((a, b) => b.totalEVLoss - a.totalEVLoss)
            .slice(0, 10)
            .map(l => ({
                ...l,
                totalEVLoss: Math.round(l.totalEVLoss * 100) / 100,
                description: `${l.street.charAt(0).toUpperCase() + l.street.slice(1)}: ${l.userAction} instead of ${l.correctAction} (${l.count}x, -${Math.round(l.totalEVLoss * 100) / 100} EV)`,
            }));

        return { leaks: sorted, totalLeaks: sorted.length, biggestLeak: sorted[0] || null };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 314: OVERBET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getOverbetAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let overbetSpots = 0, overbetCorrect = 0, shouldOverbet = 0, missedOverbets = 0;

        history.forEach(h => {
            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const isUserOverbet = userAction.includes('overbet') || userAction.includes('150%') || userAction.includes('200%');
            const isCorrectOverbet = correctAction.includes('overbet') || correctAction.includes('150%') || correctAction.includes('200%');

            if (isUserOverbet) { overbetSpots++; if (h.correct) overbetCorrect++; }
            if (isCorrectOverbet) { shouldOverbet++; if (!isUserOverbet) missedOverbets++; }
        });

        return {
            overbetSpots,
            overbetCorrect,
            overbetAccuracy: overbetSpots > 0 ? Math.round((overbetCorrect / overbetSpots) * 100) : null,
            shouldOverbet,
            missedOverbets,
            tip: missedOverbets > 0
                ? `You missed ${missedOverbets} overbet spot${missedOverbets > 1 ? 's' : ''}. Overbets are optimal when your range is highly polarized and villain is range-capped.`
                : overbetSpots === 0
                    ? 'No overbet spots this session. Overbets are powerful on dry boards where villain checks back capped ranges.'
                    : `You used overbets ${overbetSpots} time${overbetSpots > 1 ? 's' : ''} with ${overbetSpots > 0 ? Math.round((overbetCorrect / overbetSpots) * 100) : 0}% accuracy.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 315: CHECK-RAISE ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getCheckRaiseAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let crSpots = 0, crCorrect = 0, shouldCR = 0, missedCR = 0;

        history.forEach(h => {
            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const isUserCR = userAction.includes('check') && userAction.includes('raise');
            const isCorrectCR = correctAction.includes('check') && correctAction.includes('raise');

            // Also catch "raise" when facing a bet (which is effectively a check-raise in OOP spots)
            const node = (h.nodeType || '').toLowerCase();
            const isCRSpot = node.includes('check_raise') || node.includes('facing_cbet');

            if (isUserCR || (isCRSpot && userAction.includes('raise'))) { crSpots++; if (h.correct) crCorrect++; }
            if (isCorrectCR || (isCRSpot && correctAction.includes('raise'))) { shouldCR++; if (!isUserCR && !userAction.includes('raise')) missedCR++; }
        });

        return {
            checkRaiseSpots: crSpots,
            checkRaiseCorrect: crCorrect,
            accuracy: crSpots > 0 ? Math.round((crCorrect / crSpots) * 100) : null,
            shouldCheckRaise: shouldCR,
            missedCheckRaises: missedCR,
            tip: missedCR > 1
                ? `You missed ${missedCR} check-raise opportunities. Check-raising is crucial for protecting your checking range and building pots with strong hands OOP.`
                : crSpots === 0
                    ? 'No check-raise spots this session. Watch for check-raise opportunities when you have strong hands or draws in the blinds.'
                    : `Check-raise accuracy: ${crSpots > 0 ? Math.round((crCorrect / crSpots) * 100) : 0}%. Keep up the aggression from OOP.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 316: C-BET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getCBetAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let cbetSpots = 0, cbetCorrect = 0, shouldCbet = 0, shouldCheck = 0, cbetWhenShouldCheck = 0, checkWhenShouldCbet = 0;

        history.forEach(h => {
            const node = (h.nodeType || '').toLowerCase();
            const street = (h.street || '').toLowerCase();
            if (!node.includes('cbet') && !node.includes('continuation') && street !== 'flop') return;

            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const userBets = userAction.includes('bet');
            const correctBets = correctAction.includes('bet');

            if (correctBets) { shouldCbet++; if (!userBets) checkWhenShouldCbet++; }
            else { shouldCheck++; if (userBets) cbetWhenShouldCheck++; }

            if (userBets) { cbetSpots++; if (h.correct) cbetCorrect++; }
        });

        return {
            cbetSpots,
            cbetCorrect,
            accuracy: cbetSpots > 0 ? Math.round((cbetCorrect / cbetSpots) * 100) : null,
            shouldCbet,
            shouldCheck,
            cbetWhenShouldCheck,
            checkWhenShouldCbet,
            tip: cbetWhenShouldCheck > 2
                ? `You c-bet too often — ${cbetWhenShouldCheck} times when the solver prefers checking. Not every flop deserves a c-bet.`
                : checkWhenShouldCbet > 2
                    ? `You miss c-bet opportunities — the solver wants you to bet on ${checkWhenShouldCbet} more flops.`
                    : 'Your c-bet frequency looks reasonable for this session.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 317: POSITION PAIR ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getPositionPairAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;
        const pairs = {};

        history.forEach(h => {
            const hero = (h.heroPosition || h.position || 'MP').toUpperCase();
            const villain = (h.villainPosition || 'BB').toUpperCase();
            const key = `${hero} vs ${villain}`;
            if (!pairs[key]) pairs[key] = { correct: 0, total: 0, evLoss: 0 };
            pairs[key].total++;
            if (h.correct) pairs[key].correct++;
            pairs[key].evLoss += (h.evLoss || 0);
        });

        const analysis = Object.entries(pairs || {}).map(([pair, data]) => ({
            matchup: pair,
            total: data.total,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            avgEVLoss: data.total > 0 ? Math.round((data.evLoss / data.total) * 100) / 100 : 0,
        })).sort((a, b) => b.total - a.total);

        const weakest = analysis.filter(a => a.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0] || null;

        return { pairs: analysis, weakestMatchup: weakest, totalMatchups: analysis.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 318: FREQUENCY CONVERGENCE TRACKER
    // ═══════════════════════════════════════════════════════════════════════════

    getFrequencyConvergenceTracker() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 10) return null;
        const history = this._sessionStats.history;
        const halfPoint = Math.floor(history.length / 2);
        const firstHalf = history.slice(0, halfPoint);
        const secondHalf = history.slice(halfPoint);

        const calcDeviation = (hands) => {
            let totalDev = 0, count = 0;
            hands.forEach(h => {
                if (h.correctFreq && h.selectedFreq !== undefined) {
                    totalDev += Math.abs((h.selectedFreq || 0) - (h.correctFreq || 0));
                    count++;
                }
            });
            return count > 0 ? Math.round(totalDev / count) : null;
        };

        const earlyDeviation = calcDeviation(firstHalf);
        const lateDeviation = calcDeviation(secondHalf);

        // Also track overall action accuracy convergence
        const earlyAcc = firstHalf.length > 0 ? Math.round((firstHalf.filter(h => h.correct).length / firstHalf.length) * 100) : 0;
        const lateAcc = secondHalf.length > 0 ? Math.round((secondHalf.filter(h => h.correct).length / secondHalf.length) * 100) : 0;

        const isConverging = lateAcc > earlyAcc || (lateDeviation !== null && earlyDeviation !== null && lateDeviation < earlyDeviation);

        return {
            earlyAccuracy: earlyAcc,
            lateAccuracy: lateAcc,
            earlyDeviation,
            lateDeviation,
            isConverging,
            improvement: lateAcc - earlyAcc,
            insight: isConverging
                ? `Great progress! Your accuracy improved from ${earlyAcc}% to ${lateAcc}% over the session.`
                : earlyAcc === lateAcc
                    ? 'Consistent play throughout. Try to push past your comfort zone to improve.'
                    : `Accuracy dipped from ${earlyAcc}% to ${lateAcc}%. Possible fatigue — consider shorter sessions.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 319: SMART SESSION LENGTH RECOMMENDATION
    // ═══════════════════════════════════════════════════════════════════════════

    getSmartSessionLength() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 10) return null;
        const history = this._sessionStats.history;

        // Find the point where accuracy starts consistently dropping
        const windowSize = 5;
        let peakWindow = 0;
        let peakAcc = 0;

        for (let i = 0; i <= history.length - windowSize; i++) {
            const window = history.slice(i, i + windowSize);
            const acc = window.filter(h => h.correct).length / window.length;
            if (acc >= peakAcc) { peakAcc = acc; peakWindow = i; }
        }

        // Find where accuracy drops below 60% of peak
        let dropOffPoint = history.length;
        const threshold = peakAcc * 0.8;
        for (let i = peakWindow + windowSize; i <= history.length - windowSize; i++) {
            const window = history.slice(i, i + windowSize);
            const acc = window.filter(h => h.correct).length / window.length;
            if (acc < threshold) { dropOffPoint = i; break; }
        }

        const optimalLength = Math.min(dropOffPoint + windowSize, history.length);
        const currentLength = history.length;

        return {
            optimalLength,
            currentLength,
            peakAccuracy: Math.round(peakAcc * 100),
            peakAt: peakWindow + 1,
            shouldContinue: currentLength < optimalLength * 0.9,
            recommendation: currentLength >= optimalLength
                ? `Consider stopping — your optimal session length is ~${optimalLength} hands based on when accuracy peaks.`
                : currentLength >= optimalLength * 0.8
                    ? `You're nearing your optimal session length (~${optimalLength} hands). Stay sharp for the last few.`
                    : `You're in the zone. Optimal session length estimate: ~${optimalLength} hands.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 320: TRAINING PLAN GENERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    getTrainingPlan() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;

        const plan = { sessions: [], focus: [], estimatedImprovement: 0 };

        // Gather weaknesses from various analyzers
        const weaknesses = [];

        try {
            const posLB = this.getPositionLeaderboard();
            if (posLB?.worstPosition && posLB.worstPosition.accuracy < 60) {
                weaknesses.push({ area: 'position', detail: `${posLB.worstPosition.position} at ${posLB.worstPosition.accuracy}%`, priority: 1 });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        try {
            const sta = this.getStreetTransitionAnalysis();
            if (sta?.weakestStreet && sta.weakestStreet.accuracy < 55) {
                weaknesses.push({ area: 'street', detail: `${sta.weakestStreet.street} at ${sta.weakestStreet.accuracy}%`, priority: 1 });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        try {
            const ea = this.getExploitativeAdjustments();
            if (ea?.adjustments?.length > 0) {
                ea.adjustments.slice(0, 2).forEach(adj => {
                    weaknesses.push({ area: 'balance', detail: adj.title, priority: adj.severity === 'critical' ? 1 : 2 });
                });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        try {
            const df = this.getDefenseFrequencyCheck();
            if (df && !df.isBalanced) {
                weaknesses.push({ area: 'defense', detail: 'Defense frequency imbalance', priority: 2 });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        try {
            const mr = this.getMistakeRecoveryRate();
            if (mr && (mr.grade === 'C' || mr.grade === 'D')) {
                weaknesses.push({ area: 'mental', detail: `Mistake recovery grade: ${mr.grade}`, priority: 2 });
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Generate 5-session plan
        weaknesses.sort((a, b) => a.priority - b.priority);
        const sessionLabels = ['Session 1: Foundation', 'Session 2: Deep Dive', 'Session 3: Practice', 'Session 4: Integration', 'Session 5: Assessment'];

        for (let i = 0; i < 5; i++) {
            const weakness = weaknesses[i % Math.max(1, weaknesses.length)];
            plan.sessions.push({
                label: sessionLabels[i],
                focus: weakness ? weakness.detail : 'General practice',
                hands: i < 2 ? 15 : i < 4 ? 20 : 25,
                goal: i < 2 ? 'Identify patterns' : i < 4 ? 'Apply corrections' : 'Maintain accuracy',
            });
        }

        plan.focus = weaknesses.slice(0, 3).map(w => w.detail);
        plan.estimatedImprovement = Math.min(15, weaknesses.length * 3);

        return plan;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 321: HAND STRENGTH DISTRIBUTION
    // ═══════════════════════════════════════════════════════════════════════════

    getHandStrengthDistribution() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const buckets = { premium: 0, strong: 0, medium: 0, weak: 0, trash: 0 };

        history.forEach(h => {
            const cat = (h.handCategory || '').toLowerCase();
            if (cat.includes('premium') || cat.includes('aa') || cat.includes('kk') || cat.includes('qq') || cat.includes('aks')) buckets.premium++;
            else if (cat.includes('strong') || cat.includes('top pair') || cat.includes('overpair') || cat.includes('two pair') || cat.includes('set')) buckets.strong++;
            else if (cat.includes('medium') || cat.includes('middle pair') || cat.includes('draw') || cat.includes('second')) buckets.medium++;
            else if (cat.includes('weak') || cat.includes('bottom') || cat.includes('gutshot') || cat.includes('backdoor')) buckets.weak++;
            else buckets.trash++;
        });

        const total = history.length;
        return {
            distribution: Object.entries(buckets || {}).map(([strength, count]) => ({
                strength: strength.charAt(0).toUpperCase() + strength.slice(1),
                count,
                percentage: Math.round((count / total) * 100),
            })).filter(d => d.count > 0),
            totalHands: total,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 322: AGGRESSION PROFILE (VPIP/PFR/3BET-like)
    // ═══════════════════════════════════════════════════════════════════════════

    getAggressionProfile() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let voluntaryActions = 0, aggressiveActions = 0, passiveActions = 0, folds = 0;

        history.forEach(h => {
            const action = (h.selectedAction || '').toLowerCase();
            if (action.includes('fold')) { folds++; return; }
            voluntaryActions++;
            if (action.includes('bet') || action.includes('raise') || action.includes('all')) aggressiveActions++;
            else passiveActions++;
        });

        const total = history.length;
        const vpip = Math.round((voluntaryActions / total) * 100);
        const aggPct = voluntaryActions > 0 ? Math.round((aggressiveActions / voluntaryActions) * 100) : 0;
        const afr = passiveActions > 0 ? Math.round((aggressiveActions / passiveActions) * 10) / 10 : aggressiveActions;

        let profile;
        if (vpip >= 70 && aggPct >= 60) profile = 'LAG (Loose-Aggressive)';
        else if (vpip >= 70) profile = 'LP (Loose-Passive)';
        else if (aggPct >= 60) profile = 'TAG (Tight-Aggressive)';
        else profile = 'TP (Tight-Passive)';

        return {
            vpip,
            aggressionPct: aggPct,
            aggressionFactor: afr,
            foldPct: Math.round((folds / total) * 100),
            profile,
            totalHands: total,
            tip: profile === 'TAG' ? 'Tight-aggressive is the foundation of winning poker. Keep it up!'
                : profile === 'LAG' ? 'Loose-aggressive can be profitable but requires deep understanding. Make sure your bluffs have blockers.'
                : profile === 'LP' ? 'Loose-passive is the weakest style. Add more aggression — bet and raise more with draws and strong hands.'
                : 'Tight-passive plays too few hands and too passively. Open wider in position and bet for value more.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 323: WIN RATE BY HAND CATEGORY
    // ═══════════════════════════════════════════════════════════════════════════

    getWinRateByHandCategory() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const categories = {};

        history.forEach(h => {
            const cat = h.handCategory || 'Unknown';
            if (!categories[cat]) categories[cat] = { correct: 0, total: 0 };
            categories[cat].total++;
            if (h.correct) categories[cat].correct++;
        });

        const results = Object.entries(categories || {}).map(([cat, data]) => ({
            category: cat,
            total: data.total,
            correct: data.correct,
            winRate: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        })).sort((a, b) => b.total - a.total);

        const weakest = results.filter(r => r.total >= 2).sort((a, b) => a.winRate - b.winRate)[0] || null;

        return { categories: results, weakestCategory: weakest, totalCategories: results.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 324: TIGHT/LOOSE PROFILE VS SOLVER
    // ═══════════════════════════════════════════════════════════════════════════

    getTightLooseProfile() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let userFolds = 0, solverFolds = 0, userContinues = 0, solverContinues = 0;

        history.forEach(h => {
            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();

            if (userAction.includes('fold')) userFolds++;
            else userContinues++;

            if (correctAction.includes('fold')) solverFolds++;
            else solverContinues++;
        });

        const total = history.length;
        const userFoldPct = Math.round((userFolds / total) * 100);
        const solverFoldPct = Math.round((solverFolds / total) * 100);
        const diff = userFoldPct - solverFoldPct;

        let assessment;
        if (diff > 10) assessment = 'too_tight';
        else if (diff > 5) assessment = 'slightly_tight';
        else if (diff < -10) assessment = 'too_loose';
        else if (diff < -5) assessment = 'slightly_loose';
        else assessment = 'balanced';

        return {
            userFoldPct,
            solverFoldPct,
            difference: diff,
            assessment,
            description: assessment === 'balanced' ? 'Your fold frequency matches the solver well.'
                : assessment.includes('tight') ? `You fold ${Math.abs(diff)}% more than the solver. You might be leaving value on the table.`
                : `You fold ${Math.abs(diff)}% less than the solver. You might be calling too wide in some spots.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 325: BLUFF SPOT ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getBluffSpotAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let bluffAttempts = 0, correctBluffs = 0, shouldBluff = 0, missedBluffs = 0;

        history.forEach(h => {
            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const handCat = (h.handCategory || '').toLowerCase();

            // Detect bluffs: aggressive action with weak hand
            const isWeakHand = handCat.includes('weak') || handCat.includes('air') || handCat.includes('trash') || handCat.includes('nothing') || handCat.includes('backdoor');
            const userBets = userAction.includes('bet') || userAction.includes('raise') || userAction.includes('all');
            const solverBets = correctAction.includes('bet') || correctAction.includes('raise') || correctAction.includes('all');

            if (isWeakHand && userBets) { bluffAttempts++; if (h.correct) correctBluffs++; }
            if (isWeakHand && solverBets) { shouldBluff++; if (!userBets) missedBluffs++; }
        });

        return {
            bluffAttempts,
            correctBluffs,
            bluffAccuracy: bluffAttempts > 0 ? Math.round((correctBluffs / bluffAttempts) * 100) : null,
            shouldBluff,
            missedBluffs,
            tip: missedBluffs > 2
                ? `You missed ${missedBluffs} bluff opportunities. Look for spots with good blockers and fold equity.`
                : bluffAttempts > shouldBluff + 2
                    ? 'You bluff more than the solver recommends. Be selective — choose spots with good blockers.'
                    : 'Your bluffing frequency looks reasonable.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 326: VALUE BET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getValueBetAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let valueBets = 0, correctValue = 0, shouldValueBet = 0, missedValue = 0;

        history.forEach(h => {
            const userAction = (h.selectedAction || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const handCat = (h.handCategory || '').toLowerCase();

            const isStrongHand = handCat.includes('strong') || handCat.includes('top pair') || handCat.includes('overpair') || handCat.includes('set') || handCat.includes('two pair') || handCat.includes('premium');
            const userBets = userAction.includes('bet') || userAction.includes('raise');
            const solverBets = correctAction.includes('bet') || correctAction.includes('raise');

            if (isStrongHand && userBets) { valueBets++; if (h.correct) correctValue++; }
            if (isStrongHand && solverBets) { shouldValueBet++; if (!userBets) missedValue++; }
        });

        return {
            valueBets,
            correctValue,
            accuracy: valueBets > 0 ? Math.round((correctValue / valueBets) * 100) : null,
            shouldValueBet,
            missedValue,
            tip: missedValue > 2
                ? `You missed ${missedValue} value bet opportunities. Don't be afraid to bet for thin value with strong hands.`
                : valueBets > 0 && (correctValue / valueBets) < 0.6
                    ? 'Some of your value bets might be too thin. Ensure villain calls with worse.'
                    : 'Your value betting looks solid.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 327: SESSION SUMMARY CARD (shareable)
    // ═══════════════════════════════════════════════════════════════════════════

    getSessionSummaryCard() {
        if (!this._sessionStats || this._sessionStats.total < 3) return null;
        const stats = this._sessionStats;
        const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        const grade = accuracy >= 90 ? 'S' : accuracy >= 80 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 55 ? 'C' : accuracy >= 40 ? 'D' : 'F';

        return {
            grade,
            accuracy,
            totalHands: stats.total,
            correct: stats.correct,
            evLoss: Math.round((stats.evLoss || 0) * 100) / 100,
            currentStreak: stats.currentStreak || 0,
            bestStreak: stats.bestStreak || 0,
            timestamp: new Date().toISOString(),
            shareText: `GTO Trainer: ${grade} grade | ${accuracy}% accuracy | ${stats.total} hands | ${Math.round((stats.evLoss || 0) * 100) / 100} EV loss`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 328: DIFFICULTY PROGRESSION
    // ═══════════════════════════════════════════════════════════════════════════

    getDifficultyProgression() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Track spot difficulty over time
        const progression = history.map((h, i) => ({
            hand: i + 1,
            difficulty: h.spotDifficulty || h.difficulty || 'standard',
            correct: h.correct,
        }));

        const diffCounts = { easy: 0, standard: 0, hard: 0, expert: 0 };
        const diffCorrect = { easy: 0, standard: 0, hard: 0, expert: 0 };

        progression.forEach(p => {
            const d = (p.difficulty || 'standard').toLowerCase();
            const key = d.includes('easy') ? 'easy' : d.includes('hard') || d.includes('difficult') ? 'hard' : d.includes('expert') ? 'expert' : 'standard';
            diffCounts[key]++;
            if (p.correct) diffCorrect[key]++;
        });

        const summary = Object.entries(diffCounts || {}).filter(([_, c]) => c > 0).map(([diff, count]) => ({
            difficulty: diff.charAt(0).toUpperCase() + diff.slice(1),
            count,
            accuracy: count > 0 ? Math.round((diffCorrect[diff] / count) * 100) : 0,
        }));

        return { progression, summary, totalHands: history.length };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 329: WEAKNESS HEATMAP (position × street)
    // ═══════════════════════════════════════════════════════════════════════════

    getWeaknessHeatmap() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;
        const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
        const streets = ['Preflop', 'Flop', 'Turn', 'River'];
        const cells = {};

        history.forEach(h => {
            const pos = (h.heroPosition || h.position || 'MP').toUpperCase();
            const street = (h.street || 'flop').charAt(0).toUpperCase() + (h.street || 'flop').slice(1);
            const key = `${pos}_${street}`;
            if (!cells[key]) cells[key] = { correct: 0, total: 0 };
            cells[key].total++;
            if (h.correct) cells[key].correct++;
        });

        const heatmap = [];
        positions.forEach(pos => {
            streets.forEach(street => {
                const key = `${pos}_${street}`;
                const data = cells[key] || { correct: 0, total: 0 };
                if (data.total > 0) {
                    const accuracy = Math.round((data.correct / data.total) * 100);
                    heatmap.push({
                        position: pos,
                        street,
                        accuracy,
                        total: data.total,
                        intensity: accuracy >= 80 ? 'strong' : accuracy >= 60 ? 'medium' : accuracy >= 40 ? 'weak' : 'critical',
                    });
                }
            });
        });

        const weakest = heatmap.filter(c => c.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0] || null;

        return { heatmap, weakestCell: weakest, positions, streets };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 330: GTO COMPLIANCE SCORE
    // ═══════════════════════════════════════════════════════════════════════════

    getGTOComplianceScore() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Multi-factor GTO compliance
        let accuracyScore = 0, frequencyScore = 0, balanceScore = 0;
        let freqCount = 0;

        // 1. Action accuracy (40% weight)
        const accuracy = history.filter(h => h.correct).length / history.length;
        accuracyScore = accuracy * 100;

        // 2. Frequency deviation (30% weight)
        history.forEach(h => {
            if (h.correctFreq !== undefined && h.selectedFreq !== undefined) {
                const dev = Math.abs((h.selectedFreq || 0) - (h.correctFreq || 0));
                frequencyScore += Math.max(0, 100 - dev * 2);
                freqCount++;
            }
        });
        if (freqCount > 0) frequencyScore = frequencyScore / freqCount;
        else frequencyScore = accuracyScore; // Fallback

        // 3. Balance (30% weight) — fold/call/raise distribution
        let folds = 0, calls = 0, raises = 0;
        let sFolds = 0, sCalls = 0, sRaises = 0;
        history.forEach(h => {
            const ua = (h.selectedAction || '').toLowerCase();
            const ca = (h.correctAction || '').toLowerCase();
            if (ua.includes('fold')) folds++; else if (ua.includes('call') || ua.includes('check')) calls++; else raises++;
            if (ca.includes('fold')) sFolds++; else if (ca.includes('call') || ca.includes('check')) sCalls++; else sRaises++;
        });
        const total = history.length;
        const fDiff = Math.abs((folds / total) - (sFolds / total));
        const cDiff = Math.abs((calls / total) - (sCalls / total));
        const rDiff = Math.abs((raises / total) - (sRaises / total));
        balanceScore = Math.max(0, 100 - (fDiff + cDiff + rDiff) * 200);

        const overall = Math.round(accuracyScore * 0.4 + frequencyScore * 0.3 + balanceScore * 0.3);

        let tier;
        if (overall >= 90) tier = 'Elite';
        else if (overall >= 80) tier = 'Advanced';
        else if (overall >= 70) tier = 'Intermediate';
        else if (overall >= 55) tier = 'Developing';
        else tier = 'Beginner';

        return {
            overall,
            tier,
            components: {
                accuracy: Math.round(accuracyScore),
                frequency: Math.round(frequencyScore),
                balance: Math.round(balanceScore),
            },
            weights: { accuracy: '40%', frequency: '30%', balance: '30%' },
            totalHands: history.length,
            insight: tier === 'Elite' ? 'Your play closely mirrors GTO solutions. Exceptional!'
                : tier === 'Advanced' ? 'Strong GTO fundamentals. Fine-tune mixed frequency spots.'
                : tier === 'Intermediate' ? 'Good foundation. Focus on frequency accuracy and range balance.'
                : tier === 'Developing' ? 'Growing understanding. Study solver outputs and focus on one leak at a time.'
                : 'Building fundamentals. Start with preflop ranges and basic c-bet strategy.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 331: RANGE BALANCE SCORE
    // ═══════════════════════════════════════════════════════════════════════════

    getRangeBalanceScore() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 8) return null;
        const history = this._sessionStats.history;

        // For each action type, how well does user match solver frequencies?
        const userActions = {};
        const solverActions = {};

        history.forEach(h => {
            const ua = this._normalizeActionCategory(h.selectedAction || '');
            const ca = this._normalizeActionCategory(h.correctAction || '');
            userActions[ua] = (userActions[ua] || 0) + 1;
            solverActions[ca] = (solverActions[ca] || 0) + 1;
        });

        const total = history.length;
        const allActions = [...new Set([...Object.keys(userActions || {}), ...Object.keys(solverActions || {})])];

        let totalDeviation = 0;
        const actionComparison = allActions.map(action => {
            const userPct = Math.round(((userActions[action] || 0) / total) * 100);
            const solverPct = Math.round(((solverActions[action] || 0) / total) * 100);
            const deviation = Math.abs(userPct - solverPct);
            totalDeviation += deviation;
            return { action, userPct, solverPct, deviation };
        });

        const balanceScore = Math.max(0, Math.round(100 - totalDeviation));

        return {
            balanceScore,
            actionComparison,
            totalDeviation,
            grade: balanceScore >= 85 ? 'A' : balanceScore >= 70 ? 'B' : balanceScore >= 55 ? 'C' : 'D',
            insight: balanceScore >= 85 ? 'Excellent range balance — your action frequencies match the solver closely.'
                : balanceScore >= 70 ? 'Good balance with minor deviations. Fine-tune your weaker spots.'
                : 'Significant frequency imbalances. Study which actions you over- or under-use.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 332: CHECK-BACK ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getCheckBackAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let checkBackCorrect = 0, checkBackTotal = 0, shouldCheckBack = 0, betInsteadOfCheck = 0;

        history.forEach(h => {
            const ua = (h.selectedAction || '').toLowerCase();
            const ca = (h.correctAction || '').toLowerCase();
            const isUserCheck = ua.includes('check');
            const isCorrectCheck = ca.includes('check');

            if (isUserCheck && isCorrectCheck) { checkBackCorrect++; checkBackTotal++; }
            else if (isUserCheck && !isCorrectCheck) { checkBackTotal++; }
            if (isCorrectCheck) { shouldCheckBack++; if (!isUserCheck) betInsteadOfCheck++; }
        });

        return {
            checkBackTotal,
            checkBackCorrect,
            accuracy: checkBackTotal > 0 ? Math.round((checkBackCorrect / checkBackTotal) * 100) : null,
            shouldCheckBack,
            betInsteadOfCheck,
            tip: betInsteadOfCheck > 3
                ? `You bet ${betInsteadOfCheck} times when the solver prefers checking. Checking protects your range and avoids bloating pots with medium hands.`
                : 'Your check-back decisions look solid.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 333: DONK BET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getDonkBetAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        let donkSpots = 0, donkCorrect = 0;

        history.forEach(h => {
            const node = (h.nodeType || '').toLowerCase();
            if (node.includes('donk') || node.includes('lead')) {
                donkSpots++;
                if (h.correct) donkCorrect++;
            }
        });

        return {
            donkSpots,
            donkCorrect,
            accuracy: donkSpots > 0 ? Math.round((donkCorrect / donkSpots) * 100) : null,
            tip: donkSpots === 0
                ? 'No donk bet spots this session. Donk bets are rare in GTO play but correct on specific board textures.'
                : `Donk bet accuracy: ${donkSpots > 0 ? Math.round((donkCorrect / donkSpots) * 100) : 0}%. Donk bets work on boards that favor the caller\\'s range heavily.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 334: MULTIWAY POT ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getMultiWayPotAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let multiway = { correct: 0, total: 0 };
        let headsUp = { correct: 0, total: 0 };

        history.forEach(h => {
            const node = (h.nodeType || '').toLowerCase();
            const isMultiway = node.includes('multiway') || node.includes('multi_way') || node.includes('3way') || node.includes('4way');
            const target = isMultiway ? multiway : headsUp;
            target.total++;
            if (h.correct) target.correct++;
        });

        return {
            multiway: { ...multiway, accuracy: multiway.total > 0 ? Math.round((multiway.correct / multiway.total) * 100) : null },
            headsUp: { ...headsUp, accuracy: headsUp.total > 0 ? Math.round((headsUp.correct / headsUp.total) * 100) : null },
            tip: multiway.total > 0 && headsUp.total > 0 && multiway.total >= 2
                ? `Multiway: ${Math.round((multiway.correct / multiway.total) * 100)}% vs Heads-up: ${Math.round((headsUp.correct / headsUp.total) * 100)}%. Multiway pots require tighter ranges and less bluffing.`
                : 'Most spots were heads-up this session.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 335: THIN VALUE FREQUENCY
    // ═══════════════════════════════════════════════════════════════════════════

    getThinValueFrequency() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Thin value = betting with medium-strength hands for value
        let thinValueSpots = 0, thinValueCorrect = 0;

        history.forEach(h => {
            const handCat = (h.handCategory || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const isMediumHand = handCat.includes('medium') || handCat.includes('middle') || handCat.includes('second') || handCat.includes('top pair weak');
            const isBetting = correctAction.includes('bet') || correctAction.includes('raise');

            if (isMediumHand && isBetting) {
                thinValueSpots++;
                if (h.correct) thinValueCorrect++;
            }
        });

        return {
            thinValueSpots,
            thinValueCorrect,
            accuracy: thinValueSpots > 0 ? Math.round((thinValueCorrect / thinValueSpots) * 100) : null,
            tip: thinValueSpots === 0
                ? 'No thin value spots identified. Thin value betting with medium-strength hands is a key skill for maximizing winnings.'
                : thinValueSpots > 0 && (thinValueCorrect / thinValueSpots) < 0.5
                    ? 'Your thin value betting needs work. Focus on determining if villain calls with worse.'
                    : 'Good thin value betting recognition.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 336: PROTECTION BET ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getProtectionBetAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Protection bets: betting to deny free cards (usually on wet boards)
        let protectionSpots = 0, protectionCorrect = 0;

        history.forEach(h => {
            const street = (h.street || '').toLowerCase();
            const correctAction = (h.correctAction || '').toLowerCase();
            const handCat = (h.handCategory || '').toLowerCase();
            const texture = (h.boardTexture || h.texture || '').toLowerCase();

            const isVulnerable = (handCat.includes('top pair') || handCat.includes('overpair') || handCat.includes('medium')) && (texture.includes('wet') || texture.includes('draw'));
            const isBetting = correctAction.includes('bet');

            if (isVulnerable && isBetting && (street === 'flop' || street === 'turn')) {
                protectionSpots++;
                if (h.correct) protectionCorrect++;
            }
        });

        return {
            protectionSpots,
            protectionCorrect,
            accuracy: protectionSpots > 0 ? Math.round((protectionCorrect / protectionSpots) * 100) : null,
            tip: protectionSpots > 0 && (protectionCorrect / protectionSpots) < 0.5
                ? 'You miss protection bets. On wet boards, bet to deny villain free equity with draws.'
                : 'Your protection betting looks appropriate.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 337: SHOWDOWN ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getShowdownAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // How often user checks down to showdown vs takes aggressive line
        let checkdowns = 0, aggressiveLines = 0, foldedOut = 0;

        history.forEach(h => {
            const action = (h.selectedAction || '').toLowerCase();
            if (action.includes('fold')) foldedOut++;
            else if (action.includes('check') || action.includes('call')) checkdowns++;
            else aggressiveLines++;
        });

        const total = history.length;
        const showdownRate = Math.round(((checkdowns + aggressiveLines) / total) * 100);
        const aggressionRate = (checkdowns + aggressiveLines) > 0
            ? Math.round((aggressiveLines / (checkdowns + aggressiveLines)) * 100) : 0;

        return {
            showdownRate,
            aggressionRate,
            checkdowns,
            aggressiveLines,
            foldedOut,
            total,
            insight: showdownRate > 75 ? 'High showdown rate — you see a lot of rivers. Make sure you are not calling too light.'
                : showdownRate < 40 ? 'Low showdown rate — you fold a lot. Consider defending wider, especially in position.'
                : 'Balanced showdown frequency.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 338: RIVER DECISION QUALITY
    // ═══════════════════════════════════════════════════════════════════════════

    getRiverDecisionQuality() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const riverHands = history.filter(h => (h.street || '').toLowerCase() === 'river');
        if (riverHands.length < 3) return null;

        const correct = riverHands.filter(h => h.correct).length;
        const accuracy = Math.round((correct / riverHands.length) * 100);
        const totalEV = riverHands.reduce((sum, h) => sum + (h.evLoss || 0), 0);
        const avgEV = Math.round((totalEV / riverHands.length) * 100) / 100;

        // River-specific action breakdown
        let riverFolds = 0, riverCalls = 0, riverBets = 0;
        riverHands.forEach(h => {
            const action = (h.selectedAction || '').toLowerCase();
            if (action.includes('fold')) riverFolds++;
            else if (action.includes('call') || action.includes('check')) riverCalls++;
            else riverBets++;
        });

        return {
            totalRiverHands: riverHands.length,
            accuracy,
            avgEVLoss: avgEV,
            actions: { folds: riverFolds, calls: riverCalls, bets: riverBets },
            grade: accuracy >= 80 ? 'A' : accuracy >= 65 ? 'B' : accuracy >= 50 ? 'C' : 'D',
            insight: accuracy >= 80 ? 'Excellent river play — this is where the biggest decisions happen.'
                : accuracy >= 65 ? 'Good river decisions. Focus on close bluff-catching and value betting spots.'
                : 'River play needs work. This is the highest-EV street to improve on.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 339: PREFLOP LEAK IDENTIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    getPreFlopLeaks() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
        const preflopHands = history.filter(h => (h.street || '').toLowerCase() === 'preflop');
        if (preflopHands.length < 3) return null;

        const leaks = [];
        let openCorrect = 0, openTotal = 0;
        let defenseCorrect = 0, defenseTotal = 0;
        let threeBetCorrect = 0, threeBetTotal = 0;

        preflopHands.forEach(h => {
            const node = (h.nodeType || '').toLowerCase();
            if (node.includes('open') || node.includes('rfi')) {
                openTotal++;
                if (h.correct) openCorrect++;
            } else if (node.includes('defense') || node.includes('facing') || node.includes('vs_')) {
                defenseTotal++;
                if (h.correct) defenseCorrect++;
            } else if (node.includes('3bet') || node.includes('squeeze')) {
                threeBetTotal++;
                if (h.correct) threeBetCorrect++;
            }
        });

        if (openTotal >= 2 && (openCorrect / openTotal) < 0.6) {
            leaks.push({ area: 'Open Range', accuracy: Math.round((openCorrect / openTotal) * 100), fix: 'Review position-based open ranges. Memorize top hands for each position.' });
        }
        if (defenseTotal >= 2 && (defenseCorrect / defenseTotal) < 0.6) {
            leaks.push({ area: 'Defense', accuracy: Math.round((defenseCorrect / defenseTotal) * 100), fix: 'Study defense ranges vs raises. Know which hands to call, 3-bet, or fold.' });
        }
        if (threeBetTotal >= 2 && (threeBetCorrect / threeBetTotal) < 0.5) {
            leaks.push({ area: '3-Bet', accuracy: Math.round((threeBetCorrect / threeBetTotal) * 100), fix: 'Your 3-bet range may be too wide or too narrow. Study position-based 3-bet ranges.' });
        }

        return {
            totalPreflopHands: preflopHands.length,
            accuracy: preflopHands.length > 0 ? Math.round((preflopHands.filter(h => h.correct).length / preflopHands.length) * 100) : 0,
            leaks,
            hasLeaks: leaks.length > 0,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 340: SESSION PROGRESSION CHART DATA
    // ═══════════════════════════════════════════════════════════════════════════

    getSessionProgressionChart() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Generate rolling accuracy data points for charting
        let runningCorrect = 0;
        const dataPoints = history.map((h, i) => {
            if (h.correct) runningCorrect++;
            return {
                hand: i + 1,
                correct: h.correct,
                runningAccuracy: Math.round((runningCorrect / (i + 1)) * 100),
                evLoss: Math.round((h.evLoss || 0) * 100) / 100,
                cumulativeEVLoss: 0, // Will calculate below
                street: h.street || 'unknown',
            };
        });

        // Calculate cumulative EV loss
        let cumEV = 0;
        dataPoints.forEach(dp => {
            cumEV += dp.evLoss;
            dp.cumulativeEVLoss = Math.round(cumEV * 100) / 100;
        });

        return {
            dataPoints,
            totalHands: history.length,
            finalAccuracy: dataPoints[dataPoints.length - 1]?.runningAccuracy || 0,
            totalEVLoss: Math.round(cumEV * 100) / 100,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 341: EQUITY REALIZATION ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getEquityRealizationAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // IP vs OOP equity realization
        const ipHands = history.filter(h => {
            const pos = (h.heroPosition || h.position || '').toUpperCase();
            return ['BTN', 'CO', 'IP'].includes(pos);
        });
        const oopHands = history.filter(h => {
            const pos = (h.heroPosition || h.position || '').toUpperCase();
            return ['SB', 'BB', 'UTG', 'OOP', 'EP'].includes(pos);
        });

        const calcAcc = (arr) => arr.length > 0 ? Math.round((arr.filter(h => h.correct).length / arr.length) * 100) : 0;

        return {
            ipAccuracy: calcAcc(ipHands),
            oopAccuracy: calcAcc(oopHands),
            ipHands: ipHands.length,
            oopHands: oopHands.length,
            positionAdvantage: calcAcc(ipHands) - calcAcc(oopHands),
            insight: calcAcc(ipHands) - calcAcc(oopHands) > 15
                ? 'Significant IP advantage — you realize equity much better in position. Work on OOP strategy.'
                : calcAcc(ipHands) - calcAcc(oopHands) > 5
                    ? 'Slight IP advantage — normal pattern. Position is power in poker.'
                    : 'Your IP/OOP accuracy is close — either great OOP play or room to improve IP play.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 342: POT CONTROL ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    getPotControlAnalysis() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let shouldControl = 0, controlledCorrectly = 0, inflatedWhenShouldControl = 0;

        history.forEach(h => {
            const correctAction = (h.correctAction || '').toLowerCase();
            const userAction = (h.selectedAction || '').toLowerCase();
            const isCorrectPassive = correctAction.includes('check') || correctAction.includes('call');
            const isUserAggressive = userAction.includes('bet') || userAction.includes('raise');

            if (isCorrectPassive) {
                shouldControl++;
                if (!isUserAggressive) controlledCorrectly++;
                else inflatedWhenShouldControl++;
            }
        });

        return {
            shouldControl,
            controlledCorrectly,
            inflatedWhenShouldControl,
            controlRate: shouldControl > 0 ? Math.round((controlledCorrectly / shouldControl) * 100) : null,
            tip: inflatedWhenShouldControl > 3
                ? `You inflated the pot ${inflatedWhenShouldControl} times when the solver prefers pot control. Save aggression for polarized spots.`
                : 'Good pot control awareness — you keep pots small when appropriate.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 343: BOARD TEXTURE QUIZ
    // ═══════════════════════════════════════════════════════════════════════════

    getBoardTextureQuiz() {
        const quizzes = [
            { board: 'A♠ K♥ 7♦', texture: 'Dry', cbetFreq: 'High (~75%)', explanation: 'Dry, disconnected board with high cards. Preflop raiser has massive range advantage. C-bet frequently with small sizing.' },
            { board: 'J♠ T♥ 9♣', texture: 'Wet/Connected', cbetFreq: 'Low (~33%)', explanation: 'Highly connected board. Many draws available. Callers connect well here. Check more frequently and bet larger when you do.' },
            { board: '8♠ 7♠ 6♥', texture: 'Very Wet', cbetFreq: 'Low (~25%)', explanation: 'Extremely connected with straight and flush draws. Callers hit this board hard. Mostly check, bet large with strong hands and good draws.' },
            { board: 'K♠ 8♦ 3♣', texture: 'Dry', cbetFreq: 'High (~70%)', explanation: 'Dry board with one high card. Raiser has range advantage. C-bet small (1/3 pot) with high frequency.' },
            { board: 'Q♥ J♦ T♠', texture: 'Wet/Broadway', cbetFreq: 'Medium (~45%)', explanation: 'Connected broadway board. Both ranges connect, but callers have more two-pair combos. Be selective with c-bets.' },
            { board: '2♠ 2♥ 5♦', texture: 'Paired/Dry', cbetFreq: 'Medium (~50%)', explanation: 'Paired board. Nobody connects often. Small sizing works well because ranges are wide and equity runs close.' },
        ];

        const idx = this._sessionStats?.total
            ? (this._sessionStats.total * 13 + 7) % quizzes.length
            : Math.floor(Math.random() * quizzes.length);

        return quizzes[idx];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 344: STACK DEPTH STRATEGY
    // ═══════════════════════════════════════════════════════════════════════════

    getStackDepthStrategy(effectiveStack = 100) {
        let strategy;
        if (effectiveStack <= 10) {
            strategy = {
                depth: 'Ultra-Short (≤10bb)',
                approach: 'Push/Fold',
                keyPrinciple: 'At 10bb or less, your strategy is binary: shove or fold. No limping, no min-raising.',
                ranges: 'Shove wider from late position. Tighten up from early position. Any pair, suited ace, KQ+ from BTN.',
                mistakes: 'Limping, calling opens, min-raising — all are errors at this depth.',
            };
        } else if (effectiveStack <= 20) {
            strategy = {
                depth: 'Short (11-20bb)',
                approach: 'Raise/Fold or Shove',
                keyPrinciple: 'Open-raise to 2-2.2x or shove. Your 3-bet range should be shove-or-fold only.',
                ranges: 'Open wider from BTN/CO. Shove over opens with 15bb or less with strong broadways and pairs.',
                mistakes: 'Calling 3-bets and seeing flops with shallow stacks is a major leak.',
            };
        } else if (effectiveStack <= 40) {
            strategy = {
                depth: 'Medium (21-40bb)',
                approach: 'Standard with adjustments',
                keyPrinciple: 'Standard preflop ranges but postflop play simplifies. SPR is low, so commit easier with top pair+.',
                ranges: 'Can open standard ranges but 4-bet/shove ranges widen. Avoid flatting 3-bets with speculative hands.',
                mistakes: 'Playing too many multi-street bluffs. With low SPR, one pair hands become very committal.',
            };
        } else {
            strategy = {
                depth: 'Deep (40bb+)',
                approach: 'Full postflop poker',
                keyPrinciple: 'Deep stacks enable complex multi-street play. Implied odds increase for speculative hands.',
                ranges: 'Can flat more with suited connectors, small pairs. Position is even more valuable deep.',
                mistakes: 'Not adjusting bet sizes for stack depth. Overbetting becomes more powerful when deep.',
            };
        }

        return { ...strategy, effectiveStack };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 345: MIXED STRATEGY ACCURACY
    // ═══════════════════════════════════════════════════════════════════════════

    getMixedStrategyAccuracy() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        let mixedSpots = 0, mixedCorrect = 0, pureSpots = 0, pureCorrect = 0;

        history.forEach(h => {
            const isMixed = h.correctFreq && h.correctFreq < 85 && h.correctFreq > 15;
            if (isMixed) { mixedSpots++; if (h.correct) mixedCorrect++; }
            else { pureSpots++; if (h.correct) pureCorrect++; }
        });

        return {
            mixedSpots,
            mixedCorrect,
            mixedAccuracy: mixedSpots > 0 ? Math.round((mixedCorrect / mixedSpots) * 100) : null,
            pureSpots,
            pureCorrect,
            pureAccuracy: pureSpots > 0 ? Math.round((pureCorrect / pureSpots) * 100) : null,
            gap: (pureSpots > 0 && mixedSpots > 0)
                ? Math.round((pureCorrect / pureSpots) * 100) - Math.round((mixedCorrect / mixedSpots) * 100)
                : null,
            insight: mixedSpots > 0 && (mixedCorrect / mixedSpots) < 0.5
                ? 'Mixed strategy spots are your weakest area. These spots have close EV between actions — focus on understanding why the solver mixes.'
                : 'Your mixed strategy spot accuracy is respectable.',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 346: ENDGAME REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    getEndgameReport() {
        if (!this._sessionStats || this._sessionStats.total < 5) return null;
        const stats = this._sessionStats;
        const accuracy = Math.round((stats.correct / stats.total) * 100);

        // Aggregate key metrics
        const report = {
            accuracy,
            totalHands: stats.total,
            grade: accuracy >= 90 ? 'S' : accuracy >= 80 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 55 ? 'C' : accuracy >= 40 ? 'D' : 'F',
            evLoss: Math.round((stats.evLoss || 0) * 100) / 100,
            highlights: [],
            areasForImprovement: [],
        };

        // Highlights
        if (accuracy >= 80) report.highlights.push(`${accuracy}% accuracy — top tier performance!`);
        if (stats.bestStreak >= 5) report.highlights.push(`${stats.bestStreak}-hand winning streak!`);

        // Areas for improvement from various sources
        try { const ea = this.getExploitativeAdjustments(); if (ea?.adjustments?.[0]) report.areasForImprovement.push(ea.adjustments[0].title); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        try { const pfl = this.getPreFlopLeaks(); if (pfl?.leaks?.[0]) report.areasForImprovement.push(`Preflop: ${pfl.leaks[0].area}`); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        try { const rdq = this.getRiverDecisionQuality(); if (rdq?.grade === 'D') report.areasForImprovement.push('River decisions'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        return report;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 347: PLAYSTYLE EVOLUTION
    // ═══════════════════════════════════════════════════════════════════════════

    getPlaystyleEvolution() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 10) return null;
        const history = this._sessionStats.history;
        const half = Math.floor(history.length / 2);
        const firstHalf = history.slice(0, half);
        const secondHalf = history.slice(half);

        const getProfile = (hands) => {
            let folds = 0, calls = 0, raises = 0;
            hands.forEach(h => {
                const a = (h.selectedAction || '').toLowerCase();
                if (a.includes('fold')) folds++;
                else if (a.includes('call') || a.includes('check')) calls++;
                else raises++;
            });
            const t = hands.length;
            return {
                foldPct: Math.round((folds / t) * 100),
                callPct: Math.round((calls / t) * 100),
                raisePct: Math.round((raises / t) * 100),
                accuracy: Math.round((hands.filter(h => h.correct).length / t) * 100),
            };
        };

        const early = getProfile(firstHalf);
        const late = getProfile(secondHalf);

        const aggressionShift = late.raisePct - early.raisePct;
        let evolution;
        if (aggressionShift > 10) evolution = 'Becoming more aggressive';
        else if (aggressionShift < -10) evolution = 'Becoming more passive';
        else if (late.accuracy > early.accuracy + 10) evolution = 'Improving accuracy';
        else if (late.accuracy < early.accuracy - 10) evolution = 'Declining focus';
        else evolution = 'Consistent play';

        return { early, late, evolution, aggressionShift };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 348: KEY CONCEPT REMINDERS
    // ═══════════════════════════════════════════════════════════════════════════

    getKeyConceptReminders(street = 'flop', nodeType = '', heroPosition = '') {
        const reminders = [];

        if (street === 'preflop') {
            reminders.push('Position is the most valuable asset in poker — play tighter from early positions.');
            if (nodeType.includes('3bet')) reminders.push('3-bet with a polarized range: premiums for value + suited aces/small pairs as bluffs.');
        } else if (street === 'flop') {
            reminders.push('On dry boards, c-bet small and frequently. On wet boards, check more and bet larger.');
            if (heroPosition === 'SB' || heroPosition === 'BB') reminders.push('OOP ranges should check-raise strong hands and draws to build pots.');
        } else if (street === 'turn') {
            reminders.push('The turn is where ranges narrow significantly. Continuing to barrel shows real strength.');
            reminders.push('If you checked the flop, consider a delayed c-bet if the turn improves your range.');
        } else if (street === 'river') {
            reminders.push('River ranges should be polarized: bet big with strong hands and bluffs, check medium hands.');
            reminders.push('Use blockers to select bluffs — blocking strong hands villain could have makes bluffs more profitable.');
        }

        return { reminders: reminders.slice(0, 3), street, position: heroPosition };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 349: NEXT SESSION PREPARATION
    // ═══════════════════════════════════════════════════════════════════════════

    getNextSessionPrep() {
        if (!this._sessionStats || this._sessionStats.total < 5) return null;

        const prep = { warmup: [], focus: [], studyTopics: [] };

        // Warmup based on strengths
        try {
            const posLB = this.getPositionLeaderboard();
            if (posLB?.bestPosition) prep.warmup.push(`Start from your strongest position: ${posLB.bestPosition.position} (${posLB.bestPosition.accuracy}%)`);
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Focus areas from weaknesses
        try {
            const dr = this.getAdaptiveDrillRecommendation();
            if (dr?.recommendations) dr.recommendations.slice(0, 2).forEach(r => prep.focus.push(r.drill));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Study topics
        try {
            const gto = this.getGTOComplianceScore();
            if (gto) {
                if (gto.components.frequency < 70) prep.studyTopics.push('Mixed frequency spots — understand when the solver mixes and why');
                if (gto.components.balance < 70) prep.studyTopics.push('Range balance — review your fold/call/raise distribution vs solver');
                if (gto.components.accuracy < 70) prep.studyTopics.push('Core strategy — review opening ranges and postflop fundamentals');
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        try {
            const rdq = this.getRiverDecisionQuality();
            if (rdq && rdq.grade === 'C' || rdq?.grade === 'D') prep.studyTopics.push('River play — focus on bluff-catching and thin value betting');
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        if (prep.warmup.length === 0) prep.warmup.push('Start with 5 hands of familiar spots to get warmed up');
        if (prep.focus.length === 0) prep.focus.push('General GTO practice');
        if (prep.studyTopics.length === 0) prep.studyTopics.push('Review solver lines for spots you found tricky');

        return prep;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 350: ULTIMATE PLAYER RATING
    // ═══════════════════════════════════════════════════════════════════════════

    getUltimatePlayerRating() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;

        // Composite rating from multiple dimensions
        let scores = {};

        // Accuracy (25%)
        const accuracy = Math.round((history.filter(h => h.correct).length / history.length) * 100);
        scores.accuracy = accuracy;

        // GTO Compliance (20%)
        try {
            const gto = this.getGTOComplianceScore();
            scores.gtoCompliance = gto?.overall || accuracy;
        } catch (_) { scores.gtoCompliance = accuracy; }

        // Mental game (15%)
        try {
            const sa = this.getStreakAnalysis();
            scores.mentalGame = sa?.tiltResistance || 70;
        } catch (_) { scores.mentalGame = 70; }

        // Range balance (15%)
        try {
            const rb = this.getRangeBalanceScore();
            scores.rangeBalance = rb?.balanceScore || 60;
        } catch (_) { scores.rangeBalance = 60; }

        // Consistency (10%)
        try {
            const pt = this.getPerformanceTrendAnalysis();
            scores.consistency = pt?.consistencyScore || 60;
        } catch (_) { scores.consistency = 60; }

        // Adaptability (10%)
        try {
            const fc = this.getFrequencyConvergenceTracker();
            scores.adaptability = fc?.isConverging ? 80 : 50;
        } catch (_) { scores.adaptability = 50; }

        // Mixed strategy skill (5%)
        try {
            const ms = this.getMixedStrategyAccuracy();
            scores.mixedStrategy = ms?.mixedAccuracy || 50;
        } catch (_) { scores.mixedStrategy = 50; }

        const compositeRating = Math.round(
            scores.accuracy * 0.25 +
            scores.gtoCompliance * 0.20 +
            scores.mentalGame * 0.15 +
            scores.rangeBalance * 0.15 +
            scores.consistency * 0.10 +
            scores.adaptability * 0.10 +
            scores.mixedStrategy * 0.05
        );

        // Convert to tier
        let tier, elo;
        if (compositeRating >= 90) { tier = 'Grandmaster'; elo = 2400 + (compositeRating - 90) * 20; }
        else if (compositeRating >= 80) { tier = 'Master'; elo = 2200 + (compositeRating - 80) * 20; }
        else if (compositeRating >= 70) { tier = 'Expert'; elo = 2000 + (compositeRating - 70) * 20; }
        else if (compositeRating >= 60) { tier = 'Advanced'; elo = 1800 + (compositeRating - 60) * 20; }
        else if (compositeRating >= 50) { tier = 'Intermediate'; elo = 1600 + (compositeRating - 50) * 20; }
        else if (compositeRating >= 35) { tier = 'Developing'; elo = 1400 + (compositeRating - 35) * 13; }
        else { tier = 'Beginner'; elo = 1200 + compositeRating * 6; }

        return {
            compositeRating,
            elo: Math.round(elo),
            tier,
            scores,
            totalHands: history.length,
            insight: `Your ${tier} rating of ${Math.round(elo)} reflects ${compositeRating}% composite skill across accuracy, GTO compliance, mental game, range balance, consistency, and adaptability.`,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 355: HAND HISTORY IMPORT → TRAINING QUESTION CONVERTER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 355: Convert an imported hand history into a training-ready question.
     * Tries to find matching solver data for the exact spot. If no solver data,
     * generates a heuristic-based question with approximate GTO frequencies.
     */
    importHandToTrainingQuestion(parsedHand, targetStreet) {
        if (!parsedHand || !parsedHand.success) return null;

        const street = targetStreet || (parsedHand.board.river ? 'river' : parsedHand.board.turn ? 'turn' : 'flop');
        const bbSize = parsedHand.blinds?.bb || 1;

        // Build board cards for the target street
        let boardCards = [...(parsedHand.board.flop || [])];
        if ((street === 'turn' || street === 'river') && parsedHand.board.turn) boardCards.push(parsedHand.board.turn);
        if (street === 'river' && parsedHand.board.river) boardCards.push(parsedHand.board.river);

        // Calculate pot at target street
        let pot = (parsedHand.blinds?.sb || 0.5) + bbSize;
        const streets = ['preflop'];
        if (street !== 'flop') streets.push('flop');
        if (street === 'river') streets.push('turn');

        for (const st of streets) {
            for (const action of (parsedHand.streetActions?.[st] || [])) {
                if (['call', 'raise', 'bet'].includes(action.action)) {
                    pot += action.amount || 0;
                }
            }
        }
        const potBB = Math.round(pot / bbSize) || 6;

        // Build hero hand notation
        let heroHandNotation = '';
        if (parsedHand.heroHand?.card1 && parsedHand.heroHand?.card2) {
            const r1 = parsedHand.heroHand.card1[0];
            const r2 = parsedHand.heroHand.card2[0];
            const s1 = parsedHand.heroHand.card1[1];
            const s2 = parsedHand.heroHand.card2[1];
            const RANK_ORDER = 'AKQJT98765432';
            if (r1 === r2) {
                heroHandNotation = `${r1}${r2}`;
            } else {
                const idx1 = RANK_ORDER.indexOf(r1);
                const idx2 = RANK_ORDER.indexOf(r2);
                const hi = idx1 < idx2 ? r1 : r2;
                const lo = idx1 < idx2 ? r2 : r1;
                heroHandNotation = s1 === s2 ? `${hi}${lo}s` : `${hi}${lo}o`;
            }
        }

        // Generate heuristic GTO frequencies based on position + board texture
        const gtoFreqs = this._heuristicGTOFrequencies(heroHandNotation, boardCards, parsedHand.heroPosition, street, potBB, parsedHand.villainPosition);

        return {
            id: `hh_import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            source: 'hand_history_import',
            heroHand: heroHandNotation,
            heroCards: parsedHand.heroCards || [],
            scenario: {
                gameType: (parsedHand.numPlayers || 6) <= 2 ? 'hu_cash' : 'cash_6max',
                street,
                board: boardCards.join(' '),
                boardCards,
                pot: potBB,
                heroPosition: parsedHand.heroPosition || 'BTN',
                villainPosition: parsedHand.villainPosition || 'BB',
                heroStack: parsedHand.heroStack || 100,
                villainStack: parsedHand.villains?.[0]?.stack || 100,
                stackDepth: parsedHand.heroStack || 100,
                isImported: true,
                importFormat: parsedHand.format || 'unknown',
            },
            gtoFrequencies: gtoFreqs,
            actions: Object.entries(gtoFreqs || {}).map(([action, freq]) => ({
                action,
                frequency: freq,
                label: this._actionLabel(action),
            })),
        };
    }

    /**
     * Phase 355: Generate heuristic GTO frequencies for imported hands
     * when no solver data is available.
     */
    _heuristicGTOFrequencies(heroHand, boardCards, position, street, potBB, villainPosition) {
        const freqs = {};
        // Position is relative: SB is OOP against everyone, BB is IP against SB.
        const isIP = this._isInPosition(position, villainPosition);

        // Classify board texture
        const texture = this.classifyBoardTexture(boardCards);
        const textureType = texture?.type || 'STANDARD';

        // Base frequencies by texture.
        // These are check/bet nodes (hero is not facing a bet), so fold is not
        // a legal action — former 'f' weight is folded into 'x'.
        if (textureType.includes('DRY') || textureType.includes('RAINBOW')) {
            // Dry board = more checking, small bets
            freqs['x'] = 0.45;
            freqs['b33'] = 0.35;
            freqs['b50'] = 0.15;
            freqs['b75'] = 0.05;
        } else if (textureType.includes('MONOTONE')) {
            // Monotone = polarized
            freqs['x'] = 0.70;
            freqs['b75'] = 0.20;
            freqs['b33'] = 0.10;
        } else if (textureType.includes('CONNECTED') || textureType.includes('WET')) {
            // Wet = larger sizes, more checking
            freqs['x'] = 0.45;
            freqs['b50'] = 0.25;
            freqs['b75'] = 0.20;
            freqs['b33'] = 0.10;
        } else {
            // Standard
            freqs['x'] = 0.45;
            freqs['b33'] = 0.25;
            freqs['b50'] = 0.20;
            freqs['b75'] = 0.10;
        }

        // Position adjustments
        if (isIP) {
            freqs['x'] = (freqs['x'] || 0) - 0.05;
            freqs['b33'] = (freqs['b33'] || 0) + 0.05;
        }

        // Street adjustments
        if (street === 'river') {
            freqs['x'] = (freqs['x'] || 0) + 0.10;
            freqs['b75'] = (freqs['b75'] || 0) + 0.05;
            freqs['b33'] = (freqs['b33'] || 0) - 0.10;
        }

        // Normalize
        const total = Object.values(freqs || {}).reduce((s, v) => s + Math.max(v, 0), 0) || 1;
        for (const k of Object.keys(freqs || {})) {
            freqs[k] = Math.max(0, freqs[k]) / total;
        }

        return freqs;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 356: ENHANCED GAME TREE BUILDER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Phase 356: Build a detailed game tree for the current spot.
     * Goes 3 levels deep: Hero action → Villain response → Hero re-action.
     * Uses solver frequencies when available, heuristics otherwise.
     */
    buildDetailedGameTree(spotData, heroHand, heroPosition, villainPosition, street) {
        if (!spotData && !heroHand) return null;

        const actions = spotData?.actions || spotData?.gtoFrequencies || {};
        const total = Object.values(actions || {}).reduce((s, v) => s + (v || 0), 0) || 1;
        const boardCards = spotData?.scenario?.boardCards || spotData?.boardCards || [];

        const ACTION_META = {
            x: { type: 'check', label: 'Check', color: '#3b82f6', abbr: 'X' },
            c: { type: 'call', label: 'Call', color: '#22c55e', abbr: 'C' },
            f: { type: 'fold', label: 'Fold', color: '#64748b', abbr: 'F' },
            b33: { type: 'bet', label: 'Bet 33%', color: '#ef4444', abbr: 'B33' },
            b50: { type: 'bet', label: 'Bet 50%', color: '#ef4444', abbr: 'B50' },
            b67: { type: 'bet', label: 'Bet 67%', color: '#ef4444', abbr: 'B67' },
            b75: { type: 'bet', label: 'Bet 75%', color: '#ef4444', abbr: 'B75' },
            b100: { type: 'bet', label: 'Bet 100%', color: '#ef4444', abbr: 'B100' },
            b150: { type: 'overbet', label: 'Bet 150%', color: '#a855f7', abbr: 'OB' },
            allin: { type: 'allin', label: 'All-In', color: '#a855f7', abbr: 'AI' },
            r: { type: 'raise', label: 'Raise', color: '#ef4444', abbr: 'R' },
        };

        const rootChildren = [];

        Object.entries(actions || {}).forEach(([key, freq]) => {
            if (freq <= 0.005) return;
            const meta = ACTION_META[key] || ACTION_META[key[0]] || { type: 'check', label: key, color: '#3b82f6', abbr: key.slice(0, 2).toUpperCase() };
            const pct = Math.round((freq / total) * 100);
            const isTerminal = meta.type === 'fold';

            // Level 2: Villain responses
            const villainChildren = [];
            if (!isTerminal) {
                if (meta.type === 'bet' || meta.type === 'raise' || meta.type === 'overbet' || meta.type === 'allin') {
                    // After hero bet/raise: villain can fold, call, or raise.
                    //
                    // Operation Grok-Sweep (2026-05): the prior implementation
                    // used Math.random() to jitter these "default" frequencies
                    // 0–10 points on each render — making the EV-tree numbers
                    // change every time the user re-rendered the view. Worse,
                    // the values were presented to the user as solver
                    // frequencies. They are NOT solver-derived; they are
                    // reasonable static defaults until per-node solver-defense
                    // data is wired through. Stable values stop the jiggle and
                    // preserve user trust.
                    villainChildren.push(
                        { id: `v-fold-${key}`, type: 'terminal', action: 'fold', label: `${villainPosition || 'V'} Fold`, abbr: 'F', frequency: 35, isApprox: true, color: '#64748b', children: [], depth: 2 },
                        { id: `v-call-${key}`, type: 'decision', action: 'call', label: `${villainPosition || 'V'} Call`, abbr: 'C', frequency: 50, isApprox: true, color: '#22c55e', children: [
                            // Level 3: Next street or showdown
                            ...(street === 'river' ? [
                                { id: `sd-${key}`, type: 'terminal', action: 'showdown', label: 'Showdown', abbr: 'SD', frequency: 100, color: '#eab308', children: [], depth: 3 },
                            ] : [
                                { id: `ns-chk-${key}`, type: 'decision', action: 'check', label: 'Check', abbr: 'X', frequency: 45, isApprox: true, color: '#3b82f6', children: [], depth: 3 },
                                { id: `ns-bet-${key}`, type: 'decision', action: 'bet', label: 'Bet', abbr: 'B', frequency: 55, isApprox: true, color: '#ef4444', children: [], depth: 3 },
                            ]),
                        ], depth: 2 },
                        { id: `v-raise-${key}`, type: 'decision', action: 'raise', label: `${villainPosition || 'V'} Raise`, abbr: 'R', frequency: 15, isApprox: true, color: '#ef4444', children: [
                            { id: `h-fold-${key}`, type: 'terminal', action: 'fold', label: 'Fold', abbr: 'F', frequency: 40, color: '#64748b', children: [], depth: 3 },
                            { id: `h-call-${key}`, type: 'decision', action: 'call', label: 'Call', abbr: 'C', frequency: 45, color: '#22c55e', children: [], depth: 3 },
                            { id: `h-4bet-${key}`, type: 'decision', action: 'raise', label: 'Re-raise', abbr: 'RR', frequency: 15, color: '#a855f7', children: [], depth: 3 },
                        ], depth: 2 },
                    );
                } else if (meta.type === 'check') {
                    // After hero check: villain can check or bet
                    villainChildren.push(
                        { id: `v-chk-${key}`, type: 'chance', action: 'check', label: `${villainPosition || 'V'} Check`, abbr: 'X', frequency: 55, color: '#3b82f6', children: [
                            ...(street === 'river' ? [
                                { id: `sd-chk-${key}`, type: 'terminal', action: 'showdown', label: 'Showdown', abbr: 'SD', frequency: 100, color: '#eab308', children: [], depth: 3 },
                            ] : [
                                { id: `ns-${key}`, type: 'chance', action: 'check', label: 'Next Street', abbr: '>', frequency: 100, color: '#3b82f6', children: [], depth: 3 },
                            ]),
                        ], depth: 2 },
                        { id: `v-bet-${key}`, type: 'decision', action: 'bet', label: `${villainPosition || 'V'} Bet`, abbr: 'B', frequency: 45, color: '#ef4444', children: [
                            { id: `h-fold-chk-${key}`, type: 'terminal', action: 'fold', label: 'Fold', abbr: 'F', frequency: 30, color: '#64748b', children: [], depth: 3 },
                            { id: `h-call-chk-${key}`, type: 'decision', action: 'call', label: 'Call', abbr: 'C', frequency: 50, color: '#22c55e', children: [], depth: 3 },
                            { id: `h-raise-chk-${key}`, type: 'decision', action: 'raise', label: 'Raise', abbr: 'R', frequency: 20, color: '#ef4444', children: [], depth: 3 },
                        ], depth: 2 },
                    );
                } else if (meta.type === 'call') {
                    // After hero call: next street or showdown
                    villainChildren.push(
                        ...(street === 'river' ? [
                            { id: `sd-call-${key}`, type: 'terminal', action: 'showdown', label: 'Showdown', abbr: 'SD', frequency: 100, color: '#eab308', children: [], depth: 2 },
                        ] : [
                            { id: `ns-call-${key}`, type: 'chance', action: 'check', label: 'Next Street', abbr: '>', frequency: 100, color: '#3b82f6', children: [], depth: 2 },
                        ]),
                    );
                }
            }

            rootChildren.push({
                id: `root-${key}`,
                type: isTerminal ? 'terminal' : 'decision',
                action: meta.type,
                label: `${meta.label} (${pct}%)`,
                abbr: meta.abbr,
                frequency: pct,
                color: meta.color,
                children: villainChildren,
                depth: 1,
            });
        });

        // Sort by frequency
        rootChildren.sort((a, b) => b.frequency - a.frequency);

        return {
            id: 'root',
            type: 'decision',
            label: `${heroPosition || 'Hero'} (${heroHand || '??'})`,
            color: '#00d4ff',
            children: rootChildren,
            depth: 0,
            meta: {
                heroHand,
                heroPosition,
                villainPosition,
                street,
                boardCards,
            },
        };
    }
}

// Export singleton
export const deterministicEngine = new DeterministicGTOEngine();
