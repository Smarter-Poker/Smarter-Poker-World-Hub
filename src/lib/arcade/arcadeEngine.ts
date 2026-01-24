/**
 * DIAMOND ARCADE ENGINE
 * Core game logic for all arcade games
 * 10% house rake on all winnings
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ArcadeGame {
    id: string;
    name: string;
    description: string;
    category: 'speed' | 'skill' | 'jackpot';
    entryFee: number;
    maxPrize: number;
    durationSeconds: number;
    questionsCount: number;
    icon: string;
    color: string;
    isBonus?: boolean;
}

export interface GameSession {
    id: string;
    gameId: string;
    entryFee: number;
    score: number;
    correctCount: number;
    totalQuestions: number;
    timeSpentMs: number;
    streak: number;
}

export interface GameResult {
    won: boolean;
    accuracy: number;
    basePrize: number;
    rake: number;
    streakBonus: number;
    finalPrize: number;
    newStreak: number;
    multiplier: number;
}

export interface HandData {
    cards: [string, string];
    name?: string;
}

export interface BoardData {
    cards: string[];
}

export interface HandSnapQuestion {
    hand1: HandData;
    hand2: HandData;
    board: string[];
    correctAnswer: 1 | 2;
    timeLimit: number;
}

export interface BoardNutsQuestion {
    board: string[];
    options: [string, string][];
    correctIndex: number;
    explanation: string;
}

export interface ChipMathQuestion {
    pot: number;
    bet: number;
    options: string[];
    correctIndex: number;
    explanation: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const ARCADE_GAMES: Record<string, ArcadeGame> = {
    'hand-snap': {
        id: 'hand-snap',
        name: 'Hand Snap',
        description: 'Two hands flash - tap the winner FAST!',
        category: 'speed',
        entryFee: 10,
        maxPrize: 50,
        durationSeconds: 60,
        questionsCount: 20,
        icon: '⚡',
        color: '#fbbf24'
    },
    'board-nuts': {
        id: 'board-nuts',
        name: 'Board Nuts',
        description: 'Identify the nuts from 4 options',
        category: 'speed',
        entryFee: 15,
        maxPrize: 75,
        durationSeconds: 60,
        questionsCount: 15,
        icon: '🎯',
        color: '#22c55e'
    },
    'chip-math': {
        id: 'chip-math',
        name: 'Chip Math',
        description: 'Quick pot odds calculations',
        category: 'speed',
        entryFee: 10,
        maxPrize: 50,
        durationSeconds: 60,
        questionsCount: 20,
        icon: '🔢',
        color: '#3b82f6'
    },
    'showdown': {
        id: 'showdown',
        name: 'Showdown!',
        description: 'Rank 5 hands from best to worst',
        category: 'speed',
        entryFee: 20,
        maxPrize: 100,
        durationSeconds: 90,
        questionsCount: 10,
        icon: '🃏',
        color: '#8b5cf6'
    },
    'double-or-nothing': {
        id: 'double-or-nothing',
        name: 'Double or Nothing',
        description: 'One question. Right = 2x. Wrong = bust.',
        category: 'jackpot',
        entryFee: 50,
        maxPrize: 100,
        durationSeconds: 30,
        questionsCount: 1,
        icon: '🎲',
        color: '#ef4444'
    },
    'the-gauntlet': {
        id: 'the-gauntlet',
        name: 'The Gauntlet',
        description: '10 in a row. Miss one = lose it all.',
        category: 'jackpot',
        entryFee: 100,
        maxPrize: 1000,
        durationSeconds: 300,
        questionsCount: 10,
        icon: '💀',
        color: '#dc2626'
    },
    'mystery-box': {
        id: 'mystery-box',
        name: 'Mystery Box',
        description: 'Answer correctly for random 1x-10x multiplier',
        category: 'jackpot',
        entryFee: 25,
        maxPrize: 250,
        durationSeconds: 60,
        questionsCount: 5,
        icon: '🎁',
        color: '#a855f7'
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// CARD & HAND UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['c', 'd', 'h', 's'];
const SUIT_SYMBOLS: Record<string, string> = { 'c': '♣', 'd': '♦', 'h': '♥', 's': '♠' };
const SUIT_COLORS: Record<string, string> = { 'c': '#22c55e', 'd': '#3b82f6', 'h': '#ef4444', 's': '#1f2937' };

export function parseCard(card: string): { rank: string; suit: string; value: number } {
    const rank = card[0];
    const suit = card[1];
    const value = RANKS.indexOf(rank);
    return { rank, suit, value };
}

export function formatCard(card: string): { display: string; color: string } {
    const { rank, suit } = parseCard(card);
    return {
        display: rank + SUIT_SYMBOLS[suit],
        color: SUIT_COLORS[suit]
    };
}

export function getFullDeck(): string[] {
    const deck: string[] = [];
    for (const rank of RANKS) {
        for (const suit of SUITS) {
            deck.push(rank + suit);
        }
    }
    return deck;
}

export function shuffleDeck(deck: string[]): string[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

export type HandRank =
    | 'high-card'
    | 'pair'
    | 'two-pair'
    | 'three-of-a-kind'
    | 'straight'
    | 'flush'
    | 'full-house'
    | 'four-of-a-kind'
    | 'straight-flush'
    | 'royal-flush';

const HAND_RANK_VALUES: Record<HandRank, number> = {
    'high-card': 1,
    'pair': 2,
    'two-pair': 3,
    'three-of-a-kind': 4,
    'straight': 5,
    'flush': 6,
    'full-house': 7,
    'four-of-a-kind': 8,
    'straight-flush': 9,
    'royal-flush': 10
};

export function evaluateHand(holeCards: string[], board: string[]): { rank: HandRank; value: number; kickers: number[] } {
    const allCards = [...holeCards, ...board];
    const parsed = allCards.map(parseCard);

    // Count ranks and suits
    const rankCounts: Record<number, number> = {};
    const suitCounts: Record<string, string[]> = { c: [], d: [], h: [], s: [] };

    for (const card of parsed) {
        rankCounts[card.value] = (rankCounts[card.value] || 0) + 1;
        suitCounts[card.suit].push(allCards[parsed.indexOf(card)]);
    }

    // Check for flush
    let flushSuit: string | null = null;
    let flushCards: string[] = [];
    for (const suit of SUITS) {
        if (suitCounts[suit].length >= 5) {
            flushSuit = suit;
            flushCards = suitCounts[suit];
            break;
        }
    }

    // Get sorted unique values
    const sortedValues = [...new Set(parsed.map(c => c.value))].sort((a, b) => b - a);

    // Check for straight
    function findStraight(values: number[]): number | null {
        // Add low ace for wheel
        if (values.includes(12)) values = [...values, -1];

        for (let i = 0; i <= values.length - 5; i++) {
            let consecutive = true;
            for (let j = 0; j < 4; j++) {
                if (values[i + j] - values[i + j + 1] !== 1) {
                    consecutive = false;
                    break;
                }
            }
            if (consecutive) return values[i];
        }
        return null;
    }

    const straightHigh = findStraight(sortedValues);

    // Check for straight flush
    if (flushSuit) {
        const flushValues = flushCards.map(c => parseCard(c).value).sort((a, b) => b - a);
        const sfHigh = findStraight([...new Set(flushValues)]);
        if (sfHigh !== null) {
            if (sfHigh === 12) {
                return { rank: 'royal-flush', value: 10000, kickers: [] };
            }
            return { rank: 'straight-flush', value: 9000 + sfHigh, kickers: [] };
        }
    }

    // Count pairs, trips, quads
    const counts = Object.entries(rankCounts).map(([v, c]) => ({ value: parseInt(v), count: c }));
    counts.sort((a, b) => b.count - a.count || b.value - a.value);

    const quads = counts.filter(c => c.count === 4);
    const trips = counts.filter(c => c.count === 3);
    const pairs = counts.filter(c => c.count === 2);

    if (quads.length > 0) {
        const kicker = counts.find(c => c.count < 4)?.value || 0;
        return { rank: 'four-of-a-kind', value: 8000 + quads[0].value * 13 + kicker, kickers: [kicker] };
    }

    if (trips.length > 0 && pairs.length > 0) {
        return { rank: 'full-house', value: 7000 + trips[0].value * 13 + pairs[0].value, kickers: [] };
    }

    if (trips.length >= 2) {
        return { rank: 'full-house', value: 7000 + trips[0].value * 13 + trips[1].value, kickers: [] };
    }

    if (flushSuit) {
        const flushValues = flushCards.map(c => parseCard(c).value).sort((a, b) => b - a).slice(0, 5);
        return { rank: 'flush', value: 6000 + flushValues[0], kickers: flushValues };
    }

    if (straightHigh !== null) {
        return { rank: 'straight', value: 5000 + straightHigh, kickers: [] };
    }

    if (trips.length > 0) {
        const kickers = counts.filter(c => c.count === 1).slice(0, 2).map(c => c.value);
        return { rank: 'three-of-a-kind', value: 4000 + trips[0].value, kickers };
    }

    if (pairs.length >= 2) {
        const kicker = counts.find(c => c.count === 1)?.value || 0;
        return { rank: 'two-pair', value: 3000 + pairs[0].value * 13 + pairs[1].value, kickers: [kicker] };
    }

    if (pairs.length === 1) {
        const kickers = counts.filter(c => c.count === 1).slice(0, 3).map(c => c.value);
        return { rank: 'pair', value: 2000 + pairs[0].value, kickers };
    }

    return { rank: 'high-card', value: 1000 + sortedValues[0], kickers: sortedValues.slice(1, 5) };
}

export function compareHands(hand1: string[], hand2: string[], board: string[]): 1 | 2 | 0 {
    const eval1 = evaluateHand(hand1, board);
    const eval2 = evaluateHand(hand2, board);

    if (eval1.value > eval2.value) return 1;
    if (eval2.value > eval1.value) return 2;

    // Compare kickers
    for (let i = 0; i < Math.max(eval1.kickers.length, eval2.kickers.length); i++) {
        const k1 = eval1.kickers[i] || 0;
        const k2 = eval2.kickers[i] || 0;
        if (k1 > k2) return 1;
        if (k2 > k1) return 2;
    }

    return 0; // Tie
}

export function getHandName(rank: HandRank): string {
    const names: Record<HandRank, string> = {
        'high-card': 'High Card',
        'pair': 'Pair',
        'two-pair': 'Two Pair',
        'three-of-a-kind': 'Three of a Kind',
        'straight': 'Straight',
        'flush': 'Flush',
        'full-house': 'Full House',
        'four-of-a-kind': 'Four of a Kind',
        'straight-flush': 'Straight Flush',
        'royal-flush': 'Royal Flush'
    };
    return names[rank];
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

export function generateHandSnapQuestion(): HandSnapQuestion {
    const deck = shuffleDeck(getFullDeck());
    const hand1: [string, string] = [deck[0], deck[1]];
    const hand2: [string, string] = [deck[2], deck[3]];
    const board = deck.slice(4, 9);

    const winner = compareHands(hand1, hand2, board);

    // Regenerate if tie
    if (winner === 0) {
        return generateHandSnapQuestion();
    }

    return {
        hand1: { cards: hand1 },
        hand2: { cards: hand2 },
        board,
        correctAnswer: winner,
        timeLimit: 3000
    };
}

export function generateBoardNutsQuestion(): BoardNutsQuestion {
    const deck = shuffleDeck(getFullDeck());
    const board = deck.slice(0, 5);

    // Generate 4 possible hands
    const options: [string, string][] = [];
    const remaining = deck.slice(5);

    for (let i = 0; i < 4; i++) {
        options.push([remaining[i * 2], remaining[i * 2 + 1]]);
    }

    // Evaluate all options
    const evaluations = options.map((hand, idx) => ({
        idx,
        eval: evaluateHand(hand, board)
    }));

    evaluations.sort((a, b) => b.eval.value - a.eval.value);
    const correctIndex = evaluations[0].idx;
    const bestHand = evaluations[0].eval;

    return {
        board,
        options,
        correctIndex,
        explanation: `${getHandName(bestHand.rank)} is the nuts on this board`
    };
}

export function generateChipMathQuestion(): ChipMathQuestion {
    const pots = [50, 75, 100, 150, 200, 250, 300, 400, 500];
    const pot = pots[Math.floor(Math.random() * pots.length)];
    const betSizes = [0.33, 0.5, 0.66, 0.75, 1.0];
    const betSize = betSizes[Math.floor(Math.random() * betSizes.length)];
    const bet = Math.round(pot * betSize);

    // Calculate correct pot odds
    const totalPot = pot + bet;
    const odds = totalPot / bet;
    const equityNeeded = Math.round((bet / (totalPot + bet)) * 100);

    // Generate options
    const correctAnswer = `${equityNeeded}%`;
    const wrongAnswers = [
        `${equityNeeded + 5}%`,
        `${equityNeeded - 5}%`,
        `${equityNeeded + 10}%`
    ].filter(a => {
        const val = parseInt(a);
        return val > 0 && val < 100 && val !== equityNeeded;
    });

    const options = [correctAnswer, ...wrongAnswers.slice(0, 3)];
    // Shuffle options
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }

    const correctIndex = options.indexOf(correctAnswer);

    return {
        pot,
        bet,
        options,
        correctIndex,
        explanation: `Need ${bet}/(${pot}+${bet}+${bet}) = ${equityNeeded}% equity to call`
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MYSTERY BOX MULTIPLIERS
// ═══════════════════════════════════════════════════════════════════════════

export function rollMysteryMultiplier(): number {
    const roll = Math.random() * 100;

    // Weighted distribution
    if (roll < 40) return 1;      // 40% - 1x
    if (roll < 65) return 2;      // 25% - 2x
    if (roll < 80) return 3;      // 15% - 3x
    if (roll < 90) return 5;      // 10% - 5x
    if (roll < 97) return 7;      // 7%  - 7x
    return 10;                     // 3%  - 10x
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIZE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

const RAKE_PERCENT = 10;

export function calculatePrize(
    game: ArcadeGame,
    correctCount: number,
    totalQuestions: number,
    streak: number,
    multiplier: number = 1
): GameResult {
    const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0;

    // Minimum 50% accuracy to win anything
    if (accuracy < 0.5) {
        return {
            won: false,
            accuracy,
            basePrize: 0,
            rake: 0,
            streakBonus: 0,
            finalPrize: 0,
            newStreak: 0,
            multiplier
        };
    }

    // Base prize by accuracy tier
    let basePrize: number;
    if (accuracy >= 0.95) {
        basePrize = game.maxPrize;
    } else if (accuracy >= 0.85) {
        basePrize = Math.floor(game.maxPrize * 0.75);
    } else if (accuracy >= 0.70) {
        basePrize = Math.floor(game.maxPrize * 0.50);
    } else {
        basePrize = Math.floor(game.maxPrize * 0.25);
    }

    // Apply multiplier (for mystery box)
    basePrize = Math.floor(basePrize * multiplier);

    // Calculate rake (10%)
    const rake = Math.floor(basePrize * (RAKE_PERCENT / 100));
    let afterRake = basePrize - rake;

    // Streak bonus: 10% per streak level, max 50%
    const streakMultiplier = Math.min(streak * 0.10, 0.50);
    const streakBonus = Math.floor(afterRake * streakMultiplier);
    const finalPrize = afterRake + streakBonus;

    const newStreak = streak + 1;

    return {
        won: true,
        accuracy,
        basePrize,
        rake,
        streakBonus,
        finalPrize,
        newStreak,
        multiplier
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIAL GAME LOGIC
// ═══════════════════════════════════════════════════════════════════════════

export function calculateDoubleOrNothing(correct: boolean, entryFee: number): GameResult {
    if (!correct) {
        return {
            won: false,
            accuracy: 0,
            basePrize: 0,
            rake: 0,
            streakBonus: 0,
            finalPrize: 0,
            newStreak: 0,
            multiplier: 2
        };
    }

    const basePrize = entryFee * 2;
    const rake = Math.floor(basePrize * 0.10);

    return {
        won: true,
        accuracy: 1,
        basePrize,
        rake,
        streakBonus: 0,
        finalPrize: basePrize - rake,
        newStreak: 1,
        multiplier: 2
    };
}

export function calculateGauntlet(correctCount: number, entryFee: number): GameResult {
    // Must get ALL 10 correct
    if (correctCount < 10) {
        return {
            won: false,
            accuracy: correctCount / 10,
            basePrize: 0,
            rake: 0,
            streakBonus: 0,
            finalPrize: 0,
            newStreak: 0,
            multiplier: 10
        };
    }

    const basePrize = entryFee * 10; // 10x entry fee
    const rake = Math.floor(basePrize * 0.10);

    return {
        won: true,
        accuracy: 1,
        basePrize,
        rake,
        streakBonus: 0,
        finalPrize: basePrize - rake,
        newStreak: 1,
        multiplier: 10
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// DAILY ROTATION
// ═══════════════════════════════════════════════════════════════════════════

export function getTodaysSeed(): string {
    const today = new Date();
    return `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
}

export function seededRandom(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    return function() {
        hash = Math.sin(hash) * 10000;
        return hash - Math.floor(hash);
    };
}

export function getDailyFeaturedGames(): { games: string[]; bonusGame: string } {
    const seed = getTodaysSeed();
    const random = seededRandom(seed);

    const allGames = Object.keys(ARCADE_GAMES);
    const shuffled = [...allGames].sort(() => random() - 0.5);

    return {
        games: shuffled.slice(0, 4),
        bonusGame: shuffled[0] // First featured game gets 2x bonus
    };
}

export function getTimeUntilReset(): { hours: number; minutes: number; seconds: number } {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);

    const diff = tomorrow.getTime() - now.getTime();

    return {
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000)
    };
}
