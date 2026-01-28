/**
 * 🐴 HORSE POKER GTO - PioSolver-Integrated AI
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Uses solved_spots_gold and memory_charts_gold from Supabase to make
 * GTO-informed decisions. Each horse has personality traits that affect
 * how they interpret and deviate from solver output.
 * 
 * Tables Used:
 * - solved_spots_gold: Postflop GTO solutions with strategy_matrix
 * - memory_charts_gold: Preflop/PushFold/Nash charts
 * - horse_personality: GTO traits per horse
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;
function getSupabase() {
    if (!supabase && SUPABASE_URL && SUPABASE_KEY) {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return supabase;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getHorseHash(profileId) {
    if (!profileId) return 0;
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
        hash = ((hash << 5) - hash) + profileId.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}

// Card utilities
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

function parseCard(card) {
    const rank = card[0];
    const suit = card[1].toLowerCase();
    return { rank, suit, value: RANKS.indexOf(rank) };
}

function formatHand(card1, card2) {
    const c1 = parseCard(card1);
    const c2 = parseCard(card2);

    // Always put higher card first
    const [high, low] = c1.value >= c2.value ? [c1, c2] : [c2, c1];

    if (high.rank === low.rank) {
        return `${high.rank}${low.rank}`; // Pair: "AA"
    } else if (high.suit === low.suit) {
        return `${high.rank}${low.rank}s`; // Suited: "AKs"
    } else {
        return `${high.rank}${low.rank}o`; // Offsuit: "AKo"
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE CONSTRUCTION FROM SOLVER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get preflop range from memory_charts_gold
 * @param {string} chartName - e.g., "BTN_Open_100bb_6Max"
 * @returns {Object} Chart grid with hand actions
 */
export async function getPreflopRange(chartName) {
    const sb = getSupabase();
    if (!sb) return null;

    const { data, error } = await sb
        .from('memory_charts_gold')
        .select('chart_grid')
        .eq('chart_name', chartName)
        .single();

    if (error || !data) return null;
    return data.chart_grid;
}

/**
 * Get postflop strategy from solved_spots_gold
 * @param {Object} params - Query parameters
 * @returns {Object} Strategy matrix for all hands
 */
export async function getPostflopStrategy(params) {
    const { board, street, stackDepth, gameType, topology, mode } = params;
    const sb = getSupabase();
    if (!sb) return null;

    const { data, error } = await sb
        .from('solved_spots_gold')
        .select('strategy_matrix, macro_metrics')
        .eq('street', street)
        .eq('stack_depth', stackDepth)
        .eq('game_type', gameType)
        .eq('topology', topology)
        .eq('mode', mode)
        .contains('board_cards', board)
        .single();

    if (error || !data) return null;
    return data;
}

/**
 * Build opponent range based on their actions
 * @param {Array} actions - List of opponent actions
 * @param {string} position - Opponent position
 * @returns {Object} Estimated range
 */
export function constructOpponentRange(actions, position) {
    let rangeWidth = 100; // Start with 100% of hands
    let rangeStrength = 'balanced';

    for (const action of actions) {
        switch (action.type) {
            case 'raise':
                rangeWidth *= 0.6; // Raising narrows range
                rangeStrength = 'strong';
                break;
            case 'call':
                rangeWidth *= 0.8; // Calling is wider
                rangeStrength = 'capped'; // No premium hands
                break;
            case 'check':
                rangeStrength = 'weak_or_trapping';
                break;
            case 'bet':
                rangeWidth *= 0.7;
                rangeStrength = action.size > 0.75 ? 'polarized' : 'merged';
                break;
        }
    }

    return {
        estimatedWidth: Math.max(5, rangeWidth),
        strength: rangeStrength,
        position,
        actionsObserved: actions.length
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCKER AWARENESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate blocker effects
 * @param {Array} holeCards - Hero's hole cards
 * @param {Array} board - Board cards
 * @returns {Object} Blocker analysis
 */
export function analyzeBlockers(holeCards, board) {
    const allCards = [...holeCards, ...board].map(parseCard);
    const heroCards = holeCards.map(parseCard);

    // Check for key blockers
    const blockers = {
        blocksNutFlush: false,
        blocksNutStraight: false,
        blocksTopSet: false,
        blocksOverpairs: [],
        bluffValue: 0
    };

    // Check flush blockers
    const suitCounts = {};
    for (const card of allCards) {
        suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }

    for (const suit of SUITS) {
        if (suitCounts[suit] >= 3) {
            // Potential flush on board
            const heroHasAce = heroCards.some(c => c.rank === 'A' && c.suit === suit);
            if (heroHasAce) {
                blockers.blocksNutFlush = true;
                blockers.bluffValue += 15;
            }
        }
    }

    // Check if we block overpairs
    const boardHighCard = Math.max(...board.map(c => parseCard(c).value));
    for (const card of heroCards) {
        if (card.value > boardHighCard) {
            blockers.blocksOverpairs.push(card.rank);
            blockers.bluffValue += 5;
        }
    }

    // Check top set blocker
    const boardRanks = board.map(c => parseCard(c).rank);
    for (const card of heroCards) {
        if (boardRanks.includes(card.rank)) {
            blockers.blocksTopSet = true;
            blockers.bluffValue += 10;
        }
    }

    return blockers;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARD TEXTURE READING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze board texture
 * @param {Array} board - Board cards
 * @returns {Object} Texture analysis
 */
export function analyzeBoardTexture(board) {
    const cards = board.map(parseCard);

    // Suit analysis
    const suitCounts = {};
    for (const card of cards) {
        suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }
    const maxSuitCount = Math.max(...Object.values(suitCounts));

    // Rank analysis
    const ranks = cards.map(c => c.value).sort((a, b) => b - a);
    const gaps = [];
    for (let i = 0; i < ranks.length - 1; i++) {
        gaps.push(ranks[i] - ranks[i + 1]);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    // High card info
    const highCard = ranks[0];
    const hasAce = highCard === 12;
    const hasFaceCards = ranks.some(r => r >= 9);

    // Determine texture type
    let texture, connectedness, flushPossibility;

    // Flush analysis
    if (maxSuitCount >= 4) flushPossibility = 'complete';
    else if (maxSuitCount === 3) flushPossibility = 'draw';
    else if (maxSuitCount === 2) flushPossibility = 'backdoor';
    else flushPossibility = 'rainbow';

    // Connectedness
    if (avgGap <= 1.5) connectedness = 'connected';
    else if (avgGap <= 3) connectedness = 'semi-connected';
    else connectedness = 'disconnected';

    // Overall texture
    if (flushPossibility === 'complete' || (flushPossibility === 'draw' && connectedness === 'connected')) {
        texture = 'wet';
    } else if (flushPossibility === 'rainbow' && connectedness === 'disconnected') {
        texture = 'dry';
    } else {
        texture = 'medium';
    }

    return {
        texture,
        connectedness,
        flushPossibility,
        highCard: RANKS[highCard],
        hasAce,
        hasFaceCards,
        pairOnBoard: new Set(ranks).size !== ranks.length,
        // Strategy implications
        cbetFrequency: texture === 'dry' ? 0.75 : texture === 'wet' ? 0.45 : 0.60,
        checkRaiseFrequency: texture === 'wet' ? 0.15 : 0.08
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITION-BASED RANGES
// ═══════════════════════════════════════════════════════════════════════════

const POSITION_RANGES = {
    'UTG': { openingWidth: 12, defendWidth: 0 },
    'UTG+1': { openingWidth: 14, defendWidth: 0 },
    'MP': { openingWidth: 18, defendWidth: 0 },
    'LJ': { openingWidth: 22, defendWidth: 0 },
    'HJ': { openingWidth: 26, defendWidth: 0 },
    'CO': { openingWidth: 32, defendWidth: 8 },
    'BTN': { openingWidth: 45, defendWidth: 18 },
    'SB': { openingWidth: 40, defendWidth: 25 },
    'BB': { openingWidth: 0, defendWidth: 40 }
};

/**
 * Get position-adjusted range width
 * @param {string} position - Player position
 * @param {string} scenario - 'opening' or 'defending'
 * @param {string} profileId - Horse ID for personality adjustment
 * @returns {number} Range width percentage
 */
export function getPositionRange(position, scenario, profileId = null) {
    const baseRange = POSITION_RANGES[position] || { openingWidth: 20, defendWidth: 15 };
    let width = scenario === 'opening' ? baseRange.openingWidth : baseRange.defendWidth;

    // Apply personality adjustment if provided
    if (profileId) {
        const hash = getHorseHash(profileId);
        const adjustment = (hash % 10) - 5; // -5 to +4 adjustment
        width = Math.max(5, Math.min(60, width + adjustment));
    }

    return width;
}

// ═══════════════════════════════════════════════════════════════════════════
// BET SIZING FROM SOLVER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get solver-recommended bet size
 * @param {Object} strategyData - From solved_spots_gold
 * @param {string} hand - Hand string (e.g., "AKs")
 * @returns {Object} Sizing recommendation
 */
export function getSolverSizing(strategyData, hand) {
    if (!strategyData?.strategy_matrix?.[hand]) {
        return { size: 0.66, confidence: 'default' };
    }

    const handData = strategyData.strategy_matrix[hand];
    const raiseAction = handData.actions?.Raise || handData.actions?.Bet;

    if (!raiseAction) {
        return { size: 0.66, confidence: 'no_raise_action' };
    }

    // Parse size string (e.g., "66%", "75%", "150%")
    const sizeStr = raiseAction.size || '66%';
    const size = parseFloat(sizeStr) / 100;

    return {
        size,
        frequency: raiseAction.freq,
        ev: raiseAction.ev,
        confidence: 'solver'
    };
}

/**
 * Get sizing tell pattern for a horse
 * @param {string} profileId - Horse ID
 * @returns {Object} Sizing tell behavior
 */
export function getSizingTell(profileId) {
    const hash = getHorseHash(profileId);
    const patterns = [
        { type: 'balanced', valueSize: 0.66, bluffSize: 0.66, hasTell: false },
        { type: 'big_value', valueSize: 0.85, bluffSize: 0.50, hasTell: true },
        { type: 'small_value', valueSize: 0.50, bluffSize: 0.75, hasTell: true },
        { type: 'polarized', valueSize: 1.0, bluffSize: 1.0, hasTell: false },
        { type: 'merged', valueSize: 0.33, bluffSize: 0.33, hasTell: false }
    ];

    return patterns[hash % patterns.length];
}

/**
 * Calculate pot geometry for river jam
 * @param {number} potSize - Current pot
 * @param {number} effectiveStack - Effective stack
 * @param {string} street - Current street
 * @returns {Object} Sizing strategy for geometric sizing
 */
export function calculatePotGeometry(potSize, effectiveStack, street) {
    const spr = effectiveStack / potSize;

    // Streets remaining
    const streetsLeft = street === 'Flop' ? 3 : street === 'Turn' ? 2 : 1;

    // Calculate geometric sizing to get stacks in by river
    // Formula: (1 + size)^streets = (stack + pot) / pot
    const targetRatio = (effectiveStack + potSize) / potSize;
    const geometricMultiplier = Math.pow(targetRatio, 1 / streetsLeft);
    const geometricSize = geometricMultiplier - 1;

    return {
        spr,
        streetsLeft,
        geometricSize: Math.min(2.0, Math.max(0.25, geometricSize)),
        canJamRiver: spr <= 3,
        strategy: spr > 6 ? 'slow_build' : spr > 3 ? 'geometric' : 'commit_now'
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ICM & TOURNAMENT AWARENESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get ICM adjustment factor
 * @param {Object} tourneyState - Tournament state
 * @param {string} profileId - Horse ID
 * @returns {Object} ICM adjustments
 */
export function getICMAdjustment(tourneyState, profileId) {
    const { playersRemaining, payJump, avgStack, heroStack, bubbleDistance } = tourneyState;

    // Calculate ICM pressure
    let icmPressure = 0;

    // Bubble pressure
    if (bubbleDistance !== undefined && bubbleDistance <= 5) {
        icmPressure += (6 - bubbleDistance) * 0.1;
    }

    // Pay jump pressure
    if (payJump && payJump > heroStack * 0.1) {
        icmPressure += 0.2;
    }

    // Stack size relative pressure
    const stackRelative = heroStack / avgStack;
    if (stackRelative > 1.5) {
        icmPressure += 0.15; // Big stack should avoid marginal spots
    } else if (stackRelative < 0.5) {
        icmPressure -= 0.1; // Short stack should take chances
    }

    // Apply personality (some horses ignore ICM)
    const hash = getHorseHash(profileId);
    const icmIgnoreChance = (hash % 20) / 100; // 0-19% chance to ignore

    if (Math.random() < icmIgnoreChance) {
        icmPressure = 0;
    }

    return {
        icmPressure: Math.min(0.5, Math.max(-0.2, icmPressure)),
        rangeAdjustment: 1 - (icmPressure * 0.3),
        bluffAdjustment: 1 - (icmPressure * 0.5),
        callAdjustment: 1 - (icmPressure * 0.4),
        strategy: icmPressure > 0.3 ? 'survival' : icmPressure > 0.1 ? 'cautious' : 'standard'
    };
}

/**
 * Get stack-depth strategy adjustment
 * @param {number} stackBB - Stack in big blinds
 * @returns {Object} Strategy mode
 */
export function getStackDepthStrategy(stackBB) {
    if (stackBB <= 10) {
        return {
            mode: 'push_fold',
            openStrategy: 'jam_only',
            defendStrategy: 'call_or_fold',
            playPostflop: false
        };
    }

    if (stackBB <= 20) {
        return {
            mode: 'short_stack',
            openStrategy: 'raise_or_jam',
            defendStrategy: 'tight_3bet_or_fold',
            playPostflop: true,
            floatFrequency: 0.05
        };
    }

    if (stackBB <= 40) {
        return {
            mode: 'medium_stack',
            openStrategy: 'standard_raise',
            defendStrategy: 'balanced_3bet',
            playPostflop: true,
            floatFrequency: 0.12
        };
    }

    return {
        mode: 'deep_stack',
        openStrategy: 'full_range',
        defendStrategy: 'wide_3bet_4bet',
        playPostflop: true,
        floatFrequency: 0.20
    };
}

/**
 * Get blind stealing frequency adjustment
 * @param {number} blindLevel - Current blind level
 * @param {number} avgStack - Average stack
 * @returns {Object} Stealing adjustments
 */
export function getBlindPressure(blindLevel, avgStack) {
    const avgBB = avgStack / blindLevel;

    if (avgBB > 50) {
        return {
            stealFrequency: 1.0,
            reStealFrequency: 1.0,
            mode: 'early_stage'
        };
    }

    if (avgBB > 25) {
        return {
            stealFrequency: 1.2,
            reStealFrequency: 1.3,
            mode: 'middle_stage'
        };
    }

    return {
        stealFrequency: 1.5,
        reStealFrequency: 1.6,
        mode: 'late_stage'
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION & META-GAME DYNAMICS
// ═══════════════════════════════════════════════════════════════════════════

// Session tracking
const sessionHistory = new Map();

/**
 * Record session action
 * @param {string} profileId - Horse ID
 * @param {string} action - Action taken
 * @param {number} result - BB won/lost
 */
export function recordSessionAction(profileId, action, result) {
    const session = sessionHistory.get(profileId) || {
        startTime: Date.now(),
        actions: [],
        handsPlayed: 0,
        totalResult: 0,
        recentPots: []
    };

    session.actions.push({ action, result, time: Date.now() });
    session.handsPlayed++;
    session.totalResult += result;
    session.recentPots.push(result);
    if (session.recentPots.length > 20) session.recentPots.shift();

    sessionHistory.set(profileId, session);
}

/**
 * Get session-based strategy adjustment
 * @param {string} profileId - Horse ID
 * @returns {Object} Session adjustments
 */
export function getSessionAdjustment(profileId) {
    const session = sessionHistory.get(profileId);
    if (!session) {
        return { adjustment: 'standard', modifier: 1.0 };
    }

    const sessionMinutes = (Date.now() - session.startTime) / (1000 * 60);

    // First 30 minutes: tighter/observing
    if (sessionMinutes < 30) {
        return {
            adjustment: 'early_session',
            rangeModifier: 0.9,
            bluffModifier: 0.8,
            reason: 'Still observing table dynamics'
        };
    }

    // After 2 hours: potentially fatigued
    if (sessionMinutes > 120) {
        return {
            adjustment: 'late_session',
            rangeModifier: 0.95,
            bluffModifier: 0.9,
            reason: 'Session fatigue, playing tighter'
        };
    }

    // Running hot
    if (session.totalResult > 10) {
        return {
            adjustment: 'running_hot',
            rangeModifier: 1.0,
            bluffModifier: 0.85,
            reason: 'Protecting winnings'
        };
    }

    // Running cold
    if (session.totalResult < -10) {
        return {
            adjustment: 'running_cold',
            rangeModifier: 1.05,
            bluffModifier: 1.1,
            reason: 'Trying to get unstuck'
        };
    }

    return { adjustment: 'mid_session', rangeModifier: 1.0, bluffModifier: 1.0 };
}

/**
 * Analyze table dynamics
 * @param {Array} tableStats - Stats for each player at table
 * @returns {Object} Table dynamics assessment
 */
export function analyzeTableDynamics(tableStats) {
    if (!tableStats || tableStats.length === 0) {
        return { tableType: 'unknown', adjustment: 1.0 };
    }

    const avgVPIP = tableStats.reduce((sum, p) => sum + (p.vpip || 25), 0) / tableStats.length;
    const avgPFR = tableStats.reduce((sum, p) => sum + (p.pfr || 15), 0) / tableStats.length;

    if (avgVPIP > 35) {
        return {
            tableType: 'loose',
            adjustment: 0.85, // Tighten up, value hands more
            bluffAdjustment: 0.7, // Bluff less
            isoRaiseMore: true
        };
    }

    if (avgVPIP < 20) {
        return {
            tableType: 'tight',
            adjustment: 1.15, // Widen up
            bluffAdjustment: 1.3, // Bluff more
            stealMore: true
        };
    }

    if (avgPFR > 20) {
        return {
            tableType: 'aggressive',
            adjustment: 0.9,
            threeBetLight: true,
            trapMore: true
        };
    }

    return {
        tableType: 'balanced',
        adjustment: 1.0,
        bluffAdjustment: 1.0
    };
}

/**
 * Get heat check (cooldown after winning streak)
 * @param {string} profileId - Horse ID
 * @returns {Object} Heat check status
 */
export function getHeatCheck(profileId) {
    const session = sessionHistory.get(profileId);
    if (!session || session.recentPots.length < 3) {
        return { isHot: false, cooldownActive: false };
    }

    // Check last 5 pots
    const last5 = session.recentPots.slice(-5);
    const wins = last5.filter(r => r > 0).length;

    if (wins >= 4) {
        // Won 4+ of last 5 - apply cooldown
        return {
            isHot: true,
            cooldownActive: true,
            rangeAdjustment: 0.85,
            reason: 'Hot streak - tightening to protect'
        };
    }

    const losses = last5.filter(r => r < 0).length;
    if (losses >= 4) {
        return {
            isHot: false,
            coldStreak: true,
            rangeAdjustment: 0.9,
            reason: 'Cold streak - playing careful'
        };
    }

    return { isHot: false, cooldownActive: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER DECISION FUNCTION (GTO-INTEGRATED)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make GTO-informed decision using PioSolver data
 * @param {string} profileId - Horse ID
 * @param {Object} gameState - Current game state
 * @returns {Object} Decision with action, sizing, and reasoning
 */
export async function makeGTODecision(profileId, gameState) {
    const {
        holeCards,
        board,
        street,
        position,
        stackBB,
        potSize,
        toCall,
        gameType = 'Cash',
        topology = '6-Max',
        mode = 'ChipEV',
        tourneyState = null
    } = gameState;

    const hand = formatHand(holeCards[0], holeCards[1]);
    const hash = getHorseHash(profileId);

    // 1. Get solver data
    let solverStrategy = null;
    if (board.length >= 3) {
        solverStrategy = await getPostflopStrategy({
            board: board.slice(0, 3),
            street,
            stackDepth: Math.round(stackBB / 20) * 20, // Round to nearest 20
            gameType,
            topology,
            mode
        });
    }

    // 2. Analyze board texture
    const texture = board.length >= 3 ? analyzeBoardTexture(board) : null;

    // 3. Check blockers
    const blockers = board.length >= 3 ? analyzeBlockers(holeCards, board) : null;

    // 4. Get position range
    const positionWidth = getPositionRange(position, 'defending', profileId);

    // 5. Apply ICM if tournament
    let icmAdjust = null;
    if (tourneyState) {
        icmAdjust = getICMAdjustment(tourneyState, profileId);
    }

    // 6. Get stack depth strategy
    const stackStrategy = getStackDepthStrategy(stackBB);

    // 7. Get session/meta adjustments
    const sessionAdjust = getSessionAdjustment(profileId);
    const heatCheck = getHeatCheck(profileId);

    // 8. Get solver recommendation
    let solverAction = null;
    let solverFreq = null;

    if (solverStrategy?.strategy_matrix?.[hand]) {
        const handData = solverStrategy.strategy_matrix[hand];
        solverAction = handData.best_action;

        // Apply mixed strategy based on personality
        if (handData.is_mixed) {
            const biases = {
                aggressive: { Raise: 1.2, Call: 0.9, Fold: 0.8 },
                defensive: { Raise: 0.8, Call: 1.15, Fold: 1.0 },
                balanced: { Raise: 1.0, Call: 1.0, Fold: 1.0 }
            };

            const bias = hash % 3 === 0 ? 'aggressive' : hash % 3 === 1 ? 'defensive' : 'balanced';
            const multipliers = biases[bias];

            // Adjust frequencies
            let adjustedRaise = (handData.actions.Raise?.freq || 0) * multipliers.Raise;
            let adjustedCall = (handData.actions.Call?.freq || 0) * multipliers.Call;
            let adjustedFold = (handData.actions.Fold?.freq || 0) * multipliers.Fold;

            // Normalize
            const total = adjustedRaise + adjustedCall + adjustedFold;
            adjustedRaise /= total;
            adjustedCall /= total;
            adjustedFold /= total;

            // Pick action based on adjusted frequencies
            const roll = Math.random();
            if (roll < adjustedRaise) solverAction = 'Raise';
            else if (roll < adjustedRaise + adjustedCall) solverAction = 'Call';
            else solverAction = 'Fold';
        }
    }

    // 9. Apply all adjustments
    let finalAction = solverAction || 'Call';
    let sizing = 0.66;

    // ICM adjustment
    if (icmAdjust && icmAdjust.icmPressure > 0.2 && finalAction === 'Raise') {
        if (Math.random() < icmAdjust.icmPressure) {
            finalAction = 'Call';
        }
    }

    // Heat check adjustment
    if (heatCheck.cooldownActive && finalAction === 'Raise') {
        if (Math.random() < 0.3) {
            finalAction = 'Call';
        }
    }

    // Get sizing from solver or geometry
    if (finalAction === 'Raise') {
        if (solverStrategy) {
            const sizingData = getSolverSizing(solverStrategy, hand);
            sizing = sizingData.size;
        } else {
            const geometry = calculatePotGeometry(potSize, stackBB, street);
            sizing = geometry.geometricSize;
        }

        // Apply sizing tell
        const sizingTell = getSizingTell(profileId);
        if (sizingTell.hasTell && Math.random() < 0.3) {
            // Sometimes reveal tell
            sizing = blockers?.bluffValue > 10 ? sizingTell.bluffSize : sizingTell.valueSize;
        }
    }

    return {
        action: finalAction,
        sizing: Math.round(sizing * 100) / 100,
        hand,
        reasoning: {
            solverBased: !!solverStrategy,
            texture: texture?.texture,
            blockerValue: blockers?.bluffValue || 0,
            icmPressure: icmAdjust?.icmPressure || 0,
            stackMode: stackStrategy.mode,
            sessionAdjustment: sessionAdjust.adjustment
        }
    };
}

export default {
    // Range Construction
    getPreflopRange,
    getPostflopStrategy,
    constructOpponentRange,

    // Blockers
    analyzeBlockers,

    // Board Texture
    analyzeBoardTexture,

    // Position
    getPositionRange,
    POSITION_RANGES,

    // Bet Sizing
    getSolverSizing,
    getSizingTell,
    calculatePotGeometry,

    // Tournament/ICM
    getICMAdjustment,
    getStackDepthStrategy,
    getBlindPressure,

    // Session/Meta
    recordSessionAction,
    getSessionAdjustment,
    analyzeTableDynamics,
    getHeatCheck,

    // Master Decision
    makeGTODecision,

    // Utilities
    formatHand,
    parseCard
};
