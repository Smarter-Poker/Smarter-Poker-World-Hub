/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATA-DRIVEN GAMELOOP: 5-Step Pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This replaces the old text-parsing approach with structured data ingestion.
 * 
 * STEP 1: Data Ingestion (Source of Truth)
 * STEP 2: State Initialization (The Setup)
 * STEP 3: Action Replay (The Movie)
 * STEP 4: Interaction & Logic
 * STEP 5: Session Continuity (The Loop)
 */

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: DATA INGESTION (Source of Truth)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load structured game data from PioSolver/TRAINING_CLINICS
 * @param {object} rawQuestion - Question data from database
 * @returns {object} - Structured game state
 */
export const loadGameData = (rawQuestion) => {
    // ─────────────────────────────────────────────────────────────────────────
    // REQUIRED FIELDS VALIDATION
    // ─────────────────────────────────────────────────────────────────────────
    if (!rawQuestion) {
        throw new Error('CRITICAL: No question data provided');
    }

    // Extract or infer topology (seat count)
    const topology = rawQuestion.topology || inferTopology(rawQuestion);

    // Extract or calculate button position
    const buttonPosition = rawQuestion.button_position ?? calculateButtonPosition(rawQuestion.position, topology);

    // Extract or generate action history
    const actionHistory = rawQuestion.action_history || generateActionHistory(rawQuestion);

    // Extract or build effective stacks
    const effectiveStacks = rawQuestion.effective_stacks || buildEffectiveStacks(rawQuestion);

    // ─────────────────────────────────────────────────────────────────────────
    // STRUCTURED GAME STATE
    // ─────────────────────────────────────────────────────────────────────────
    return {
        // Core identifiers
        id: rawQuestion.id,
        gameType: rawQuestion.game_type || 'MTT',

        // Table configuration
        topology,
        buttonPosition,
        blindLevels: {
            sb: 0.5,
            bb: 1.0,
            ante: 0
        },

        // Player state
        heroPosition: rawQuestion.position || 'BTN',
        heroCards: rawQuestion.hero_cards || rawQuestion.heroCards || ['As', 'Kh'],
        heroStack: rawQuestion.stackDepth || rawQuestion.stack_depth || 25,

        // Action chain
        actionHistory,
        effectiveStacks,

        // Board state
        boardCards: rawQuestion.board_cards || [],
        street: rawQuestion.street || 'Preflop',

        // GTO data
        strategyMatrix: rawQuestion.strategy_matrix || {},
        solutionKey: rawQuestion.correctAction || rawQuestion.correct_action,

        // Metadata
        explanation: rawQuestion.explanation || '',
        lawId: rawQuestion.lawId
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Infer topology from question context
 */
const inferTopology = (question) => {
    const text = (question.explanation || question.villainAction || '').toLowerCase();

    // Check for ICM/MTT keywords → 9-max
    if (text.includes('icm') || text.includes('tournament') || text.includes('bubble')) {
        return 9;
    }

    // Check for position keywords
    if (text.includes('utg') || text.includes('mp') || text.includes('hj')) {
        return 9; // These positions only exist in 9-max
    }

    // Default to heads-up
    return 2;
};

/**
 * Calculate button position from hero position
 */
const calculateButtonPosition = (heroPosition, topology) => {
    const POSITION_TO_SEAT = {
        9: {
            'UTG': 1,
            'UTG+1': 2,
            'MP': 3,
            'HJ': 4,
            'CO': 5,
            'BTN': 6,
            'SB': 7,
            'BB': 8
        },
        6: {
            'UTG': 1,
            'MP': 2,
            'CO': 3,
            'BTN': 4,
            'SB': 5,
            'BB': 6
        },
        2: {
            'SB': 0,
            'BB': 1
        }
    };

    const seatMap = POSITION_TO_SEAT[topology] || POSITION_TO_SEAT[2];
    const heroSeat = seatMap[heroPosition] || 0;

    // Button is always at seat 6 in 9-max, seat 4 in 6-max, seat 0 in HU
    const buttonSeat = topology === 9 ? 6 : topology === 6 ? 4 : 0;

    return buttonSeat;
};

/**
 * Generate action history from villain action text
 */
const generateActionHistory = (question) => {
    const villainAction = question.villainAction || question.villain_action || '';
    const topology = question.topology || inferTopology(question);
    const heroPosition = question.position || 'BTN';

    const history = [];

    // Parse "Folds to You" → Everyone folded
    if (villainAction.toLowerCase().includes('folds to you')) {
        // Add fold actions for all seats before hero
        const heroSeat = getHeroSeat(heroPosition, topology);
        for (let i = 1; i < heroSeat; i++) {
            history.push({
                seat: i,
                position: getSeatPosition(i, topology),
                action: 'Fold'
            });
        }
        return history;
    }

    // Parse "CO raises to 2.5BB" → Specific villain action
    const actionMatch = villainAction.match(/^(UTG|MP|HJ|CO|BTN|SB|BB)\s+(.+)/i);
    if (actionMatch) {
        const position = actionMatch[1].toUpperCase();
        const action = actionMatch[2];
        const seat = getPositionSeat(position, topology);

        // Add folds before this villain
        for (let i = 1; i < seat; i++) {
            history.push({
                seat: i,
                position: getSeatPosition(i, topology),
                action: 'Fold'
            });
        }

        // Add villain's action
        const amountMatch = action.match(/([\d.]+)\s*bb/i);
        history.push({
            seat,
            position,
            action: action.includes('All-In') || action.includes('Shoves') ? 'All-In' :
                action.includes('Raise') || action.includes('raise') ? 'Raise' :
                    action.includes('Call') || action.includes('call') ? 'Call' : 'Raise',
            amount: amountMatch ? parseFloat(amountMatch[1]) : 2.5
        });

        return history;
    }

    // Default: Single villain action
    return [{
        seat: 1,
        position: 'UTG',
        action: 'Raise',
        amount: 2.5
    }];
};

/**
 * Build effective stacks object
 */
const buildEffectiveStacks = (question) => {
    const heroStack = question.stackDepth || question.stack_depth || 25;
    const villains = {};

    // Parse villain stack from action
    const villainAction = question.villainAction || '';
    const stackMatch = villainAction.match(/\((\d+)BB\)/);
    if (stackMatch) {
        villains[1] = parseInt(stackMatch[1]);
    }

    return {
        hero: heroStack,
        villains
    };
};

/**
 * Get hero seat index from position
 */
const getHeroSeat = (position, topology) => {
    const POSITION_TO_SEAT = {
        9: { 'UTG': 1, 'UTG+1': 2, 'MP': 3, 'HJ': 4, 'CO': 5, 'BTN': 6, 'SB': 7, 'BB': 8 },
        6: { 'UTG': 1, 'MP': 2, 'CO': 3, 'BTN': 4, 'SB': 5, 'BB': 6 },
        2: { 'SB': 0, 'BB': 1 }
    };
    return POSITION_TO_SEAT[topology]?.[position] || 0;
};

/**
 * Get position seat index
 */
const getPositionSeat = (position, topology) => {
    return getHeroSeat(position, topology);
};

/**
 * Get position name from seat index
 */
const getSeatPosition = (seat, topology) => {
    const SEAT_TO_POSITION = {
        9: ['Hero', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
        6: ['Hero', 'UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'],
        2: ['SB', 'BB']
    };
    return SEAT_TO_POSITION[topology]?.[seat] || 'Unknown';
};

// ═══════════════════════════════════════════════════════════════════════════
// ADDITIONAL HELPERS FOR BACKWARD COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate pot size from action history
 */
export const calculatePotSize = (gameData) => {
    let pot = 1.5; // SB + BB

    gameData.actionHistory.forEach(action => {
        if (action.amount) {
            pot += action.amount;
        }
    });

    return Math.round(pot * 10) / 10;
};

/**
 * Format villain action for display
 */
export const formatVillainAction = (actionHistory) => {
    if (!actionHistory || actionHistory.length === 0) {
        return 'Folds to You';
    }

    const lastAction = actionHistory[actionHistory.length - 1];
    const { position, action, amount } = lastAction;

    if (action === 'Fold') {
        return 'Folds to You';
    }

    if (action === 'All-In') {
        return `${position} Shoves All-In${amount ? ` (${amount}BB)` : ''}`;
    }

    if (action === 'Raise') {
        return `${position} Raises to ${amount || 2.5}BB`;
    }

    if (action === 'Call') {
        return `${position} Calls`;
    }

    return `${position} ${action}`;
};

export default loadGameData;

