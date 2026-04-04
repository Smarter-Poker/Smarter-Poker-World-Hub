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
            // GTOW-style preflop: "6-Max Cash 100bb • CO — Folded to you. You hold AKs. Your action?"
            const stackPart = stackStr ? ` ${stackStr}` : '';
            const prefix = formatStr ? `${formatStr}${stackPart} • ` : (stackPart ? `${stackPart} • ` : '');
            if (nodeType === 'preflop_open') {
                return `${prefix}${heroPosition} — Folded to you. You hold ${heroHand}. Your action?`;
            } else if (nodeType === 'preflop_facing_raise') {
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
            // Infer villain bet size from the raise options available
            // If solver offers raise sizes, villain's bet was proportional to pot
            const raiseActions = solverActions.filter(a => a.toLowerCase().startsWith('r'));
            const hasSmallRaise = raiseActions.some(a => /r(50|75)/.test(a.toLowerCase()));
            const hasLargeRaise = raiseActions.some(a => /r(100|200|300)/.test(a.toLowerCase()));
            villainAction = `${villainPosition} bets`;
        } else {
            villainAction = `${villainPosition} checks to you`;
        }

        // ═══ Phase 29: Action line context from scenario hash ═══
        const actionContext = context.actionLine ? ` [${context.actionLine} line]` : '';

        switch (nodeType) {
            case 'hero_bets_or_checks':
                return `${preflopLine}${streetLabel}: [${boardStr}]${texturePart}${runoutPart}.${actionContext} ${villainPosition} checks to you.${sprPart} You hold ${heroHand} (${handStrength}). Your action?`;
            case 'hero_faces_bet':
                return `${preflopLine}${streetLabel}: [${boardStr}]${texturePart}${runoutPart}.${actionContext} ${villainAction}.${sprPart} You hold ${heroHand} (${handStrength}). Your action?`;
            default:
                return `${preflopLine}${streetLabel}: [${boardStr}]${texturePart}${runoutPart}.${actionContext}${sprPart} You hold ${heroHand} (${handStrength}). Your action?`;
        }
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

        // Check if it's a blank/brick (low card, no draws completed)
        if (impacts.length === 0) {
            if (newVal <= 5) impacts.push('brick — low card changes nothing');
            else impacts.push('relatively blank runout');
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
        const concept = this._getStrategicConcept(optimalAction, handStrength, texture, street, freq, validActions, handActions);

        // ═══ BUILD FINAL EXPLANATION ═══
        // Pure strategy — one dominant action
        if (freq >= 0.95) {
            return `${heroHand} (${handStrength}): Pure ${label}. ${concept}${sizingReason ? ' ' + sizingReason : ''}`;
        }

        // Near-pure — one clear best action but some mixing
        if (freq >= 0.70) {
            const altActions = validActions
                .filter(a => a !== optimalAction && handActions[a] > 0.01)
                .sort((a, b) => handActions[b] - handActions[a])
                .slice(0, 2)
                .map(a => `${this.getActionLabelGTOW(a)} ${(handActions[a] * 100).toFixed(0)}%`);
            const mixNote = altActions.length > 0 ? ` Mixes with ${altActions.join(', ')}.` : '';
            return `${heroHand} (${handStrength}): ${label} ${freqPct}%. ${concept}${sizingReason ? ' ' + sizingReason : ''}${mixNote}`;
        }

        // True mixed strategy — explain WHY the solver mixes
        const mixedParts = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a])
            .slice(0, 4)
            .map(a => `${this.getActionLabelGTOW(a)} ${(handActions[a] * 100).toFixed(0)}%`)
            .join(', ');

        const mixReason = this._getMixingReason(handStrength, texture, street, validActions, handActions);
        return `${heroHand} (${handStrength}): Mixed — ${mixedParts}. ${mixReason}`;
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
        const isAir = hs.includes('air') || hs.includes('overcard') || hs.includes('no pair');
        const isOverpair = hs.includes('overpair');

        // Small bets (16-33%)
        if (sizePct <= 33) {
            if (isNutted && texture.dry) return 'Small sizing with a nutted hand on a dry board — keeping villain in the pot and building it gradually.';
            if (isTopPair && texture.dry) return 'Small sizing with top pair on a dry board — few draws to worry about, extract thin value.';
            if (isAir && street === 'flop') return 'Small c-bet bluff — minimal risk with maximum frequency, attacking a capped range.';
            if (texture.aceHigh) return 'Small sizing on ace-high texture leverages range advantage — villain folds or calls with weak pairs.';
            if (texture.dry || texture.paired) return 'Small sizing on a static board denies equity cheaply.';
            if (street === 'flop') return 'Efficient c-bet sizing — small bets work across the entire range on this texture.';
            return 'Small sizing minimizes risk while applying pressure.';
        }

        // Medium bets (40-66%)
        if (sizePct <= 66) {
            if (isNutted && texture.wet) return 'Medium sizing builds the pot with a nutted hand while charging draws.';
            if (isTopPair && texture.connected) return 'Medium sizing with top pair on a connected board — charge draws and protect equity.';
            if (isDraw && texture.wet) return 'Semi-bluff sizing — enough fold equity to be profitable, plus backup equity when called.';
            if (isOverpair) return 'Medium sizing with an overpair — extract value while keeping worse pairs calling.';
            if (street === 'turn') return 'Medium turn bet sets up a pot-sized river shove — geometric sizing.';
            if (texture.wet || texture.connected) return 'Medium sizing on a coordinated board charges draws and builds value.';
            return 'Medium sizing balances the betting range — enough to build the pot, not so much that only better hands call.';
        }

        // Large bets (75-100%)
        if (sizePct <= 100) {
            if (isNutted) return 'Large sizing to maximize value from a monster — villain is priced in with strong hands.';
            if (isDraw && street !== 'river') return 'Large semi-bluff — maximum fold equity with a draw, and still profitable if called.';
            if (isAir && street === 'river') return 'Pot-sized bluff polarizes — looks like the nuts, putting villain in a tough spot.';
            if (texture.flushy || texture.monotone) return 'Large sizing on a flushy board — strong hands bet big, draws are priced out.';
            if (street === 'river') return 'Pot-sized river bet polarizes between value and bluffs.';
            return 'Large sizing polarizes — betting this big commits to the hand\'s story.';
        }

        // Overbets (125%+) / All-in
        if (sizePct >= 125 || sizePct === 999) {
            if (isNutted && street === 'river') return 'Overbet with the nuts on the river — extracting maximum value from hands that can\'t fold.';
            if (isNutted) return 'Overbet builds a massive pot with a nutted hand — villain\'s bluff-catchers are put to the test.';
            if (isAir && street === 'river') return 'Overbet bluff on the river — representing the nuts with maximum pressure. Villain must be very strong to call.';
            if (isDraw && sizePct === 999) return 'All-in semi-bluff — maximum fold equity plus draw equity creates a profitable jam.';
            return 'Overbet applies extreme pressure — only the strongest hands can continue.';
        }

        return '';
    }

    /**
     * Phase 25: Identify the core strategic concept behind the solver's action.
     */
    _getStrategicConcept(action, handStrength, texture, street, freq, validActions, handActions) {
        const a = action.toLowerCase();
        const isBet = a.startsWith('b') || a === 'allin';
        const isCheck = a === 'c' || a === 'x';
        const isFold = a === 'f';
        const isCall = a === 'call';
        const isRaise = a.startsWith('r');

        // ═══ CHECKING CONCEPTS ═══
        if (isCheck) {
            if (handStrength.includes('top pair') || handStrength.includes('overpair')) {
                return 'Pot control with a strong-but-vulnerable hand — checking protects against raises and keeps the pot manageable.';
            }
            if (handStrength.includes('set') || handStrength.includes('two pair') || handStrength.includes('full house')) {
                return 'Trapping with a monster — checking to induce bets or delayed c-bet opponents.';
            }
            if (handStrength.includes('draw')) {
                return 'Taking a free card with draw equity — checking preserves the option to realize equity without bloating the pot.';
            }
            if (handStrength.includes('air') || handStrength.includes('no pair') || handStrength.includes('overcard')) {
                return 'Giving up with air — no equity to bet for value and insufficient fold equity to bluff.';
            }
            if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                return 'Check with marginal showdown value — too weak to bet for value, too strong to bluff.';
            }
            return 'Checking to control the pot size and realize equity.';
        }

        // ═══ BETTING CONCEPTS ═══
        if (isBet) {
            if (handStrength.includes('set') || handStrength.includes('straight') || handStrength.includes('flush') || handStrength.includes('full house') || handStrength.includes('quads')) {
                return 'Value betting a nutted hand — extracting maximum chips from worse holdings.';
            }
            if (handStrength.includes('top pair') && (handStrength.includes('strong kicker') || handStrength.includes('overpair'))) {
                return 'Value betting a strong made hand — targeting worse pairs and draws.';
            }
            if (handStrength.includes('top pair')) {
                if (texture.wet) return 'Betting for value and protection on a wet board — charge draws while ahead.';
                return 'Betting top pair for value — targeting weaker pairs and high cards.';
            }
            if (handStrength.includes('draw') || handStrength.includes('OESD') || handStrength.includes('flush draw')) {
                if (street === 'river') return 'Bluffing the river with a missed draw — converting busted equity into fold equity.';
                return 'Semi-bluffing with draw equity — fold equity now plus backup equity if called.';
            }
            if (handStrength.includes('air') || handStrength.includes('no pair') || handStrength.includes('overcard')) {
                if (street === 'river') return 'Pure bluff on the river — only way to win with air.';
                return 'Bluffing as part of a balanced strategy — keeping the opponent guessing.';
            }
            if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                return 'Thin value bet — targeting worse pairs or turning the hand into a bluff.';
            }
            return 'Betting for value and protection.';
        }

        // ═══ CALLING CONCEPTS ═══
        if (isCall) {
            if (handStrength.includes('draw')) {
                return 'Calling with draw equity — pot odds justify continuing to chase the draw.';
            }
            if (handStrength.includes('top pair') || handStrength.includes('overpair') || handStrength.includes('set')) {
                return 'Calling a strong hand — flatting to keep bluffs in and control the pot.';
            }
            if (street === 'river') {
                return 'Bluff-catching on the river — calling to pick off opponent\'s bluffs.';
            }
            if (handStrength.includes('second pair') || handStrength.includes('bottom pair')) {
                return 'Calling with a marginal hand that\'s ahead of enough bluffs to be profitable.';
            }
            return 'Calling to see another card and realize equity.';
        }

        // ═══ RAISING CONCEPTS ═══
        if (isRaise) {
            if (handStrength.includes('set') || handStrength.includes('two pair') || handStrength.includes('straight') || handStrength.includes('flush')) {
                return 'Raising for value with a monster — building the pot while ahead.';
            }
            if (handStrength.includes('draw')) {
                return 'Semi-bluff raise — leveraging fold equity plus draw equity to create a profitable play.';
            }
            if (handStrength.includes('air') || handStrength.includes('overcard')) {
                return 'Bluff raise — attacking the opponent\'s capped range with maximum aggression.';
            }
            return 'Raising to build the pot and apply pressure.';
        }

        // ═══ FOLDING CONCEPTS ═══
        if (isFold) {
            if (handStrength.includes('draw')) {
                return 'Folding a draw — bet sizing prices out the draw, making calling unprofitable.';
            }
            if (handStrength.includes('pair')) {
                return 'Folding a marginal made hand — facing too much aggression to continue profitably.';
            }
            return 'Folding — the hand lacks sufficient equity against the opponent\'s range.';
        }

        return '';
    }

    /**
     * Phase 25: Explain WHY the solver uses a mixed strategy here.
     */
    _getMixingReason(handStrength, texture, street, validActions, handActions) {
        // Find the top two actions
        const sorted = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a]);

        if (sorted.length < 2) return 'Close decision — nearly pure.';

        const top = sorted[0].toLowerCase();
        const second = sorted[1].toLowerCase();
        const topIsBet = top.startsWith('b') || top === 'allin';
        const topIsCheck = top === 'c' || top === 'x';
        const secondIsBet = second.startsWith('b') || second === 'allin';
        const secondIsCheck = second === 'c' || second === 'x';

        // Check vs Bet mix
        if ((topIsCheck && secondIsBet) || (topIsBet && secondIsCheck)) {
            if (handStrength.includes('top pair') || handStrength.includes('overpair')) {
                return 'Mixing bet/check with a strong hand — betting always would make the checking range too weak, so the solver balances both.';
            }
            if (handStrength.includes('draw')) {
                return 'Mixing semi-bluff/check with draw equity — the solver uses this hand as a bluff sometimes while checking to realize equity other times.';
            }
            if (handStrength.includes('set') || handStrength.includes('two pair')) {
                return 'Trapping vs. value betting — sometimes slow-playing to disguise strength, sometimes building the pot immediately.';
            }
            return 'Indifferent between betting and checking — the solver balances both to keep its ranges unexploitable.';
        }

        // Multiple bet sizes
        if (topIsBet && secondIsBet) {
            return 'Mixing between bet sizes — the solver uses different sizings to maximize EV against different parts of the opponent\'s range.';
        }

        // Call vs Raise mix
        if ((top === 'call' && (second.startsWith('r') || second === 'allin')) ||
            ((top.startsWith('r') || top === 'allin') && second === 'call')) {
            return 'Mixing call/raise — sometimes flatting to keep bluffs in, sometimes raising to build the pot and deny equity.';
        }

        // Fold vs Call mix
        if ((top === 'f' && second === 'call') || (top === 'call' && second === 'f')) {
            return 'Marginal spot at the bottom of the calling range — close between folding and calling, the solver is near-indifferent.';
        }

        return 'Multiple actions have similar EV — the solver randomizes to stay unexploitable.';
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
                    if (isEarlyPos) return `${heroHand}: Pure fold from ${posName}. ${handDesc} — too weak to open with so many players behind.${stackNote}`;
                    if (isLatePos) return `${heroHand}: Fold from ${posName}. Despite being in position, ${handDesc} doesn't have enough equity to open profitably.${stackNote}`;
                    if (isBlind) return `${heroHand}: Fold from ${posName}. ${handDesc} — even with the positional discount, this hand plays too poorly postflop.${stackNote}`;
                    return `${heroHand}: Fold from ${posName}. ${handDesc} is outside the opening range.${stackNote}`;
                }
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
                        if (isAx && isSuited) return `${heroHand}: Pure 4-bet bluff vs ${vs}'s 3-bet. ${handDesc} blocks aces in villain's value range and has nut potential if called.${stackContext}`;
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
                        if (isAx && isSuited) return `${heroHand}: Pure 3-bet vs ${vs}. ${handDesc} has great playability as a 3-bet bluff — blockers, suitedness, and nut potential.${stackContext}`;
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
            case 'UTG': case 'UTG+1': return 'Early position requires a tight opening range — many players left to act behind.';
            case 'MP': case 'MP+1': return 'Middle position allows a slightly wider range, but still conservative.';
            case 'HJ': return 'The hijack starts to open wider, leveraging fold equity with fewer players behind.';
            case 'CO': return 'The cutoff opens wide — great steal position with only the button and blinds behind.';
            case 'BTN': return 'The button has the widest opening range — guaranteed positional advantage postflop.';
            case 'SB': return 'SB opens into only the BB — wide range but out of position postflop.';
            case 'BB': return 'BB checking option — you already have money invested.';
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

        // Check standard windows
        let bestStraightTop = -1;
        for (let start = 0; start <= 8; start++) {
            const window = [start, start + 1, start + 2, start + 3, start + 4];
            const have = window.filter(v => allValsSet.has(v)).length;
            const heroContributes = window.includes(v1) || window.includes(v2);
            if (have === 5 && heroContributes) {
                hasMadeStraight = true;
                if (start + 4 > bestStraightTop) bestStraightTop = start + 4;
            } else if (have === 4 && heroContributes) {
                straightOuts++;
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
        }

        if (!hasMadeStraight) {
            if (straightOuts >= 2) hasOESD = true;
            else if (straightOuts === 1) hasGutshot = true;
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
        } else if (hasOESD) {
            draws.push('OESD');
        } else if (hasGutshot) {
            draws.push('gutshot');
        }

        // Backdoor draws on flop only (not shown on turn/river)
        if (validBoard.length === 3 && !madeHand && draws.length === 0) {
            const bdDraws = [];
            if (hasBackdoorFlush) bdDraws.push('backdoor flush draw');
            if (hasBackdoorStraight) bdDraws.push('backdoor straight draw');
            if (bdDraws.length > 0) {
                // With overcards, backdoor draws add playability
                if (heroHigh > highestBoardVal && heroLow > highestBoardVal) {
                    return `two overcards + ${bdDraws.join(' + ')}`;
                }
                if (heroHigh > highestBoardVal) {
                    return `one overcard + ${bdDraws.join(' + ')}`;
                }
                return bdDraws.join(' + ');
            }
        }

        if (madeHand && draws.length > 0) {
            return `${madeHand} + ${draws.join(' + ')}`;
        }
        if (madeHand) return madeHand;
        if (draws.length > 0) {
            if (draws.length >= 2) return `combo draw (${draws.join(' + ')})`;
            return draws[0];
        }

        // No made hand, no draw
        if (heroHigh > highestBoardVal && heroLow > highestBoardVal) return 'two overcards';
        if (heroHigh > highestBoardVal) return 'one overcard';
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
