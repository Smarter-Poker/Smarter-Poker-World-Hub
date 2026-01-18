/**
 * 🎲 POKER SCENARIO GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Procedural generation of poker training scenarios.
 * Generates complete PokerState objects with action logs for simulation.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Card suits and ranks
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

// Position names for 9-max
const POSITIONS = ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN'];

// Avatar pool
const AVATARS = [
    "/avatars/vip/viking_warrior.png",
    "/avatars/free/wizard.png",
    "/avatars/free/ninja.png",
    "/avatars/vip/wolf.png",
    "/avatars/vip/spartan.png",
    "/avatars/vip/pharaoh.png",
    "/avatars/free/pirate.png",
    "/avatars/free/cowboy.png",
    "/avatars/free/fox.png"
];

/**
 * Generate a complete poker scenario for a given level
 * @param {number} levelNum - Level number (1-20)
 * @returns {PokerState} Complete poker state with action log
 */
export function generateLevel(levelNum) {
    // Seed random for deterministic generation
    const seed = levelNum * 12345;
    const rng = seededRandom(seed);

    // Generate deck
    const deck = shuffleDeck(createDeck(), rng);

    // Deal cards
    const heroCards = [deck.pop(), deck.pop()];
    const board = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];

    // Generate players (9-max)
    const players = POSITIONS.map((position, idx) => ({
        id: position === 'BTN' ? 'hero' : `v${idx + 1}`,
        position,
        stack: 20 + Math.floor(rng() * 40), // 20-60 BB
        avatar: AVATARS[idx],
        folded: false,
        bet: 0
    }));

    // Generate action log based on level difficulty
    const actionLog = generateActionLog(players, levelNum, rng);

    // Calculate pot from action log
    const pot = calculatePot(actionLog);

    // Generate question based on scenario
    const question = generateQuestion(heroCards, board, actionLog, levelNum);

    return {
        level: levelNum,
        players,
        pot,
        board,
        heroCards,
        actionLog,
        question,
        correctAnswer: determineCorrectAnswer(heroCards, board, actionLog, levelNum)
    };
}

/**
 * Generate action log (script of events)
 */
function generateActionLog(players, levelNum, rng) {
    const log = [];
    let delay = 0;

    // Deal cards to all players
    players.forEach((player, idx) => {
        log.push({
            type: 'deal',
            playerId: player.id,
            delay: delay + (idx * 100) // 100ms per card
        });
    });
    delay += players.length * 100;

    // Post blinds
    log.push({
        type: 'blind',
        playerId: 'v2', // BB
        amount: 1.0,
        label: 'BB Ante',
        delay: delay + 500
    });
    delay += 500;

    log.push({
        type: 'blind',
        playerId: 'v1', // SB
        amount: 0.5,
        label: 'SB',
        delay: delay + 500
    });
    delay += 500;

    log.push({
        type: 'blind',
        playerId: 'v2', // BB
        amount: 1.0,
        label: 'BB',
        delay: delay + 500
    });
    delay += 500;

    // Pre-flop action (based on level difficulty)
    const numFolds = Math.min(5, 2 + Math.floor(levelNum / 4));

    for (let i = 0; i < numFolds; i++) {
        log.push({
            type: 'fold',
            playerId: `v${i + 3}`, // UTG, UTG+1, etc.
            delay: delay + 200
        });
        delay += 200;
    }

    // Raise from CO (player to Hero's right)
    const raiseSize = 2.5 + (rng() * 2); // 2.5-4.5 BB
    log.push({
        type: 'bet',
        playerId: 'v8', // CO
        amount: raiseSize,
        label: `${raiseSize.toFixed(1)} BB`,
        delay: delay + 500
    });

    return log;
}

/**
 * Calculate pot from action log
 */
function calculatePot(actionLog) {
    return actionLog
        .filter(a => a.type === 'blind' || a.type === 'bet')
        .reduce((sum, a) => sum + a.amount, 0);
}

/**
 * Generate question text
 */
function generateQuestion(heroCards, board, actionLog, levelNum) {
    const raiseAction = actionLog.find(a => a.type === 'bet');
    const raiseSize = raiseAction?.amount || 2.5;

    return `You are on the Button (last to act). The player to your right raises to ${raiseSize.toFixed(1)} big blinds. What is your best move?`;
}

/**
 * Determine correct answer (simplified for demo)
 */
function determineCorrectAnswer(heroCards, board, actionLog, levelNum) {
    // Simplified logic - in production, use GTO solver
    const heroStrength = evaluateHandStrength(heroCards);

    if (heroStrength > 0.7) return 'raise';
    if (heroStrength > 0.4) return 'call';
    return 'fold';
}

/**
 * Evaluate hand strength (0-1)
 */
function evaluateHandStrength(cards) {
    // Simplified - just check for high cards
    const ranks = cards.map(c => RANKS.indexOf(c.rank));
    const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    return avgRank / RANKS.length;
}

/**
 * Create a standard 52-card deck
 */
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ rank, suit });
        }
    }
    return deck;
}

/**
 * Shuffle deck using seeded RNG
 */
function shuffleDeck(deck, rng) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Seeded random number generator
 */
function seededRandom(seed) {
    let state = seed;
    return function () {
        state = (state * 9301 + 49297) % 233280;
        return state / 233280;
    };
}

/**
 * Generate multiple levels in background
 * Uses requestIdleCallback for non-blocking generation
 */
export function generateLevelsInBackground(startLevel, endLevel, onProgress, onComplete) {
    const levels = [];
    let currentLevel = startLevel;

    function generateNext(deadline) {
        while ((deadline.timeRemaining() > 0 || deadline.didTimeout) && currentLevel <= endLevel) {
            const levelData = generateLevel(currentLevel);
            levels.push(levelData);

            if (onProgress) {
                onProgress(currentLevel, endLevel);
            }

            currentLevel++;
        }

        if (currentLevel <= endLevel) {
            // More work to do
            requestIdleCallback(generateNext, { timeout: 1000 });
        } else {
            // All done
            if (onComplete) {
                onComplete(levels);
            }
        }
    }

    // Start generation
    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(generateNext, { timeout: 1000 });
    } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
            for (let i = startLevel; i <= endLevel; i++) {
                levels.push(generateLevel(i));
            }
            if (onComplete) {
                onComplete(levels);
            }
        }, 0);
    }
}
