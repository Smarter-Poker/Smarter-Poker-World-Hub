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
    if (!scenarioHash) return { preflopAction: '', actionLine: '', gameFormat: '' };

    const parts = scenarioHash.toLowerCase().split('_');
    let gameFormat = '';
    let actionLine = '';
    let preflopAction = '';

    // Detect game format
    if (parts.includes('hu') || parts.includes('heads') || parts.includes('2max')) gameFormat = 'Heads Up';
    else if (parts.includes('6max') || parts.includes('6-max')) gameFormat = '6-Max';
    else if (parts.includes('9max') || parts.includes('9-max')) gameFormat = '9-Max';
    else if (parts.includes('3max') || parts.includes('spin') || parts.includes('spins')) gameFormat = 'Spins 3-Max';

    // Detect action sequence tokens in hash
    // 'xr' = check-raise, 'cb' = continuation bet, 'x' = check, 'b' = bet, 'r' = raise
    const actionTokens = parts.filter(p => /^(xr|cb|x|b|r|3b|4b|limp|open|squeeze)$/.test(p));

    if (actionTokens.length > 0) {
        const actionLabels = {
            'xr': 'check-raise',
            'cb': 'c-bet',
            'x': 'check',
            'b': 'bet',
            'r': 'raise',
            '3b': '3-bet',
            '4b': '4-bet',
            'limp': 'limp',
            'open': 'open',
            'squeeze': 'squeeze',
        };
        actionLine = actionTokens.map(t => actionLabels[t] || t).join(' → ');
    }

    // Build preflop action description based on positions
    if (street !== 'preflop') {
        // Infer likely preflop action from positions
        const ipPositions = ['BTN', 'CO', 'HJ', 'MP'];
        const blinds = ['SB', 'BB'];

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

    return { preflopAction, actionLine, gameFormat };
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
    async generateBatch({ gameId, level, count = 25, gameConfig, targetPositions, targetStreet }) {
        if (!gameConfig) return [];

        const questions = [];
        const usedQuestionIds = new Set();
        const usedHandScenarios = new Set(); // IMP-6: track heroHand+scenario combos

        // ═══ PHASE 15: Targeted practice — fetch pool with optional position/street filters ═══
        const poolSize = Math.min(count * 3, 75);
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

        // IMP-6: Iterate through MORE combinations to reach target count
        const maxAttempts = Math.min(count * 4, sortedScenarios.length * 3);
        for (let i = 0; i < maxAttempts && questions.length < count; i++) {
            const scenario = sortedScenarios[i % sortedScenarios.length];

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
            const { data: exactMatches, error: exactErr } = await supabase
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
            const { data: partialMatches } = await supabase
                .from('solved_spots_gold')
                .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
                .eq('game_type', gameConfig.pioGameType)
                .eq('stack_depth', gameConfig.pioStackDepth)
                .eq('street', street)
                .ilike('scenario_hash', `%${flopStr}%`)
                .limit(5);

            if (partialMatches && partialMatches.length > 0) {
                const scenario = partialMatches[Math.floor(Math.random() * partialMatches.length)];
                const question = this.buildQuestionFromScenario(scenario, gameConfig, 5, 0);

                if (question) {
                    // Override board with our actual board (partial match may have different turn/river)
                    question.scenario.board = boardCards.join(' ');
                    question.boardCards = boardCards;
                    console.log(`[DeterministicEngine] ✅ Multi-street: partial match for ${street} (flop: ${flopStr})`);
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

            const { data, error } = await supabase
                .from('solved_spots_gold')
                .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix')
                .eq('game_type', gameConfig.pioGameType)
                .eq('stack_depth', gameConfig.pioStackDepth)
                .eq('street', street)
                .limit(limit);

            if (error || !data || data.length === 0) {
                console.log(`[DeterministicEngine] No solved spots for ${gameConfig.pioGameType} ${street} ${gameConfig.pioStackDepth}bb`);
                return null;
            }

            return data;
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
        const validActions = [];
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

        if (!optimalAction || validActions.length === 0) return null;

        // ═══ BUILD GTO FREQUENCIES (0-100 scale) ═══
        const gtoFrequencies = {};
        validActions.forEach(action => {
            gtoFrequencies[action] = Math.round((handActions[action] || 0) * 100);
        });

        // IMP-4: Frequency normalization validation — ensure frequencies sum to ~100%
        const freqSum = Object.values(gtoFrequencies).reduce((s, v) => s + v, 0);
        if (freqSum > 0 && Math.abs(freqSum - 100) > 1) {
            // Normalize and log warning
            const factor = 100 / freqSum;
            validActions.forEach(action => {
                gtoFrequencies[action] = Math.round(gtoFrequencies[action] * factor);
            });
            console.warn(`[DeterministicEngine] ⚠️ Frequencies summed to ${freqSum}%, normalized for ${heroHand} in ${scenario.scenario_hash}`);
        }

        // ═══ COMPUTE EV DATA (Real solver values only — no fabrication) ═══
        const heroHandEV = handEVs[heroHand] || 0;
        const allEVs = Object.values(handEVs).filter(v => typeof v === 'number');
        const maxHandEV = allEVs.length > 0 ? Math.max(...allEVs) : heroHandEV;
        // BUG-A FIX: Removed fabricated actionEVs (heroHandEV * freq is nonsensical)
        // Per-action EV requires per-action EV data from the solver, which we don't have.
        // The frontend uses frequency deviation for EV loss instead.

        // ═══ EXTRACT BOARD & POSITION DATA ═══
        const board = parseBoardFromHash(scenario.scenario_hash);
        const heroPosition = extractPositionFromHash(scenario.scenario_hash);
        const villainPosition = VILLAIN_MAP[heroPosition] || 'BB';
        const estimatedPot = strategyMatrix.pot || POT_BY_STREET[scenario.street] || 6;

        // ═══ BUILD OPTIONS — GTO WIZARD STYLE ═══
        // Show ALL real solver actions (up to 9). Only add context-appropriate
        // fillers when solver provides fewer than 2 actions.
        // GTO Wizard shows exactly the actions the solver has for this spot.
        const options = validActions.slice(0, 9).map(action => ({
            id: action,
            text: this.getActionLabel(action, estimatedPot),
            frequency: gtoFrequencies[action],
        }));

        // ═══ CONTEXT-AWARE FILLER LOGIC ═══
        // Determine the decision node type from solver actions to know what's valid.
        // If solver provides ≥2 actions, trust the solver completely — no fillers needed.
        // If solver provides only 1 action, add ONE contextually valid alternative.
        if (options.length < 2) {
            const existingIds = new Set(options.map(o => o.id));
            const nodeType = this.detectNodeType(validActions, scenario.street);

            // Only add fillers that are contextually valid for this node type
            const contextFillers = this.getContextualFillers(nodeType, existingIds, estimatedPot);

            for (const filler of contextFillers) {
                if (options.length >= 3) break; // Cap at 3 for single-action solver spots
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
            optimalAction, handActions, heroHandEV, validActions);

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
                nodeType: this.detectNodeType(validActions, scenario.street),
                context: extractScenarioContext(scenario.scenario_hash, scenario.street, heroPosition, villainPosition),
                isMixedStrategy,
            },
            heroCards: parseHandToCards(heroHand, board),
            // SYS-002 FIX: Populate boardCards array for PNG card rendering
            boardCards: board.length > 0 ? board : [],
            question: this.buildQuestionText(heroHand, board, scenario.street, heroPosition, villainPosition, validActions, estimatedPot, scenario.scenario_hash),
            options,
            correctAnswer: optimalAction,
            correctAnswerText: this.getActionLabel(optimalAction, estimatedPot),
            // ═══ REAL SOLVER DATA ═══
            frequencies: handActions,         // Raw 0.0-1.0 per action
            gtoFrequencies,                   // Percentage 0-100 per action for UI
            rawFrequencies: frequencies,       // Full per-hand matrix
            evData: {
                heroHandEV,
                optimalEV: maxHandEV,
                handEVs,
                heroHand,
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
            const { data: charts, error } = await supabase
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
        const hasBet = [...actionSet].some(a => a.startsWith('b'));
        const hasFold = actionSet.has('f');
        const hasCall = actionSet.has('call') || [...actionSet].some(a => a === 'c' && hasBet); // 'c' can mean call in some contexts
        const hasRaise = [...actionSet].some(a => a.startsWith('r'));

        if (street === 'preflop') {
            if (hasRaise && hasFold && !hasBet) return 'preflop_facing_raise';
            if (hasRaise && hasFold) return 'preflop_open';
            return 'preflop_open';
        }

        // Postflop: if solver has Check + Bet options → hero can bet or check (acting first or IP after check)
        if (hasCheck && hasBet) return 'hero_bets_or_checks';
        if (hasCheck && !hasBet && !hasFold) return 'hero_bets_or_checks'; // Pure check node

        // If solver has Fold + Call/Raise → hero is facing a bet
        if (hasFold && (hasCall || hasRaise)) return 'hero_faces_bet';
        if (hasFold && hasBet) return 'hero_faces_bet'; // Some solvers use 'b' for raise facing bet

        // Fallback: infer from presence of check vs fold
        if (hasCheck) return 'hero_bets_or_checks';
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
     * Replaces the hardcoded "Villain checks" with accurate descriptions.
     */
    buildActionDescription(solverActions, street, heroPosition, villainPosition) {
        if (street === 'preflop') {
            return ''; // Preflop action context comes from scenario description
        }

        const nodeType = this.detectNodeType(solverActions, street);

        switch (nodeType) {
            case 'hero_bets_or_checks':
                return `${villainPosition} checks`;
            case 'hero_faces_bet':
                return `${villainPosition} bets`;
            default:
                return `${villainPosition} checks`;
        }
    }

    /**
     * Build a rich, contextual question text — GTO Wizard style.
     * Instead of generic "What is the GTO play?", describe the full spot.
     */
    buildQuestionText(heroHand, board, street, heroPosition, villainPosition, solverActions, pot, scenarioHash) {
        const nodeType = this.detectNodeType(solverActions, street);
        const boardStr = board.length > 0 ? board.join(' ') : '';
        const context = extractScenarioContext(scenarioHash, street, heroPosition, villainPosition);

        if (street === 'preflop') {
            return `${heroPosition} — You hold ${heroHand}. What is your action?`;
        }

        const handStrength = this.categorizeHand(heroHand, board);
        const preflopLine = context.preflopAction ? `${context.preflopAction}. ` : '';

        switch (nodeType) {
            case 'hero_bets_or_checks':
                return `${preflopLine}${street.charAt(0).toUpperCase() + street.slice(1)}: [${boardStr}]. ${villainPosition} checks. You hold ${heroHand} (${handStrength}). Your action?`;
            case 'hero_faces_bet':
                return `${preflopLine}${street.charAt(0).toUpperCase() + street.slice(1)}: [${boardStr}]. ${villainPosition} bets. You hold ${heroHand} (${handStrength}). Your action?`;
            default:
                return `${preflopLine}${street.charAt(0).toUpperCase() + street.slice(1)}: [${boardStr}]. You hold ${heroHand} (${handStrength}). Your action?`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Get human-readable action label with pot-relative BB sizing
     */
    getActionLabel(actionCode, potSize = 6) {
        if (ACTION_LABELS[actionCode]) return ACTION_LABELS[actionCode];

        // Parse bet sizes like "b33" → "Bet 33%"
        const betMatch = actionCode.match(/^b(\d+)$/);
        if (betMatch) {
            const pct = parseInt(betMatch[1]);
            const bbAmount = (potSize * pct / 100).toFixed(1);
            return `Bet ${bbAmount} BB (${pct}%)`;
        }

        const raiseMatch = actionCode.match(/^r(\d+)$/);
        if (raiseMatch) {
            const pct = parseInt(raiseMatch[1]);
            return `Raise ${pct}%`;
        }

        return actionCode.toUpperCase();
    }

    /**
     * Build deterministic explanation from solver data (no AI)
     */
    buildExplanation(heroHand, board, street, optimalAction, handActions, ev, validActions) {
        const label = ACTION_LABELS[optimalAction] || optimalAction;
        const freq = handActions[optimalAction] || 0;
        const freqPct = (freq * 100).toFixed(0);

        // Identify hand strength category
        const handStrength = this.categorizeHand(heroHand, board);

        if (freq >= 0.95) {
            return `GTO solver: Pure ${label} (${freqPct}%). ${heroHand} is ${handStrength} on [${board.join(' ')}]. ` +
                `This is a clear ${label.toLowerCase()} in the solver's strategy.`;
        }

        // Mixed strategy explanation
        const mixedParts = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a])
            .map(a => `${ACTION_LABELS[a] || a} ${(handActions[a] * 100).toFixed(0)}%`)
            .join(', ');

        return `GTO solver mixes: ${mixedParts}. ${heroHand} is ${handStrength} on [${board.join(' ')}]. ` +
            `The highest-frequency play is ${label} at ${freqPct}%.` +
            (freq < 0.6 ? ` This is a close spot — both actions are valid in GTO.` : '');
    }

    buildChartExplanation(heroHand, chart, pushFreq, correctAction) {
        const pct = (pushFreq * 100).toFixed(0);
        const pos = chart.hero_position || chart.position || 'BTN';
        const stack = chart.stack_depth || 15;

        if (correctAction === 'push') {
            return `ICM chart: ${heroHand} is a ${pct}% push from ${pos} at ${stack}BB. ` +
                `The hand has sufficient equity and fold equity to make shoving profitable.`;
        }
        return `ICM chart: ${heroHand} is only a ${pct}% push from ${pos} at ${stack}BB. ` +
            `The hand lacks the equity needed to profitably shove at this stack depth.`;
    }

    /**
     * Categorize hand strength relative to board (deterministic, no AI)
     */
    categorizeHand(heroHand, board) {
        if (!heroHand || heroHand.length < 2) return 'a hand';
        if (!board || board.length === 0) return 'a preflop hand';

        const r1 = heroHand[0].toUpperCase();
        const r2 = heroHand[1].toUpperCase();
        const isPair = r1 === r2;
        const isHighCard = ['A', 'K', 'Q', 'J'].includes(r1);
        const boardRanks = board.map(c => c[0].toUpperCase());

        if (isPair) {
            if (boardRanks.includes(r1)) return 'a set';
            const rankOrder = RANKS.indexOf(r1);
            const highestBoard = Math.max(...boardRanks.map(r => RANKS.indexOf(r)));
            if (rankOrder > highestBoard) return 'an overpair';
            if (rankOrder === highestBoard - 1) return 'a second pair';
            return 'an underpair';
        }

        if (boardRanks.includes(r1) && boardRanks.includes(r2)) return 'two pair';
        if (boardRanks.includes(r1)) return `top pair` + (isHighCard ? ' with a strong kicker' : '');
        if (boardRanks.includes(r2)) return 'a pair with the board';

        return isHighCard ? 'high cards' : 'a drawing hand';
    }

    getStreetForLevel(level) {
        if (level <= 3) return 'flop';
        if (level <= 7) return 'turn';
        return 'river';
    }
}

// Export singleton
export const deterministicEngine = new DeterministicGTOEngine();
