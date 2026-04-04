/**
 * 🎯 DETERMINISTIC GTO ENGINE
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
    const actions = strategyMatrix.actions || Object.keys(frequencies);

    if (actions.length === 0) return 50;

    // Build per-hand max frequency map
    const handMaxFreqs = {};

    for (const action of actions) {
        const handFreqs = frequencies[action];
        if (!handFreqs || typeof handFreqs !== 'object') continue;

        for (const [hand, freq] of Object.entries(handFreqs)) {
            if (typeof freq !== 'number') continue;
            // freq is 0.0-1.0, convert to percentage for comparison
            const pct = freq * 100;
            if (!handMaxFreqs[hand] || pct > handMaxFreqs[hand]) {
                handMaxFreqs[hand] = pct;
            }
        }
    }

    const maxFreqs = Object.values(handMaxFreqs);
    if (maxFreqs.length === 0) {
        // Flat frequencies fallback (action → freq, no per-hand data)
        let maxFreq = 0;
        for (const val of Object.values(frequencies)) {
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

        if (source === 'PioSOLVER') {
            return this.generateFromSolvedSpots(gameConfig, level, seenIds);
        } else if (source === 'ICMIZER') {
            return this.generateFromCharts(gameConfig, level, seenIds);
        }
        // SCENARIO games (psychology) fall back to Grok — not handled here
        return null;
    }

    /**
     * Generate a batch of N questions from solver data
     * IMP-6 FIX: Strengthened dedup — rejects same heroHand+scenarioHash combos
     */
    async generateBatch({ gameId, level, count = 25, gameConfig, targetPositions, targetStreet, difficulty = 'standard' }) {
        if (!gameConfig) return [];

        const questions = [];
        const usedQuestionIds = new Set();
        const usedHandScenarios = new Set(); // IMP-6: track heroHand+scenario combos

        // ═══ PHASE 15: Targeted practice — fetch pool with optional position/street filters ═══
        // ═══ PHASE 19: Fetch larger pool for difficulty filtering ═══
        const poolMultiplier = difficulty === 'standard' ? 3 : 5;
        const poolSize = Math.min(count * poolMultiplier, 125);
        const scenarios = await this.fetchSolverPool(gameConfig, level, poolSize, targetStreet);

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
                console.log(`[DeterministicEngine] 🎯 Targeted ${targeted.length}/${scenarios.length} scenarios for positions: ${targetPositions.join(',')}`);
            }
        }

        // ═══ PHASE 19: Difficulty filtering ═══
        // Beginner: prefer scenarios where best action is ≥60% (clear decisions)
        // Expert: prefer scenarios where best action is ≤50% (mixed strategy / close spots)
        // Standard: no filter
        if (difficulty === 'beginner' || difficulty === 'expert') {
            sortedScenarios.sort((a, b) => {
                const maxFreqA = getMaxFrequency(a.strategy_matrix);
                const maxFreqB = getMaxFrequency(b.strategy_matrix);
                if (difficulty === 'beginner') {
                    // Higher max frequency = easier (clear best action)
                    return maxFreqB - maxFreqA;
                }
                // Expert: lower max frequency = harder (mixed strategy)
                return maxFreqA - maxFreqB;
            });
        }

        // IMP-6: Iterate through MORE combinations to reach target count
        const maxAttempts = Math.min(count * 4, sortedScenarios.length * 3);
        for (let i = 0; i < maxAttempts && questions.length < count; i++) {
            const scenario = sortedScenarios[i % sortedScenarios.length];

            // ═══ PHASE 19: Difficulty gate — reject scenarios that don't match difficulty ═══
            if (difficulty !== 'standard') {
                const maxFreq = getMaxFrequency(scenario.strategy_matrix);
                if (difficulty === 'beginner' && maxFreq < 40) continue; // Skip very mixed spots
                if (difficulty === 'expert' && maxFreq > 70) continue;  // Skip trivial spots
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
                console.error('[DeterministicEngine] queryNextStreet exact match error:', exactErr.message);
            }

            if (exactMatches && exactMatches.length > 0) {
                // Found an exact board match — use it
                const scenario = exactMatches[Math.floor(Math.random() * exactMatches.length)];
                const question = this.buildQuestionFromScenario(scenario, gameConfig, 5, 0);

                if (question) {
                    console.log(`[DeterministicEngine] ✅ Multi-street: found ${street} data for board ${boardStr}`);
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
                    console.log(`[DeterministicEngine] ✅ Multi-street: partial semantic match for ${street} (dist: ${minDistance})`);
                    return question;
                }
            }

            // BUG-G FIX: Removed 3rd-tier 'ANY scenario' fallback.
            // Grabbing solver data from a completely different board is misleading —
            // the frequencies don't apply to our board texture. Instead, end the hand cleanly.
            console.log(`[DeterministicEngine] ❌ No ${street} solver data available for ${gameConfig.pioGameType} (no board match)`);
            return null;
        } catch (err) {
            console.error('[DeterministicEngine] queryNextStreet error:', err.message);
            return null;
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

    async fetchSolverPool(gameConfig, level, limit = 25, targetStreet = null) {
        try {
            // ═══ PHASE 15: Allow street override for targeted practice ═══
            const street = targetStreet || this.getStreetForLevel(level);

            // ═══ PHASE 21: Randomized pool fetch for varied training spots ═══
            // Fetch a larger pool then shuffle client-side to avoid repetitive scenarios.
            // Supabase doesn't support ORDER BY random(), so we over-fetch and shuffle.
            const fetchLimit = Math.min(limit * 4, 500);

            const { data, error } = await this.db
                .from('solved_spots_gold')
                .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
                .eq('game_type', gameConfig.pioGameType)
                .eq('stack_depth', gameConfig.pioStackDepth)
                .eq('street', street)
                .limit(fetchLimit);

            if (error || !data || data.length === 0) {
                console.log(`[DeterministicEngine] No solved spots for ${gameConfig.pioGameType} ${street} ${gameConfig.pioStackDepth}bb`);
                return null;
            }

            // Fisher-Yates shuffle for true randomization of training spots
            const shuffled = [...data];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // Return only the requested number of scenarios
            return shuffled.slice(0, limit);
        } catch (err) {
            console.error('[DeterministicEngine] fetchSolverPool error:', err.message);
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
        let allHands = Object.keys(handFreqs).filter(h => h && h.length >= 2);

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
                console.log(`[DeterministicEngine] Context filter: ${preFilterCount} → ${validActions.length} actions (nodeType=${nodeType}) for ${scenario.scenario_hash}`);
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
        const freqSum = Object.values(gtoFrequencies).reduce((s, v) => s + v, 0);
        if (freqSum > 0 && Math.abs(freqSum - 100) > 1) {
            const factor = 100 / freqSum;
            validActions.forEach(action => {
                gtoFrequencies[action] = Math.round(gtoFrequencies[action] * factor);
            });
        }

        // ═══ COMPUTE EV DATA (Real solver values + per-action approximation) ═══
        const heroHandEV = handEVs[heroHand] || 0;
        const allEVs = Object.values(handEVs).filter(v => typeof v === 'number');
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
        const explanation = this.buildExplanation(heroHand, board, scenario.street,
            optimalAction, handActions, heroHandEV, validActions,
            { nodeType, heroPosition, villainPosition, estimatedPot, stackDepth: scenario.stack_depth,
              potType: extractScenarioContext(scenario.scenario_hash, scenario.street, heroPosition, villainPosition).potType });

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

            const chart = charts[Math.floor(Math.random() * charts.length)];
            return this.buildChartQuestion(chart, level);
        } catch (err) {
            console.error('[DeterministicEngine] Chart query error:', err.message);
            return null;
        }
    }

    buildChartQuestion(chart, level) {
        const handMatrix = chart.hand_matrix || {};
        const hands = Object.keys(handMatrix);
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
            id: `chart_${chart.id || chart.chart_id}_${heroHand}_${Date.now()}`,
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
            evData: {
                heroHandEV: pushFreq,
                optimalEV: Math.max(pushFreq, 1 - pushFreq),
                handEVs: {},
                heroHand,
                actionEVs: {
                    push: Math.round(pushFreq * 100) / 100,
                    fold: 0,  // Fold EV is always 0 (you give up your equity)
                },
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
        // Check + Bet options → hero can bet or check (acting first or IP after villain checks)
        if (hasCheck && (hasBet || hasGenericBet)) return 'hero_bets_or_checks';
        if (hasCheck && !hasBet && !hasFold) return 'hero_bets_or_checks'; // Pure check node
        if (actionSet.has('x') && (hasBet || hasGenericBet)) return 'hero_bets_or_checks';

        // Fold + Call/Raise → hero is facing a bet
        if (hasFold && (hasCall || hasRaise || hasAllin)) return 'hero_faces_bet';
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
                return `${villainPosition} checks to ${heroPosition}`;
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
                return `${villainPosition} checks to ${heroPosition}`;
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
            villainAction = `${villainPosition} checks to you`;
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
                return `${preflopLine}${streetLabel}: [${boardStr}]${texturePart}${runoutPart}.${actionContext} ${villainPosition} checks to you.${potPart}${sprPart} You hold ${heroHand} (${handStrength}). Your action?`;
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
        const maxSuitCount = Math.max(...Object.values(suitCounts));
        const isMonotone = maxSuitCount === validBoard.length && validBoard.length >= 3;
        const hasFlushDraw = maxSuitCount >= 2 && !isMonotone;
        const hasFlushComplete = maxSuitCount >= 3 && validBoard.length >= 4;
        const isRainbow = Object.values(suitCounts).every(c => c === 1);

        // ═══ PAIRING ═══
        const rankCounts = {};
        ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
        const maxRankCount = Math.max(...Object.values(rankCounts));
        const isPaired = maxRankCount === 2;
        const isTrips = maxRankCount >= 3;
        const pairedRank = isPaired ? Object.entries(rankCounts).find(([r, c]) => c >= 2)?.[0] : null;

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
        const label = this.getActionLabelGTOW(optimalAction);
        const freq = handActions[optimalAction] || 0;
        const freqPct = (freq * 100).toFixed(0);
        const handStrength = this.categorizeHand(heroHand, board);
        const { nodeType, heroPosition, villainPosition, estimatedPot, stackDepth } = ctx;

        // ═══ PREFLOP-SPECIFIC EXPLANATIONS ═══
        if (street === 'preflop') {
            return this._buildPreflopExplanation(heroHand, optimalAction, handActions, freq, freqPct, label, validActions, nodeType, heroPosition, villainPosition, stackDepth, ctx.potType);
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
        const concept = this._getStrategicConcept(optimalAction, handStrength, texture, street, freq, validActions, handActions, nodeType, heroPosition);

        // ═══ Phase 60: BLOCKER AWARENESS ═══
        const blockerNote = this._getBlockerContext(heroHand, board, handStrength, optimalAction, street, texture);

        // ═══ Phase 61: RANGE ADVANTAGE CONTEXT ═══
        const rangeNote = this._getRangeAdvantageNote(board, street, optimalAction, texture, ctx.nodeType, ctx.heroPosition, ctx.villainPosition, handStrength);

        // ═══ Phase 62: MULTI-STREET PLANNING ═══
        const multiStreetNote = this._getMultiStreetPlan(street, optimalAction, sizePct, handStrength, texture, ctx.estimatedPot, ctx.stackDepth);

        // ═══ Phase 64: POT ODDS & EQUITY MATH ═══
        const potOddsNote = this._getPotOddsMath(optimalAction, handStrength, street, validActions, ctx.estimatedPot, ctx.nodeType);

        // ═══ Phase 42: RIVER-SPECIFIC ENHANCED REASONING ═══
        const riverEnhancement = (street === 'river') ? this._getRiverContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq) : '';

        // ═══ Phase 43: TURN-SPECIFIC ENHANCED REASONING ═══
        const turnEnhancement = (street === 'turn') ? this._getTurnContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq, sizePct) : '';

        // ═══ Phase 46: FLOP-SPECIFIC ENHANCED REASONING ═══
        const flopEnhancement = (street === 'flop') ? this._getFlopContext(heroHand, board, handStrength, optimalAction, texture, nodeType, freq, sizePct) : '';

        // ═══ BUILD FINAL EXPLANATION ═══
        // Street-specific enhancement
        const streetExtra = riverEnhancement || turnEnhancement || flopEnhancement;

        // Combine optional notes
        const extras = [sizingReason, blockerNote, rangeNote, multiStreetNote, potOddsNote].filter(Boolean).map(s => ' ' + s).join('');

        // Pure strategy — one dominant action
        if (freq >= 0.95) {
            return `${heroHand} (${handStrength}): Pure ${label}. ${concept}${extras}${streetExtra ? ' ' + streetExtra : ''}`;
        }

        // Near-pure — one clear best action but some mixing
        if (freq >= 0.70) {
            const altActions = validActions
                .filter(a => a !== optimalAction && handActions[a] > 0.01)
                .sort((a, b) => handActions[b] - handActions[a])
                .slice(0, 2)
                .map(a => `${this.getActionLabelGTOW(a)} ${(handActions[a] * 100).toFixed(0)}%`);
            const mixNote = altActions.length > 0 ? ` Mixes with ${altActions.join(', ')}.` : '';
            return `${heroHand} (${handStrength}): ${label} ${freqPct}%. ${concept}${extras}${streetExtra ? ' ' + streetExtra : ''}${mixNote}`;
        }

        // True mixed strategy — explain WHY the solver mixes
        const mixedParts = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a])
            .slice(0, 4)
            .map(a => `${this.getActionLabelGTOW(a)} ${(handActions[a] * 100).toFixed(0)}%`)
            .join(', ');

        const mixReason = this._getMixingReason(handStrength, texture, street, validActions, handActions);
        return `${heroHand} (${handStrength}): Mixed — ${mixedParts}. ${mixReason}${extras}${streetExtra ? ' ' + streetExtra : ''}`;
    }

    /**
     * Phase 25: Analyze board texture for strategic reasoning.
     */
    _analyzeTexture(board) {
        if (!board || board.length < 3) return { wet: false, highCard: false, paired: false, flushy: false, connected: false, monotone: false };
        const validBoard = board.filter(c => c && typeof c === 'string' && c.length >= 2);
        if (validBoard.length < 3) return { wet: false, highCard: false, paired: false, flushy: false, connected: false, monotone: false };

        const ranks = validBoard.map(c => c[0].toUpperCase());
        const suits = validBoard.map(c => c[1]?.toLowerCase());
        const rankVals = ranks.map(r => '23456789TJQKA'.indexOf(r));

        const suitCounts = {};
        suits.forEach(s => { if (s) suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const maxSuitCount = Math.max(...Object.values(suitCounts));

        const rankCounts = {};
        ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
        const maxRankCount = Math.max(...Object.values(rankCounts));

        const sorted = [...new Set(rankVals)].sort((a, b) => a - b);
        let connected = false;
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i + 1] - sorted[i] <= 2) { connected = true; break; }
        }

        const highCards = rankVals.filter(v => v >= 10).length;
        const highestRank = Math.max(...rankVals);

        return {
            wet: (connected && maxSuitCount >= 2) || maxSuitCount >= 3,
            dry: !connected && maxSuitCount < 2 && maxRankCount >= 2,
            highCard: highCards >= 2 || highestRank >= 12,
            lowBoard: highCards === 0,
            paired: maxRankCount >= 2,
            flushy: maxSuitCount >= 3,
            connected,
            monotone: maxSuitCount === validBoard.length && validBoard.length >= 3,
            aceHigh: highestRank === 12,
            broadwayHeavy: highCards >= 3,
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
    _getStrategicConcept(action, handStrength, texture, street, freq, validActions, handActions, nodeType, heroPosition) {
        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');

        // Phase 68: Position context
        const isIP = heroPosition && ['BTN', 'CO', 'HJ'].includes(heroPosition);
        const isOOP = heroPosition && ['SB', 'BB'].includes(heroPosition);
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
                return 'Betting a straight for value — target two pair, sets, and strong one-pair hands.';
            }
            if (hs.includes('set')) {
                if (texture.wet) return 'Betting a set on a wet board — charge draws heavily. Sets want big pots before the board gets scary.';
                if (texture.dry) return 'Betting a set on a dry board — slow-play is an option, but betting builds the pot for later streets.';
                return 'Value betting a set — targeting top pair and overpairs that can\'t fold.';
            }
            if (hs.includes('two pair')) {
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
            if (hs.includes('OESD') || hs.includes('double gutshot')) {
                if (street === 'river') return 'Bluffing with a missed straight draw — converting busted equity into a river bluff.';
                return 'Semi-bluffing with 8 straight outs — enough equity to make betting very profitable.';
            }
            if (hs.includes('gutshot')) {
                if (street === 'river') return 'Bluffing the river with a busted gutshot — no showdown value, only fold equity.';
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
            const threeFlush = Object.values(suitCounts).some(c => c >= 3);

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
            const flushComplete = Object.values(suitCounts).some(c => c >= 3);

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
        } else if (hs.includes('OESD') || hs.includes('double gutshot')) {
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
            if (hs.includes('OESD') || hs.includes('double gutshot')) {
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
                const hasDraw = hs.includes('draw') || hs.includes('OESD') || hs.includes('flush draw') || hs.includes('gutshot');
                const isTopPair = hs.includes('top pair') || hs.includes('overpair');

                if (sizePct >= 60 && isNutted) {
                    return 'Multi-street plan: Big flop bet → sets up a 60-75% turn barrel → pot-sized river shove. This geometric sizing path gets all the money in by the river.';
                }
                if (sizePct >= 60 && hasDraw) {
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
                if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('OESD')) {
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
                const hasDraw = hs.includes('draw') || hs.includes('OESD') || hs.includes('flush draw');

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
            if (isLowBoard && texture.connected) {
                if (isCheck) return 'Range advantage: Low connected boards favor the caller\'s range — they have more sets, two pair, and straight combos. Checking is often correct as the PFR.';
                if (isBet && hs.includes('overpair')) return 'Range note: Low connected boards favor the caller, but your overpair still needs to bet for protection against the many draws and strong hands in their range.';
            }
            if (isLowBoard && !texture.connected) {
                if (isBet) return 'Range advantage: Low dry boards are close in range advantage — small c-bets with wide range work because neither player connects strongly.';
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
        const flushSuit = Object.entries(suitCounts).find(([s, c]) => c >= 3)?.[0] || null;
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
                if (connectedBoard) {
                    const heroInRange = boardVals.some(bv => Math.abs(v1 - bv) <= 2 || Math.abs(v2 - bv) <= 2);
                    if (heroInRange) blockers.push('Your cards block key straight combos on this connected board');
                }

                if (blockers.length > 0) {
                    return `Blocker effect: ${blockers[0]}${blockers.length > 1 ? '; ' + blockers[1] : ''} — making this a premium bluff candidate.`;
                }
            }

            // Semi-bluffing with draw + blockers
            if (hs.includes('draw') || hs.includes('flush draw') || hs.includes('OESD') || hs.includes('gutshot')) {
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
        const texTag = texture.monotone ? ' on this monotone board' : texture.wet ? ' on this wet board' : texture.paired ? ' on this paired board' : texture.dry ? ' on this dry board' : '';

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
        const r1 = heroHand[0], r2 = heroHand[1];
        const suffix = heroHand.length >= 3 ? heroHand[2] : '';
        const isPair = r1 === r2;
        const isSuited = suffix === 's';
        const rankVal = r => '23456789TJQKA'.indexOf(r);
        const v1 = rankVal(r1), v2 = rankVal(r2);
        const isConnected = Math.abs(v1 - v2) <= 2 && !isPair;
        const isBroadway = v1 >= 9 && v2 >= 9; // T+
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
                        if (!hasAce && !hasKing) return `${heroHand}: Fold vs ${vs}'s 3-bet. ${handDesc} — not enough equity to continue, and no blockers to villain's premium range (AA/KK/AK).${stackContext}`;
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
            const maxBoardSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0];
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

        // Flush first (beats straight in display priority for made hands)
        if (hasFlush) {
            // Check if it's the nut flush
            if (r1 === 'A' || r2 === 'A') madeHand = 'the nut flush';
            else if (heroHigh >= 11) madeHand = 'a strong flush';
            else madeHand = 'a flush';
        }
        // Straight
        else if (hasMadeStraight) {
            madeHand = isNutStraight ? 'the nut straight' : 'a straight';
        }
        // Pair-based hands
        else if (isPair) {
            if (boardRanks.includes(r1)) {
                if (r1BoardCount >= 2) madeHand = 'quads';
                else {
                    const boardHasOtherPair = Object.entries(boardRankCounts)
                        .some(([r, c]) => r !== r1 && c >= 2);
                    madeHand = boardHasOtherPair ? 'a full house' : 'a set';
                }
            } else {
                const boardHasTrips = Object.values(boardRankCounts).some(c => c >= 3);
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
            draws.push('flush draw');
        }

        if (hasMadeStraight) {
            // Already classified
        } else if (hasDoubleGutshot) {
            draws.push('double gutshot (8 outs)');
        } else if (hasOESD) {
            draws.push('OESD');
        } else if (hasGutshot) {
            draws.push('gutshot');
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

    getStreetForLevel(level) {
        if (level <= 3) return 'flop';
        if (level <= 7) return 'turn';
        return 'river';
    }
}

// Export singleton
export const deterministicEngine = new DeterministicGTOEngine();
